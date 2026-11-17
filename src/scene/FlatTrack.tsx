import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, InstancedBufferAttribute, PlaneGeometry, type InstancedMesh, type LineSegments, type Material } from 'three'
import type { ColorRoleName } from '@/design/tokens'
import { useKit } from './kit'
import { capacityFor, formIndex } from './marks'
import { createFlatMaterials, SHADOW, type FlatMaterials } from './flat-materials'
import { morphModel, MORPH_MS, PX, type FlatBox, type FlatCursor, type FlatModel, type FlatSegment } from './flat-track'
import { roleColor } from './materials'
import { pickedId } from './selection'

/*
 * FlatTrack (REDESIGN §2.8, §2.9): the time track as a model of the 2D diagram, drawn from a FlatModel (flat-track.ts). It decides nothing:
 * every box, line and word is the game's layout.
 *
 * Draw calls, whatever the model holds: the plates (1), the solids (1), their contact shadows (1), the dashed wires (1), the graticule (1),
 * the inks (1) and the cursor with its edge (2): eight, so a model of 64 slots and 160 steps, more than 10,000 instances, is still eight.
 *
 * `from` asks for the one authored move: the model slides from `from` to `model` over 640 ms on the settle curve, holding frames only while
 * it moves. Under reduced motion it is drawn at its end at once.
 */

export interface FlatTrackProps {
  model: FlatModel
  /** Where the authored move starts from. A new `from` starts it again. */
  from?: FlatModel | null
  /** A pick on a box that carries `pick`. */
  onPick?: (pick: string) => void
}

/** Writes each box's matrix (scale, then translation; no rotation) into `out`, in world units. */
function writeBoxes(boxes: readonly FlatBox[], out: Float32Array, lift = 0) {
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    const o = i * 16
    out.fill(0, o, o + 16)
    const w = Math.max(box.x1 - box.x0, 0.01) / PX
    const h = Math.max(box.height, 0.01) / PX
    const d = Math.max(box.z1 - box.z0, 0.01) / PX
    out[o] = w
    out[o + 5] = h
    out[o + 10] = d
    out[o + 12] = (box.x0 + box.x1) / 2 / PX
    out[o + 13] = ((box.y0 ?? 0) + box.height / 2) / PX + lift
    out[o + 14] = (box.z0 + box.z1) / 2 / PX
    out[o + 15] = 1
  }
}

function Boxes({ boxes, material, name, onPick, forms = false }: { boxes: readonly FlatBox[]; material: Material; name: string; onPick?: (pick: string) => void; forms?: boolean }) {
  const kit = useKit()
  const capacity = capacityFor(boxes.length)
  const geometry = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1)
    box.setAttribute('aForm', new InstancedBufferAttribute(new Float32Array(capacity), 1))
    return box
  }, [capacity])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    writeBoxes(boxes, instanced.instanceMatrix.array as Float32Array)
    const form = geometry.getAttribute('aForm') as InstancedBufferAttribute
    const colours = new Map<ColorRoleName, Color>()
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      ;(form.array as Float32Array)[i] = forms ? formIndex(box.form) : 0
      let colour = colours.get(box.role)
      if (!colour) {
        colour = roleColor(kit.tokens, box.role)
        colours.set(box.role, colour)
      }
      instanced.setColorAt(i, colour)
    }
    instanced.count = boxes.length
    instanced.instanceMatrix.needsUpdate = true
    form.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    instanced.computeBoundingSphere()
    kit.invalidate()
  }, [boxes, geometry, kit, forms])
  const ids = useMemo(() => boxes.map((box) => box.pick ?? ''), [boxes])
  const pick = onPick
    ? (event: ThreeEvent<MouseEvent>) => {
        const id = pickedId(ids, event.instanceId)
        if (id === null || id === '') return
        event.stopPropagation()
        onPick(id)
      }
    : undefined
  return <instancedMesh ref={mesh} name={name} args={[geometry, material, capacity]} onClick={pick} frustumCulled={false} />
}

