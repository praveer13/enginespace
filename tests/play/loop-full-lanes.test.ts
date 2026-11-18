/*
 * The step loop's lanes on the five full levels (packages/play/loop/full/lanes.ts; docs/REDESIGN.md §3.7, P7): one microsecond maps to
 * one x on every row, a bubble is as wide as the CPU work that causes it, and eager launches, a graph replay and padding are three distinct
 * kinds of mark. Every full level, and each stage of `graphs`, lays out.
 */
import { describe, expect, test } from 'bun:test'
import { FULL_DESK, FULL_LANE_WORDS, FULL_PHONE, STEPS_SHOWN, firstStepUs, fullLaneLayout, xOfUs } from '@es/play/loop/full/lanes'
import type { FullLaneGeometry, FullLaneLayout, FullLaneSource } from '@es/play/loop/full/lanes'
import { FULL_LEVEL_IDS } from '@es/play/loop/full/levels'
import { fullSession } from '@es/play/loop/full/session'
import type { FullAction, FullLevelId, FullState, FullView } from '@es/play/loop/full/types'

const EPS = 1e-6
const play = (state: FullState, ...actions: FullAction[]): FullState => actions.reduce((s, a) => fullSession.reduce(s, a), state)
const start = (id: FullLevelId, seed = 0): FullState => fullSession.init(fullSession.level(id, seed))
const steps = (state: FullState, n: number): FullState => {
  let s = state
  for (let i = 0; i < n && fullSession.view(s).canFire; i++) s = play(s, { t: 'run', until: 'step' })
  return s
}
/** A stage's night: the prediction committed (the session asks it first), the levers set, `n` steps rung. */
const night = (id: FullLevelId, stage: string | null, levers: FullAction[], n: number): FullView => {
  let s = start(id)
  if (stage !== null) s = play(s, { t: 'stage', to: stage })
  s = play(s, { t: 'commit', prediction: 0 }, ...levers)
  return fullSession.view(steps(s, n))
}

/** The layout's invariants for any view and geometry. */
function holds(layout: FullLaneLayout, g: FullLaneGeometry) {
  const { scale } = layout
  for (let i = 1; i < layout.rows.length; i++) expect(layout.rows[i].y).toBeCloseTo(layout.rows[i - 1].y + layout.rows[i - 1].height, 9)
  for (const box of [...layout.marks, ...layout.idle]) {
    expect(box.x).toBeGreaterThanOrEqual(scale.x - EPS)
    expect(box.x + box.width).toBeLessThanOrEqual(g.width + EPS)
    expect(box.width).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(layout.height + EPS)
  }
  for (const mark of layout.marks) {
    const row = layout.rows.find((candidate) => candidate.id === mark.row)
    expect(row).toBeDefined()
    expect(mark.y).toBe(row!.y)
  }
  expect(layout.now.x).toBeGreaterThanOrEqual(scale.x - EPS)
  expect(layout.now.x).toBeLessThanOrEqual(scale.x + scale.width + EPS)
  for (let i = 1; i < layout.axis.ticks.length; i++) expect(layout.axis.ticks[i].x - layout.axis.ticks[i - 1].x).toBeGreaterThanOrEqual(g.axisLabelGap - EPS)
}

/** Every mark lands at xOf of its own microsecond: the scale is one affine map for every row. */
function affine(layout: FullLaneLayout) {
  const { scale } = layout
  for (const mark of layout.marks) {
    expect(mark.x).toBeCloseTo(xOfUs(scale, Math.max(mark.startUs, scale.start)), 6)
    expect(mark.x + mark.width).toBeCloseTo(xOfUs(scale, Math.min(mark.endUs, scale.end)), 6)
  }
  for (const box of layout.idle) expect(box.x + box.width).toBeCloseTo(xOfUs(scale, Math.min(box.endUs, scale.end)), 6)
  for (const tick of layout.axis.ticks) expect(tick.x).toBeCloseTo(xOfUs(scale, tick.t), 6)
}

/** Each full level and each stage of graphs, with the lever that makes its stage's mark appear. */
const NIGHTS: readonly { name: string; view: () => FullView }[] = [
  { name: 'async · 70b, async off', view: () => night('async', null, [], 4) },
  { name: 'async · 70b, async on', view: () => night('async', null, [{ t: 'lever', name: 'async', value: true }], 4) },
  { name: 'async · small', view: () => night('async', 'small', [], 4) },
  { name: 'graphs · comb, eager', view: () => night('graphs', null, [{ t: 'lever', name: 'graphMode', value: 'NONE' }], 3) },
  { name: 'graphs · comb, replay', view: () => night('graphs', null, [{ t: 'lever', name: 'graphMode', value: 'FULL_AND_PIECEWISE' }], 3) },
  { name: 'graphs · sizes', view: () => night('graphs', 'sizes', [{ t: 'capture', sizes: [6, 12] }], 12) },
  { name: 'graphs · modes', view: () => night('graphs', 'modes', [], 3) },
  { name: 'mrv2', view: () => night('mrv2', null, [], 3) },
  { name: 'close', view: () => night('close', null, [], 1) },
  { name: 'mask', view: () => night('mask', null, [], 3) },
]

