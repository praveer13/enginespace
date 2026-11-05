/*
 * W0-T15: the scene kit's arithmetic, with no WebGL. The marks' boxes and instance matrices, the time track, the camera
 * rig's presets and easing, the labels' projection, the selection model, the canvas lease, and the generated surface maps.
 */
import { describe, expect, test } from 'bun:test'
import { CAMERA_TRANSITION_MS, cubicBezier, easingFrom, framingFor, nextPreset, PORTRAIT_WIDTH, transitionMs, WIDE_WIDTH, type CameraPreset } from '@/scene/camera-rig'
import { labelTransform, ndcToScreen } from '@/scene/labels'
import { createLease } from '@/scene/lease'
import { capacityFor, cellBox, formIndex, gridPositions, MARK_FORMS, MIN_SPAN_DEPTH, spanBox, writeMatrices, writeMatrix } from '@/scene/marks'
import { EMPTY_SELECTION, pickedId, selectionReducer } from '@/scene/selection'
import { brushedField, crepeField, hash2, meanSlopes, normalMap, paperField, roughnessMap } from '@/scene/textures'
import { axisTicks, niceStep, scrollMs, tickLabel, trackOffset, trackZ } from '@/scene/time-axis'
import { ROLES } from '@/design/tokens'

describe('marks: boxes and instance matrices', () => {
  test('the four forms, in the order the mark shader numbers them', () => {
    expect(MARK_FORMS).toEqual(['solid', 'hollow', 'groove', 'marked'])
    expect(MARK_FORMS.map(formIndex)).toEqual([0, 1, 2, 3])
  })

  test('a span becomes a box on its lane, from its start to its end along the track, standing on its base', () => {
    const box = spanBox({ id: 's', lane: 2, start: 10, end: 14, width: 1.5, height: 0.1, base: 0.02, role: 'lane-gpu' }, { unitsPerTime: 0.5 })
    expect(box.center).toEqual([2, 0.07, 6])
    expect(box.size).toEqual([1.5, 0.1, 2])
    expect(box.form).toBe('solid')
    expect(box.role).toBe('lane-gpu')
  })

  test('a span of no length still shows as a sliver', () => {
    expect(spanBox({ id: 's', lane: 0, start: 5, end: 5, width: 1, height: 1, role: 'lane-cpu' }, { unitsPerTime: 1 }).size[2]).toBe(MIN_SPAN_DEPTH)
  })

  test('a cell stands on its base at its footprint', () => {
    const box = cellBox({ id: 'c', x: 1, z: -2, y: 0.1, width: 0.2, depth: 0.3, height: 0.04, role: 'cat-white', form: 'groove' })
    expect(box.center[0]).toBe(1)
    expect(box.center[1]).toBeCloseTo(0.12)
    expect(box.center[2]).toBe(-2)
    expect(box.size).toEqual([0.2, 0.04, 0.3])
    expect(box.form).toBe('groove')
  })

  test('matrices are column-major scale then translation, with no rotation: up stays up', () => {
    const matrices = writeMatrices([{ id: 'a', center: [1, 2, 3], size: [4, 5, 6], role: 'cat-red', form: 'solid' }])
    expect([...matrices]).toEqual([4, 0, 0, 0, 0, 5, 0, 0, 0, 0, 6, 0, 1, 2, 3, 1])
    expect(() => writeMatrices([{ id: 'a', center: [0, 0, 0], size: [1, 1, 1], role: 'cat-red', form: 'solid' }], new Float32Array(8))).toThrow()
  })

  test('the sweeping present cuts a mark at its near face, keeping its far face, and hides a mark wholly past it', () => {
    const box = { id: 'a', center: [0, 0, -1] as const, size: [1, 1, 2] as const, role: 'cat-red' as const, form: 'solid' as const }
    const out = new Float32Array(16)
    writeMatrix(box, out, 0, -1) // half of it shown: from -2 to -1
    expect(out[10]).toBeCloseTo(1)
    expect(out[14]).toBeCloseTo(-1.5)
    writeMatrix(box, out, 0, -3) // wholly past: a zero matrix
    expect([...out].every((value) => value === 0)).toBe(true)
    writeMatrix(box, out, 0) // no cut
    expect(out[10]).toBeCloseTo(2)
  })

  test('capacity grows in powers of two from 16', () => {
    expect([0, 1, 16, 17, 1000, 10_240].map(capacityFor)).toEqual([16, 16, 16, 32, 1024, 16_384])
  })

  test('grid positions run in rows of `columns`, each row further down -z', () => {
    expect(gridPositions(5, 2, [0, 0, 0], { x: 1, z: 2 })).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, -2],
      [1, 0, -2],
      [0, 0, -4],
    ])
  })
})

