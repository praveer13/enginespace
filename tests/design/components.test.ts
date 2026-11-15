/*
 * The components' states, as markup: each state is a real element state (disabled, busy, invalid, current, checked)
 * that assistive tech reads, not only a look. Rendered on the server inside a router at a fixed URL.
 */
import { describe, expect, test } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { Bell } from '@/design/components/Bell'
import { Board, MenuLink } from '@/design/components/Board'
import { Button } from '@/design/components/Button'
import { Callout } from '@/design/components/Callout'
import { DeltaChip } from '@/design/components/DeltaChip'
import { Field } from '@/design/components/Field'
import { GoalLine } from '@/design/components/GoalLine'
import { Legend } from '@/design/components/Legend'
import { LevelMenu } from '@/design/components/LevelMenu'
import { Marker } from '@/design/components/Marker'
import { NextStep } from '@/design/components/NextStep'
import { Note } from '@/design/components/Note'
import { NumberLine } from '@/design/components/NumberLine'
import { PartsList } from '@/design/components/PartsList'
import { Popover } from '@/design/components/Popover'
import { SectionRail } from '@/design/components/SectionRail'
import { Stamp, TAG_LEGEND, TagLegend, UNVERIFIED_MEANS } from '@/design/components/Stamp'
import { TitleBlock } from '@/design/components/TitleBlock'
import { Pan } from '@/design/components/Pan'
import { PrinterTape } from '@/design/components/PrinterTape'
import { Rail } from '@/design/components/Rail'
import { Readout } from '@/design/components/Readout'
import { StationLight } from '@/design/components/StationLight'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { Toggle } from '@/design/components/Toggle'
import { SLOT_MARKS, slotOf, type ColorRoleName, type Slot } from '@/design/tokens'

const render = (element: ReactElement, location = '/map') =>
  renderToString(createElement(StaticRouter, { location }, element)).replaceAll('<!-- -->', '')
const h = createElement

describe('Ticket', () => {
  test('a container ticket is an article with its head, stamped title and printed lines', () => {
    const html = render(h(Ticket, { head: 'No. 0042', meta: 'TBL 7', title: 'Fire the next step.' }, h(TicketLine, { qty: '2x', children: 'DECODE' })))
    expect(html).toMatch(/^<article class="es-ticket"/)
    expect(html).toContain('<h3 class="es-ticket__title">Fire the next step.</h3>')
    expect(html).toContain('data-hole="true"')
  })

  test('a ticket you pick up is a button of spans, disabled when the ticket is', () => {
    const html = render(h(Ticket, { as: 'button', head: 'No. 1', state: 'disabled' }, h(TicketLine, null, 'PREFILL')))
    expect(html).toMatch(/^<button class="es-ticket"[^>]*type="button"[^>]*disabled=""/)
    expect(html).not.toMatch(/<(div|h\d)[ >]/)
  })

  test('loading, error and empty say so in words', () => {
    expect(render(h(Ticket, { state: 'loading' }, 'x'))).toContain('aria-busy="true"')
    expect(render(h(Ticket, { state: 'loading' }, 'x'))).toContain('role="status"')
    expect(render(h(Ticket, { state: 'error', error: 'Paper out.' }, 'x'))).toMatch(/role="alert"[^>]*>.*Paper out\./s)
    expect(render(h(Ticket, { state: 'empty', empty: 'No tickets yet' }))).toContain('No tickets yet')
  })

  test('under the lamp is a state of its own', () => {
    expect(render(h(Ticket, { lamp: true }, 'x'))).toContain('data-lamp="true"')
  })
})

describe('Stub', () => {
  test('as a link it is the router’s link; as an action it is a button', () => {
    expect(render(h(Stub, { to: '/play/loop', children: 'Start service' }))).toContain('href="/play/loop"')
    expect(render(h(Stub, { onClick: () => undefined, children: 'Start service' }))).toContain('<button type="button" class="es-stub__pull"')
  })

  test('disabled, loading and error are element states', () => {
    expect(render(h(Stub, { disabled: true, children: 'Start service' }))).toContain('disabled=""')
    const loading = render(h(Stub, { loading: true, to: '/play/loop', children: 'Start service' }))
    expect(loading).toContain('aria-busy="true"')
    expect(loading).not.toContain('href=')
    const error = render(h(Stub, { error: 'The line did not answer.', onClick: () => undefined, children: 'Start service' }))
    const describedBy = /aria-describedby="([^"]+)"/.exec(error)?.[1]
    expect(describedBy).toBeTruthy()
    expect(error).toContain(`id="${describedBy}" role="alert"`)
  })
})

