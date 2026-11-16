import type { Vec3 } from './camera-rig'
import { Fluorescent } from './Lights'

/*
 * Data Book's light in 3D (REDESIGN §2.8: "lit by one directional light and a hemisphere"): the kit's own pair, a cool white sky over the
 * ground's grey and one key, here from above, in front and to the left, so a slab has a lit top, a lit front and a shaded right side.
 * No spot, no lamp, no shadow map: the depth is the contact shadows' and the baked occlusion's (flat-materials.ts), which hold at every
 * tier. The scene that uses it asks for no environment map, so nothing here reflects anything.
 *
 * It is the kit's `Fluorescent` and not a pair of its own on purpose: every scene then reaches Lights.tsx, so the kit's shared chunk keeps
 * its shape and no other scene's closure moves (WR-report §1.6, the lane spike's build 4). Power [estimated], set by eye so the paper's
 * top reads close to its 2D colour in Side.
 */

/** Where the key light comes from, toward the plate's middle [estimated]. */
const KEY_FROM: Vec3 = [-3, 9, 6]

export function FlatLights({ power = 2.1 }: { power?: number }) {
  return <Fluorescent power={power} from={KEY_FROM} />
}
