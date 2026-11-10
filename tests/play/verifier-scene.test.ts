/*
 * The Tasting's 3D layout (W1-T29: src/games/verifier/scene-plan.ts and scene-layout.ts), which the scene draws with scene kit v1 and its
 * own plates, dispensers, stacks of what went out and heat lamps (scene-props.ts), and which decides nothing the session did not. The plan
 * is held to its measures and its shots (each puts the front course in the frame at the page's two widths), the room to the kit (every
 * prop builds, and what stands has a footprint), and the tasting to the view: each dish's three stacks and their parts, the plates the
 * latest rounds pulled, what went out, the lamps over the present, `gamma`'s run, and the motion grammar's reading of a change. All text
 * is an anchor for a DOM label.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildLevel } from '@es/play/verifier/levels'
import { verifierSession } from '@es/play/verifier/session'
import { excessPlates, keptPlates, sweepOfLevel, thousandths, tokensOf } from '@es/play/verifier/state'
import { MARKER_ROUNDS } from '@es/play/verifier/view'
import { DISHES, PLATES } from '@es/play/verifier/types'
import type { VerifierView } from '@es/play/verifier/types'
import { staticSceneTokens } from '@/design/scene-tokens'
import { framingFor } from '@/scene/camera-rig'
import { buildProp } from '@/scene/props/build'
import { paletteFrom } from '@/scene/props/palette'
import { changeOf, servedPlates, tastingKitchen, tastingScene, type Band } from '@/games/verifier/scene-layout'
import { columnX, DISH, FRONT, FULL, NAMES, planOf, PLATE, presetsOf, roomOf, rowZ, STACKS, stackHeight, TOP, type Plan } from '@/games/verifier/scene-plan'
import { SHADE, tastingLamp } from '@/games/verifier/scene-props'
import { DEFAULT_PRESET, TASTING_SHOTS } from '@/games/verifier/scene-shots'
import { runOf, sculptActions } from './verifier-support'

const S = verifierSession
const viewOf = (...args: Parameters<typeof runOf>): VerifierView => S.view(runOf(...args))
const planFor = (view: VerifierView): Plan => planOf(view.level === 'gamma' ? 'gamma' : 'rows', view.rows.length)
const sceneOf = (view: VerifierView, flags = { scaffold: true, outcome: true }) => tastingScene(view, planFor(view), flags)
const count = (bands: readonly Band[], band: Band) => bands.filter((b) => b === band).length
const SCENE = readFileSync(path.resolve(import.meta.dirname, '../../src/games/verifier/Scene3D.tsx'), 'utf8')
/** Each lamp's pool, along the pass and across it, as the scene draws it: read from its source, as tests/scene/lamp-light.test.ts reads it. */
const POOL = (/const POOL = \[([\d.]+), ([\d.]+)\] as const/.exec(SCENE) ?? []).slice(1).map(Number)
/** The haze over one course and over a run, from and to this far past what the camera looks at: read from the scene's source as well. */
const hazeOf = (name: string) => (new RegExp(`const ${name} = haze\\(([\\d.]+), ([\\d.]+)\\)`).exec(SCENE) ?? []).slice(1).map(Number)

describe('the plan: the pass, its courses and the room, in metres', () => {
  test('a course of six dishes across the pass, each three stacks two fingers apart and a hand clear of the next; a run goes back in rows', () => {
    const one = planOf('rows', 1)
    expect(one.columns).toBe(6)
    expect(columnX(one, 0)).toBeCloseTo(-columnX(one, 5))
    // A dish's three stacks, the commis's, the chef's and what went out, stand two fingers apart, so that stacked by hand (a few
    // millimetres off true each way) no two touch; and a hand clear of the next dish's, twice as far, so that a dish reads as one group.
    const within = [STACKS.chef - STACKS.commis - 2 * PLATE.r, STACKS.out - STACKS.chef - PLATE.r - PLATE.out]
    for (const gap of within) expect(gap).toBeGreaterThanOrEqual(0.015)
    const between = DISH - (STACKS.out + PLATE.out) + (STACKS.commis - PLATE.r)
    expect(between).toBeGreaterThanOrEqual(2 * Math.max(...within))
    // The pass holds every dish with room at its ends, and its front edge stands before the first course.
    expect(one.width / 2).toBeGreaterThan(columnX(one, 5) + STACKS.out + PLATE.out)
    expect(-one.width / 2).toBeLessThan(columnX(one, 0) + STACKS.commis - PLATE.r)
    expect(FRONT).toBeGreaterThan(PLATE.r + 0.1)
    const run = planOf('rows', 5)
    expect(rowZ(4)).toBeLessThan(rowZ(0))
    expect(run.back).toBeLessThan(rowZ(4) - PLATE.r)
    // Over a run the pass runs on to the left of the soup, for the courses' names, and its right end stays where a course's does.
    expect(run.width).toBeCloseTo(one.width + NAMES)
    expect(run.x - run.width / 2).toBeCloseTo(one.x - one.width / 2 - NAMES)
    expect(run.x + run.width / 2).toBeCloseTo(one.x + one.width / 2)
    // Over a run the lamps hang higher, so that the courses behind stand clear of them.
    expect(run.mouth).toBeGreaterThan(one.mouth)
    const gamma = planOf('gamma', 0)
    expect([gamma.columns, gamma.rows]).toEqual([8, 1])
  })

  test('a whole tasting of sixty-four plates stands 70 cm, and a stack of n plates rises one pitch a plate', () => {
    expect(stackHeight(0)).toBe(0)
    expect(stackHeight(1)).toBe(PLATE.h)
    expect(stackHeight(FULL)).toBeCloseTo(0.703, 3)
    expect(stackHeight(30) - stackHeight(29)).toBeCloseTo(PLATE.pitch)
  })

  test('three shots in the page\'s order and words; each frames the whole front course at 1440 and at 390 px', () => {
    expect(TASTING_SHOTS.map((shot) => shot.id)).toEqual(['run', 'course', 'walk'])
    expect(DEFAULT_PRESET).toBe('run')
    for (const plan of [planOf('rows', 1), planOf('rows', 5), planOf('gamma', 1)]) {
      const presets = presetsOf(plan, TASTING_SHOTS)
      expect(presets.map((preset) => [preset.id, preset.label, preset.shot])).toEqual([
        ['run', 'Over the run', 'establish'],
        ['course', 'One course', 'focus'],
        ['walk', 'Walk with the chef', 'follow'],
      ])
      // The page's boxes: about 715 by 490 px beside the mirror at 1440, 358 by 437 px on a 390 px phone, and 288 by 358 px at 320 px.
      for (const [width, height] of [
        [715, 490],
        [358, 437],
        [288, 358],
      ]) {
        for (const preset of presets.filter((p) => p.id !== 'walk')) {
          const framing = framingFor(preset, width)
          const ends = [columnX(plan, 0) + (plan.kind === 'gamma' ? 0 : STACKS.commis), columnX(plan, plan.columns - 1) + (plan.kind === 'gamma' ? 0 : STACKS.out)]
          for (const x of ends) {
            for (const y of [TOP, TOP + 0.3]) {
              const [px, py] = project(framing.position, framing.target, framing.fov, width / height, [x, y, 0])
              expect([plan.kind, plan.rows, preset.id, width, Math.abs(px) < 0.97 && Math.abs(py) < 0.97]).toEqual([plan.kind, plan.rows, preset.id, width, true])
            }
          }
        }
      }
    }
  })
})

