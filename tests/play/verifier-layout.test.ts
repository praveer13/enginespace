/*
 * W1-T28: the 2D view is a first-class rendering of the same kitchen, never a chart (GAMES.md §10 "2D path", §2.6 "The Tasting"; W0's finish
 * review rejected a 2D view made of grey lane bars, a tick axis and a swatch legend). These tests hold the drawing to that:
 *   - it paints with token roles and nothing else, and amber only as the lamp's pool, over the row being tasted;
 *   - it draws the plates the mirror lists, a mark for each plate, so that a stack is a count, and each one as a plate: seen edge on, with
 *     rounded ends, the glaze of its rim and a gap under it, the stack in its contact shadow on the pass and the chef's in her wire
 *     dispenser, its foot in the target blue (W1's finish review, round 1: a stack drawn as one solid bar is a bar chart);
 *   - it has no axis and no legend of its own: the text it writes is a dish's plates on a paper tag, and names on masking tape;
 *   - it stays in its frame and under the cap of 2,000 marks (A§6.4), in both orientations, with the decomposition on and off;
 *   - the SVG is what the page paints: the React view writes the markup that `frameSvg` writes.
 *
 * Measured by the cap test [measured 2026-11-05 on the branch of W1's finish fixes for The Tasting, round 1, over wave-1 at 905b782]: at
 * most 1,199 marks (a run of three drafts and the chef's extra course, landscape, decomposition on, with every plate's rim, the
 * dispensers and the stacks' shadows) in 156 frames of the six levels, in both orientations, with and without the decomposition and in
 * every state of the house's runs, against the cap of 2,000. W1-T28's flat stacks drew at most 637.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ROLES } from '@/design/tokens'
import { View2D } from '@/games/verifier/View2D'
import { MARK_CAP, PAINTS, frameSvg, layoutFrame, layoutGamma, markCount } from '@es/play/verifier/layout'
import type { Frame, Mark, Orientation } from '@es/play/verifier/layout'
import { svgMarkup } from '@es/play/loop/svg'
import { buildLevel } from '@es/play/verifier/levels'
import { verifierInit, verifierReduce, verifierSession } from '@es/play/verifier/session'
import { PLATES } from '@es/play/verifier/types'
import type { VerifierAction, VerifierState, VerifierView } from '@es/play/verifier/types'
import { PRACTICE, fakeRun, houseActions, sculptActions, stateAfter } from './verifier-support'
import { excessPlates } from '@es/play/verifier/state'

const ORIENTATIONS: readonly Orientation[] = ['landscape', 'portrait']
const viewOf = (state: VerifierState): VerifierView => verifierSession.view(state)

/** Every state a level's house run passes through, with some rounds drawn where the level allows. */
function* statesOf(id: (typeof PRACTICE)[number][0], seed: number): Generator<VerifierState> {
  const level = buildLevel(id, seed)
  let state = verifierInit(level)
  yield state
  for (const action of houseActions(level)) {
    state = verifierReduce(state, action)
    yield state
    if (action.t === 'commit' || action.t === 'sculpt' || action.t === 'judge') {
      const draw: VerifierAction = { t: 'draw', n: 40 }
      try {
        yield verifierReduce(state, draw)
      } catch {
        // No rounds can be drawn here.
      }
    }
  }
}

const frameOf = (view: VerifierView, orientation: Orientation, scaffold = true, outcome = true): Frame =>
  view.level === 'gamma' ? layoutGamma(view, { orientation }) : layoutFrame(view, { orientation, scaffold, outcome })

const marksOf = (frame: Frame, part?: string): Mark[] => frame.layers.filter((layer) => part === undefined || layer.part === part).flatMap((layer) => [...layer.marks])
const paintsOf = (mark: Mark): string[] => {
  switch (mark.kind) {
    case 'rect':
    case 'circle':
    case 'line':
      return [mark.fill, mark.stroke].filter((paint): paint is NonNullable<typeof paint> => paint !== undefined)
    case 'text':
      return [mark.fill]
  }
}

