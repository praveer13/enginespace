/*
 * The step loop's lanes (packages/play/loop/lanes.ts; docs/REDESIGN.md §2.9, §3.1, P7): one tick maps to one x on every row, a gap
 * between two forwards gives an idle box as wide as the CPU's work in it, and the layout holds for 4 slots and for 64.
 */
import { describe, expect, test } from 'bun:test'
import { hang, initState, step } from '@es/play/loop/engine'
import { DESK, DOCK, FRAME_DESK, FRAME_PHONE, LANE_WORDS, MIN_LABELLED_ROW, MIN_PX_PER_TICK, PHONE, TABLE_TICKS, axisStep, fitGeometry, laneLayout, requestName, stepsWindow, windowStart, xOf } from '@es/play/loop/lanes'
import type { LaneGeometry, LaneLayout } from '@es/play/loop/lanes'
import { buildLevel, LEVEL_IDS } from '@es/play/loop/levels'
import { loopGhost, loopView } from '@es/play/loop/session'
import type { LoopState, LoopView } from '@es/play/loop/types'
import { handLevel, houseNight, statesOfHouseNight } from './loop-support'

const EPS = 1e-9

/** Hang every waiting request a free slot takes. */
const fill = (s: LoopState): LoopState => {
  let state = s
  while (state.waiting.length > 0 && state.tray.includes(null)) state = hang(state, state.waiting[0])
  return state
}

/** A night of `steps` steps, by hand, refilling before each, with async scheduling as the level starts (off). */
function night(slots: number, outputs: readonly number[], steps: number): LoopView {
  let state = initState(handLevel(outputs, { slots, overlap: 'locked' }))
  for (let i = 0; i < steps; i++) state = step(fill(state))
  return loopView(state)
}

/** Every box of a layout: the queue's chips, the slabs, the idle boxes. */
const boxes = (layout: LaneLayout) => [...layout.queue.chips, ...layout.slabs, ...layout.idle]

/** The layout's invariants for any view and geometry. */
function holds(layout: LaneLayout, g: LaneGeometry, slots: number) {
  const { scale, rows } = layout
  // The rows: the CPU's, then one per slot in order, stacked without overlap inside the lanes' region.
  expect(rows.map((row) => row.id)).toEqual(['cpu', ...Array.from({ length: slots }, (_, i) => `slot-${i}`)])
  for (let i = 1; i < rows.length; i++) expect(rows[i].y).toBeCloseTo(rows[i - 1].y + rows[i - 1].height, 9)
  for (const row of rows) expect(row.height).toBeGreaterThan(0)
  expect(layout.height).toBeLessThanOrEqual(g.queueHeight + g.queueGap + g.lanesHeight + EPS)
  // Every box inside the track, horizontally, and inside the layout, vertically.
  for (const box of boxes(layout)) {
    expect(box.x).toBeGreaterThanOrEqual(scale.x - EPS)
    expect(box.x + box.width).toBeLessThanOrEqual(g.width + EPS)
    expect(box.width).toBeGreaterThan(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(layout.height + EPS)
  }
  // Each slab sits on its own row.
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const slab of layout.slabs) {
    const row = byId.get(slab.row)
    expect(row).toBeDefined()
    expect(slab.y).toBe(row!.y)
    expect(slab.height).toBe(row!.height)
  }
  // The now cursor on the track, through the CPU row and every slot row.
  expect(layout.now.x).toBeGreaterThanOrEqual(scale.x)
  expect(layout.now.x).toBeLessThanOrEqual(scale.x + scale.width + EPS)
  expect(layout.now.y0).toBe(rows[0].y)
  expect(layout.now.y1).toBeCloseTo(rows[rows.length - 1].y + rows[rows.length - 1].height, 9)
  // Axis labels never closer than the geometry allows.
  for (let i = 1; i < layout.axis.ticks.length; i++) expect(layout.axis.ticks[i].x - layout.axis.ticks[i - 1].x).toBeGreaterThanOrEqual(g.axisLabelGap - EPS)
}

