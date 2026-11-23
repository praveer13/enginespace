/*
 * The merge gate's browser step (W2b-T02): the features specs and the nightly-width walks that a branch's paths call for.
 *
 *   bun scripts/gate/run.ts --base <ref> --head <ref>    list the paths changed between the two (git diff --name-only --no-renames base...head, run here: a moved file counts under both names),
 *                                                        ask scripts/gate/touched.ts for the plan, run each step in this checkout
 *   bun scripts/gate/run.ts --base <ref> --head <ref> --plan    print the plan as JSON and run nothing
 *   bun scripts/gate/run.ts --paths <file> --plan        the plan of the paths a file lists, one a line (a task's Files list), and run nothing
 *   ... --failures <file>                                where the whole output of each failure goes (default: a new file in the
 *                                                        system's temporary folder, outside the repository)
 *
 * Each step is one `npx playwright test` with --retries=0 and two workers, and the plan's features and plain smoke steps share one (`runs`). The caller pins the cores (taskset) and sets CI's environment;
 * ES_E2E_PORT and ES_CHROMIUM pass through as they are, and playwright.config.ts is not touched. What a test is, here, is its spec file and its
 * title (the describes and the test's own, joined by " > "), so a test of the same name in another project is the same test.
 *
 * scripts/gate/known-red.json holds three lists:
 *   red    the tests that failed on the base. A failure that is listed does not fail the gate; one that is not listed does.
 *   flaky  the tests that fail some runs on the base. One that fails is run once more, alone, and counts by that run.
 *   host   the tests that the build host cannot pass and a runner is the place to check (W2b-T55): each names its measured reason, the commit
 *          at which it was shown to fail as first written, and the date. Its failure does not fail the gate; every entry is printed on every
 *          run under "Not checked on this host", with what it did this run, and any other test of the same file still fails the gate.
 * An entry leaves a list only after five passes of five with --retries=0 on four pinned cores, in the branch that fixes it: this script says
 * when a red test passed, and never removes an entry. Nothing is ever added to the file by a run.
 *
 * The log names repository-relative paths only: every absolute path in what Playwright says is cut to its relative form. Every changed
 * path that no row maps is printed. Each failed test's whole error, stack, stdout, stderr and attachments, of its first and of every later
 * attempt, a step that could not run and a check that failed, go through `clean()` into the failures file, outside the repository; the
 * log prints that file's first 20 lines and its name.
 *
 * Exit status: 0 when no test failed that is not in `red` (or nothing mapped), 1 when one did or a step could not run, 2 for a usage error.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir, userInfo } from 'node:os'
import path from 'node:path'
import { plan, type Command, type Context, type Plan, type Step } from './touched'

const ROOT = path.resolve(import.meta.dirname, '../..')

export interface KnownTest {
  readonly file: string
  readonly title: string
  readonly note?: string
}
/** A test this host cannot pass: why, by measurement, at which commit it was shown to fail as first written, and when. */
export interface HostTest {
  readonly file: string
  readonly title: string
  readonly reason: string
  readonly shownAt: string
  readonly date: string
}
export interface KnownRed {
  readonly red: readonly KnownTest[]
  readonly flaky: readonly KnownTest[]
  readonly host: readonly HostTest[]
}

/** The lines the gate prints for the host list on every run: each entry, with what it did in this run's steps (or that no step ran it). */
export function hostLines(host: readonly HostTest[], results: readonly Pick<StepResult, 'hostFailed' | 'hostPassed'>[]): string[] {
  if (host.length === 0) return ['Not checked on this host: none (scripts/gate/known-red.json lists no test under host)']
  const failed = new Set(results.flatMap((result) => result.hostFailed.map(keyOf)))
  const passed = new Set(results.flatMap((result) => result.hostPassed.map(keyOf)))
  const lines = [`Not checked on this host (${host.length}; the nightly workflow's browsers job runs them on a runner):`]
  for (const entry of host) {
    const ran = failed.has(keyOf(entry)) ? 'failed here this run' : passed.has(keyOf(entry)) ? 'passed here this run' : 'not run by this gate'
    lines.push(`  ${entry.file} > ${entry.title}`, `    ${ran}; ${entry.reason} (shown failing as first written at ${entry.shownAt}, ${entry.date})`)
  }
  return lines
}

