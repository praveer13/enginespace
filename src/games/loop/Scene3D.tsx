import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { LaneSource } from '@es/play/loop/lanes'
import { busyGuess } from '@es/play/loop/parts'
import type { LoopView } from '@es/play/loop/types'
import type { FullLaneSource } from '@es/play/loop/full/lanes'
import { CameraRig } from '@/scene/CameraRig'
import { FlatLights } from '@/scene/FlatLights'
import { FlatTrack } from '@/scene/FlatTrack'
import { EMPTY_MODEL, toWorld, type FlatModel } from '@/scene/flat-track'
import type { LabelSpec } from '@/scene/labels'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { SLOT_MARKS, type Slot } from '@/design/code'
import { Glyph } from '@/design/components/Glyph'
import { fullTrack } from './full/track'
import { compareTrack, demoTrack, scaleTrack } from './track-layout'
import { DEFAULT_CAMERA, LIFT_DEG, LIFT_NARROW_DEG, showsOwnRun, trackPresets, type Canvas } from './track-presets'
import { LoopLegend } from './View2D'
import './track3d.css'

/*
 * The step loop's 3D scene (REDESIGN §2.8, §2.9): the timing diagram as a model of itself, on a pale base plate engraved with the
 * graticule. It imports nothing from src/scene/props: its parts are
 * the kit's flat track (src/scene/FlatTrack.tsx), laid out by track-layout.ts from the same lanes the 2D diagram draws (lanes.ts on the demo
 * levels, full/lanes.ts on the full ones), so it draws the run and decides nothing.
 *
 *   - What depth is for: on the demo levels the reference run stands behind the learner's own on one clock, so the now sheet runs through
 *     both and every slot the learner left empty is a dashed hole in front of the reference's slab. The Lifted camera opens on it.
 *   - Matte slabs in the lane colours, each on a soft contact shadow with baked occlusion at its foot, at every tier.
 *   - Idle, and a slot the GPU paid for and nothing used, as dashed wire outlines.
 *   - The now cursor, a thin amber sheet: the only thing that glows. No environment map, no fog, no bloom, no steam.
 *   - Every word and number is DOM in the label layer, and each row's name and slab's word carries its colour's glyph, as in the 2D view.
 *     The 2D view's legend stands over the canvas. The waiting queue is the dock's: the scene does not draw it a second time.
 *   - Six cameras (track-presets.ts). Side is the 2D diagram alone. Compare and Scale show the model's own runs, not the learner's, and
 *     say so.
 *   - One authored move: on Compare, the async band starts as continuous batching and its gaps close over 640 ms; under reduced motion it
 *     is drawn at its end.
 *
 * A lazy chunk of its own, which the Stage loads on a device whose tier draws 3D; the 2D diagram is its first paint and its fallback.
 */

export interface Scene3DProps {
  /** A demo level's view: the lanes read it. */
  view?: LoopView
  /** A full level's view, in µs: the full lanes read it. */
  full?: FullLaneSource
  /** The camera's id (track-presets.ts). The game holds it, so `C`, the buttons and a swap of views keep it. */
  preset: string
  /** The reference run of the same level and seed, played to its end: it stands behind the learner's run on the same clock. */
  reference?: LaneSource
}

/** A slab's words, an idle box's and a bubble's value are not drawn on a canvas narrower than this [estimated]: the state table carries every one. */
const ROOMY = 560
/** The canvas's size before it is measured: about the desk's box [estimated]. */
const FIRST: Canvas = { width: 870, height: 480 }

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

/** Compare's two models are the same on every visit: laid out once, the first time Compare is shown. */
let compareModels: ReturnType<typeof compareTrack> | null = null
let scaleModel: FlatModel | null = null

/**
 * The colour a label's mark stands for, read from its id (track-layout.ts, full/track.ts): the CPU row and its calls (a sync yellow), the
 * slot rows, the forward row and their tokens, and the copies.
 */