describe('the drawing paints with the design system\'s roles', () => {
  test('every role it names is a role of src/design/tokens.ts (the hatching is the draft yellow and its edge, built from two of them)', () => {
    const real = new Set(Object.keys(ROLES))
    for (const paint of PAINTS) expect([paint, real.has(paint)]).toEqual([paint, true])
    expect(real.has('probability-draft') && real.has('cat-yellow-edge')).toBe(true)
  })

  test('every mark of every frame uses a role of the list, or none, or the hatching, and no literal colour', () => {
    const allowed = new Set<string>([...PAINTS, 'none', 'hatch-draft'])
    for (const [id, seed] of PRACTICE) {
      for (const state of statesOf(id, seed)) {
        for (const orientation of ORIENTATIONS) {
          for (const mark of marksOf(frameOf(viewOf(state), orientation))) for (const paint of paintsOf(mark)) expect([id, paint, allowed.has(paint)]).toEqual([id, paint, true])
        }
      }
    }
  })

  test('amber is the lamp\'s pool and nothing else: a soft rectangle in its own layer, over the rows being tasted, and gone when the run is over', () => {
    for (const [id, seed] of PRACTICE) {
      const states = [...statesOf(id, seed)]
      for (const state of states) {
        for (const orientation of ORIENTATIONS) {
          const frame = frameOf(viewOf(state), orientation)
          for (const layer of frame.layers) {
            for (const mark of layer.marks) {
              const amber = paintsOf(mark).includes('lamp')
              if (layer.part === 'lamp') expect([mark.kind, mark.kind === 'rect' && mark.soft === true]).toEqual(['rect', true])
              else expect([id, layer.part, amber]).toEqual([id, layer.part, false])
            }
          }
        }
      }
      const finished = frameOf(viewOf(states[states.length - 1]), 'landscape')
      expect(marksOf(finished, 'lamp')).toEqual([])
    }
    const level = buildLevel('exact', 0)
    expect(marksOf(frameOf(viewOf(verifierInit(level)), 'landscape'), 'lamp')).toHaveLength(1)
  })
})

describe('it draws the plates the mirror lists', () => {
  const rectsWith = (frame: Frame, fill: string) => marksOf(frame, 'stacks').filter((mark) => mark.kind === 'rect' && mark.fill === fill)

  test('with the decomposition on, a mark for each plate: the agreed plates on both stacks, the commis\'s extra hatched, the chef\'s extra red', () => {
    for (const seed of [0, 1, 2, 3]) {
      const view = viewOf(stateAfter(buildLevel('exact', seed), { t: 'preset', from: 'p' }))
      const row = view.rows[0]
      const agreed = row.p.reduce((sum, p, x) => sum + Math.min(p, row.q?.[x] ?? 0), 0)
      const over = row.p.reduce((sum, p, x) => sum + Math.max(0, (row.q?.[x] ?? 0) - p), 0)
      const under = row.p.reduce((sum, p, x) => sum + Math.max(0, p - (row.q?.[x] ?? 0)), 0)
      const frame = layoutFrame(view, { orientation: 'landscape', scaffold: true })
      expect([seed, rectsWith(frame, 'probability-overlap').length]).toEqual([seed, 2 * agreed])
      expect([seed, rectsWith(frame, 'hatch-draft').length]).toEqual([seed, over])
      expect([seed, rectsWith(frame, 'probability-residual').length]).toEqual([seed, under])
      expect(rectsWith(frame, 'probability-target')).toHaveLength(0)
    }
  })

  test('with it off, the commis\'s plates are all hatched and the chef\'s all blue, which is what a graded run draws', () => {
    for (const seed of [0, 1, 2]) {
      const view = viewOf(stateAfter(buildLevel('exact', seed)))
      const row = view.rows[0]
      const frame = layoutFrame(view, { orientation: 'landscape', scaffold: false, outcome: false })
      expect([seed, rectsWith(frame, 'hatch-draft').length]).toEqual([seed, PLATES])
      expect([seed, rectsWith(frame, 'probability-target').length]).toEqual([seed, row.p.reduce((a, b) => a + b, 0)])
      expect(rectsWith(frame, 'probability-overlap')).toHaveLength(0)
      expect(rectsWith(frame, 'probability-residual')).toHaveLength(0)
    }
  })

  test('the chef\'s extra course is her stack alone: blue plates, and no commis stack', () => {
    const view = viewOf(stateAfter(buildLevel('chain', 1), { t: 'commit', prediction: 2400 }))
    const bonus = view.rows[view.rows.length - 1]
    expect(bonus.kind).toBe('bonus')
    expect(bonus.q).toBeNull()
    const frame = layoutFrame(view, { orientation: 'landscape', scaffold: true })
    const blue = rectsWith(frame, 'probability-target')
    expect(blue).toHaveLength(bonus.p.reduce((a, b) => a + b, 0))
  })

  test('the paper tags of a single tasting print each dish\'s plates, the commis\'s on the left and the chef\'s on the right, in the printer\'s dots', () => {
    const view = viewOf(stateAfter(buildLevel('exact', 0)))
    const frame = layoutFrame(view, { orientation: 'landscape' })
    const counts = marksOf(frame, 'counts').filter((mark): mark is Extract<Mark, { kind: 'text' }> => mark.kind === 'text')
    expect(counts.map((mark) => mark.text)).toEqual(view.rows[0].p.flatMap((p, x) => [String(view.rows[0].q?.[x]), String(p)]))
    for (const mark of counts) expect(mark.face).toBe('numeric')
  })

  test('a drafted plate is a solid dot where it was kept and a struck ring where it was sent back, one for each marker of the view', () => {
    const view = viewOf(stateAfter(buildLevel('exact', 0), { t: 'preset', from: 'p' }, { t: 'draw', n: 100 }))
    const frame = layoutFrame(view, { orientation: 'landscape' })
    const dots = marksOf(frame, 'plates')
    const kept = view.rows[0].markers.filter((m) => m.kept).length
    const sent = view.rows[0].markers.length - kept
    expect(dots.filter((mark) => mark.kind === 'circle')).toHaveLength(kept + sent)
    expect(dots.filter((mark) => mark.kind === 'circle' && mark.fill === 'paper-ink')).toHaveLength(kept)
    expect(dots.filter((mark) => mark.kind === 'line')).toHaveLength(sent)
    expect(kept).toBeGreaterThan(0)
    expect(sent).toBeGreaterThan(0)
  })

  test('what went out is a ring and a hairline over each dish of the chef\'s stack, and a graded run leaves them out', () => {
    const view = viewOf(stateAfter(buildLevel('exact', 0), { t: 'preset', from: 'p' }))
    const shown = layoutFrame(view, { orientation: 'landscape', outcome: true })
    const rings = marksOf(shown, 'out').filter((mark) => mark.kind === 'circle' && mark.stroke === 'cat-white-edge')
    expect(rings).toHaveLength(6)
    expect(marksOf(layoutFrame(view, { orientation: 'landscape', outcome: false }), 'out')).toEqual([])
  })

  test('the exact output lands on the top of the chef\'s stack: the ring of an exact recipe sits at the height of p, dish by dish', () => {
    const level = buildLevel('exact', 0)
    const view = viewOf(stateAfter(level, ...sculptActions(excessPlates(level))))
    expect(view.rows[0].out?.map((plates) => Math.round(plates * 1e6) / 1e6)).toEqual([...view.rows[0].p])
  })
})