describe('Rail', () => {
  test('one clip per slot, and an empty clip says so in words', () => {
    const html = render(h(Rail, { clips: 4, label: 'The rail: 4 clips', tickets: [h(Ticket, { key: 'a' }, 'x')] }))
    expect(html).toContain('<ol class="es-rail__clips" aria-label="The rail: 4 clips">')
    expect([...html.matchAll(/<li class="es-rail__clip"/g)].length).toBe(4)
    expect([...html.matchAll(/clip paid for, empty/g)].length).toBe(3)
  })
})

describe('PrinterTape', () => {
  test('lines are a description list, announced politely when live', () => {
    const html = render(
      h(PrinterTape, {
        label: 'The printer',
        live: true,
        housing: h(MenuLink),
        lines: [{ id: 'clock', label: 'clock', value: h(Readout, { value: 7, unit: 'ticks', tag: 'synthetic' }) }],
      }),
    )
    expect(html).toContain('aria-live="polite"')
    expect(html).toMatch(/<dt>clock<\/dt><dd>.*synthetic/s)
    expect(html).toContain('href="/map"')
    expect(html).toContain('Open the menu')
  })

  test('loading, error and empty print a line', () => {
    expect(render(h(PrinterTape, { label: 'p', lines: [], state: 'loading' }))).toContain('role="status"')
    expect(render(h(PrinterTape, { label: 'p', lines: [], state: 'error', error: 'Paper jam.' }))).toContain('role="alert"')
    expect(render(h(PrinterTape, { label: 'p', lines: [], empty: 'No fires yet' }))).toContain('No fires yet')
  })
})

describe('Pan', () => {
  test('says its state in words, and is a button only when it can be picked', () => {
    const still = render(h(Pan, { state: 'cached', name: 'Pan 12', tape: '0x3f', station: 'green' }))
    expect(still).toMatch(/^<span class="es-pan"/)
    expect(still).toContain('Pan 12, cached: tape on, held by nobody')
    const button = render(h(Pan, { state: 'used', name: 'Pan 3', onSelect: () => undefined, disabled: true }))
    expect(button).toMatch(/^<button type="button" class="es-pan"[^>]*disabled=""/)
  })

  test('a bare pan carries no tape', () => {
    expect(render(h(Pan, { state: 'free', name: 'Pan 1', tape: 'x' }))).not.toContain('es-tape')
  })
})