export const keyOf = (test: { file: string; title: string }) => `${test.file}\u0000${test.title}`

/** The login name of the machine's user, or undefined when it cannot be read. */
function login(): string | undefined {
  try {
    return userInfo().username
  } catch {
    return process.env.USER
  }
}

/** What a log may say of a path: the repository's own files by their relative name, and nothing of the machine or of its user. */
export function clean(text: string): string {
  let out = text.split(ROOT).join('.')
  for (const home of [homedir(), process.env.HOME ?? '']) if (home.length > 1) out = out.split(home).join('~')
  out = out.replace(/\/tmp\/[^\s'")]+/g, '<tmp>')
  const user = login()
  if (user !== undefined && user.length > 1) out = out.replace(new RegExp(`(?<![A-Za-z0-9_])${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g'), '<user>')
  return out
}

/** The failing tests of Playwright's JSON report. */
interface Json {
  suites?: JsonSuite[]
  errors?: { message?: string }[]
  stats?: { expected?: number; unexpected?: number; flaky?: number; skipped?: number }
}
interface JsonError {
  message?: string
  stack?: string
}
interface JsonResult {
  status?: string
  retry?: number
  duration?: number
  error?: JsonError
  errors?: JsonError[]
  stdout?: ({ text?: string; buffer?: string } | string)[]
  stderr?: ({ text?: string; buffer?: string } | string)[]
  attachments?: { name?: string; path?: string; contentType?: string }[]
}
interface JsonSuite {
  title: string
  file?: string
  suites?: JsonSuite[]
  specs?: { title: string; file: string; tests: { projectName?: string; status: string; results?: JsonResult[] }[] }[]
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

/** The colour codes of a terminal, which Playwright puts in an error's message. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/** The whole of one failed test, every attempt, as the failures file holds it: written through clean(). */
export function failureRecords(report: Json): string[] {
  const records: string[] = []
  const output = (chunks: JsonResult['stdout']) =>
    (chunks ?? []).map((chunk) => (typeof chunk === 'string' ? chunk : chunk.text ?? (chunk.buffer ? Buffer.from(chunk.buffer, 'base64').toString('utf8') : ''))).join('')
  const visit = (suite: JsonSuite, titles: string[], file: string, top: boolean) => {
    const here = top ? (suite.file ?? suite.title) : file
    const next = top ? [] : [...titles, suite.title]
    for (const spec of suite.specs ?? []) {
      const title = [...next, spec.title].join(' > ')
      for (const test of spec.tests) {
        if (test.status !== 'unexpected') continue
        const lines = [`FAILED ${test.projectName ? `[${test.projectName}] ` : ''}e2e/${spec.file ?? here} > ${title}`]
        for (const [index, result] of (test.results ?? []).entries()) {
          lines.push(`-- attempt ${index + 1} of ${test.results?.length ?? 0} (retry ${result.retry ?? index}): ${result.status ?? '?'}, ${Math.round(result.duration ?? 0)} ms`)
          const errors = result.errors?.length ? result.errors : result.error ? [result.error] : []
          for (const error of errors) lines.push('error:', error.stack && !error.message?.includes(error.stack) ? `${error.message ?? ''}\n${error.stack}` : error.message ?? '')
          const stdout = output(result.stdout)
          const stderr = output(result.stderr)
          if (stdout) lines.push('stdout:', stdout.replace(/\n$/, ''))
          if (stderr) lines.push('stderr:', stderr.replace(/\n$/, ''))
          for (const attachment of new Set((result.attachments ?? []).map((item) => `attachment: ${item.name ?? ''} ${item.path ?? ''}`.trim()))) lines.push(attachment)
        }
        records.push(clean(lines.join('\n').replace(ANSI, '')))
      }
    }
    for (const child of suite.suites ?? []) visit(child, next, here, false)
  }
  for (const suite of report.suites ?? []) visit(suite, [], suite.file ?? suite.title, true)
  return records
}

/** Adds sections to the failures file, each through clean(). */
export function writeFailures(file: string, sections: readonly string[]): void {
  if (sections.length === 0) return
  appendFileSync(file, `${sections.map((section) => clean(section)).join('\n\n')}\n\n`)
}

/** The first lines of the failures file, for the log. */
export function failuresHead(file: string, lines = 20): string[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').slice(0, lines)
}

function readKnown(): KnownRed {
  const file = path.join(ROOT, 'scripts/gate/known-red.json')
  if (!existsSync(file)) return { red: [], flaky: [], host: [] }
  const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<KnownRed>
  return { red: data.red ?? [], flaky: data.flaky ?? [], host: data.host ?? [] }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A step as run: the plan's features and smoke steps at the same width share one Playwright run, so the site is built once for both. */
export type RunStep = Step & { readonly projects: readonly Step['project'][] }

/**
 * The plan's steps as Playwright runs: the features step and the plain smoke step become one run of both projects (each spec runs in the
 * project whose list holds it, so the tests are the same), and the nightly step stays apart, since its environment differs.
 */
export function runs(steps: readonly Step[]): RunStep[] {
  const plain = steps.filter((step) => !step.nightly)
  const out: RunStep[] = []
  if (plain.length > 0) {
    out.push({
      project: plain[0].project,
      projects: plain.map((step) => step.project),
      nightly: false,
      specs: [...new Set(plain.flatMap((step) => step.specs))].sort(),
      why: [...new Set(plain.flatMap((step) => step.why))].sort(),
    })
  }
  for (const step of steps.filter((candidate) => candidate.nightly)) out.push({ ...step, projects: [step.project] })
  return out
}

function command(step: RunStep, grep?: string): string[] {
  const args = ['playwright', 'test', ...step.projects.map((project) => `--project=${project}`), '--workers=2', '--retries=0', '--reporter=json']
  const filter = grep ?? step.grep
  if (filter !== undefined) args.push('-g', filter)
  // A route's tests exist only when the build serves it (a module that is not published has no document), so a nightly step whose
  // filter names routes may match none: that is reported as 0 tests, and is not a failure to run.
  if (grep === undefined && step.nightly && step.specs.includes('a11y')) args.push('--pass-with-no-tests')
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
  /** Everything the run printed, through clean(). */
  readonly output: string
}

function execute(step: RunStep, args: readonly string[]): Outcome {
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
    const output = clean(`${run.stderr ?? ''}${run.stdout ?? ''}`)
    const tail = output.split('\n').filter(Boolean).slice(-12).join('\n')
    return { code: run.status, report, tail, output }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export interface StepResult {
  readonly step: RunStep
  readonly command: string
  readonly total: number
  readonly failed: readonly Failure[]
  /** The failures that are neither red nor flaky-and-passed-on-rerun. */
  readonly refused: readonly Failure[]
  readonly known: readonly Failure[]
  readonly rerun: readonly { test: Failure; passed: boolean }[]
  readonly nowPassing: readonly { file: string; title: string }[]
  /** The host list's tests that failed, and that passed, in this step: neither counts for the verdict. */
  readonly hostFailed: readonly Failure[]
  readonly hostPassed: readonly { file: string; title: string }[]
  readonly crash?: string
  /** For the failures file: each failed test whole, every attempt, and a step's whole output when it could not run. */
  readonly records: readonly string[]
}

/**
 * Where each failure of a step goes, once the flaky ones have had their re-run: a host-listed test is set aside, a red-listed one is known,
 * and every other one is refused. The lists are matched by file and title, so a host entry covers its own test and no other of its file.
 */
export function sortFailures(
  stillFailing: readonly Failure[],
  passed: readonly { file: string; title: string }[],
  known: KnownRed,
): Pick<StepResult, 'refused' | 'known' | 'nowPassing' | 'hostFailed' | 'hostPassed'> {
  const red = new Set(known.red.map(keyOf))
  const host = new Set(known.host.map(keyOf))
  return {
    hostFailed: stillFailing.filter((test) => host.has(keyOf(test))),
    hostPassed: passed.filter((test) => host.has(keyOf(test))),
    refused: stillFailing.filter((test) => !red.has(keyOf(test)) && !host.has(keyOf(test))),
    known: stillFailing.filter((test) => red.has(keyOf(test)) && !host.has(keyOf(test))),
    nowPassing: passed.filter((test) => red.has(keyOf(test))),
  }
}

export function runStep(step: RunStep, known: KnownRed): StepResult {
  const args = command(step)
  const text = show(args, step.nightly)
  const first = execute(step, args)
  if (first.report === undefined || ((first.report.errors?.length ?? 0) > 0 && (first.report.stats?.expected ?? 0) + (first.report.stats?.unexpected ?? 0) === 0)) {
    const why = first.report?.errors?.map((error) => clean(error.message ?? '').split('\n')[0]).join('; ') || first.tail
    const records = [`COULD NOT RUN: ${text}\n${first.output}`]
    return { step, command: text, total: 0, failed: [], refused: [], known: [], rerun: [], nowPassing: [], hostFailed: [], hostPassed: [], crash: `no test result (exit ${first.code}): ${why}`, records }
  }
  const { failed, passed } = failures(first.report)
  const total = (first.report.stats?.expected ?? 0) + (first.report.stats?.unexpected ?? 0) + (first.report.stats?.flaky ?? 0)
  const red = new Set(known.red.map(keyOf))
  const flaky = new Set(known.flaky.map(keyOf))
  const rerun: { test: Failure; passed: boolean }[] = []
  const stillFailing: Failure[] = []
  const records = failureRecords(first.report)
  for (const test of failed) {
    if (flaky.has(keyOf(test)) && !red.has(keyOf(test))) {
      const again = command(step, escapeRegExp(test.title.split(' > ').join(' ')))
      const second = execute({ ...step, specs: [test.file.replace(/^e2e\//, '').replace(/\.spec\.ts$/, '')] }, [...again.filter((arg) => !/^e2e\//.test(arg)), test.file])
      const ok = second.report !== undefined && failures(second.report).failed.length === 0 && failures(second.report).passed.length > 0
      rerun.push({ test, passed: ok })
      if (second.report !== undefined) records.push(...failureRecords(second.report).map((record) => `(the flaky list's one re-run)\n${record}`))
      if (!ok) stillFailing.push(test)
    } else stillFailing.push(test)
  }
  return { step, command: text, total, failed, rerun, records, ...sortFailures(stillFailing, passed, known) }
}

/**
 * The gate's verdict, as its exit status: 1 when a step could not run, a failure was refused or a check failed, and 0 otherwise. It reads
 * only what sortFailures and the checks decided, so the failures file and the printing never change it.
 */
export function verdict(results: readonly Pick<StepResult, 'crash' | 'refused'>[], checksFailed: number): 0 | 1 {
  const bad = results.filter((result) => result.crash !== undefined || result.refused.length > 0)
  return bad.length > 0 || checksFailed > 0 ? 1 : 0
}

/** The interpreters the grader's requires-python (>=3.11,<3.15) allows, newest tested first: CI pins 3.12, the task names 3.13. */
export const PYTHONS: readonly string[] = ['3.13', '3.12', '3.14', '3.11']

/** The environment of a uv command: offline, never a download, and `python` an installed interpreter. */
export function uvEnv(base: NodeJS.ProcessEnv, python: string): NodeJS.ProcessEnv {
  return { ...base, UV_OFFLINE: '1', UV_PYTHON_DOWNLOADS: 'never', UV_PYTHON: python }
}

/** The first of PYTHONS that uv finds installed, or undefined. */
export function pickPython(): string | undefined {
  for (const version of PYTHONS) {
    const run = spawnSync('uv', ['python', 'find', version], { cwd: ROOT, env: { ...process.env, UV_OFFLINE: '1', UV_PYTHON_DOWNLOADS: 'never' }, encoding: 'utf8' })
    if (run.status === 0) return version
  }
  return undefined
}

export interface CommandResult {
  readonly command: Command
  readonly code: number | null
  readonly seconds: number
  readonly tail: string
  /** Everything the command printed, through clean(). */
  readonly output: string
}

/** Runs one lab command from the repository root. A command that cannot start (no uv, no interpreter) counts as failed. */
export function runCommand(command: Command, python: string | undefined): CommandResult {
  const started = Date.now()
  if (command.uv === true && python === undefined) {
    const tail = `no installed Python of ${PYTHONS.join(', ')} for uv, and uv may not download one`
    return { command, code: null, seconds: 0, tail, output: tail }
  }
  const base: NodeJS.ProcessEnv = { ...process.env, ...command.env }
  const env = command.uv === true && python !== undefined ? uvEnv(base, python) : base
  const [bin, ...args] = command.argv
  const run = spawnSync(bin, args, { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 28 })
  const output = clean(`${run.error?.message ?? ''}${run.stderr ?? ''}${run.stdout ?? ''}`)
  const tail = output.split('\n').filter(Boolean).slice(-15).join('\n')
  return { command, code: run.error !== undefined ? null : run.status, seconds: Math.round((Date.now() - started) / 1000), tail, output }
}

interface Options {
  readonly base?: string
  readonly head?: string
  /** A file that lists paths, one a line, in place of a range. */
  readonly paths?: string
  readonly planOnly: boolean
  readonly failures?: string
}

function parse(argv: readonly string[]): Options | undefined {
  let base: string | undefined
  let head: string | undefined
  let paths: string | undefined
  let failures: string | undefined
  let planOnly = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') base = argv[++i]
    else if (argv[i] === '--head') head = argv[++i]
    else if (argv[i] === '--paths') paths = argv[++i]
    else if (argv[i] === '--failures') failures = argv[++i]
    else if (argv[i] === '--plan') planOnly = true
    else return undefined
  }
  if (paths !== undefined) return planOnly && base === undefined && head === undefined ? { paths, planOnly, failures } : undefined
  return base && head ? { base, head, planOnly, failures } : undefined
}

/**
 * Every path the range touches, under its old and its new name, unquoted: --no-renames lists a moved file as a delete and an add (a rename is
 * printed under the new name only, so the feature it left would not be called for), and core.quotePath=false keeps a non-ASCII name as it is.
 * `cwd` is for the tests' scratch repositories.
 */
export function changedPaths(base: string, head: string, cwd: string = ROOT): string[] {
  const run = spawnSync('git', ['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', `${base}...${head}`], { cwd, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`git diff failed: ${clean(run.stderr)}`)
  return run.stdout.split('\n').filter(Boolean)
}

function specNames(): string[] {
  return readdirSync(path.join(ROOT, 'e2e')).filter((name) => name.endsWith('.spec.ts')).map((name) => name.slice(0, -'.spec.ts'.length))
}

/**
 * For each file of e2e/support/, the specs that import it, directly or through other support files. `files` maps a file's repository path to
 * its text: the specs' (e2e/<name>.spec.ts) and the support files'.
 */
export function supportImporters(files: Readonly<Record<string, string>>): Record<string, string[]> {
  const support = Object.keys(files).filter((file) => file.startsWith('e2e/support/'))
  const stem = (file: string) => path.basename(file).replace(/\.[^.]+$/, '')
  /** The support files that one file imports. */
  const imports = (file: string): string[] => {
    const text = files[file] ?? ''
    const from = file.startsWith('e2e/support/') ? '\\./' : '\\./support/'
    return support.filter((other) => other !== file && new RegExp(`from\\s+['"]${from}${stem(other).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.tsx?)?['"]`).test(text))
  }
  const out: Record<string, string[]> = Object.fromEntries(support.map((file) => [file, [] as string[]]))
  for (const spec of Object.keys(files).filter((file) => /^e2e\/[^/]+\.spec\.ts$/.test(file))) {
    const seen = new Set<string>()
    const queue = imports(spec)
    while (queue.length > 0) {
      const next = queue.pop() as string
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(...imports(next))
    }
    for (const file of seen) out[file].push(spec.slice('e2e/'.length, -'.spec.ts'.length))
  }
  for (const file of support) out[file].sort()
  return out
}

/** The quoted routes ('/…') of a text of e2e/routes.ts. */
export function routesOf(text: string): string[] {
  return [...text.matchAll(/'(\/[^'\s]*)'/g)].map((match) => match[1])
}

/** The routes that e2e/routes.ts holds at the head and did not hold at the base. */
export function routesAdded(base: string, head: string, cwd: string = ROOT): string[] {
  const show = (ref: string) => spawnSync('git', ['show', `${ref}:e2e/routes.ts`], { cwd, encoding: 'utf8' })
  const before = show(base)
  const after = show(head)
  if (after.status !== 0) return []
  const had = new Set(before.status === 0 ? routesOf(before.stdout) : [])
  return [...new Set(routesOf(after.stdout).filter((route) => !had.has(route)))]
}

function context(options: Options): Context {
  const files: Record<string, string> = {}
  for (const name of readdirSync(path.join(ROOT, 'e2e'))) if (name.endsWith('.spec.ts')) files[`e2e/${name}`] = readFileSync(path.join(ROOT, 'e2e', name), 'utf8')
  for (const name of readdirSync(path.join(ROOT, 'e2e/support'))) files[`e2e/support/${name}`] = readFileSync(path.join(ROOT, 'e2e/support', name), 'utf8')
  const added = options.base !== undefined && options.head !== undefined ? routesAdded(options.base, options.head) : []
  return { importers: supportImporters(files), routesAdded: added }
}

/**
 * Where the failures file is, as the log may say it, with nothing of the machine: a file of the run's own choosing by its name in the
 * system's temporary folder, and one that the caller named with --failures by its name alone (the caller knows where it put it).
 */
export function where(file: string, given: boolean): string {
  const name = path.basename(file)
  return given ? `the file that --failures names (${clean(name)})` : `${clean(name)} in the system's temporary folder`
}

function main(argv: readonly string[]): number {
  const options = parse(argv)
  if (options === undefined) {
    console.error('usage: bun scripts/gate/run.ts --base <ref> --head <ref> [--plan] [--failures <file>]\n       bun scripts/gate/run.ts --paths <file> --plan')
    return 2
  }
  const paths =
    options.paths !== undefined
      ? readFileSync(options.paths, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#'))
      : changedPaths(options.base as string, options.head as string)
  const made: Plan = plan(paths, specNames(), context(options))
  if (options.planOnly) {
    console.log(JSON.stringify(made, null, 2))
    return 0
  }
  const failuresFile = options.failures ?? path.join(tmpdir(), `es-gate-failures-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.txt`)
  writeFileSync(failuresFile, '')
  console.log(`gate: ${paths.length} changed path${paths.length === 1 ? '' : 's'}, ${runs(made.steps).length} browser run${runs(made.steps).length === 1 ? '' : 's'}`)
  for (const note of made.notes) console.log(`note: ${note}`)
  for (const file of made.unmapped) console.log(`unmapped (no row runs anything for it): ${file}`)
  let checksFailed = 0
  if (made.commands.length > 0) {
    const python = made.commands.some((command) => command.uv === true) ? pickPython() : undefined
    console.log(`\n== checks: ${made.commands.length} commands  [${[...new Set(made.commands.flatMap((command) => command.why))].join('; ')}]`)
    if (python !== undefined) console.log(`uv: offline, no downloads, interpreter ${python} (installed)`)
    for (const note of made.notRun) console.log(`NOT RUN: ${note}`)
    for (const command of made.commands) {
      const result = runCommand(command, python)
      const ok = result.code === 0
      const shown = `${command.env ? Object.entries(command.env).map(([key, value]) => `${key}=${value} `).join('') : ''}${command.argv.join(' ')}`
      console.log(`$ ${shown}`)
      console.log(`${ok ? 'ok' : 'FAILED'}: ${command.id} (${result.seconds} s)`)
      if (!ok) {
        checksFailed++
        console.log(result.tail.split('\n').map((line) => `    ${line}`).join('\n'))
        writeFailures(failuresFile, [`CHECK FAILED: ${shown} (exit ${result.code})\n${result.output}`])
      }
    }
  }
  const known = readKnown()
  const printHost = (results: readonly StepResult[]) => {
    const lines = hostLines(known.host, results)
    console.log(`\n${lines.join('\n')}`)
  }
  const printFailures = () => {
    const head = failuresHead(failuresFile)
    if (head.length === 0 || head.every((line) => line === '')) return
    console.log(`\nfailures: the whole output is in ${where(failuresFile, options.failures !== undefined)}; its first 20 lines:`)
    console.log(head.map((line) => `  | ${line}`).join('\n'))
  }
  if (made.steps.length === 0) {
    printHost([])
    printFailures()
    if (verdict([], checksFailed) !== 0) {
      console.log(`gate: FAILED (${checksFailed} check${checksFailed === 1 ? '' : 's'})`)
      return 1
    }
    console.log('gate: no changed path maps to a features spec or a nightly walk; nothing more to run')
    return 0
  }
  const results: StepResult[] = []
  for (const step of runs(made.steps)) {
    const started = Date.now()
    console.log(`\n== ${step.projects.join(' and ')}${step.nightly ? ' (nightly width)' : ''}: ${step.specs.join(', ')}  [${step.why.join('; ')}]`)
    const result = runStep(step, known)
    results.push(result)
    writeFailures(failuresFile, result.records)
    console.log(`$ ${result.command}`)
    if (result.crash !== undefined) console.log(`FAILED TO RUN: ${result.crash}`)
    else console.log(`${result.total} tests, ${result.failed.length} failed first time, in ${Math.round((Date.now() - started) / 1000)} s`)
    for (const item of result.rerun) console.log(`${item.passed ? 'FLAKY, passed on its one re-run' : 'FLAKY, failed again'}: ${item.test.file} > ${item.test.title}`)
    for (const test of result.known) console.log(`known red: ${test.file} > ${test.title}`)
    for (const test of result.hostFailed) console.log(`host list, not counted: ${test.file} > ${test.title}`)
    for (const test of result.refused) console.log(`NEW FAILURE: ${test.file} > ${test.title}\n    ${clean(test.error).replace(ANSI, '').split('\n')[0]}`)
    for (const test of result.nowPassing) console.log(`red test passed this run (leaves the list after five of five): ${test.file} > ${test.title}`)
  }
  const bad = results.filter((result) => result.crash !== undefined || result.refused.length > 0)
  printHost(results)
  printFailures()
  console.log('\nsummary')
  if (made.commands.length > 0) console.log(`  checks: ${checksFailed === 0 ? 'ok' : `${checksFailed} failed`}`)
  for (const result of results) {
    const state = result.crash !== undefined ? 'could not run' : result.refused.length > 0 ? `${result.refused.length} new failure${result.refused.length === 1 ? '' : 's'}` : 'ok'
    console.log(`  ${result.step.projects.join(' and ')}${result.step.nightly ? ' nightly' : ''}: ${state}`)
  }
  if (verdict(results, checksFailed) !== 0) {
    console.log('gate: FAILED')
    for (const result of bad) for (const test of result.refused) console.log(`  ${test.file} > ${test.title}`)
    return 1
  }
  console.log('gate: passed (no test failed that is not in scripts/gate/known-red.json)')
  return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
