/*
 * What `verify:labs` asks of each build of a forge lab, and the same asks for tests/forge/toy-wasm.test.ts, which runs them on the
 * committed builds without a Rust toolchain. A build is a wasm module, made from the lab's crate with one cargo feature or none:
 *
 *   template   the crate as a learner receives it: every check traps, with "not implemented yet" and the panic's text
 *   reference  the reference solution, named `<lab>@reference`: every check passes, on fresh seeds, and nothing is recorded
 *   solved     the reference solution under the lab's own name: every check passes, and the run is recorded with the module's
 *              SHA-256 and the seeds it drew
 *   bestiary   a wrong module: the checks that bestiary.json names for it end in the status it names, on at least 99% of fresh seeds
 *              (the floor of ASSESSMENT §4.6 [estimated]), and the checks it lists as passing pass on all of them
 *
 * Every build must also load with no imports, list exactly the lab's checks, and run through the same host and the same worker that the
 * site uses. A judgement is a list of problems, empty when the build is as it should be.
 */

import { hash32, splitmix32u } from '../../vendor/kernelspace/src/lib/rng'
import type { ForgeHost, LoadedModule } from '../../src/forge/host'
import { runLab, seedsOf, type LabRun } from '../../src/forge/invoke'
import type { ForgeLab } from '../../src/forge/labs'
import { CHECK_BUDGET_MS } from '../../src/forge/protocol'
import { isRecordable, labCheckDraft } from '../../src/forge/record'
import type { Member } from './bestiary'

export type Kind = 'template' | 'reference' | 'solved' | 'bestiary'

export interface Judgement {
  problems: string[]
  /** One line for the gate's table. */
  summary: string
}

/** The floor of detection for a bestiary member [estimated] (ASSESSMENT §4.6). */
export const DETECTION_FLOOR = 0.99

/** How far past its budget a timed-out check may run before the host is called slow [estimated]: a worker to stop and one to start. */
const TIMEOUT_SLACK_MS = 3000

/** What a list of checks must be, to be the lab's. */
export function listProblems(lab: ForgeLab, module: LoadedModule): string[] {
  const problems: string[] = []
  if (module.lab !== lab.id) problems.push(`the module's lab id is "${module.lab}", not "${lab.id}"`)
  if (module.list.checks.length !== lab.checks.length) problems.push(`the module lists ${module.list.checks.length} checks, and the lab has ${lab.checks.length}`)
  for (const [index, check] of lab.checks.entries()) {
    const listed = module.list.checks[index]
    if (listed === undefined) continue
    for (const field of ['id', 'label', 'stage', 'seeded'] as const) {
      if (listed[field] !== check[field]) problems.push(`check ${index + 1}: the module says ${field} ${JSON.stringify(listed[field])}, and the site has ${JSON.stringify(check[field])}`)
    }
  }
  return problems
}

const statuses = (run: LabRun): string => run.checks.map((check) => `${check.id} ${check.status}`).join(', ')

/**
 * The seeds that a judgement's runs draw, when the caller gives none: a fixed stream for each lab, kind of build and bestiary member, so
 * that a judgement is a function of the module and nothing else. A learner's run draws its seeds from entropy (invariant I3), and a gate
 * that did the same would fail by chance as often as the lab's own statistical checks do: the rejection-sampler's chi-square rejects an
 * exact sampler with probability about 2e-4 [derived], and a gate runs it hundreds of times. The seeds are still distinct from run to run
 * and unseen by the module, which is what "fresh" asks of a run.
 */
export function gateSeeds(lab: ForgeLab, kind: Kind, member?: Member): () => number {
  return splitmix32u(hash32(`verify-labs/${lab.id}/${kind}/${member?.id ?? ''}`))
}