describe('the queue on a track that scrolls inside a narrower box', () => {
  const view = { ...night(4, [5, 9, 3, 7, 12, 4], 6), waiting: [0, 1, 2, 3, 4, 5, 6] }

  test('only the chips that show are drawn, one place is kept for the count of the rest, and a wide box changes nothing', () => {
    const track = FRAME_PHONE.width - FRAME_PHONE.labelWidth
    const whole = laneLayout(view, FRAME_PHONE)
    const visible = 250 - FRAME_PHONE.labelWidth
    const cut = laneLayout(view, FRAME_PHONE, visible)
    expect(cut.queue.chips.length + cut.queue.more).toBe(view.waiting.length)
    expect(cut.queue.more).toBeGreaterThan(0)
    for (const chip of cut.queue.chips) expect(chip.x - FRAME_PHONE.labelWidth + chip.width).toBeLessThanOrEqual(visible - FRAME_PHONE.chipWidth)
    expect(laneLayout(view, FRAME_PHONE, track + 50).queue).toEqual(whole.queue)
  })
})

describe('one tick maps to one x', () => {
  const view = night(4, [5, 9, 3, 7, 12, 4], 6)
  const layout = laneLayout(view)

  test('the scale is affine: each tick is the same width, and xOf is the identity on the track edges', () => {
    const { scale } = layout
    expect(scale.pxPerTick).toBeCloseTo((DESK.width - DESK.labelWidth) / DESK.windowTicks, 9)
    expect(scale.pxPerTick * DESK.windowTicks).toBeCloseTo(scale.width, 9)
    expect(xOf(scale, scale.start)).toBe(scale.x)
    expect(xOf(scale, scale.end)).toBeCloseTo(scale.x + scale.width, 9)
    for (let t = scale.start; t < scale.end; t++) expect(xOf(scale, t + 1) - xOf(scale, t)).toBeCloseTo(scale.pxPerTick, 9)
  })

  test('every slab, idle box, axis tick and the cursor lands at xOf of its own tick', () => {
    const { scale } = layout
    for (const slab of layout.slabs) {
      expect(slab.x).toBeCloseTo(xOf(scale, Math.max(slab.startUs, scale.start)), 9)
      expect(slab.x + slab.width).toBeCloseTo(xOf(scale, slab.endUs), 9)
    }
    for (const box of layout.idle) expect(box.x + box.width).toBeCloseTo(xOf(scale, box.endUs), 9)
    for (const tick of layout.axis.ticks) expect(tick.x).toBeCloseTo(xOf(scale, tick.t), 9)
    expect(layout.now.x).toBeCloseTo(xOf(scale, view.clockUs), 9)
  })

  test('a tick has one x on every row: the CPU phase that ends a forward starts where the forward ends', () => {
    const forwards = layout.slabs.filter((slab) => slab.row === 'slot-0' && !slab.clipped)
    const syncs = layout.slabs.filter((slab) => slab.row === 'cpu' && slab.kind === 'sync')
    expect(forwards.length).toBeGreaterThan(0)
    for (const forward of forwards) {
      const sync = syncs.find((s) => s.startUs === forward.endUs)
      expect(sync).toBeDefined()
      expect(sync!.x).toBeCloseTo(forward.x + forward.width, 9)
      // Every slot row's slab of the same forward has the same x and width.
      for (const other of layout.slabs.filter((slab) => slab.kind === 'forward' && slab.step === forward.step)) {
        expect(other.x).toBe(forward.x)
        expect(other.width).toBe(forward.width)
      }
    }
  })

  test('the window slides only once now passes three quarters of it, and keeps the scale', () => {
    expect(windowStart(0, 28)).toBe(0)
    expect(windowStart(21, 28)).toBe(0)
    expect(windowStart(22, 28)).toBe(1)
    const long = laneLayout(night(4, [30, 30, 30, 30], 12))
    expect(long.scale.start).toBeGreaterThan(0)
    expect(long.scale.pxPerTick).toBeCloseTo(layout.scale.pxPerTick, 9)
    expect(long.slabs.every((slab) => slab.endUs > long.scale.start)).toBe(true)
    // A slab that began before the window is cut at the track's edge, and keeps the scale from there.
    let cut = 0
    for (let windowTicks = 20; windowTicks <= 40; windowTicks++) {
      const g = { ...DESK, windowTicks }
      const at = laneLayout(night(4, [30, 30, 30, 30], 12), g)
      for (const slab of at.slabs.filter((s) => s.startUs < at.scale.start)) {
        cut++
        expect(slab.clipped).toBe(true)
        expect(slab.x).toBe(at.scale.x)
        expect(slab.width).toBeCloseTo((slab.endUs - at.scale.start) * at.scale.pxPerTick, 9)
      }
      expect(at.slabs.filter((s) => s.clipped).every((s) => s.startUs < at.scale.start)).toBe(true)
    }
    expect(cut).toBeGreaterThan(0)
  })

  test('the axis steps by 1, 2 or 5 of a decade', () => {
    expect(axisStep(23.5, 40)).toBe(2)
    expect(axisStep(50, 40)).toBe(1)
    expect(axisStep(3, 40)).toBe(20)
    expect(axisStep(0.5, 40)).toBe(100)
    expect(laneLayout(night(4, [5], 0)).axis.ticks.map((tick) => tick.t)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28])
  })
})

