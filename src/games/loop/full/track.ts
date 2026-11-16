/*
 * The step loop's five full levels as the 3D time track (REDESIGN §2.9, §3.7): the full levels' timing diagram (packages/play/loop/full/
 * lanes.ts), in microseconds of the model's clock, laid flat on the plate as ../track-layout.ts lays the demo levels', so the Side camera
 * puts a microsecond where the 2D diagram does.
 *
 *   - the CPU row's calls, blue (a sync yellow); a CUDA graph replay one slab, labelled with its size; eager launches a comb of thin
 *     ticks, one per kernel call drawn, with the count carried whole in the label;
 *   - copies brown on their own row, and the grammar mask on its own row on `mask`;
 *   - the GPU's forward row, a green slab per step with its batch size, the padded part of a forward hatched;
 *   - the slots-live strip under it, as deep as the share of the batch's slots that held a request;
 *   - idle as dashed wire outlines with a dimension line and its value in µs, and the now cursor.
 */
import { FULL_DESK, FULL_LANE_WORDS, FULL_PHONE, fullLaneLayout, type FullLaneGeometry, type FullLaneLayout, type FullLaneSource } from '@es/play/loop/full/lanes'
import type { FlatBox, FlatLabel, FlatModel, FlatSegment } from '@/scene/flat-track'
import { NARROW, PAD, platesOf, RISE } from '../track-layout'

/** Whether words fit a width [estimated: 6.5 px a character and a margin], as the demo levels' track decides. */
const fits = (words: string, width: number): boolean => words.length * 6.5 + 8 <= width

/** The full diagram's geometry for a canvas this wide: the desk's or the phone's, at the canvas's width less the figure's padding. */
export function fullTrackGeometry(canvasWidth: number): { geometry: FullLaneGeometry; pad: number; narrow: boolean } {
  const narrow = canvasWidth < NARROW
  const pad = narrow ? PAD.phone : PAD.desk
  const base = narrow ? FULL_PHONE : FULL_DESK
  return { geometry: { ...base, width: Math.max(Math.floor(canvasWidth - pad * 2), base.labelWidth + 64) }, pad, narrow }
}

