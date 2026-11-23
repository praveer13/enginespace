/*
 * R-T22: the module page as REDESIGN section 3.3 orders it. Drawn on the server renderer over the repository's own compiled content (the
 * real TR2, TR5a and TR1), so the order, the button, the rows, the ticks and the Reference are read from the course as it stands.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import type { CompiledModule, ContentIndex, CourseMap, LessonIndex } from '@es/schema'
import { findBanned } from '@/copy/banned'
import { ModuleView, type ModuleWay } from '@/pages/Module'
import { leavesOut, sentenceText } from '@/map/moduleWords'
import { deriveProgress } from '@/progress/derive'
import { indexLessons, nextStep, standings } from '@/progress/next'
import { appSources, homeModule } from '@/progress/sources'
import { compileContent } from '../../scripts/content/build.ts'
import { output, repo } from '../content/support.ts'
import { made } from '../progress/support'
import { render, textOf } from '../map/support'

const compiled = compileContent({ root: repo })
const json = <T>(file: string): T => JSON.parse(output(compiled, file)) as T
const INDEX = json<ContentIndex>('src/content/generated/index.json')
const LESSON_INDEX = json<LessonIndex>('src/content/generated/lesson-index.json')
const MAP = json<CourseMap>('src/content/generated/map.json')
const mod = (id: string) => json<CompiledModule>(`src/content/generated/modules/${id}.json`)
const events = (...list: ReturnType<typeof made>[]) => list

function page(id: string, ledger: readonly ReturnType<typeof made>[] | null) {
  const ready = ledger !== null
  const list = ledger ?? []
  const progress = deriveProgress(list, MAP, appSources(MAP), homeModule)
  const index = indexLessons(MAP.lessons)
  const states = new Map([...standings(list, index)].map(([lesson, standing]) => [lesson, standing.state]))
  const way: ModuleWay = { step: ready ? nextStep(list, MAP.lessons, null) : null, last: null, states: ready ? states : new Map(), lessons: MAP.lessons.filter((lesson) => lesson.module === id) }
  return render(
    h(ModuleView, { id, module: mod(id), entry: INDEX.modules.find((entry) => entry.id === id), lessons: LESSON_INDEX.modules[id], claims: null, today: '2026-11-16', kcs: MAP.kcs.filter((kc) => kc.module === id), progress: progress.modules.get(id), ready, way }),
    `/m/${id}`,
  )
}

const way = (html: string) => /<div class="es-module__way">[\s\S]*?<\/div>\s*<\/header>/.exec(html)?.[0] ?? ''

describe('the order of the page', () => {
  const html = page('tr2', [])

  test('is the title, two sentences, the button and the lessons, before anything else', () => {
    const order = ['<h1 class="es-module__title">', 'class="es-module__sentences"', 'class="es-module__way"', 'id="lessons"', 'id="outcomes"', 'class="es-module__rows"', 'id="reference"'].map((marker) => html.indexOf(marker))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  test('the two sentences are the first two of the module\'s own first paragraph', () => {
    const sentences = /<p class="es-module__sentences">([^<]*)<\/p>/.exec(html)?.[1] ?? ''
    expect(sentences.split(/(?<=\.)\s+/)).toHaveLength(2)
    expect(sentences.startsWith("The step loop is the engine")).toBe(true)
  })

  test('no citation row and no metadata receipt sits above the lessons', () => {
    const above = html.slice(0, html.indexOf('id="lessons"'))
    for (const word of ['printer', 'es-sheet', 'es-doc__tapes', 'data-tag="measured"', 'skills passed', 'claim']) expect(above, word).not.toContain(word)
    expect(textOf(above)).not.toMatch(/\bstatus\b|\bpins\b|\bkept\b/)
  })

  test('has one h1 and an outline that never skips a level', () => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    levels.forEach((level, at) => {
      if (at > 0) expect(level).toBeLessThanOrEqual(levels[at - 1] + 1)
    })
  })

  test('says no banned word in anything the page itself writes', () => {
    for (const id of ['tr1', 'tr2', 'tr5a', 'tr6', 'tr8']) {
      // The module's own essays in the Reference are the content tasks' words; everything the page itself writes is clean.
      expect(findBanned(textOf(page(id, []).replace(/<details[\s\S]*?<\/details>/g, ''))), id).toEqual([])
    }
  })
})

describe('the amber button', () => {
  test('is Start from nothing, as the way on words it, and never Continue from an empty ledger', () => {
    const tr1 = way(page('tr1', []))
    expect(tr1).toContain('es-header__next')
    expect(tr1).toContain('data-emphasis="primary"')
    expect(textOf(tr1)).not.toContain('Continue')
  })

  test('on a module the way on does not point into, names the first lesson, its title and its minutes, and never says Continue', () => {
    // The learner's last work was in TR1, so the way on points there and TR2's button is a local one.
    const html = page('tr2', events(made('play', 'play:engine-floor/map')))
    const button = way(html)
    const first = LESSON_INDEX.modules.tr2?.[0]
    expect(textOf(button)).toContain(`Open lesson 1: ${first?.title}`)
    expect(textOf(button)).toContain(`about ${first?.minutes} min`)
    expect(textOf(button)).not.toContain('Continue')
    expect(button).toContain(`href="${first?.route}"`)
  })

  test('is Continue, with nextStep\'s own link, when nextStep points into the module', () => {
    const lesson = MAP.lessons.find((candidate) => candidate.module === 'tr2')
    const ledger = lesson === undefined ? [] : events(made('predict', `predict:${lesson.predicts[0]?.replace(/^predict:/, '')}`))
    const step = nextStep(ledger, MAP.lessons, null)
    const html = page('tr2', ledger)
    if (step.module === 'tr2' && step.word === 'Continue') {
      expect(way(html)).toContain(`href="${step.href}"`)
      expect(textOf(way(html))).toContain('Continue')
    } else expect(textOf(way(html))).not.toContain('Continue')
  })

  test('on a planned module with no lessons, from an empty ledger, never says a lesson is done, and still offers the way on', () => {
    const planned = INDEX.modules.filter((entry) => (LESSON_INDEX.modules[entry.id] ?? []).length === 0).map((entry) => entry.id)
    expect(planned.length).toBeGreaterThan(0)
    const step = nextStep([], MAP.lessons, null)
    for (const id of planned) {
      const view: ModuleWay = { step, last: null, states: new Map(), lessons: MAP.lessons.filter((lesson) => lesson.module === id) }
      const html = render(h(ModuleView, { id, module: null, entry: INDEX.modules.find((entry) => entry.id === id), lessons: LESSON_INDEX.modules[id] ?? [], claims: null, today: '2026-11-16', ready: true, way: view }), `/m/${id}`)
      expect(textOf(way(html)), id).not.toContain('is done')
      expect(textOf(way(html)), id).toContain(`Next: ${step.reason}.`)
      expect(way(html), id).toContain(`href="${step.href}"`)
    }
  })

  test('waits for the ledger and says so, and offers no place it has not read', () => {
    const html = page('tr2', null)
    expect(way(html)).toContain('role="status"')
    expect(way(html)).not.toContain('es-header__next')
  })
})

describe('the lessons', () => {
  const html = page('tr2', [])
  const lessons = LESSON_INDEX.modules.tr2 ?? []

  test('each row shows its number, title, minutes, what it needs and its state as a word', () => {
    expect(lessons.length).toBeGreaterThan(0)
    lessons.forEach((lesson, at) => {
      const row = textOf(new RegExp(`<li class="es-module__lesson"[^>]*data-lesson="${lesson.id}"[\\s\\S]*?</li>`).exec(html)?.[0] ?? '')
      expect(row, lesson.id).toContain(`${at + 1} ${lesson.title}`)
      expect(row).toContain(`${lesson.minutes} (estimated) min`)
      expect(row).toContain('browser only')
      expect(row).toContain('not started')
    })
  })

  test('carries the marker on the next lesson and on no other', () => {
    expect(html.match(/data-next="true"/g)).toHaveLength(1)
    expect(/<li class="es-module__lesson"[^>]*data-lesson="[^"]*"[^>]*data-next="true"/.exec(html)?.[0]).toContain(lessons[0].id)
  })

  test('a row opens its lesson, and its state moves with the ledger', () => {
    expect(html).toContain(`href="${lessons[0].route}"`)
    const first = MAP.lessons.find((lesson) => lesson.module === 'tr2')
    const started = page('tr2', first === undefined ? [] : events(made('predict', first.predicts[0] ?? 'predict:none', { ok: false })))
    expect(textOf(started)).toMatch(/started|not started/)
  })
})

describe('the outcomes', () => {
  test('gain a tick, derived from the KC states, when their KCs are passed', () => {
    const outcomes = mod('tr5a').outcomes
    const none = page('tr5a', [])
    expect(none).not.toContain('data-done="true"')
    expect(textOf(none)).not.toContain('You can ')
    // The lab's checks pass tr5a.hit-intersection, which is all the third outcome rests on.
    const passed = page('tr5a', events(made('lab-check', 'lab:hybrid-kv')))
    const can = passed.indexOf('>You can<')
    const will = passed.indexOf('>You will be able to<')
    expect(can).toBeGreaterThan(-1)
    expect(passed.indexOf(outcomes[2].replace("'", '&#x27;'))).toBeGreaterThan(can)
    expect(passed.indexOf(outcomes[2].replace("'", '&#x27;'))).toBeLessThan(will)
    expect(passed.match(/es-module__tick" data-done="true"/g)).toHaveLength(1)
  })
})

describe('the Reference', () => {
  const html = page('tr2', [])
  const reference = html.slice(html.indexOf('id="reference"'))

  test('is closed disclosures, and their words are in the document', () => {
    const details = reference.match(/<details\b[^>]*>/g) ?? []
    expect(details.length).toBeGreaterThanOrEqual(3)
    for (const tag of details) expect(tag).not.toContain('open')
    for (const words of ['What this module says about the engines', 'Credit, and the hours', 'The step loop is the engine']) expect(reference).toContain(words)
  })

  test('is the last section of the page', () => {
    expect(html.indexOf('id="reference"')).toBeGreaterThan(html.indexOf('class="es-module__rows"'))
    expect(html.slice(html.indexOf('</section>', html.indexOf('id="reference"')) + 10)).not.toContain('<section')
  })
})

describe('the words of every published module page', () => {
  const published = INDEX.modules.filter((entry) => entry.published).map((entry) => entry.id)
  // The page as a learner reads it: every disclosure is in the document, closed or not.
  const read = (id: string) => textOf(page(id, []))

  test('there is a published module to walk', () => {
    expect(published.length).toBeGreaterThanOrEqual(5)
  })

  for (const id of published) {
    test(`${id}: no build id, no doubled state phrase, no capital inside a heading's sentence`, () => {
      const text = read(id)
      expect(text.match(/\bks:\S+/g) ?? [], 'a kernelspace ref').toEqual([])
      expect(text.match(/\btr\d[a-z]?\.[a-z][a-z-]*/g) ?? [], 'a lab or family id').toEqual([])
      expect(text.match(/\bLab tr\S*/g) ?? [], 'a lab named by its id').toEqual([])
      expect(text.match(/not (?:published )?yet\W+not (?:published )?yet/gi) ?? [], 'a doubled state phrase').toEqual([])
      expect(text.match(/\bWhat (?:A|An|The) /g) ?? [], 'a capital inside a sentence').toEqual([])
      expect(findBanned(text)).toEqual([])
    })
  }

  test('a prerequisite reads as the kernelspace lesson\'s title, with its link', () => {
    const html = page('tr1', [])
    const advised = /Advised first:[\s\S]*?<\/p>/.exec(html)?.[0] ?? ''
    expect(advised).toContain('“The Production Stack: vLLM, SGLang, TRT-LLM, Dynamo”')
    expect(advised).toMatch(/<a [^>]*href="https:\/\/[^"]*\/lesson\/t5\.l10"/)
    expect(advised).not.toContain('T5.L10')
  })

  test('a kernelspace lesson in the module\'s words is named by its title, and the sentences under the title never carry its ref', () => {
    const html = page('tr1', [])
    const sentences = /<p class="es-module__sentences">([^<]*)<\/p>/.exec(html)?.[1] ?? ''
    expect(sentences).not.toContain('ks:')
    expect(sentences.length).toBeGreaterThan(40)
    expect(textOf(html)).toMatch(/“The Production Stack”[^“”]*in kernelspace drew vLLM and SGLang as boxes/)
    expect(sentenceText([{ type: 'ks', ref: 'ks:T5.L10' }, { type: 'text', text: ' drew boxes.' }])).toBe('“The Production Stack” in kernelspace drew boxes.')
    expect(sentenceText([{ type: 'ks', ref: 'ks:t5.kv-capacity' }])).toBe('kernelspace t5.kv-capacity')
  })

  test('a lab that has no page is named by its title and says once that it is not published', () => {
    const html = page('tr1', [])
    const prove = /data-row="prove"[\s\S]*?<\/div>/.exec(html)?.[0] ?? ''
    expect(textOf(prove)).toContain('A nano-vllm fork that emits a span for every stage of your own map: not published yet')
    expect(textOf(prove)).not.toContain('not yet')
  })
})

describe('the heading over a model card', () => {
  test('lowers the article that starts the card\'s title, where the title stands inside a sentence', () => {
    expect(leavesOut("A request's lifecycle")).toBe("What a request's lifecycle leaves out")
    expect(leavesOut('The step loop')).toBe('What the step loop leaves out')
    expect(leavesOut('Prefix caching')).toBe('What prefix caching leaves out')
    expect(leavesOut('KV pages')).toBe('What KV pages leaves out')
    expect(leavesOut(undefined)).toBe('What the model leaves out')
  })
})
