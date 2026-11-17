/*
 * R-T18: the step loop's 3D time track (src/games/loop/Scene3D.tsx; REDESIGN §2.8, §2.9, P7). The scene draws a flat model of the
 * 2D diagram (track-layout.ts, full/track.ts) through six cameras (track-presets.ts). These tests hold it to the brief:
 *   - the Side camera is the 2D diagram: a tick's x through its projection equals the 2D layout's x within 1 px, on a demo level and on a
 *     full level;
 *   - Lifted is Side tilted: time still runs left to right, and the slots recede in depth;
 *   - Compare stacks static batching, continuous batching and async scheduling, and its one authored move (640 ms) closes the gaps;
 *   - Scale draws 64 slots and more than 10,000 instances;
 *   - nothing glows but the cursor, and there is no environment map, fog, bloom or steam;
 *   - every word is a label (DOM), in the engine's terms, and the scene imports nothing from src/scene/props.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from 'three'
import { hang, initState, step } from '@es/play/loop/engine'
import { laneLayout } from '@es/play/loop/lanes'
import { fullLaneLayout } from '@es/play/loop/full/lanes'
import { fullSession } from '@es/play/loop/full/session'
import type { FullAction, FullLevelId, FullState } from '@es/play/loop/full/types'
import { loopView } from '@es/play/loop/session'
import type { LoopState } from '@es/play/loop/types'
import { findBanned } from '@/copy/banned'
import { fullTrack, fullTrackGeometry } from '@/games/loop/full/track'
import { COMPARE_BANDS, compareTrack, demoTrack, SCALE_SLOTS, SCALE_STEPS, scaleTrack, trackGeometry } from '@/games/loop/track-layout'
import { cameraLabel, DEFAULT_CAMERA, LIFT_DEG, nextCamera, TRACK_CAMERAS, trackPresets, type Canvas } from '@/games/loop/track-presets'
import type { CameraPreset, Framing } from '@/scene/camera-rig'
import { framingFor } from '@/scene/camera-rig'
import { morphModel, MORPH_MS, PX, type FlatModel } from '@/scene/flat-track'
import { handLevel } from './loop-support'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

/** A demo night by hand: every free slot filled before each step. */
function demoNight(outputs: readonly number[], steps: number) {
  let state: LoopState = initState(handLevel(outputs, { slots: 4, overlap: 'locked' }))
  const fill = (s: LoopState) => {
    let next = s
    while (next.waiting.length > 0 && next.tray.includes(null)) next = hang(next, next.waiting[0])
    return next
  }
  for (let i = 0; i < steps; i++) state = step(fill(state))
  return loopView(state)
}

/** A full level's night: the prediction committed, `n` steps rung. */
function fullNight(id: FullLevelId, n: number, ...levers: FullAction[]) {
  let s: FullState = fullSession.init(fullSession.level(id, 0))
  for (const action of [{ t: 'commit', prediction: 0 } as FullAction, ...levers]) s = fullSession.reduce(s, action)
  for (let i = 0; i < n && fullSession.view(s).canFire; i++) s = fullSession.reduce(s, { t: 'run', until: 'step' })
  return fullSession.view(s)
}