/** One full lane layout's marks, offset to where it stands on the plate. */
export function fullDiagramModel(layout: FullLaneLayout, ox: number, oz: number): FlatModel {
  const { scale } = layout
  const boxes: FlatBox[] = []
  const wires: FlatBox[] = []
  const rules: FlatSegment[] = []
  const inks: FlatSegment[] = []
  const labels: FlatLabel[] = []
  const bottom = layout.axis.y

  for (const tick of layout.axis.ticks) rules.push({ x0: ox + tick.x, z0: oz, x1: ox + tick.x, z1: oz + bottom })
  for (const row of layout.rows) {
    rules.push({ x0: ox + scale.x, z0: oz + row.y, x1: ox + scale.x + scale.width, z1: oz + row.y })
    labels.push({ id: `row/${row.id}`, at: [ox + 4, 0, oz + row.y + row.height / 2], text: row.label, kind: 'row', place: 'right' })
  }
  rules.push({ x0: ox + scale.x, z0: oz + bottom, x1: ox + scale.x + scale.width, z1: oz + bottom })

  for (const mark of layout.marks) {
    const x0 = ox + mark.x + 0.5
    const x1 = ox + mark.x + mark.width - 0.5
    const z0 = oz + mark.y + 1
    const z1 = oz + mark.y + mark.height - 1
    const word = (height: number) => {
      if (mark.label !== null && fits(mark.label, mark.width) && mark.height >= 14) labels.push({ id: mark.id, at: [x0 - 1, height, oz + mark.y + mark.height / 2], text: mark.label, kind: 'slab', place: 'right' })
    }
    switch (mark.kind) {
      case 'call':
      case 'mask':
        if (x1 > x0) boxes.push({ id: mark.id, x0, x1, z0, z1, height: RISE.cpu, role: mark.call === 'sync' ? 'lane-sync' : 'lane-cpu', form: 'solid' })
        word(RISE.cpu)
        break
      case 'replay':
        // One replay, one slab: a graph launches as one call however many kernels it holds.
        if (x1 > x0) boxes.push({ id: mark.id, x0, x1, z0, z1, height: RISE.cpu, role: 'lane-cpu', form: 'solid' })
        word(RISE.cpu)
        break
      case 'eager':
        // A comb: a thin standing tick per kernel call drawn, on a low spine as long as the launch.
        if (x1 > x0) boxes.push({ id: mark.id, x0, x1, z0: z1 - 4, z1, height: 2, role: 'lane-cpu', form: 'solid' })
        for (const [i, x] of (mark.ticks ?? []).entries()) boxes.push({ id: `${mark.id}/${i}`, x0: ox + x - 0.5, x1: ox + x + 0.5, z0, z1, height: RISE.cpu, role: 'lane-cpu', form: 'solid', shadow: false })
        word(RISE.cpu)
        break
      case 'copy':
        if (x1 > x0) boxes.push({ id: mark.id, x0, x1, z0, z1, height: RISE.slot, role: 'lane-copy', form: 'solid' })
        word(RISE.slot)
        break
      case 'forward':
        if (x1 > x0) boxes.push({ id: mark.id, x0, x1, z0, z1, height: RISE.slot, role: 'lane-gpu', form: 'solid' })
        word(RISE.slot)
        break
      case 'padding':
        // Padding stands a little proud of its forward, hatched: the captured size ran rows that held nothing.
        if (x1 > x0) boxes.push({ id: mark.id, x0, x1, z0, z1, y0: 0, height: RISE.slot + 2, role: 'lane-gpu', form: 'marked', shadow: false })
        word(RISE.slot + 2)
        break
      case 'live': {
        const share = mark.slots ? (mark.rows ?? 0) / mark.slots : 0
        if (x1 > x0 && share > 0) boxes.push({ id: mark.id, x0, x1, z0, z1: z0 + Math.max(1, (z1 - z0) * share), height: RISE.chip / 2, role: 'lane-gpu', form: 'solid', shadow: false })
        break
      }
    }
  }

  for (const box of layout.idle) {
    const x0 = ox + box.x + 1
    const x1 = ox + box.x + box.width - 1
    if (x1 > x0) wires.push({ id: box.id, x0, x1, z0: oz + box.y + 1, z1: oz + box.y + box.height - 1, height: RISE.wire, role: 'lane-idle', form: 'hollow' })
  }
  for (const dim of layout.dims) {
    const z = oz + dim.y
    const x0 = ox + dim.x0
    const x1 = ox + dim.x1
    inks.push({ x0, z0: z, x1, z1: z, y: RISE.wire }, { x0, z0: z - 5, x1: x0, z1: z + 5, y: RISE.wire }, { x0: x1, z0: z - 5, x1, z1: z + 5, y: RISE.wire })
    labels.push({ id: dim.id, at: [(x0 + x1) / 2, RISE.wire, z - 3], text: fits(dim.label, x1 - x0) ? dim.label : `${dim.us} µs`, kind: 'dim', place: 'above' })
  }

  inks.push({ x0: ox + scale.x, z0: oz + bottom, x1: ox + scale.x + scale.width, z1: oz + bottom, y: 0 })
  for (const tick of layout.axis.ticks) {
    inks.push({ x0: ox + tick.x, z0: oz + bottom, x1: ox + tick.x, z1: oz + bottom + 6, y: 0 })
    labels.push({ id: `tick/${tick.t}`, at: [ox + tick.x, 0, oz + bottom + 6], text: String(tick.t), kind: 'tick', place: 'below' })
  }
  labels.push({ id: 'axis', at: [ox + 4, 0, oz + bottom + layout.geometry.axisHeight / 2], text: FULL_LANE_WORDS.axis, kind: 'axis', place: 'right' })

  const cursors = [{ id: 'now', x: ox + layout.now.x, z0: oz + layout.now.y0 - 7, z1: oz + layout.now.y1, height: RISE.cursor }]
  labels.push({ id: 'now', at: [ox + layout.now.x, RISE.cursor, oz + layout.now.y0 - 7], text: 'now', kind: 'now', place: 'above' })

  return { plates: [], boxes, wires, rules, inks, cursors, labels, bounds: { x0: ox, x1: ox + layout.geometry.width, z0: oz, z1: oz + layout.height + layout.geometry.axisHeight } }
}

/** A full level's run as the 3D track, at the full diagram's geometry for a canvas this wide. Room over the rows holds now's word. */
export function fullTrack(source: FullLaneSource, canvasWidth: number): FlatModel {
  const { geometry, pad } = fullTrackGeometry(canvasWidth)
  const layout = fullLaneLayout(source, geometry)
  const marks = fullDiagramModel(layout, pad, pad + 14)
  return { ...marks, plates: platesOf({ ...marks.bounds, z0: pad }, pad) }
}