describe('StationLight and Bell', () => {
  test('a station says busy or dark in words', () => {
    expect(render(h(StationLight, { lit: true, label: 'Station 1' }))).toContain('>busy<')
    expect(render(h(StationLight, { lit: false, label: 'Station 2' }))).toContain('>dark<')
    expect(render(h(StationLight, { lit: false, fault: true, label: 'Station 3' }))).toContain('>fault<')
  })

  test('a station names its lane with a category mark beside its name, lit or dark, and never in its lens', () => {
    for (const lit of [true, false]) {
      const html = render(h(StationLight, { lit, lane: 'gpu', label: 'The line' }))
      // The line is the GPU lane, and the GPU lane is the green board, whose glyph is a square.
      expect(html).toContain('data-glyph="square"')
      expect(html).toContain('color:var(--es-cat-green)')
      expect(html).toContain('data-lane="gpu"')
      expect(html).toMatch(/<span class="es-station__label"><svg[^>]*class="es-station__lane"[^>]*>.*<\/svg>The line<\/span>/)
      // The lens carries the state alone: no colour rides the element for it to burn in.
      expect(html).not.toContain('--es-station-light')
      expect(html).not.toContain('--es-lane-')
    }
    expect(render(h(StationLight, { lit: true, lane: 'cpu', label: 'The expo' }))).toContain('data-glyph="circle"')
  })

  test('every lane draws the mark of the slot that tokens.ts gives it', () => {
    for (const lane of ['cpu', 'gpu', 'sync', 'copy'] as const) {
      const slot = slotOf(`lane-${lane}` as ColorRoleName)
      expect(slot, lane).toBeDefined()
      const html = render(h(StationLight, { lit: true, lane, label: lane }))
      expect(html, lane).toContain(`data-glyph="${SLOT_MARKS[slot as Slot].glyph}"`)
      expect(html, lane).toContain(`color:var(--es-cat-${slot})`)
      expect(html, lane).toContain(`stroke="var(--es-cat-${slot}-edge)"`)
    }
  })

  test('a station with no lane has no mark', () => {
    const html = render(h(StationLight, { lit: true, label: 'Station 1' }))
    expect(html).not.toContain('es-station__lane')
    expect(html).not.toContain('data-glyph')
  })

  test('the bell is a named button when it fires the step, and its count is tagged', () => {
    const html = render(h(Bell, { step: 12, onRing: () => undefined }))
    expect(html).toContain('aria-label="Ring the bell: fire the next step"')
    expect(html).toContain('>0012<')
    expect(html).toContain('synthetic')
    expect(render(h(Bell, { step: 12 }))).not.toContain('<button')
    expect(render(h(Bell, { step: 12, onRing: () => undefined, disabled: true }))).toContain('disabled=""')
  })
})

describe('Button, TextLink, Toggle, Field and TapeLabel', () => {
  test('a button holds its label directly, and says when it is busy or has failed', () => {
    expect(render(h(Button, null, 'Reload'))).toContain('>Reload</button>')
    expect(render(h(Button, { loading: true }, 'Export'))).toContain('aria-busy="true"')
    expect(render(h(Button, { error: 'Not saved.' }, 'Export'))).toContain('role="alert"')
  })

  test('a link to another site opens in a new tab and says so', () => {
    const html = render(h(TextLink, { href: 'https://docs.vllm.ai/', children: 'the vLLM docs' }))
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
    expect(html).toContain('(opens in a new tab)')
    expect(render(h(TextLink, { to: '/m/tr3', disabled: true, children: 'TR3' }))).not.toContain('href=')
  })

  test('a link to a file of the site itself is a plain link in the same tab, with no external mark and no words about a new tab', () => {
    const html = render(h(TextLink, { file: '/third-party-licenses.txt', children: 'the licences' }))
    expect(html).toBe('<a href="/third-party-licenses.txt" class="es-link">the licences</a>')
    // It is not the router's link, which would answer a file's address with the not-found page, and it is not the other site's.
    for (const other of ['data-discover', 'target=', 'rel=', 'es-link__external', 'opens in a new tab', '<svg']) expect([other, html.includes(other)]).toEqual([other, false])
    // It keeps the link's class and forced state, and an unavailable one is still quiet text.
    expect(render(h(TextLink, { file: '/x.txt', className: 'extra', 'data-force': 'hover', children: 'x' }))).toBe('<a href="/x.txt" class="es-link extra" data-force="hover">x</a>')
    expect(render(h(TextLink, { file: '/x.txt', disabled: true, children: 'x' }))).not.toContain('href=')
  })

  test('a toggle is a switch named by its label', () => {
    const html = render(h(Toggle, { label: 'Overlap', defaultChecked: true, hint: 'overlap (async scheduling)' }))
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    const id = /role="switch"[^>]*id="([^"]+)"|id="([^"]+)"[^>]*role="switch"/.exec(html)
    const switchId = id?.[1] ?? id?.[2]
    expect(html).toContain(`for="${switchId}"`)
  })

  test('a field’s tape is its label, and an error marks it invalid and describes it', () => {
    const html = render(h(Field, { label: 'Your prediction', error: 'Enter a whole number of ticks.', numeric: true }))
    const inputId = /<input id="([^"]+)"/.exec(html)?.[1]
    expect(html).toContain(`<label class="es-tape es-field__label" data-tilt="left" data-size="md" for="${inputId}"`)
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain(`aria-describedby="${inputId}-error"`)
    expect(html).toContain(`id="${inputId}-error" role="alert"`)
  })

  test('a tape label with a station code draws the slot’s glyph', () => {
    expect(render(h(TapeLabel, { slot: 'yellow', children: 'cached' }))).toContain('data-glyph="diamond"')
  })
})

