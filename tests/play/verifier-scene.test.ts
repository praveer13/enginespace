/*
 * The rejection sampler's 3D skylines (R-T42: src/games/verifier/scene-plan.ts and scene-layout.ts), which the scene draws with the kit's
 * flat track (src/scene/FlatTrack.tsx) and which decides nothing the session did not. The page offers them on the chain only, from a desk's
 * width. The layout is held to the view: one row of bars for each draft position, two bars for each token as tall as their counts, the
 * parts in their colours and forms, the output's collar at the output's height and on its bar, the drawn rounds' dots, and the value scale.
 * The plan is held to its shots (each puts the drawing in the frame and fills it, at the canvases a desk draws it in), the labels to their
 * room (none prints over another, over a nearer row's bar or across the canvas's edge, and on the practice numbers none is left out), and
 * the scene to its contract: nothing from src/scene/props, one authored move, every word a label for the DOM layer.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PerspectiveCamera, Vector3 } from 'three'
import { buildLevel } from '@es/play/verifier/levels'
import { verifierSession } from '@es/play/verifier/session'
import { keptPlates, thousandths, tokensOf } from '@es/play/verifier/state'
import type { VerifierView } from '@es/play/verifier/types'
import { MARKER_ROUNDS } from '@es/play/verifier/view'
import { axisOf } from '@/games/verifier/axis'
import { labelBox, labelsFor, PART, RING, SCALE, skylineOf, type SceneFlags } from '@/games/verifier/scene-layout'
import { GEO, presetsOf, projectorOf } from '@/games/verifier/scene-plan'
import { DEFAULT_PRESET, TASTING_SHOTS } from '@/games/verifier/scene-shots'
import { framingFor } from '@/scene/camera-rig'
import { morphModel, PX, type FlatBox, type FlatModel } from '@/scene/flat-track'
import { runOf } from './verifier-support'

const S = verifierSession
const viewOf = (...args: Parameters<typeof runOf>): VerifierView => S.view(runOf(...args))
const FLAGS: SceneFlags = { scaffold: true, outcome: true }
const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')
const boxesOf = (model: FlatModel, prefix: string): FlatBox[] => model.boxes.filter((box) => box.id.startsWith(prefix))
const top = (boxes: readonly FlatBox[]): number => Math.max(0, ...boxes.map((box) => (box.y0 ?? 0) + box.height))

const level = buildLevel('overlap', 0)
const committed = [{ t: 'commit', prediction: keptPlates(level) }, { t: 'draw', n: 100 }] as const
const chainLevel = buildLevel('chain', 1)
const chainActions = [{ t: 'commit', prediction: thousandths(tokensOf(chainLevel)) }, { t: 'draw', n: 100 }] as const

describe('the rows: one for each draft position, the first nearest, two bars for each token', () => {
  test('a run has a row for each position and the bonus token, the first nearest the viewer', () => {
    const many = viewOf('chain', 1)
    expect(many.rows.length).toBeGreaterThan(2)
    const run = skylineOf(many, FLAGS)
    expect(run.rows).toBe(many.rows.length)
    // A row's bars all stand on one band of depth, and the first row stands nearer the viewer than the next.
    const zs = many.rows.map((_, r) => boxesOf(run.model, `r${r}/p`).map((box) => box.z0))
    for (const row of zs) expect(new Set(row).size).toBe(1)
    for (let r = 1; r < zs.length; r++) expect(zs[r][0]).toBeLessThan(zs[r - 1][0])
    // Six tokens, two bars each (a token with none of a model's share has no bar of it), except the bonus row, where the target stands alone.
    many.rows.forEach((row, r) => {
      for (let t = 0; t < 6; t++) {
        expect(boxesOf(run.model, `r${r}/p${t}/`).length > 0).toBe(row.p[t] > 0)
        expect(boxesOf(run.model, `r${r}/q${t}/`).length > 0).toBe(row.q !== null && row.q[t] > 0)
      }
    })
  })

  test('each bar is as tall as its count out of the axis the rows share, whatever it is cut into', () => {
    for (const view of [viewOf('overlap', 0, ...committed), viewOf('chain', 1, ...chainActions)]) {
      const { model } = skylineOf(view, FLAGS)
      const scale = GEO.height / axisOf(view)
      view.rows.forEach((row, r) => {
        row.p.forEach((p, t) => {
          expect(top(boxesOf(model, `r${r}/p${t}/`))).toBeCloseTo(p * scale, 6)
          if (row.q) expect(top(boxesOf(model, `r${r}/q${t}/`))).toBeCloseTo(row.q[t] * scale, 6)
        })
      })
      // The tallest bar stands within the drawing's height, which the axis (the tallest rounded up to eight) sets.
      const tallest = Math.max(...view.rows.flatMap((row) => [...row.p, ...(row.q ?? [])]))
      expect(top(model.boxes.filter((box) => /\/[pq]\d\//.test(box.id)))).toBeCloseTo(tallest * scale, 6)
      expect(tallest * scale).toBeLessThanOrEqual(GEO.height)
    }
  })

  test('the plate holds every bar and label with a margin, and a row\'s name is its own label', () => {
    const view = viewOf('chain', 1)
    const { model } = skylineOf(view, FLAGS)
    const sheet = model.plates.find((plate) => plate.id === 'plate/sheet')
    expect(sheet).toBeDefined()
    for (const box of model.boxes) {
      expect(box.x0).toBeGreaterThanOrEqual((sheet?.x0 ?? 0) - 3)
      expect(box.x1).toBeLessThanOrEqual((sheet?.x1 ?? 0) + 3)
    }
    expect(model.labels.filter((label) => label.kind === 'row').map((label) => label.text)).toEqual(view.rows.map((row) => row.label))
  })
})

describe('the axis: the diagram\'s, and a scale to read it by', () => {
  test('the scene\'s rows share the axis the 2D diagram draws, so a bar is as tall in either view', () => {
    for (const view of [viewOf('overlap', 0), viewOf('chain', 1, ...chainActions), viewOf('chain', 3)]) {
      const { model } = skylineOf(view, FLAGS)
      const first = view.rows[0]
      const token = first.p.indexOf(Math.max(...first.p))
      expect(top(boxesOf(model, `r0/p${token}/`))).toBeCloseTo((first.p[token] / axisOf(view)) * GEO.height, 6)
    }
  })

  test('the value scale stands at the front row\'s right end: a post as tall as the axis, a tick every eight, a number every sixteen', () => {
    for (const seed of [1, 2, 3]) {
      const view = viewOf('chain', seed)
      const { model } = skylineOf(view, FLAGS)
      const axis = axisOf(view)
      const scale = GEO.height / axis
      const post = model.inks.find((ink) => ink.x0 === ink.x1 && ink.z0 === ink.z1)
      expect(post?.y).toBe(0)
      expect(post?.y1).toBeCloseTo(GEO.height, 6)
      // It stands past the last token's bars, on the front row's face.
      const bars = model.boxes.filter((box) => /^r0\/[pq]\d\//.test(box.id))
      expect(post?.x0).toBeGreaterThan(Math.max(...bars.map((box) => box.x1)))
      expect(post?.z0).toBe(Math.max(...bars.map((box) => box.z1)))
      const ticks = model.inks.filter((ink) => ink !== post).map((ink) => ink.y)
      expect(ticks).toEqual(Array.from({ length: axis / SCALE.step + 1 }, (_, i) => i * SCALE.step * scale))
      expect(model.labels.filter((label) => label.kind === 'axis').map((label) => label.text)).toEqual(Array.from({ length: Math.floor(axis / 16) + 1 }, (_, i) => String(i * 16)))
    }
  })
})

describe('the parts keep their colours and forms', () => {
  test('uncut, q is the draft\'s yellow hatched and p the target\'s blue solid', () => {
    const { model } = skylineOf(viewOf('chain', 1), FLAGS)
    const bars = model.boxes.filter((box) => /\/[pq]\d\//.test(box.id))
    expect(bars.length).toBeGreaterThan(0)
    for (const box of bars) {
      const part = box.id.includes('/q') ? PART.draft : PART.target
      expect([box.role, box.form]).toEqual([part.role, part.form])
    }
  })

  test('cut, each bar is the accepted part under its excess: the draft\'s on q, the residual on p, and both bars share the accepted part', () => {
    const view = viewOf('chain', 1, ...chainActions)
    const { model } = skylineOf(view, FLAGS)
    expect(PART.accepted).toEqual({ role: 'probability-overlap', form: 'solid' })
    expect(PART.draft).toEqual({ role: 'probability-draft', form: 'marked' })
    expect(PART.residual).toEqual({ role: 'probability-residual', form: 'groove' })
    expect(PART.target).toEqual({ role: 'probability-target', form: 'solid' })
    const row = view.rows[0]
    const scale = GEO.height / axisOf(view)
    for (let t = 0; t < 6; t++) {
      const agreed = row.agreed?.[t] ?? 0
      const q = row.q?.[t] ?? 0
      const accepted = (id: string) => boxesOf(model, id).find((box) => box.role === PART.accepted.role)
      expect(accepted(`r0/q${t}/`)?.height ?? 0).toBeCloseTo(agreed * scale, 6)
      expect(accepted(`r0/p${t}/`)?.height ?? 0).toBeCloseTo(agreed * scale, 6)
      const excess = boxesOf(model, `r0/q${t}/`).find((box) => box.role === PART.draft.role)
      expect(excess?.height ?? 0).toBeCloseTo((q - agreed) * scale, 6)
      expect(excess ? (excess.y0 ?? 0) : agreed * scale).toBeCloseTo(agreed * scale, 6)
      const residual = boxesOf(model, `r0/p${t}/`).find((box) => box.role === PART.residual.role)
      expect(residual?.height ?? 0).toBeCloseTo((row.p[t] - agreed) * scale, 6)
    }
    // A bar's parts are told apart by their forms as well as their colours (WCAG 1.4.1): no two parts share a colour, and no form is a colour's alone.
    expect(new Set(Object.values(PART).map((part) => part.role)).size).toBe(4)
    expect(new Set(Object.values(PART).map((part) => part.form)).size).toBeGreaterThanOrEqual(3)
  })

  test('a graded run draws the bars uncut, and no output, whatever the view holds', () => {
    const view = viewOf('chain', 1, ...chainActions)
    const { model } = skylineOf(view, { scaffold: false, outcome: false })
    expect(model.boxes.some((box) => box.role === PART.accepted.role)).toBe(false)
    expect(model.boxes.some((box) => box.id.includes('/out'))).toBe(false)
    expect(model.wires).toEqual([])
  })
})

describe('the output: a collar on each target bar, as high as what the sampler put out, and seated on its bar', () => {
  test('after rounds, each collar stands at its token\'s output; before any it is not drawn', () => {
    const drawn = viewOf('chain', 1, ...chainActions)
    const { model } = skylineOf(drawn, FLAGS)
    const scale = GEO.height / axisOf(drawn)
    drawn.rows.forEach((row, r) => {
      const out = row.out
      expect(out).not.toBeNull()
      for (let t = 0; t < 6; t++) {
        const collar = model.boxes.find((box) => box.id === `r${r}/out${t}`)
        if (row.p[t] === 0 && (out?.[t] ?? 0) === 0) {
          expect(collar, `row ${r} token ${t}: no bar and nothing out, no collar`).toBeUndefined()
          continue
        }
        expect(collar?.y0 ?? NaN).toBeCloseTo(Math.max(0, (out?.[t] ?? 0) * scale), 6)
        expect(collar?.form).toBe('solid')
      }
    })
    expect(skylineOf(viewOf('chain', 1, chainActions[0]), FLAGS).model.boxes.some((box) => box.id.includes('/out'))).toBe(false)
  })

  test('a collar over its bar stands on a dashed outline of the bar carried up to it, and the count stands over the collar', () => {
    // Ten rounds put out more than p on some tokens: their collars stand over their bars.
    const view = viewOf('chain', 1, chainActions[0], { t: 'draw', n: 10 })
    const { model } = skylineOf(view, FLAGS)
    const scale = GEO.height / axisOf(view)
    let over = 0
    view.rows.forEach((row, r) => {
      row.p.forEach((p, t) => {
        const out = row.out?.[t] ?? 0
        const wire = model.wires.find((box) => box.id === `r${r}/over${t}`)
        if (out <= p) {
          expect(wire).toBeUndefined()
          return
        }
        over++
        const bar = boxesOf(model, `r${r}/p${t}/`)
        // The outline is the bar's own footprint, from its top to the collar: the collar has a bar inside it all the way up.
        expect(wire?.x0).toBe(bar[0]?.x0 ?? NaN)
        expect(wire?.x1).toBe(bar[0]?.x1 ?? NaN)
        expect(wire?.y0 ?? NaN).toBeCloseTo(p * scale, 6)
        expect((wire?.y0 ?? 0) + (wire?.height ?? 0)).toBeCloseTo(out * scale, 6)
        if (p > 0) expect(model.labels.find((label) => label.id === `p-${r}-${t}`)?.at[1] ?? NaN).toBeCloseTo(out * scale + RING.height, 6)
      })
    })
    expect(over).toBeGreaterThan(0)
  })

  test('the authored move: the view before, with its collars at the foot, is the start of the settling, and the collars rise onto the output', () => {
    const before = viewOf('chain', 1, chainActions[0])
    const after = viewOf('chain', 1, ...chainActions)
    const from = skylineOf(before, FLAGS, true).model
    const model = skylineOf(after, FLAGS).model
    expect(from.boxes.filter((box) => box.id.includes('/out')).every((box) => box.y0 === 0)).toBe(true)
    const collar = (m: FlatModel) => m.boxes.find((box) => box.id === 'r0/out2')?.y0 ?? NaN
    expect(morphModel(from, model, 0)).not.toBe(model)
    expect(collar(morphModel(from, model, 0))).toBeCloseTo(0, 6)
    expect(collar(morphModel(from, model, 0.5))).toBeCloseTo(collar(model) / 2, 6)
    expect(morphModel(from, model, 1)).toBe(model)
    // The bars stand still while the collars move.
    const barsOf = (m: FlatModel) => m.boxes.filter((box) => /\/[pq]\d\//.test(box.id))
    expect(barsOf(morphModel(from, model, 0.5))).toEqual(barsOf(model))
  })

  test('the scene plays it from the view before and draws it at its end under reduced motion', () => {
    const scene = read('src/games/verifier/Scene3D.tsx')
    expect(scene).toContain('from={from}')
    expect(scene).toContain('skylineOf(seen.from, flags, true)')
    expect(read('src/scene/FlatTrack.tsx')).toMatch(/const moving = !!from && !kit\.reducedMotion/)
  })
})

describe('the drawn rounds: a dot on the draft bar at its coin\'s height', () => {
  test('one dot for each marker of the latest rounds, solid where it landed in the accepted part and hollow above it', () => {
    const view = viewOf('overlap', 0, ...committed)
    const { model } = skylineOf(view, FLAGS)
    const scale = GEO.height / axisOf(view)
    const dots = boxesOf(model, 'r0/dot')
    expect(dots).toHaveLength(view.rows[0].markers.length)
    expect(dots.length).toBeGreaterThan(0)
    expect(dots.length).toBeLessThanOrEqual(MARKER_ROUNDS)
    for (const marker of view.rows[0].markers) {
      const dot = model.boxes.find((box) => box.id === `r0/dot${marker.token}/${marker.round}`)
      expect(dot?.form).toBe(marker.kept ? 'solid' : 'hollow')
      expect((dot?.y0 ?? 0) + (dot?.height ?? 0) / 2).toBeCloseTo(marker.height * scale + 0.5, 6)
    }
  })
})

/**
 * The canvases a desk draws the chain's scene in [measured 2026-11-18 in Chromium, from the scene's own canvas]: the game's page at 1440 x 900
 * with the dock's decision and with its draws, TR6 lesson 1's column at 1440 x 900, and the game's page at 1024 x 768 and 800 x 1100.
 */
