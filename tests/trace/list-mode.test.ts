/*
 * W2b-T101: the trace as a list, as markup (src/trace/ListMode.tsx), rendered on the server: a row for each stretch of the step, each with its
 * four category radios in a group named by the row, the marks it is given shown as picks, the cause list in time order with a way to name
 * none, and every figure saying where it comes from. What needs a tap, a key or a focus is walked in a browser by e2e/trace-view.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { stepWindows } from '@es/sim/trace'
import { findBanned } from '@/copy/banned'
import { causeSpans, stretchesOf } from '@/trace/list'
import { ListMode, TraceModes } from '@/trace/ListMode'
import { addMark, CATEGORIES, CATEGORY_WORDS, NO_ANNOTATIONS } from '@/trace/marks'
import type { Annotations } from '@/trace/marks'
import { buildIndex } from '@/trace/model'
import { specimenTrace } from '@/trace/specimen'

const trace = specimenTrace(7)
const index = buildIndex(trace)
const step = stepWindows(trace)[5]
const rows = stretchesOf(trace, step)
const render = (notes: Annotations = NO_ANNOTATIONS, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    h(ListMode, {
      trace,
      traceId: 'synthetic-7',
      notes,
      onActions: () => undefined,
      initialStep: 5,
      ...extra,
    }),
  )
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')

describe('the list', () => {
  const markup = render()

  test('has a heading at the level it is given, over the line that says the trace is synthetic', () => {
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-type-heading">A synthetic trace<\/h2><p class="es-type-body[^"]*">A synthetic trace: the step-loop model/)
    expect(render(NO_ANNOTATIONS, { headingLevel: 3, title: 'The tape' })).toMatch(/<h3 id="[^"]+" class="es-type-heading">The tape<\/h3>/)
  })

  test('opens on the step it is asked for, and says how long it is and where its numbers come from', () => {
    expect(text(markup)).toContain(`Step 6 of ${stepWindows(trace).length}`)
    expect(text(markup)).toMatch(/ns long, synthetic/)
    expect(text(markup)).toContain('Every ns is synthetic.')
  })

  test('lists one row for each stretch, and each row is a group of the four category radios that its row header names', () => {
    expect(count(markup, /<tr role="row" class="es-tlist__row"/g)).toBe(rows.length)
    expect(count(markup, /role="radiogroup"/g)).toBe(rows.length)
    const groups = [...markup.matchAll(/<th scope="row" role="rowheader" id="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(groups).size).toBe(rows.length)
    for (const id of groups) {
      expect(markup).toContain(`role="radiogroup" aria-labelledby="${id}"`)
      expect(count(markup, new RegExp(`<input type="radio"[^>]* name="${id}"`, 'g'))).toBe(CATEGORIES.length)
    }
    for (const c of CATEGORIES) expect(count(markup, new RegExp(`data-cat="${c}"`, 'g'))).toBe(rows.length)
    for (const c of CATEGORIES) expect(text(markup)).toContain(CATEGORY_WORDS[c].term)
  })

  test('picks nothing for a step with no marks, and shows a mark that covers a stretch as that stretch’s pick', () => {
    expect(count(markup, /checked=""/g)).toBe(1) // "No cause named"
    const made = addMark(NO_ANNOTATIONS, rows[0].fromNs, rows[1].toNs, 'cpu-gap')
    if (!made.ok) throw new Error(made.why)
    const picked = render(made.notes)
    expect(count(picked, /<input type="radio" data-row="\d+" name="[^"]+" checked="" value="cpu-gap"/g)).toBe(2)
    expect(count(picked, /checked=""/g)).toBe(3)
    expect(text(picked)).toContain(`2 of ${rows.length} stretches have a category.`)
    expect(text(markup)).toContain(
      `0 of ${rows.length} stretches have a category. Unaccounted: ${(step.toNs - step.fromNs).toLocaleString('en-US')} ns of the step.`,
    )
  })

  test('says what runs on the GPU and on the main thread, and says it when nothing does', () => {
    expect(count(markup, /data-side="gpu"/g)).toBe(rows.length)
    expect(count(markup, /data-side="cpu"/g)).toBe(rows.length)
    if (rows.some((row) => row.gpu === 'idle')) expect(text(markup)).toContain('nothing: the GPU is idle')
    if (rows.some((row) => !row.cpu)) expect(text(markup)).toContain('nothing: the main thread is idle')
  })

  test('lists the step’s frames and calls for the cause, in time order, after a radio that names none', () => {
    const spans = causeSpans(index, step)
    const listed = [...markup.matchAll(/data-cause-span="(\d+)"/g)].map((m) => Number(m[1]))
    expect(listed).toEqual(spans)
    expect(markup.indexOf('No cause named')).toBeLessThan(markup.indexOf('data-cause-span'))
    const named = render({ ...NO_ANNOTATIONS, cause: spans[2] })
    expect(named).toMatch(new RegExp(`data-cause-span="${spans[2]}"><input type="radio" name="[^"]+" checked="" value="${spans[2]}"`))
    expect(count(named, /checked=""/g)).toBe(1)
  })

  test('says nothing of the answer: no line names a stretch’s category before the learner picks', () => {
    // The four words stand once per row, as the radios' labels, and nowhere else but the radios' hints.
    for (const c of CATEGORIES) expect(count(text(markup), new RegExp(`\\b${CATEGORY_WORDS[c].term}\\b`, 'g'))).toBe(rows.length)
  })

  test('keeps the step buttons at the ends, never disabled (a disabled button drops focus), and marked as not available', () => {
    const first = render(NO_ANNOTATIONS, { initialStep: 0 })
    expect(first).toMatch(/aria-disabled="true"[^>]*data-list-step="prev"/)
    expect(first).not.toMatch(/disabled=""[^>]*data-list-step/)
    expect(markup).not.toMatch(/aria-disabled="true"[^>]*data-list-step/)
  })

  test('reads in plain words, with no word the course does not use', () => {
    expect(findBanned(text(markup))).toEqual([])
    expect(findBanned(text(renderToStaticMarkup(h(TraceModes, { mode: 'list', onMode: () => undefined }))))).toEqual([])
  })

  test('the switch between the list and the lanes says which is shown', () => {
    const modes = renderToStaticMarkup(h(TraceModes, { mode: 'list', onMode: () => undefined }))
    expect(modes).toMatch(/role="group" aria-label="Show the trace as"/)
    expect(modes).toMatch(/aria-pressed="true"[^>]*data-trace-mode="list"/)
    expect(modes).toMatch(/aria-pressed="false"[^>]*data-trace-mode="lanes"/)
  })
})