/** A camera placed as the kit's CameraRig places it (src/scene/CameraRig.tsx): position, y up, look at the target, the frustum. */
function placed(preset: CameraPreset, canvas: Canvas): Camera {
  const framing: Required<Framing> = framingFor(preset, canvas.width)
  const aspect = canvas.width / canvas.height
  const camera = preset.projection === 'orthographic' ? new OrthographicCamera(-1, 1, 1, -1, 0.05, 200) : new PerspectiveCamera(framing.fov, aspect, 0.05, 200)
  camera.position.set(...framing.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(...framing.target)
  if (camera instanceof OrthographicCamera) {
    const half = framing.viewHeight / 2
    Object.assign(camera, { top: half, bottom: -half, left: -half * aspect, right: half * aspect })
  } else {
    const [sx, sy] = framing.shift
    if (sx !== 0 || sy !== 0) camera.setViewOffset(canvas.width, canvas.height, (-sx * canvas.height) / 2, (-sy * canvas.height) / 2, canvas.width, canvas.height)
  }
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

/** A point of the plate, in its px, on the canvas, in CSS px. */
function project(camera: Camera, canvas: Canvas, x: number, y: number, z: number): { x: number; y: number; depth: number } {
  const v = new Vector3(x / PX, y / PX, z / PX).project(camera)
  return { x: ((v.x + 1) / 2) * canvas.width, y: ((1 - v.y) / 2) * canvas.height, depth: v.z }
}

const preset = (model: FlatModel, canvas: Canvas, id: string) => trackPresets(model, canvas, model.cursors[0]?.x ?? 0).find((p) => p.id === id) as CameraPreset

describe('the cameras', () => {
  test('six, in the brief\'s words, with Lifted first: C steps through every one and wraps', () => {
    expect(TRACK_CAMERAS.map((camera) => camera.label)).toEqual(['Lifted', 'Side', 'Along time', 'Top', 'Compare', 'Scale'])
    expect(DEFAULT_CAMERA).toBe('lifted')
    let at: string = DEFAULT_CAMERA
    const seen = [at]
    for (let i = 1; i < TRACK_CAMERAS.length; i++) seen.push((at = nextCamera(at)))
    expect(seen).toEqual(TRACK_CAMERAS.map((camera) => camera.id))
    expect(nextCamera(at)).toBe(DEFAULT_CAMERA)
    expect(cameraLabel('compare')).toBe('Compare')
  })
})

describe('Side is the 2D diagram (P7)', () => {
  const canvas: Canvas = { width: 868, height: 520 }

  test('a demo level: every tick of the axis, and every slab\'s edges, land at the 2D layout\'s x within 1 px', () => {
    const view = demoNight([5, 9, 3, 7, 12, 4], 4)
    const model = demoTrack(view, canvas.width)
    const { geometry, pad } = trackGeometry(canvas.width)
    const layout = laneLayout(view, geometry)
    const camera = placed(preset(model, canvas, 'side'), canvas)
    expect(layout.axis.ticks.length).toBeGreaterThan(3)
    // The 2D view draws its track `pad` px in from the figure's edge (View2D.tsx): the same x in the same box.
    for (const tick of layout.axis.ticks) expect(Math.abs(project(camera, canvas, pad + tick.x, 0, pad + layout.axis.y).x - (pad + tick.x))).toBeLessThan(1)
    for (const slab of layout.slabs) {
      expect(Math.abs(project(camera, canvas, pad + slab.x, 0, pad + slab.y).x - (pad + slab.x))).toBeLessThan(1)
      // Its rows too: z on the plate is the 2D diagram's y.
      expect(Math.abs(project(camera, canvas, pad + slab.x, 0, pad + slab.y).y - (pad + slab.y))).toBeLessThan(1)
    }
    // And the model's own tick marks are those ticks.
    const ticks = model.labels.filter((label) => label.kind === 'tick')
    expect(ticks.map((label) => label.at[0])).toEqual(layout.axis.ticks.map((tick) => pad + tick.x))
  })

  test('a full level: a microsecond tick lands at the full 2D layout\'s x within 1 px', () => {
    const view = fullNight('async', 4)
    const model = fullTrack(view, canvas.width)
    const { geometry, pad } = fullTrackGeometry(canvas.width)
    const layout = fullLaneLayout(view, geometry)
    const camera = placed(preset(model, canvas, 'side'), canvas)
    expect(layout.axis.ticks.length).toBeGreaterThan(2)
    for (const tick of layout.axis.ticks) expect(Math.abs(project(camera, canvas, pad + tick.x, 0, 0).x - (pad + tick.x))).toBeLessThan(1)
    for (const mark of layout.marks) expect(Math.abs(project(camera, canvas, pad + mark.x, 0, 0).x - (pad + mark.x))).toBeLessThan(1)
  })
})

describe('Lifted is Side tilted', () => {
  const canvas: Canvas = { width: 868, height: 520 }
  const view = demoNight([5, 9, 3, 7, 12, 4], 3)
  const model = demoTrack(view, canvas.width)
  const lifted = preset(model, canvas, 'lifted')
  const camera = placed(lifted, canvas)

  test('turned only about the time axis, by the lift', () => {
    expect(lifted.position[0]).toBeCloseTo(lifted.target[0], 9)
    const [, dy, dz] = [0, lifted.position[1] - lifted.target[1], lifted.position[2] - lifted.target[2]]
    expect((Math.atan2(dz, dy) * 180) / Math.PI).toBeCloseTo(LIFT_DEG, 6)
  })

  test('time still runs left to right, and the slots recede in depth', () => {
    const z = model.bounds.z0 + (model.bounds.z1 - model.bounds.z0) / 2
    const xs = [100, 300, 500, 700].map((x) => project(camera, canvas, x, 0, z).x)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
    // Slot 1 is the farthest row and slot 4 the nearest: each one deeper than the next, and higher on the screen.
    const slots = model.labels.filter((label) => label.kind === 'row' && /^slot /.test(label.text)).map((label) => project(camera, canvas, 400, 0, label.at[2]))
    expect(slots).toHaveLength(4)
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i - 1].depth).toBeGreaterThan(slots[i].depth)
      expect(slots[i - 1].y).toBeLessThan(slots[i].y)
    }
  })
})

