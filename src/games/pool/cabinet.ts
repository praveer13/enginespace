/*
 * The reach-in, The Reach-In's own prop (GAMES.md §2.6 "The Reach-In"; scene kit v1): made the kit's way, from shape.ts's bevelled
 * boxes and rods in the palette's tones, and listed in the scene's static set as a `CustomSpec`, so that it is merged by surface and its
 * occlusion is baked with the room's. Three and the kit only, no React, so a test builds it with the kit's `buildProp`.
 */
import { block, rod, type PropMaker } from '@/scene/props'
import { COLS, FRAME, PITCH, RAIL, TOP, type ReachIn } from './scene-layout'

/**
 * The reach-in, in its own space (its base's middle at the origin, its front toward +z): a cabinet with a reach-in door to each third and
 * a bar handle across each; its top a frame round the cold rail with the front edge rolled, the adapter bars the pans hang on, and a
 * bevelled lid over each slot a short last row leaves; and an overshelf on two posts at the back, under which the line's rail hangs.
 * The pass hides its foot from every shot, so it stands on its contact shadow.
 */
export function cabinet(m: PropMaker, { width: w, depth: d, rows, pans: { length: pages } }: ReachIn) {
  const half = w / 2
  const front = d / 2
  const gd = rows * PITCH.z
  const gz = -front + FRAME.back + gd / 2
  const third = w / 3
  m.add(block([w, TOP - 0.05, d], 0.02, [0, 0, 0]), 'steel')
  for (const x of [-third, 0, third]) {
    m.add(block([third - 0.03, TOP - 0.3, 0.028], 0.012, [x, 0.14, front + 0.004]), 'steel')
    m.add(rod([x - third / 2 + 0.1, TOP - 0.24, front + 0.05], [x + third / 2 - 0.1, TOP - 0.24, front + 0.05], 0.011, 14), 'chrome')
  }
  m.add(block([w, 0.04, FRAME.front], 0.008, [0, TOP - 0.04, front - FRAME.front / 2]), 'steel')
  m.add(rod([-half + 0.01, TOP - 0.018, front - 0.004], [half - 0.01, TOP - 0.018, front - 0.004], 0.019, 16), 'steel')
  m.add(block([w, 0.04, FRAME.back], 0.008, [0, TOP - 0.04, -front + FRAME.back / 2]), 'steel')
  for (const side of [-1, 1]) {
    m.add(block([FRAME.side, 0.04, gd], 0.008, [side * (half - FRAME.side / 2), TOP - 0.04, gz]), 'steel')
    m.add(rod([side * (half - 0.05), TOP - 0.02, -front + 0.06], [side * (half - 0.05), RAIL.y + 0.05, -front + 0.06], 0.017, 14), 'steel')
  }
  for (let c = 0; c <= COLS; c++) m.add(block([0.006, 0.012, gd], 0.002, [(c - COLS / 2) * PITCH.x, TOP - 0.012, gz], 0, 1), 'shaded')
  for (let row = 0; row <= rows; row++) m.add(block([COLS * PITCH.x, 0.012, 0.006], 0.002, [0, TOP - 0.012, -front + FRAME.back + row * PITCH.z], 0, 1), 'shaded')
  for (let k = rows * COLS - pages; k > 0; k--) m.add(block([PITCH.x - 0.01, 0.012, PITCH.z - 0.01], 0.0045, [half - FRAME.side - (k - 0.5) * PITCH.x, TOP - 0.01, front - FRAME.front - PITCH.z / 2]), 'steel')
  m.add(block([w, 0.032, 0.25], 0.008, [0, RAIL.y, -front + 0.125]), 'steel')
  m.shadow([0, 0, 0], [w, d], { radius: 0.05, soft: 0.16, strength: 0.8 })
}