describe('the stacks are plates, not bars (W1\'s finish review, round 1)', () => {
  const rects = (frame: Frame, part: string) => marksOf(frame, part).filter((mark): mark is Extract<Mark, { kind: 'rect' }> => mark.kind === 'rect')
  const lines = (frame: Frame, part: string) => marksOf(frame, part).filter((mark): mark is Extract<Mark, { kind: 'line' }> => mark.kind === 'line')

  test('every plate is seen edge on: rounded ends, a rim of glaze along its top, and a gap of at least a third of a plate under it', () => {
    for (const [id, seed] of PRACTICE) {
      for (const orientation of ORIENTATIONS) {
        // `gamma` plates nothing before a draft length is picked.
        const view = viewOf(id === 'gamma' ? stateAfter(buildLevel(id, seed), { t: 'gamma', k: 3 }) : stateAfter(buildLevel(id, seed)))
        const frame = frameOf(view, orientation)
        const plates = rects(frame, 'stacks').filter((mark) => mark.fill !== 'none')
        const rims = lines(frame, 'stacks').filter((mark) => mark.stroke === 'paper')
        expect([id, orientation, plates.length > 0, rims.length]).toEqual([id, orientation, true, plates.length])
        for (const plate of plates) expect([id, plate.rx !== undefined && plate.rx >= Math.min(plate.h / 2, 2.6) - 0.01]).toEqual([id, true])
        // One plate's pitch on a stack: the plate and the gap of shade under it, never so thin that the stack reads as a bar.
        const ys = [...new Set(plates.filter((mark) => mark.x === plates[0].x).map((mark) => mark.y))].sort((a, b) => a - b)
        if (ys.length > 1) expect([id, orientation, ys[1] - ys[0] >= 2.6]).toEqual([id, orientation, true])
      }
    }
  })

  test('the chef\'s stacks stand in her wire dispensers, two posts and a bar each, the foot in the target blue, one for each dish of each course', () => {
    const view = viewOf(stateAfter(buildLevel('chain', 1), { t: 'commit', prediction: 2400 }))
    const frame = layoutFrame(view, { orientation: 'landscape' })
    const feet = rects(frame, 'wire').filter((mark) => mark.fill === 'probability-target')
    expect(feet).toHaveLength(view.rows.length * 6)
    expect(lines(frame, 'wire').filter((mark) => mark.stroke === 'surface-3')).toHaveLength(view.rows.length * 6 * 2)
    // No outline round her stack: the wire is what holds it, and it stands a few plates over what she holds, not over the whole row.
    expect(rects(frame, 'stacks').filter((mark) => mark.fill === 'none')).toEqual([])
    const plates = rects(frame, 'stacks').filter((mark) => mark.fill !== 'none')
    const ys = [...new Set(plates.filter((mark) => mark.x === plates[0].x).map((mark) => mark.y))].sort((a, b) => a - b)
    const unit = ys[1] - ys[0]
    const posts = lines(frame, 'wire').filter((mark) => mark.stroke === 'surface-3')
    view.rows.forEach((row, r) =>
      row.p.forEach((p, dish) => {
        const post = posts[(r * 6 + dish) * 2]
        expect([r, dish, Math.abs(post.y1 - post.y2) <= (p + 3) * unit + 0.5]).toEqual([r, dish, true])
      }),
    )
  })

  test('every stack that has a plate stands in its contact shadow on the pass, in the deep steel, soft and a little wider than the stack', () => {
    const view = viewOf(stateAfter(buildLevel('exact', 0)))
    const frame = layoutFrame(view, { orientation: 'landscape' })
    const row = view.rows[0]
    const stacks = row.p.filter((p) => p > 0).length + (row.q ?? []).filter((q) => q > 0).length
    const shadows = rects(frame, 'pass').filter((mark) => mark.fill === 'surface-3' && mark.opacity !== undefined && mark.opacity < 0.5)
    expect(shadows).toHaveLength(stacks)
  })
})