describe('Board', () => {
  test('the page you are on is marked current, and the nameplate links home', () => {
    const html = render(
      h(Board, {
        label: 'Primary',
        brand: { to: '/', label: 'enginespace' },
        links: [
          { to: '/map', label: 'Map' },
          { to: '/play', label: 'Play' },
        ],
      }),
      '/map',
    )
    expect(html).toMatch(/^<nav aria-label="Primary"/)
    expect(html).toMatch(/<a aria-current="page" class="es-board__link[^"]*" href="\/map"[^>]*>Map<\/a>/)
    expect(html).toMatch(/href="\/"[^>]*>enginespace<\/a>/)
    expect(html).not.toMatch(/aria-current="page"[^>]*href="\/play"/)
  })
})

/*
 * Wave R's components (REDESIGN 2.8, stage 1, R-T05). What a click, a key or a press outside does is checked in a browser, in
 * e2e/design-parts.spec.ts; these hold the markup each state is made of.
 */
describe('Popover', () => {
  test('a closed popover is its trigger alone: a real button that says it opens a dialog, and no sheet', () => {
    const html = render(h(Popover, { trigger: 'Parts', title: 'Parts of the KV page pool', children: h('p', null, 'Five parts.') }))
    expect(html).toMatch(/^<div class="es-pop" data-variant="button"><button type="button" class="es-pop__trigger" aria-expanded="false" aria-haspopup="dialog">Parts<\/button><\/div>$/)
    expect(html).not.toContain('role="dialog"')
  })

  test('an open popover is a dialog named by its title, controlled by its trigger, with a Close button', () => {
    const html = render(h(Popover, { trigger: 'page', title: 'page', defaultOpen: true, children: h('p', null, 'Holds the KV of a few tokens.') }))
    const panel = /aria-controls="([^"]+)"/.exec(html)?.[1]
    expect(panel).toBeTruthy()
    expect(html).toContain('aria-expanded="true"')
    expect(html).toMatch(new RegExp(`id="${panel}" role="dialog" aria-labelledby="([^"]+)"`))
    const title = new RegExp(`id="${panel}" role="dialog" aria-labelledby="([^"]+)"`).exec(html)?.[1]
    expect(html).toContain(`<span class="es-pop__title" id="${title}">page</span>`)
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('data-open="true"')
  })

  test('inside a paragraph it is phrasing content, and a disabled trigger is a disabled button', () => {
    const html = render(h(Popover, { inline: true, variant: 'mark', trigger: '1', triggerLabel: 'Source 1', title: 'Pages', defaultOpen: true, children: 'x' }))
    expect(html).toMatch(/^<span class="es-pop" data-variant="mark"/)
    expect(html).not.toMatch(/<div/)
    expect(html).toContain('aria-label="Source 1"')
    expect(render(h(Popover, { trigger: 'Parts', title: 'Parts', disabled: true, children: 'x' }))).toContain('disabled=""')
  })
})

describe('Stamp', () => {
  test('is a button with its word, which opens the tag legend: four lines, one per provenance word', () => {
    const closed = render(h(Stamp, { word: 'synthetic' }))
    expect(closed).toMatch(/<button type="button" class="es-pop__trigger" aria-expanded="false" aria-haspopup="dialog" data-word="synthetic"><span class="es-stamp__word">synthetic<\/span>/)
    const open = render(h(Stamp, { word: 'measured', source: '2026-11-03 at 8f8fbe1', defaultOpen: true }))
    expect(open).toContain('How numbers are tagged')
    const lines = [...open.matchAll(/<div class="es-taglegend__line"><dt><span class="es-stamp__word">([a-z]+)<\/span><\/dt><dd>([^<]+)<\/dd><\/div>/g)]
    expect(lines.map((line) => line[1])).toEqual(['measured', 'derived', 'estimated', 'synthetic'])
    expect(lines.map((line) => line[1])).toEqual(TAG_LEGEND.map((line) => line.word))
    expect(open).toContain('2026-11-03 at 8f8fbe1')
  })

  test('unverified says first what it means, in the alert ink, above the same four lines', () => {
    const html = render(h(Stamp, { word: 'unverified', defaultOpen: true }))
    expect(html).toContain('data-word="unverified"')
    expect(html).toContain(`<p class="es-stamp__lead" data-word="unverified"><strong>Unverified:</strong> ${UNVERIFIED_MEANS}</p>`)
    expect([...html.matchAll(/es-taglegend__line/g)]).toHaveLength(4)
  })

  test('the legend alone is the one About prints', () => {
    expect([...render(h(TagLegend)).matchAll(/<dt>/g)]).toHaveLength(4)
  })
})