const CANVASES = [
  { name: 'the game at 1440, drawing', width: 782, height: 362 },
  { name: 'the game at 1440, deciding', width: 782, height: 409 },
  { name: 'TR6 lesson 1 at 1440', width: 644, height: 488 },
  { name: 'the game at 1024', width: 526, height: 318 },
  { name: 'the game at 800 wide', width: 734, height: 423 },
]
const SHOT_IDS = ['run', 'course', 'side'] as const
/** The chain on the practice numbers, as the page shows it before and after rounds. */
const chainViews = () => [viewOf('chain', 1), viewOf('chain', 1, chainActions[0]), viewOf('chain', 1, chainActions[0], { t: 'draw', n: 10 }), viewOf('chain', 1, ...chainActions)]

describe('the words: every one is a label for the DOM layer, and each has its own room', () => {
  test('a token\'s number under its pair, and each bar\'s count over it', () => {
    const view = viewOf('chain', 1, ...chainActions)
    const { model } = skylineOf(view, FLAGS)
    expect(model.labels.filter((label) => label.kind === 'tick').map((label) => label.text)).toEqual(['0', '1', '2', '3', '4', '5'])
    const counts = model.labels.filter((label) => label.kind === 'slab')
    expect(counts.map((label) => label.text).sort()).toEqual(view.rows.flatMap((row) => [...row.p, ...(row.q ?? [])]).filter((n) => n > 0).map(String).sort())
  })

  test('each shot shows the labels it has room for: every one over the run, the front row\'s counts and no names from the side', () => {
    const { model } = skylineOf(viewOf('chain', 1, ...chainActions), FLAGS)
    expect(labelsFor(model, 'run')).toBe(model.labels)
    for (const shot of ['course', 'side']) {
      const shown = labelsFor(model, shot)
      expect(shown.some((label) => label.kind === 'row')).toBe(false)
      expect(shown.filter((label) => label.kind === 'tick')).toHaveLength(6)
      for (const label of shown.filter((l) => l.kind === 'slab')) expect(label.id).toMatch(/^[qp]-0-/)
    }
  })

  /** The boxes of a shot's labels as its camera draws them in a canvas. */
  function placed(view: VerifierView, shotId: string, canvas: { width: number; height: number }) {
    const { model } = skylineOf(view, FLAGS)
    const shot = presetsOf(model.bounds, TASTING_SHOTS, canvas).find((preset) => preset.id === shotId)
    if (!shot) throw new Error(shotId)
    const project = projectorOf(shot, canvas)
    const kept = labelsFor(model, shotId, project, canvas)
    const boxes = kept.map((label) => {
      const at = project(label.at[0], label.at[1], label.at[2])
      if (at === null) throw new Error(`${label.id} is behind the camera`)
      return { id: label.id, ...labelBox(label, at) }
    })
    return { model, kept, boxes, shown: labelsFor(model, shotId) }
  }

  test('on the practice numbers, at 1440 in the game and the lesson, every label a shot shows has its room: none is left out', () => {
    // Every count over the run and in one draft position, and every count of the front row from the side.
    for (const canvas of CANVASES.slice(0, 3))
      for (const view of chainViews())
        for (const id of SHOT_IDS) {
          const { kept, shown } = placed(view, id, canvas)
          const left = shown.filter((label) => !kept.includes(label))
          // From the side the scale's numbers stand among the rows behind, and one may give way to a bar: the scale keeps its foot and one more.
          if (id === 'side') {
            expect(left.filter((label) => label.kind !== 'axis').map((label) => label.id), `${canvas.name}, ${id}`).toEqual([])
            expect(kept.filter((label) => label.kind === 'axis').length, `${canvas.name}, ${id}: the scale's numbers`).toBeGreaterThanOrEqual(2)
          } else expect(left.map((label) => label.id), `${canvas.name}, ${id}`).toEqual([])
        }
  })

  test('on any numbers, no label prints over another or across the canvas\'s edge, in any shot', () => {
    for (const seed of Array.from({ length: 24 }, (_, i) => i))
      for (const canvas of CANVASES)
        for (const id of SHOT_IDS) {
          const view = viewOf('chain', seed, { t: 'commit', prediction: thousandths(tokensOf(buildLevel('chain', seed))) }, { t: 'draw', n: 100 })
          const { boxes } = placed(view, id, canvas)
          for (const box of boxes) {
            expect(box.x0, `${seed} ${canvas.name} ${id} ${box.id}`).toBeGreaterThanOrEqual(0)
            expect(box.y0, `${seed} ${canvas.name} ${id} ${box.id}`).toBeGreaterThanOrEqual(0)
            expect(box.x1, `${seed} ${canvas.name} ${id} ${box.id}`).toBeLessThanOrEqual(canvas.width)
            expect(box.y1, `${seed} ${canvas.name} ${id} ${box.id}`).toBeLessThanOrEqual(canvas.height)
          }
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const [a, b] = [boxes[i], boxes[j]]
              const meet = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
              expect(meet, `${seed} ${canvas.name} ${id}: ${a.id} and ${b.id}`).toBe(false)
            }
        }
  })
})

