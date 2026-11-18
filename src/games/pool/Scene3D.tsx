import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { CircleGeometry, Color, MeshBasicMaterial, RingGeometry, type BufferGeometry, type InstancedMesh } from 'three'
import type { GlyphShape } from '@/design/code'
import { resolveColor } from '@/design/tokens'
import type { PoolView } from '@es/play/pool/types'
import { CameraRig } from '@/scene/CameraRig'
import { FlatLights } from '@/scene/FlatLights'
import { FlatTrack } from '@/scene/FlatTrack'
import { PX, toWorld } from '@/scene/flat-track'
import { useKit } from '@/scene/kit'
import type { LabelSpec } from '@/scene/labels'
import { capacityFor } from '@/scene/marks'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { fanRoom, geometryOf, presetsFor, rackOf, type Canvas, type PageGlyph } from './scene-layout'
import type { PoolPick } from './types'
import './pool3d.css'

/*
 * KV page pool's 3D scene (REDESIGN §2.8, §2.9): a rack of page cells on a base plate, the 2D diagram as a model of itself. It imports
 * nothing from src/scene/props: its parts are the kit's flat track (src/scene/FlatTrack.tsx), laid out by scene-layout.ts from the same view
 * the 2D diagram and the mirror draw, so it draws the night and decides nothing.
 *
 *   - Every page stands in its cell for its whole life, in a form as well as a colour: free hollow, in use solid, cached hatched, shared
 *     by a prefix hit dotted; and on its top the 2D cell's glyph, so the legend under the scene is the diagram's own. A page never moves:
 *     a moving page would teach that pages are copied.
 *   - What depth is for: a request's block table runs as threads from its tile to its pages, scattered over the one pool, and a page
 *     stands up into the layers it serves. The scene opens on both: the request admitted last shows its threads, and its page nearest the
 *     front fans, rising out of it on the settle duration; a selection shows another. Under reduced motion the fan is drawn at
 *     its end.
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

/** Each glyph's flat shape, one unit across, lying on the sheet with the diagram's up toward the back, as Glyph.tsx draws it on 24 units. */
const SHAPES: Readonly<Record<GlyphShape, () => BufferGeometry>> = {
  circle: () => new CircleGeometry(8.25 / 24, 24),
  diamond: () => new CircleGeometry(9.25 / 24, 4),
  hexagon: () => new CircleGeometry(9.25 / 24, 6, Math.PI / 2),
  square: () => new CircleGeometry((8 / 24) * Math.SQRT2, 4, Math.PI / 4),
  triangle: () => new CircleGeometry(9.5 / 24, 3, Math.PI / 2),
  ring: () => new RingGeometry(6 / 24, 9 / 24, 24),
}

/** One shape's glyphs, as one instanced mesh, each in its role's colour. */
function GlyphSet({ shape, glyphs }: { shape: GlyphShape; glyphs: readonly PageGlyph[] }) {
  const kit = useKit()
  const geometry = useMemo(() => SHAPES[shape]().rotateX(-Math.PI / 2), [shape])
  const material = useMemo(() => new MeshBasicMaterial({ color: new Color(1, 1, 1), toneMapped: false }), [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  const capacity = capacityFor(glyphs.length)
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const out = instanced.instanceMatrix.array as Float32Array
    const colour = new Color()
    glyphs.forEach((glyph, i) => {
      const o = i * 16
      const size = glyph.size / PX
      out.fill(0, o, o + 16)
      out[o] = size
      out[o + 5] = 1
      out[o + 10] = size
      out[o + 12] = glyph.x / PX
      out[o + 13] = glyph.y / PX
      out[o + 14] = glyph.z / PX
      out[o + 15] = 1
      // The role as the page computes it, or its light value where that is not a hex colour (forced colours), as the kit reads a role.
      const value = kit.tokens.roles[glyph.role]
      instanced.setColorAt(i, colour.set(/^#[0-9a-f]{3,6}$/i.test(value) ? value : resolveColor(glyph.role)))
    })
    instanced.count = glyphs.length
    instanced.instanceMatrix.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    kit.invalidate()
  }, [glyphs, kit])
  return <instancedMesh key={capacity} ref={mesh} name={`glyphs/${shape}`} args={[geometry, material, capacity]} frustumCulled={false} />
}

/** Every page's glyph, a mesh for each shape on the drawing. */
function Glyphs({ glyphs }: { glyphs: readonly PageGlyph[] }) {
  const byShape = useMemo(() => {
    const out = new Map<GlyphShape, PageGlyph[]>()
    for (const glyph of glyphs) out.set(glyph.shape, [...(out.get(glyph.shape) ?? []), glyph])
    return [...out]
  }, [glyphs])
  return (
    <>
      {byShape.map(([shape, list]) => (
        <GlyphSet key={shape} shape={shape} glyphs={list} />
      ))}
    </>
  )
}

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
  // The frame is the level's: the pool's size, the batch's and the tallest fan, so nothing the learner does moves the camera.
  const { cols, cap } = view
  const pages = view.pans.length
  const room = fanRoom(view)
  const presets = useMemo(() => presetsFor(geometryOf(pages, cols, cap), canvas, room), [pages, cols, cap, room, canvas])
  const labels = useMemo<LabelSpec[]>(
    () =>
      rack.model.labels.map((label) => ({
        id: label.id,
        at: toWorld(label.at[0], label.at[1], label.at[2]),
        place: label.place,
        className: `es-pool3d-label es-pool3d-label--${label.kind}`,
        content: label.text,
        minWidth: label.minWidth,
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
      <SceneCanvas labels={labels} fog={null} exposure={1}>
        <CameraRig presets={presets} preset={preset} />
        <FlatLights />
        <FlatTrack model={rack.model} from={from} onPick={onPick ? onPicked : undefined} />
        <Glyphs glyphs={rack.glyphs} />
      </SceneCanvas>
    </div>
  )
}