describe('Compare: static, continuous and async, and the gaps close', () => {
  const { model, from } = compareTrack()
  const idle = (m: FlatModel, band: string) => m.wires.filter((w) => w.id.startsWith(`${band}/idle/`)).reduce((sum, w) => sum + (w.x1 - w.x0), 0)

  test('three bands, each named, on one time axis', () => {
    expect(COMPARE_BANDS.map((band) => band.name)).toEqual(['Static batching', 'Continuous batching', 'Async scheduling'])
    for (const band of COMPARE_BANDS) expect(model.labels.some((label) => label.kind === 'band' && label.text === band.name)).toBe(true)
    expect(model.cursors).toHaveLength(3)
    expect(model.labels.some((label) => label.kind === 'caption' && /synthetic/.test(label.text))).toBe(true)
  })

  test('async scheduling closes the gaps that continuous batching leaves, and the move starts from continuous batching', () => {
    expect(idle(model, 'continuous')).toBeGreaterThan(0)
    expect(idle(model, 'async')).toBeLessThan(idle(model, 'continuous'))
    expect(idle(from, 'async')).toBeCloseTo(idle(model, 'continuous'), 6)
    // The other two bands do not move.
    expect(from.boxes.filter((b) => !b.id.startsWith('async/'))).toEqual(model.boxes.filter((b) => !b.id.startsWith('async/')))
  })

  test('one authored move of 640 ms: from the start to the end, by id, through every share between', () => {
    expect(MORPH_MS).toBe(640)
    expect(morphModel(from, model, 1)).toBe(model)
    const start = morphModel(from, model, 0)
    expect(idle(start, 'async')).toBeCloseTo(idle(from, 'async'), 6)
    const half = idle(morphModel(from, model, 0.5), 'async')
    expect(half).toBeLessThan(idle(from, 'async'))
    expect(half).toBeGreaterThan(idle(model, 'async') - 1e-6)
  })

  test('the scene plays it on Compare and draws it at its end under reduced motion', () => {
    const scene = read('src/games/loop/Scene3D.tsx')
    expect(scene).toContain("from={camera === 'compare' ? compare?.from : null}")
    const track = read('src/scene/FlatTrack.tsx')
    expect(track).toMatch(/const moving = !!from && !kit\.reducedMotion/)
  })
})

