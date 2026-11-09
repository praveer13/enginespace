/*
 * The invoke protocol (ARCHITECTURE §8.3, D-025): the site drives a learner's module through `ks_invoke` with seeded batches of
 * commands, and an oracle outside the module's code judges every reply. The oracle is packages/sim's (`CheckPlan`, one per check); this
 * file is the runner that carries a plan's batches to a fresh instance of the module and its replies back, one check at a time.
 *
 *   one instance per check       nothing one check leaves behind reaches the next (kernelspace F1)
 *   one budget per check         2 s in the module, summed over the check's batches; a check that spends it is `timeout`, the
 *                                worker is stopped, and the run goes on with the next check in a new one
 *   one seed per seeded check    drawn when the run starts (`fresh`), or taken from an earlier run to tell it again (`replay`)
 *   a trap is a result           `todo!()` in the learner's code traps the call that reaches it, and the check says "not implemented
 *                                yet" with the panic's text; the other checks still run
 *
 * A run is graded on what the plans say, so the module's own `ks_run` checks (the ones `cargo test` runs) are not asked at all, and a
 * module that lies in its `list` cannot pass: its checks must be the lab's, in the lab's order.
 */

import type { CheckPlan, PlannedCheck } from '@es/sim'
import { trapMessage } from '../../vendor/kernelspace/src/lib/forge/abi'
import { freshSeed } from '../../vendor/kernelspace/src/lib/forge/run'
import { LabAbiError, LabTimeoutError } from '../../vendor/kernelspace/src/lib/wasm-lab'
import type { ForgeHost, ForgeSession, LoadedModule } from './host'
import { CHECK_BUDGET_MS } from './protocol'

/** A lab as the site grades it. */
export interface HostLab {
  id: string
  /** The checks, in grading order: what the module must list, and the plan of each. */
  checks: readonly PlannedCheck[]
}

export type CheckStatus = 'pass' | 'fail' | 'trap' | 'timeout'

export interface CheckResult {
  id: string
  label: string
  stage: number
  status: CheckStatus
  /** What the check established, or what went wrong, as text. A reply of the module's own is quoted in it and never trusted. */
  msg: string
  /** The seed of a seeded check. */
  seed?: number
  /** The seed was drawn when the run started. A replayed seed is not fresh. */
  fresh?: boolean
  /** The commands sent to the module. */
  commands: number
  /** The module's panic text after a trap. */
  panic?: string
  /** The module's trace (`kslab::trace!`) after the check. */
  trace?: string
}

/** `fresh`: every seeded check ran on a seed drawn at grade time. `replay`: on the seeds of an earlier run, to tell it again. */
export type SeedMode = 'fresh' | 'replay'

export interface LabRun {
  /** The lab's id, without `@reference`. */
  lab: string
  /** Built with `--features reference`: shown, never credited. */
  reference: boolean
  version: number
  /** The module that was graded, by its SHA-256. */
  wasmSha256: string
  seeds: SeedMode
  /** Every one of the lab's checks ran. A run limited by `only` is not complete, and is never recorded. */
  complete: boolean
  checks: CheckResult[]
}

export type Progress =
  | { type: 'check-start'; index: number; id: string; seed?: number }
  | { type: 'check-done'; index: number; result: CheckResult }

/** Thrown by `runLab` when its signal is aborted: the page that asked for the run has gone, and nobody wants its result. */
export class RunAborted extends Error {
  constructor() {
    super('the run was abandoned')
    this.name = 'RunAborted'
  }
}

export interface RunOptions {
  /** Abandons the run: it stops before the next check, and a check that is in the module is not waited for. Throws RunAborted. */
  signal?: AbortSignal
  /** Default `fresh`. */
  seeds?: SeedMode
  /** For `replay`: the seed of each seeded check, by id. */
  replay?: Readonly<Record<string, number>>
  /** Where a fresh seed comes from. Default: `crypto.getRandomValues`, at grade time (invariant I3). */
  draw?: () => number
  /** Run only these checks, in the lab's order. */
  only?: readonly string[]
  /** The time one check may spend in the module. Default 2 s. */
  budgetMs?: number
  /** The clock that measures what a check spent. Default `performance.now`. */
  now?: () => number
  onProgress?: (event: Progress) => void
}

/**
 * Why a loaded module cannot be graded as this lab, or null. The module's checks must be the lab's, in the lab's order: it was built
 * from this lab's kit, or it is not this lab's.
 */
export function moduleProblem(lab: HostLab, module: LoadedModule): string | null {
  if (module.lab !== lab.id) {
    return `this module is the "${module.lab}" lab's, and this page grades "${lab.id}". Open the page of the lab that you built.`
  }
  const listed = module.list.checks.map((check) => check.id)
  const graded = lab.checks.map((check) => check.id)
  if (listed.length !== graded.length || listed.some((id, i) => id !== graded[i])) {
    return `this module lists the checks ${listed.join(', ')}, and this page grades ${graded.join(', ')}. It was built from a different kit: build it again from this lab's.`
  }
  return null
}

