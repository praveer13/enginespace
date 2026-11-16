/*
 * R-T23: the pages that are not published yet say what they will hold, say "Not published yet" in the learner's words, name no task
 *     and no wave, and hand the learner back to Continue.
 *
 *   - /trace-room and the ten labs not published yet each render a heading, a lead, a list of what the page will
 *     hold, the line that says "Not published yet", and the way on: the pointer's own link and label, the one the header shows.
 *   - The words are src/unbuilt/copy.ts's. Each lab's module, lane and one line are the course's own (the compiled map): a lab whose
 *     artifact changes fails here and not in front of a learner. Which tracker task builds a page is the tracker's, and is tested here
 *     (it is not on the page).
 *   - A page's lead is the sentence of its served document (scripts/pages/plan.ts), and its heading is the document's heading, so the page
 *     does not change when the app takes over.
 *   - The words hold no number that no tag covers (rule 7).
 *
 * The pages render on the server renderer with the static router, as tests/smoke.test.ts renders them. What needs a browser (the titles
 * after mount) is e2e/titles.spec.ts's.
 */
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, matchRoutes, StaticRouterProvider } from 'react-router'
import { findBanned } from '../../src/copy/banned'
import { LAB_IDS } from '../../scripts/content/directives'
import { untaggedNumbers } from '../../scripts/content/prose'
import { planPages } from '../../scripts/pages/plan'
import type { Page, Written } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import { LAB_TASKS, labName } from '../../src/content/render/model'
import { FORGE_LAB_IDS } from '../../src/forge/ids'
import { LAB_HOLDS, LAB_STUBS, UNBUILT, unbuiltCopy } from '../../src/unbuilt/copy'
import { routes } from '../../src/routes'
import { START_POINTER } from '../../src/settings/store'
import { read, trackerTasks } from '../ci/support'
import { MAP, textOf } from '../map/support'