describe('no axis, no legend, no chart', () => {
  test('the layers are the kitchen\'s objects, and none is an axis, a gridline or a legend', () => {
    const names = new Set<string>()
    for (const [id, seed] of PRACTICE) {
      for (const state of statesOf(id, seed)) for (const layer of frameOf(viewOf(state), 'landscape').layers) names.add(layer.part)
    }
    expect([...names].sort()).toEqual(['counts', 'lamp', 'names', 'out', 'pass', 'plates', 'round', 'stacks', 'wire'])
  })

  test('the text it writes is a dish\'s plates, a position\'s acceptance on its tag, or a name on masking tape: digits, or capitals', () => {
    for (const [id, seed] of PRACTICE) {
      for (const state of statesOf(id, seed)) {
        for (const orientation of ORIENTATIONS) {
          for (const mark of marksOf(frameOf(viewOf(state), orientation))) {
            if (mark.kind !== 'text') continue
            expect([id, mark.text, /^\d{1,3}$/.test(mark.text) || /^[pq]$/.test(mark.text) || /^[A-Z'·0-9 ]{1,24}$/.test(mark.text) || /^[A-Z'· ]+ [pq]$/.test(mark.text)]).toEqual([id, mark.text, true])
            expect(['numeric', 'label']).toContain(mark.face)
            if (/^\d+$/.test(mark.text)) expect(mark.face === 'numeric' || mark.face === 'label').toBe(true)
          }
        }
      }
    }
  })

  test('the two stacks are named on tape above the first dish, and each dish is named on tape under its pair', () => {
    const view = viewOf(stateAfter(buildLevel('exact', 0)))
    const texts = marksOf(layoutFrame(view, { orientation: 'landscape' }), 'names')
      .filter((mark): mark is Extract<Mark, { kind: 'text' }> => mark.kind === 'text')
      .map((mark) => mark.text)
    expect(texts).toEqual(['COMMIS · q', 'CHEF · p', ...view.dishes.map((name) => name.toUpperCase())])
    const portrait = marksOf(layoutFrame(view, { orientation: 'portrait' }), 'names').filter((mark): mark is Extract<Mark, { kind: 'text' }> => mark.kind === 'text')
    expect(portrait.slice(0, 2).map((mark) => mark.text)).toEqual(['q', 'p'])
  })
})