describe('SectionRail', () => {
  const sections = [
    { id: 'run', title: 'Run', href: '#run', state: 'done', answers: ['you said 300 pages'] },
    { id: 'read', title: 'Read', href: '#read', parts: [{ id: 'p1', title: 'Two kinds of layer', href: '#p1', seen: true }, { id: 'p2', title: 'Two kinds of KV cache', href: '#p2', run: true }] },
    { id: 'test', title: 'Test', href: '#test', state: '1 of 3: not yet' },
    { id: 'keep', title: 'Keep', href: '#keep' },
  ]

  test('is a nav holding an ordered list, and the current entry alone carries aria-current="step" and the marker', () => {
    const html = render(h(SectionRail, { label: 'This lesson', sections, current: 'p2', minutesLeft: 40 }))
    expect(html).toMatch(/^<nav class="es-srail" aria-label="This lesson"><ol class="es-srail__list"/)
    expect([...html.matchAll(/aria-current="step"/g)]).toHaveLength(1)
    expect(html).toMatch(/<a href="#p2" class="es-srail__link" data-kind="part" aria-current="step">.*Run: .*Two kinds of KV cache.*<span class="es-marker es-srail__now" data-kind="mark">.*now<\/span><\/span><\/a>/s)
    expect([...html.matchAll(/class="es-marker[ "]/g)]).toHaveLength(1)
    expect(html).toContain('you said 300 pages')
    expect(html).toContain('<span class="sr-only">seen</span>')
    expect(html).toContain('About 40 min left')
    expect(html).not.toContain('disabled')
  })

  test('the strip is one button that says where you are, and opens the same list', () => {
    const closed = render(h(SectionRail, { label: 'This lesson', variant: 'strip', summary: 'Lesson 1 · Read 2 of 2', sections, current: 'p2' }))
    const list = /aria-controls="([^"]+)"/.exec(closed)?.[1]
    expect(closed).toContain('aria-expanded="false"')
    expect(closed).toContain(`<ol class="es-srail__list" id="${list}" hidden="">`)
    expect(closed).toContain('Lesson 1 · Read 2 of 2')
    expect(closed).toMatch(/data-at="before"[^>]*><\/span><span class="es-srail__segment" data-at="now"/)
    const open = render(h(SectionRail, { label: 'This lesson', variant: 'strip', summary: 'x', sections, current: 'p2', defaultOpen: true }))
    expect(open).toContain('aria-expanded="true"')
    expect(open).not.toContain('hidden=""')
  })
})

describe('LevelMenu', () => {
  const levels = [
    { id: 'one-group', title: 'One KV group', mode: 'practice' as const },
    { id: 'evict', title: 'Evict the right pages', mode: 'graded' as const },
    { id: 'manager', title: 'The whole manager', mode: 'graded' as const, unavailable: true },
  ]

  test('is one control, a select named Level, whose options say each level in words', () => {
    const html = render(h(LevelMenu, { levels, value: 'evict', onChange: () => undefined }))
    expect([...html.matchAll(/<select/g)]).toHaveLength(1)
    expect(html).not.toMatch(/<button/)
    const id = /<select id="([^"]+)"/.exec(html)?.[1]
    expect(html).toContain(`<label for="${id}" class="sr-only">Level</label>`)
    expect(html).toContain('<option value="one-group">Level 1 of 3 · One KV group · practice</option>')
    expect(html).toContain('<option value="evict" selected="">Level 2 of 3 · Evict the right pages · graded</option>')
    expect(html).toContain('<option value="manager" disabled="">Level 3 of 3 · The whole manager · not published yet</option>')
    // The face over the select prints the chosen level, with its kind kept apart from the title that a phone may cut.
    expect(html).toMatch(/<span class="es-level__face" aria-hidden="true"><span>Level 2 of 3 ·<\/span><span class="es-level__title">Evict the right pages<\/span><span class="es-level__mode">· graded<\/span><\/span>/)
  })

  test('disabled is the element state', () => {
    expect(render(h(LevelMenu, { levels, value: 'one-group', disabled: true }))).toMatch(/<select[^>]*disabled=""/)
  })
})