describe('Scale: 64 slots, and more than 10,000 instances', () => {
  const model = scaleTrack()

  test(`${SCALE_SLOTS} slots for ${SCALE_STEPS} steps`, () => {
    const slots = new Set(model.boxes.filter((b) => b.id.startsWith('scale/slot-')).map((b) => b.id.split('/')[1]))
    expect(slots.size).toBe(SCALE_SLOTS)
    const steps = new Set(model.boxes.filter((b) => b.id.startsWith('scale/slot-')).map((b) => b.id.split('/')[2]))
    expect(steps.size).toBe(SCALE_STEPS)
  })

  test('the instanced meshes hold more than 10,000 instances, in the same eight draws as any model', () => {
    // FlatTrack draws the plates, the solids and the cursor as instances (the contact shadows too, where a box has one).
    const instances = model.plates.length + model.boxes.length + model.boxes.filter((b) => b.shadow !== false).length + model.cursors.length * 2
    expect(instances).toBeGreaterThanOrEqual(10_000)
    expect(read('src/scene/FlatTrack.tsx')).toContain('eight, so a model of 64 slots and 160 steps')
  })
})

describe('the demo track draws the run', () => {
  const view = demoNight([5, 9, 3, 7, 12, 4], 4)
  const model = demoTrack(view, 868)

  test('a slab per CPU call and per slot per step, idle as dashed wires, the cursor at now', () => {
    const layout = laneLayout(view, trackGeometry(868).geometry)
    const solids = layout.slabs.filter((slab) => slab.use !== 'empty')
    const empty = layout.slabs.filter((slab) => slab.use === 'empty')
    expect(model.boxes.filter((b) => !b.id.startsWith('chip/'))).toHaveLength(solids.length)
    expect(model.wires).toHaveLength(empty.length + layout.idle.length)
    for (const wire of model.wires) expect(wire.form).toBe('hollow')
    expect(model.cursors).toHaveLength(1)
    expect(model.cursors[0].x).toBeCloseTo(trackGeometry(868).pad + layout.now.x, 9)
    // Each slab stands on a contact shadow; the plates do not.
    expect(model.boxes.every((b) => b.shadow !== false)).toBe(true)
    expect(model.plates.every((b) => b.shadow === false)).toBe(true)
    // A waiting request's chip is a pick that admits it.
    for (const req of view.waiting.slice(0, layout.queue.chips.length)) expect(model.boxes.some((b) => b.pick === `req:${req}`)).toBe(true)
  })

  test('the reference run stands among the slabs as ink outlines up to now: left out where the learner matched it, standing in a gap where not', () => {
    // A learner who admitted one request and ran three steps, against a reference that filled every slot: the reference's tokens on the
    // three slots the learner left empty stand as outlines in the learner's gaps.
    let lone: LoopState = hang(initState(handLevel([5, 9, 3, 7, 12, 4], { slots: 4, overlap: 'locked' })), 0)
    for (let i = 0; i < 3; i++) lone = step(lone)
    const behind = loopView(lone)
    const full = demoNight([5, 9, 3, 7, 12, 4], 4)
    const plain = demoTrack(behind, 868)
    const drawn = demoTrack(behind, 868, full)
    const extra = drawn.inks.slice(plain.inks.length)
    // Five segments a token: the four edges of its top and its foot's near edge.
    expect(extra.length).toBeGreaterThan(0)
    expect(extra.length % 5).toBe(0)
    // Nothing past the learner's now is drawn: the reference is cut at the learner's clock.
    const nowX = drawn.cursors[0].x
    for (const ink of extra) expect(Math.max(ink.x0, ink.x1)).toBeLessThanOrEqual(nowX + 1)
    // An outline's top stands over a token's slab and over the dashed idle box in the same gap, so the two never draw as one line.
    const tops = extra.filter((ink) => (ink.y ?? 0) > 1)
    expect(tops.length).toBeGreaterThan(0)
    for (const ink of tops) expect(ink.y).toBeGreaterThan(Math.max(...drawn.wires.map((wire) => (wire.y0 ?? 0) + wire.height)))
    expect(drawn.labels.some((label) => label.id === 'reference')).toBe(true)
    expect(plain.labels.some((label) => label.id === 'reference')).toBe(false)
    // A learner who matched the reference token for token draws no outline at all: their slabs stand where the outlines would.
    const same = demoTrack(full, 868, full)
    expect(same.inks.length).toBe(demoTrack(full, 868).inks.length)
  })

  test('the now word stands under the axis\'s numbers at the cursor, so the tilt never sets it on the waiting queue\'s row', () => {
    for (const steps of [0, 1, 3]) {
      const night = demoNight([5, 9, 3, 7, 12, 4], steps)
      const track = demoTrack(night, 868)
      const now = track.labels.find((label) => label.kind === 'now')
      const ticks = track.labels.filter((label) => label.kind === 'tick')
      expect(now).toBeDefined()
      expect(now?.place).toBe('below')
      expect(now?.at[0]).toBe(track.cursors[0].x)
      for (const tick of ticks) expect(now?.at[2] ?? 0).toBeGreaterThan(tick.at[2])
    }
  })

  test('every word is a label, in the engine\'s terms', () => {
    const words = [...model.labels, ...compareTrack().model.labels, ...scaleTrack().labels, ...fullTrack(fullNight('graphs', 3), 868).labels].map((label) => label.text)
    expect(words).toContain('CPU · engine core thread')
    expect(words).toContain('now')
    for (const text of words) expect([text, findBanned(text)]).toEqual([text, []])
  })
})