describe('the shots: three, in the page\'s order and words, each holding the drawing and filling its box', () => {
  test('ids, words and the default', () => {
    expect(TASTING_SHOTS.map((shot) => [shot.id, shot.label])).toEqual([
      ['run', 'Over the run'],
      ['course', 'One draft position'],
      ['side', 'From the side'],
    ])
    expect(DEFAULT_PRESET).toBe('run')
  })

  /** Where a point stands in the picture, in canvas pixels, through the shot's own camera, as three draws it. */
  function project(shot: ReturnType<typeof presetsOf>[number], canvas: { width: number; height: number }, point: readonly [number, number, number]) {
    const framing = framingFor(shot, canvas.width)
    const camera = new PerspectiveCamera(framing.fov, canvas.width / canvas.height, 0.05, 200)
    camera.position.set(...framing.position)
    camera.lookAt(new Vector3(...framing.target))
    camera.updateMatrixWorld()
    const ndc = new Vector3(...point).project(camera)
    return { x: ((ndc.x + 1) / 2) * canvas.width, y: ((1 - ndc.y) / 2) * canvas.height }
  }

  test('the plan\'s own projection is the one three draws, so the labels\' room is reckoned where they stand', () => {
    const { model } = skylineOf(viewOf('chain', 1), FLAGS)
    for (const canvas of CANVASES)
      for (const shot of presetsOf(model.bounds, TASTING_SHOTS, canvas)) {
        const mine = projectorOf(shot, canvas)
        for (const label of model.labels) {
          const a = mine(label.at[0], label.at[1], label.at[2])
          const b = project(shot, canvas, [label.at[0] / PX, label.at[1] / PX, label.at[2] / PX])
          expect(a?.x ?? NaN).toBeCloseTo(b.x, 3)
          expect(a?.y ?? NaN).toBeCloseTo(b.y, 3)
        }
      }
  })

  for (const canvas of CANVASES) {
    test(`over the run and from the side the whole plate stands inside the box and fills most of it, at ${canvas.name}`, () => {
      for (const view of [viewOf('chain', 1, ...chainActions), viewOf('chain', 0), viewOf('chain', 3)]) {
        const { model } = skylineOf(view, FLAGS)
        const presets = presetsOf(model.bounds, TASTING_SHOTS, canvas)
        const { x0, x1, z0, z1 } = model.bounds
        for (const id of ['run', 'side']) {
          const shot = presets.find((preset) => preset.id === id)
          if (!shot) throw new Error(id)
          const points = [x0, x1].flatMap((x) => [z0, z1].flatMap((z) => [0, GEO.height].map((y) => project(shot, canvas, [x / PX, y / PX, z / PX]))))
          for (const at of points) {
            expect(at.x, `${view.rows.length} rows ${id} x`).toBeGreaterThanOrEqual(-1)
            expect(at.x, `${view.rows.length} rows ${id} x`).toBeLessThanOrEqual(canvas.width + 1)
            expect(at.y, `${view.rows.length} rows ${id} y`).toBeGreaterThanOrEqual(-1)
            expect(at.y, `${view.rows.length} rows ${id} y`).toBeLessThanOrEqual(canvas.height + 1)
          }
          // The box is filled: the drawing spans at least seven tenths of it one way and nine tenths the other [estimated].
          const wide = (Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x))) / canvas.width
          const tall = (Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y))) / canvas.height
          expect(Math.min(wide, tall), `${view.rows.length} rows ${id}: ${wide.toFixed(2)} x ${tall.toFixed(2)}`).toBeGreaterThanOrEqual(0.7)
          expect(Math.max(wide, tall), `${view.rows.length} rows ${id}: ${wide.toFixed(2)} x ${tall.toFixed(2)}`).toBeGreaterThanOrEqual(0.88)
        }
      }
    })

    test(`one draft position holds the front row's bars and the tokens' numbers, standing on the box's foot, at ${canvas.name}`, () => {
      const view = viewOf('chain', 1, ...chainActions)
      const { model } = skylineOf(view, FLAGS)
      const shot = presetsOf(model.bounds, TASTING_SHOTS, canvas).find((preset) => preset.id === 'course')
      if (!shot) throw new Error('course')
      const front = model.boxes.filter((box) => /^r0\/[pq]\d\//.test(box.id))
      expect(front.length).toBeGreaterThan(0)
      for (const box of front)
        for (const x of [box.x0, box.x1]) {
          const at = project(shot, canvas, [x / PX, ((box.y0 ?? 0) + box.height) / PX, box.z1 / PX])
          expect(at.x).toBeGreaterThanOrEqual(-1)
          expect(at.x).toBeLessThanOrEqual(canvas.width + 1)
          expect(at.y).toBeGreaterThanOrEqual(-1)
          expect(at.y).toBeLessThanOrEqual(canvas.height + 1)
        }
      const foot = project(shot, canvas, [(model.bounds.x0 + model.bounds.x1) / 2 / PX, 0, model.bounds.z1 / PX])
      expect(foot.y).toBeGreaterThan(canvas.height * 0.9)
      for (const label of model.labels.filter((l) => l.kind === 'tick')) {
        const at = project(shot, canvas, [label.at[0] / PX, label.at[1] / PX, label.at[2] / PX])
        expect(at.y, `token ${label.text}'s number`).toBeLessThanOrEqual(canvas.height - 8)
      }
    })
  }

  test('over the run, the rows stand clear of one another: no count of the front row reaches a bar of the row behind it, on the practice numbers', () => {
    const view = viewOf('chain', 1, ...chainActions)
    const { model } = skylineOf(view, FLAGS)
    const canvas = CANVASES[0]
    const shot = presetsOf(model.bounds, TASTING_SHOTS, canvas)[0]
    const near = project(shot, canvas, [0, 0, model.bounds.z1 / PX])
    const far = project(shot, canvas, [0, GEO.height / PX, model.bounds.z1 / PX])
    // A bar of full height reads at least 70 px tall in the front row [estimated: two lines of the readout].
    expect(near.y - far.y).toBeGreaterThanOrEqual(70)
  })
})

