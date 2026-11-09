/*
 * The Tasting's 3D layout (W1-T29: src/games/verifier/scene-plan.ts and scene-layout.ts), which the scene draws with scene kit v1 and its
 * own plates, dispensers and rings, and which decides nothing the session did not. The plan is held to its measures and its shots (each
 * puts the front course in the frame at the page's two widths), the room to the kit (every prop builds, and what stands has a footprint),
 * and the tasting to the view: each dish's two stacks and their parts, the plates the latest rounds pulled, the rings of what went out,
 * the lamps over the present, `gamma`'s run, and the motion grammar's reading of a change. All text is an anchor for a DOM label.
 */
import { describe, expect, test } from 'bun:test'
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
import { changeOf, ringHeight, tastingKitchen, tastingScene, type Band } from '@/games/verifier/scene-layout'
import { columnX, FRONT, FULL, NAMES, PAIR, planOf, PLATE, presetsOf, ROW, rowZ, stackHeight, TOP, type Plan } from '@/games/verifier/scene-plan'
import { DEFAULT_PRESET, TASTING_SHOTS } from '@/games/verifier/scene-shots'
import { runOf, sculptActions } from './verifier-support'

const S = verifierSession
const viewOf = (...args: Parameters<typeof runOf>): VerifierView => S.view(runOf(...args))
const planFor = (view: VerifierView): Plan => planOf(view.level === 'gamma' ? 'gamma' : 'rows', view.rows.length)
const sceneOf = (view: VerifierView, flags = { scaffold: true, outcome: true }) => tastingScene(view, planFor(view), flags)
const count = (bands: readonly Band[], band: Band) => bands.filter((b) => b === band).length

describe('the plan: the pass, its courses and the room, in metres', () => {
  test('a course of six dishes across the pass, each a commis stack and a chef stack a hand apart; a run goes back in rows', () => {
    const one = planOf('rows', 1)
    expect(one.columns).toBe(6)
    expect(columnX(one, 0)).toBeCloseTo(-columnX(one, 5))
    // The pass holds every pair with room at its ends, and its front edge stands before the first course.
    expect(one.width / 2).toBeGreaterThan(columnX(one, 5) + PAIR + PLATE.r)
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
          const ends = [columnX(plan, 0) - (plan.kind === 'gamma' ? 0 : PAIR), columnX(plan, plan.columns - 1) + (plan.kind === 'gamma' ? 0 : PAIR)]
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

  test('the lamps hang a little behind the course, so their light pools on its plates and not on the pass in front of them', () => {
    // W1's finish review, round 2: from over the front course, brushed steel showed the lamps' light as a wash in front of it.
    for (const [, z] of scene.lamps) {
      expect(z).toBeLessThan(0)
      expect(z).toBeGreaterThan(-ROW / 2)
    }
    // Over a run the shades hang higher, and the light still leaves at a course's height, so its pool is a course deep.
    const run = planOf('rows', 4)
    const runKitchen = tastingKitchen(run, scene.lamps)
    for (const light of runKitchen.lights) expect(light.at[1]).toBeCloseTo(plan.mouth - 0.02)
    expect(run.mouth).toBeGreaterThan(plan.mouth)
  })
})

describe('the tasting: each dish\'s two stacks, as the view says', () => {
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
        expect(commis?.at).toEqual([columnX(planFor(view), d) - PAIR, TOP, 0])
      } else expect(commis).toBeUndefined()
      if (p > 0) {
        expect(chef?.bands).toEqual([...Array(agreed).fill('probability-overlap'), ...Array(p - agreed).fill('probability-residual')])
        expect(chef?.at).toEqual([columnX(planFor(view), d) + PAIR, TOP, 0])
      } else expect(chef).toBeUndefined()
    })
    // A dispenser for every dish, its wires a few plates over her stack and no taller (W1's finish review, round 2: wires a dozen plates
    // over the tallest stack stood three times as tall as most, and the empty ones read as a forest of bare loops).
    expect(scene.dispensers).toHaveLength(6)
    scene.dispensers.forEach((dispenser, d) => {
      expect(dispenser.at).toEqual([columnX(planFor(view), d) + PAIR, TOP, 0])
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
    expect(scene.rings.every((ring) => ring.out === null)).toBe(true)
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
        expect(tape.center[0] + tape.size[0] / 2).toBeLessThan(columnX(plan, 0) - PAIR - PLATE.r)
        expect(anchor.at[2]).toBeCloseTo(rowZ(r) + 0.02)
        if (r > 0) expect(anchor.at[0]).toBeLessThan(rows[r - 1].at[0])
      })
    }
  })
})

describe('the draws: the plates the latest rounds pulled, and the rings of what went out', () => {
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
      expect(marker.at).toEqual([columnX(planFor(view), dish) - PAIR, TOP, 0])
      // Only the latest rounds show, as in the 2D view.
      expect(marker.round).toBeGreaterThanOrEqual(view.counters.rounds - MARKER_ROUNDS)
    }
    // One plate a place: a place pulled again shows its latest round.
    expect(new Set(scene.markers.map((marker) => marker.id)).size).toBe(scene.markers.length)
  })

  test('the rings stand at what went out, sampled from the rounds, and go to the counter where nothing of a dish went out', () => {
    for (const [d, ring] of scene.rings.entries()) {
      expect(ring.out).toBeCloseTo((view.rows[0].emitted[d] / view.rows[0].reached) * PLATES)
      // Each ring rides its own dispenser's wires.
      expect(ring.top).toBe(scene.dispensers[d].top)
    }
    const top = stackHeight(FULL)
    expect(ringHeight(0, top)).toBeCloseTo(0.005)
    // The ring sits round the edge of the plate it reaches: within that plate's band, above the one under it.
    for (const plates of [1, 7, 29]) {
      const h = ringHeight(plates, top)
      expect(h).toBeGreaterThan(stackHeight(plates) - PLATE.pitch)
      expect(h).toBeLessThan(stackHeight(plates))
    }
    // More than the wires hold stays at their top; the mirror prints the figure.
    for (const ring of scene.rings) expect(ringHeight(FULL, ring.top)).toBeLessThan(ring.top)
  })

  test('an exact recipe puts every ring at the top of the chef\'s stack, its plates exactly; a wrong one leaves some off it', () => {
    const exact = buildLevel('exact', 0)
    const right = S.view(runOf('exact', 0, ...sculptActions(excessPlates(exact))))
    expect(sceneOf(right).rings.map((ring) => ring.out)).toEqual([...exact.p[0]])
    const wrong = S.view(runOf('exact', 0, ...sculptActions(exact.p[0])))
    expect(sceneOf(wrong).rings.some((ring, d) => ring.out !== exact.p[0][d])).toBe(true)
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
