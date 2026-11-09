/*
 * W1b-T09: the pages that are not built yet say what they will hold and which task builds it, and no page says only that it is not built.
 *
 *   - /receipts, /changes, /about, /trace-room and the ten labs that W2 and W3 build each render a heading, a lead, a list of what the page
 *     will hold, the red line that says it is not built, the task and the wave that build it, and a way on to a page that is.
 *   - The words are src/unbuilt/copy.ts's, and they come from somewhere: each task is a task of docs/TRACKER.md whose text is about
 *     that page, and each lab's module, lane and one line are the course's own (the compiled map). A task renamed, or a lab whose artifact
 *     changes, fails here and not in front of a learner.
 *   - A page's lead is the sentence of its served document (scripts/pages/plan.ts), and its heading is the document's heading, so the page
 *     does not change when the app takes over. /about's says what the page holds today.
 *   - The words hold no number that no tag covers (rule 7).
 *
 * The pages render on the server renderer with the static router, as tests/smoke.test.ts renders them. What needs a browser (the titles
 * after mount) is e2e/titles.spec.ts's.
 */
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, matchRoutes, StaticRouterProvider } from 'react-router'
import { LAB_IDS } from '../../scripts/content/directives'
import { untaggedNumbers } from '../../scripts/content/prose'
import { planPages } from '../../scripts/pages/plan'
import type { Page, Written } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import { LAB_TASKS, labName } from '../../src/content/render/model'
import { FORGE_LAB_IDS } from '../../src/forge/ids'
import { LAB_HOLDS, LAB_STUBS, UNBUILT, unbuiltCopy, waveOf } from '../../src/unbuilt/copy'
import { routes } from '../../src/routes'
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
  ['/receipts', UNBUILT.receipts],
  ['/changes', UNBUILT.changes],
  ['/about', UNBUILT.about],
  ['/trace-room', UNBUILT.traceRoom],
] as const

describe.each(PAGES)('%s, which is not built yet', (url, copy) => {
  test('has one heading, a lead, the list of what it will hold, and the red line that says it is not built', async () => {
    const html = mainOf(await render(url))
    expect(headingsIn(html, 1)).toEqual([copy.title])
    expect(html).toContain(leadOf(copy.lead))
    expect(headingsIn(html, 2)).toContain(copy.heading)
    expect(holdsIn(html)).toEqual([...copy.holds])
    expect(copy.holds.length).toBeGreaterThanOrEqual(2)
    expect(html).toMatch(/class="es-unbuilt__pending">.*Not built yet/s)
  })

  test('names the tasks that build it and the wave they arrive with, and leads to a page that is built', async () => {
    const html = mainOf(await render(url))
    const text = textOf(html)
    for (const task of copy.tasks) expect(text).toContain(task)
    expect(text).toContain(`Arriving with ${waveOf(copy.tasks[0])}`)
    expect(html).toContain(`href="${copy.next.to}"`)
    expect(text).toContain(copy.next.label)
    // Not the page that every unknown address gets.
    expect(matchRoutes(routes, copy.next.to)?.at(-1)?.route.path).not.toBe('*')
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

describe('the tasks the pages name', () => {
  test('are tasks of the tracker, and the tracker\'s text for each is about the page', () => {
    expect(heading('W2-T06')).toContain('`/receipts`')
    expect(heading('W2-T07')).toContain('Receipt worker and import')
    expect(heading('W2-T20')).toContain('The Trace Room')
    expect(tasks.get('W3-T06')).toContain('`/changes` renders change cards')
    expect(tasks.get('W3-T15')).toContain('`/about`')
  })

  test('are all named by a page, and all sit in the wave the page says it arrives with', () => {
    for (const [, copy] of PAGES) {
      for (const task of copy.tasks) {
        expect(tasks.has(task), `${task} is in docs/TRACKER.md`).toBe(true)
        expect([task, waveSectionOf(task)]).toEqual([task, waveOf(task)])
      }
    }
    for (const [lab, task] of Object.entries(LAB_TASKS)) expect([lab, waveSectionOf(task)]).toEqual([lab, waveOf(task)])
  })
})

describe('/about, which holds its licences today', () => {
  test('keeps the licences paragraph it had, in a ticket of its own, beside the one that says what is still to come', async () => {
    const html = mainOf(await render('/about'))
    expect(headingsIn(html, 2)).toEqual(['Licences', 'Still to come'])
    const text = textOf(html)
    expect(text).toContain('The licences of the third-party code in this site are in third-party-licenses.txt')
    expect(text).toContain('the typefaces are under the SIL Open Font License 1.1')
    expect(html).toContain('href="/third-party-licenses.txt"')
  })

  test('has a description that says only what it holds today: the licences, and none of what W3-T15 will bring', () => {
    const { description } = documentOf('/about')
    expect(description).toMatch(/licences/)
    expect(description).not.toMatch(/privacy|claims|models|ignores|world/i)
    // The worlds' cards, the claims and the privacy promise are the list of what is still to come.
    expect(UNBUILT.about.holds.join(' ')).toMatch(/world.*models.*ignores/i)
    expect(UNBUILT.about.holds.join(' ')).toMatch(/privacy/i)
  })
})

describe('the labs that W2 and W3 build', () => {
  test("are the labs of the course that have no host: the compiler's list less the forge labs that a host grades", () => {
    expect(Object.keys(LAB_STUBS).sort()).toEqual(LAB_IDS.filter((id) => !FORGE_LAB_IDS.includes(id)).sort())
    expect(Object.keys(LAB_STUBS).sort()).toEqual(Object.keys(LAB_TASKS).filter((id) => !FORGE_LAB_IDS.includes(id)).sort())
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
      expect(text).toContain(LAB_TASKS[id])
      expect(text).toContain(`Arriving with ${waveOf(LAB_TASKS[id])}`)
      expect(text).toContain('Not built yet')
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
      expect(textOf(html)).not.toContain('Not built yet')
    }
  })
})

describe('the games', () => {
  test('a game that the registry does not have is said to be missing', async () => {
    for (const id of ['nothing', 'constructor']) expect(headingsIn(mainOf(await render(`/play/${id}`)), 1)).toEqual(['Game not found'])
  })
})

describe('the copy', () => {
  test('holds no number that no tag covers: a wave, a task and a module are identifiers', () => {
    expect(unbuiltCopy().length).toBeGreaterThan(40)
    expect(unbuiltCopy().flatMap((text) => untaggedNumbers(text))).toEqual([])
  })

  test("names no licence for the site's own code and content: that is the owner's to decide (O-3), and the page only says it will hold them", () => {
    expect(unbuiltCopy().join(' ')).not.toMatch(/\bMIT\b|CC BY|all rights reserved|\bGPL\b|\bBSD\b|Apache/i)
    expect(UNBUILT.about.holds).toContain("The licences of the site's own code and content.")
  })
})