describe('the time track', () => {
  test('the present sits at z = 0 and the past recedes down -z', () => {
    const scale = { unitsPerTime: 0.25 }
    const now = 40
    const world = (t: number) => trackZ(t, scale) + trackOffset(now, scale)
    expect(world(now)).toBe(0)
    expect(world(now - 8)).toBe(-2)
  })

  test('ticks fall at round steps inside the window', () => {
    expect([1, 2, 5, 10, 20, 50].includes(niceStep(84, 7))).toBe(true)
    expect(niceStep(84, 7)).toBe(20)
    expect(axisTicks({ start: 3, now: 84 }, 7)).toEqual([20, 40, 60, 80])
    expect(axisTicks({ start: 0, now: 0 }, 7)).toEqual([])
    expect(niceStep(0, 5)).toBe(1)
  })

  test('the track slides over the bell, or jumps under reduced motion', () => {
    expect(scrollMs(240, false)).toBe(240)
    expect(scrollMs(240, true)).toBe(0)
  })

  test('a tick label is the clock and its unit; ticks print bare (the axis says synthetic)', () => {
    expect(tickLabel(40, 'ticks')).toBe('40')
    expect(tickLabel(40, 'µs')).toBe('40 µs')
  })
})

describe('the camera rig', () => {
  const presets: CameraPreset[] = [
    { id: 'a', label: 'A', shot: 'establish', projection: 'perspective', position: [0, 1, 2], target: [0, 0, 0], fov: 30, portrait: { position: [0, 2, 4], fov: 40 } },
    { id: 'b', label: 'B', shot: 'compare', projection: 'orthographic', position: [5, 5, 0], target: [0, 0, 0], viewHeight: 8 },
    { id: 'c', label: 'C', shot: 'top', projection: 'perspective', position: [0, 9, 0.1], target: [0, 0, 0] },
  ]

  test('C cycles the presets and wraps', () => {
    expect(nextPreset(presets, 'a')).toBe('b')
    expect(nextPreset(presets, 'c')).toBe('a')
    expect(nextPreset(presets, 'nope')).toBe('a')
    expect(() => nextPreset([], 'a')).toThrow()
  })

  test('below 480 px a preset takes its portrait framing, and from 1280 px its wide one', () => {
    expect(framingFor(presets[0], 1200)).toEqual({ position: [0, 1, 2], target: [0, 0, 0], fov: 30, viewHeight: 10, shift: [0, 0] })
    expect(framingFor(presets[0], PORTRAIT_WIDTH - 1)).toMatchObject({ position: [0, 2, 4], fov: 40 })
    expect(framingFor(presets[2], 1200).fov).toBe(30) // about 30° when a preset says nothing (GAMES.md §2.3)
    const wide: CameraPreset = { ...presets[0], wide: { shift: [1, 0] }, portrait: { shift: [0, 0.5] } }
    expect(framingFor(wide, WIDE_WIDTH - 1).shift).toEqual([0, 0])
    expect(framingFor(wide, WIDE_WIDTH)).toMatchObject({ position: [0, 1, 2], fov: 30, shift: [1, 0] })
    expect(framingFor(wide, PORTRAIT_WIDTH - 1).shift).toEqual([0, 0.5])
  })

  test('a move takes at most 400 ms, and cuts under reduced motion and across projections', () => {
    expect(CAMERA_TRANSITION_MS).toBeLessThanOrEqual(400)
    expect(transitionMs(presets[0], presets[2], false)).toBe(CAMERA_TRANSITION_MS)
    expect(transitionMs(presets[0], presets[2], true)).toBe(0)
    expect(transitionMs(presets[0], presets[1], false)).toBe(0)
    expect(transitionMs(null, presets[0], false)).toBe(0)
  })

  test("the rig eases on the design system's settle curve, which never overshoots or turns back", () => {
    const settle = ROLES['ease-settle'].value
    const ease = easingFrom(settle)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    let previous = 0
    for (let i = 1; i <= 100; i++) {
      const value = ease(i / 100)
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9)
      expect(value).toBeLessThanOrEqual(1 + 1e-9)
      previous = value
    }
    expect(ease(0.25)).toBeGreaterThan(0.5) // an exponential ease-out: fast away, long rest
    expect(easingFrom('steps(6, end)')(0.5)).toBe(0.5)
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 3)
  })
})

describe('labels', () => {
  test('a point in normalized device coordinates lands in CSS pixels, and hides behind the camera or off the canvas', () => {
    expect(ndcToScreen([0, 0, 0.5], { width: 200, height: 100 })).toEqual({ x: 100, y: 50, visible: true })
    expect(ndcToScreen([-1, 1, 0.5], { width: 200, height: 100 })).toEqual({ x: 0, y: 0, visible: true })
    expect(ndcToScreen([0, 0, 1.2], { width: 200, height: 100 }).visible).toBe(false)
    expect(ndcToScreen([3, 0, 0.5], { width: 200, height: 100 }).visible).toBe(false)
    expect(ndcToScreen([1.1, 0, 0.5], { width: 200, height: 100 }, 24).visible).toBe(true)
  })

  test('a label sits on whole pixels, on the side it asks for', () => {
    expect(labelTransform({ x: 10.4, y: 20.6, visible: true })).toBe('translate3d(10px, 21px, 0) translate(-50%, -50%)')
    expect(labelTransform({ x: 0, y: 0, visible: true }, 'right')).toBe('translate3d(0px, 0px, 0) translate(6px, -50%)')
  })
})

