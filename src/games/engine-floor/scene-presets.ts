/*
 * Back of House's camera framings (GAMES.md §2.6, "Back of House", Cameras; §5, "3D scene"; §2.3, "Camera grammar"), one for each stop
 * the page names (scene-stops.ts), fitted to the house the scene builds (scene-layout.ts):
 *
 *   Cutaway            Establish: the whole house at three quarters from the right and a little above, every storey's deck in view, the
 *                      line at its foot and the two towers at its sides.
 *   One floor          Focus, one for each storey: the floor's deck and its hands fill the frame, the towers at its ends.
 *   Follow the ticket  Follow: a storey's framing for each storey, which the scene names by the storey the ticket stands on, so the rig
 *                      moves (or cuts, under reduced motion) from stop to stop as the ticket does.
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

/** The whole house, a little above and from the right; a house of one storey (before the prediction) is that storey. */
function cutaway(house: House, aspect: number): Fit {
  if (house.storeys.length === 1) return storey(house, 0, aspect)
  const { min, max } = house.box
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2 - 0.05, (min[2] + max[2]) / 2]
  return fit(center, max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.42, 0.24, aspect, aspect < 1 ? 1.06 : 1.12)
}

/** One storey: its deck and its hands, or the line and its hood. */
function storey(house: House, index: number, aspect: number): Fit {
  const { min, max } = house.box
  const line = house.storeys[index]?.line ?? false
  const height = line ? 1.5 : 0.78
  const center: Vec3 = [(min[0] + max[0]) / 2, (house.storeys[index]?.y ?? 0) + height * (line ? 0.52 : 0.42), (min[2] + max[2]) / 2 + 0.1]
  return fit(center, max[0] - min[0], height, max[2] - min[2], 0.32, line ? 0.16 : 0.3, aspect, aspect < 1 ? 1.04 : 1.1)
}

const preset = (id: string, shot: CameraPreset['shot'], make: (aspect: number) => Fit): CameraPreset => ({
  id,
  label: id,
  shot,
  projection: 'perspective',
  ...make(ASPECT.landscape),
  portrait: make(ASPECT.portrait),
})

/** The camera rig's presets for a house: the cutaway, a floor's for each storey, and a follow for each storey. */
export function presetsOf(house: House): CameraPreset[] {
  return [
    preset('cutaway', 'establish', (aspect) => cutaway(house, aspect)),
    ...house.storeys.map((_, i) => preset(`floor:${i}`, 'focus', (aspect) => storey(house, i, aspect))),
    ...house.storeys.map((_, i) => preset(`follow:${i}`, 'follow', (aspect) => storey(house, i, aspect))),
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