describe('the framings of W1\'s finish review, round 1', () => {
  const at = (plan: Plan, id: string, width: number, height: number, point: readonly number[]) => {
    const framing = framingFor(presetsOf(plan, TASTING_SHOTS).find((preset) => preset.id === id) ?? presetsOf(plan, TASTING_SHOTS)[0], width)
    return project(framing.position, framing.target, framing.fov, width / height, point)
  }

  test('on a phone, over a run of courses, the pass\'s front edge stands at the foot of the box, so no floor shows under it', () => {
    for (const plan of [planOf('rows', 4), planOf('rows', 5)]) {
      for (const [width, height] of [
        [358, 437],
        [288, 358],
      ]) {
        const [, y] = at(plan, 'run', width, height, [0, TOP - 0.03, FRONT + 0.017])
        // In the box's lowest fifth, with the tags hung under the tape still in it.
        expect([plan.kind, plan.rows, width, y < -0.6 && y > -0.92]).toEqual([plan.kind, plan.rows, width, true])
      }
    }
  })

  test('over a run, at 1440, the hood stands above the box: its lower edge projects over the top', () => {
    for (const rows of [2, 3, 4, 5]) {
      const plan = planOf('rows', rows)
      const hood = tastingKitchen(plan, []).items.find((item) => item.kind === 'hood')
      if (hood?.kind !== 'hood') throw new Error('no hood')
      const [, y] = at(plan, 'run', 715, 490, [0, hood.at[1] - hood.height, hood.at[2] + hood.depth])
      expect([rows, y > 1]).toEqual([rows, true])
    }
  })

  test('on a phone, each dish\'s tag stands clear of the next one\'s, hung under the tape', () => {
    const view = viewOf('overlap', 0)
    const plan = planFor(view)
    const tags = sceneOf(view).anchors.filter((anchor) => anchor.kind === 'count')
    for (const [width, height] of [
      [358, 437],
      [715, 490],
    ]) {
      const xs = tags.map((tag) => ((at(plan, 'run', width, height, tag.at)[0] + 1) / 2) * width)
      // A tag of two counts in the printer's dots is about 45 px wide at its smallest print [estimated from the face's metrics].
      for (let d = 1; d < xs.length; d++) expect([width, d, xs[d] - xs[d - 1] > 48]).toEqual([width, d, true])
    }
  })
})

describe('the framings of W1\'s finish review, round 2', () => {
  const at = (plan: Plan, id: string, width: number, height: number, point: readonly number[]) => {
    const framing = framingFor(presetsOf(plan, TASTING_SHOTS).find((preset) => preset.id === id) ?? presetsOf(plan, TASTING_SHOTS)[0], width)
    return project(framing.position, framing.target, framing.fov, width / height, point)
  }

  test('on a phone, over one course, the camera stands low and near: the pass in the box\'s lower half and the floor in front of it under the foot', () => {
    // W1's finish review, round 2: from higher the wall and the lamps' cords took the top of the box and the pass its foot. Six pairs
    // across a phone's box stand no taller from any height, so the camera comes down and in, and the room over the pass falls into haze.
    for (const plan of [planOf('rows', 1), planOf('gamma', 1)]) {
      for (const [width, height] of [
        [358, 437],
        [288, 358],
        [447, 506],
      ]) {
        const [, edge] = at(plan, 'run', width, height, [0, TOP - 0.03, FRONT + 0.017])
        const [, floor] = at(plan, 'run', width, height, [0, 0, FRONT])
        expect([plan.kind, width, edge > -0.6 && edge < 0, floor < -1]).toEqual([plan.kind, width, true, true])
      }
    }
  })

  test('walking with the chef, every dish\'s tape on the pass\'s edge stands whole inside the box, at the page\'s boxes', () => {
    // W1's finish review, round 2: the soup's tape at the far end of the pass stood half out of the box, a stray letter over the salad's.
    // A tape is about 9 px a letter and 10 px of torn ends wide, and 22 px tall at most [estimated from the page's tapes, 37 to 53 px by
    // 17 to 20 px at 390 and 1440 px].
    for (const view of [viewOf('overlap', 0), S.view(runOf('chain', 1))]) {
      const plan = planFor(view)
      const tapes = sceneOf(view).anchors.filter((anchor) => anchor.kind === 'tape')
      expect(tapes).toHaveLength(6)
      for (const [width, height] of [
        [715, 490],
        [715, 512],
        [715, 435],
        [562, 348],
        [704, 288],
        [358, 437],
        [447, 506],
        [288, 358],
      ]) {
        for (const tape of tapes) {
          const [nx, ny] = at(plan, 'walk', width, height, tape.at)
          const x = ((nx + 1) / 2) * width
          const y = ((1 - ny) / 2) * height
          const half = (10 + 9 * tape.text.length) / 2
          expect([view.level, width, height, tape.text, x - half > 0 && x + half < width && y - 11 > 0 && y + 11 < height]).toEqual([view.level, width, height, tape.text, true])
        }
      }
    }
  })
})