const tasks = trackerTasks()
const tracker = read('docs/TRACKER.md')
/** A task's heading line: `#### [ ] W2-T06 · Challenge issuing and `/receipts` · M · sonnet · deps: …`. */
const heading = (id: string) => tasks.get(id)?.split('\n', 1)[0] ?? ''
/** The wave whose section of the tracker holds a task: `W2` for `W2-T06`, `W1b` for `W1b-T09`. */
function waveSectionOf(id: string): string | undefined {
  const at = tracker.indexOf(`] ${id} · `)
  return [...tracker.slice(0, at).matchAll(/^## (W\d+b?)\b/gm)].at(-1)?.[1]
}

async function render(url: string): Promise<string> {
  const handler = createStaticHandler(routes, { basename: '/' })
  const context = await handler.query(new Request(new URL(url, 'http://localhost')))
  if (context instanceof Response) throw new Error(`${url} answered with a ${context.status} response`)
  const router = createStaticRouter(handler.dataRoutes, context)
  return renderToString(createElement(StaticRouterProvider, { router, context, hydrate: false })).replaceAll('<!-- -->', '')
}

/** The markup of the page inside the shell's main landmark. */
const mainOf = (html: string) => /<main\b[^>]*>(.*)<\/main>/s.exec(html)?.[1] ?? ''
/** The text of every heading of one level, without its markup. */
const headingsIn = (html: string, level: 1 | 2) => [...html.matchAll(new RegExp(`<h${level}[^>]*>(.*?)</h${level}>`, 'gs'))].map((match) => textOf(match[1]).trim())
/** The lines of the list that holds what a page will hold. */
const holdsIn = (html: string) => {
  const list = /<ul class="es-unbuilt__holds">(.*?)<\/ul>/s.exec(html)?.[1] ?? ''
  return [...list.matchAll(/<li>(.*?)<\/li>/gs)].map((match) => textOf(match[1]).trim())
}
/** The lead as React writes it. */
const leadOf = (lead: string) => `<p class="es-page__lead">${lead.replaceAll('&', '&amp;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;')}</p>`

const plan = planPages(routes, loadSources())
const documentOf = (url: string): Written => {
  const page: Page | undefined = plan.pages.find((candidate) => candidate.url === url)
  if (page === undefined || page.keep) throw new Error(`the plan has no document of its own for ${url}`)
  return page
}

/** The pages with a route of their own, with their copy. */
const PAGES = [
  ['/trace-room', UNBUILT.traceRoom],
] as const

/** The tracker task that builds each page. It is the tracker's, and no page shows it. */
const BUILT_BY: Readonly<Record<string, string>> = { '/trace-room': 'W2-T20' }

describe.each(PAGES)('%s, which is not built yet', (url, copy) => {
  test('has one heading, a lead, the list of what it will hold, and the red line that says it is not built', async () => {
    const html = mainOf(await render(url))
    expect(headingsIn(html, 1)).toEqual([copy.title])
    expect(html).toContain(leadOf(copy.lead))
    expect(headingsIn(html, 2)).toContain(copy.heading)
    expect(holdsIn(html)).toEqual([...copy.holds])
    expect(copy.holds.length).toBeGreaterThanOrEqual(2)
    expect(html).toMatch(/class="es-unbuilt__pending">.*Not published yet/s)
  })

  test('says Not published yet and names no task and no wave, and offers Continue, the pointer of an empty ledger here', async () => {
    const html = mainOf(await render(url))
    const text = textOf(html)
    expect(text).toContain('Not published yet')
    expect(text).not.toMatch(/Not built yet|Arriving with|\bW\d+b?\b|\bW\d+-T\d+\b|\bR-T\d+\b/)
    const nav = /<nav aria-label="The way on"[^>]*>(.*?)<\/nav>/s.exec(html)?.[1] ?? ''
    expect(nav).toContain(`href="${START_POINTER.href}"`)
    expect(textOf(nav)).toContain(START_POINTER.label)
    // Not the page that every unknown address gets.
    expect(matchRoutes(routes, START_POINTER.href)?.at(-1)?.route.path).not.toBe('*')
  })

  test('says more than that it is not built: the old sentence is gone, and the page holds words besides the red line', async () => {
    const html = mainOf(await render(url))
    expect(html).not.toContain('This page is not built yet')
    expect(textOf(html).split(/\s+/).filter(Boolean).length).toBeGreaterThan(40)
  })

  test("is headed as its served document is, and its lead is the document's sentence", () => {
    expect(documentOf(url)).toMatchObject({ heading: copy.title, description: copy.lead })
  })
})

describe('the tasks that build the pages', () => {
  test('are tasks of the tracker, and the tracker\'s text for each is about the page', () => {
    expect(heading('W2-T20')).toContain('Traces, and Trace attribution')
  })

  test('each page has one, and it sits in the wave section of the tracker that it names', () => {
    for (const [url] of PAGES) {
      const task = BUILT_BY[url]
      expect(tasks.has(task), `${task} is in docs/TRACKER.md`).toBe(true)
      expect([task, waveSectionOf(task)]).toEqual([task, task.split('-')[0]])
    }
    for (const [lab, task] of Object.entries(LAB_TASKS)) expect([lab, waveSectionOf(task)]).toEqual([lab, task.split('-')[0]])
  })
})

describe('the labs that W2 and W3 build', () => {
  test("are the labs of the course that have no host: the compiler's list less the forge labs that a host grades", () => {
    expect(Object.keys(LAB_STUBS).sort()).toEqual(LAB_IDS.filter((id) => !FORGE_LAB_IDS.includes(id)).sort())
    // The labs that have a task are the labs that have no host: the built ones (W1b-T02) name no task.
    expect(Object.keys(LAB_STUBS).sort()).toEqual(Object.keys(LAB_TASKS).sort())
    expect(Object.keys(LAB_STUBS)).toHaveLength(10)
  })

  test("each is the course's own: the module that lists it, its lane and the line the learner hands in are the compiled map's", () => {
    for (const [id, stub] of Object.entries(LAB_STUBS)) {
      const module = MAP.modules.find((candidate) => candidate.artifacts.some((artifact) => artifact.id === id))
      expect([id, module?.id]).toEqual([id, stub.module])
      const artifact = module?.artifacts.find((candidate) => candidate.id === id)
      expect([id, artifact?.lane, artifact?.title]).toEqual([id, stub.lane, stub.handIn])
    }
  })

  describe.each(Object.entries(LAB_STUBS))('%s', (id, stub) => {
    test('is headed as its served document is, and says what the learner hands in, what the page will hold, and the task that builds it', async () => {
      const html = mainOf(await render(`/labs/${id}`))
      expect(headingsIn(html, 1)).toEqual([labName(id)])
      expect(documentOf(`/labs/${id}`).heading).toBe(labName(id))
      expect(html).toContain(leadOf(`${stub.handIn}.`))
      expect(holdsIn(html)).toEqual([...(stub.lane === 'B' ? LAB_HOLDS.forge : LAB_HOLDS.graded)])
      const text = textOf(html)
      expect(text).not.toContain(LAB_TASKS[id])
      expect(text).not.toContain('Arriving with')
      expect(text).toContain('Not published yet')
      expect(html).not.toContain('This page is not built yet')
    })

    test('names its lane and its module on tape, and leads to the module', async () => {
      const html = mainOf(await render(`/labs/${id}`))
      const lane = { B: 'browser', L: 'laptop', F: 'GPU' }[stub.lane]
      expect(textOf(html)).toContain(`lane · ${lane}`)
      expect(html).toContain(`href="/m/${stub.module}"`)
    })
  })

  test('a lab the course does not have is said to be missing, with a way back, and no task is claimed for it', async () => {
    for (const id of ['nothing', 'constructor', '__proto__']) {
      const html = mainOf(await render(`/labs/${id}`))
      expect(headingsIn(html, 1)).toEqual(['Lab not found'])
      expect(html).toContain('href="/map"')
      expect(textOf(html)).not.toContain('Not published yet')
    }
  })
})

describe('the games', () => {
  test('a game that the registry does not have is said to be missing', async () => {
    for (const id of ['nothing', 'constructor']) expect(headingsIn(mainOf(await render(`/play/${id}`)), 1)).toEqual(['Game not found'])
  })
})

describe('the copy', () => {
  test('uses no banned word, and names no task or wave', () => {
    expect(unbuiltCopy().flatMap((text) => findBanned(text))).toEqual([])
    expect(unbuiltCopy().join(' ')).not.toMatch(/\bW\d+b?(-T\d+)?\b|\bR-T\d+\b|not built|arriving/i)
  })

  test('holds no number that no tag covers: a wave, a task and a module are identifiers', () => {
    expect(unbuiltCopy().length).toBeGreaterThan(40)
    expect(unbuiltCopy().flatMap((text) => untaggedNumbers(text))).toEqual([])
  })

  test("names no licence for the site's own code and content: that is the owner's to decide (O-3)", () => {
    expect(unbuiltCopy().join(' ')).not.toMatch(/\bMIT\b|CC BY|all rights reserved|\bGPL\b|\bBSD\b|Apache/i)
  })
})