/**
 * How far the contact shadows lie over the sheet, in world units: half a pixel of the diagram [estimated]. At 0.15 px the depth buffer could
 * not tell them from the sheet at the cameras' distance, and the sheet hid them.
 */
const SHADOW_LIFT = 0.005

/** The contact shadows: a quad per solid, its footprint grown by the shadow's reach, lying just over the sheet. */
function Shadows({ boxes, material }: { boxes: readonly FlatBox[]; material: Material }) {
  const kit = useKit()
  const footprints = useMemo<FlatBox[]>(() => {
    const reach = SHADOW.reach * PX
    return boxes
      .filter((box) => box.shadow !== false)
      .map((box) => ({ ...box, x0: box.x0 - reach, x1: box.x1 + reach, z0: box.z0 - reach, z1: box.z1 + reach, y0: box.y0 ?? 0, height: 0 }))
  }, [boxes])
  const capacity = capacityFor(footprints.length)
  const geometry = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    writeBoxes(footprints, instanced.instanceMatrix.array as Float32Array, SHADOW_LIFT)
    instanced.count = footprints.length
    instanced.instanceMatrix.needsUpdate = true
    kit.invalidate()
  }, [footprints, kit])
  return <instancedMesh key={capacity} ref={mesh} name="contact-shadows" args={[geometry, material, capacity]} frustumCulled={false} renderOrder={1} />
}