describe('the framings of W1b\'s finish review, round 1', () => {
  const at = (plan: Plan, id: string, width: number, height: number, point: readonly number[]) => {
    const framing = framingFor(presetsOf(plan, TASTING_SHOTS).find((preset) => preset.id === id) ?? presetsOf(plan, TASTING_SHOTS)[0], width)
    return project(framing.position, framing.target, framing.fov, width / height, point)
  }

  test('at 1440, over one course, the hood\'s lip stands whole along the top of the box, its lights under it, and the lamps whole', () => {
    // W1b's finish review, round 1: bare tile ran up to the top edge with nothing ending it, and two short bars, the hood's lights, were
    // cut by the edge. The camera tilts up until the hood's lip and its lights stand inside the box, and only its skirt meets the edge.
    for (const plan of [planOf('rows', 1), planOf('gamma', 1)]) {
      const kitchen = tastingKitchen(plan, plan.kind === 'gamma' ? [[columnX(plan, 0), 0]] : sceneOf(viewOf('overlap', 0)).lamps)
      const hood = kitchen.items.find((item) => item.kind === 'hood')
      const lip = kitchen.items.find((item) => item.id === 'lip')
      if (hood?.kind !== 'hood' || lip?.kind !== 'rail') throw new Error('no hood and lip')
      const front = hood.at[2] + hood.depth
      for (const [width, height] of [
        [715, 490],
        [715, 512],
        [562, 348],
      ]) {
        const y = (point: readonly number[]) => at(plan, 'run', width, height, point)[1]
        // The lip's bar, top and foot, inside the box's top fifth.
        for (const point of [
          [0, lip.at[1] + 0.025, lip.at[2]],
          [0, lip.at[1] - 0.02, lip.at[2]],
        ])
          expect([plan.kind, width, y(point) > 0.6 && y(point) < 0.98]).toEqual([plan.kind, width, true])
        // The lights under its front edge, whole: their foot is inside too.
        for (const x of [-hood.width / 4, hood.width / 4]) expect([plan.kind, width, y([x, hood.at[1] - hood.height - 0.05, front - 0.12]) < 0.98]).toEqual([plan.kind, width, true])
        // The lamps under it, their canopies' cords running up past the lip: each shade whole inside the box.
        for (const light of kitchen.lights) {
          const [lx, ly] = at(plan, 'run', width, height, [light.at[0], plan.mouth + 0.2, light.at[2]])
          expect([plan.kind, width, Math.abs(lx) < 0.97 && ly < 0.95]).toEqual([plan.kind, width, true])
        }
      }
    }
  })

  test('over a run, at 1440, the lamps over the front course stand whole inside the box, their shades clear of its sides', () => {
    for (const rows of [2, 3, 4, 5]) {
      const plan = planOf('rows', rows)
      const kitchen = tastingKitchen(plan, sceneOf(viewOf('overlap', 0)).lamps)
      for (const light of kitchen.lights) {
        // The shade's lip is 118 mm round (the kit's heat lamp), and it reaches 20 cm over its mouth.
        for (const [dx, dy] of [
          [-0.12, 0],
          [0.12, 0],
          [0, 0.2],
        ]) {
          const [x, y] = at(plan, 'run', 715, 490, [light.at[0] + dx, plan.mouth + dy, light.at[2]])
          expect([rows, light.id, dx, dy, Math.abs(x) < 1 && Math.abs(y) < 1]).toEqual([rows, light.id, dx, dy, true])
        }
      }
    }
  })

  test('on a phone, over one course, the camera comes down under the lamps\' mouths, as near as the dishes\' names on tape allow', () => {
    // W1b's finish review, round 1: bring the camera down and in. Down, under the shades' mouths, so their bulbs show and the stacks stand
    // against the room; in, no further than the outer dishes' tapes and tags allow, whole inside the box (about 9 px a letter and 10 px of
    // torn ends a tape, and 7 px a character and 10 px of paper a tag [estimated from the page's labels: at 390 px the soup's tape is
    // 38 px wide and its tag, "1 · 3", 43 px]). A box shaped to the pass is the owner's call (the surface brief's Unresolved).
    const plan = planOf('rows', 1)
    const framing = framingFor(presetsOf(plan, TASTING_SHOTS)[0], 358)
    expect(framing.position[1]).toBeLessThan(plan.mouth)
    const view = viewOf('overlap', 0)
    const labels = sceneOf(view).anchors.filter((anchor) => anchor.kind === 'tape' || anchor.kind === 'count')
    expect(labels).toHaveLength(12)
    for (const [width, height] of [
      [358, 437],
      [447, 506],
    ]) {
      for (const label of labels) {
        const [nx] = at(plan, 'run', width, height, label.at)
        const x = ((nx + 1) / 2) * width
        const half = (10 + (label.kind === 'tape' ? 9 : 7) * label.text.length) / 2
        expect([width, label.text, x - half > 0 && x + half < width]).toEqual([width, label.text, true])
      }
    }
  })

})