/** The text of an error, for a result row. The module's own words are quoted by whoever formats them, so this only trims them. */
function describe(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e)
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

/** One check, in a fresh instance, within its budget. It never throws: whatever goes wrong is the check's result. */
async function runCheck(host: ForgeHost, check: PlannedCheck, seed: number | undefined, fresh: boolean, budgetMs: number, now: () => number): Promise<CheckResult> {
  const base = { id: check.id, label: check.label, stage: check.stage, ...(seed === undefined ? {} : { seed, fresh }) }
  let commands = 0
  let session: ForgeSession | null = null
  try {
    // The plan is built before the instance, so a plan that cannot be built costs the module nothing.
    const plan: CheckPlan = check.plan(seed ?? check.defaultSeed)
    session = await host.open()
    let spent = 0
    for (let batch = plan.next(); batch !== null; batch = plan.next()) {
      if (batch.length === 0) continue
      const left = budgetMs - spent
      const started = now()
      const outcome = left > 0 ? await session.call(batch, left) : ({ kind: 'timeout' } as const)
      spent += now() - started
      if (outcome.kind === 'timeout') {
        return { ...base, status: 'timeout', msg: new LabTimeoutError(budgetMs, 'checks', true, check.id).message, commands: commands + batch.length }
      }
      if (outcome.kind === 'trap') {
        const answered = outcome.replies.length
        return {
          ...base,
          status: 'trap',
          msg: trapMessage(outcome.panic),
          commands: commands + answered + 1,
          ...(outcome.panic === undefined ? {} : { panic: outcome.panic }),
          ...(outcome.trace === undefined ? {} : { trace: outcome.trace }),
        }
      }
      commands += batch.length
      const wrong = plan.judge(outcome.replies)
      if (wrong !== null) {
        const trace = await session.close()
        return { ...base, status: 'fail', msg: wrong, commands, ...(trace === undefined ? {} : { trace }) }
      }
    }
    const trace = await session.close()
    return { ...base, status: 'pass', msg: plan.passed(), commands, ...(trace === undefined ? {} : { trace }) }
  } catch (e) {
    // A module that breaks the ABI (a reply that points outside its memory), a worker that died, or a plan that threw.
    const abi = e instanceof LabAbiError
    return { ...base, status: 'fail', msg: abi ? describe(e) : `the check could not finish: ${describe(e)}`, commands }
  }
}

/**
 * A conversation that is not one of a lab's checks, such as the night of hybrid-kv's slot readout (readout.ts): one fresh instance, one
 * check's budget, and a result like a check's, trap and timeout included. The lab's list does not name it, and the ledger never hears of it.
 */
export function runExtra(host: ForgeHost, check: PlannedCheck, options: { budgetMs?: number; now?: () => number } = {}): Promise<CheckResult> {
  return runCheck(host, check, undefined, false, options.budgetMs ?? CHECK_BUDGET_MS, options.now ?? (() => performance.now()))
}

/**
 * Grades a loaded module as `lab`: every check in a fresh instance with its own seed and its own budget, in order. It throws LabAbiError
 * when the module is not this lab's (`moduleProblem`), and otherwise returns the run, whatever the checks came to.
 */
export async function runLab(host: ForgeHost, lab: HostLab, module: LoadedModule, options: RunOptions = {}): Promise<LabRun> {
  const problem = moduleProblem(lab, module)
  if (problem !== null) throw new LabAbiError(problem)
  const mode = options.seeds ?? 'fresh'
  const draw = options.draw ?? freshSeed
  const budgetMs = options.budgetMs ?? CHECK_BUDGET_MS
  const now = options.now ?? (() => performance.now())
  const wanted = options.only === undefined ? lab.checks : lab.checks.filter((check) => options.only?.includes(check.id))
  const checks: CheckResult[] = []
  for (const [index, check] of wanted.entries()) {
    if (options.signal?.aborted) throw new RunAborted()
    const seed = !check.seeded ? undefined : mode === 'fresh' ? draw() >>> 0 : (options.replay?.[check.id] ?? check.defaultSeed)
    options.onProgress?.({ type: 'check-start', index, id: check.id, ...(seed === undefined ? {} : { seed }) })
    const result = await runCheck(host, check, seed, mode === 'fresh', budgetMs, now)
    // A check that ended because the page went away (its worker was stopped under it) says nothing about the module.
    if (options.signal?.aborted) throw new RunAborted()
    checks.push(result)
    options.onProgress?.({ type: 'check-done', index, result })
  }
  return {
    lab: module.lab,
    reference: module.reference,
    version: module.version,
    wasmSha256: module.sha256,
    seeds: mode,
    complete: wanted.length === lab.checks.length,
    checks,
  }
}

/** The seeds a run drew, by check id: what `replay` takes. */
export function seedsOf(run: LabRun): Record<string, number> {
  const seeds: Record<string, number> = {}
  for (const check of run.checks) if (check.seed !== undefined) seeds[check.id] = check.seed
  return seeds
}