describe('what the scene is made of', () => {
  const files = [
    'src/games/loop/Scene3D.tsx',
    'src/games/loop/track-layout.ts',
    'src/games/loop/track-presets.ts',
    'src/games/loop/full/track.ts',
    'src/scene/FlatTrack.tsx',
    'src/scene/flat-track.ts',
    'src/scene/flat-materials.ts',
    'src/scene/FlatLights.tsx',
  ]

  test('nothing from src/scene/props, nor the kitchen\'s layouts', () => {
    for (const file of files) {
      const source = read(file)
      expect([file, /from '(?:@\/scene|\.\.?)\/props/.test(source)]).toEqual([file, false])
      expect([file, /loop\/(?:layout|kitchen)'|scene-layout|scene-presets|full\/scene'/.test(source)]).toEqual([file, false])
    }
  })

  test('nothing glows but the cursor: no environment map, fog, bloom, steam, lamp or emissive', () => {
    const scene = read('src/games/loop/Scene3D.tsx')
    expect(scene).toContain('fog={null}')
    expect(scene).toContain('environment={false}')
    expect(scene).toContain('bloom={false}')
    for (const file of files) expect([file, /Steam|HeatLamps|HeatElements|emissive|LampLights/.test(read(file))]).toEqual([file, false])
    // The one unlit material in the scene's own set is the marker's, amber with its edge. Its colour comes per instance from the roles
    // (FlatTrack.tsx's cursor), on a white material, so the sheet is the marker's own #ffb547 and not that colour multiplied by itself.
    const materials = read('src/scene/flat-materials.ts')
    expect(materials.match(/new MeshBasicMaterial/g)).toHaveLength(2)
    expect(materials).toMatch(/name: 'flat-cursor', color: UNTINTED\(\), toneMapped: false/)
    expect(materials).toMatch(/name: 'flat-cursor-edge', color: UNTINTED\(\), toneMapped: false/)
    const track = read('src/scene/FlatTrack.tsx')
    expect(track).toContain("role: 'lamp',")
    expect(track).toContain("role: 'lamp-ring',")
  })

  test('the game\'s 3D switch points at the time track, which is the game\'s Scene3D.tsx, and the kitchen scene is gone', () => {
    expect(read('src/games/loop/Game.tsx')).toContain("const Scene3D = lazy(() => import('./Scene3D'))")
    expect(read('src/games/loop/FullService.tsx')).toContain("const Scene3D = lazy(() => import('./Scene3D'))")
    expect(read('src/games/loop/Scene3D.tsx')).toContain('export interface Scene3DProps')
    expect(read('src/games/loop/Scene3D.tsx')).toContain('<FlatTrack')
    for (const file of ['src/games/loop/TrackScene3D.tsx', 'src/games/loop/scene-layout.ts', 'src/games/loop/scene-presets.ts', 'src/games/loop/scene3d.css', 'src/games/loop/full/scene.ts']) {
      expect([file, existsSync(path.join(root, file))]).toEqual([file, false])
    }
  })
})