describe('a gap between two forwards gives an idle box as wide as the CPU work in it', () => {
  // Async scheduling off: after each forward the CPU reads it back (sync) and plans the next step (schedule) while the GPU waits.
  const view = night(4, [6, 6, 6, 6], 3)
  const layout = laneLayout(view)
  const closed = layout.idle.filter((box) => box.before !== null)

  test('one idle box per gap, ending where the next forward starts', () => {
    expect(view.fires.length).toBe(3)
    expect(closed.map((box) => box.before)).toEqual([1, 2])
    for (const box of closed) {
      const next = view.fires[box.before!]
      const prev = view.fires[box.before! - 1]
      expect(box.startUs).toBe(prev.endUs)
      expect(box.endUs).toBe(next.startUs)
      expect(box.ticks).toBe(next.bubbleUs)
    }
  })

  test("its width is the CPU's work in the gap, and it covers every slot row", () => {
    for (const box of closed) {
      const work = layout.slabs.filter((slab) => slab.row === 'cpu' && slab.startUs >= box.startUs && slab.endUs <= box.endUs)
      expect(work.map((slab) => slab.kind)).toEqual(['sync', 'schedule'])
      const cpuWidth = work.reduce((sum, slab) => sum + slab.width, 0)
      expect(box.width).toBeCloseTo(cpuWidth, 9)
      // The tick card: 1 tick of sync and 2 of schedule [the card's design parameters].
      expect(box.ticks).toBe(3)
      const slots = layout.rows.filter((row) => row.lane === 'gpu')
      expect(box.y).toBe(slots[0].y)
      expect(box.y + box.height).toBeCloseTo(slots[slots.length - 1].y + slots[slots.length - 1].height, 9)
    }
  })

  test('while the GPU waits on the CPU, an open idle box runs from the latest forward to now', () => {
    const open = layout.idle.find((box) => box.before === null)
    const last = view.fires[view.fires.length - 1]
    expect(open).toBeDefined()
    expect(open!.startUs).toBe(last.endUs)
    expect(open!.endUs).toBe(view.clockUs)
  })

  test('with async scheduling on, the idle boxes shrink with the gaps', () => {
    const level = handLevel([6, 6, 6, 6], { overlap: 'free' })
    const state = houseNight(level, { overlap: true })
    const overlapped = laneLayout(loopView(state))
    const gaps = overlapped.idle.filter((box) => box.before !== null)
    for (const box of gaps) expect(box.ticks).toBe(loopView(state).fires[box.before!].bubbleUs)
    expect(gaps.reduce((sum, box) => sum + box.ticks, 0)).toBeLessThan(closed.reduce((sum, box) => sum + box.ticks, 0))
  })
})