describe('Marker and Callout', () => {
  test('the marker is a shape and a word, whatever its kind', () => {
    for (const kind of ['mark', 'cursor', 'ring'] as const) {
      const html = render(h(Marker, { kind, children: kind === 'ring' ? h('button', null, 'Admit') : undefined }))
      expect(html, kind).toContain('<svg class="es-marker__shape"')
      expect(html, kind).toContain('<span class="es-marker__word">now</span>')
    }
    expect(render(h(Marker, { kind: 'ring', word: 'your first move', children: h('button', null, 'Admit') }))).toMatch(
      /<span class="es-marker__ring"><button>Admit<\/button><\/span>.*your first move/s,
    )
    expect(render(h(Marker, { kind: 'cursor', at: 0.25 }))).toContain('inset-inline-start:25%')
  })

  test('a callout is an ink disc with its numeral; selectable, it is a pressed-or-not button named by its part', () => {
    expect(render(h(Callout, { n: 2, name: 'page' }))).toBe('<span class="es-callout"><span class="es-callout__disc">2</span><span class="sr-only">: page</span></span>')
    const button = render(h(Callout, { n: 3, name: 'request', onSelect: () => undefined, selected: true }))
    expect(button).toMatch(/^<button type="button" class="es-callout"[^>]*aria-label="3: request" aria-pressed="true"/)
    expect(render(h(Callout, { n: 3, name: 'request', onSelect: () => undefined, disabled: true }))).toContain('disabled=""')
  })
})

describe('PartsList, Legend and Note', () => {
  const parts = [
    { id: 'pool', name: 'KV page pool', sentence: 'The memory for the KV cache.' },
    { id: 'blocks', name: 'num_gpu_blocks', code: true, sentence: 'How many pages.', isNew: true },
  ]

  test('the parts list is an ordered list by the callouts’ numerals, with each name, its sentence, and "new" in a word', () => {
    const html = render(h(PartsList, { label: 'Parts of the KV page pool', parts }))
    expect(html).toMatch(/^<ol class="es-parts" aria-label="Parts of the KV page pool">/)
    expect(html).toContain('<span class="es-callout__disc es-parts__n" aria-hidden="true">2</span>')
    expect(html).toContain('<code>num_gpu_blocks</code><span class="es-parts__new">new</span>')
    expect(html).not.toContain('<button')
  })

  test('selectable, each row is a button pressed when its part is selected; empty, it says so', () => {
    const html = render(h(PartsList, { label: 'Parts', parts, selected: 'blocks', onSelect: () => undefined }))
    expect([...html.matchAll(/<button type="button" class="es-parts__row"/g)]).toHaveLength(2)
    expect([...html.matchAll(/aria-pressed="true"/g)]).toHaveLength(1)
    expect(render(h(PartsList, { label: 'Parts', parts: [] }))).toContain('No parts are drawn on this level.')
  })

  test('a legend is the slot’s glyph in its colour and edge, and the word; with now, the marker ends it', () => {
    const html = render(h(Legend, { entries: [{ slot: 'yellow', word: 'a cached page' }], now: 'the current tick' }))
    expect(html).toContain('data-glyph="diamond"')
    expect(html).toContain('color:var(--es-cat-yellow)')
    expect(html).toContain('stroke="var(--es-cat-yellow-edge)"')
    expect(html).toContain('a cached page')
    expect(html).toMatch(/es-marker.*the current tick/s)
  })

  test('a note is headed by its kind in words, never a colour, and the analogy says where it breaks', () => {
    expect(render(h(Note, { kind: 'watch', children: 'x' }))).toMatch(/role="note".*data-icon="alert".*Watch out/s)
    expect(render(h(Note, { kind: 'in-engine', children: 'x' }))).toContain('In vLLM today')
    const same = render(h(Note, { kind: 'same-idea', children: 'x', breaks: 'Nothing is swapped.' }))
    expect(same).toContain('The same idea in the OS')
    expect(same).toContain('<strong>Where it breaks:</strong> Nothing is swapped.')
  })
})

