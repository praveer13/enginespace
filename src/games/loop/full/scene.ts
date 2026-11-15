/*
 * The full service's objects for the 3D scene (GAMES.md §2.6; scene kit v1): the view turned into what Scene3D draws over Service's pass,
 * on the plan of packages/play/loop/full/kitchen.ts, which the 2D view draws from too. A pure function of the view, with no three in it,
 * so Scene3D takes every measure from here and imports nothing of the full service but this type.
 *   - the rack: a row of ring molds along the back of the pass, each with its size printed in front of it, and the mold the latest
 *     fire dropped into under the lamp; its name on tape at the row's right end;
 *   - the padded places of the latest fire read back: an empty ring mold where each plate would stand;
 *   - the comb on the expo's edge, a spine and a tooth per layer, or one word, with its calls printed beside it and its name on tape on
 *     the pass's rolled front edge under it;
 *   - the allergy card lying in front of the expo, on the mask level, with ALLERGY printed in its head.
 * Each stands on a contact shadow laid out here with it.
 */
import { clipX, PASS, plateRadius, TICKET } from '@es/play/loop/kitchen'
import { CARD, COMB, MOLD, PAD, RACK, rackOf, teethOf } from '@es/play/loop/full/kitchen'
import type { FullView } from '@es/play/loop/full/types'
import type { Footprint } from '@/scene/props/build'
import type { Vec3 } from '@/scene/props/specs'
import type { Anchor, TicketPlace } from '../scene-layout'

/** One of the tools' instances: where its base stands, and its size (a ring's radius, height and radius; a bar's width, height and depth). */
export interface ToolPlace {
  readonly at: Vec3
  readonly size: Vec3
}

export interface FullScene {
  readonly molds: readonly ToolPlace[]
  readonly moldShadows: readonly Footprint[]
  readonly comb: readonly ToolPlace[]
  readonly combShadows: readonly Footprint[]
  /** The allergy card, lying in front of the expo: a ticket of the scene's own, and whether the line waited for it. */
  readonly card: { readonly ticket: TicketPlace; readonly late: boolean } | null
  /** Its words and numbers, as DOM labels anchored in the scene. */
  readonly anchors: readonly Anchor[]
}

/** A soft round footprint under a ring of radius `r` standing at `at`. */
const ringShadow = (at: Vec3, r: number): Footprint => ({ center: at, size: [r * 2, r * 2], radius: r, soft: 0.012, strength: 0.8, yaw: 0 })

export function sceneOfFull(view: FullView): FullScene {
  const top = PASS.top
  const molds: ToolPlace[] = []
  const moldShadows: Footprint[] = []
  const anchors: Anchor[] = []
  const ring = (x: number, z: number, r: number, height: number) => {
    molds.push({ at: [x, top, z], size: [r, height, r] })
    moldShadows.push(ringShadow([x, top, z], r))
  }
  if (view.rack !== null && view.rack.sizes.length > 0) {
    const rack = rackOf(view.rack.sizes)
    for (const [i, mold] of rack.molds.entries()) {
      ring(mold.x, RACK.z, mold.r, MOLD.height)
      const picked = view.rack.picked === i
      anchors.push({ id: `mold-${mold.size}`, kind: picked ? 'pick' : 'mold', at: [mold.x, top + 0.004, RACK.z + mold.r + 0.012], text: String(mold.size), minWidth: picked ? undefined : 520 })
    }
    anchors.push({ id: 'tape-molds', kind: 'tape', at: [rack.x1, top + 0.004, RACK.z], text: 'molds · sizes', place: 'right' })
  }
  const served = [...view.fires].reverse().find((fire) => !fire.onLine)
  if (served !== undefined && served.padded > 0) {
    let left = served.padded
    const r = plateRadius(view.slots) * 0.8
    served.places.forEach((place, slot) => {
      if (left <= 0 || place.state !== 'empty') return
      left -= 1
      ring(clipX(slot, view.slots), PAD.z, r, MOLD.height * 0.8)
    })
  }
  const comb: ToolPlace[] = []
  const combShadows: Footprint[] = []
  if (view.comb !== null) {
    const word = view.comb.mode === 'FULL'
    comb.push({ at: [(COMB.x0 + COMB.x1) / 2, top, COMB.z], size: [COMB.x1 - COMB.x0, COMB.spine, 0.018] })
    for (const tooth of teethOf(view.comb)) comb.push({ at: [tooth.x, top + COMB.spine, COMB.z], size: [word ? COMB.width * 10 : COMB.width, tooth.h, word ? 0.012 : 0.005] })
    combShadows.push({ center: [(COMB.x0 + COMB.x1) / 2, top, COMB.z], size: [COMB.x1 - COMB.x0 + 0.01, 0.03], radius: 0.006, soft: 0.016, strength: 0.85, yaw: 0 })
    anchors.push({ id: 'calls', kind: 'more', at: [COMB.x1 + 0.05, top + 0.03, COMB.z], text: `${view.comb.calls} ${view.comb.calls === 1 ? 'call' : 'calls'}`, place: 'right' })
    anchors.push({ id: 'tape-comb', kind: 'tape', at: [(COMB.x0 + COMB.x1) / 2, top - 0.03, PASS.depth / 2 + 0.016], text: 'comb · launches' })
  }
  let card: FullScene['card'] = null
  if (view.allergy !== null) {
    // A ticket lying flat hangs from the middle of its top edge, so its middle is half its length toward the expo from there.
    const half = TICKET.height / 2
    const at: Vec3 = [CARD.x - half * CARD.sin, top + 0.0012, CARD.z - half * CARD.cos]
    card = { ticket: { id: 'allergy', at, rotation: [-Math.PI / 2, 0, CARD.turn], cell: 6 }, late: view.allergy.late }
    anchors.push({ id: 'allergy', kind: 'card', at: [0, -0.026, 0.003], frame: 'ticket:allergy', text: 'allergy' })
  }
  return { molds, moldShadows, comb, combShadows, card, anchors }
}
