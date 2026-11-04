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
import { Field } from '@/design/components/Field'
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

const render = (element: ReactElement, location = '/map') =>
  renderToString(createElement(StaticRouter, { location }, element)).replaceAll('<!-- -->', '')
const h = createElement

describe('Ticket', () => {
  test('a container ticket is an article with its head, stamped title and printed lines', () => {
    const html = render(h(Ticket, { head: 'No. 0042', meta: 'TBL 7', title: 'Fire the next step.' }, h(TicketLine, { qty: '2x' }, 'DECODE')))
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
    expect(render(h(Stub, { to: '/play/loop' }, 'Start service'))).toContain('href="/play/loop"')
    expect(render(h(Stub, { onClick: () => undefined }, 'Start service'))).toContain('<button type="button" class="es-stub__pull"')
  })

  test('disabled, loading and error are element states', () => {
    expect(render(h(Stub, { disabled: true }, 'Start service'))).toContain('disabled=""')
    const loading = render(h(Stub, { loading: true, to: '/play/loop' }, 'Start service'))
    expect(loading).toContain('aria-busy="true"')
    expect(loading).not.toContain('href=')
    const error = render(h(Stub, { error: 'The line did not answer.', onClick: () => undefined }, 'Start service'))
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
    const html = render(h(TextLink, { href: 'https://docs.vllm.ai/' }, 'the vLLM docs'))
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
    expect(html).toContain('(opens in a new tab)')
    expect(render(h(TextLink, { to: '/m/tr3', disabled: true }, 'TR3'))).not.toContain('href=')
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
    expect(render(h(TapeLabel, { slot: 'yellow' }, 'cached'))).toContain('data-glyph="diamond"')
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
