/*
 * prepare-pages (ARCHITECTURE §3.2, W0-T19): turns the build in dist/ into a site that GitHub Pages serves with HTTP 200 on a
 * deep link. Pages has no rewrite rules, so an address answers 200 only where a file stands.
 *
 *   VITE_BASE=/enginespace/ bun scripts/prepare-pages.ts [--dist <dir>]
 *
 * It reads dist/index.html, the document that Vite built from index.html, and writes from it
 *   - dist/<route>/index.html for every route the plan can enumerate (scripts/pages/plan.ts): the route table's pages, each
 *     module and lesson of the course index, each game of the registry, each lab of the lab list. Each document has its own
 *     <title>, description and static shell, and everything else of the template, the policy and the hashed assets included, as
 *     the build wrote it;
 *   - dist/404.html, the same template headed "Page not found". Pages serves it for every other address, the app boots from it, and
 *     the router shows the page that the address names, or its not-found page (kernelspace's prepare-pages pattern).
 * dist/index.html itself stays as built: the front page owns its shell (W0-T18).
 *
 * VITE_BASE is the base the build was made under, as vite.config.ts reads it. It names the front-page link in each shell, and it
 * is checked against the template's asset paths, because a site built under one base and prepared under another would send
 * every deep link to assets that are not there. The files are written under dist/ whatever the base is: Pages serves dist/ at it.
 *
 * Before it finishes it reads back every .html file of dist/ and fails unless each carries ARCHITECTURE §12's policy as the first
 * element after its <meta charset> (a file of public/ included), each planned document has the title the plan gives it, and no two
 * titles are the same. Exit status: 0 when the site is prepared, 1 when it is not, 2 for a usage error.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cspProblems, inlineScriptProblems, inspect, MARK, policyProblems, render } from './pages/document.ts'
import type { Inspection } from './pages/document.ts'
import { countsOf, planPages, summaryLines } from './pages/plan.ts'
import type { Page } from './pages/plan.ts'
import { loadSources, ROOT, SourcesError } from './pages/sources.ts'
import { routes } from '../src/routes.tsx'

/** Every problem found, so that one run tells the whole story. */
export class PrepareError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(problems.join('\n'))
    this.name = 'PrepareError'
    this.problems = problems
  }
}

/**
 * The base as a path with a slash at each end: `/` or `/enginespace/`. Unset and empty mean `/`, as vite.config.ts has it. A base
 * that is not an absolute path (`./`, a URL) is refused: a document at `/m/tr2/` could not find `assets/` under it.
 */
export function normalizeBase(raw: string | undefined): string {
  const text = raw === undefined || raw === '' ? '/' : raw
  const base = `${text.startsWith('/') ? '' : '/'}${text}${text.endsWith('/') ? '' : '/'}`
  if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(base) || /(?:^|\/)\.\.?(?:\/|$)/.test(base)) {
    throw new PrepareError([`VITE_BASE must be a path such as /enginespace/, got "${text}": deep-link documents need assets at an absolute path`])
  }
  return base
}

