/*
 * W1-T09: the viewer as markup (ARCHITECTURE §6.9, DESIGN.md), rendered on the server so that the structure a screen reader and a
 * stylesheet get can be read: what the head says, which plates there are and that each is a key's twin, that the canvas is hidden
 * from assistive technology while a table lists what it shows, and that every figure says where it comes from. What needs a focus,
 * a timer or a pointer is walked in a browser by e2e/trace-view.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { stepWindows, traceBuilder } from '@es/sim/trace'
import { KeysSheet } from '@/trace/KeysSheet'
import { TraceView } from '@/trace/TraceView'
import { KEY_GROUPS, TRACE_KEYS } from '@/trace/keys'
import { mirrorGroups, ROWS_PER_LANE, ROWS_PER_LANE_ALL } from '@/trace/mirror'
import { provenanceOf } from '@/trace/provenance'
import { denseTrace } from '@/trace/dense'
import { syntheticId, syntheticSeed } from '@/trace/ids'
import { specimenTrace } from '@/trace/specimen'
import { buildIndex } from '@/trace/model'
import { encodeTrace, traceChecks, validateTrace } from '@es/sim/trace'
import { night } from './support'

const trace = specimenTrace(7)
const render = (props: Partial<Parameters<typeof TraceView>[0]> = {}) =>
  renderToStaticMarkup(h(StaticRouter, { location: '/trace-room/synthetic-7' }, h(TraceView, { trace, traceId: 'synthetic-7', ...props })))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0

describe('the viewer’s page', () => {
  const markup = render()

  test('has a heading at the level it is given, over the line that says what the tape is', () => {
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-type-heading">The night’s tape<\/h2><p class="es-type-body[^"]*">A synthetic tape: the step-loop model with seeded jitter/)
    expect(render({ headingLevel: 3, title: 'A lifecycle' })).toMatch(/<h3 id="[^"]+" class="es-type-heading">A lifecycle<\/h3>/)
    expect(count(markup, /<h1/g)).toBe(0)
  })

  test('is a labelled section keyed by its trace, focusable by script so that focus can come back to it', () => {
    expect(markup).toMatch(/<section tabindex="-1" aria-labelledby="[^"]+" class="es-trace" data-trace-view="" data-trace="synthetic-7">/)
  })

  test('hides the drawing from assistive technology and says that the table lists what it shows', () => {
    expect(markup).toMatch(/<div class="es-trace__tape" aria-hidden="true" tabindex="-1"[^>]*data-trace-tape=""[^>]*>/)
    expect(markup).toContain('The tape is drawn on a canvas. The table of spans below lists every span in the window')
    expect(count(markup, /<canvas /g)).toBe(1)
  })

  test('names every lane in the kitchen’s words with the engine’s term beside it', () => {
    for (const word of ['expo&#x27;s lane', 'the calls', 'the line']) expect(markup).toContain(word)
    for (const name of ['engine core main thread', 'CUDA API', 'GPU stream 0']) expect(markup).toContain(name)
  })

  test('puts the in-view length, the step and the provenance stamp in the head', () => {
    expect(markup).toMatch(/data-trace-window="">.*In view.*data-tag="synthetic"/)
    expect(markup).toMatch(/Step <span class="font-numeric">3<\/span> of <span class="font-numeric">\d+<\/span>|Step <span class="font-numeric">1<\/span> of/)
  })

  test('says in each column head of the tables that every ns is synthetic', () => {
    expect(markup).toContain('ns, synthetic')
    expect(count(markup, /ns, synthetic<\/span>/g)).toBeGreaterThanOrEqual(5)
  })

  test('lists the spans of the window in a table of one tab stop, the lamp on the cursor’s row', () => {
    expect(count(markup, /<button[^>]*data-row-button=""[^>]*tabindex="0"/g)).toBe(1)
    expect(count(markup, /data-cursor-row="true"/g)).toBe(1)
    expect(count(markup, /data-native-keys="ArrowUp ArrowDown Home End PageUp PageDown"/g)).toBeGreaterThanOrEqual(2)
    expect(markup).toMatch(/aria-pressed="true"[^>]*>[^<]*<span class="sr-only">, cursor on its start<\/span>/)
  })

  test('has no label field until there is a mark to write on, and says so', () => {
    expect(markup).toContain('Start a mark, or choose one below, to write words on its tape.')
    expect(markup).not.toContain('es-field')
  })

  test('has one polite live region for the line, empty at the start, and no second one: the viewer has no outcome to announce', () => {
    expect(markup).toContain('<div aria-live="polite" aria-atomic="true" class="sr-only" data-live="line"></div>')
    expect(count(markup, /aria-live=/g)).toBe(1)
    expect(markup).not.toContain('data-live="outcome"')
  })
})

describe('the plates', () => {
  const markup = render()
  const plates = [...markup.matchAll(/data-command="([a-z-]+)"/g)].map((match) => match[1])

  test('are each a key’s twin, and each key but the label field’s and Backspace’s has a plate', () => {
    const keys = TRACE_KEYS.map((key) => key.id).filter((id) => id !== 'remove-back' && id !== 'label')
    expect([...plates].sort()).toEqual([...keys].sort())
  })

  test('name what they do in words that begin with what they print', () => {
    expect(markup).toMatch(/data-command="bell-prev"[^>]*aria-label="Step back: go to the previous step"|aria-label="Step back: go to the previous step"[^>]*data-command="bell-prev"/)
    expect(markup).toContain('aria-keyshortcuts="J"')
    expect(markup).toContain('aria-keyshortcuts="M"')
  })

  test('are grouped for a screen reader without being an ARIA toolbar, which would promise arrow keys that pan the tape', () => {
    for (const group of ['Window', 'Cursor', 'Marks', 'Tag the mark']) expect(markup).toContain(`role="group" aria-label="${group}"`)
    expect(markup).not.toContain('role="toolbar"')
  })

  test('leave out the marking plates on a tape for reading, and say that it takes no marks', () => {
    const reading = render({ readOnly: true })
    expect(reading).not.toContain('data-command="mark"')
    expect(reading).not.toContain('data-command="category-kernel"')
    expect(reading).toContain('data-command="zoom-in"')
    expect(reading).toContain('This tape is for reading')
  })

  test('start with the tag plates, Cancel and Remove disabled: there is no mark to act on', () => {
    expect(markup).toMatch(/data-command="cancel"[^>]*disabled=""|disabled=""[^>]*data-command="cancel"/)
    expect(markup).toMatch(/data-command="remove"[^>]*disabled=""|disabled=""[^>]*data-command="remove"/)
    expect(markup).toMatch(/data-command="category-kernel"[^>]*disabled=""|disabled=""[^>]*data-command="category-kernel"/)
    expect(markup).toMatch(/data-command="mark"/)
  })
})

describe('the keys dialog', () => {
  test('lists every key of the map, once, under a group', () => {
    const listed = KEY_GROUPS.flatMap((group) => group.ids)
    expect([...listed].sort()).toEqual(TRACE_KEYS.map((key) => key.id).sort())
    expect(new Set(listed).size).toBe(listed.length)
    expect(TRACE_KEYS.every((key) => key.label.length > 0 && key.description.length > 3)).toBe(true)
  })

  test('is a dialog in a portal, so a server render leaves it out and a closed one costs nothing', () => {
    expect(renderToStaticMarkup(h(KeysSheet, { keys: TRACE_KEYS, open: false, onOpenChange: () => undefined }))).toBe('')
  })
})

describe('the mirror’s rows', () => {
  const index = night()

  test('list the first rows of each lane and count the rest, and every lane that has a span in the window', () => {
    const groups = mirrorGroups(index, index.extent, null)
    expect(groups.length).toBe(index.lanes.length)
    for (const group of groups) {
      expect(group.spans.length).toBeLessThanOrEqual(ROWS_PER_LANE)
      expect(group.total).toBeGreaterThanOrEqual(group.spans.length)
    }
    expect(groups.some((group) => group.total > ROWS_PER_LANE)).toBe(true)
  })

  test('list more of a lane that has been asked for, up to the limit', () => {
    const gpu = index.lanes.length - 1
    const some = mirrorGroups(index, index.extent, null)
    const all = mirrorGroups(index, index.extent, null, new Set([gpu]))
    expect(all[gpu].spans.length).toBeGreaterThan(some[gpu].spans.length)
    expect(all[gpu].spans.length).toBeLessThanOrEqual(ROWS_PER_LANE_ALL)
  })

  test('always list the cursor’s span, wherever it falls in its lane, in start order', () => {
    const lane = index.lanes[index.lanes.length - 1]
    const far = lane.order[lane.order.length - 3]
    const groups = mirrorGroups(index, index.extent, { span: far, edge: 'start' })
    const listed = groups[groups.length - 1].spans
    expect(listed).toContain(far)
    expect(listed.map((span) => index.spanPos[span])).toEqual([...listed.map((span) => index.spanPos[span])].sort((a, b) => a - b))
  })

  test('leave out a lane with nothing in the window', () => {
    const groups = mirrorGroups(index, { fromNs: index.extent.toNs + 10, toNs: index.extent.toNs + 20 }, null)
    expect(groups).toEqual([])
  })
})

describe('where a tape’s numbers come from', () => {
  test('a synthetic tape says so, and prints no date or hash', () => {
    expect(provenanceOf(trace.meta)).toMatchObject({ tag: 'synthetic', word: 'synthetic' })
    expect(provenanceOf(trace.meta).source).toBeUndefined()
  })

  test('an owner’s capture is measured, with its GPU, engine pin, date and hash on its face', () => {
    const owner = provenanceOf({ source: 'owner', synthetic: false, gpu: 'RTX 4090', engine: 'vLLM', version: 'v0.33.0', capturedAt: '2026-11-04T09:00:00Z', sha256: 'ab'.repeat(32) })
    expect(owner).toMatchObject({ tag: 'measured', word: 'measured', source: '2026-11-04 abababab' })
    expect(owner.line).toBe('Captured: RTX 4090 · vLLM v0.33.0 · captured 2026-11-04 · sha256 abababababab.')
  })

  test('a learner’s capture is measured on their device, and an unknown date is said to be unknown', () => {
    expect(provenanceOf({ source: 'learner', synthetic: false, capturedAt: '2026-11-04T09:00:00Z' }).line).toContain('Your own capture, on your device, 2026-11-04')
    expect(provenanceOf({ source: 'owner', synthetic: false }).line).toBe('Captured: captured undated.')
  })
})

describe('the specimen tapes', () => {
  test('ids name a seed, and only a seed', () => {
    expect(syntheticSeed('synthetic-7')).toBe(7)
    expect(syntheticSeed(syntheticId(4_294_967_295))).toBe(4_294_967_295)
    for (const id of ['synthetic-', 'synthetic-4294967296', 'synthetic-7x', 'sample', 'Synthetic-7', undefined]) expect(syntheticSeed(id)).toBeNull()
  })

  test('are labelled synthetic, are well formed, pass the trace checks and have step windows', () => {
    for (const seed of [1, 7, 42]) {
      const t = specimenTrace(seed)
      expect(t.meta).toMatchObject({ source: 'synthetic', synthetic: true })
      expect(validateTrace(t)).toEqual([])
      expect(traceChecks(t).every((check) => check.pass)).toBe(true)
      expect(stepWindows(t).length).toBeGreaterThan(5)
    }
  })

  test('are the same bytes for the same seed, and another tape for another', () => {
    expect(encodeTrace(specimenTrace(7))).toBe(encodeTrace(specimenTrace(7)))
    expect(encodeTrace(specimenTrace(7))).not.toBe(encodeTrace(specimenTrace(8)))
  })

  test('a dense tape is well formed, is the same bytes for the same seed, and has at least as many spans as it was asked for', () => {
    const small = denseTrace(5, 3_000)
    expect(validateTrace(small)).toEqual([])
    expect(small.spans.track.length).toBeGreaterThanOrEqual(3_000)
    expect(encodeTrace(denseTrace(5, 3_000))).toBe(encodeTrace(small))
    expect(buildIndex(small).lanes.map((lane) => lane.rows)).toEqual([2, 1, 1])
  })

  test('a tape with no spans still renders: an empty table and no step', () => {
    const empty = traceBuilder().build({ source: 'synthetic', synthetic: true })
    const markup = render({ trace: empty, traceId: 'empty' })
    expect(markup).toContain('No span touches this window')
    expect(markup).not.toContain('Step <span')
  })
})

describe('a host\'s own line, and a tape with no marks ticket (W1-T19: Back of House shows a lifecycle tape)', () => {
  const line = 'A synthetic tape: the lifecycle model’s path for this request. It is not a measurement of any engine.'

  test('the line under the heading is the host\'s when it gives one, and the provenance\'s own when it does not', () => {
    expect(render({ about: line })).toContain(`${line}</p>`)
    expect(render({ about: line })).not.toContain('the step-loop model with seeded jitter')
    expect(render()).toContain('A synthetic tape: the step-loop model with seeded jitter')
  })

  test('the figures still carry the tape\'s own provenance, whatever the host says: the ns are synthetic', () => {
    const markup = render({ about: line, readOnly: true, marks: false })
    expect(markup).toMatch(/data-trace-window="">.*In view.*data-tag="synthetic"/)
    expect(markup).toContain('ns, synthetic')
  })

  test('the marks ticket is on the page by default and left out when the host says so, with the cursor\'s tape and the span table still there', () => {
    expect(render()).toContain('data-trace-marks')
    expect(render({ marks: true })).toContain('data-trace-marks')
    const without = render({ marks: false, readOnly: true })
    expect(without).not.toContain('data-trace-marks')
    expect(without).not.toContain('Unaccounted in this step')
    expect(without).not.toContain('Marks, in time order')
    expect(without).toContain('data-cursor-row="true"')
    expect(without).toContain('data-trace-tape')
  })
})
