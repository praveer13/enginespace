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

describe('/m/tr2/l0-sample', () => {
  const html = render(h(LessonView, { lesson, module: entry('tr2'), claims, today: TODAY }), '/m/tr2/l0-sample')

  test('the sample lesson uses all eight block types, so the page has something of each to draw', () => {
    const used = new Set(lesson.blocks.map((block) => block.type))
    expect([...used].sort()).toEqual([...BLOCK_TYPES].sort())
  })

  test('draws every block type', () => {
    const drawnTypes = new Set([...html.matchAll(/data-block="([a-z]+)"/g)].map((match) => match[1]))
    for (const type of BLOCK_TYPES) expect(drawnTypes).toContain(type)
  })

  test('draws a ticket for each block, with a head line that names the lesson, and a section\'s heading as its stamped title', () => {
    const tickets = opening(html, 'section').filter((tag) => attribute(tag, 'data-block') !== undefined)
    // Two prose blocks (one of them in two tickets), the seven other blocks (the sample has two cards), and the closing ticket.
    expect(tickets.length).toBe(12)
    for (const tag of tickets) expect(tag).toContain('class="es-ticket es-c-block"')
    // The lesson's id is on every head line for the eye, and hidden from assistive tech, which has the page's name once.
    expect(html.match(/<div class="es-ticket__head"><span><span aria-hidden="true">tr2\.l0<\/span><\/span>/g)?.length).toBe(12)
    expect(html).toContain('<h2 class="es-ticket__title">The bubble</h2>')
  })

  test('a block whose feature is not built yet says which task builds it, and holds its action down', () => {
    expect(placeholders(html)).toEqual({ predict: 'W1-T13', game: 'W1-T13', trace: 'W1-T09', lab: 'W2-T23' })
    for (const [what, task] of [
      ['the prediction box', 'W1-T13'],
      ['the game', 'W1-T13'],
      ['the trace viewer', 'W1-T09'],
      ['the lab', 'W2-T23'],
    ]) {
      expect(html).toContain(`Not built yet: ${what}`)
      expect(html).toContain(`<span class="es-ticket-line__note">${task}</span>`)
    }
    // The prediction, the game and the trace each have a stub that is held down. The lab's stub is a link, and the item set is built.
    expect(html.match(/<button type="button" class="es-stub__pull"[^>]*disabled=""/g)?.length).toBe(3)
    expect(html).toContain('href="/labs/tr3.profile"')
  })

  test('a block that is complete carries no placeholder: prose, the item set, the two cards (the warning, and the notional-machine card that prints while it loads) and the figure', () => {
    const complete = opening(html, 'section').filter((tag) => ['prose', 'item', 'card', 'figure'].includes(attribute(tag, 'data-block') ?? ''))
    expect(complete.length).toBe(7)
    for (const tag of complete) expect(tag).not.toContain('data-placeholder')
  })

  test('the predict block prints its prompt, the shape of its answer, its tolerance as a tagged number and its KCs', () => {
    expect(html).toContain('With async scheduling on, how many µs of the CPU&#x27;s per-step work stay on the critical path?')
    for (const fact of ['answer · numeric', 'unit · µs', 'reveal · after-game', 'tr2.async-overlap']) expect(html).toContain(fact)
    expect(html).toContain('<data class="es-readout__value" value="15">15%</data><span class="es-readout__tag" data-tag="estimated">estimated</span>')
  })

  test('the item, game, trace and lab blocks print what they are told', () => {
    expect(html).toContain('3x')
    expect(html).toContain('tr2.bubble-width')
    for (const fact of ['level · async', 'practice', 'synthetic', 'seed · 7', 'task · gap', 'lane · F GPU', 'stage · s1']) expect(html).toContain(fact)
  })

  test('the warning card and the figure are drawn in full', () => {
    expect(html).toContain('<h2 class="es-ticket__title">A model</h2>')
    expect(html).toContain('The browser world is a model, and the real engine is the judge.')
    expect(html).toMatch(/<img src="\/figures\/tr2\/l0-sample\.svg" alt="Two steps on a CPU lane and a GPU lane"[^>]*>/)
    expect(html).toContain('<figcaption>The CPU lane prepares a step, then the next one.')
  })

  test('draws the prose: its table, its code block, its list and its inline code', () => {
    expect(html).toContain('<th scope="col"')
    expect(html).toContain('<pre tabindex="0" data-lang="text"><code>schedule -&gt; launch -&gt; sample -&gt; update</code></pre>')
    expect(html).toContain('<li>how much of the host step the scheduler can move off the critical path;</li>')
    expect(html).toContain('<code>engine step</code>')
    expect(html).toContain('<strong>critical path</strong>')
  })

  test('draws the claims as chips with their sources, and the four tags as tape', () => {
    for (const id of ['sample.world.host-step-us', 'sample.world.decode-step-us', 'vllm.release.requires-python']) expect(html).toContain(`data-claim="${id}"`)
    expect([...html.matchAll(/class="es-tag" data-tag="(\w+)"/g)].map((match) => match[1])).toEqual(['estimated', 'estimated', 'unverified', 'measured', 'estimated'])
    // A screen reader hears a tag as "tagged estimated", so that it reads as the tag of the number before it.
    expect(html).toContain('<span class="es-tape__text"><span class="sr-only">tagged </span>estimated</span>')
    expect(html).toContain('vllm 0.33.0 on PyPI (JSON API)')
    expect(html).toContain('verified <time dateTime="2026-11-04">2026-11-04</time>')
    // Two of the three claims are the course's own synthetic world, and say so on the number.
    expect(html.match(/data-tag="synthetic">synthetic</g)?.length).toBe(2)
  })

  test('links: a kernelspace lesson goes out to kernelspace, a route is the router\'s, and the page says where the module is', () => {
    expect(html).toContain('href="https://kernelspace.naigap.com/lesson/t5.l7"')
    expect(html).toContain('<a class="es-link" href="/map" data-discover="true">the course map</a>')
    expect(html).toContain('<a class="es-link" href="/m/tr2" data-discover="true">tr2: The step loop</a>')
  })

  test('the facts of the lesson are the printer\'s tape: its module, minutes, status, lanes and what it builds on', () => {
    const tape = /<figure class="es-printer"[^>]*aria-label="About this lesson">[\s\S]*?<\/figure>/.exec(html)?.[0] ?? ''
    expect(tape).not.toBe('')
    for (const line of ['<dt>module</dt>', '<dt>minutes</dt>', '<dt>status</dt>', '<dt>lanes</dt>', '<dt>builds on</dt>']) expect(tape).toContain(line)
    // The minutes are an estimate, and say so.
    expect(tape).toContain('<data class="es-readout__value" value="45">45</data><span class="es-readout__tag" data-tag="estimated">estimated</span>')
    expect(tape).toContain('<dd>browser, GPU</dd>')
    expect(tape).toContain('kernelspace T5.L7')
    expect(tape).toContain('kernelspace T0.L6')
    // A draft lesson is flagged in the second ink.
    expect(tape).toContain('<div class="es-printer__line" data-tone="ink-2"><dt>status</dt><dd>draft</dd>')
  })

  test('headings form a valid outline: one h1, and no level skipped on the way down', () => {
    const found = levels(html)
    expect(found[0]).toBe(1)
    expect(found.filter((level) => level === 1).length).toBe(1)
    found.forEach((level, at) => {
      if (at > 0) expect(level).toBeLessThanOrEqual(found[at - 1] + 1)
    })
    expect(found).toContain(3)
  })

  test('ids are unique, and a section\'s ticket carries the id a link to its heading needs', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('the-bubble')
  })

  test('is built from the design system: every class on the page is one of its own, and the page is tickets, tape and a printer', () => {
    const classes = new Set([...html.matchAll(/\sclass="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)))
    const strangers = [...classes].filter((name) => !/^(es-|sr-only$)/.test(name))
    expect(strangers).toEqual([])
    for (const part of ['es-ticket', 'es-tape', 'es-printer', 'es-stub', 'es-readout', 'es-ticket-line']) expect(classes).toContain(part)
  })

  test('the lesson\'s revision is on the page, for the evidence that will be graded against it', () => {
    expect(html).toContain(`data-rev="${lesson.rev}"`)
  })

  test('closes with what the lesson teaches and the way on: a stub to the module, as it is the module\'s only lesson', () => {
    expect(html).toContain('<h2 class="es-ticket__title">Next</h2>')
    for (const kc of lesson.kcs) expect(html).toContain(kc)
    expect(html).toMatch(/<a class="es-stub__pull" href="\/m\/tr2"[^>]*>[\s\S]*?To the module/)
  })

  test('with lessons on either side, the closing ticket points to both, and its stub opens the next', () => {
    const own = entry('tr2')
    if (own === undefined) throw new Error('the sample module is not in the index')
    const around = {
      ...own,
      lessons: [
        { id: 'tr2.l_', slug: 'l_-before', title: 'The lesson before', route: '/m/tr2/l_-before', minutes: 10, status: 'draft' as const },
        ...own.lessons,
        { id: 'tr2.l9', slug: 'l9-after', title: 'The lesson after', route: '/m/tr2/l9-after', minutes: 10, status: 'draft' as const },
      ],
    }
    const html = render(h(LessonView, { lesson, module: around, claims, today: TODAY }))
    expect(html).toMatch(/<a class="es-stub__pull" href="\/m\/tr2\/l9-after"[^>]*>[\s\S]*?Next lesson/)
    expect(html).toContain('Next: <a class="es-link" href="/m/tr2/l9-after" data-discover="true">The lesson after</a>')
    expect(html).toContain('Before this: <a class="es-link" href="/m/tr2/l_-before" data-discover="true">The lesson before</a>')
    expect(html).not.toContain('To the module')
  })

  test('when the claims did not load the page still stands, and each chip names its claim and says so', () => {
    const without = render(h(LessonView, { lesson, module: entry('tr2'), claims: null, today: TODAY }))
    expect(without.match(/data-state="unavailable"/g)?.length).toBe(3)
    expect(without.match(/the claims did not load/g)?.length).toBe(3)
    expect(without).toContain('<h2 class="es-ticket__title">Predict</h2>')
  })

  test('a lesson drawn without its module\'s index entry falls back to the ids', () => {
    const alone = render(h(LessonView, { lesson, claims, today: TODAY }))
    expect(alone).toContain('<a class="es-link" href="/m/tr2" data-discover="true">tr2</a>')
    expect(alone).toMatch(/<a class="es-stub__pull" href="\/m\/tr2"/)
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

  test('draws the module\'s own words as tickets, then what you will be able to do, then its lessons, then its artifacts', () => {
    const order = ['data-block="prose"', 'data-block="outcomes"', 'class="es-doc__lessons"', 'data-block="artifacts"'].map((marker) => html.indexOf(marker))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    for (const outcome of module.outcomes) expect(html).toContain(outcome)
    for (const artifact of module.artifacts) {
      expect(html).toContain(artifact.title)
      expect(html).toContain(`<code>${artifact.id}</code>`)
    }
  })

  test('lists each lesson as a ticket with a stub that opens it, and the lesson\'s minutes as a tagged estimate', () => {
    expect(html).toContain('<h3 class="es-ticket__title">A sample lesson that uses every block</h3>')
    expect(html).toMatch(/<a class="es-stub__pull" href="\/m\/tr2\/l0-sample"[^>]*>[\s\S]*?Open lesson/)
    expect(html).toContain('<data class="es-readout__value" value="45">45</data><span class="es-readout__tag" data-tag="estimated">estimated</span>')
  })

  test('puts the hours, by lane, on the printer\'s tape as estimates, with the status, what to read first, the pins and the games', () => {
    const tape = /<figure class="es-printer"[^>]*aria-label="About this module">[\s\S]*?<\/figure>/.exec(html)?.[0] ?? ''
    expect(tape).toContain('<dt>hours</dt><dd><span class="es-readout" data-size="sm" data-tone="ink"><data class="es-readout__value" value="10">10</data><span class="es-readout__tag" data-tag="estimated">estimated</span>')
    expect(tape).toContain('<dt>browser (B)</dt>')
    expect(tape).toContain('<dt>status</dt><dd>draft</dd>')
    for (const ref of ['kernelspace T5.L7', 'kernelspace T0.L6', 'kernelspace T4.L3']) expect(tape).toContain(ref)
    expect(tape).toContain('<dt>pins</dt><dd>vllm, sglang</dd>')
    expect(tape).toContain('href="/play/loop"')
  })

  test('is built from the design system alone', () => {
    const classes = new Set([...html.matchAll(/\sclass="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)))
    expect([...classes].filter((name) => !/^(es-|sr-only$)/.test(name))).toEqual([])
  })

  test('a module that is only planned shows what the index knows of it, and says nobody has written it', () => {
    const planned = render(h(ModuleView, { id: 'tr0', module: null, entry: entry('tr0'), claims: null, today: TODAY }), '/m/tr0')
    expect(planned).toContain('<h1 class="es-doc__title">PyTorch for the Rust-first, and reading Triton</h1>')
    expect(planned).toContain('Planned: not written yet.')
    expect(planned).toContain('No lessons yet.')
    expect(planned).toContain('<dt>status</dt><dd>planned</dd>')
    expect(planned).toContain('<dt>laptop (L)</dt>')
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

  test('a prediction with choices lists them, and one with no tolerance says it needs the exact value', () => {
    const choice = drawnBlocks({
      type: 'predict',
      id: 'tr2.l1.p1',
      prompt: 'Which?',
      answer: { kind: 'choice', options: [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }] },
      reveal: 'after-game',
      kcs: ['tr2.bubble'],
    })
    expect(choice).toContain('<ol class="es-c-options"><li>First</li><li>Second</li></ol>')
    expect(choice).toContain('answer · choice')
    expect(choice).not.toContain('unit ·')
    expect(choice).not.toContain('tolerance')
    const exact = drawnBlocks({
      type: 'predict',
      id: 'tr2.l1.p2',
      prompt: 'How many?',
      answer: { kind: 'numeric', unit: 'tokens', rel_tol: 0 },
      reveal: 'after-game',
      kcs: ['tr2.bubble'],
    })
    expect(exact).toContain('tolerance: the exact value')
    expect(exact).toContain('unit · tokens')
    const interval = drawnBlocks({ type: 'predict', id: 'tr2.l1.p3', prompt: 'Between?', answer: { kind: 'interval', unit: 'ms' }, reveal: 'after-game', kcs: ['tr2.bubble'] })
    expect(interval).toContain('answer · interval')
    expect(interval).toContain('unit · ms')
  })

  test('a tolerance that is not a whole percent keeps its digits', () => {
    const html = drawnBlocks({ type: 'predict', id: 'tr2.l1.p4', prompt: 'p', answer: { kind: 'numeric', unit: 'us', rel_tol: 0.125 }, reveal: 'after-game', kcs: ['tr2.bubble'] })
    expect(html).toContain('<data class="es-readout__value" value="12.5">12.5%</data>')
  })

  test('a game block names its task by the game, and a game the roster does not list falls back to the framework', () => {
    const game = (id: string): CompiledBlock => ({ type: 'game', id, level: 'sizes', mode: 'graded' })
    expect(placeholders(drawnBlocks(game('pool')))).toEqual({ game: 'W1-T23' })
    expect(placeholders(drawnBlocks(game('not-a-game')))).toEqual({ game: 'W0-T14' })
    expect(drawnBlocks(game('pool'))).toContain('graded')
  })

  test('a trace with no seed is a pinned trace, and one with a seed is labelled synthetic', () => {
    const pinned = drawnBlocks({ type: 'trace', id: 'night-1', tasks: ['gap', 'cause'] })
    expect(pinned).toContain('>pinned<')
    expect(pinned).not.toContain('synthetic')
    expect(pinned).toContain('task · cause')
    expect(drawnBlocks({ type: 'trace', id: 'loop-off', seed: 7, tasks: ['gap'] })).toContain('>synthetic<')
  })

  test('a forge lab and a GPU lab each name their own lab\'s task, and both link to the lab page', () => {
    const lab = (id: string, lane: 'B' | 'L' | 'F'): CompiledBlock => ({ type: 'lab', id, lane, stages: ['s1', 's2'] })
    const forge = drawnBlocks(lab('hybrid-kv', 'B'))
    expect(placeholders(forge)).toEqual({ lab: 'W1-T22' })
    expect(forge).toContain('lane · B browser')
    expect(forge).toContain('href="/labs/hybrid-kv"')
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
    expect(kept('in-production')).toEqual({ card: 'W1-T13' })
    expect(kept('build-this')).toEqual({ card: 'W1-T13' })
    expect(kept('change')).toEqual({ card: 'W3-T06' })
  })

  test('an item block of a family that is built waits for the learner: its count, its level and its stub, and no seed yet', () => {
    const html = drawnBlocks({ type: 'item', family: 'tr2.bubble-width', level: 1, count: 5 })
    expect(html).toContain('<span class="es-ticket-line__qty">5x</span>')
    expect(html).toContain('tr2.bubble-width')
    expect(html).toContain('level 1')
    expect(html).toContain('data-phase="idle"')
    expect(html).toContain('Start items')
    expect(html).not.toContain('data-seed')
    expect(placeholders(html)).toEqual({})
  })

  test('an item block of a family that no task has built yet says so, and holds its stub down', () => {
    const html = drawnBlocks({ type: 'item', family: 'tr2.graph-hit', level: 1, count: 5 })
    expect(html).toContain('data-phase="unbuilt"')
    expect(html).toContain('Not built yet: the generator for tr2.graph-hit')
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

  test('is one ticket, titled by its kind, with the card\'s id on its head line and no placeholder', () => {
    const tickets = opening(html, 'section')
    expect(tickets.length).toBe(1)
    expect(attribute(tickets[0], 'data-block')).toBe('card')
    expect(attribute(tickets[0], 'data-kind')).toBe('notional-machine')
    expect(attribute(tickets[0], 'data-placeholder')).toBeUndefined()
    expect(html).toContain('<h2 class="es-ticket__title">Notional machine</h2>')
    expect(html).toContain('<div class="es-ticket__head"><span><span aria-hidden="true">tr2.l1</span></span><span>fixture-world</span></div>')
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
