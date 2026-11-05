/*
 * Back of House's camera stops as the page holds them (GAMES.md §2.6, "Back of House", Cameras; §2.3, "Camera grammar"): their ids and
 * the words on their buttons, and the house's floors the scene stands on, read from the view the way the 2D house reads it. No three and
 * no geometry here, so the page holds the buttons and `C` before the 3D chunk loads; the scene frames each stop (scene-presets.ts).
 *
 *   Cutaway            Establish: the whole house at three quarters, every storey's deck in view.
 *   One floor          Focus, one for each storey, named by its tape.
 *   Follow the ticket  Follow: the storey the ticket stands on, moving with it stop by stop while a run plays (opt-in; under reduced
 *                      motion it cuts from stop to stop as the ticket does).
 */
import { housePlan, mapOfView, type Floor } from '@es/play/engine-floor/layout'
import type { FloorView } from '@es/play/engine-floor/types'

/** What the learner picks: the cutaway, one storey (by its place from the top, the line last), or the ticket's storey. */
export type CameraStop = 'cutaway' | `floor:${number}` | 'follow'

export const DEFAULT_STOP: CameraStop = 'cutaway'

/**
 * The house's floors for a view, as the 2D house plans them (packages/play/engine-floor/layout.ts): before the prediction only the floor the
 * request begins on, and a sealed view only the floors the route has reached. Processes from the top in the order the path first visits
 * them, the line (the GPU) last.
 */
export function floorsOf(view: FloorView): Floor[] {
  const map = mapOfView(view)
  const visited = [map.entry, map.capsule, ...map.stages.flatMap((stage) => [stage.from, stage.to]), ...(map.lamp === null ? [] : [map.lamp.place])]
  return housePlan(map.revealed ? [...map.plan, ...visited] : visited)
}

/** A floor's name on its button: its tape's words. */
export const floorLabel = (floor: Floor): string => floor.title

/** The stops the buttons show, in the order `C` cycles them. */
export function stopsOf(floors: readonly Floor[]): readonly { id: CameraStop; label: string }[] {
  return [{ id: 'cutaway', label: 'Cutaway' }, ...floors.map((floor, i) => ({ id: `floor:${i}` as const, label: floorLabel(floor) })), { id: 'follow', label: 'Follow the ticket' }]
}

/** The stop after `current`, wrapping: what `C` does. A stop the house no longer has starts from the cutaway. */
export function nextStop(stops: readonly { id: CameraStop }[], current: CameraStop): CameraStop {
  return stops[(stops.findIndex((stop) => stop.id === current) + 1) % stops.length].id
}
