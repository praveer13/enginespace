/*
 * W0-T09: the content renderer and the module and lesson pages, as markup (the server renderer inside a router). The sample
 * lesson (content/modules/tr2/lessons/l0-sample.md) uses every block, so this compiles the repository's own content and
 * draws it: accept 1 ("renders every block type") at the level of markup, and accept 3 ("headings form a valid outline") as
 * a check on the heading levels. The browser checks are run by hand and by W0-T21's axe walk.
 *
 * The brief for this task (the design components: tickets, tape labels and the printer tape, not generic cards) is checked
 * here too: every block is a ticket, the page's facts are the printer's tape, and no class on the page is a stranger to the
 * design system.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { BLOCK_TYPES } from '@es/schema'
import type { Claim, CompiledBlock, CompiledCard, CompiledLesson, CompiledModule, ContentIndex, ProseFlow, ProseInline } from '@es/schema'
import { Blocks, NotionalMachineView } from '@/content/render/Blocks'
import { renderEnv } from '@/content/render/model'
import { PageNotice } from '@/content/render/Page'
import { PredictTicket } from '@/content/render/Predict'
import { Prose } from '@/content/render/Prose'
import { LessonView } from '@/pages/Lesson'
import { ModuleView } from '@/pages/Module'
import { compile, output, sampleCard } from './support.ts'

const TODAY = '2026-11-04'

const compiled = compile()
const json = <T>(file: string): T => JSON.parse(output(compiled, file)) as T
const lesson = json<CompiledLesson>('src/content/generated/lessons/tr2.l0-sample.json')
const module = json<CompiledModule>('src/content/generated/modules/tr2.json')
const index = json<ContentIndex>('src/content/generated/index.json')
const claims: ReadonlyMap<string, Claim> = new Map(json<{ claims: Claim[] }>('public/claims.json').claims.map((claim) => [claim.id, claim]))
const entry = (id: string) => index.modules.find((candidate) => candidate.id === id)

/** A page as the server renders it inside a router, with React's text-node markers taken out. */
const render = (element: ReactElement, location = '/') => renderToString(h(StaticRouter, { location }, element)).replaceAll('<!-- -->', '')

