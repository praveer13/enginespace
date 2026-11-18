import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { VerifierView } from '@es/play/verifier/types'
import { CameraRig } from '@/scene/CameraRig'
import { FlatLights } from '@/scene/FlatLights'
import { FlatTrack } from '@/scene/FlatTrack'
import { toWorld } from '@/scene/flat-track'
import type { LabelSpec } from '@/scene/labels'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { labelsFor, skylineOf } from './scene-layout'
import { presetsOf, projectorOf, type Canvas } from './scene-plan'
import type { Shot } from './scene-shots'

/*
 * The rejection sampler's 3D scene (REDESIGN §2.8, §2.9): the chain's bars stood up as skylines on a pale base plate. It imports nothing
 * from src/scene/props: its parts are the kit's flat track (src/scene/FlatTrack.tsx), laid out by scene-layout.ts from the same view the
 * 2D diagram draws, so it draws the run and decides nothing. The page offers it on the chain only, from a desk's width.
 *
 * What depth is for: each draft position's skyline stands behind the one before on one height scale, so the learner sees, row against
 * row, how much of each position the target accepts (the green) before the chain stops.
 *
 *   - One row of bars for each draft position, into depth. Each token has two bars, the draft's q and the target's p, as tall as their
 *     counts out of the shared axis, and where the level lets it print, cut into the accepted part, the draft's excess and the residual,
 *     each in its code's colour and its form (hatched, solid, groove). A value scale stands at the front row's right end.
 *   - The output of the sampler is a collar on each target bar. As rounds are drawn the collar rises or falls onto p: the scene's one
 *     authored move, FlatTrack's slide of the bars from the view before to this one over 640 ms, drawn at its end under reduced motion.
 *   - Matte slabs on soft contact shadows with baked occlusion at their feet, at every tier. No environment map, no fog, no bloom.
 *   - Every word and number is DOM in the label layer.
 *   - Three cameras (scene-plan.ts), framed for the plate and the canvas it is drawn in.
 *
 * A lazy chunk of its own, which the Stage loads on a device whose tier draws 3D; the 2D diagram is its first paint and its fallback.
 */

export interface Scene3DProps {
  view: VerifierView
  /** The shots the page names (scene-shots.ts), and the one to show. The game holds it, so `C`, the buttons and a swap of views keep it. */
  shots: readonly Shot[]
  preset: string
  /** Draw each bar's cut, and what went out (rules.ts's showScaffold and showMeter). */
  scaffold: boolean
  outcome: boolean
}

/** The canvas's size before it is measured: about the desk's box [estimated]. */
const FIRST: Canvas = { width: 870, height: 540 }

/** The canvas's box, kept fresh as it resizes. */
function useCanvasSize(): [RefObject<HTMLDivElement | null>, Canvas] {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Canvas>(FIRST)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    const read = () => {
      const width = Math.floor(element.clientWidth)
      const height = Math.floor(element.clientHeight)
      if (width > 0 && height > 0) setSize((now) => (now.width === width && now.height === height ? now : { width, height }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}

export default function Scene3D({ view, shots, preset, scaffold, outcome }: Scene3DProps) {
  const [box, canvas] = useCanvasSize()
  const flags = useMemo(() => ({ scaffold, outcome }), [scaffold, outcome])
  const skyline = useMemo(() => skylineOf(view, flags), [view, flags])
  // The authored move: the view before this one, with its collars at the foot where it had put nothing out, kept for as long as the level stays.
  const [seen, setSeen] = useState({ view, flags, from: null as VerifierView | null })
  if (seen.view !== view || seen.flags !== flags) setSeen({ view, flags, from: seen.view.level === view.level ? seen.view : null })
  const from = useMemo(() => (seen.from === null || seen.from === view ? null : skylineOf(seen.from, flags, true).model), [seen.from, view, flags])
  // The cameras follow the drawing's size and not its bars: a draw of rounds leaves the camera where it is.
  const { x0, x1, z0, z1 } = skyline.model.bounds
  const presets = useMemo(() => presetsOf({ x0, x1, z0, z1 }, shots, canvas), [x0, x1, z0, z1, shots, canvas])
  // The labels the shot has room for, where its camera comes to rest (scene-layout.ts's `labelsFor`).
  const shot = presets.find((candidate) => candidate.id === preset) ?? presets[0]
  const labels = useMemo<LabelSpec[]>(
    () =>
      labelsFor(skyline.model, preset, shot === undefined ? undefined : projectorOf(shot, canvas), canvas).map((label) => ({
        id: label.id,
        at: toWorld(label.at[0], label.at[1], label.at[2]),
        place: label.place,
        className: `es-vf-label es-vf-label--${label.kind}`,
        content: label.text,
      })),
    [skyline, preset, shot, canvas],
  )
  return (
    <div ref={box} className="es-vf3d" data-vf-rows={skyline.rows}>
      <SceneCanvas labels={labels} fog={null} exposure={1}>
        <CameraRig presets={presets} preset={preset} />
        <FlatLights />
        <FlatTrack model={skyline.model} from={from} />
      </SceneCanvas>
    </div>
  )
}
