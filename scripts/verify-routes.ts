/*
 * verify:routes (ARCHITECTURE §3.2, §10.2; W0-T19). The route table, prepare-pages and the e2e route list must agree.
 *
 *   bun scripts/verify-routes.ts [--routes <file>]
 *
 * It plans the build's documents from the route table (src/routes.tsx) and this checkout's sources, as prepare-pages will, and
 * fails when
 *   - a route cannot be enumerated: scripts/pages/plan.ts has no entry for it, so prepare-pages would write no document for it
 *     and a deep link to it would answer 404. Add the entry, which is a description for a page and a list for a route with
 *     parameters, drawn from a source (the content index, the game registry, the lab list or the traces);
 *   - the plan lists a route that the table does not have;
 *   - a document's address is not a plain path, or the router sends it to another route than the one that listed it;
 *   - two documents share an address or a title, or one has an empty title, heading or description;
 *   - the e2e route list names an address that no document answers.
 *
 * The e2e route list is `PR_ROUTES` in e2e/routes.ts, the paths that the pull-request subset of the specs visits (ARCHITECTURE §10.1,
 * §11.2: axe on eight routes). W0-T21 adds that file, and until it exists there is nothing to compare, which the output says.
 * The gate needs no build: it reads the table and the sources, and prepare-pages checks the built files (the title, the policy,
 * the base) when it writes them; tests/pages runs a real build through it.
 *
 * `--routes <file>` plans from the `routes` that <file> exports in place of src/routes.tsx: a fixture with one route more.
 *
 * Exit status: 0 when the three agree, 1 when they do not, 2 for a usage error.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { RouteObject } from 'react-router'
import { countsOf, planPages, summaryLines } from './pages/plan.ts'
import type { Page, Sources } from './pages/plan.ts'
import { loadSources, ROOT, SourcesError } from './pages/sources.ts'
import { routes as appRoutes } from '../src/routes.tsx'

export interface Input {
  routes: readonly RouteObject[]
  sources: Sources
  /** The paths in e2e/routes.ts, or null when the file does not exist yet. */
  e2e: readonly string[] | null
}

export interface Report {
  problems: string[]
  pages: Page[]
  /** How many documents each route-table pattern has. */
  counts: Map<string, number>
}

/** What is wrong with the e2e route list: an address twice, or one that no document answers. */
export function e2eProblems(urls: readonly string[], pages: readonly Page[]): string[] {
  const answered = new Set(pages.flatMap((page) => (page.url === null ? [] : [page.url])))
  const problems: string[] = []
  const seen = new Set<string>()
  for (const url of urls) {
    if (seen.has(url)) problems.push(`e2e/routes.ts lists ${url} twice`)
    seen.add(url)
    if (!answered.has(url)) {
      problems.push(`e2e/routes.ts lists ${url}, which no document answers: the route table has no such page, or the source that lists it holds nothing for it yet. Mend the list, or add the page`)
    }
  }
  return problems
}

export function checkRoutes({ routes, sources, e2e }: Input): Report {
  const plan = planPages(routes, sources)
  const problems = [...plan.problems, ...(e2e === null ? [] : e2eProblems(e2e, plan.pages))]
  return { problems, pages: plan.pages, counts: countsOf(routes, plan.pages) }
}

/** The paths of e2e/routes.ts, or null when the file is not there. It throws when the file does not keep the contract. */
async function loadE2e(root: string): Promise<readonly string[] | null> {
  const file = path.join(root, 'e2e/routes.ts')
  if (!existsSync(file)) return null
  const loaded = (await import(file)) as { PR_ROUTES?: unknown }
  const urls = loaded.PR_ROUTES
  if (!Array.isArray(urls) || !urls.every((url) => typeof url === 'string')) {
    throw new Error('e2e/routes.ts must export PR_ROUTES, an array of the paths that the pull-request specs visit, such as ["/", "/map", "/m/tr2"]')
  }
  return urls as string[]
}

async function loadRoutes(file: string | null): Promise<readonly RouteObject[]> {
  if (file === null) return appRoutes
  const loaded = (await import(path.resolve(file))) as { routes?: unknown }
  if (!Array.isArray(loaded.routes)) throw new Error(`${file} must export routes, a route table`)
  return loaded.routes as RouteObject[]
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export async function main(argv: readonly string[]): Promise<number> {
  let fixture: string | null = null
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] !== '--routes' || argv[i + 1] === undefined) {
      console.error('usage: bun scripts/verify-routes.ts [--routes <file>]')
      return 2
    }
    fixture = argv[i + 1]
  }
  const table = await loadRoutes(fixture)
  const e2e = await loadE2e(ROOT)
  let sources: Sources
  try {
    sources = loadSources()
  } catch (error) {
    if (!(error instanceof SourcesError)) throw error
    console.log(`verify:routes failed: ${error.message}`)
    return 1
  }
  const { problems, pages, counts } = checkRoutes({ routes: table, sources, e2e })
  if (problems.length > 0) {
    for (const problem of problems) console.log(`verify:routes: ${problem}`)
    console.log(`verify:routes failed: ${plural(problems.length, 'problem')}`)
    return 1
  }
  console.log(`verify:routes passed: ${counts.size} route-table ${counts.size === 1 ? 'entry' : 'entries'} with ${plural(pages.length, 'document')}`)
  for (const line of summaryLines(counts)) console.log(line)
  console.log(
    e2e === null
      ? '  e2e route list: e2e/routes.ts does not exist yet (W0-T21), so there is nothing to compare'
      : `  e2e route list: ${plural(e2e.length, 'path')} in e2e/routes.ts, and each has a document`,
  )
  return 0
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
