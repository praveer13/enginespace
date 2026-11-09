/*
 * Which documents the build writes (ARCHITECTURE §3.2, W0-T19): the plan that prepare-pages carries out and that
 * `verify:routes` holds to the route table.
 *
 * GitHub Pages has no rewrite rules, so a deep link returns HTTP 200 only where a file stands. The plan lists a document for
 * every route it can enumerate:
 *   - a route without parameters is one document, and `PAGES` below gives it the sentence that describes it;
 *   - a route with parameters is one document for each thing that fills the parameters, and `PAGES` says where to find them:
 *     the course index (modules and lessons), the game registry, the lab list and the Trace Room's traces;
 *   - `/` is the document that index.html built, which the front page owns (W0-T18), and `*` is 404.html, the fallback that
 *     serves every other address and lets the router show its not-found page.
 * Every document gets its own `<title>`, its own description and its own static shell (document.ts). A static page, a module, a
 * lesson, a game and a lab are titled as their pages title themselves once they run (routes.tsx names a static page's, and the
 * content pages, the game page and the lab page call `titled`), so the tab does not change when the app takes over. A trace is titled
 * here by what it is, and the Trace Room's page still sets the route's generic title, which replaces it: it takes the plan's title
 * when W2-T20 builds it.
 *
 * A route that the plan cannot enumerate is a problem, and so is an entry for a route that the table does not have. `PAGES` is
 * keyed by the route table's patterns (§3.1), so adding a route means adding its entry here, and `verify:routes` fails until its
 * author does.
 *
 * The plan is a function of three things it is given: the route table, the sources and nothing else. It reads no file, which is
 * how the tests give it a table with one more route and a registry with one more game.
 */
import { matchRoutes } from 'react-router'
import type { RouteObject } from 'react-router'
import type { GameEntry } from '../../packages/play/types.ts'
import type { ContentIndex } from '../../packages/schema/compiled.ts'
import { labName, titled } from '../../src/content/render/model.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* What a plan is made from                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The things that fill a route's parameters. `loadSources` (sources.ts) reads the real ones. */
export interface Sources {
  /** The course index of ARCHITECTURE §4.6: every module of `course.yaml`, written or planned, with its lessons. */
  index: ContentIndex
  /** The game registry (`packages/play/registry.ts`): the games that are built, with the names the learner sees (D-049). */
  games: readonly Pick<GameEntry, 'id' | 'title' | 'subtitle' | 'has3d'>[]
  /** The lab list: the ids of ARCHITECTURE §9.2 (`hybrid-kv`, `tr8.replay`). */
  labs: readonly string[]
  /** The traces of the Trace Room that exist at build time, pinned and synthetic. */
  traces: readonly string[]
}

/** An entry of the route table that ends in a page, in the notation of §3.1: `/m/:module`, with `*` for the catch-all. */
export interface Leaf {
  pattern: string
  /** The `<title>` the route names, or null when no route on the way down does. */
  title: string | null
  route: RouteObject
}

/** One document the plan wants, once a spec has listed it. */
export interface Instance {
  /** The path under the base that it answers: `/m/tr2`. */
  url: string
  title: string
  /** The `<h1>` of its static shell. */
  heading: string
  description: string
}

interface Common {
  /** The route-table pattern that this document answers. */
  pattern: string
  /** Its file under dist/. */
  file: string
  title: string
}

/** A document that prepare-pages writes. The fallback has no address of its own, because it stands for all the rest. */
export interface Written extends Common {
  keep: false
  url: string | null
  heading: string
  description: string
}

/** The front page's document, which stays as the build wrote it: its title, description and shell are index.html's own. */
export interface Kept extends Common {
  keep: true
  url: '/'
}

export type Page = Written | Kept

