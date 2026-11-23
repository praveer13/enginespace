/*
 * Which programs the Playwright specs start by name, and which CI jobs have them (tests/ci/programs.test.ts holds the rules).
 *
 * Why it exists: e2e/front.spec.ts started `bun` from its beforeAll, the e2e-features job of ci.yml installs Node and no Bun, and every
 * developer machine and the merge gate have Bun on the PATH, so nothing failed until the pull request's own CI ran. This reads the
 * specs, the helpers they import and playwright.config.ts, finds each program they start, and asks the workflows whether each job that
 * runs them installs it.
 *
 * What it sees: a call of child_process's exec, execSync, execFile, execFileSync, spawn or spawnSync, or of Bun.spawn and Bun.spawnSync, whose
 * first argument is a string literal (for exec and execSync the first word of the command), in a spec or in a file that a spec imports through a
 * relative path; and the words bun, npm, npx, node, uv, python, cargo and git in the command of playwright.config.ts's webServer.
 *
 * What it cannot see, and says so instead of guessing: a program that a call takes from a variable or a template that opens with `${`
 * (reported as `dynamic`, and a test fails on it, so that a literal is used or the call is discussed in review); a program that a shell line
 * starts (`sh -c '<line>'` is seen as `sh`, and what the line runs is not read); a program started by an npm script, a package's own code or a
 * Playwright fixture of another package; a file reached through a bare or aliased import; and a program that the job's own tool needs but
 * the specs do not name. A job's installed programs are read from its steps (setup-node, setup-bun, its npm fallback) and from the
 * runner image's baseline below, which is what ubuntu-latest ships [unverified: the image's own list was not read here].
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { root } from './support'

/** The programs of the runner image that a job does not install: ubuntu-latest has a shell, git, and Node with npm. */
export const BASELINE: readonly string[] = ['sh', 'bash', 'git', 'node', 'npm', 'npx']

export interface Started {
  /** The programs that calls name by a literal. */
  programs: string[]
  /** The calls whose program is not a literal. */
  dynamic: number
}

/** The text without its comments (block and line), so that a program named in prose is not one that runs. A `//` inside a string or a URL is kept. */
export const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

const CALLS = ['execFileSync', 'execFile', 'execSync', 'exec', 'spawnSync', 'spawn'] as const
const COMMAND_LINE = new Set(['exec', 'execSync'])

