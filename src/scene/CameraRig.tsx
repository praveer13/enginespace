import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from 'three'
import { framingFor, lerp, lerpVec, presetById, transitionMs, type CameraPreset, type Framing } from './camera-rig'
import { useKit } from './kit'

/*
 * CameraRig (ARCHITECTURE §6.4; GAMES.md §2.3, "Camera grammar"): the scene's named presets, moved by the DOM buttons and
 * the `C` key (CameraButtons.tsx, camera-rig.ts). A move animates over at most 400 ms on the settle curve, holding the
 * frame loop only while it moves; under reduced motion, and across a change of projection, it cuts. The Compare shot is a
 * true orthographic camera, so lengths never depend on depth.
 *
 * Free orbit is optional and never needed (WCAG 2.5.7): with `orbit`, three's OrbitControls load in their own chunk and
 * turn the camera about the preset's target by drag, with up kept up and the camera kept above the steel. Every view a drag
 * reaches has a preset button beside it.
 *
 * Parallax (scene kit v1) is a lean, not a move: with `parallax`, at T2 and up, a fine pointer over the canvas leans the camera a
 * few centimetres toward itself about the preset's target, easing there on the settle duration's pace, so the steel's highlights
 * slide as the reader looks around. It is off under reduced motion, for touch and a coarse pointer, and while orbit is on, and it
 * holds frames only while it eases.
 */

export interface CameraRigProps {
  presets: readonly CameraPreset[]
  /** The preset to show, by id. */
  preset: string
  /** Drag to orbit about the preset's target. Off by default. */
  orbit?: boolean
  /** How far the camera leans toward a fine pointer, in world units at T2 and up; 0, the default, for none. */
  parallax?: number
}

/** The lean's up and down, as a share of its side to side: a reader looks around more than up and down [estimated]. */
const LEAN_UP = 0.55

/** A framing with the camera leaned `lean` (each axis in [-1, 1]) times `amount` across and up its own view, about the same target. */
function leaned(framing: Required<Framing>, lean: { x: number; y: number }, amount: number): Required<Framing> {
  if (amount === 0 || (lean.x === 0 && lean.y === 0)) return framing
  const forward = new Vector3(...framing.target).sub(new Vector3(...framing.position)).normalize()
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize()
  const up = new Vector3().crossVectors(right, forward)
  const at = new Vector3(...framing.position).addScaledVector(right, lean.x * amount).addScaledVector(up, lean.y * amount * LEAN_UP)
  return { ...framing, position: [at.x, at.y, at.z] }
}

type Cameras = { perspective: PerspectiveCamera; orthographic: OrthographicCamera }