export interface Plan {
  /** Every document, ordered by file. */
  pages: Page[]
  /** Everything wrong, each as a sentence that says what to do. Empty when the plan is sound. */
  problems: string[]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The route table                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

function titleOf(route: RouteObject): string | null {
  const handle: unknown = route.handle
  return typeof handle === 'object' && handle !== null && 'title' in handle && typeof handle.title === 'string' ? handle.title : null
}

/** The entries of a route table that end in a page: the leaves, in table order, each with the nearest title on its way down. */
export function leavesOf(table: readonly RouteObject[], parent = '', inherited: string | null = null): Leaf[] {
  return table.flatMap((route) => {
    const here = route.index || route.path === undefined ? parent : `${parent.replace(/\/$/, '')}/${route.path.replace(/^\//, '')}`
    const title = titleOf(route) ?? inherited
    if (route.children !== undefined) return leavesOf(route.children, here, title)
    return [{ pattern: here === '/*' ? '*' : here, title, route }]
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What each route's documents are                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Spec =
  | { kind: 'keep' }
  | { kind: 'fallback'; description: string }
  | { kind: 'page'; description: string }
  | { kind: 'each'; list: (sources: Sources) => readonly Instance[] }

const keep = (): Spec => ({ kind: 'keep' })
const page = (description: string): Spec => ({ kind: 'page', description })
const each = (list: (sources: Sources) => readonly Instance[]): Spec => ({ kind: 'each', list })

/**
 * The plan's table, one entry per route-table pattern (ARCHITECTURE §3.1). A description is the sentence for a page's meta tag and
 * its static shell: a page's purpose, as §3.1 gives it, with no number and no fact about an engine in it (rule 7 would ask for a
 * tag and a source). A route with parameters lists its documents from a source, and a source with nothing in it yet lists none:
 * the address then falls back to 404.html, which boots the app and lets the router show the page for it.
 */
export const PAGES: Readonly<Record<string, Spec>> = {
  '/': keep(),
  '/map': page('Every module from TR0 to the capstone, with its lanes, its hours, the kernelspace lessons it builds on, and the evidence you hold for it.'),
  '/m/:module': each(({ index }) =>
    index.modules.map((module) => ({
      url: module.route,
      title: titled(module.title),
      heading: module.title,
      description:
        module.status === 'planned'
          ? 'A module of the course that is planned and not written yet.'
          : 'A module of the course, with its lessons, the games and labs it uses, and what you will be able to do after it.',
    })),
  ),
  '/m/:module/:lesson': each(({ index }) =>
    index.modules.flatMap((module) =>
      module.lessons.map((lesson) => ({
        url: lesson.route,
        title: titled(lesson.title),
        heading: lesson.title,
        description: `A lesson in ${module.title}.`,
      })),
    ),
  ),
  '/play': page("Play the engine's decisions yourself in a seeded world, in 2D or in 3D."),
  '/play/:game': each(({ games }) =>
    games.map((game) => ({
      url: `/play/${game.id}`,
      title: titled(game.title),
      heading: game.title,
      description: `Play ${game.subtitle} as a seeded game whose rule is the concept itself, in 2D${game.has3d ? ' or in 3D' : ''}.`,
    })),
  ),
  '/labs/:lab': each(({ labs }) =>
    labs.map((lab) => ({
      url: `/labs/${lab}`,
      title: titled(labName(lab)),
      heading: labName(lab),
      description: 'The kit to download and the checks that grade this lab.',
    })),
  ),
  '/trace-room': page('Read engine traces beside the seeded step-loop world, and hunt for the gaps. A trace without a real capture behind it is labelled synthetic.'),
  '/trace-room/:trace': each(({ traces }) =>
    traces.map((trace) => ({
      url: `/trace-room/${trace}`,
      title: titled(`Trace ${trace}`),
      heading: `Trace ${trace}`,
      description: 'Read this trace and its spans beside the seeded step-loop world.',
    })),
  ),
  '/receipts': page('Issue a challenge for a GPU lab, import the receipt that the local grader writes, and read how your browser checked it.'),
  '/today': page('A short spaced review of what you have earned so far, drawn on fresh seeds.'),
  '/evidence': page('The progress that your own ledger shows, kept on this device. Export it, import it, or undo an import.'),
  '/design': page("The token roles and their values, the components and their states, motion, and the scene kit's specimens, each beside its 2D twin."),
  '/settings': page('3D on or off, the quality tier cap, reduced motion, and your data on this device.'),
  // What the page holds today (W3-T15 builds the rest): its lead says the same (src/unbuilt/copy.ts), and a test holds the two together.
  '/about': page('The licences of the third-party code and the typefaces that this site uses.'),
  '/changes': page('The claims and the pins that have moved, as change cards.'),
  '*': { kind: 'fallback', description: 'Nothing lives at this address.' },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Planning                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The ` · enginespace` that every route's title ends with. */
const SUFFIX = titled('')

/** A page's name without the site's: `Course map · enginespace` is headed `Course map`. */
export const headingOf = (title: string): string => (title.endsWith(SUFFIX) ? title.slice(0, -SUFFIX.length) : title)

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** What is wrong with an address as a path under the base, or null. A segment becomes a folder name, so it stays plain. */
function urlProblem(url: string): string | null {
  if (!url.startsWith('/')) return 'must start with "/"'
  if (url === '/') return null
  const bad = url.slice(1).split('/').find((segment) => !SEGMENT.test(segment))
  return bad === undefined ? null : `has the segment "${bad}", and a segment is letters, digits, ".", "_" and "-", starting with a letter or digit`
}

/** The file that answers an address: `/m/tr2` is `m/tr2/index.html`. */
export const fileOf = (url: string): string => (url === '/' ? 'index.html' : `${url.slice(1)}/index.html`)

const byFile = (a: Page, b: Page): number => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)

/**
 * The documents of a build. Every route-table entry must have a spec in `PAGES` and every spec a route; every document must have a
 * safe address that the router sends to the route that listed it, and a title, a heading and a description; and no two documents
 * may share an address or a title.
 */
export function planPages(table: readonly RouteObject[], sources: Sources): Plan {
  const problems: string[] = []
  const pages: Page[] = []
  const leaves = leavesOf(table)
  const known = new Map(leaves.map((leaf) => [leaf.route, leaf.pattern]))
  const patternOf = (route: RouteObject | undefined): string => (route === undefined ? 'no route' : (known.get(route) ?? 'a route outside the table'))

  const seen = new Set<string>()
  for (const { pattern } of leaves) {
    if (seen.has(pattern)) problems.push(`${pattern} is in the route table twice`)
    seen.add(pattern)
  }
  for (const pattern of Object.keys(PAGES)) {
    if (!seen.has(pattern)) problems.push(`scripts/pages/plan.ts lists ${pattern}, which the route table (src/routes.tsx) does not have: remove the entry`)
  }

  for (const leaf of leaves) {
    const { pattern } = leaf
    const spec = Object.hasOwn(PAGES, pattern) ? PAGES[pattern] : undefined
    if (spec === undefined) {
      problems.push(
        `${pattern} cannot be enumerated: scripts/pages/plan.ts has no entry for it. Add one to PAGES: ` +
          'page(description) for a route without parameters, or each(list) for a route with parameters, listing its documents from a source ' +
          '(the content index, the game registry, the lab list or the traces)',
      )
      continue
    }
    if (leaf.title === null) {
      problems.push(`${pattern} names no title: give its route a handle (handle: titled('…') in src/routes.tsx), because a document needs a <title>`)
      continue
    }
    if (spec.kind === 'keep') {
      pages.push({ keep: true, pattern, url: '/', file: 'index.html', title: leaf.title })
    } else if (spec.kind === 'fallback') {
      pages.push({ keep: false, pattern, url: null, file: '404.html', title: leaf.title, heading: headingOf(leaf.title), description: spec.description })
    } else {
      const instances: readonly Instance[] = spec.kind === 'page' ? [{ url: pattern, title: leaf.title, heading: headingOf(leaf.title), description: spec.description }] : spec.list(sources)
      for (const instance of instances) {
        const bad = urlProblem(instance.url)
        if (bad !== null) {
          problems.push(`${pattern}: the address "${instance.url}" ${bad}`)
          continue
        }
        const routed = matchRoutes(table as RouteObject[], instance.url)?.at(-1)?.route
        if (routed !== leaf.route) {
          problems.push(`${pattern}: the router sends ${instance.url} to ${patternOf(routed)}, so its document would answer the wrong page`)
          continue
        }
        const empty = (['title', 'heading', 'description'] as const).filter((field) => instance[field].trim() === '')
        if (empty.length > 0) {
          problems.push(`${instance.url} has an empty ${empty.join(' and ')}`)
          continue
        }
        pages.push({ keep: false, pattern, url: instance.url, file: fileOf(instance.url), title: instance.title, heading: instance.heading, description: instance.description })
      }
    }
  }

  const files = new Map<string, Page>()
  const titles = new Map<string, string[]>()
  for (const entry of pages) {
    const first = files.get(entry.file)
    if (first !== undefined) problems.push(`${entry.url ?? entry.file} and ${first.url ?? first.file} are the same document (${entry.file})`)
    files.set(entry.file, entry)
    titles.set(entry.title, [...(titles.get(entry.title) ?? []), entry.url ?? entry.file])
  }
  for (const [title, where] of titles) {
    if (where.length > 1) problems.push(`${where.join(' and ')} share the title "${title}", and every document needs its own`)
  }
  return { pages: pages.sort(byFile), problems }
}

/** How many documents each route-table pattern has, in the table's order. A pattern whose source is empty has none. */
export function countsOf(table: readonly RouteObject[], pages: readonly Page[]): Map<string, number> {
  const counts = new Map(leavesOf(table).map((leaf): [string, number] => [leaf.pattern, 0]))
  for (const entry of pages) counts.set(entry.pattern, (counts.get(entry.pattern) ?? 0) + 1)
  return counts
}

/** One line per route-table pattern: how many documents it has, and what becomes of an address that none answers. */
export function summaryLines(counts: ReadonlyMap<string, number>): string[] {
  const width = Math.max(0, ...[...counts.keys()].map((pattern) => pattern.length))
  return [...counts].map(([pattern, count]) => `  ${pattern.padEnd(width)}  ${String(count).padStart(3)}${count === 0 ? '  (its source is empty: an address falls back to 404.html)' : ''}`)
}
