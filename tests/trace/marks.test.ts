/*
 * W1-T09, accept 3 of "marks exported in the `trace-mark` event shape": what a mark is, what the viewer will not make, and that what it
 * exports is a `trace-mark` event's data that the ledger's strict codec accepts and that reads back as the marks it came from.
 */
import { describe, expect, test } from 'bun:test'
import { decodeEvent, LIMITS, stampEvent } from '@es/ledger'
import type { WriterContext } from '@es/ledger'
import { parseRef } from '@es/schema/refs'
import {
  addMark,
  CATEGORIES,
  CATEGORY_WORDS,
  cleanLabel,
  exportMarks,
  importMarks,
  LABEL_MAX,
  MAX_MARKS,
  NO_ANNOTATIONS,
  overlaps,
  relabel,
  removeMark,
  retag,
  traceMarkData,
  traceMarkRef,
  unaccountedNs,
  withCause,
} from '@/trace/marks'
import type { Annotations, Mark } from '@/trace/marks'

const made = (notes: Annotations, a: number, b: number, category: Mark['category'] = null, label = ''): Annotations => {
  const result = addMark(notes, a, b, category, label)
  if (!result.ok) throw new Error(result.why)
  return result.notes
}

describe('a mark', () => {
  test('runs between two edges whichever order they come in, and is numbered from 1', () => {
    const a = addMark(NO_ANNOTATIONS, 900, 100, 'kernel')
    expect(a.ok && a.mark).toEqual({ id: 1, fromNs: 100, toNs: 900, category: 'kernel', label: '' })
    const b = made(made(NO_ANNOTATIONS, 0, 10), 20, 30)
    expect(b.marks.map((m) => m.id)).toEqual([1, 2])
    expect(b.nextId).toBe(3)
  })

  test('is refused with no length, with ns that are not whole, and when the tape is full', () => {
    expect(addMark(NO_ANNOTATIONS, 5, 5, null).ok).toBe(false)
    expect(addMark(NO_ANNOTATIONS, 0.5, 9, null).ok).toBe(false)
    let full = NO_ANNOTATIONS
    for (let i = 0; i < MAX_MARKS; i++) full = made(full, i * 10, i * 10 + 5)
    const refused = addMark(full, 99_999, 100_000, null)
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.why).toContain(String(MAX_MARKS))
  })

  test('a label is kept plain: no control characters, one space between words, trimmed, and cut at the limit', () => {
    expect(cleanLabel('  the\tsync \n that   drained ')).toBe('the sync that drained')
    expect(cleanLabel('x'.repeat(LABEL_MAX + 20))).toBe('x'.repeat(LABEL_MAX))
    expect(Array.from(cleanLabel('é'.repeat(100))).length).toBe(LABEL_MAX)
    expect(cleanLabel('a\u0000b\u007fc')).toBe('a b c')
  })

  test('can be retagged, relabelled and removed, and the others are left alone', () => {
    let notes = made(made(NO_ANNOTATIONS, 0, 10, 'kernel'), 10, 20, 'copy')
    notes = retag(relabel(notes, 2, '  gap '), 2, 'cpu-gap')
    expect(notes.marks[1]).toMatchObject({ id: 2, category: 'cpu-gap', label: 'gap' })
    expect(notes.marks[0].category).toBe('kernel')
    expect(removeMark(notes, 1).marks.map((m) => m.id)).toEqual([2])
    expect(removeMark(notes, 9)).toEqual(notes)
  })

  test('has all four of Gap Hunt’s words, each with its kitchen word', () => {
    expect(CATEGORIES).toEqual(['kernel', 'copy', 'cpu-gap', 'both-idle'])
    for (const c of CATEGORIES) expect(CATEGORY_WORDS[c].kitchen.length).toBeGreaterThan(3)
  })
})

describe('what the marks add up to', () => {
  const win = { fromNs: 0, toNs: 1_000 }

  test('the unaccounted ns are the window less the union of the tagged marks', () => {
    let notes = made(NO_ANNOTATIONS, 0, 400, 'kernel')
    expect(unaccountedNs(notes.marks, win)).toBe(600)
    notes = made(notes, 300, 700, 'copy') // overlaps 100 ns of the first
    expect(unaccountedNs(notes.marks, win)).toBe(300)
    notes = made(notes, 700, 1_000, 'both-idle')
    expect(unaccountedNs(notes.marks, win)).toBe(0)
  })

  test('a mark with no category accounts for nothing, and a mark outside the window counts only inside it', () => {
    expect(unaccountedNs(made(NO_ANNOTATIONS, 0, 500).marks, win)).toBe(1_000)
    expect(unaccountedNs(made(NO_ANNOTATIONS, 900, 5_000, 'kernel').marks, win)).toBe(900)
  })

  test('overlaps name the pair and how many ns they share', () => {
    const notes = made(made(made(NO_ANNOTATIONS, 0, 100), 50, 150), 150, 200)
    expect(overlaps(notes.marks)).toEqual([{ a: 1, b: 2, ns: 50 }])
  })
})