describe('it stays in its frame and under the cap (A§6.4)', () => {
  test('under 2,000 marks and inside the frame, in every state of every level, in both orientations, with the decomposition on and off', () => {
    let most = 0
    let frames = 0
    for (const [id, seed] of PRACTICE) {
      for (const state of statesOf(id, seed)) {
        for (const orientation of ORIENTATIONS) {
          for (const scaffold of [true, false]) {
            const frame = frameOf(viewOf(state), orientation, scaffold)
            const count = marksOf(frame).length
            most = Math.max(most, count)
            frames++
            expect([id, count < MARK_CAP]).toEqual([id, true])
            // The SVG's own count adds the two marks of the hatching's pattern, which is written once in `defs`.
            expect([markCount(frame) - count]).toEqual([marksOf(frame).some((mark) => mark.kind === 'rect' && mark.fill === 'hatch-draft') ? 2 : 0])
            for (const mark of marksOf(frame)) {
              const xs = mark.kind === 'rect' ? [mark.x, mark.x + mark.w] : mark.kind === 'line' ? [mark.x1, mark.x2] : mark.kind === 'circle' ? [mark.cx] : [mark.x]
              const ys = mark.kind === 'rect' ? [mark.y, mark.y + mark.h] : mark.kind === 'line' ? [mark.y1, mark.y2] : mark.kind === 'circle' ? [mark.cy] : [mark.y]
              for (const x of xs) expect([id, orientation, mark.kind, x >= -1 && x <= frame.width + 1]).toEqual([id, orientation, mark.kind, true])
              for (const y of ys) expect([id, orientation, mark.kind, y >= -1 && y <= frame.height + 1]).toEqual([id, orientation, mark.kind, true])
            }
          }
        }
      }
    }
    expect(frames).toBeGreaterThan(100)
    expect(most).toBeLessThan(1400)
  })

  test('a frame is a function of its view and options: the same ones always give the same frame', () => {
    const view = viewOf(stateAfter(buildLevel('chain', 1), { t: 'commit', prediction: 2400 }, { t: 'draw', n: 100 }))
    for (const orientation of ORIENTATIONS) expect(JSON.stringify(layoutFrame(view, { orientation }))).toBe(JSON.stringify(layoutFrame(view, { orientation })))
  })

  test('a frame with more plates than the cap leaves out their edges and keeps the picture: one slab for each run of plates', () => {
    const view = viewOf(stateAfter(buildLevel('chain', 1), { t: 'commit', prediction: 2400 }))
    const frame = layoutFrame(view, { orientation: 'landscape' })
    expect(marksOf(frame).length).toBeLessThan(MARK_CAP)
    // The drawing always has the stacks, whatever its detail: with every plate drawn a stack is a count.
    expect(marksOf(frame, 'stacks').length).toBeGreaterThan(100)
  })

  test('the dish columns are six cells across the frame, for the taps that hand focus to a dish\'s weight', () => {
    for (const orientation of ORIENTATIONS) {
      const frame = layoutFrame(viewOf(stateAfter(buildLevel('exact', 0))), { orientation })
      expect(frame.columns).toHaveLength(6)
      const columns = frame.columns ?? []
      columns.forEach((column, i) => {
        expect(column.x).toBeGreaterThanOrEqual(0)
        expect(column.x + column.w).toBeLessThanOrEqual(frame.width + 0.01)
        if (i > 0) expect(column.x).toBeGreaterThanOrEqual(columns[i - 1].x + columns[i - 1].w - 0.01)
      })
    }
  })
})