describe('the layout holds for 4 and for 64 slots', () => {
  for (const slots of [4, 64]) {
    const outputs = Array.from({ length: slots + 8 }, (_, i) => 2 + (i % 7))
    for (const [name, g] of [
      ['desk', DESK],
      ['phone', PHONE],
    ] as const) {
      test(`${slots} slots, ${name}`, () => {
        for (const steps of [0, 1, 3, 9]) {
          const view = night(slots, outputs, steps)
          const layout = laneLayout(view, g)
          holds(layout, g, slots)
          // One slab per slot row for every forward in the window, carrying what the step did in that slot.
          const inWindow = view.fires.filter((fire) => fire.endUs > layout.scale.start)
          expect(layout.slabs.filter((slab) => slab.kind === 'forward').length).toBe(inWindow.length * slots)
          for (const fire of inWindow) {
            for (let slot = 0; slot < slots; slot++) {
              const slab = layout.slabs.find((s) => s.id === `slot-${slot}/${fire.index}`)!
              const place = fire.places[slot]
              expect(slab.use).toBe(place.state === 'plate' ? 'token' : place.state === 'binned' ? 'ghost' : 'empty')
              expect(slab.req).toBe(place.req)
            }
          }
        }
      })
    }
  }

  test('4 slots get full-height rows with a label each; 64 share the room and label every k-th', () => {
    const four = laneLayout(night(4, [3, 3, 3, 3, 3], 1))
    const slots4 = four.rows.filter((row) => row.lane === 'gpu')
    expect(slots4.every((row) => row.height === DESK.slotHeight && row.label !== null)).toBe(true)
    const sixtyFour = laneLayout(night(64, Array.from({ length: 64 }, () => 3), 1))
    const slots64 = sixtyFour.rows.filter((row) => row.lane === 'gpu')
    expect(slots64[0].height).toBeCloseTo((DESK.lanesHeight - DESK.cpuHeight - DESK.axisHeight) / 64, 9)
    const labelled = slots64.filter((row) => row.label !== null)
    const every = Math.ceil(MIN_LABELLED_ROW / slots64[0].height)
    expect(labelled.map((row) => row.slot)).toEqual(slots64.filter((_, i) => i % every === 0).map((row) => row.slot))
  })

  test("each slot's label holds the request in it now, or reads empty", () => {
    let state = initState(handLevel([4, 4, 4, 4, 4, 4], { slots: 4 }))
    state = hang(hang(state, 0), 1)
    const layout = laneLayout(loopView(state))
    const labels = layout.rows.filter((row) => row.lane === 'gpu').map((row) => row.label)
    expect(labels).toEqual([`${LANE_WORDS.slot(0)} · R1`, `${LANE_WORDS.slot(1)} · R2`, `${LANE_WORDS.slot(2)} · ${LANE_WORDS.empty}`, `${LANE_WORDS.slot(3)} · ${LANE_WORDS.empty}`])
    expect(layout.queue.chips.map((chip) => chip.label)).toEqual(['R3', 'R4', 'R5', 'R6'])
    expect(requestName(0)).toBe('R1')
  })

  test('a queue longer than the track shows what fits and counts the rest', () => {
    const view = night(4, Array.from({ length: 30 }, () => 3), 0)
    const layout = laneLayout(view)
    const fit = Math.floor((DESK.width - DESK.labelWidth + DESK.chipGap) / (DESK.chipWidth + DESK.chipGap))
    expect(layout.queue.chips.length).toBe(fit)
    expect(layout.queue.more).toBe(30 - fit)
  })

  test('a step loop has a slot', () => {
    expect(() => laneLayout({ ...night(4, [3], 0), slots: 0 })).toThrow(RangeError)
  })
})

describe('the demo levels', () => {
  test("every demo level's first state and its reference run lay out on both geometries", () => {
    for (const id of LEVEL_IDS) {
      const level = buildLevel(id, 1)
      for (const state of [initState(level), loopGhost(level)]) {
        const view = loopView(state)
        for (const g of [DESK, PHONE]) holds(laneLayout(view, g), g, level.slots)
      }
    }
  })

  test('the same view gives the same layout', () => {
    const view = night(4, [5, 9, 3, 7], 4)
    expect(JSON.stringify(laneLayout(view))).toBe(JSON.stringify(laneLayout(view)))
  })
})

