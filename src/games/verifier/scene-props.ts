/*
 * The Tasting's own props (scene kit v1's way, src/scene/props/index.ts): the heat lamps over the pass, under a shade of the scene's own.
 * Built through the kit's maker from shape.ts's lathes, in the palette's tones, so the static set merges them with the kit's props and
 * they share the kit's draws and its baked occlusion. Every size is [estimated], on the kit's proportions.
 *
 * Only the scene imports this (it is in the 3D chunk). It imports no three of its own: the kit's helpers make the geometry.
 */
import { buildProp } from '@/scene/props/build'
import type { Tone } from '@/scene/props/palette'
import { lathe, place, type Vec2 } from '@/scene/props/shape'
import type { PropSpec } from '@/scene/props/specs'

/**
 * The shade of a heat lamp over the pass, turned in three parts round the kit's section: its skin, from the rolled rim up to its neck,
 * in brushed shaded steel; the rim, a bead of bright steel; and its well, from the rim up to the bulb's socket, in deep steel. So it
 * reads as opaque sheet metal round a dark mouth whichever way it is seen (W1b's finish review, round 2: the kit's spun shade mirrored
 * the room's haze and read as frosted glass against it). Each section runs so that its face looks out of the metal: up the skin, round
 * the bead, and down the well, whose face looks down into the mouth.
 */
export const SHADE: readonly (readonly [readonly Vec2[], Tone])[] = [
  [[[0.115, -0.158], [0.112, -0.152], [0.103, -0.135], [0.083, -0.105], [0.055, -0.07], [0.034, -0.03], [0.026, -0.006], [0.022, 0], [0.02, 0.03], [0.016, 0.035], [0, 0.035]], 'shaded'],
  [[[0.111, -0.158], [0.1105, -0.1625], [0.112, -0.1665], [0.1155, -0.168], [0.119, -0.1665], [0.1205, -0.1625], [0.119, -0.1585], [0.1155, -0.157], [0.111, -0.158]], 'steel'],
  [[[0, -0.004], [0.018, -0.004], [0.0235, -0.0085], [0.0315, -0.031], [0.0525, -0.071], [0.0805, -0.106], [0.1005, -0.136], [0.1095, -0.153], [0.111, -0.158]], 'deep'],
]

/**
 * A heat lamp of the Tasting's, made the kit's way: the kit's canopy, cord, socket and bulb, under the shade above in place of the kit's
 * spun one, which every other scene keeps. Any other prop passes through as it is.
 */
export function tastingLamp(spec: PropSpec): PropSpec {
  if (spec.kind !== 'heat-lamp') return spec
  return {
    kind: 'custom',
    id: spec.id,
    at: spec.at,
    build(m) {
      const spun = m.palette.colorOf('alu')
      m.parts.push(...buildProp({ ...spec, at: [0, 0, 0] }, m.palette).parts.filter((part) => part.color !== spun))
      for (const [section, tone] of SHADE) m.add(place(lathe(section, 32), [0, -spec.drop - 0.035, 0]), tone)
    },
  }
}