describe('TitleBlock, GoalLine, DeltaChip, NumberLine and NextStep', () => {
  test('the title block is one line: the model, its clock, and what it leaves out behind a popover', () => {
    const html = render(h(TitleBlock, { model: 'Model of the KV page pool', clock: 'Clock: synthetic steps', leavesOut: h('p', null, 'The kernels.') }))
    expect(html).toContain('Model of the KV page pool')
    expect(html).toContain('Clock: synthetic steps')
    expect(html).toMatch(/<button[^>]*class="es-pop__trigger"[^>]*>What this model leaves out<\/button>/)
    expect(html).not.toContain('The kernels.')
  })

  test('the goal line says Goal, then its four parts in order; met, it says so with a check', () => {
    const html = render(h(GoalLine, { aim: 'A.', control: 'B.', target: 'C.', ends: 'D.' }))
    expect(html).toBe(
      '<p class="es-goal"><strong class="es-goal__lead">Goal:</strong> <span data-part="aim">A.</span> <span data-part="control">B.</span> <span data-part="target">C.</span> <span data-part="ends">D.</span></p>',
    )
    expect(render(h(GoalLine, { aim: 'A.', control: 'B.', target: 'C.', ends: 'D.', met: 'All 15 served.' }))).toMatch(/data-met="".*data-icon="check".*All 15 served\./s)
  })

  test('a delta always prints its sign, a true minus for a fall', () => {
    expect(render(h(DeltaChip, { value: 4, unit: 'tokens' }))).toContain('<span class="es-delta__value">+4</span><span class="es-delta__unit"> tokens</span>')
    expect(render(h(DeltaChip, { value: -2, unit: 'pages' }))).toContain('<span class="es-delta__value">−2</span>')
    expect(render(h(DeltaChip, { value: 3, unit: 'ticks', what: 'idle', hold: true }))).toMatch(/data-hold="".*idle.*\+3/s)
  })

  test('the number line lists each pin with its kind, its word and its value, placed along the axis', () => {
    const html = render(
      h(NumberLine, {
        caption: 'Pages',
        min: 0,
        max: 400,
        unit: 'pages',
        pins: [
          { id: 'g', kind: 'guess', value: 300, label: 'you said' },
          { id: 'r', kind: 'result', value: 260, label: 'the model' },
        ],
      }),
    )
    expect(html).toMatch(/data-kind="guess"[^>]*style="--es-at:0.75">.*you said<\/span> <data value="300">300 pages<\/data>/s)
    expect(html).toMatch(/data-kind="result"[^>]*style="--es-at:0.65">.*the model<\/span> <data value="260">260 pages<\/data>/s)
  })

  test('the way on is one link with the answer’s label and place; unavailable, it links nowhere and says so', () => {
    const html = render(h(NextStep, { to: '/m/tr1/l1-five-mechanisms', label: 'Start: TR1 lesson 1', minutes: 35, reviews: '3 reviews due, about 4 min' }))
    expect([...html.matchAll(/<a /g)]).toHaveLength(1)
    expect(html).toMatch(/<a class="es-next__action" data-emphasis="primary" href="\/m\/tr1\/l1-five-mechanisms"[^>]*>.*Start: TR1 lesson 1.*about 35 min/s)
    expect(html).toContain('3 reviews due, about 4 min')
    expect(render(h(NextStep, { to: '/', label: 'x', emphasis: 'outline' }))).toContain('data-emphasis="outline"')
    const off = render(h(NextStep, { to: '/m/tr3', label: 'TR3 lesson 1', unavailable: true }))
    expect(off).not.toContain('href=')
    expect(off).toContain('aria-disabled="true"')
    expect(off).toContain('Not published yet')
  })
})