describe('a dimension line across every closed idle box, and the sizes the pages draw at', () => {
  test('each closed idle box has one dimension line, edge to edge, at the middle of the GPU rows, with its value in ticks', () => {
    const view = night(4, [6, 6, 6, 6], 3)
    const layout = laneLayout(view)
    const closed = layout.idle.filter((box) => box.before !== null)
    expect(layout.dims.map((dim) => dim.id)).toEqual(closed.map((box) => `dim/${box.before}`))
    const slots = layout.rows.filter((row) => row.lane === 'gpu')
    const mid = slots[0].y + (slots[slots.length - 1].y + slots[slots.length - 1].height - slots[0].y) / 2
    for (const [i, dim] of layout.dims.entries()) {
      expect(dim.x0).toBeCloseTo(closed[i].x, 9)
      expect(dim.x1).toBeCloseTo(closed[i].x + closed[i].width, 9)
      expect(dim.y).toBeCloseTo(mid, 9)
      expect(dim.ticks).toBe(closed[i].ticks)
      expect(dim.label).toBe(LANE_WORDS.bubble(dim.ticks))
    }
    expect(LANE_WORDS.bubble(3)).toBe('bubble 3 ticks')
    expect(LANE_WORDS.bubble(1)).toBe('bubble 1 tick')
    // The open box, while the GPU waits, has no dimension yet: its width is still growing.
    expect(layout.dims.some((dim) => dim.id === 'dim/null')).toBe(false)
  })

  test('the dock draws the lanes at 464 x 240, and the frame\'s sizes hold on every demo level', () => {
    expect(DOCK.width).toBe(464)
    expect(DOCK.queueHeight + DOCK.queueGap + DOCK.lanesHeight).toBe(240)
    for (const id of LEVEL_IDS) {
      const level = buildLevel(id, 1)
      for (const state of [initState(level), loopGhost(level)]) {
        const view = loopView(state)
        for (const g of [DOCK, FRAME_DESK, FRAME_PHONE]) holds(laneLayout(view, g), g, level.slots)
        expect(laneLayout(view, DOCK).height).toBeLessThanOrEqual(240)
      }
    }
  })

  test('a box narrower than the ticks need is laid out wider, so the track scrolls inside it; a wide box keeps its width', () => {
    const phone = fitGeometry(FRAME_PHONE, 342)
    expect(phone.width).toBe(FRAME_PHONE.labelWidth + FRAME_PHONE.windowTicks * MIN_PX_PER_TICK)
    expect(phone.width).toBeGreaterThan(342)
    expect(fitGeometry(FRAME_DESK, 872).width).toBe(872)
    const layout = laneLayout(night(4, [8, 8, 8, 8], 4), phone)
    expect(layout.scale.pxPerTick).toBeGreaterThanOrEqual(MIN_PX_PER_TICK - EPS)
  })
})

describe("the state table's window moves by whole steps", () => {
  const level = buildLevel('first-4-par', 1)
  const states = [...statesOfHouseNight(level, { overlap: false })]
  const last = loopView(states[states.length - 1])

  test('the table lists the last 76 ticks of the run', () => {
    expect(TABLE_TICKS).toBe(76)
  })

  test('while the run fits it starts at 0, and nothing is hidden', () => {
    const early = loopView(states[6])
    expect(early.clockUs).toBeLessThanOrEqual(TABLE_TICKS)
    expect(stepsWindow(early, TABLE_TICKS)).toMatchObject({ startUs: 0, hidden: 0 })
  })

  test('after that it starts at the plan of the oldest step that lets the run end inside the window, and the older steps are counted, not listed', () => {
    const shown = stepsWindow(last, TABLE_TICKS)
    expect(last.clockUs).toBeGreaterThan(TABLE_TICKS)
    expect(shown.hidden).toBeGreaterThan(0)
    expect(shown.fires.length + shown.hidden).toBe(last.fires.length)
    const plan = last.cpu.find((span) => span.step === shown.fires[0].index && span.kind === 'schedule')
    expect(shown.startUs).toBe(plan?.startUs)
    expect(last.clockUs - shown.startUs).toBeLessThanOrEqual(TABLE_TICKS)
    const before = last.cpu.find((span) => span.step === shown.fires[0].index - 1 && span.kind === 'schedule')
    expect(before === undefined || last.clockUs - before.startUs > TABLE_TICKS).toBe(true)
  })

  test("a step on the GPU that began before the window is kept: overlap's work runs into the window and is not cut away", () => {
    for (const state of statesOfHouseNight(level, { overlap: true })) {
      const view = loopView(state)
      const shown = stepsWindow(view, TABLE_TICKS)
      for (const fire of view.fires) if (fire.endUs > shown.startUs) expect(shown.fires).toContain(fire)
    }
  })
})