describe('selection: one model for picks and keys', () => {
  const ids = ['f1', 'f2', 'f3']

  test('a pick selects, and asks the list to take focus', () => {
    const state = selectionReducer(EMPTY_SELECTION, { type: 'select', id: 'f2', focus: true }, ids)
    expect(state).toEqual({ selected: 'f2', active: 'f2', focusTick: 1 })
    expect(selectionReducer(state, { type: 'select', id: 'nope' }, ids)).toBe(state)
  })

  test('arrows move the selection and stop at the ends; Home and End jump', () => {
    let state = selectionReducer(EMPTY_SELECTION, { type: 'move', by: 'next' }, ids)
    expect(state.selected).toBe('f1')
    state = selectionReducer(state, { type: 'move', by: 'previous' }, ids)
    expect(state.selected).toBe('f1')
    state = selectionReducer(state, { type: 'move', by: 'last' }, ids)
    expect(state.selected).toBe('f3')
    state = selectionReducer(state, { type: 'move', by: 'next' }, ids)
    expect(state.selected).toBe('f3')
    expect(selectionReducer(state, { type: 'move', by: 'first' }, ids).selected).toBe('f1')
  })

  test('an entity that leaves the list stops being selected', () => {
    const state = selectionReducer(EMPTY_SELECTION, { type: 'select', id: 'f3' }, ids)
    expect(selectionReducer(state, { type: 'sync', ids: ['f1', 'f2'] }, ids)).toMatchObject({ selected: null, active: null })
    expect(selectionReducer(state, { type: 'sync', ids }, ids)).toBe(state)
  })

  test("a pick's instance index resolves to its entity", () => {
    expect(pickedId(ids, 1)).toBe('f2')
    expect(pickedId(ids, undefined)).toBeNull()
    expect(pickedId(ids, 9)).toBeNull()
  })
})

describe('one live canvas per page', () => {
  test('the first Stage holds the lease; a second waits until it is free or takes it', () => {
    const lease = createLease()
    const seen: (string | null)[] = []
    lease.subscribe(() => seen.push(lease.holder()))
    expect(lease.acquire('a')).toBe(true)
    expect(lease.acquire('b')).toBe(false)
    lease.take('b')
    expect(lease.holder()).toBe('b')
    lease.release('a') // not the holder: nothing changes
    expect(lease.holder()).toBe('b')
    lease.release('b')
    expect(lease.holder()).toBeNull()
    expect(seen).toEqual(['a', 'b', null])
  })
})

describe('surface maps, generated in code', () => {
  test('the noise is seeded and tiles', () => {
    expect(hash2(3, 4, 7)).toBe(hash2(3, 4, 7))
    expect(hash2(3, 4, 7)).not.toBe(hash2(3, 4, 8))
    const a = brushedField(64, 7)
    const b = brushedField(64, 7)
    expect([...a.data]).toEqual([...b.data])
    for (const field of [a, paperField(64, 11), crepeField(64, 13)]) {
      expect(Math.min(...field.data)).toBe(0)
      expect(Math.max(...field.data)).toBe(1)
    }
  })

  test("brushed steel is brushed: its grain runs along u, so it changes far less along u than across", () => {
    const slopes = meanSlopes(brushedField(128, 7))
    expect(slopes.u * 3).toBeLessThan(slopes.v)
    const crepe = meanSlopes(crepeField(128, 13))
    expect(crepe.u).toBeGreaterThan(crepe.v) // the crepe's ridges run across the strip
  })

  test('a normal map holds unit normals that face out of the surface', () => {
    const map = normalMap(paperField(32, 11), 1.4)
    for (let i = 0; i < map.length; i += 4) {
      const [x, y, z] = [map[i], map[i + 1], map[i + 2]].map((v) => (v / 255) * 2 - 1)
      expect(Math.hypot(x, y, z)).toBeGreaterThan(0.97)
      expect(Math.hypot(x, y, z)).toBeLessThan(1.03)
      expect(z).toBeGreaterThan(0)
      expect(map[i + 3]).toBe(255)
    }
  })

  test("a roughness map stays within its base ± half its range, in three's green channel", () => {
    const map = roughnessMap(brushedField(32, 7), 0.36, 0.26)
    for (let i = 0; i < map.length; i += 4) {
      expect(map[i + 1] / 255).toBeGreaterThanOrEqual(0.36 - 0.13 - 0.01)
      expect(map[i + 1] / 255).toBeLessThanOrEqual(0.36 + 0.13 + 0.01)
    }
  })
})