describe('W1b\'s finish review, round 2: the back wall, the shades, the moment and the phone', () => {
  const at = (plan: Plan, id: string, width: number, height: number, point: readonly number[]) => {
    const framing = framingFor(presetsOf(plan, TASTING_SHOTS).find((preset) => preset.id === id) ?? presetsOf(plan, TASTING_SHOTS)[0], width)
    return project(framing.position, framing.target, framing.fov, width / height, point)
  }

  test('over one course at 1440, the haze veils the back wall\'s tile behind the lamps and does not make it a flat plane', () => {
    // W1b's finish review, round 2: the haze was whole by the wall, so the wall behind the lamps was one flat slate plane (a patch's
    // standard deviation 0, where round 1's tile gave 0.030). Over one course it starts behind the line and is about two thirds by the
    // wall, at least a tenth of the tile showing through it and no more than half: the line keeps more of its steel than the wall, and
    // the wall keeps its tile, veiled. Over a run it is still whole by the wall.
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
      return t * t * (3 - 2 * t)
    }
    const fogAt = (plan: Plan, haze: number[], point: readonly number[]) => {
      const framing = framingFor(presetsOf(plan, TASTING_SHOTS)[0], 715)
      const focus = Math.hypot(...framing.position.map((p, i) => p - framing.target[i]))
      const forward = framing.target.map((t, i) => t - framing.position[i]).map((v, _, f) => v / Math.hypot(...f))
      const depth = point.reduce((sum, p, i) => sum + (p - framing.position[i]) * forward[i], 0)
      return smooth(focus + haze[0], focus + haze[1], depth)
    }
    const one = planOf('rows', 1)
    const { lineZ, wallZ } = roomOf(one)
    const ONE = hazeOf('ONE_HAZE')
    expect(ONE).toHaveLength(2)
    for (const x of [-0.4, 0.4]) {
      // The wall between two lamps, from just over the line's worktops to under the hood.
      for (const y of [1.1, 1.5, 1.9]) {
        const fog = fogAt(one, ONE, [x, y, wallZ])
        expect([x, y, fog > 0.5 && fog < 0.9]).toEqual([x, y, true])
      }
      expect(fogAt(one, ONE, [x, 0.9, lineZ])).toBeLessThan(fogAt(one, ONE, [x, 1.1, wallZ]))
    }
    const run = planOf('rows', 4)
    expect(fogAt(run, hazeOf('HAZE'), [0, 1.5, roomOf(run).wallZ])).toBe(1)
  })

  test('the heat lamps\' shades are opaque steel: a brushed skin, a rim of bright steel and a dark well, under the kit\'s canopy and bulb', () => {
    // W1b's finish review, round 2: the kit's spun shade, a near mirror, took the room's haze on its flanks and read as frosted glass at
    // 1440. The Tasting's lamps keep the kit's canopy, cord, socket and bulb, and turn their own shade: no part of it is the spun metal.
    const palette = paletteFrom(staticSceneTokens())
    const kitchen = tastingKitchen(planOf('rows', 1), sceneOf(viewOf('overlap', 0)).lamps)
    const lamps = kitchen.items.filter((item) => item.kind === 'heat-lamp')
    expect(lamps).toHaveLength(3)
    for (const lamp of lamps) {
      const own = tastingLamp(lamp)
      expect(own.kind).toBe('custom')
      expect(own.at).toEqual(lamp.at)
      const parts = buildProp(own, palette).parts
      const kit = buildProp(lamp, palette).parts
      expect(parts.some((part) => part.color === palette.colorOf('alu'))).toBe(false)
      for (const tone of ['shaded', 'steel', 'deep'] as const) expect(parts.some((part) => part.color === palette.colorOf(tone))).toBe(true)
      // The kit's other parts are all there, the bulb's glow among them, and the shade is three turned parts in place of one.
      expect(parts.filter((part) => part.surface === 'glow')).toHaveLength(kit.filter((part) => part.surface === 'glow').length)
      expect(parts).toHaveLength(kit.length - 1 + SHADE.length)
    }
    // Any other prop passes through as it is.
    const pass = kitchen.items.find((item) => item.kind === 'pass')
    if (!pass) throw new Error('no pass')
    expect(tastingLamp(pass)).toBe(pass)
    // The skin runs up from the rim's top to the neck, the rim is a closed bead, and the well runs down from the socket to the rim's inner
    // top, so the three meet; the rim is the widest part, as the kit's rolled lip is.
    const [skin, rim, well] = SHADE.map(([section]) => section)
    expect(skin[0][1]).toBeLessThan(skin[skin.length - 1][1])
    expect(rim[0]).toEqual(rim[rim.length - 1])
    expect(well[well.length - 1]).toEqual(rim[0])
    expect(well[0][1]).toBeGreaterThan(well[well.length - 1][1])
    const widest = Math.max(...SHADE.flatMap(([section]) => section.map(([r]) => r)))
    expect(Math.max(...rim.map(([r]) => r))).toBe(widest)
    expect(widest).toBeLessThan(0.125)
  })

  test('what went out is a stack a glance finds: side plates beside her dispenser, as tall as what went out, up to its wires\' top', () => {
    // W1b's finish review, round 2: a ring on her stack's top left eight thousand rounds almost the same picture as none, and ten rounds as
    // one. What went out stands on side plates of its own beside her stack, at her plates' rise, so that settled it stands exactly as
    // tall as hers: two skylines that are one, where the empty level has none.
    const view = S.view(runOf('overlap', 0, { t: 'commit', prediction: 30 }, { t: 'draw', n: 100 }))
    const scene = sceneOf(view)
    expect(scene.served).toHaveLength(6)
    for (const [d, served] of scene.served.entries()) {
      expect(served.at).toEqual([columnX(planFor(view), d) + STACKS.out, TOP, 0])
      // Never taller than her dispenser's wires, which stand six plates over her stack.
      expect(served.cap).toBe(Math.min(FULL, view.rows[0].p[d] + 6))
      expect(stackHeight(served.cap)).toBeCloseTo(scene.dispensers[d].top)
    }
    // Clear of her dispenser's foot (72 mm round her stack, Scene3D.tsx's FOOT) and of the next dish's commis.
    expect(STACKS.out - PLATE.out - STACKS.chef).toBeGreaterThan(0.072)
    expect(DISH + STACKS.commis - PLATE.r - (STACKS.out + PLATE.out)).toBeGreaterThan(0.03)
    // A side plate is smaller than a tasting plate and rises as much, so its stack's height reads against hers.
    expect(PLATE.out).toBeLessThan(PLATE.r)
    // How many plates it stands: none for none or for a hidden figure, what went out, and no more than her dispenser's top.
    const first = scene.served[0]
    expect(servedPlates({ ...first, out: 0 })).toBe(0)
    expect(servedPlates({ ...first, out: null })).toBe(0)
    expect(servedPlates({ ...first, out: 3.25 })).toBe(3.25)
    expect(servedPlates({ ...first, out: FULL })).toBe(first.cap)
  })

  test('on a phone, over a run of any length, every dish\'s three stacks stand inside the box\'s sides', () => {
    // A dish's three stacks reach 17.5 cm either side of its middle, where its two reached 14 cm: the run's lens on a phone widens a degree
    // for each course less, so a short run (a copier's single course and her extra, or a run of three) keeps its outer stacks in the box.
    for (const rows of [2, 3, 4, 5]) {
      const plan = planOf('rows', rows)
      for (const [width, height] of [
        [358, 437],
        [288, 358],
      ]) {
        for (const x of [columnX(plan, 0) + STACKS.commis - PLATE.r, columnX(plan, 5) + STACKS.out + PLATE.out])
          for (const y of [TOP, TOP + 0.3]) expect([rows, width, x, y, Math.abs(at(plan, 'run', width, height, [x, y, 0])[0]) < 0.97]).toEqual([rows, width, x, y, true])
      }
    }
  })

  test('on a phone, over one course, no camera in front of the pass makes its stacks taller while the six dishes fit the box (the box is the owner\'s)', () => {
    // W1b's finish review, round 2, asked for the camera down and in until the pass and its stacks fill the 358 by 437 px box. Front on,
    // the six dishes' stacks span 2.35 m across the pass, so whatever the camera's height, distance and lens, once the outer stacks stand
    // inside the box's sides the steak's 29 plates stand no taller than about 46 px [derived]: the box is three times as tall as what it
    // frames is wide. The camera the scene keeps is at that bound; a box shaped to the pass is the owner's call (the surface brief).
    const plan = planOf('rows', 1)
    const left = columnX(plan, 0) + STACKS.commis - PLATE.r
    const right = columnX(plan, 5) + STACKS.out + PLATE.out
    const steak = columnX(plan, 3) + STACKS.chef
    let tallest = 0
    for (let y = 1; y <= 2.4; y += 0.2)
      for (let z = 1.8; z <= 5.2; z += 0.2)
        for (let fov = 30; fov <= 90; fov += 4)
          for (const ty of [0.9, 1.1, 1.3, 1.5]) {
            const position = [0, y, z]
            const target = [0, ty, -0.2]
            const inside = [left, right].every((x) => Math.abs(project(position, target, fov, 358 / 437, [x, TOP, 0])[0]) < 0.98)
            if (!inside) continue
            const [, foot] = project(position, target, fov, 358 / 437, [steak, TOP, 0])
            const [, head] = project(position, target, fov, 358 / 437, [steak, TOP + stackHeight(29), 0])
            tallest = Math.max(tallest, ((head - foot) / 2) * 437)
          }
    expect(tallest).toBeGreaterThan(40)
    expect(tallest).toBeLessThan(48)
    const [, foot] = at(plan, 'run', 358, 437, [steak, TOP, 0])
    const [, head] = at(plan, 'run', 358, 437, [steak, TOP + stackHeight(29), 0])
    expect(((head - foot) / 2) * 437).toBeGreaterThan(tallest - 4)
  })
})

