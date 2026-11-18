/*
 * The rejection sampler's 3D skylines (R-T42: src/games/verifier/scene-plan.ts and scene-layout.ts), which the scene draws with the kit's
 * flat track (src/scene/FlatTrack.tsx) and which decides nothing the session did not. The layout is held to the view: one row of bars for
 * each draft position, two bars for each token as tall as their counts, the parts in their colours and forms, the output's ring at the
 * output's height, and the drawn rounds' dots. The plan is held to its shots (each puts the whole drawing in the frame at the page's two
 * widths), and the scene to its contract: nothing from src/scene/props, one authored move, every word a label for the DOM layer.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PerspectiveCamera, Vector3 } from 'three'
import { buildLevel } from '@es/play/verifier/levels'
import { verifierSession } from '@es/play/verifier/session'
import { excessPlates, keptPlates, sweepOfLevel, thousandths, tokensOf } from '@es/play/verifier/state'
import type { VerifierView } from '@es/play/verifier/types'
import { MARKER_ROUNDS } from '@es/play/verifier/view'
import { axisOf } from '@/games/verifier/axis'
import { labelsFor, PART, ROOMY, skylineOf, type SceneFlags } from '@/games/verifier/scene-layout'
import { GAMMA, GEO, GEO_ONE, geoOf, presetsOf } from '@/games/verifier/scene-plan'
import { DEFAULT_PRESET, TASTING_SHOTS } from '@/games/verifier/scene-shots'
import { framingFor } from '@/scene/camera-rig'
import { morphModel, PX, type FlatBox, type FlatModel } from '@/scene/flat-track'
import { runOf, sculptActions } from './verifier-support'

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
  test('a draft position alone is one row of six tokens, a run has a row for each position and the bonus token', () => {
    const one = skylineOf(viewOf('overlap', 0), FLAGS)
    expect(one.rows).toBe(1)
    expect(one.geo).toBe(GEO_ONE)
    const many = viewOf('chain', 1)
    expect(many.rows.length).toBeGreaterThan(2)
    const run = skylineOf(many, FLAGS)
    expect(run.rows).toBe(many.rows.length)
    expect(run.geo).toBe(GEO)
    // A row's bars all stand on one band of depth, and the first row stands nearer the viewer than the next.
    const zs = many.rows.map((_, r) => boxesOf(run.model, `r${r}/p`).map((box) => box.z0))
    for (const row of zs) expect(new Set(row).size).toBe(1)
    for (let r = 1; r < zs.length; r++) expect(zs[r][0]).toBeLessThan(zs[r - 1][0])
    // Six tokens, two bars each (a token with none of a model's plates has no bar of it), except the bonus row, where the target stands alone.
    many.rows.forEach((row, r) => {
      for (let t = 0; t < 6; t++) {
        expect(boxesOf(run.model, `r${r}/p${t}/`).length > 0).toBe(row.p[t] > 0)
        expect(boxesOf(run.model, `r${r}/q${t}/`).length > 0).toBe(row.q !== null && row.q[t] > 0)
      }
    })
  })

  test('each bar is as tall as its count out of the axis the rows share, whatever it is cut into', () => {
    for (const view of [viewOf('overlap', 0, ...committed), viewOf('chain', 1, ...chainActions)]) {
      const { model, geo } = skylineOf(view, FLAGS)
      const scale = geo.height / axisOf(view)
      view.rows.forEach((row, r) => {
        row.p.forEach((p, t) => {
          expect(top(boxesOf(model, `r${r}/p${t}/`))).toBeCloseTo(p * scale, 6)
          if (row.q) expect(top(boxesOf(model, `r${r}/q${t}/`))).toBeCloseTo(row.q[t] * scale, 6)
        })
      })
      // The tallest bar stands within the drawing's height, which the axis (the tallest rounded up to eight) sets.
      const tallest = Math.max(...view.rows.flatMap((row) => [...row.p, ...(row.q ?? [])]))
      expect(top(model.boxes.filter((box) => /\/[pq]\d\//.test(box.id)))).toBeCloseTo(tallest * scale, 6)
      expect(tallest * scale).toBeLessThanOrEqual(geo.height)
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

describe('the axis: the diagram\'s', () => {
  test('the scene\'s rows share the axis the 2D diagram draws, so a bar is as tall in either view', () => {
    for (const view of [viewOf('overlap', 0), viewOf('chain', 1, ...chainActions), viewOf('exact', 0)]) {
      const { model, geo } = skylineOf(view, FLAGS)
      const first = view.rows[0]
      const token = first.p.indexOf(Math.max(...first.p))
      expect(top(boxesOf(model, `r0/p${token}/`))).toBeCloseTo((first.p[token] / axisOf(view)) * geo.height, 6)
    }
  })
})

describe('the parts keep their colours and forms', () => {
  test('uncut, q is the draft\'s yellow hatched and p the target\'s blue solid', () => {
    const { model } = skylineOf(viewOf('overlap', 0), FLAGS)
    const bars = model.boxes.filter((box) => /\/[pq]\d\//.test(box.id))
    expect(bars.length).toBeGreaterThan(0)
    for (const box of bars) {
      const part = box.id.includes('/q') ? PART.draft : PART.target
      expect([box.role, box.form]).toEqual([part.role, part.form])
    }
  })

  test('cut, each bar is the accepted part under its excess: the draft\'s on q, the residual on p, and both bars share the accepted part', () => {
    const view = viewOf('overlap', 0, ...committed)
    const { model } = skylineOf(view, FLAGS)
    expect(PART.accepted).toEqual({ role: 'probability-overlap', form: 'solid' })
    expect(PART.draft).toEqual({ role: 'probability-draft', form: 'marked' })
    expect(PART.residual).toEqual({ role: 'probability-residual', form: 'groove' })
    expect(PART.target).toEqual({ role: 'probability-target', form: 'solid' })
    const row = view.rows[0]
    const scale = GEO_ONE.height / axisOf(view)
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
      // A bar's parts are told apart by their forms as well as their colours (WCAG 1.4.1): no two parts share a colour, and no form is a colour's alone.
    }
    expect(new Set(Object.values(PART).map((part) => part.role)).size).toBe(4)
    expect(new Set(Object.values(PART).map((part) => part.form)).size).toBeGreaterThanOrEqual(3)
  })

  test('a graded run draws the bars uncut, and no output, whatever the view holds', () => {
    const view = viewOf('overlap', 0, ...committed)
    const { model } = skylineOf(view, { scaffold: false, outcome: false })
    expect(model.boxes.some((box) => box.role === PART.accepted.role)).toBe(false)
    expect(model.boxes.some((box) => box.id.includes('/out'))).toBe(false)
  })
})

describe('the output: a ring on each target bar, as high as what the sampler put out', () => {
  test('after rounds, each ring stands at its token\'s output; before any it is not drawn', () => {
    const drawn = viewOf('overlap', 0, ...committed)
    const { model, geo } = skylineOf(drawn, FLAGS)
    const scale = geo.height / axisOf(drawn)
    const out = drawn.rows[0].out
    expect(out).not.toBeNull()
    for (let t = 0; t < 6; t++) {
      const ring = model.boxes.find((box) => box.id === `r0/out${t}`)
      expect(ring?.y0 ?? NaN).toBeCloseTo(Math.max(0, (out?.[t] ?? 0) * scale), 6)
      expect(ring?.form).toBe('hollow')
    }
    expect(skylineOf(viewOf('overlap', 0, { t: 'commit', prediction: keptPlates(level) }), FLAGS).model.boxes.some((box) => box.id.includes('/out'))).toBe(false)
  })

  test('an exact recipe puts the output exactly onto p, token by token; a wrong one leaves some rings off it', () => {
    const exact = buildLevel('exact', 0)
    const right = viewOf('exact', 0, ...sculptActions(excessPlates(exact)))
    const scale = (view: VerifierView) => GEO_ONE.height / axisOf(view)
    const ringsOf = (view: VerifierView) => Array.from({ length: 6 }, (_, t) => skylineOf(view, FLAGS).model.boxes.find((box) => box.id === `r0/out${t}`)?.y0 ?? NaN)
    ringsOf(right).forEach((y, t) => expect(y).toBeCloseTo(exact.p[0][t] * scale(right), 6))
    const wrong = viewOf('exact', 0, ...sculptActions(exact.p[0]))
    expect(ringsOf(wrong).some((y, t) => Math.abs(y - exact.p[0][t] * scale(wrong)) > 1e-6)).toBe(true)
  })

  test('the authored move: the view before, with its rings at the foot, is the start of the settling, and the rings rise onto the output', () => {
    const before = viewOf('overlap', 0, { t: 'commit', prediction: keptPlates(level) })
    const after = viewOf('overlap', 0, ...committed)
    const from = skylineOf(before, FLAGS, true).model
    const model = skylineOf(after, FLAGS).model
    expect(from.boxes.filter((box) => box.id.includes('/out')).map((box) => box.y0)).toEqual([0, 0, 0, 0, 0, 0])
    const ring = (m: FlatModel) => m.boxes.find((box) => box.id === 'r0/out2')?.y0 ?? NaN
    expect(morphModel(from, model, 0)).not.toBe(model)
    expect(ring(morphModel(from, model, 0))).toBeCloseTo(0, 6)
    expect(ring(morphModel(from, model, 0.5))).toBeCloseTo(ring(model) / 2, 6)
    expect(morphModel(from, model, 1)).toBe(model)
    // The bars stand still while the rings move.
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
    const { model, geo } = skylineOf(view, FLAGS)
    const scale = geo.height / axisOf(view)
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

describe('`gamma`: a bar for each position, cut at the share the target accepts', () => {
  test('eight positions in one row; each bar is the accepted share in green under the draft\'s yellow; those past the pick stand as outlines', () => {
    const lv = buildLevel('gamma', 0)
    if (lv.id !== 'gamma') throw new Error('gamma')
    const view = viewOf('gamma', 0, { t: 'gamma', k: 3 })
    const { model, rows, geo } = skylineOf(view, FLAGS)
    expect(rows).toBe(1)
    expect(geo).toBe(GEO_ONE)
    for (let at = 0; at < 8; at++) {
      const parts = boxesOf(model, `g${at}/`).filter((box) => !box.id.endsWith('/reach'))
      const accepted = parts.find((box) => box.role === PART.accepted.role)
      expect(accepted?.height).toBeCloseTo((lv.alphas[at] / 1000) * geo.height, 6)
      expect(top(parts)).toBeCloseTo(geo.height, 6)
      for (const part of parts) expect(part.form === 'hollow').toBe(at >= 3)
    }
    // The reach is the product of the acceptances up to each position.
    const reach = lv.alphas.slice(0, 8).reduce<number[]>((all, alpha) => [...all, ((all.at(-1) ?? 1) * alpha) / 1000], [])
    reach.forEach((share, at) => expect(model.boxes.find((box) => box.id === `g${at}/reach`)?.y0).toBeCloseTo(share * geo.height, 6))
    expect(model.bounds.x1).toBe(8 * GAMMA.col)
  })
})

describe('the words: every one is a label for the DOM layer', () => {
  test('a token\'s number under its pair, and each bar\'s count over it', () => {
    const view = viewOf('overlap', 0, ...committed)
    const { model } = skylineOf(view, FLAGS)
    expect(model.labels.filter((label) => label.kind === 'tick').map((label) => label.text)).toEqual(['0', '1', '2', '3', '4', '5'])
    const counts = model.labels.filter((label) => label.kind === 'slab')
    expect(counts.map((label) => label.text).sort()).toEqual([...view.rows[0].p, ...(view.rows[0].q ?? [])].filter((n) => n > 0).map(String).sort())
    // A single draft position keeps its counts at every width; the counts of several rows wait for room.
    expect(counts.every((label) => label.minWidth === undefined)).toBe(true)
    const run = skylineOf(viewOf('chain', 1, ...chainActions), FLAGS).model
    expect(run.labels.filter((label) => label.kind === 'slab').every((label) => label.minWidth === ROOMY)).toBe(true)
  })

  test('on a phone a row\'s name is its number, the bonus token a plus; the label column narrows with it', () => {
    const view = viewOf('chain', 1)
    const { model, geo } = skylineOf(view, { ...FLAGS, narrow: true })
    expect(model.labels.filter((label) => label.kind === 'row').map((label) => label.text)).toEqual(view.rows.map((row, r) => (row.kind === 'bonus' ? '+' : String(r + 1))))
    expect(geo.names).toBeLessThan(GEO.names)
    expect(geoOf(view.rows.length, true)).toBe(geo)
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
})

describe('the shots: three, in the page\'s order and words, each holding the whole drawing at the page\'s two widths', () => {
  test('ids, words and the default', () => {
    expect(TASTING_SHOTS.map((shot) => [shot.id, shot.label])).toEqual([
      ['run', 'Over the run'],
      ['course', 'One draft position'],
      ['side', 'From the side'],
    ])
    expect(DEFAULT_PRESET).toBe('run')
  })

  /** Where a point stands in the picture, in canvas pixels, through the shot's own camera. */
  function project(shot: ReturnType<typeof presetsOf>[number], canvas: { width: number; height: number }, point: readonly [number, number, number]) {
    const framing = framingFor(shot, canvas.width)
    const camera = new PerspectiveCamera(framing.fov, canvas.width / canvas.height, 0.05, 200)
    camera.position.set(...framing.position)
    camera.lookAt(new Vector3(...framing.target))
    camera.updateMatrixWorld()
    const ndc = new Vector3(...point).project(camera)
    return { x: ((ndc.x + 1) / 2) * canvas.width, y: ((1 - ndc.y) / 2) * canvas.height }
  }

  const CANVASES = [
    { name: '1440', width: 782, height: 392 },
    { name: '390', width: 356, height: 251 },
    { name: 'a lesson at 390', width: 358, height: 437 },
  ]
  const views = [viewOf('overlap', 0, ...committed), viewOf('chain', 1, ...chainActions), viewOf('gamma', 0, { t: 'gamma', k: 3 })]

  for (const canvas of CANVASES) {
    test(`over the run and from the side the whole plate stands inside the box, at ${canvas.name}`, () => {
      for (const view of views) {
        const narrow = canvas.width < ROOMY
        const { model, rows, geo } = skylineOf(view, { ...FLAGS, narrow })
        const presets = presetsOf(model.bounds, rows, TASTING_SHOTS, canvas, geo)
        const { x0, x1, z0, z1 } = model.bounds
        for (const id of ['run', 'side']) {
          const shot = presets.find((preset) => preset.id === id)
          if (!shot) throw new Error(id)
          for (const x of [x0, x1])
            for (const z of [z0, z1])
              for (const y of [0, geo.height]) {
                const at = project(shot, canvas, [x / PX, y / PX, z / PX])
                expect(at.x, `${view.level} ${id} x`).toBeGreaterThanOrEqual(-1)
                expect(at.x, `${view.level} ${id} x`).toBeLessThanOrEqual(canvas.width + 1)
                expect(at.y, `${view.level} ${id} y`).toBeGreaterThanOrEqual(-1)
                expect(at.y, `${view.level} ${id} y`).toBeLessThanOrEqual(canvas.height + 1)
              }
        }
      }
    })

    test(`one draft position holds the front row's bars and the tokens' numbers under them, at ${canvas.name}`, () => {
      for (const view of views) {
        const { model, rows, geo } = skylineOf(view, { ...FLAGS, narrow: canvas.width < ROOMY })
        const shot = presetsOf(model.bounds, rows, TASTING_SHOTS, canvas, geo).find((preset) => preset.id === 'course')
        if (!shot) throw new Error('course')
        const front = model.boxes.filter((box) => box.z1 >= model.bounds.z1 - geo.tags - 1)
        expect(front.length).toBeGreaterThan(0)
        for (const box of front)
          for (const x of [box.x0, box.x1]) {
            const at = project(shot, canvas, [x / PX, ((box.y0 ?? 0) + box.height) / PX, box.z1 / PX])
            expect(at.x).toBeGreaterThanOrEqual(-1)
            expect(at.x).toBeLessThanOrEqual(canvas.width + 1)
            expect(at.y).toBeGreaterThanOrEqual(-1)
            expect(at.y).toBeLessThanOrEqual(canvas.height + 1)
          }
        for (const label of model.labels.filter((l) => l.kind === 'tick')) {
          const at = project(shot, canvas, [label.at[0] / PX, label.at[1] / PX, label.at[2] / PX])
          expect(at.y, `token ${label.text}'s number`).toBeLessThanOrEqual(canvas.height - 8)
        }
      }
    })
  }

  test('a canvas taller than wide looks down more steeply than one wider than tall', () => {
    const view = viewOf('chain', 1)
    const { model, rows, geo } = skylineOf(view, FLAGS)
    const pitch = (canvas: { width: number; height: number }) => {
      const run = presetsOf(model.bounds, rows, TASTING_SHOTS, canvas, geo)[0]
      const [px, py, pz] = run.position
      const [tx, ty, tz] = run.target
      return Math.atan2(py - ty, Math.hypot(px - tx, pz - tz))
    }
    expect(pitch({ width: 358, height: 437 })).toBeGreaterThan(pitch({ width: 782, height: 392 }))
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

  test('a sweep of the sampler\'s sweep: every level\'s skyline builds, in practice and graded flags', () => {
    for (const [id, seed] of [['overlap', 0], ['exact', 0], ['chain', 1], ['greedy-ngram', 0], ['mutants', 0], ['gamma', 0]] as const) {
      const lv = buildLevel(id, seed)
      const view = viewOf(id, seed, ...(lv.id === 'gamma' ? [{ t: 'gamma' as const, k: sweepOfLevel(lv).best }] : []))
      for (const flags of [FLAGS, { scaffold: false, outcome: false }, { ...FLAGS, narrow: true }]) {
        const { model } = skylineOf(view, flags)
        expect(model.boxes.length).toBeGreaterThan(0)
        expect(new Set(model.boxes.map((box) => box.id)).size).toBe(model.boxes.length)
      }
    }
  })
})