describe('every full level, and each stage of graphs, lays out', () => {
  test('the five levels are the ones the session has', () => {
    expect([...FULL_LEVEL_IDS].sort()).toEqual(['async', 'close', 'graphs', 'mask', 'mrv2'])
    const named = new Set(NIGHTS.map((entry) => entry.name.split(' ')[0]))
    for (const id of FULL_LEVEL_IDS) expect(named.has(id)).toBe(true)
  })

  for (const { name, view } of NIGHTS) {
    test(`${name}: on both geometries, one microsecond is one x on every row`, () => {
      const v = view()
      expect(v.fires.length).toBeGreaterThan(0)
      for (const g of [FULL_DESK, FULL_PHONE]) {
        const layout = fullLaneLayout(v, g)
        holds(layout, g)
        affine(layout)
        // The forward row carries a slab for each step in the window, with its batch size, and the live strip under it says the same.
        for (const fire of v.fires.filter((candidate) => candidate.endUs > layout.scale.start && candidate.startUs < layout.scale.end)) {
          const forward = layout.marks.find((mark) => mark.id === `forward/${fire.index}`)!
          const rows = fire.places.filter((place) => place.state !== 'empty').length
          expect(forward.label).toBe(FULL_LANE_WORDS.batch(rows))
          expect(layout.marks.find((mark) => mark.id === `live/${fire.index}`)?.label).toBe(FULL_LANE_WORDS.liveOf(rows, v.slots))
        }
      }
      // Fit run lays out the whole run: the first forward is on the track.
      const fit = fullLaneLayout(v, FULL_DESK, { fit: true })
      holds(fit, FULL_DESK)
      expect(fit.scale.start).toBe(0)
      expect(fit.marks.some((mark) => mark.id === `forward/${v.fires[0].index}`)).toBe(true)
    })
  }

  test('the scale is fixed for a night: the window is the first step times the steps shown, at every step after', () => {
    let s = play(start('async'), { t: 'commit', prediction: 0 })
    const scales: number[] = []
    for (let i = 0; i < 8; i++) {
      s = steps(s, 1)
      const v = fullSession.view(s)
      const layout = fullLaneLayout(v)
      expect(layout.scale.end - layout.scale.start).toBe(firstStepUs(v)! * STEPS_SHOWN)
      scales.push(layout.scale.pxPerUs)
    }
    expect(new Set(scales).size).toBe(1)
  })
})

describe('a bubble is as wide as the CPU work that causes it', () => {
  test('with async scheduling off, each gap between forwards is the CPU calls inside it, end to end', () => {
    const v = night('async', null, [], 4)
    const layout = fullLaneLayout(v, FULL_DESK, { fit: true })
    const closed = layout.idle.filter((box) => box.before !== null)
    expect(closed.length).toBeGreaterThan(0)
    for (const box of closed) {
      const work = layout.marks.filter((mark) => mark.row === 'cpu' && mark.startUs >= box.startUs && mark.endUs <= box.endUs)
      expect(work.length).toBeGreaterThan(0)
      const cpuWidth = work.reduce((sum, mark) => sum + mark.width, 0)
      expect(box.width).toBeCloseTo(cpuWidth, 6)
      // The dimension line spans the box and carries its value in µs.
      const dim = layout.dims.find((candidate) => candidate.id === `dim/${box.before}`)!
      expect(dim.x0).toBeCloseTo(box.x, 9)
      expect(dim.x1).toBeCloseTo(box.x + box.width, 9)
      expect(dim.label).toBe(`bubble ${box.us} µs`)
    }
  })

  test('async scheduling on shrinks the bubbles', () => {
    const off = fullLaneLayout(night('async', null, [], 4), FULL_DESK, { fit: true })
    const on = fullLaneLayout(night('async', null, [{ t: 'lever', name: 'async', value: true }], 4), FULL_DESK, { fit: true })
    const total = (layout: FullLaneLayout) => layout.idle.filter((box) => box.before !== null).reduce((sum, box) => sum + box.us, 0)
    expect(total(on)).toBeLessThan(total(off))
  })
})