describe('the scene: the kit\'s flat track, and nothing from the kitchen', () => {
  /** Every module of the repository that a file reaches, through relative and `@/` imports. */
  function closure(entry: string): string[] {
    const seen = new Set<string>()
    const walk = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      // A type-only import leaves nothing in the chunk.
      const source = read(file).replace(/^import type [^;]*?from\s+['"][^'"]+['"]/gm, '')
      for (const match of source.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
        const spec = match[1]
        const base = spec.startsWith('@/') ? path.join('src', spec.slice(2)) : spec.startsWith('.') ? path.join(path.dirname(file), spec) : null
        if (base === null) continue
        const found = ['.ts', '.tsx', '/index.ts', '/index.tsx', ''].map((ext) => base + ext).find((candidate) => existsSync(path.join(root, candidate)) && /\.(ts|tsx)$/.test(candidate))
        if (found) walk(found)
      }
    }
    walk(entry)
    return [...seen]
  }

  test('the scene\'s closure holds no file of src/scene/props, and no kitchen lamp or pool', () => {
    const files = closure('src/games/verifier/Scene3D.tsx')
    expect(files).toContain('src/scene/FlatTrack.tsx')
    expect(files.filter((file) => file.startsWith('src/scene/props/'))).toEqual([])
    for (const kitchen of ['spot-lamps', 'spot-pools', 'scene-props', 'Kitchen'])
      expect(files.filter((file) => file.includes(kitchen)), kitchen).toEqual([])
    expect(existsSync(path.join(root, 'src/games/verifier/scene-props.ts'))).toBe(false)
  })

  test('the scene asks for no environment map, fog or bloom, and draws every word as a label', () => {
    const scene = read('src/games/verifier/Scene3D.tsx')
    expect(scene).toContain('fog={null}')
    // The kit has no environment map and no bloom to ask for (R-T44): the canvas takes neither prop, and the scene passes neither.
    expect(scene).not.toMatch(/environment=|bloom=/)
    expect(scene).toContain('labels={labels}')
  })

  test('the scene reaches nothing of the page\'s chunk: the layout imports no file of the game but the plan and the shots\' types', () => {
    const files = closure('src/games/verifier/Scene3D.tsx').filter((file) => file.startsWith('src/games/verifier/'))
    expect(files.sort()).toEqual(['src/games/verifier/Scene3D.tsx', 'src/games/verifier/scene-layout.ts', 'src/games/verifier/scene-plan.ts'])
  })

  test('the layout is pure: it imports no three', () => {
    for (const file of ['scene-layout.ts', 'scene-plan.ts', 'scene-shots.ts']) expect(read(`src/games/verifier/${file}`)).not.toMatch(/from 'three/)
  })

  test('every level\'s skyline builds, in practice and graded flags, with no id twice', () => {
    for (const [id, seed] of [['overlap', 0], ['exact', 0], ['chain', 1], ['chain', 2], ['greedy-ngram', 0], ['mutants', 0]] as const) {
      const view = viewOf(id, seed)
      for (const flags of [FLAGS, { scaffold: false, outcome: false }]) {
        const { model } = skylineOf(view, flags)
        expect(model.boxes.length).toBeGreaterThan(0)
        expect(new Set(model.boxes.map((box) => box.id)).size).toBe(model.boxes.length)
      }
    }
  })
})
