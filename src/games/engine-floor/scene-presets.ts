/*
 * Back of House's camera framings (GAMES.md §2.6, "Back of House", Cameras; §5, "3D scene"; §2.3, "Camera grammar"), one for each stop
 * the page names (scene-stops.ts), fitted to the house the scene builds (scene-layout.ts):
 *
 *   Cutaway            Establish: the whole house at three quarters from the right and a little above, every storey in view, the line's
 *                      canopy and cooktops at its foot and the two walls at its sides; a low house (before the prediction, the floor the
 *                      request begins on over the line) is framed on its hands, so the ticket under the lit lamp is the first thing found.
 *   One floor          Focus, one for each storey: the floor's room and its hands fill the frame, the walls at its ends; the line's is
 *                      taken from low enough to see up under the canopy.
 *   Follow the ticket  Follow: close on a pair of hands (or a stream), its ticket and its lamp in the middle, one for each; the scene names
 *                      the one the ticket stands at, so the rig moves (or cuts, under reduced motion) from hands to hands as it does.
 *
 * Every number is a framing in metres [estimated]: a perspective of about 30° (GAMES.md §2.3) at a distance that fits the box at the canvas's
 * shape, a landscape box of 13:10 (the stage's own, about 870 by 630 at 1440 px) and, below 480 px wide, a portrait one of 7:10.
 */
import type { FloorView } from '@es/play/engine-floor/types'
import type { CameraPreset, Framing, Vec3 } from '@/scene/camera-rig'
import { houseOf, presentOf, tapesOf, type House, type Spot, type Tape } from './scene-layout'
import { floorsOf } from './scene-stops'

const FOV = 30
const TAN = Math.tan((FOV * Math.PI) / 360)
/** The canvas's shape a framing is fitted to: a landscape box, and a phone's portrait one [estimated]. */
const ASPECT = { landscape: 1.3, portrait: 0.7 }

type Fit = Required<Pick<Framing, 'position' | 'target' | 'fov'>>

/** A framing that fits a box `w` × `h` (and `d` deep), seen from `yaw` round from the front and `pitch` above it, with a margin round it. */
function fit(center: Vec3, w: number, h: number, d: number, yaw: number, pitch: number, aspect: number, margin: number): Fit {
  // The box's silhouette across the view, turned by the yaw, and up it, tipped by the pitch.
  const across = Math.abs(w * Math.cos(yaw)) + Math.abs(d * Math.sin(yaw))
  const up = h * Math.cos(pitch) + d * Math.sin(pitch)
  const distance = (Math.max(up, across / aspect) * margin) / 2 / TAN + d / 2
  const [x, y, z] = center
  const flat = distance * Math.cos(pitch)
  return { position: [x + flat * Math.sin(yaw), y + distance * Math.sin(pitch), z + flat * Math.cos(yaw)], target: center, fov: FOV }
}

/**
 * The whole house, a little above and from the right, from the line's cooktops up: its storeys fill the box and the line's canopy and
 * cooktops stand at its foot, the floor in front of it left to the haze. A low house (the floor the request begins on, over the line, as the house stands before
 * the prediction, and nano-vllm's whole kitchen) is framed on its hands instead, whose first lane is at x = 0 on the first deck: on a
 * laptop their lit lamp and the ticket under it in the upper middle of the box, the canopy's lip and the cooktops at its foot; on a phone
 * the hands alone fill the box, their lamp at its top and their counter at its foot.
 */
function cutaway(house: House, aspect: number): Fit {
  const { min, max } = house.box
  const d = max[2] - min[2]
  const z = (min[2] + max[2]) / 2
  if (house.low) return aspect < 1 ? fit([0.15, 2.66, z], 0.85, 1.3, d, 0.42, 0.28, aspect, 1.04) : fit([0.35, 2.42, z], 2.2, 1.85, d, 0.42, 0.28, aspect, 1.04)
  return fit([(min[0] + max[0]) / 2, (0.9 + max[1]) / 2, z], max[0] - min[0], max[1] - 0.9, d, 0.42, 0.24, aspect, 1.1)
}

/** One storey: its room and its hands, or the line under its canopy. */
function storey(house: House, index: number, aspect: number): Fit {
  const { min, max } = house.box
  const line = house.storeys[index]?.line ?? false
  const height = line ? 1.9 : 1.3
  const center: Vec3 = [(min[0] + max[0]) / 2, (house.storeys[index]?.y ?? 0) + height / 2, (min[2] + max[2]) / 2 + 0.1]
  return fit(center, max[0] - min[0], height, max[2] - min[2], 0.32, line ? 0.1 : 0.2, aspect, aspect < 1 ? 1.04 : 1.1)
}

/**
 * Close on a pair of hands or a stream: its ticket, its lamp and the surface they work at, with their tape on its front and the chits of
 * their hand-offs either side; on a phone narrower, so the ticket is about as tall in the box as on a laptop's.
 */
function close(house: House, spot: Spot, aspect: number): Fit {
  const { min, max } = house.box
  return fit([spot.x, spot.y + 0.15, (min[2] + max[2]) / 2], aspect < 1 ? 1 : 1.6, 1.3, max[2] - min[2], 0.3, spot.gpu ? 0.08 : 0.16, aspect, 1.1)
}

const preset = (id: string, shot: CameraPreset['shot'], make: (aspect: number) => Fit): CameraPreset => ({
  id,
  label: id,
  shot,
  projection: 'perspective',
  ...make(ASPECT.landscape),
  portrait: make(ASPECT.portrait),
})

/** The camera rig's presets for a house: the cutaway, a floor's for each storey, and a follow for each pair of hands and each stream. */
export function presetsOf(house: House): CameraPreset[] {
  return [
    preset('cutaway', 'establish', (aspect) => cutaway(house, aspect)),
    ...house.storeys.map((_, i) => preset(`floor:${i}`, 'focus', (aspect) => storey(house, i, aspect))),
    ...[...house.spots.values()].map((spot) => preset(`follow:${spot.key}`, 'follow', (aspect) => close(house, spot, aspect))),
  ]
}

/**
 * The house the scene draws, laid out on the game's page from the view: the house, the present, the tapes and the camera's presets. The
 * scene imports none of this (only its types), and so no module the game's chunk holds, which keeps that chunk named for its source in
 * the manifest (verify:bundle finds a game by it); the route, which moves with every stage, is the scene's own (scene-route.ts).
 */
export interface SceneModel {
  readonly house: House
  readonly present: Spot | null
  readonly tapes: readonly Tape[]
  readonly presets: readonly CameraPreset[]
}

/** The scene's model of a view. `before` is the last model: its house, tapes and presets are kept while the house stays the same. */
export function sceneModelOf(view: FloorView, before: SceneModel | null = null): SceneModel {
  const fresh = houseOf(floorsOf(view))
  const same = before?.house.key === fresh.key
  const house = same ? before.house : fresh
  return { house, present: presentOf(view, house), tapes: same ? before.tapes : tapesOf(house), presets: same ? before.presets : presetsOf(house) }
}
