import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { PoolView } from '@es/play/pool/types'
import { CameraRig } from '@/scene/CameraRig'
import { FlatLights } from '@/scene/FlatLights'
import { FlatTrack } from '@/scene/FlatTrack'
import { toWorld } from '@/scene/flat-track'
import type { LabelSpec } from '@/scene/labels'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { presetsFor, rackOf, type Canvas } from './scene-layout'
import type { PoolPick } from './types'
import './pool3d.css'

/*
 * KV page pool's 3D scene (REDESIGN §2.8, §2.9): a rack of page cells on a base plate, the 2D diagram as a model of itself. It imports
 * nothing from src/scene/props: its parts are the kit's flat track (src/scene/FlatTrack.tsx), laid out by scene-layout.ts from the same view
 * the 2D diagram and the mirror draw, so it draws the night and decides nothing.
 *
 *   - Every page stands in its cell for its whole life, in a form as well as a colour: free hollow, in use solid, cached hatched, shared
 *     by a prefix hit dotted. A page never moves: a moving page would teach that pages are copied.
 *   - A selected page fans into the layers it serves, rising out of it on the settle duration; a selected request shows a thread from its
 *     tile to each page of its block table. Under reduced motion the fan is drawn at its end.
 *   - Matte, with contact shadows and baked occlusion: no environment map, no fog, no bloom. Amber is the marker's, on what a decision may
 *     take. Every word and number is DOM, in the label layer; the page says what is selected (Stage3D.tsx).
 *
 * A lazy chunk of its own, which the Stage loads on a device whose tier draws 3D; the 2D diagram is its first paint and its fallback.
 */

export interface Scene3DProps {
  view: PoolView
  /** The camera preset's id (scene-presets.ts). The game holds it, so `C`, the buttons and a swap of views keep it. */
  preset: string
  /** The KV group that One KV group shows, by index. */
  station: number
  /** The pages chosen to be evicted, while an eviction is open. */
  chosen: readonly number[]
  /** The pages a row of the dock points at. */
  pointed?: readonly number[]
  /** What is selected. The game holds it, so a swap of views keeps it. */
  pick?: PoolPick | null
  /** A pick on a page or a request tile in the scene. */
  onPick?: (pick: PoolPick) => void
}

/** The canvas's size before it is measured: about the desk's box [estimated]. */
const FIRST: Canvas = { width: 870, height: 560 }
/** A request's tile word is hidden in a canvas narrower than this, and the region names with it [estimated]: the page names them. */
const ROOMY = 460

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

export default function Scene3D({ view, preset, station, chosen, pointed = [], pick = null, onPick }: Scene3DProps) {
  const [box, canvas] = useCanvasSize()
  const rack = useMemo(() => rackOf(view, { station: preset === 'station' ? station : null, chosen, pointed, pick }), [view, preset, station, chosen, pointed, pick])
  // The fan opens when it changes (another page, or another group), and not when a decision leaves it as it was.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the move starts again on the moment alone; the model it starts from is the latest of that moment
  const from = useMemo(() => (rack.fan === null ? null : rack.closed), [rack.moment])
  const { x1, z1 } = rack.model.bounds
  const presets = useMemo(() => presetsFor({ x0: 0, x1, z0: 0, z1 }, canvas), [x1, z1, canvas])
  const labels = useMemo<LabelSpec[]>(
    () =>
      rack.model.labels.map((label) => ({
        id: label.id,
        at: toWorld(label.at[0], label.at[1], label.at[2]),
        place: label.place,
        className: `es-pool3d-label es-pool3d-label--${label.kind}`,
        content: label.text,
        minWidth: label.kind === 'band' || label.kind === 'idle' ? ROOMY : label.minWidth,
      })),
    [rack.model.labels],
  )
  const onPicked = useCallback(
    (picked: string) => {
      const match = /^(page|req):(\d+)$/.exec(picked)
      if (match && onPick) onPick({ kind: match[1] === 'page' ? 'page' : 'request', id: Number(match[2]) })
    },
    [onPick],
  )
  return (
    <div ref={box} className="es-pool3d" data-pool-camera={preset}>
      <SceneCanvas labels={labels} fog={null} environment={false} bloom={false} exposure={1}>
        <CameraRig presets={presets} preset={preset} />
        <FlatLights />
        <FlatTrack model={rack.model} from={from} onPick={onPick ? onPicked : undefined} />
      </SceneCanvas>
    </div>
  )
}
