/*
 * Service's camera presets (GAMES.md §2.6, "Service", Cameras; §3, "3D scene"): three shots of the pass, a button each, and `C` to
 * cycle them. They live apart from the scene's layout, and with no three in them, so the game's page holds the buttons and the key
 * before the 3D chunk loads, and the 2D view is never the lesser path to them.
 *
 *   Over the shoulder  Establish: from behind the expo, over the pass and through it to the line, about 22° down, so the heat lamps
 *                      hang at the top, the rail and its tickets run across the upper middle with the line burning beyond them, and
 *                      the pass with its plates runs across the lower middle. The printer and its tickets stand at the left.
 *   Side of the pass   Compare: orthographic, from the expo's left, along the pass: the rail over the fired rail, the plates in their
 *                      row, the line's stations beyond, every length true whatever its depth.
 *   Under the lamps    From just under the heat lamps, down on the rail and the plates: an empty clip and an empty place are easy
 *                      to count.
 *
 * The front page frames the same kitchen its own way (`FRONT_PRESETS`): the camera stands left of the rail's middle, so the clips
 * fall right of the order ticket that the page hangs on the rail, and the page's printer covers the pass's left end.
 *
 * Every number is a framing in metres [estimated], set by projecting the layout's landmarks (scene-layout.ts) into a 16:10 canvas,
 * the front page's pass and a phone's portrait canvas. Below 480 px wide the portrait framing stands closer and wider.
 */
import type { CameraPreset } from '@/scene/camera-rig'

export const LOOP_PRESETS: readonly CameraPreset[] = [
  {
    id: 'shoulder',
    label: 'Over the shoulder',
    shot: 'establish',
    projection: 'perspective',
    position: [0, 2.4, 2.4],
    target: [0, 1.1, -0.9],
    fov: 36,
    portrait: { position: [0, 2.3, 1.9], target: [0, 1, -0.6], fov: 50 },
  },
  {
    id: 'side',
    label: 'Side of the pass',
    shot: 'compare',
    projection: 'orthographic',
    position: [-3.6, 2.5, 2.8],
    target: [0.2, 1.05, -0.45],
    viewHeight: 2.3,
    portrait: { viewHeight: 4.2 },
  },
  {
    id: 'lamps',
    label: 'Under the lamps',
    shot: 'top',
    projection: 'perspective',
    position: [0, 1.78, 0.85],
    target: [0, 0.95, -0.3],
    fov: 56,
    portrait: { position: [0, 1.82, 1.35], target: [0, 0.92, -0.3], fov: 62 },
  },
]

export const DEFAULT_PRESET = LOOP_PRESETS[0].id

/** The front page's one shot: over the shoulder, with the clips right of the page's order ticket (anchors.ts hangs it). */
export const FRONT_PRESETS: readonly CameraPreset[] = [
  {
    id: 'front',
    label: 'Over the shoulder',
    shot: 'establish',
    projection: 'perspective',
    position: [-0.8, 2.25, 2.6],
    target: [-0.8, 1.05, -0.7],
    fov: 32,
    portrait: { position: [0, 2.2, 1.6], target: [0, 1, -0.5], fov: 50 },
  },
]

export const FRONT_PRESET = FRONT_PRESETS[0].id