/** The base that Vite built a document under, read off its entry script (`/enginespace/assets/index-x.js`), or null when it cannot be told. */
function builtBase(entry: string | null): string | null {
  return entry === null ? null : (/^(\/(?:[^/]+\/)*?)assets\//.exec(entry)?.[1] ?? null)
}

/** What is wrong with the template, the document that every page is made from. */
function templateProblems(info: Inspection, base: string): string[] {
  const problems = [
    ...cspProblems(info.head).map((problem) => `index.html: ${problem}. The build adds the policy (scripts/pages/csp.ts), so build with this repository's vite.config.ts`),
    ...inlineScriptProblems(info).map((problem) => `index.html: ${problem}`),
  ]
  if (info.title === null) problems.push('index.html: it has no <title>')
  if (info.roots !== 1) problems.push(`index.html: it has ${info.roots} <div id="root"> elements, and the app mounts into exactly one`)
  if (info.outside !== '') {
    problems.push(
      `index.html: it has text outside <div id="root"> ("${info.outside.slice(0, 60)}"). Every page but the front page swaps what is inside the root for its own shell, so a shell outside it would show on all of them`,
    )
  }
  const built = builtBase(info.entry)
  if (built !== null && built !== base) {
    problems.push(`index.html: the build used the base "${built}" and VITE_BASE says "${base}": build and prepare under the same VITE_BASE`)
  }
  return problems
}

/** The .html files under `dist`, as paths relative to it written with slashes. */
function htmlFiles(dist: string): string[] {
  return (readdirSync(dist, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => file.endsWith('.html'))
    .sort()
}

export interface Prepared {
  /** The files written, as paths under dist/. */
  written: string[]
  /** How many .html files were read back and held to the policy. */
  checked: number
}

export interface PrepareOptions {
  dist: string
  base: string
  pages: readonly Page[]
}

/** Writes the plan's documents into `dist`, then reads back every document of it. Throws a `PrepareError` listing what is wrong. */
export async function preparePages({ dist: given, base: rawBase, pages }: PrepareOptions): Promise<Prepared> {
  const dist = path.resolve(given)
  const base = normalizeBase(rawBase)
  const templatePath = path.join(dist, 'index.html')
  if (!existsSync(templatePath)) {
    throw new PrepareError([`${templatePath} does not exist: build first, with VITE_BASE=${base} npm run build`])
  }
  const template = readFileSync(templatePath, 'utf8')
  const found = templateProblems(await inspect(template), base)
  if (found.length > 0) throw new PrepareError(found)

  // Render everything and look for a collision before the first write, so that a refused run leaves dist/ as it found it.
  const problems: string[] = []
  const documents = new Map<string, string>()
  for (const entry of pages) {
    if (entry.keep) continue
    const target = path.resolve(dist, entry.file)
    if (!target.startsWith(`${dist}${path.sep}`)) problems.push(`${entry.file} would leave dist/`)
    else if (existsSync(target) && !readFileSync(target, 'utf8').includes(MARK)) {
      problems.push(`${entry.file} is already in dist/ and prepare-pages did not write it (does public/ hold it?): move that file, or the route`)
    } else documents.set(entry.file, await render(template, entry, base))
  }
  if (problems.length > 0) throw new PrepareError(problems)

  const written: string[] = []
  for (const [file, html] of documents) {
    const target = path.join(dist, file)
    try {
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, html)
    } catch (error) {
      throw new PrepareError([`${file} could not be written: ${error instanceof Error ? error.message : String(error)}`])
    }
    written.push(file)
  }

  // Read back what the visitor will get: every document of the site, whether this run wrote it or the build did.
  const planned = new Map(pages.map((entry) => [entry.file, entry]))
  const titles = new Map<string, string[]>()
  const files = htmlFiles(dist)
  for (const file of files) {
    const html = readFileSync(path.join(dist, file), 'utf8')
    const info = await inspect(html)
    problems.push(...policyProblems(info).map((problem) => `${file}: ${problem}`))
    const entry = planned.get(file)
    if (entry === undefined) {
      if (html.includes(MARK)) problems.push(`${file}: an earlier run wrote it and the plan no longer lists it: build again, so that dist/ starts empty`)
      continue
    }
    // The front page's title and description are index.html's own (W0-T18), so for it they only have to exist.
    if (info.title === null || info.title === '') problems.push(`${file}: it has no <title>`)
    else if (!entry.keep && info.title !== entry.title) problems.push(`${file}: its <title> is ${JSON.stringify(info.title)}, and the plan gives ${JSON.stringify(entry.title)}`)
    if (info.description === null || info.description === '') problems.push(`${file}: it has no description`)
    else if (!entry.keep && info.description !== entry.description) problems.push(`${file}: its description is not the plan's`)
    titles.set(info.title ?? '', [...(titles.get(info.title ?? '') ?? []), file])
  }
  for (const entry of pages) if (!files.includes(entry.file)) problems.push(`${entry.file} is not in dist/`)
  for (const [title, where] of titles) {
    if (where.length > 1) problems.push(`${where.join(' and ')} share the title ${JSON.stringify(title)}`)
  }
  if (problems.length > 0) throw new PrepareError(problems)
  return { written, checked: files.length }
}

/** Reads `--dist <dir>`, which names the build to prepare (dist/ by default). Null means a usage error. */
function parseDist(argv: readonly string[]): string | null {
  if (argv.length === 0) return path.join(ROOT, 'dist')
  return argv.length === 2 && argv[0] === '--dist' ? path.resolve(argv[1]) : null
}

/** Runs the command line `argv` (without the program and script). `env` is where VITE_BASE comes from. */
export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>> = process.env): Promise<number> {
  const dist = parseDist(argv)
  if (dist === null) {
    console.error('usage: VITE_BASE=/enginespace/ bun scripts/prepare-pages.ts [--dist <dir>]')
    return 2
  }
  try {
    const base = normalizeBase(env.VITE_BASE)
    const plan = planPages(routes, loadSources())
    if (plan.problems.length > 0) throw new PrepareError(plan.problems.map((problem) => `routes: ${problem}`))
    const { written, checked } = await preparePages({ dist, base, pages: plan.pages })
    const shown = path.relative(process.cwd(), dist)
    console.log(`prepare-pages: wrote ${written.length} documents under ${shown === '' || shown.startsWith('..') ? dist : shown}/ for the base ${base}, and checked the policy and the title of all ${checked} .html files`)
    for (const line of summaryLines(countsOf(routes, plan.pages))) console.log(line)
    return 0
  } catch (error) {
    if (error instanceof SourcesError) {
      console.error(`prepare-pages: ${error.message}`)
      return 1
    }
    if (error instanceof PrepareError) {
      for (const problem of error.problems) console.error(`prepare-pages: ${problem}`)
      console.error(`prepare-pages failed: ${error.problems.length} ${error.problems.length === 1 ? 'problem' : 'problems'}`)
      return 1
    }
    throw error
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