/** Places a camera on a framing for a canvas this size, and returns its distance to what it looks at. */
function place(camera: Camera, framing: Required<Framing>, width: number, height: number): number {
  const aspect = width / Math.max(1, height)
  camera.position.set(...framing.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(...framing.target)
  if ((camera as PerspectiveCamera).isPerspectiveCamera) {
    const perspective = camera as PerspectiveCamera
    perspective.fov = framing.fov
    perspective.aspect = aspect
    // A shifted lens: the frustum's window slides, so the picture's centre stands `shift` half heights right and down of the box's.
    const [sx, sy] = framing.shift
    if (sx !== 0 || sy !== 0) perspective.setViewOffset(width, height, (-sx * height) / 2, (-sy * height) / 2, width, height)
    else perspective.clearViewOffset()
    perspective.updateProjectionMatrix()
  } else {
    const orthographic = camera as OrthographicCamera
    const half = framing.viewHeight / 2
    orthographic.top = half
    orthographic.bottom = -half
    orthographic.left = -half * aspect
    orthographic.right = half * aspect
    orthographic.updateProjectionMatrix()
  }
  camera.updateMatrixWorld()
  const [px, py, pz] = framing.position
  const [tx, ty, tz] = framing.target
  return Math.hypot(px - tx, py - ty, pz - tz)
}

export function CameraRig({ presets, preset, orbit = false, parallax = 0 }: CameraRigProps) {
  const kit = useKit()
  const set = useThree((state) => state.set)
  const gl = useThree((state) => state.gl)
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  const [cameras] = useState<Cameras>(() => {
    const perspective = new PerspectiveCamera(30, 1, 0.05, 200)
    const orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.05, 200)
    // The rig owns their aspect and frustum: R3F must not reset them on a resize.
    Object.assign(perspective, { manual: true })
    Object.assign(orthographic, { manual: true })
    return { perspective, orthographic }
  })
  const shown = useRef<{ preset: CameraPreset | null; framing: Required<Framing> | null }>({ preset: null, framing: null })
  const move = useRef<{ from: Required<Framing>; to: Required<Framing>; startedAt: number; ms: number; release: (() => void) | null } | null>(null)
  // The lean: where the pointer asks the camera to lean, where it leans now, and the hold that keeps frames coming while it eases.
  const lean = useRef({ goal: { x: 0, y: 0 }, now: { x: 0, y: 0 }, release: null as (() => void) | null, base: null as Required<Framing> | null })
  const leanAmount = parallax > 0 && kit.tier >= 2 && !kit.reducedMotion && !orbit ? parallax : 0

  useLayoutEffect(() => {
    const next = presetById(presets, preset)
    const framing = framingFor(next, width)
    const camera = next.projection === 'orthographic' ? cameras.orthographic : cameras.perspective
    const previous = shown.current
    const changed = previous.preset?.id !== next.id
    const ms = changed ? transitionMs(previous.preset, next, kit.reducedMotion) : 0
    shown.current = { preset: next, framing }
    if (ms > 0 && previous.framing) {
      const release = move.current?.release ?? kit.hold()
      move.current = { from: previous.framing, to: framing, startedAt: performance.now(), ms, release }
    } else {
      move.current?.release?.()
      move.current = null
      lean.current.base = framing
      kit.focus(place(camera, leaned(framing, lean.current.now, leanAmount), width, height))
      kit.invalidate()
    }
    set({ camera })
  }, [presets, preset, width, height, cameras, kit, set, leanAmount])

  useEffect(() => {
    const held = move
    return () => held.current?.release?.()
  }, [])

  useFrame(() => {
    const m = move.current
    if (!m) return
    const t = Math.min(1, (performance.now() - m.startedAt) / m.ms)
    const e = kit.ease(t)
    const framing: Required<Framing> = {
      position: lerpVec(m.from.position, m.to.position, e),
      target: lerpVec(m.from.target, m.to.target, e),
      fov: lerp(m.from.fov, m.to.fov, e),
      viewHeight: lerp(m.from.viewHeight, m.to.viewHeight, e),
      shift: [lerp(m.from.shift[0], m.to.shift[0], e), lerp(m.from.shift[1], m.to.shift[1], e)],
    }
    const camera = shown.current.preset?.projection === 'orthographic' ? cameras.orthographic : cameras.perspective
    lean.current.base = framing
    kit.focus(place(camera, leaned(framing, lean.current.now, leanAmount), width, height))
    if (t >= 1) {
      m.release?.()
      move.current = null
    }
  }, -3)

  // The pointer over the canvas sets the lean's goal; leaving the canvas brings it back to the preset.
  useEffect(() => {
    const host = gl.domElement.parentElement
    const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches
    const state = lean.current
    const aim = (x: number, y: number) => {
      if (state.goal.x === x && state.goal.y === y) return
      state.goal = { x, y }
      state.release ??= kit.hold()
    }
    if (!host || leanAmount === 0 || !fine) {
      // No lean here: the layout effect above has already placed the camera on its preset, as a cut.
      state.goal = { x: 0, y: 0 }
      state.now = { x: 0, y: 0 }
      state.release?.()
      state.release = null
      return
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const box = host.getBoundingClientRect()
      const x = ((event.clientX - box.left) / Math.max(1, box.width)) * 2 - 1
      const y = 1 - ((event.clientY - box.top) / Math.max(1, box.height)) * 2
      aim(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)))
    }
    const onLeave = () => aim(0, 0)
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    return () => {
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [gl, kit, leanAmount])
  useEffect(() => {
    const state = lean.current
    return () => {
      state.release?.()
      state.release = null
    }
  }, [])

  // The lean eases toward its goal on the settle duration's pace, and lets the frames go when it gets there.
  useFrame((_, delta) => {
    const state = lean.current
    if (!state.release) return
    const { goal, now } = state
    const k = 1 - Math.exp((-delta * 1000) / Math.max(1, kit.tokens.motion.settleMs / 3))
    now.x += (goal.x - now.x) * k
    now.y += (goal.y - now.y) * k
    const done = Math.abs(goal.x - now.x) < 1e-3 && Math.abs(goal.y - now.y) < 1e-3
    if (done) state.now = { ...goal }
    if (!move.current && state.base) {
      const camera = shown.current.preset?.projection === 'orthographic' ? cameras.orthographic : cameras.perspective
      kit.focus(place(camera, leaned(state.base, state.now, leanAmount), width, height))
    }
    if (done) {
      state.release()
      state.release = null
    }
  }, -2)

  // Optional orbit, in its own chunk.
  const targetKey = framingFor(presetById(presets, preset), width).target.join(',')
  useEffect(() => {
    if (!orbit) return
    let alive = true
    let dispose: (() => void) | null = null
    void import('three/addons/controls/OrbitControls.js').then(({ OrbitControls }) => {
      if (!alive) return
      const camera = presetById(presets, preset).projection === 'orthographic' ? cameras.orthographic : cameras.perspective
      const controls = new OrbitControls(camera, gl.domElement)
      const [x, y, z] = targetKey.split(',').map(Number)
      controls.target.copy(new Vector3(x, y, z))
      controls.enableDamping = false
      controls.enablePan = false
      controls.maxPolarAngle = Math.PI * 0.46
      controls.minDistance = 2
      controls.maxDistance = 40
      const onChange = () => kit.invalidate()
      controls.addEventListener('change', onChange)
      controls.update()
      dispose = () => {
        controls.removeEventListener('change', onChange)
        controls.dispose()
      }
    })
    return () => {
      alive = false
      dispose?.()
    }
  }, [orbit, targetKey, presets, preset, cameras, gl, kit])

  return null
}