describe('the trace-mark event', () => {
  const ctx: WriterContext = { clock: { nowIso: () => '2026-11-04T09:30:00.000Z', tzOffsetMinutes: () => 0 }, newId: () => 'e-1', dev: 'dev-a1' }
  let notes: Annotations = made(NO_ANNOTATIONS, 15_800_000, 15_850_000, 'kernel', 'qkv')
  notes = made(notes, 15_850_000, 15_900_000, 'cpu-gap')
  notes = withCause(notes, 42)

  test('exports ranges in time order and then the cause, leaving out an empty label', () => {
    expect(exportMarks(notes)).toEqual([
      { kind: 'range', fromNs: 15_800_000, toNs: 15_850_000, category: 'kernel', label: 'qkv' },
      { kind: 'range', fromNs: 15_850_000, toNs: 15_900_000, category: 'cpu-gap' },
      { kind: 'cause', span: 42 },
    ])
    expect(JSON.stringify(exportMarks(notes))).not.toContain('"label":""')
  })

  test('is the data of an event that the ledger’s strict codec accepts, and is the same after a trip through JSON', () => {
    const event = stampEvent(ctx, {
      kind: 'trace-mark',
      ref: traceMarkRef('synthetic-7', 'attribute'),
      score: 0.97,
      ok: true,
      provenance: 'unseen',
      seed: 7,
      data: traceMarkData(notes, 1_250),
    })
    const decoded = decodeEvent(JSON.parse(JSON.stringify(event)))
    expect(decoded.ok).toBe(true)
    if (decoded.ok && decoded.value.kind === 'trace-mark') {
      expect(decoded.value.data.error).toBe(1_250)
      expect(importMarks(decoded.value.data.marks)).toEqual({ ...notes, marks: notes.marks.map((m) => ({ ...m, id: m.id })) })
    }
  })

  test('the ref is trace:<trace>/<task>, in the grammar of ARCHITECTURE §4.5', () => {
    expect(parseRef(traceMarkRef('synthetic-7', 'attribute'))).toEqual({ kind: 'trace', trace: 'synthetic-7', task: 'attribute' })
    expect(() => traceMarkRef('Synthetic 7', 'attribute')).toThrow()
    expect(() => traceMarkRef('synthetic-7', 'a/b')).toThrow()
  })

  test('refuses an error below zero', () => {
    expect(() => traceMarkData(notes, -1)).toThrow()
    expect(() => traceMarkData(notes, Number.NaN)).toThrow()
  })

  test('200 marks with the longest labels still fit the ledger’s budget for marks', () => {
    let full = NO_ANNOTATIONS
    for (let i = 0; i < MAX_MARKS; i++) full = made(full, 15_000_000_000 + i * 1_000_000, 15_000_000_000 + i * 1_000_000 + 999_999, 'both-idle', 'x'.repeat(LABEL_MAX))
    expect(JSON.stringify(traceMarkData(withCause(full, 99_999), 0).marks).length).toBeLessThan(LIMITS.marksChars)
  })

  test('reads back only what it writes: other kinds, extra keys, a bad category or a backwards range are refused', () => {
    expect(importMarks(exportMarks(notes))?.marks.length).toBe(2)
    expect(importMarks([{ kind: 'dot' }])).toBeNull()
    expect(importMarks([{ kind: 'range', fromNs: 5, toNs: 9, category: 'kernel', extra: 1 }])).toBeNull()
    expect(importMarks([{ kind: 'range', fromNs: 5, toNs: 9, category: 'dessert' }])).toBeNull()
    expect(importMarks([{ kind: 'range', fromNs: 9, toNs: 5, category: 'kernel' }])).toBeNull()
    expect(importMarks([{ kind: 'range', fromNs: 5, toNs: 9, category: 'kernel', label: 4 }])).toBeNull()
    expect(importMarks([{ kind: 'cause', span: -1 }])).toBeNull()
    expect(importMarks([{ kind: 'cause', span: 1, extra: true }])).toBeNull()
    expect(importMarks(['x'])).toBeNull()
    expect(importMarks([])).toEqual(NO_ANNOTATIONS)
  })
})