/** Line segments in world units, with each segment's own dash distance from its start, so every edge begins on a dash. */
function segmentGeometry(segments: readonly FlatSegment[], lift: number): BufferGeometry {
  const position = new Float32Array(Math.max(1, segments.length) * 6)
  const distance = new Float32Array(Math.max(1, segments.length) * 2)
  segments.forEach((s, i) => {
    const y = (s.y ?? 0) / PX + lift
    position.set([s.x0 / PX, y, s.z0 / PX, s.x1 / PX, y, s.z1 / PX], i * 6)
    distance[i * 2 + 1] = Math.hypot(s.x1 - s.x0, s.z1 - s.z0) / PX
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('lineDistance', new BufferAttribute(distance, 1))
  geometry.setDrawRange(0, segments.length * 2)
  return geometry
}

function Lines({ segments, material, name, lift = 0.002 }: { segments: readonly FlatSegment[]; material: Material; name: string; lift?: number }) {
  const kit = useKit()
  const geometry = useMemo(() => segmentGeometry(segments, lift), [segments, lift])
  const line = useRef<LineSegments>(null)
  useEffect(() => {
    kit.invalidate()
    return () => geometry.dispose()
  }, [geometry, kit])
  return <lineSegments ref={line} name={name} geometry={geometry} material={material} frustumCulled={false} />
}

/** A wire box's edges: its top's four sides and its four uprights, each a dashed segment of its own. */
function wireSegments(wires: readonly FlatBox[]): FlatSegment[] {
  const out: FlatSegment[] = []
  for (const w of wires) {
    const y0 = w.y0 ?? 0
    const top = y0 + w.height
    out.push({ x0: w.x0, z0: w.z0, x1: w.x1, z1: w.z0, y: top }, { x0: w.x1, z0: w.z0, x1: w.x1, z1: w.z1, y: top }, { x0: w.x1, z0: w.z1, x1: w.x0, z1: w.z1, y: top }, { x0: w.x0, z0: w.z1, x1: w.x0, z1: w.z0, y: top })
    out.push({ x0: w.x0, z0: w.z0, x1: w.x1, z1: w.z0, y: y0 }, { x0: w.x0, z0: w.z1, x1: w.x1, z1: w.z1, y: y0 })
  }
  return out
}

/** How thick the cursor's amber edges are, in px: the 2D cursor's 2 px line, so its middle draws the marker's own colour [estimated, set by eye in Lifted]. */
const CURSOR_EDGE = 2

/**
 * The now cursor: a thin amber sheet standing on its edge, drawn as its top edge across the rows, over every slab, with the marker's dark
 * edge under it, and its near edge standing at the axis. Its faces are not filled, and nothing of it lies on the paper: a camera to one side
 * (Lifted, at the first ticks) would see a filled face, or a top edge over a foot line, as a wedge of amber across the rows. One line, from
 * every camera.
 */
function Cursors({ cursors, materials }: { cursors: readonly FlatCursor[]; materials: FlatMaterials }) {
  const e = CURSOR_EDGE / 2
  const sheets = useMemo<FlatBox[]>(
    () =>
      cursors.flatMap((c) => [
        { id: `${c.id}/top`, x0: c.x - e, x1: c.x + e, z0: c.z0, z1: c.z1, y0: c.height - CURSOR_EDGE, height: CURSOR_EDGE, role: 'lamp', form: 'solid', shadow: false },
        { id: `${c.id}/post`, x0: c.x - e, x1: c.x + e, z0: c.z1 - CURSOR_EDGE, z1: c.z1, height: c.height, role: 'lamp', form: 'solid', shadow: false },
      ]),
    [cursors, e],
  )
  const edges = useMemo<FlatBox[]>(
    () => cursors.map((c) => ({ id: c.id, x0: c.x - e - 1, x1: c.x + e + 1, z0: c.z0 - 1, z1: c.z1 + 1, y0: c.height - CURSOR_EDGE - 1, height: 1, role: 'lamp-ring', form: 'solid', shadow: false })),
    [cursors, e],
  )
  return (
    <>
      <Boxes boxes={edges} material={materials.cursorEdge} name="cursor-edge" />
      <Boxes boxes={sheets} material={materials.cursor} name="cursor" />
    </>
  )
}

/** The authored move's share, eased, or null when there is no move under way. */
function useMorph(from: FlatModel | null | undefined): number | null {
  const kit = useKit()
  // The share reached by the move that started from `from`; a new `from` starts at 0 until its first frame.
  const [reached, setReached] = useState<{ from: FlatModel | null; t: number | null }>({ from: null, t: null })
  const started = useRef<{ at: number; from: FlatModel; release: () => void } | null>(null)
  const moving = !!from && !kit.reducedMotion
  useEffect(() => {
    if (!from || !moving) return
    started.current = { at: performance.now(), from, release: kit.hold() }
    return () => {
      started.current?.release()
      started.current = null
    }
  }, [from, moving, kit])
  useFrame(() => {
    const move = started.current
    if (!move) return
    const raw = Math.min(1, (performance.now() - move.at) / MORPH_MS)
    setReached({ from: move.from, t: raw >= 1 ? null : kit.ease(raw) })
    if (raw >= 1) {
      move.release()
      started.current = null
    }
  })
  if (!moving) return null
  return reached.from === from ? reached.t : 0
}

export function FlatTrack({ model, from, onPick }: FlatTrackProps) {
  const kit = useKit()
  const materials = useMemo(() => createFlatMaterials(kit.tokens), [kit.tokens])
  useEffect(() => {
    kit.invalidate()
    return () => materials.dispose()
  }, [materials, kit])
  const t = useMorph(from)
  const shown = useMemo(() => (t === null || !from ? model : morphModel(from, model, t)), [t, from, model])
  const wires = useMemo(() => wireSegments(shown.wires), [shown.wires])
  return (
    <>
      <Boxes boxes={shown.plates} material={materials.solid} name="plates" />
      <Lines segments={shown.rules} material={materials.rule} name="graticule" lift={0.0008} />
      <Shadows boxes={shown.boxes} material={materials.shadow} />
      <Boxes boxes={shown.boxes} material={materials.solid} name="solids" onPick={onPick} forms />
      <Lines segments={wires} material={materials.wire} name="wires" />
      <Lines segments={shown.inks} material={materials.ink} name="inks" lift={0.003} />
      <Cursors cursors={shown.cursors} materials={materials} />
    </>
  )
}