/** The opening tags of one element, from the markup. */
const opening = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>`, 'g'))].map((match) => match[0])
const attribute = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
const levels = (html: string) => [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
/** The block tickets of a page, by block type, with the placeholder each carries. */
const placeholders = (html: string) =>
  Object.fromEntries(
    opening(html, 'section')
      .filter((tag) => attribute(tag, 'data-placeholder') !== undefined)
      .map((tag) => [attribute(tag, 'data-block'), attribute(tag, 'data-placeholder')]),
  )

const text = (value: string): ProseInline => ({ type: 'text', text: value })
const paragraph = (...children: ProseInline[]): ProseFlow => ({ type: 'paragraph', children })
const prose = (...body: ProseFlow[]): CompiledBlock => ({ type: 'prose', body })
/** Prose drawn on its own, with the ids its headings get. */
const drawn = (...body: ProseFlow[]) => render(h(Prose, { body, env: renderEnv([prose(...body)], claims, TODAY) }))
/** Blocks drawn on their own. */
const drawnBlocks = (...blocks: CompiledBlock[]) => render(h(Blocks, { blocks, env: renderEnv(blocks, claims, TODAY), scope: 'tr9.l1' }))

describe('/m/tr2/l0-sample, the lesson template (REDESIGN §2.5)', () => {
  const html = render(h(LessonView, { lesson, module: entry('tr2'), claims, today: TODAY }), '/m/tr2/l0-sample')

  test('the sample lesson uses all eight block types, so the page has something of each to draw', () => {
    const used = new Set(lesson.blocks.map((block) => block.type))
    expect([...used].sort()).toEqual([...BLOCK_TYPES].sort())
  })

  test('is one page in sections: Read and Test with their ids, then Keep and Sources, and no Run (its first game follows its first heading)', () => {
    const ids = opening(html, 'section').map((tag) => attribute(tag, 'id')).filter((id) => id !== undefined)
    expect(ids).toEqual(['read', 'test', 'keep', 'sources'])
    expect(html).toContain('data-opener="C"')
    expect(html).not.toContain('id="run"')
  })

  test('draws the blocks as what they are: the game as a run, the warning as a note, the figure in its part, the lab as Keep’s Build row', () => {
    expect(html).toContain('data-play="loop/async"')
    expect(html).toContain('class="es-note" data-kind="watch"')
    expect(html).toContain('Watch out: a model')
    expect(html).toMatch(/<img src="\/figures\/tr2\/l0-sample\.svg" alt="Two steps on a CPU lane and a GPU lane"[^>]*>/)
    expect(html).toContain('Build: Lab tr3.profile')
    expect(html).toContain('Not published yet.')
  })

  test('no notional-machine card is inlined: the title block’s line opens it, and nothing else draws it', () => {
    expect(html).not.toContain('data-kind="notional-machine"')
    expect(html).not.toContain('es-ticket')
  })

  test('no build-log word reaches the learner: no task id and no "not built yet"', () => {
    expect(html).not.toMatch(/\bW\d-T\d\d\b|\bR-T\d\d\b|\bD-\d{3}\b/)
    expect(html.toLowerCase()).not.toContain('not built yet')
  })

  test('draws the prose: its table, its code block, its list and its inline code', () => {
    expect(html).toContain('<th scope="col"')
    expect(html).toContain('<pre tabindex="0" data-lang="text"><code>schedule -&gt; launch -&gt; sample -&gt; update</code></pre>')
    expect(html).toContain('<li>how much of the host step the scheduler can move off the critical path;</li>')
    expect(html).toContain('<code>engine step</code>')
    expect(html).toContain('<strong>critical path</strong>')
  })

  test('a claim is a numbered link to its entry in Sources, with a popover on activation, and no paragraph holds a chip', () => {
    const marks = [...html.matchAll(/<a href="#source-(\d+)" class="es-pop__trigger"[^>]*data-claim="([^"]+)"/g)].map((match) => [Number(match[1]), match[2]])
    expect(marks).toEqual([
      [1, 'sample.world.host-step-us'],
      [2, 'sample.world.decode-step-us'],
      [3, 'vllm.release.requires-python'],
    ])
    expect(html).toContain('aria-haspopup="dialog"')
    for (const n of [1, 2, 3]) expect(html).toContain(`id="source-${n}"`)
    expect(html).not.toContain('class="es-claim"')
    expect(html).not.toContain('class="es-tag"')
    const paragraphs = [...html.matchAll(/<p[\s>][\s\S]*?<\/p>/g)].map((match) => match[0])
    for (const paragraph of paragraphs) expect(paragraph).not.toMatch(/es-tape|es-claim\b|es-stamp/)
  })

  test('a tagged number carries a dotted underline and its tag as hidden text, and is not a tab stop', () => {
    expect(html).toContain('<span class="es-num" data-tag="estimated">300<span class="sr-only"> (estimated)</span></span>')
    expect(html).toContain('<span class="es-num" data-tag="unverified">1<span class="sr-only"> (unverified)</span></span>')
    expect(html).not.toMatch(/class="es-num"[^>]*tabindex/)
  })

  test('the Sources list holds every claim the lesson cites', () => {
    const sources = /<section class="es-lesson__sources"[\s\S]*?<\/section>/.exec(html)?.[0] ?? ''
    for (const id of ['sample.world.host-step-us', 'sample.world.decode-step-us', 'vllm.release.requires-python']) expect(sources).toContain(`data-claim="${id}"`)
    expect(sources).toContain('vllm 0.33.0 on PyPI (JSON API)')
    expect(sources).toContain('Checked <time dateTime="2026-11-04">2026-11-04</time>')
  })

  test('links: a kernelspace lesson goes out to kernelspace, a route is the router’s, and the breadcrumb names the module by its title', () => {
    expect(html).toContain('href="https://kernelspace.naigap.com/lesson/t5.l7"')
    expect(html).toContain('<a class="es-link" href="/map" data-discover="true">the course map</a>')
    expect(html).toContain('<a class="es-link" href="/m/tr2" data-discover="true">TR2 The step loop</a>')
    expect(html).toContain('Builds on ')
  })

  test('headings form a valid outline, and every heading has an anchor', () => {
    const found = levels(html)
    expect(found[0]).toBe(1)
    expect(found.filter((level) => level === 1).length).toBe(1)
    found.forEach((level, at) => {
      if (at > 0) expect(level).toBeLessThanOrEqual(found[at - 1] + 1)
    })
    const headings = [...html.matchAll(/<h[1-6]([^>]*)>/g)].map((match) => match[1])
    for (const tag of headings) expect(tag).toMatch(/\sid="[^"]+"/)
  })

  test('ids are unique', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('the-bubble')
  })

  test('nothing is collapsed: the last paragraph is in the page’s text with no interaction, and nothing is hidden or a closed disclosure', () => {
    expect(html).toContain('The sample ends here. A real lesson closes with an exit check')
    expect(html).not.toContain('<details')
    expect(html).not.toMatch(/<section[^>]*\shidden/)
  })

  test('is built from the design system: every class on the page is one of its own', () => {
    const classes = new Set([...html.matchAll(/\sclass="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)))
    const strangers = [...classes].filter((name) => !/^(es-|sr-only$|font-numeric$)/.test(name))
    expect(strangers).toEqual([])
  })

  test('the lesson’s revision is on the page, for the evidence that will be graded against it', () => {
    expect(html).toContain(`data-rev="${lesson.rev}"`)
  })

  test('Keep: with the Test not passed, the amber control goes to the questions and the next lesson is an outline beside it', () => {
    const own = entry('tr2')
    if (own === undefined) throw new Error('the sample module is not in the index')
    const around = { ...own, lessons: [...own.lessons, { id: 'tr2.l9', slug: 'l9-after', title: 'The lesson after', route: '/m/tr2/l9-after', minutes: 10, status: 'draft' as const }] }
    const page = render(h(LessonView, { lesson, module: around, claims, today: TODAY }))
    const keep = /<section id="keep"[\s\S]*?<\/section>/.exec(page)?.[0] ?? ''
    expect(keep).toMatch(/<a class="es-next__action" data-emphasis="primary" href="#the-bubble">[\s\S]*?Go to the 3 questions/)
    expect(keep).toMatch(/<a class="es-next__action" data-emphasis="outline" href="\/m\/tr2\/l9-after"[\s\S]*?Next: lesson 2, The lesson after/)
    expect(keep.match(/data-emphasis="primary"/g)?.length).toBe(1)
  })

  test('Keep: with the Test passed, the one amber control is nextStep’s answer', () => {
    const step = { href: '/m/tr2/l9-after', label: 'Continue: TR2 lesson 2', word: 'Continue', needs: ['B'], reason: '', skipped: 0, place: 'lesson', lesson: 'tr2.l9', module: 'tr2' } as const
    const reading = { step, passed: true, runDone: null, runAnswers: [], readAnswers: [], testWords: '3 of 3: passed', record: ['TR2 lesson 1', 'questions 3 of 3 passed'] }
    const page = render(h(LessonView, { lesson, module: entry('tr2'), claims, today: TODAY, reading }))
    const keep = /<section id="keep"[\s\S]*?<\/section>/.exec(page)?.[0] ?? ''
    expect(keep).toMatch(/<a class="es-next__action" data-emphasis="primary" href="\/m\/tr2\/l9-after"[\s\S]*?Continue: TR2 lesson 2/)
    expect(keep.match(/data-emphasis="primary"/g)?.length).toBe(1)
    expect(keep).toContain('<code>questions 3 of 3 passed</code>')
    expect(page).toContain('3 of 3: passed')
  })

  test('when the claims did not load the page still stands, and each mark says so in its sheet and in Sources', () => {
    const without = render(h(LessonView, { lesson, module: entry('tr2'), claims: null, today: TODAY }))
    expect(without.match(/The sources did not load\./g)?.length).toBe(3)
  })

  test('a lesson drawn without its module’s index entry falls back to the module’s code', () => {
    const alone = render(h(LessonView, { lesson, claims, today: TODAY }))
    expect(alone).toContain('<a class="es-link" href="/m/tr2" data-discover="true">TR2</a>')
  })
})

describe('/m/tr2', () => {
  const html = render(h(ModuleView, { id: 'tr2', module, entry: entry('tr2'), claims, today: TODAY }), '/m/tr2')

  test('has one h1, the module\'s title, and the outline never skips a level', () => {
    expect([...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/g)].map((match) => match[1])).toEqual(['The step loop'])
    const found = levels(html)
    expect(found.filter((level) => level === 1).length).toBe(1)
    found.forEach((level, at) => {
      if (at > 0) expect(level).toBeLessThanOrEqual(found[at - 1] + 1)
    })
  })

  test('draws the first screen, then what you will be able to do, the rows, and the Reference last', () => {
    const order = ['class="es-module__sentences"', 'class="es-module__way"', 'id="lessons"', 'data-block="outcomes"', 'class="es-module__rows"', 'id="reference"'].map((marker) => html.indexOf(marker))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    for (const outcome of module.outcomes) expect(html).toContain(outcome)
  })

  test('lists each lesson as a row that opens it, with its minutes as a tagged estimate', () => {
    expect(html).toContain('<a href="/m/tr2/l0-sample"')
    expect(html).toContain('A sample lesson that uses every block')
    expect(html).toMatch(/<span class="es-num" data-tag="estimated">45<span class="sr-only"> \(estimated\)<\/span><\/span>/)
  })

  test('holds the module\'s hours and sources in the Reference, as closed disclosures', () => {
    const reference = html.slice(html.indexOf('id="reference"'))
    expect(reference).toContain('<details class="es-module__part"')
    expect(reference).not.toContain('<details open')
    expect(reference).toContain('id="ref-hours"')
    expect(html.slice(0, html.indexOf('id="reference"'))).not.toContain('data-tag="measured"')
  })

  test('is built from the design system alone', () => {
    const classes = new Set([...html.matchAll(/\sclass="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)))
    expect([...classes].filter((name) => !/^(es-|sr-only$)/.test(name))).toEqual([])
  })

  test('a module that is only planned shows what the index knows of it, and says nobody has written it', () => {
    const planned = render(h(ModuleView, { id: 'tr0', module: null, entry: entry('tr0'), claims: null, today: TODAY }), '/m/tr0')
    expect(planned).toContain('<h1 class="es-module__title">PyTorch for the Rust-first, and reading Triton</h1>')
    expect(planned).toContain('Not published yet.')
    expect(planned).toContain('No lessons yet.')
    expect(planned).toContain('laptop')
    expect(planned).not.toContain('data-block="outcomes"')
  })

  test('a module drawn without its index entry says its lesson list did not load', () => {
    const alone = render(h(ModuleView, { id: 'tr2', module, claims, today: TODAY }))
    expect(alone).toContain('The list of lessons did not load.')
    expect(alone).toContain('data-block="outcomes"')
  })
})

describe('the notices a page shows instead of its content', () => {
  test('still printing: the printer\'s dots and a status line, under the page\'s name', () => {
    const html = render(h(PageNotice, { kind: 'loading', title: 'Lesson', ticket: 'tr2 / l0-sample', what: 'lesson' }))
    expect(html).toContain('<h1 class="es-doc__title">Lesson</h1>')
    expect(html).toContain('data-state="loading"')
    expect(html).toContain('role="status"')
    expect(html).toContain('Printing the lesson')
  })

  test('nothing at this address: a blank ticket that says so, and the way back', () => {
    const html = render(h(PageNotice, { kind: 'missing', title: 'Module not found', ticket: 'nope', message: 'No module called nope.', back: { to: '/map', label: 'Course map' } }))
    expect(html).toContain('<h1 class="es-doc__title">Module not found</h1>')
    expect(html).toContain('data-state="empty"')
    expect(html).toContain('No module called nope.')
    expect(html).toMatch(/<a class="es-stub__pull" href="\/map"/)
  })

  test('it did not load: a red line that is announced, and a stub that reloads the page', () => {
    const html = render(h(PageNotice, { kind: 'failed', title: 'The lesson did not load', ticket: 'tr2 / l0-sample', message: 'The lesson would not print.' }))
    expect(html).toContain('data-state="error"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('The lesson would not print.')
    expect(html).toContain('<button type="button" class="es-stub__pull"')
    expect(html).toContain('Reload page')
  })
})

describe('prose is drawn from tokens, never from markup', () => {
  test('text that looks like HTML is text', () => {
    const html = drawn(paragraph(text('<img src=x onerror=alert(1)> and <script>alert(2)</script> & "quotes"')))
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt; &amp; &quot;quotes&quot;')
  })

  test('code, in a span or a block, is text too', () => {
    const html = drawn(paragraph({ type: 'code', text: '<b>x</b>' }), { type: 'code', lang: 'html', text: '<div onclick="x()"></div>' })
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<div onclick')
    expect(html).toContain('<code>&lt;b&gt;x&lt;/b&gt;</code>')
  })

  test('a link to another site opens in a new tab and says so; a route is the router\'s; an anchor is a plain jump', () => {
    const link = (href: string, label: string): ProseInline => ({ type: 'link', href, children: [text(label)] })
    const html = drawn(paragraph(link('https://docs.vllm.ai/', 'the docs'), text(' '), link('/map', 'the map'), text(' '), link('#why', 'why')))
    expect(html).toMatch(/<a href="https:\/\/docs\.vllm\.ai\/" class="es-link" target="_blank" rel="noreferrer noopener">the docs/)
    expect(html).toContain('(opens in a new tab)')
    expect(html).toContain('<a class="es-link" href="/map" data-discover="true">the map</a>')
    expect(html).toContain('<a href="#why">why</a>')
  })

  test('a kernelspace lesson is a link out; a kernelspace KC is named and not linked', () => {
    const html = drawn(paragraph({ type: 'ks', ref: 'ks:T5.L7' }, text(' '), { type: 'ks', ref: 'ks:t5.kv-capacity' }))
    expect(html).toContain('<a href="https://kernelspace.naigap.com/lesson/t5.l7"')
    expect(html).toContain('<span class="es-ks">kernelspace t5.kv-capacity</span>')
  })

  test('lists keep their kind, their start and their nesting, and a lone paragraph is the item\'s own text', () => {
    const item = (...inline: ProseInline[]): ProseFlow[] => [paragraph(...inline)]
    const html = drawn({
      type: 'list',
      ordered: true,
      start: 3,
      items: [
        [paragraph(text('three')), { type: 'list', ordered: false, items: [item(text('nested'))] }],
        [paragraph(text('four')), paragraph(text('and more'))],
      ],
    })
    expect(html).toContain('<ol start="3">')
    expect(html).toContain('<li>three<ul><li>nested</li></ul></li>')
    expect(html).toContain('<li><p>four</p><p>and more</p></li>')
  })

  test('a table is a table in a group that keyboard users can scroll, with its alignment kept', () => {
    const html = drawn({
      type: 'table',
      align: ['left', 'right', null],
      head: [[text('Name')], [text('µs')], [text('Note')]],
      rows: [[[text('a')], [text('1')], [text('x')]]],
    })
    expect(html).toContain('<div class="es-table" role="group" tabindex="0" aria-label="Table: Name, µs, Note">')
    expect(html).toContain('<th scope="col" data-align="left">Name</th>')
    expect(html).toContain('<th scope="col" data-align="right">µs</th>')
    expect(html).toContain('<th scope="col">Note</th>')
    expect(html).toContain('<td data-align="right">1</td>')
  })

  test('a code block is a pre that can take the keyboard\'s focus, so that a long line can be scrolled', () => {
    expect(drawn({ type: 'code', lang: 'python', text: 'print(1)' })).toBe('<pre tabindex="0" data-lang="python"><code>print(1)</code></pre>')
    expect(drawn({ type: 'code', text: 'plain' })).toBe('<pre tabindex="0"><code>plain</code></pre>')
  })

  test('a heading is an h2, h3 or h4 with the id a link to it needs', () => {
    const heading = (depth: 2 | 3 | 4, label: string): ProseFlow => ({ type: 'heading', depth, children: [text(label)] })
    const html = drawn(heading(2, 'Why'), heading(3, 'Why'), heading(4, 'How it fits'))
    expect(html).toBe('<h2 id="why">Why</h2><h3 id="why-2">Why</h3><h4 id="how-it-fits">How it fits</h4>')
  })

  test('emphasis, strength and a tag nest inside a line', () => {
    const html = drawn(paragraph({ type: 'em', children: [{ type: 'strong', children: [text('both')] }] }, text(' a number '), { type: 'tag', tag: 'unverified' }))
    expect(html).toContain('<em><strong>both</strong></em>')
    expect(html).toContain('class="es-tag" data-tag="unverified"')
  })
})

describe('the blocks, one at a time', () => {
  test('prose breaks into a ticket for each ## section, and the first has no title when the prose opens before a heading', () => {
    const heading = (label: string): ProseFlow => ({ type: 'heading', depth: 2, children: [text(label)] })
    const html = drawnBlocks(prose(paragraph(text('Opening.')), heading('One'), paragraph(text('Body.')), heading('Two')))
    expect(opening(html, 'section').length).toBe(3)
    expect(html).toContain('<h2 class="es-ticket__title">One</h2>')
    expect(html).toContain('<h2 class="es-ticket__title">Two</h2>')
    expect(html.match(/<h2/g)?.length).toBe(2)
    expect(opening(html, 'section').map((tag) => attribute(tag, 'id'))).toEqual([undefined, 'one', 'two'])
  })

  // A prediction's code loads with the page that draws one (Blocks.tsx), so these draw the guess itself.
  const guess = (block: Extract<CompiledBlock, { type: 'predict' }>) => render(h(PredictTicket, { block, scope: 'tr9.l1', at: 0, blocks: [block] }))

  test('a prediction with choices lists them as a question to hold when nothing answers it, and one with no tolerance says it needs the exact value', () => {
    const choice = guess({
      type: 'predict',
      id: 'tr2.l1.p9',
      prompt: 'Which?',
      answer: { kind: 'choice', options: [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }] },
      reveal: 'after-game',
      kcs: ['tr2.bubble'],
    })
    expect(choice).toContain('<ol class="es-guess__options"><li>First</li><li>Second</li></ol>')
    expect(choice).not.toContain('tr2.bubble')
    const exact = guess({ type: 'predict', id: 'tr2.l2.p1', prompt: 'How many?', answer: { kind: 'numeric', unit: 'tokens', rel_tol: 0 }, reveal: 'at-commit', kcs: ['tr2.bubble'] })
    expect(exact).toContain('Only the exact value counts as right.')
    expect(exact).toContain('in tokens')
  })

  test('a tolerance that is not a whole percent keeps its digits', () => {
    const html = guess({ type: 'predict', id: 'tr2.l2.p1', prompt: 'p', answer: { kind: 'numeric', unit: 'us', rel_tol: 0.125 }, reveal: 'at-commit', kcs: ['tr2.bubble'] })
    expect(html).toContain('Within 12.5% of the answer counts as right.')
  })

  test('a game block of a game that is built waits for the learner: its display name, its level and its mode, and the stub that starts it (W1b-T01)', () => {
    const block: CompiledBlock = { type: 'game', id: 'pool', level: 'evict', mode: 'graded' }
    const html = drawnBlocks(block)
    expect(placeholders(html)).toEqual({})
    const ticket = opening(html, 'section').find((tag) => attribute(tag, 'data-block') === 'game') ?? ''
    expect([attribute(ticket, 'data-play'), attribute(ticket, 'data-mode'), attribute(ticket, 'data-phase')]).toEqual(['pool/evict', 'graded', 'waiting'])
    // D-063: the title over its rule in one line, from the roster, which costs the lesson's first paint none of the game's code.
    expect(html).toContain('<strong>KV page pool</strong> · One page pool serves every KV group and every adapter.')
    for (const fact of ['level · evict', 'graded']) expect(html).toContain(fact)
    expect(html).toContain('Graded: new numbers drawn when you start, and no undo.')
    // The stub is live, and the way to every level is the game's own page.
    expect(html).toMatch(/<button type="button" class="es-stub__pull"><span class="es-stub__label">Start level<\/span>/)
    expect(html).not.toMatch(/<button type="button" class="es-stub__pull"[^>]*disabled=""/)
    expect(html).toContain('href="/play/pool?level=evict"')
    // Nothing of the game is drawn until the learner starts it.
    expect(html).not.toContain('data-game=')
    expect(drawnBlocks({ type: 'game', id: 'loop', level: 'async', mode: 'practice' })).toContain('Practice, on the level’s own numbers, with undo.')
  })

  test('a game block of a game that no task has built yet names its open task and holds its stub down, and a name that is no game names no task', () => {
    const game = (id: string): CompiledBlock => ({ type: 'game', id, level: 'yard', mode: 'graded' })
    const waiting = drawnBlocks(game('switchyard'))
    expect(placeholders(waiting)).toEqual({ game: 'W2-T30' })
    expect(waiting).toContain('Not built yet: the game')
    expect(waiting).toContain('<strong>KV offload</strong>')
    expect(waiting).toMatch(/<button type="button" class="es-stub__pull"[^>]*disabled=""/)
    for (const id of ['not-a-game', 'constructor']) {
      const none = drawnBlocks(game(id))
      expect(placeholders(none)).toEqual({})
      expect(none).toContain(`No game is called ${id}.`)
      expect(none).not.toContain('es-stub')
    }
  })

  test('a trace with no seed is a pinned trace, and one with a seed is labelled synthetic', () => {
    const pinned = drawnBlocks({ type: 'trace', id: 'night-1', tasks: ['gap', 'cause'] })
    expect(pinned).toContain('>pinned<')
    expect(pinned).not.toContain('synthetic')
    expect(pinned).toContain('task · cause')
    expect(drawnBlocks({ type: 'trace', id: 'loop-off', seed: 7, tasks: ['gap'] })).toContain('>synthetic<')
  })

  test('a forge lab that is built prints no placeholder, a GPU lab names its own open task, and both link to the lab page', () => {
    const lab = (id: string, lane: 'B' | 'L' | 'F'): CompiledBlock => ({ type: 'lab', id, lane, stages: ['s1', 's2'] })
    // A forge lab that is built (W1-T22) leads to a page that works, so its ticket prints no placeholder: the link is live and says nothing is missing.
    const forge = drawnBlocks(lab('hybrid-kv', 'B'))
    expect(placeholders(forge)).toEqual({})
    expect(forge).not.toContain('Not built yet')
    expect(forge).toContain('lane · B browser')
    expect(forge).toContain('href="/labs/hybrid-kv"')
    expect(placeholders(drawnBlocks(lab('rejection-sampler', 'B')))).toEqual({})
    expect(placeholders(drawnBlocks(lab('tr0.forward', 'L')))).toEqual({ lab: 'W2-T16' })
    expect(drawnBlocks(lab('tr8.replay', 'F'))).toContain('stage · s2')
  })

  test('cards: a warning and an isomorphism are drawn in full, a notional-machine card is printed when it loads, and the other cards kept in their own files wait for their tasks', () => {
    const iso = drawnBlocks({ type: 'card', kind: 'isomorphism', title: 'A queue', body: 'A ring buffer is a queue.', breaks: 'Eviction has no ring.' })
    expect(iso).toContain('<h2 class="es-ticket__title">A queue</h2>')
    expect(iso).toContain('where it breaks')
    expect(iso).toContain('Eviction has no ring.')
    expect(placeholders(iso)).toEqual({})
    // No title falls back to the kind's name.
    expect(drawnBlocks({ type: 'card', kind: 'warning', body: 'Careful.' })).toContain('<h2 class="es-ticket__title">Warning</h2>')
    const kept = (kind: 'notional-machine' | 'in-production' | 'build-this' | 'change') => placeholders(drawnBlocks({ type: 'card', kind, id: 'trace-room-steploop' }))
    // A notional-machine card is no placeholder: it prints while it loads, and the next test draws it once it has.
    expect(kept('notional-machine')).toEqual({})
    expect(kept('in-production')).toEqual({ card: 'W2-T42' })
    expect(kept('build-this')).toEqual({ card: 'W2-T42' })
    expect(kept('change')).toEqual({ card: 'W3-T06' })
  })

  test('an item block of a family that is built waits for the learner: its count, its level and its stub, and no seed yet', () => {
    const html = drawnBlocks({ type: 'item', family: 'tr2.bubble-width', level: 1, count: 5 })
    expect(html).toContain('<span class="es-ticket-line__qty">5x</span>')
    expect(html).toContain('data-family="tr2.bubble-width"')
    expect(html).toContain('faded')
    expect(html).toContain('data-phase="idle"')
    expect(html).toContain('Start questions')
    expect(html).not.toContain('data-seed')
    expect(placeholders(html)).toEqual({})
  })

  test('an item block of a family that is not published yet says so, and holds its button down', () => {
    // A family that a lesson names and nobody has built is the case, and none of TR2's is one now: the id is one no lesson names.
    const html = drawnBlocks({ type: 'item', family: 'tr2.no-such-family', level: 1, count: 5 })
    expect(html).toContain('data-phase="unbuilt"')
    expect(html).toContain('These questions are not published yet.')
    expect(html).toMatch(/<button type="button" class="es-stub__pull"[^>]*disabled=""/)
  })

  test('an item block at a level its family does not offer says which levels it does', () => {
    const html = drawnBlocks({ type: 'item', family: 'tr2.bubble-width', level: 0, count: 3 })
    expect(html).toContain('data-phase="idle"')
    expect(drawnBlocks({ type: 'item', family: 'tr2.bubble-width', level: 3, count: 3 })).toContain('data-phase="idle"')
  })

  test('no blocks, no tickets', () => {
    expect(drawnBlocks()).toBe('')
  })
})

describe('a notional-machine card (W1-T07)', () => {
  const fixture = compile({ 'content/cards/fixture-world.md': sampleCard() })
  const card = JSON.parse(output(fixture, 'src/content/generated/cards/fixture-world.json')) as CompiledCard
  const env = renderEnv([], claims, TODAY)
  const html = render(h(NotionalMachineView, { card, env, scope: 'tr2.l1' }))

  test('is one ticket, titled by its kind, with the card\'s id on its foot line and no placeholder', () => {
    const tickets = opening(html, 'section')
    expect(tickets.length).toBe(1)
    expect(attribute(tickets[0], 'data-block')).toBe('card')
    expect(attribute(tickets[0], 'data-kind')).toBe('notional-machine')
    expect(attribute(tickets[0], 'data-placeholder')).toBeUndefined()
    expect(html).toContain('<h2 class="es-ticket__title">Notional machine</h2>')
    // The title leads the paper: no head line over it, and the lesson's id and the card's on the foot line.
    expect(html).not.toContain('es-ticket__head')
    expect(html).toContain('<div class="es-ticket__foot"><span><span aria-hidden="true">tr2.l1</span></span><span>fixture-world</span></div>')
  })

  test('prints the card\'s name and its few words, then its three parts under tape, in order, one level under the ticket\'s title', () => {
    expect(html).toContain('<p class="es-c-card__name">A fixture world</p>')
    expect(html).toContain('<p>A world for a test.</p>')
    expect(levels(html)).toEqual([2, 3, 3, 3])
    const parts = [...html.matchAll(/<h3 class="es-c-part" data-part="(\w+)"><span class="es-tape"[^>]*><span class="es-tape__text">([^<]+)<\/span><\/span><\/h3>/g)].map((match) => [match[1], match[2]])
    expect(parts).toEqual([
      ['models', 'Models'],
      ['ignores', 'Ignores'],
      ['calibrated', 'Calibrated against'],
    ])
    const at = (word: string) => html.indexOf(word)
    expect(at('Models')).toBeLessThan(at('The CPU&#x27;s work'))
    expect(at('The CPU&#x27;s work')).toBeLessThan(at('Ignores'))
    expect(at('Ignores')).toBeLessThan(at('Everything else.'))
    expect(at('Everything else.')).toBeLessThan(at('Calibrated against'))
    expect(at('Calibrated against')).toBeLessThan(at('Nothing yet.'))
  })

  test('draws each claim a rule cites as a chip with its source, so no rule is a bare assertion', () => {
    expect(html).toContain('data-claim="sample.world.host-step-us"')
    expect(html).toContain('verified <time dateTime="2026-11-04">2026-11-04</time>')
    expect(html).not.toContain('no such claim')
    expect(html).not.toContain('the claims did not load')
  })

  test('says which world it is and where it stands, on tape', () => {
    expect(html).toContain('world · fixture')
    expect(html).toContain('status · draft')
  })

  test('a claim the page could not load is named, and says so', () => {
    const lost = render(h(NotionalMachineView, { card, env: renderEnv([], null, TODAY), scope: 'tr2.l1' }))
    expect(lost).toContain('data-state="unavailable"')
    expect(lost).toContain('the claims did not load')
  })

  test('while the card loads, its block is a ticket that is still printing, with the same title and head line', () => {
    const loading = drawnBlocks({ type: 'card', kind: 'notional-machine', id: 'fixture-world' })
    expect(loading).toContain('data-state="loading"')
    expect(loading).toContain('aria-busy="true"')
    expect(loading).toContain('Printing the card')
    expect(loading).toContain('<h2 class="es-ticket__title">Notional machine</h2>')
    expect(loading).toContain('fixture-world</span></div>')
    expect(placeholders(loading)).toEqual({})
  })

  test('the card parts the page prints are the parts the schema names, in its order', async () => {
    const { CARD_PARTS } = await import('@es/schema')
    const printed = [...html.matchAll(/data-part="\w+"><span class="es-tape"[^>]*><span class="es-tape__text">([^<]+)</g)].map((match) => match[1])
    expect(printed).toEqual([...CARD_PARTS])
  })
})
