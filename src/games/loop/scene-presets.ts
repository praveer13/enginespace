/*
 * Service's camera presets (GAMES.md §2.6, "Service", Cameras; §3, "3D scene"): three shots of the pass, a button each, and `C` to
 * cycle them. They live apart from the scene's layout, and with no three in them, so the game's page holds the buttons and the key
 * before the 3D chunk loads, and the 2D view is never the lesser path to them.
 *
 *   Over the shoulder  along time (Establish): from behind the expo, across the pass and down the night, about 26° up, so the rail
 *                      hangs across the top third, the pass runs across the middle and the line goes off into the night beyond it.
 *                      The front page opens here.
 *   Side of the pass   Compare: an orthographic shot from the expo's side, where a fire is a length and a dark stretch a gap, with the
 *                      present on the right as in the 2D view.
 *   Under the lamps    top: down on the rail and the places, where empty clips and empty places are easy to count.
 *
 * Every number here is a framing in scene units [estimated], set by projecting the layout's landmarks (the rail, the pass, the
 * printer) into a 16:10 canvas and a phone's portrait one. Below 480 px wide the portrait framing runs the night up the screen.
 */
import type { CameraPreset } from '@/scene/camera-rig'

export const LOOP_PRESETS: readonly CameraPreset[] = [
  {
    id: 'shoulder',
    label: 'Over the shoulder',
    shot: 'establish',
    projection: 'perspective',
    position: [-0.05, 3.0, 5.0],
    target: [0.1, 0.35, -0.4],
    fov: 40,
    portrait: { position: [0.15, 5.3, 6.9], target: [0.15, 0.3, -2.0], fov: 48 },
  },
  {
    id: 'side',
    label: 'Side of the pass',
    shot: 'compare',
    projection: 'orthographic',
    position: [-9.5, 7.4, -3.4],
    target: [0.4, 0.2, -3.4],
    viewHeight: 6.4,
    portrait: { viewHeight: 12.5 },
  },
  {
    id: 'lamps',
    label: 'Under the lamps',
    shot: 'top',
    projection: 'perspective',
    position: [0.15, 11.5, 1.6],
    target: [0.15, 0, -2.6],
    fov: 40,
    portrait: { position: [0.3, 15.5, 0.4], target: [0.3, 0, -3.4], fov: 46 },
  },
]

export const DEFAULT_PRESET = LOOP_PRESETS[0].id
