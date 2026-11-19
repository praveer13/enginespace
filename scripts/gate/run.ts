/*
 * The merge gate's browser step (W2b-T02): the features specs and the nightly-width walks that a branch's paths call for.
 *
 *   bun scripts/gate/run.ts --base <ref> --head <ref>    list the paths changed between the two (git diff --name-only base...head, run here),
 *                                                        ask scripts/gate/touched.ts for the plan, run each step in this checkout
 *   bun scripts/gate/run.ts --base <ref> --head <ref> --plan    print the plan as JSON and run nothing
 *
 * Each step is one `npx playwright test` with --retries=0 and two workers. The caller pins the cores (taskset) and sets CI's environment;
 * ES_E2E_PORT and ES_CHROMIUM pass through as they are, and playwright.config.ts is not touched. What a test is, here, is its spec file and its
 * title (the describes and the test's own, joined by " > "), so a test of the same name in another project is the same test.
 *
 * scripts/gate/known-red.json holds two lists:
 *   red    the tests that failed on the base. A failure that is listed does not fail the gate; one that is not listed does.
 *   flaky  the tests that fail some runs on the base. One that fails is run once more, alone, and counts by that run.
 * An entry leaves a list only after five passes of five with --retries=0 on four pinned cores, in the branch that fixes it: this script says
 * when a red test passed, and never removes an entry. Nothing is ever added to the file by a run.
 *
 * The log names repository-relative paths only: every absolute path in what Playwright says is cut to its relative form.
 *
 * Exit status: 0 when no test failed that is not in `red` (or nothing mapped), 1 when one did or a step could not run, 2 for a usage error.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { plan, type Plan, type Step } from './touched'

const ROOT = path.resolve(import.meta.dirname, '../..')

export interface KnownTest {
  readonly file: string
  readonly title: string
  readonly note?: string
}
export interface KnownRed {
  readonly red: readonly KnownTest[]
  readonly flaky: readonly KnownTest[]
}

export const keyOf = (test: { file: string; title: string }) => `${test.file}\u0000${test.title}`

/** What a log may say of a path: the repository's own files by their relative name, and nothing of the machine. */
export function clean(text: string): string {
  let out = text.split(ROOT).join('.')
  for (const home of [homedir(), process.env.HOME ?? '']) if (home.length > 1) out = out.split(home).join('~')
  return out.replace(/\/tmp\/[^\s'")]+/g, '<tmp>')
}

/** The failing tests of Playwright's JSON report. */
interface Json {
  suites?: JsonSuite[]
  errors?: { message?: string }[]
  stats?: { expected?: number; unexpected?: number; flaky?: number; skipped?: number }
}
interface JsonSuite {
  title: string
  file?: string
  suites?: JsonSuite[]
  specs?: { title: string; file: string; tests: { projectName?: string; status: string; results?: { error?: { message?: string } }[] }[] }[]
}
export interface Failure {
  readonly file: string
  readonly title: string
  readonly error: string
}

export function failures(report: Json): { failed: Failure[]; passed: { file: string; title: string }[] } {
  const failed: Failure[] = []
  const passed: { file: string; title: string }[] = []
  /** The top suites are the files, and their titles are not part of a test's: the describes below them are. */
  const visit = (suite: JsonSuite, titles: string[], file: string, top: boolean) => {
    const here = top ? (suite.file ?? suite.title) : file
    const next = top ? [] : [...titles, suite.title]
    for (const spec of suite.specs ?? []) {
      const title = [...next, spec.title].join(' > ')
      for (const test of spec.tests) {
        if (test.status === 'unexpected') {
          const message = test.results?.find((result) => result.error)?.error?.message ?? ''
          failed.push({ file: `e2e/${spec.file ?? here}`, title, error: message })
        } else if (test.status === 'expected' || test.status === 'flaky') passed.push({ file: `e2e/${spec.file ?? here}`, title })
      }
    }
    for (const child of suite.suites ?? []) visit(child, next, here, false)
  }
  for (const suite of report.suites ?? []) visit(suite, [], suite.file ?? suite.title, true)
  return { failed, passed }
}

function readKnown(): KnownRed {
  const file = path.join(ROOT, 'scripts/gate/known-red.json')
  if (!existsSync(file)) return { red: [], flaky: [] }
  const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<KnownRed>
  return { red: data.red ?? [], flaky: data.flaky ?? [] }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function command(step: Step, grep?: string): string[] {
  const args = ['playwright', 'test', `--project=${step.project}`, '--workers=2', '--retries=0', '--reporter=json']
  const filter = grep ?? step.grep
  if (filter !== undefined) args.push('-g', filter)
  for (const spec of step.specs) args.push(`e2e/${spec}.spec.ts`)
  return args
}

function show(args: readonly string[], nightly: boolean): string {
  return `${nightly ? 'ES_E2E_NIGHTLY=1 ' : ''}npx ${args.map((arg) => (/[\s()|\\]/.test(arg) ? `'${arg}'` : arg)).join(' ')}`
}

interface Outcome {
  readonly code: number | null
  readonly report: Json | undefined
  readonly tail: string
}

function execute(step: Step, args: readonly string[]): Outcome {
  const dir = mkdtempSync(path.join(tmpdir(), 'es-gate-'))
  const out = path.join(dir, 'report.json')
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out }
    if (step.nightly) env.ES_E2E_NIGHTLY = '1'
    else delete env.ES_E2E_NIGHTLY
    const run = spawnSync('npx', [...args], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 28 })
    let report: Json | undefined
    try {
      report = JSON.parse(readFileSync(out, 'utf8')) as Json
    } catch {
      report = undefined
    }
    const tail = clean(`${run.stderr ?? ''}${run.stdout ?? ''}`).split('\n').filter(Boolean).slice(-12).join('\n')
    return { code: run.status, report, tail }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export interface StepResult {
  readonly step: Step
  readonly command: string
  readonly total: number
  readonly failed: readonly Failure[]
  /** The failures that are neither red nor flaky-and-passed-on-rerun. */
  readonly refused: readonly Failure[]
  readonly known: readonly Failure[]
  readonly rerun: readonly { test: Failure; passed: boolean }[]
  readonly nowPassing: readonly { file: string; title: string }[]
  readonly crash?: string
}

export function runStep(step: Step, known: KnownRed): StepResult {
  const args = command(step)
  const text = show(args, step.nightly)
  const first = execute(step, args)
  if (first.report === undefined || ((first.report.errors?.length ?? 0) > 0 && (first.report.stats?.expected ?? 0) + (first.report.stats?.unexpected ?? 0) === 0)) {
    const why = first.report?.errors?.map((error) => clean(error.message ?? '').split('\n')[0]).join('; ') || first.tail
    return { step, command: text, total: 0, failed: [], refused: [], known: [], rerun: [], nowPassing: [], crash: `no test result (exit ${first.code}): ${why}` }
  }
  const { failed, passed } = failures(first.report)
  const total = (first.report.stats?.expected ?? 0) + (first.report.stats?.unexpected ?? 0) + (first.report.stats?.flaky ?? 0)
  const red = new Set(known.red.map(keyOf))
  const flaky = new Set(known.flaky.map(keyOf))
  const rerun: { test: Failure; passed: boolean }[] = []
  const stillFailing: Failure[] = []
  for (const test of failed) {
    if (flaky.has(keyOf(test)) && !red.has(keyOf(test))) {
      const again = command(step, escapeRegExp(test.title.split(' > ').join(' ')))
      const second = execute({ ...step, specs: [test.file.replace(/^e2e\//, '').replace(/\.spec\.ts$/, '')] }, [...again.filter((arg) => !/^e2e\//.test(arg)), test.file])
      const ok = second.report !== undefined && failures(second.report).failed.length === 0 && failures(second.report).passed.length > 0
      rerun.push({ test, passed: ok })
      if (!ok) stillFailing.push(test)
    } else stillFailing.push(test)
  }
  const refused = stillFailing.filter((test) => !red.has(keyOf(test)))
  const knownFailing = stillFailing.filter((test) => red.has(keyOf(test)))
  const nowPassing = passed.filter((test) => red.has(keyOf(test)))
  return { step, command: text, total, failed, refused, known: knownFailing, rerun, nowPassing }
}

function parse(argv: readonly string[]): { base: string; head: string; planOnly: boolean } | undefined {
  let base: string | undefined
  let head: string | undefined
  let planOnly = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') base = argv[++i]
    else if (argv[i] === '--head') head = argv[++i]
    else if (argv[i] === '--plan') planOnly = true
    else return undefined
  }
  return base && head ? { base, head, planOnly } : undefined
}

function changedPaths(base: string, head: string): string[] {
  const run = spawnSync('git', ['diff', '--name-only', `${base}...${head}`], { cwd: ROOT, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`git diff failed: ${clean(run.stderr)}`)
  return run.stdout.split('\n').filter(Boolean)
}

function specNames(): string[] {
  return readdirSync(path.join(ROOT, 'e2e')).filter((name) => name.endsWith('.spec.ts')).map((name) => name.slice(0, -'.spec.ts'.length))
}

function main(argv: readonly string[]): number {
  const options = parse(argv)
  if (options === undefined) {
    console.error('usage: bun scripts/gate/run.ts --base <ref> --head <ref> [--plan]')
    return 2
  }
  const paths = changedPaths(options.base, options.head)
  const made: Plan = plan(paths, specNames())
  if (options.planOnly) {
    console.log(JSON.stringify(made, null, 2))
    return 0
  }
  console.log(`gate: ${paths.length} changed path${paths.length === 1 ? '' : 's'}, ${made.steps.length} browser step${made.steps.length === 1 ? '' : 's'}`)
  for (const note of made.notes) console.log(`note: ${note}`)
  if (made.steps.length === 0) {
    console.log('gate: no changed path maps to a features spec or a nightly walk; nothing to run')
    return 0
  }
  const known = readKnown()
  const results: StepResult[] = []
  for (const step of made.steps) {
    const started = Date.now()
    console.log(`\n== ${step.project}${step.nightly ? ' (nightly width)' : ''}: ${step.specs.join(', ')}  [${step.why.join('; ')}]`)
    const result = runStep(step, known)
    results.push(result)
    console.log(`$ ${result.command}`)
    if (result.crash !== undefined) console.log(`FAILED TO RUN: ${result.crash}`)
    else console.log(`${result.total} tests, ${result.failed.length} failed first time, in ${Math.round((Date.now() - started) / 1000)} s`)
    for (const item of result.rerun) console.log(`${item.passed ? 'FLAKY, passed on its one re-run' : 'FLAKY, failed again'}: ${item.test.file} > ${item.test.title}`)
    for (const test of result.known) console.log(`known red: ${test.file} > ${test.title}`)
    for (const test of result.refused) console.log(`NEW FAILURE: ${test.file} > ${test.title}\n    ${clean(test.error).split('\n')[0]}`)
    for (const test of result.nowPassing) console.log(`red test passed this run (leaves the list after five of five): ${test.file} > ${test.title}`)
  }
  const bad = results.filter((result) => result.crash !== undefined || result.refused.length > 0)
  console.log('\nsummary')
  for (const result of results) {
    const state = result.crash !== undefined ? 'could not run' : result.refused.length > 0 ? `${result.refused.length} new failure${result.refused.length === 1 ? '' : 's'}` : 'ok'
    console.log(`  ${result.step.project}${result.step.nightly ? ' nightly' : ''}: ${state}`)
  }
  if (bad.length > 0) {
    console.log('gate: FAILED')
    for (const result of bad) for (const test of result.refused) console.log(`  ${test.file} > ${test.title}`)
    return 1
  }
  console.log('gate: passed (no test failed that is not in scripts/gate/known-red.json)')
  return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