function slotOf(id: string, kind: string): Slot | null {
  if (kind !== 'row' && kind !== 'slab') return null
  const part = id.replace(/^ref\//, '').replace(/^row\//, '')
  if (part === 'cpu' || part.startsWith('cpu/')) return part.endsWith('/sync') ? 'yellow' : 'blue'
  if (/^(?:slot-|forward|padding\/)/.test(part)) return 'green'
  if (part.startsWith('copy/')) return 'brown'
  return null
}

/** A label's words, after its colour's glyph where it names a coloured mark (the Colour Is State Rule): the 2D view's shapes. */
function contentOf(id: string, kind: string, text: string): ReactNode {
  const slot = slotOf(id, kind)
  if (slot === null) return text
  return (
    <>
      <Glyph shape={SLOT_MARKS[slot].glyph} className="es-track-label__glyph" style={{ color: `var(--es-cat-${slot})` }} edge={`var(--es-cat-${slot}-edge)`} />
      {text}
    </>
  )
}

function labelsOf(model: FlatModel): LabelSpec[] {
  return model.labels.map((label) => ({
    id: label.id,
    at: toWorld(label.at[0], label.at[1], label.at[2]),
    place: label.place,
    className: `es-track-label es-track-label--${label.kind}`,
    content: contentOf(label.id, label.kind, label.text),
    minWidth: label.kind === 'slab' || label.kind === 'idle' || label.kind === 'dim' ? ROOMY : label.minWidth,
  }))
}

export default function Scene3D({ view, full, preset, reference }: Scene3DProps) {
  const [box, canvas] = useCanvasSize()
  const camera = preset || DEFAULT_CAMERA
  const narrow = canvas.width < ROOMY
  // Side is the 2D diagram alone; every other camera of the learner's run sees the reference behind it. Nothing of the reference past now
  // is drawn while a guess about the run ahead is open.
  const behind = camera === 'side' ? undefined : reference
  const ahead = view === undefined || busyGuess(view) === null
  const own = useMemo(
    () => (full ? fullTrack(full, canvas.width) : view ? demoTrack(view, canvas.width, behind, { height: canvas.height, lift: narrow ? LIFT_NARROW_DEG : LIFT_DEG, ahead }) : null),
    [full, view, canvas.width, canvas.height, behind, narrow, ahead],
  )

  // Compare: each time it is chosen, the authored move plays again from the continuous band.
  const [visit, setVisit] = useState({ camera, count: 0 })
  if (visit.camera !== camera) setVisit({ camera, count: camera === 'compare' ? visit.count + 1 : visit.count })
  const compare = useMemo(() => {
    if (camera !== 'compare') return null
    compareModels ??= compareTrack()
    // A fresh start for each visit: the move keys on it.
    return { model: compareModels.model, from: { ...compareModels.from }, visit: visit.count }
  }, [camera, visit.count])
  const scale = useMemo(() => {
    if (camera !== 'scale') return null
    scaleModel ??= scaleTrack()
    return scaleModel
  }, [camera])

  const shown = showsOwnRun(camera) ? (compare?.model ?? scale ?? own) : own
  const nowX = own?.cursors[0]?.x ?? 0
  const presets = useMemo(() => trackPresets(shown ?? EMPTY_MODEL, canvas, nowX), [shown, canvas, nowX])
  const labels = useMemo(() => (shown ? labelsOf(shown) : []), [shown])

  return (
    <div className="es-track3d" data-track-camera={camera}>
      <div className="es-track3d__legend">
        <LoopLegend />
      </div>
      <div ref={box} className="es-track3d__canvas">
        <SceneCanvas labels={labels} fog={null} toneMapping={false} exposure={1}>
          <CameraRig presets={presets} preset={camera} />
          <FlatLights />
          {shown ? <FlatTrack model={shown} from={camera === 'compare' ? compare?.from : null} /> : null}
        </SceneCanvas>
      </div>
    </div>
  )
}
