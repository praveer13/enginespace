import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { VerifierView } from '@es/play/verifier/types'
import { CameraRig } from '@/scene/CameraRig'
import { FlatLights } from '@/scene/FlatLights'
import { FlatTrack } from '@/scene/FlatTrack'
import { toWorld } from '@/scene/flat-track'
import type { LabelSpec } from '@/scene/labels'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { labelsFor, ROOMY, skylineOf } from './scene-layout'
import { presetsOf, type Canvas } from './scene-plan'
import type { Shot } from './scene-shots'

/*
 * The rejection sampler's 3D scene (REDESIGN §2.8, §2.9): the diagram's bars stood up as skylines on a pale base plate. It imports nothing
 * from src/scene/props: its parts are the kit's flat track (src/scene/FlatTrack.tsx), laid out by scene-layout.ts from the same view the
 * 2D diagram draws, so it draws the run and decides nothing.
 *
 *   - One row of bars for each draft position, into depth. Each token has two bars, the draft's q and the target's p, as tall as their
 *     counts out of the shared axis, and where the level lets it print, cut into the accepted part, the draft's excess and the residual,
 *     each in its code's colour and its form (hatched, solid, groove).
 *   - The output of the sampler is a ring on each target bar. As rounds are drawn the ring rises or falls onto p: the scene's one
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
  /** A bar picked: focus its token's weight while there is a recipe to sculpt, as a tap on its column in the 2D view does. */
  onPick?: (token: number) => void
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

export default function Scene3D({ view, shots, preset, scaffold, outcome, onPick }: Scene3DProps) {
  const [box, canvas] = useCanvasSize()
  const narrow = canvas.width < ROOMY
  const flags = useMemo(() => ({ scaffold, outcome, narrow }), [scaffold, outcome, narrow])
  const skyline = useMemo(() => skylineOf(view, flags), [view, flags])
  // The authored move: the view before this one, with its rings at the foot where it had put nothing out, kept for as long as the level stays.
  const [seen, setSeen] = useState({ view, flags, from: null as VerifierView | null })
  if (seen.view !== view || seen.flags !== flags) setSeen({ view, flags, from: seen.view.level === view.level ? seen.view : null })
  const from = useMemo(() => (seen.from === null || seen.from === view ? null : skylineOf(seen.from, flags, true).model), [seen.from, view, flags])
  // The cameras follow the drawing's size and not its bars: a draw of rounds leaves the camera where it is.
  const { x0, x1, z0, z1 } = skyline.model.bounds
  const { rows, geo } = skyline
  const presets = useMemo(() => presetsOf({ x0, x1, z0, z1 }, rows, shots, canvas, geo), [x0, x1, z0, z1, rows, geo, shots, canvas])
  const labels = useMemo<LabelSpec[]>(
    () =>
      labelsFor(skyline.model, preset).map((label) => ({
        id: label.id,
        at: toWorld(label.at[0], label.at[1], label.at[2]),
        place: label.place,
        className: `es-vf-label es-vf-label--${label.kind}`,
        content: label.text,
        minWidth: label.minWidth,
      })),
    [skyline, preset],
  )
  const pick = useMemo(() => onPick && ((id: string) => id.startsWith('col-') && onPick(Number(id.slice(4)))), [onPick])
  return (
    <div ref={box} className="es-vf3d" data-vf-rows={skyline.rows} data-roomy={canvas.width >= ROOMY || undefined}>
      <SceneCanvas labels={labels} fog={null} environment={false} bloom={false} exposure={1}>
        <CameraRig presets={presets} preset={preset} />
        <FlatLights />
        <FlatTrack model={skyline.model} from={from} onPick={pick} />
      </SceneCanvas>
    </div>
  )
}
