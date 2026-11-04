import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from 'three'
import { framingFor, lerp, lerpVec, presetById, transitionMs, type CameraPreset, type Framing, type Vec3 } from './camera-rig'
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
 */

export interface CameraRigProps {
  presets: readonly CameraPreset[]
  /** The preset to show, by id. */
  preset: string
  /** Drag to orbit about the preset's target. Off by default. */
  orbit?: boolean
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

export function CameraRig({ presets, preset, orbit = false }: CameraRigProps) {
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
      kit.focus(place(camera, framing, width, height))
      kit.invalidate()
    }
    set({ camera })
  }, [presets, preset, width, height, cameras, kit, set])

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
    }
    const camera = shown.current.preset?.projection === 'orthographic' ? cameras.orthographic : cameras.perspective
    kit.focus(place(camera, framing, width, height))
    if (t >= 1) {
      m.release?.()
      move.current = null
    }
  }, -3)

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
      const [x, y, z] = targetKey.split(',').map(Number) as unknown as Vec3
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