/** The programs that the source starts through child_process or Bun, by the names the file imports them under. */
export function programsStarted(source: string): Started {
  const text = withoutComments(source)
  const found: Started = { programs: [], dynamic: 0 }
  const locals = new Map<string, string>() // local name -> the call it is
  const spaces: string[] = [] // `cp` of `import * as cp from 'node:child_process'`
  for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?child_process['"]/g)) {
    for (const part of match[1].split(',')) {
      const [name, alias] = part.trim().split(/\s+as\s+/)
      if ((CALLS as readonly string[]).includes(name)) locals.set(alias ?? name, name)
    }
  }
  for (const match of text.matchAll(/import\s+(?:\*\s+as\s+)?(\w+)\s+from\s*['"](?:node:)?child_process['"]/g)) spaces.push(match[1])
  const take = (call: string, after: string) => {
    const literal = /^\s*(['"`])([^'"`]*)\1/.exec(after)
    const value = literal?.[2] ?? ''
    if (literal === null || value === '' || value.startsWith('${')) return void (found.dynamic += 1)
    found.programs.push(COMMAND_LINE.has(call) ? value.trim().split(/\s+/)[0] : value)
  }
  for (const [local, call] of locals) {
    for (const match of text.matchAll(new RegExp(String.raw`(?<![\w$.])${local}\s*(?:<[^>(]*>)?\((?=([^]{0,300}))`, 'g'))) take(call, match[1])
  }
  for (const space of spaces) {
    for (const match of text.matchAll(new RegExp(String.raw`(?<![\w$.])${space}\.(${CALLS.join('|')})\s*\((?=([^]{0,300}))`, 'g'))) take(match[1], match[2])
  }
  for (const match of text.matchAll(/(?<![\w$.])Bun\.(?:spawn|spawnSync)\s*\(\s*\[(?=([^]{0,300}))/g)) take('spawn', match[1])
  return found
}

/** The relative imports of a source, as specifiers. */
export const relativeImports = (source: string): string[] =>
  [...withoutComments(source).matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map((match) => match[1])

/** The file that a relative specifier names, from the file that imports it, or null when it is not a file of the repository. */
export function resolveImport(from: string, specifier: string): string | null {
  const base = path.join(path.dirname(from), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, 'index.ts')]) {
    if (existsSync(path.join(root, candidate)) && /\.(?:[cm]?[jt]sx?)$/.test(candidate)) return candidate
  }
  return null
}

/** A file and every file it imports through a relative path, as repository-relative paths. */
export function closureOf(file: string, readSource: (file: string) => string = (name) => readFileSync(path.join(root, name), 'utf8')): string[] {
  const seen = new Set<string>()
  const queue = [file]
  while (queue.length > 0) {
    const next = queue.pop() as string
    if (seen.has(next)) continue
    seen.add(next)
    for (const specifier of relativeImports(readSource(next))) {
      const target = resolveImport(next, specifier)
      if (target !== null) queue.push(target)
    }
  }
  return [...seen].sort()
}

/** The spec files of the Playwright test directory. */
export const specFiles = (): string[] =>
  readdirSync(path.join(root, 'e2e'))
    .filter((name) => name.endsWith('.spec.ts'))
    .sort()
    .map((name) => `e2e/${name}`)

/** The project that a spec runs in, from the configuration's own SMOKE list and LAB pattern: smoke, lab, or features. */
export function projectOf(spec: string, config: string): 'smoke' | 'features' | 'lab' {
  const smoke = /const SMOKE = \[([^\]]*)\]/.exec(config)?.[1]
  const lab = /const LAB = '\*\*\/([^']+)'/.exec(config)?.[1]
  if (smoke === undefined || lab === undefined) throw new Error('playwright.config.ts no longer has `const SMOKE = [...]` and `const LAB = \'**/<file>\'`: update tests/ci/programs.ts')
  const name = path.basename(spec)
  if (name === lab) return 'lab'
  return [...smoke.matchAll(/'([^']+)'/g)].some((match) => `${match[1]}.spec.ts` === name) ? 'smoke' : 'features'
}

/** What the command of the config's webServer starts: each program of a known name, and whether it is behind the nightly or Pages switch. */
export function webServerPrograms(config: string): { always: string[]; sweep: string[] } {
  const command = /command:\s*`([^]*?)`,\s*\n\s*url:/.exec(config)?.[1]
  if (command === undefined) throw new Error('playwright.config.ts no longer has a webServer `command: `...`,` before its `url:`: update tests/ci/programs.ts')
  const out = { always: new Set<string>(), sweep: new Set<string>() }
  for (const match of command.matchAll(/\b(bun|npm|npx|node|uv|python3?|cargo|git)\b(?=\s)/g)) {
    // Behind a switch when the nearest `${` before it opens a ternary that its text is in.
    const before = command.slice(0, match.index)
    const open = before.lastIndexOf('${')
    const inside = open >= 0 && !before.slice(open).includes('}') && /\?/.test(before.slice(open))
    ;(inside ? out.sweep : out.always).add(match[1])
  }
  return { always: [...out.always].sort(), sweep: [...out.sweep].sort() }
}

interface Step {
  uses?: string
  run?: string
  env?: Record<string, unknown>
}
interface Job {
  env?: Record<string, unknown>
  steps?: Step[]
}
export interface Workflow {
  jobs?: Record<string, Job>
}

export const parseWorkflow = (source: string): Workflow => load(source) as Workflow

/** A job that runs Playwright: where, what it runs, and what it has. */
export interface Runner {
  at: string
  /** The projects it runs, or the specs it names by path. */
  projects: string[] | 'all'
  specs: string[] | null
  /** True when it sets the switch that makes the config's webServer run prepare-pages. */
  sweep: boolean
  /** True when it brings its own server (ES_E2E_ORIGIN). */
  outside: boolean
  installed: string[]
}

/** Every job of the workflows (file name to source) that has a step running `playwright test`, with what that step runs. */
export function runnersOf(sources: ReadonlyMap<string, string>): Runner[] {
  const runners: Runner[] = []
  for (const [file, source] of sources) {
    for (const [name, job] of Object.entries(parseWorkflow(source).jobs ?? {})) {
      const steps = job.steps ?? []
      const installed = new Set(BASELINE)
      if (steps.some((step) => step.uses?.startsWith('oven-sh/setup-bun@') === true || /npm install[^\n]*"bun@/.test(step.run ?? ''))) installed.add('bun')
      if (steps.some((step) => step.uses?.startsWith('astral-sh/setup-uv@') === true)) installed.add('uv')
      for (const step of steps) {
        const run = step.run ?? ''
        const at = run.search(/\bplaywright test\b/)
        if (at < 0) continue
        const words = run.slice(at).split('\n')[0].split(/\s+/).slice(2)
        const projects = words.flatMap((word, index) => (word.startsWith('--project=') ? [word.slice(10)] : word === '--project' ? [words[index + 1]] : []))
        const specs = words.filter((word) => /^e2e\/.*\.spec\.ts$/.test(word))
        const env = { ...job.env, ...step.env }
        const set = (key: string) => env[key] !== undefined && String(env[key]) !== '' && String(env[key]) !== '0'
        runners.push({
          at: `${file}/${name}`,
          projects: projects.length > 0 ? projects : 'all',
          specs: specs.length > 0 ? specs : null,
          sweep: set('ES_E2E_NIGHTLY') || set('ES_E2E_PAGES'),
          outside: set('ES_E2E_ORIGIN'),
          installed: [...installed].sort(),
        })
      }
    }
  }
  return runners
}

/** Whether the runner runs the spec. A run with no --project runs every project, and one that names specs runs those. */
export function runs(runner: Runner, spec: string, project: string): boolean {
  if (runner.specs !== null) return runner.specs.includes(spec)
  return runner.projects === 'all' || runner.projects.includes(project)
}

/**
 * Every program that a spec (with its imports) or the config starts and that a job running it does not have, as sentences. `readSource`
 * reads a repository file, so that a test can hand in a spec as it stood.
 */
export function missingPrograms(args: {
  specs: readonly string[]
  config: string
  workflows: ReadonlyMap<string, string>
  readSource?: (file: string) => string
}): string[] {
  const { specs, config, workflows } = args
  const readSource = args.readSource ?? ((file: string) => readFileSync(path.join(root, file), 'utf8'))
  const runners = runnersOf(workflows)
  const problems: string[] = []
  for (const spec of specs) {
    const project = projectOf(spec, config)
    const started = new Map<string, string>()
    for (const file of closureOf(spec, readSource)) for (const program of programsStarted(readSource(file)).programs) started.set(program, file)
    for (const runner of runners.filter((candidate) => runs(candidate, spec, project))) {
      for (const [program, file] of started) {
        if (!runner.installed.includes(program)) problems.push(`${spec} (${project}) starts "${program}" in ${file}, and ${runner.at} does not install it`)
      }
    }
  }
  const server = webServerPrograms(config)
  for (const runner of runners.filter((candidate) => !candidate.outside)) {
    for (const program of [...server.always, ...(runner.sweep ? server.sweep : [])]) {
      if (!runner.installed.includes(program)) problems.push(`playwright.config.ts's webServer starts "${program}", and ${runner.at} does not install it`)
    }
  }
  return problems
}