describe('the draft-length level draws a stack of sixty-four for each position of a run', () => {
  test('the run the commis plates is solid and the positions beyond it are outlines, in which the split of kept and sent back stays readable', () => {
    const level = buildLevel('gamma', 0)
    const view = viewOf(stateAfter(level, { t: 'gamma', k: 3 }))
    const frame = layoutGamma(view, { orientation: 'landscape' })
    const stacks = marksOf(frame, 'stacks').filter((mark): mark is Extract<Mark, { kind: 'rect' }> => mark.kind === 'rect')
    expect(stacks).toHaveLength(8 * PLATES)
    const solid = stacks.filter((mark) => mark.fill === 'probability-overlap' || mark.fill === 'hatch-draft')
    expect(solid).toHaveLength(3 * PLATES)
    const kept = view.gamma?.alphas.slice(0, 3).map((a) => Math.round((a * PLATES) / 1000)) ?? []
    expect(stacks.filter((mark) => mark.fill === 'probability-overlap')).toHaveLength(kept.reduce((a, b) => a + b, 0))
    expect(stacks.filter((mark) => mark.fill === 'none' && mark.stroke === 'cat-green-edge').length).toBeGreaterThan(0)
    expect(marksOf(frame, 'lamp')).toHaveLength(1)
  })

  test('before a length is picked there is no lamp, no plated stack and no slab on the ribbon, and the acceptances are on their tags', () => {
    const view = viewOf(stateAfter(buildLevel('gamma', 0)))
    const frame = layoutGamma(view, { orientation: 'portrait' })
    expect(marksOf(frame, 'lamp')).toEqual([])
    expect(marksOf(frame, 'stacks').filter((mark) => mark.kind === 'rect' && mark.fill !== 'none')).toEqual([])
    const tags = marksOf(frame, 'names').filter((mark): mark is Extract<Mark, { kind: 'text' }> => mark.kind === 'text').map((mark) => mark.text)
    expect(tags).toEqual([...(view.gamma?.alphas.slice(0, 8).flatMap((a, j) => [String(j + 1), String(a)]) ?? [])])
  })

  test('it refuses a view that is not the draft-length level\'s', () => {
    expect(() => layoutGamma(viewOf(verifierInit(buildLevel('exact', 0))))).toThrow('draft-length level')
  })
})

describe('the SVG is what the page paints', () => {
  /** The drawing: the first <svg> of the page's markup (the key under it has glyphs of its own). */
  const svgIn = (markup: string): string => markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>') + '</svg>'.length)

  test('the markup of a frame writes the hatching once as a pattern in `defs`, the lamp\'s blur once, and every attribute in SVG\'s own spelling', () => {
    const view = viewOf(stateAfter(buildLevel('exact', 0)))
    const markup = svgMarkup(frameSvg(layoutFrame(view, { orientation: 'landscape' })))
    expect(markup.match(/<pattern /g)).toHaveLength(1)
    expect(markup).toContain('id="es-hatch-draft-landscape"')
    expect(markup).toContain('patternUnits="userSpaceOnUse"')
    expect(markup.match(/<filter /g)).toHaveLength(1)
    expect(markup).toContain('fill="url(#es-hatch-draft-landscape)"')
    expect(markup).toContain('role="img"')
    // React's camelCase attribute names are written in SVG's kebab-case.
    expect(markup).not.toMatch(/ (?:strokeWidth|strokeDasharray|strokeOpacity|fillOpacity|fontFamily|fontSize|textAnchor)=/)
    expect(markup).toContain(' stroke-width="')
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,6}["']/)
  })

  test('the page paints, on its first render, the landscape frame of the view: byte for byte what `frameSvg` writes', () => {
    for (const [id, seed] of PRACTICE) {
      const state = verifierInit(buildLevel(id, seed))
      const painted = renderToStaticMarkup(h(View2D, { run: fakeRun(state) }))
      const view = viewOf(state)
      const frame = view.level === 'gamma' ? layoutGamma(view, { orientation: 'landscape' }) : layoutFrame(view, { orientation: 'landscape', scaffold: !(id === 'greedy-ngram'), outcome: true })
      expect([id, svgIn(painted)]).toEqual([id, svgMarkup(frameSvg(frame))])
    }
  })

  test('a graded run is painted with the plain stacks and no rings: the page asks the layout for what the rules allow', () => {
    const level = buildLevel('exact', 0)
    const state = stateAfter(level, { t: 'preset', from: 'p' })
    const graded = renderToStaticMarkup(h(View2D, { run: fakeRun(state, { mode: 'graded' }) }))
    expect(graded).not.toContain('agreed')
    expect(graded).not.toContain('what went out')
    expect(graded).not.toContain('Distance from her tasting')
    expect(svgIn(graded)).not.toContain('var(--es-probability-overlap)')
    expect(svgIn(graded)).not.toContain('var(--es-probability-residual)')
    const practice = renderToStaticMarkup(h(View2D, { run: fakeRun(state) }))
    expect(practice).toContain('agreed')
    expect(practice).toContain('what went out')
    expect(practice).toContain('Distance from her tasting')
    expect(svgIn(practice)).toContain('var(--es-probability-overlap)')
  })
})
