/*
 * The gate registry (ARCHITECTURE §10.2, W0-T04): every `verify:*` gate in one table, so CI and a developer run the same
 * thing and a gate that is not built yet says which task builds it.
 *
 *   bun scripts/verify.ts <gate> [args...]        run one gate; the extra arguments go to each of its scripts
 *   bun scripts/verify.ts all [--stage <stage>]   run every gate, or one stage's gates, then print a summary
 *   bun scripts/verify.ts list                    print every gate: its stage, its status and the task it waits for
 *
 * package.json carries each gate as `verify:<gate>`, and the second form as `verify:all`.
 *
 * A gate is one or more commands. Each command is a script that one task builds, and it is pending until that file exists.
 * A pending gate prints `pending: <task>` and exits 0, kernelspace's pattern (its scaffold reserved each gate the same way),
 * so `verify:all` passes while a wave is half built. A task wires its gate by creating the script, and nothing else:
 * this file already names the path. The registry stays honest through tests/ci/verify.test.ts, which fails on a
 * `scripts/verify-*.ts` file that no gate runs, on a gate that names a task TRACKER.md does not have, and on a
 * package.json script that goes around the registry.
 *
 * The three stages say where a gate can run, and ci.yml runs them in this order:
 *   source     reads the working tree only, so it runs before the build;
 *   build      reads dist/, so it runs after `npm run build`;
 *   toolchain  needs the pinned Rust toolchain, so only labs.yml runs it.
 *
 * Exit status: 0 when no gate that ran failed (pending gates are not failures), 1 when one failed, 2 for a usage error.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

export type Stage = 'source' | 'build' | 'toolchain'
export const STAGES: readonly Stage[] = ['source', 'build', 'toolchain']

/** One command of a gate: a script that one task builds, and the arguments that make it check. */
export interface Part {
  /** The task that builds the script, named as TRACKER.md names it. */
  readonly task: string
  /** The script, relative to the repository root. The command is pending until the file exists. */
  readonly script: string
  readonly args: readonly string[]
}

export interface Gate {
  readonly stage: Stage
  readonly parts: readonly Part[]
}

const part = (task: string, script: string, ...args: string[]): Part => ({ task, script, args })
const gate = (stage: Stage, ...parts: Part[]): Gate => ({ stage, parts })

/**
 * Every gate of ARCHITECTURE §10.2, in that table's order. tests/ci/verify.test.ts compares the names with the table, and
 * each task with TRACKER.md.
 */
export const GATES = {
  content: gate('source', part('W0-T08', 'scripts/verify-content.ts')),
  claims: gate('source', part('W0-T08', 'scripts/verify-claims.ts')),
  numbers: gate('source', part('W0-T08', 'scripts/verify-numbers.ts')),
  kc: gate('source', part('W1-T03', 'scripts/verify-kc.ts')),
  items: gate('source', part('W1-T04', 'scripts/verify-items.ts')),
  games: gate('source', part('W0-T14', 'scripts/verify-games.ts')),
  // §10.2 gives this gate two jobs: §5.1's lint, and the golden vectors that a model's tests commit.
  determinism: gate('source', part('W0-T03', 'scripts/verify-determinism.ts'), part('W0-T12', 'scripts/vectors.ts', '--check')),
  boundaries: gate('source', part('W0-T03', 'scripts/verify-boundaries.ts')),
  bundle: gate('build', part('W0-T20', 'scripts/verify-bundle.ts')),
  tokens: gate('source', part('W0-T05', 'scripts/verify-tokens.ts')),
  schema: gate('source', part('W2-T01', 'scripts/verify-schema.ts')),
  vectors: gate('source', part('W2-T01', 'scripts/verify-vectors.ts')),
  vendor: gate('source', part('W0-T02', 'scripts/vendor-drift.ts', 'verify')),
  labs: gate('toolchain', part('W1-T10', 'scripts/verify-labs.ts')),
  pins: gate('source', part('W1-T01', 'scripts/verify-pins.ts')),
  routes: gate('source', part('W0-T19', 'scripts/verify-routes.ts')),
} satisfies Record<string, Gate>

export type GateName = keyof typeof GATES
export const GATE_NAMES = Object.keys(GATES) as GateName[]

const isGate = (name: string): name is GateName => Object.hasOwn(GATES, name)
const isStage = (name: string): name is Stage => (STAGES as readonly string[]).includes(name)

/** What the registry needs from the machine it runs on, so the tests can stand in for it. */
export interface Host {
  /** The Bun binary that runs each gate's script. */
  readonly bun: string
  readonly env: Readonly<Record<string, string | undefined>>
  /** Whether a file exists, named relative to the repository root. */
  exists(file: string): boolean
  /** Runs a command from the repository root to completion with its output passed through, and returns its exit code. */
  run(command: readonly string[]): number
  print(line: string): void
}