/** Where a point lands in a perspective camera's view, as three draws it: x and y from -1 to 1. */
function project(position: readonly number[], target: readonly number[], fov: number, aspect: number, point: readonly number[]): [number, number] {
  const f = target.map((t, i) => t - position[i])
  const fl = Math.hypot(...f)
  const fw = f.map((v) => v / fl)
  const rl = Math.hypot(fw[2], fw[0])
  const r = [-fw[2] / rl, 0, fw[0] / rl]
  const u = [r[1] * fw[2] - r[2] * fw[1], r[2] * fw[0] - r[0] * fw[2], r[0] * fw[1] - r[1] * fw[0]]
  const v = point.map((p, i) => p - position[i])
  const depth = v[0] * fw[0] + v[1] * fw[1] + v[2] * fw[2]
  const k = Math.tan((fov * Math.PI) / 360)
  return [(v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / (depth * k * aspect), (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / (depth * k)]
}

describe('the room: scene kit v1\'s props, laid out for the plan', () => {
  const plan = planOf('rows', 1)
  const scene = sceneOf(viewOf('overlap', 0))
  const kitchen = tastingKitchen(plan, scene.lamps)
  const kinds = kitchen.items.map((item) => item.kind)

  test('a whole room: floor, tile on two walls, the hood over a line of five cold stations, the pass, the bell and three heat lamps', () => {
    for (const kind of ['floor', 'hood', 'pass', 'bell-base']) expect(kinds).toContain(kind)
    // The hood's lip runs along its skirt's foot, the kit's drawn bar.
    const hood = kitchen.items.find((item) => item.kind === 'hood')
    const lip = kitchen.items.find((item) => item.id === 'lip')
    if (hood?.kind !== 'hood' || lip?.kind !== 'rail') throw new Error('no hood and lip')
    expect(lip.length).toBeCloseTo(hood.width)
    expect(lip.at[1]).toBeCloseTo(hood.at[1] - hood.height + 0.035)
    expect(lip.at[2]).toBeGreaterThan(hood.at[2] + hood.depth)
    expect(kinds.filter((kind) => kind === 'tile-wall')).toHaveLength(2)
    expect(kinds.filter((kind) => kind === 'griddle' || kind === 'burners' || kind === 'fryer')).toHaveLength(5)
    expect(kinds.filter((kind) => kind === 'heat-lamp')).toHaveLength(3)
    expect(kitchen.items.find((item) => item.kind === 'pass')).toMatchObject({ width: plan.width, depth: plan.depth, height: TOP })
    // The lamps' light falls on the counter under each lamp, from the lamp's mouth.
    for (const light of kitchen.lights) {
      expect(light.at[1]).toBeCloseTo(plan.mouth - 0.02)
      expect(light.target[1]).toBe(TOP)
    }
  })

  test('every prop builds with the kit, and what stands on the floor or the counter has a footprint for its contact shadow', () => {
    const palette = paletteFrom(staticSceneTokens())
    for (const item of kitchen.items) {
      const built = buildProp(item, palette)
      expect(built.parts.length, item.id).toBeGreaterThan(0)
      // What hangs (the hood, its lip, the lamps) and what is the room itself casts no contact shadow.
      if (!['floor', 'tile-wall', 'hood', 'rail', 'heat-lamp'].includes(item.kind)) expect(built.footprints.length, item.id).toBeGreaterThan(0)
    }
  })

  test('the room\'s light falls away behind the pass and up the wall over the line, and the stations stay cold: no amber but over the present', () => {
    expect(kitchen.room.dim).toBeLessThan(1)
    // W1's finish review, round 2: an evenly lit tile wall stopped the room. It falls away from just over the line, and the floor seen
    // under the pass, through its open shelf, from just behind it.
    expect(kitchen.room.beyond).toBe(plan.back)
    const hood = kitchen.items.find((item) => item.kind === 'hood')
    if (hood?.kind !== 'hood') throw new Error('no hood')
    expect(kitchen.room.above).toBeLessThan(hood.at[1] - hood.height - 0.5)
  })

  test('the lamps hang straight over the course being tasted, and each one\'s pool lies on the counter under it, apart from the next', () => {
    // W1b's finish review, round 1: with the lamps a little behind the course, their light was an orange strip behind the stacks along
    // the pass's back lip. Each hangs over the front course, between two dishes' pairs, and its light falls plumb.
    expect(POOL).toHaveLength(2)
    for (const [x, z] of scene.lamps) {
      expect(z).toBeCloseTo(rowZ(0))
      expect(Math.min(...[0, 1, 2, 3, 4, 5].map((d) => Math.abs(Math.abs(x - columnX(plan, d)) - DISH / 2)))).toBeLessThan(1e-9)
    }
    for (const light of kitchen.lights) {
      expect([light.target[0], light.target[2]]).toEqual([light.at[0], light.at[2]])
      // The pool within the counter's depth, front and back.
      expect(light.target[2] + POOL[1]).toBeLessThan(FRONT)
      expect(light.target[2] - POOL[1]).toBeGreaterThan(plan.back)
    }
    const xs = kitchen.lights.map((light) => light.at[0]).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(2 * POOL[0])
    // The shades hang no higher than 80 cm over the counter, and their mouths a hand over the tallest stack a dish can have (a whole
    // tasting), so the shades hang over the plates they light.
    expect(plan.mouth - TOP).toBeLessThanOrEqual(0.8 + 1e-9)
    expect(plan.mouth - 0.02).toBeGreaterThan(TOP + stackHeight(FULL) + 0.05)
    // Over a run the shades hang higher, and the light leaves them there, at their mouths: the kit's light is a cone of haze from the
    // shade's mouth to its pool, and the pool is the kit's spread, a course deep, however high the shade (W1b-T10; a light that left a
    // hand under the shade drew its mouth's glow in the air under it).
    const run = planOf('rows', 4)
    const runKitchen = tastingKitchen(run, scene.lamps)
    for (const light of runKitchen.lights) expect(light.at[1]).toBeCloseTo(run.mouth - 0.02)
    expect(run.mouth).toBeGreaterThan(plan.mouth)
  })
})

describe('the tasting: each dish\'s stacks, as the view says', () => {
  test('in practice, the commis\'s stack is the overlap under his extra, and the chef\'s is the overlap under hers, plate for plate', () => {
    const view = viewOf('overlap', 0)
    const scene = sceneOf(view)
    const row = view.rows[0]
    row.p.forEach((p, d) => {
      const q = row.q?.[d] ?? 0
      const agreed = Math.min(p, q)
      const commis = scene.stacks.find((stack) => stack.id === `q0-${d}`)
      const chef = scene.stacks.find((stack) => stack.id === `p0-${d}`)
      if (q > 0) {
        expect(commis?.bands).toEqual([...Array(agreed).fill('probability-overlap'), ...Array(q - agreed).fill('probability-draft')])
        expect(commis?.at).toEqual([columnX(planFor(view), d) + STACKS.commis, TOP, 0])
      } else expect(commis).toBeUndefined()
      if (p > 0) {
        expect(chef?.bands).toEqual([...Array(agreed).fill('probability-overlap'), ...Array(p - agreed).fill('probability-residual')])
        expect(chef?.at).toEqual([columnX(planFor(view), d) + STACKS.chef, TOP, 0])
      } else expect(chef).toBeUndefined()
    })
    // A dispenser for every dish, its wires a few plates over her stack and no taller (W1's finish review, round 2: wires a dozen plates
    // over the tallest stack stood three times as tall as most, and the empty ones read as a forest of bare loops).
    expect(scene.dispensers).toHaveLength(6)
    scene.dispensers.forEach((dispenser, d) => {
      expect(dispenser.at).toEqual([columnX(planFor(view), d) + STACKS.chef, TOP, 0])
      expect(dispenser.top).toBeCloseTo(stackHeight(Math.min(FULL, row.p[d] + 6)))
      expect(dispenser.top).toBeGreaterThan(stackHeight(row.p[d]))
    })
    // The plates both stacks share, counted over the course, are α's sixty-fourths: what `overlap` asks the learner to predict.
    const shared = scene.stacks.filter((stack) => stack.id.startsWith('q')).reduce((sum, stack) => sum + count(stack.bands, 'probability-overlap'), 0)
    expect(shared).toBe(keptPlates(buildLevel('overlap', 0)))
  })

  test('a graded run draws the stacks plain: the commis\'s in the draft\'s code, the chef\'s in the target\'s', () => {
    const scene = sceneOf(viewOf('exact', 0), { scaffold: false, outcome: false })
    for (const stack of scene.stacks) expect(new Set(stack.bands)).toEqual(new Set([stack.id.startsWith('q') ? 'probability-draft' : 'probability-target']))
    expect(scene.served.every((served) => served.out === null)).toBe(true)
  })

  test('a run of courses stands in rows into depth, the chef\'s extra course last with her stacks alone, each row named on tape', () => {
    const level = buildLevel('chain', 1)
    const view = S.view(runOf('chain', 1))
    const scene = sceneOf(view)
    expect(view.rows).toHaveLength(level.q.length + 1)
    const bonus = view.rows.length - 1
    expect(scene.stacks.some((stack) => stack.id.startsWith(`q${bonus}-`))).toBe(false)
    for (const stack of scene.stacks.filter((s) => s.id.startsWith(`p${bonus}-`))) expect(new Set(stack.bands)).toEqual(new Set(['probability-target']))
    for (const stack of scene.stacks) expect(stack.at[2]).toBe(rowZ(Number(/^[pq](\d+)-/.exec(stack.id)?.[1])))
    expect(scene.tapes.filter((tape) => tape.id.startsWith('row-')).map((tape) => tape.text)).toEqual([...view.rows.slice(0, -1).map((row) => row.label), "chef's extra"])
  })

  test('every word is an anchor for a DOM label: the dishes on the pass\'s edge, and a single course\'s counts on paper', () => {
    const view = viewOf('overlap', 0)
    const scene = sceneOf(view)
    expect(scene.anchors.filter((anchor) => anchor.kind === 'tape' && anchor.id.startsWith('tape-col-')).map((anchor) => anchor.text)).toEqual([...DISHES])
    // One paper tag a dish, the commis's plates and then the chef's, hung from the pass's edge under the dish's tape, so that no tag
    // stands between a tape and its stacks, from any height (W1's finish review, round 1: at 390 px the tags met the tape).
    const counts = scene.anchors.filter((anchor) => anchor.kind === 'count')
    expect(counts.map((anchor) => anchor.text)).toEqual(view.rows[0].p.map((p, d) => `${view.rows[0].q?.[d] ?? 0} · ${p}`))
    counts.forEach((anchor, d) => {
      const tape = scene.anchors.find((candidate) => candidate.id === `tape-col-${d}`)
      expect(anchor.at[0]).toBeCloseTo(columnX(planFor(view), d))
      expect(anchor.at[1]).toBeLessThan((tape?.at[1] ?? 0) - 0.1)
      expect(anchor.at[2]).toBeGreaterThanOrEqual(FRONT)
    })
    // A run's courses print no counts on the pass: the mirror carries them.
    expect(sceneOf(S.view(runOf('chain', 1))).anchors.some((anchor) => anchor.kind === 'count')).toBe(false)
  })

  test('a run\'s courses are named on the strip of the pass left of the soup, each name a step further left into depth, clear of its stacks', () => {
    for (const seed of [0, 1, 2, 3]) {
      const view = S.view(runOf('chain', seed))
      const plan = planFor(view)
      const scene = sceneOf(view)
      const rows = scene.anchors.filter((anchor) => anchor.kind === 'row')
      expect(rows).toHaveLength(view.rows.length)
      rows.forEach((anchor, r) => {
        const tape = scene.tapes.find((candidate) => `tape-${candidate.id}` === anchor.id)
        if (!tape) throw new Error(anchor.id)
        // On the pass, and its tape clear of the soup's commis stack.
        expect(tape.center[0] - tape.size[0] / 2).toBeGreaterThanOrEqual(plan.x - plan.width / 2)
        expect(tape.center[0] + tape.size[0] / 2).toBeLessThan(columnX(plan, 0) + STACKS.commis - PLATE.r)
        expect(anchor.at[2]).toBeCloseTo(rowZ(r) + 0.02)
        if (r > 0) expect(anchor.at[0]).toBeLessThan(rows[r - 1].at[0])
      })
    }
  })
})

describe('the draws: the plates the latest rounds pulled, and what went out', () => {
  const level = buildLevel('overlap', 0)
  const drawn = runOf('overlap', 0, { t: 'commit', prediction: keptPlates(level) }, { t: 'draw', n: 100 })
  const view = S.view(drawn)
  const scene = sceneOf(view)

  test('a pulled plate is a plate of the commis\'s stack at its coin\'s height: kept exactly when it is one of the plates the two share', () => {
    expect(scene.markers.length).toBeGreaterThan(0)
    const row = view.rows[0]
    for (const marker of scene.markers) {
      const dish = Number(marker.id.split(':')[1])
      const q = row.q?.[dish] ?? 0
      const agreed = Math.min(row.p[dish], q)
      expect(marker.plate).toBeGreaterThanOrEqual(0)
      expect(marker.plate).toBeLessThan(q)
      expect(marker.kept).toBe(marker.plate < agreed)
      expect(marker.band).toBe(marker.kept ? 'probability-overlap' : 'probability-draft')
      expect(marker.at).toEqual([columnX(planFor(view), dish) + STACKS.commis, TOP, 0])
      // Only the latest rounds show, as in the 2D view.
      expect(marker.round).toBeGreaterThanOrEqual(view.counters.rounds - MARKER_ROUNDS)
    }
    // One plate a place: a place pulled again shows its latest round.
    expect(new Set(scene.markers.map((marker) => marker.id)).size).toBe(scene.markers.length)
  })

  test('what went out stands at its count, sampled from the rounds: none where nothing of a dish went out, up to her dispenser\'s top', () => {
    for (const [d, served] of scene.served.entries()) {
      expect(served.out).toBeCloseTo((view.rows[0].emitted[d] / view.rows[0].reached) * PLATES)
      // Each stands beside its own dispenser, no taller than its wires.
      expect(served.at[0] - scene.dispensers[d].at[0]).toBeCloseTo(STACKS.out - STACKS.chef)
      expect(stackHeight(servedPlates(served))).toBeLessThanOrEqual(scene.dispensers[d].top + 1e-9)
      if ((served.out ?? 0) <= served.cap) expect(servedPlates(served)).toBe(served.out ?? 0)
    }
    // A run's first round puts all it served on one dish: that dish stands to its wires' top and the rest stand bare.
    const first = sceneOf(S.view(runOf('overlap', 0, { t: 'commit', prediction: 30 }, { t: 'draw', n: 10 }), ...[]))
    expect(first.served.some((served) => servedPlates(served) > 0)).toBe(true)
  })

  test('an exact recipe stands what went out exactly as tall as her stack, dish by dish; a wrong one leaves some taller or shorter', () => {
    const exact = buildLevel('exact', 0)
    const right = S.view(runOf('exact', 0, ...sculptActions(excessPlates(exact))))
    expect(sceneOf(right).served.map(servedPlates)).toEqual([...exact.p[0]])
    expect(sceneOf(right).served.map((served) => stackHeight(servedPlates(served)))).toEqual(exact.p[0].map(stackHeight))
    const wrong = S.view(runOf('exact', 0, ...sculptActions(exact.p[0])))
    expect(sceneOf(wrong).served.some((served, d) => servedPlates(served) !== exact.p[0][d])).toBe(true)
  })

  test('a draw keeps what stands: the stacks and the dispensers are the same lists, so the scene builds them once a course', () => {
    const before = sceneOf(S.view(runOf('overlap', 0, { t: 'commit', prediction: 30 })))
    const after = sceneOf(S.view(runOf('overlap', 0, { t: 'commit', prediction: 30 }, { t: 'draw', n: 10 })))
    expect(after.stacks).toBe(before.stacks)
    expect(after.dispensers).toBe(before.dispensers)
  })
})

describe('`gamma`: a run of eight stacks across the pass', () => {
  test('each position a whole tasting, the plates kept if the walk gets there under the rest; past the pick, upside down', () => {
    const level = buildLevel('gamma', 0)
    if (level.id !== 'gamma') throw new Error('gamma')
    const view = S.view(runOf('gamma', 0, { t: 'gamma', k: 3 }))
    const scene = sceneOf(view)
    expect(scene.stacks).toHaveLength(8)
    scene.stacks.forEach((stack, j) => {
      expect(stack.bands).toHaveLength(FULL)
      expect(count(stack.bands, 'probability-overlap')).toBe(Math.round((level.alphas[j] * FULL) / 1000))
      expect(stack.flipped).toBe(j >= 3)
    })
    expect(scene.dispensers).toEqual([])
    expect(scene.lit).toBe(true)
    // The lamps hang over the plated run, and the scene keeps their list while the run is the same length.
    for (const [x] of scene.lamps) expect(x).toBeLessThanOrEqual(columnX(planFor(view), 2) + 1e-9)
    expect(sceneOf(S.view(runOf('gamma', 0, { t: 'gamma', k: 3 }))).lamps).toBe(scene.lamps)
    // Before a pick and once served, no lamp burns: the present has no place.
    expect(sceneOf(S.view(runOf('gamma', 0))).lit).toBe(false)
    expect(sceneOf(S.view(runOf('gamma', 0, { t: 'gamma', k: sweepOfLevel(level).best }, { t: 'submit' }))).lit).toBe(false)
  })
})

describe('what moves (the motion grammar): a draw is the bell, a change of the learner\'s own settles, anything else cuts', () => {
  test('rounds drawn ring the bell; a new level, a first frame or an undone draw cut; a recipe or a card settles', () => {
    const level = buildLevel('chain', 1)
    const committed = S.view(runOf('chain', 1, { t: 'commit', prediction: thousandths(tokensOf(level)) }))
    const drew = S.view(runOf('chain', 1, { t: 'commit', prediction: thousandths(tokensOf(level)) }, { t: 'draw', n: 20 }))
    const more = S.view(runOf('chain', 1, { t: 'commit', prediction: thousandths(tokensOf(level)) }, { t: 'draw', n: 20 }, { t: 'draw', n: 100 }))
    expect(changeOf(null, committed)).toBe('cut')
    expect(changeOf(committed, drew)).toBe('bell')
    expect(changeOf(drew, more)).toBe('bell')
    expect(changeOf(more, drew)).toBe('cut')
    expect(changeOf(drew, viewOf('overlap', 0))).toBe('cut')
    const exact = buildLevel('exact', 0)
    const recipe = S.view(runOf('exact', 0, ...sculptActions(excessPlates(exact))))
    const nudged = S.view(runOf('exact', 0, ...sculptActions(excessPlates(exact)), { t: 'sculpt', token: 0, delta: 1 }))
    expect(changeOf(recipe, nudged)).toBe('settle')
  })

  test('a batch of rounds is one view: a draw of a hundred moves the scene once, whatever its size', () => {
    const level = buildLevel('overlap', 0)
    const before = S.view(runOf('overlap', 0, { t: 'commit', prediction: keptPlates(level) }))
    const after = S.view(runOf('overlap', 0, { t: 'commit', prediction: keptPlates(level) }, { t: 'draw', n: 100 }))
    expect(after.counters.rounds - before.counters.rounds).toBe(100)
    expect(changeOf(before, after)).toBe('bell')
  })
})