/** Runs a build and says what is wrong with it. `bytes` is the module's file. */
export async function judge(
  host: ForgeHost,
  lab: ForgeLab,
  kind: Kind,
  bytes: ArrayBuffer,
  options: { runs: number; member?: Member; budgetMs?: number; draw?: () => number },
): Promise<Judgement> {
  const problems: string[] = []
  const budgetMs = options.budgetMs ?? CHECK_BUDGET_MS
  const draw = options.draw ?? gateSeeds(lab, kind, options.member)
  let module: LoadedModule
  try {
    module = await host.load(bytes)
  } catch (e) {
    return { problems: [`the module did not load: ${e instanceof Error ? e.message : String(e)}`], summary: 'did not load' }
  }
  problems.push(...listProblems(lab, module))
  if (module.reference !== (kind === 'reference')) problems.push(kind === 'reference' ? 'the module is not named `@reference`' : 'the module is named `@reference`, and only the reference build is')

  if (kind === 'template') {
    const run = await runLab(host, lab, module, { budgetMs, draw })
    for (const check of run.checks) {
      if (check.status !== 'trap') problems.push(`${check.id}: ${check.status}, not trap (${check.msg})`)
      else if (!check.msg.startsWith('not implemented yet')) problems.push(`${check.id}: the trap does not say "not implemented yet" (${check.msg})`)
    }
    const first = run.checks[0]?.msg ?? ''
    return { problems, summary: `every check traps (${run.checks.filter((check) => check.status === 'trap').length} of ${run.checks.length}): ${first}` }
  }

  const member = options.member
  if (kind === 'bestiary') {
    if (member === undefined) throw new Error('a bestiary build needs its member')
    const timeouts = Object.values(member.fails).includes('timeout')
    const runs = timeouts ? 1 : options.runs
    const seen: Record<string, Record<string, number>> = {}
    const passed: Record<string, number> = {}
    for (let n = 0; n < runs; n++) {
      const started: Record<string, number> = {}
      const run = await runLab(host, lab, module, {
        budgetMs,
        draw,
        ...(member.only === undefined ? {} : { only: member.only }),
        onProgress: (event) => {
          if (event.type === 'check-start') started[event.id] = performance.now()
          else if (event.result.status === 'timeout') {
            const spent = performance.now() - started[event.result.id]
            // A check that is stopped must have been given its whole budget, and must not have been waited for much longer.
            if (spent < budgetMs - 100) problems.push(`${event.result.id}: stopped after ${Math.round(spent)} ms, before its budget of ${budgetMs} ms`)
            if (spent > budgetMs + TIMEOUT_SLACK_MS) problems.push(`${event.result.id}: stopped only after ${Math.round(spent)} ms, for a budget of ${budgetMs} ms`)
          }
        },
      })
      for (const check of run.checks) {
        const tally = (seen[check.id] ??= {})
        tally[check.status] = (tally[check.status] ?? 0) + 1
        if (check.status === 'pass') passed[check.id] = (passed[check.id] ?? 0) + 1
      }
    }
    for (const [id, want] of Object.entries(member.fails)) {
      const count = seen[id]?.[want] ?? 0
      if (count < Math.ceil(DETECTION_FLOOR * runs)) problems.push(`${member.id}: ${id} ends in ${want} on ${count} of ${runs} runs, under the floor of ${DETECTION_FLOOR * 100}%`)
    }
    for (const id of member.passes) {
      if ((passed[id] ?? 0) !== runs) problems.push(`${member.id}: ${id} should pass on every run, and passes on ${passed[id] ?? 0} of ${runs}`)
    }
    const caught = Object.entries(member.fails).map(([id, want]) => `${id} ${want} ${seen[id]?.[want] ?? 0}/${runs}`)
    return { problems, summary: `caught: ${caught.join(', ')}` }
  }

  // Reference and solved: a pass on every run, on fresh seeds, and the same on the seeds of the first run told again.
  const runs: LabRun[] = []
  for (let n = 0; n < options.runs; n++) runs.push(await runLab(host, lab, module, { budgetMs, draw }))
  for (const [n, run] of runs.entries()) {
    const red = run.checks.filter((check) => check.status !== 'pass')
    if (red.length > 0) problems.push(`run ${n + 1} on fresh seeds: ${red.map((check) => `${check.id} ${check.status} (${check.msg})`).join('; ')}`)
    if (!run.complete) problems.push(`run ${n + 1} did not run every check`)
  }
  const seeded = lab.checks.filter((check) => check.seeded)
  for (const check of seeded) {
    const drawn = new Set(runs.map((run) => run.checks.find((candidate) => candidate.id === check.id)?.seed))
    if (runs.length > 1 && drawn.size < 2) problems.push(`${check.id}: ${runs.length} runs drew the same seed, so the seed is not fresh`)
    for (const run of runs) {
      const result = run.checks.find((candidate) => candidate.id === check.id)
      if (result?.fresh !== true || result.seed === undefined) problems.push(`${check.id}: a fresh run does not mark its seed fresh`)
    }
  }
  const again = await runLab(host, lab, module, { budgetMs, seeds: 'replay', replay: seedsOf(runs[0]) })
  if (again.checks.some((check) => check.status !== 'pass')) problems.push(`the first run's seeds told again do not pass: ${statuses(again)}`)
  if (isRecordable(again) || labCheckDraft(again) !== null) problems.push('a replay would be recorded')

  if (kind === 'reference') {
    for (const run of runs) if (isRecordable(run) || labCheckDraft(run) !== null) problems.push(`a reference run would be recorded: ${module.lab}@reference earns no credit`)
    return { problems, summary: `${module.list.lab}: ${runs.length} runs on fresh seeds, every check passes, no credit` }
  }
  // solved
  for (const run of runs) {
    const draft = labCheckDraft(run)
    if (draft === null || !draft.ok || draft.provenance !== 'unseen') {
      problems.push('a solved run is not recorded as an ok `unseen` run')
      continue
    }
    if (draft.data.wasmSha256 !== module.sha256) problems.push('the recorded SHA-256 is not the module\'s')
    if (draft.data.seeds.length !== seeded.length) problems.push(`the recorded run carries ${draft.data.seeds.length} seeds, and the lab has ${seeded.length} seeded checks`)
  }
  return { problems, summary: `${runs.length} runs on fresh seeds, every check passes, each recorded with the module's SHA-256 and its seeds` }
}