describe('eager launches, a graph replay and padding are three kinds of mark', () => {
  test('graphs off: the launch is a comb of ticks, one per call (or every k-th), with the count carried whole', () => {
    const v = night('graphs', null, [{ t: 'lever', name: 'graphMode', value: 'NONE' }], 2)
    const layout = fullLaneLayout(v)
    const combs = layout.marks.filter((mark) => mark.kind === 'eager')
    expect(combs.length).toBeGreaterThan(0)
    expect(layout.marks.some((mark) => mark.kind === 'replay')).toBe(false)
    for (const comb of combs) {
      const fire = v.fires.find((candidate) => candidate.index === comb.step)!
      expect(comb.calls).toBe(fire.calls)
      expect(comb.label).toBe(FULL_LANE_WORDS.launches(fire.calls))
      expect(comb.ticks!.length).toBeGreaterThan(1)
      expect(comb.ticks!.length).toBeLessThanOrEqual(fire.calls)
      for (const x of comb.ticks!) {
        expect(x).toBeGreaterThanOrEqual(comb.x - EPS)
        expect(x).toBeLessThanOrEqual(comb.x + comb.width + EPS)
      }
    }
  })

  test('a full graph: the launch is one replay slab, labelled with its captured size', () => {
    const v = night('graphs', null, [{ t: 'lever', name: 'graphMode', value: 'FULL' }], 3)
    const layout = fullLaneLayout(v)
    const replays = layout.marks.filter((mark) => mark.kind === 'replay')
    expect(replays.length).toBeGreaterThan(0)
    for (const replay of replays) {
      const fire = v.fires.find((candidate) => candidate.index === replay.step)!
      expect(fire.mode).toBe('FULL')
      expect(replay.label).toBe(FULL_LANE_WORDS.replay(fire.mold!))
      expect(layout.marks.some((mark) => mark.kind === 'eager' && mark.step === replay.step)).toBe(false)
    }
  })

  test('a step padded up to a captured size: a padding mark on the padded share of its forward, at its end', () => {
    let s = play(start('graphs'), { t: 'stage', to: 'sizes' }, { t: 'commit', prediction: 0 }, { t: 'capture', sizes: [6, 12] })
    for (let i = 0; i < 40 && !fullSession.view(s).fires.some((fire) => fire.padded > 0); i++) s = steps(s, 1)
    const v = fullSession.view(s)
    const layout = fullLaneLayout(v, FULL_DESK, { fit: true })
    const pads = layout.marks.filter((mark) => mark.kind === 'padding')
    expect(pads.length).toBeGreaterThan(0)
    for (const pad of pads) {
      const fire = v.fires.find((candidate) => candidate.index === pad.step)!
      const forward = layout.marks.find((mark) => mark.id === `forward/${fire.index}`)!
      expect(pad.label).toBe(FULL_LANE_WORDS.padding(fire.padded, fire.mold!))
      expect(pad.x + pad.width).toBeCloseTo(forward.x + forward.width, 6)
      expect(pad.width).toBeCloseTo((forward.width * fire.padded) / fire.mold!, 6)
    }
    expect(new Set(layout.marks.map((mark) => mark.kind))).toContain('padding')
  })

  test('the grammar mask has its own row on `mask` and no other level', () => {
    const mask = fullLaneLayout(night('mask', null, [], 3))
    expect(mask.rows.map((row) => row.id)).toEqual(['cpu', 'forward', 'live', 'mask'])
    expect(mask.marks.some((mark) => mark.kind === 'mask' && mark.row === 'mask')).toBe(true)
    expect(mask.marks.some((mark) => mark.row === 'cpu' && mark.call === 'mask')).toBe(false)
    expect(fullLaneLayout(night('async', null, [], 3)).rows.map((row) => row.id)).toEqual(['cpu', 'forward', 'live'])
  })

  test('a source with host and device copies gets a copy row between the CPU and the GPU', () => {
    const v = night('async', null, [], 2)
    const source: FullLaneSource = { ...v, copies: [{ step: 0, dir: 'h2d', startUs: v.fires[0].startUs - 10, endUs: v.fires[0].startUs }] }
    const layout = fullLaneLayout(source, FULL_DESK, { fit: true })
    expect(layout.rows.map((row) => row.id)).toEqual(['cpu', 'copy', 'forward', 'live'])
    expect(layout.marks.filter((mark) => mark.kind === 'copy')).toHaveLength(1)
  })
})

describe('the layout is pure', () => {
  test('the same view gives the same layout, and a step loop has a slot', () => {
    const v = night('graphs', null, [], 2)
    expect(JSON.stringify(fullLaneLayout(v))).toBe(JSON.stringify(fullLaneLayout(v)))
    expect(() => fullLaneLayout({ ...v, slots: 0 })).toThrow(RangeError)
  })
})