export function realHost(): Host {
  const root = path.resolve(import.meta.dirname, '..')
  return {
    bun: process.execPath,
    env: process.env,
    exists: (file) => existsSync(path.join(root, file)),
    run: (command) => {
      const [program, ...args] = command
      const result = spawnSync(program, args, { cwd: root, stdio: 'inherit' })
      if (result.error) console.error(`${command.join(' ')}: ${result.error.message}`)
      return result.status ?? 1
    },
    print: (line) => console.log(line),
  }
}

interface Outcome {
  readonly gate: GateName
  /** The commands that ran, and how many of them failed. */
  readonly ran: number
  readonly failed: number
  /** The tasks whose scripts do not exist yet, once each and in order. */
  readonly pending: readonly string[]
}

const unique = <T>(items: readonly T[]) => [...new Set(items)]

/** Runs each command of a gate whose script exists. The caller says what is pending, because the two modes say it differently. */
function runGate(name: GateName, extra: readonly string[], host: Host): Outcome {
  const github = host.env.GITHUB_ACTIONS === 'true'
  let ran = 0
  let failed = 0
  const missing: string[] = []
  for (const { task, script, args } of GATES[name].parts) {
    if (!host.exists(script)) {
      missing.push(task)
      continue
    }
    ran += 1
    const command = [script, ...args, ...extra]
    if (github) host.print(`::group::verify:${name}`)
    host.print(`$ bun ${command.join(' ')}`)
    const code = host.run([host.bun, ...command])
    if (github) host.print('::endgroup::')
    if (code !== 0) {
      failed += 1
      const message = `verify:${name} failed: ${script} exited with ${code}`
      host.print(github ? `::error title=verify:${name}::${message}` : message)
    }
  }
  return { gate: name, ran, failed, pending: unique(missing) }
}

function describe({ ran, failed, pending }: Outcome): string {
  if (failed > 0) return 'FAILED'
  if (ran === 0) return `pending: ${pending.join(', ')}`
  return pending.length > 0 ? `passed; pending: ${pending.join(', ')}` : 'passed'
}

function runAll(stage: Stage | undefined, host: Host): number {
  const names = GATE_NAMES.filter((name) => stage === undefined || GATES[name].stage === stage)
  const outcomes = names.map((name) => runGate(name, [], host))
  const failed = outcomes.filter((outcome) => outcome.failed > 0).length
  const pending = outcomes.filter((outcome) => outcome.ran === 0).length
  const width = Math.max(0, ...names.map((name) => name.length))
  host.print('')
  host.print(`verify:all${stage ? ` (stage ${stage})` : ''}: ${names.length} gates, ${names.length - failed - pending} passed, ${pending} pending, ${failed} failed`)
  for (const outcome of outcomes) host.print(`  ${outcome.gate.padEnd(width)}  ${describe(outcome)}`)
  return failed > 0 ? 1 : 0
}

function list(host: Host): number {
  const rows = GATE_NAMES.flatMap((name) =>
    GATES[name].parts.map(({ task, script, args }, index) => ({
      gate: index === 0 ? name : '',
      stage: index === 0 ? GATES[name].stage : '',
      status: host.exists(script) ? 'live' : 'pending',
      task,
      command: [script, ...args].join(' '),
    })),
  )
  const columns = ['gate', 'stage', 'status', 'task', 'command'] as const
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => row[column].length)))
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index]))
      .join('  ')
      .trimEnd()
  host.print(line(columns))
  for (const row of rows) host.print(line(columns.map((column) => row[column])))
  return 0
}

const USAGE = `usage: bun scripts/verify.ts <gate> [args...]
       bun scripts/verify.ts all [--stage ${STAGES.join('|')}]
       bun scripts/verify.ts list

gates: ${GATE_NAMES.join(', ')}`

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export function main(argv: readonly string[], host: Host = realHost()): number {
  const [command, ...rest] = argv
  const usage = (message?: string) => {
    host.print(message ? `${message}\n\n${USAGE}` : USAGE)
    return message ? 2 : 0
  }
  if (command === undefined) return usage('verify: say which gate to run, or all, or list')
  if (command === '--help' || command === '-h') return usage()
  if (command === 'list') return rest.length > 0 ? usage('verify list takes no arguments') : list(host)
  if (command === 'all') {
    let stage: Stage | undefined
    for (let i = 0; i < rest.length; i += 1) {
      const argument = rest[i]
      let value: string | undefined
      if (argument === '--stage') value = rest[++i]
      else if (argument.startsWith('--stage=')) value = argument.slice('--stage='.length)
      else return usage(`verify all: unknown argument "${argument}"`)
      if (value === undefined || !isStage(value)) return usage(`verify all: --stage takes one of ${STAGES.join(', ')}`)
      stage = value
    }
    return runAll(stage, host)
  }
  if (!isGate(command)) return usage(`verify: unknown gate "${command}"`)
  const outcome = runGate(command, rest, host)
  if (outcome.pending.length > 0) host.print(`verify:${command}: pending: ${outcome.pending.join(', ')}`)
  return outcome.failed > 0 ? 1 : 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
