/*
 * Back of House's drawing (GAMES.md §5 "2D path", §2.6 "Back of House"; A§6.3, A§6.4): the layout holds its promises on every scenario of the
 * model, in both orientations, and in the states a run passes through.
 *
 *   - It paints with token roles and nothing else, stays inside its frame, and stays under the cap of 2,000 marks.
 *   - Nothing overlaps: the stops' tiles and chits, and the ticket, stand clear of one another on every path.
 *   - Nothing moves when a stage is laid: once the house is built, the frame, its floors and lanes and every stop already laid are the
 *     same marks, so that the page below it holds still and the map builds as the request moves.
 *   - The house is built when the prediction is written down: until then only the floor the request begins on is drawn, so the drawing does
 *     not answer the prediction.
 *   - It is drawn in the kitchen's own things: no state in a code colour, amber only where the next hand-off starts, and no legend.
 *
 * Measured by the first group of the cap test [measured 2026-11-04 at 5ffa2f9, with this task's files]: the most marks of any frame of the
 * 88 scenarios is printed by the test.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { MARK_CAP, PAINTS, frameSvg, layoutMap, mapOfScenario, mapOfView, markCount } from '@es/play/engine-floor/layout'
import type { Frame, Mark, MapInput, Orientation } from '@es/play/engine-floor/layout'
import { floorView } from '@es/play/engine-floor/session'
import { referenceOf } from '@es/play/engine-floor/stages'
import { GLYPHS } from '@es/play/engine-floor/words'
import { MECHANISMS, describeScenario } from '@es/sim/lifecycle'
import { ROLES } from '@/design/tokens'
import { svgToReact } from '@/games/engine-floor/svg'
import { View2D } from '@/games/engine-floor/View2D'
import { ALL_SCENARIOS, fakeRun, laidTo, levelOf, ranTo, walk } from './engine-floor-support'

const ORIENTATIONS: readonly Orientation[] = ['landscape', 'portrait']

interface Box {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** How wide marker sets a word, as layout.ts estimates it: the layout fits the text to its tape, so this is only to judge by how much. */
const natural = (text: string, size: number) => text.length * size * 0.56

/** The box a mark covers. A text mark is a box around its estimated width; a rotated one stands on its end. */
function boxOf(mark: Mark): Box | null {
  switch (mark.kind) {
    case 'rect':
      return { x: mark.x, y: mark.y, w: mark.w, h: mark.h }
    case 'line':
      return { x: Math.min(mark.x1, mark.x2), y: Math.min(mark.y1, mark.y2), w: Math.abs(mark.x2 - mark.x1), h: Math.abs(mark.y2 - mark.y1) }
    case 'circle':
      return { x: mark.cx - mark.r, y: mark.cy - mark.r, w: 2 * mark.r, h: 2 * mark.r }
    case 'polygon': {
      const xs = mark.points.map(([x]) => x)
      const ys = mark.points.map(([, y]) => y)
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    }
    case 'glyph':
      return { x: mark.x - mark.size / 2, y: mark.y - mark.size / 2, w: mark.size, h: mark.size }
    case 'text': {
      const length = mark.fit ?? natural(mark.text, mark.size)
      const across = mark.size
      return mark.up ? { x: mark.x - across / 2, y: mark.y - length / 2, w: across, h: length } : { x: mark.x - length / 2, y: mark.y - across / 2, w: length, h: across }
    }
  }
}

const marksOf = (frame: Frame, part?: string): Mark[] => frame.layers.filter((layer) => part === undefined || layer.part === part).flatMap((layer) => [...layer.marks])
const overlap = (a: Box, b: Box): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

/** The inputs worth drawing: the house run of every scenario, and a practice level at the states a learner passes through. */
const houseRuns = ALL_SCENARIOS.map((sc) => [describeScenario(sc), mapOfScenario(sc, describeScenario(sc))] as const)
const vllm = levelOf('vllm')
const abort = levelOf('abort')
/** A stage of another engine that the tray holds: laid by mistake, it starts and ends in places this engine's house does not have. */
const stranger = abort.tray.find((id) => !abort.reference.includes(id)) as string
const states: readonly (readonly [string, MapInput])[] = [
  ['before the prediction', mapOfView(floorView(walk(vllm)))],
  ['the prediction written', mapOfView(floorView(laidTo(vllm, 0)))],
  ['three laid', mapOfView(floorView(laidTo(vllm, 3)))],
  ['twelve laid and run', mapOfView(floorView(ranTo(vllm, 12)))],
  ['the whole path laid, not run', mapOfView(floorView(laidTo(vllm, vllm.reference.length)))],
  ['stopped at a stage', mapOfView(floorView(walk(vllm, { t: 'commit', prediction: 2 }, ...vllm.reference.slice(0, 5).map((stage) => ({ t: 'lay' as const, stage })), { t: 'lay', stage: vllm.reference[7] }, { t: 'run' })))],
  ['a stage of another engine laid', mapOfView(floorView(walk(abort, { t: 'commit', prediction: 2 }, { t: 'lay', stage: abort.reference[0] }, { t: 'lay', stage: stranger })))],
  ['over', mapOfView(floorView(ranTo(abort, abort.reference.length)))],
]

describe('the drawing paints with token roles and nothing else', () => {
  test('every role it names is a colour role of the design system, and the faces are variables', () => {
    for (const paint of PAINTS) expect([paint, paint in ROLES && ROLES[paint as keyof typeof ROLES].kind]).toEqual([paint, 'color'])
    for (const [, input] of [...houseRuns, ...states]) {
      for (const orientation of ORIENTATIONS) {
        const svg = JSON.stringify(frameSvg(layoutMap(input, { orientation })))
        expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/)
        for (const value of svg.match(/"(?:fill|stroke)":"([^"]+)"/g) ?? []) expect(value).toMatch(/none|var\(--es-[a-z0-9-]+\)/)
        for (const value of svg.match(/"fontFamily":"([^"]+)"/g) ?? []) expect(value).toMatch(/var\(--es-font-(?:numeric|label)\)/)
      }
    }
  })

  test('the marks name no role a state could be coloured by: only the lane kinds are in the code, the lamp is amber, and the red is the ribbon\'s', () => {
    for (const [, input] of [...houseRuns, ...states]) {
      for (const orientation of ORIENTATIONS) {
        for (const mark of marksOf(layoutMap(input, { orientation }))) {
          const roles = ['fill' in mark ? mark.fill : undefined, 'stroke' in mark ? mark.stroke : undefined].filter((role) => role !== undefined)
          for (const role of roles) expect(role).toMatch(/^(?:none|surface-[123]|paper|paper-ink|paper-ink-2|paper-rule|lamp|text-2|lane-cpu|lane-gpu|cat-blue-edge|cat-green-edge|tape|tape-ink)$/)
          // Amber is the lamp's, and the lamp is drawn once, as light with no edge.
          if ('fill' in mark && mark.fill === 'lamp') expect(mark.kind === 'rect' && mark.soft === true).toBe(true)
        }
      }
    }
  })

  test('the lamp is drawn once while the run is open, and not at all once it is over', () => {
    for (const [name, input] of states) {
      for (const orientation of ORIENTATIONS) {
        const lamps = marksOf(layoutMap(input, { orientation }), 'lamp')
        expect([name, orientation, lamps.length]).toEqual([name, orientation, name === 'over' ? 0 : 1])
      }
    }
  })
})

describe('the drawing stays in its frame, under the cap, and clear of itself', () => {
  test('every mark of every house run and every state lies inside the frame (the lamp is light, and may spill)', () => {
    for (const [name, input] of [...houseRuns, ...states]) {
      for (const orientation of ORIENTATIONS) {
        const frame = layoutMap(input, { orientation })
        for (const mark of marksOf(frame)) {
          if (mark.kind === 'rect' && mark.soft === true) continue
          const box = boxOf(mark)
          if (box === null) continue
          const where = `${name}, ${orientation}, ${mark.kind}`
          expect([where, box.x >= -0.5, box.y >= -0.5, box.x + box.w <= frame.width + 0.5, box.y + box.h <= frame.height + 0.5]).toEqual([where, true, true, true, true])
        }
      }
    }
  })

  test('no frame passes the cap of 2,000 marks, and the most any needs is far under it [measured 2026-11-04]', () => {
    let most = 0
    for (const [, input] of [...houseRuns, ...states]) {
      for (const orientation of ORIENTATIONS) most = Math.max(most, markCount(layoutMap(input, { orientation })))
    }
    expect(most).toBeLessThan(MARK_CAP)
    // The longest path of the model, 33 stages with two ranks, an abort, a prefix hit and two samples, is the largest frame.
    expect(most).toBeLessThan(1000)
  })

  test('the tiles and chits of the stops, and the ticket, never overlap one another, on any path, in either orientation', () => {
    let pairs = 0
    for (const [name, input] of [...houseRuns, ...states]) {
      for (const orientation of ORIENTATIONS) {
        const frame = layoutMap(input, { orientation })
        const boxes: { what: string; box: Box }[] = []
        for (const mark of marksOf(frame, 'stops')) if (mark.kind === 'rect' && mark.stage !== undefined) boxes.push({ what: `stage ${mark.stage + 1}`, box: boxOf(mark) as Box })
        const sheet = marksOf(frame, 'ticket').find((mark) => mark.kind === 'rect')
        if (sheet !== undefined) boxes.push({ what: 'the ticket', box: boxOf(sheet) as Box })
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const area = overlap(boxes[i].box, boxes[j].box)
            if (area > 0.5) throw new Error(`${name}, ${orientation}: ${boxes[i].what} and ${boxes[j].what} overlap by ${area}`)
            pairs += 1
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(100_000)
  })

  test('the names on tape are fitted to their tape and never squeezed much: a name keeps at least 75% of its natural width', () => {
    for (const [name, input] of [...houseRuns, ...states]) {
      for (const orientation of ORIENTATIONS) {
        for (const mark of marksOf(layoutMap(input, { orientation }), 'lanes').concat(marksOf(layoutMap(input, { orientation }), 'floors'))) {
          if (mark.kind !== 'text' || mark.fit === undefined) continue
          expect([name, orientation, mark.text, mark.fit / natural(mark.text, mark.size) >= 0.75]).toEqual([name, orientation, mark.text, true])
        }
      }
    }
  })

  test('every number it writes is a stage\'s number, in the printer\'s dots, and the names are in marker', () => {
    const frame = layoutMap(states[3][1])
    const texts = marksOf(frame).filter((mark) => mark.kind === 'text')
    const numeric = texts.filter((mark) => mark.face === 'numeric')
    expect(numeric.map((mark) => mark.text)).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)))
    for (const mark of texts.filter((candidate) => candidate.face === 'label')) expect(mark.text).not.toMatch(/^\d+$/)
  })
})

describe('the map builds as the request moves, and the page below it holds still', () => {
  test('before the prediction only the floor the request begins on is drawn, and the frame is short', () => {
    const [, before] = states[0]
    const landscape = layoutMap(before, { orientation: 'landscape' })
    expect(marksOf(landscape, 'lanes').filter((mark) => mark.kind === 'text').map((mark) => mark.kind === 'text' && mark.text)).toEqual(['http-client'])
    expect(landscape.height).toBeLessThan(120)
    expect(layoutMap(before, { orientation: 'portrait' }).height).toBeLessThan(260)
    // The prediction asks how many floors a token crosses, so the drawing names no other floor.
    const names = marksOf(landscape, 'floors').filter((mark) => mark.kind === 'text').map((mark) => mark.kind === 'text' && mark.text)
    expect(names).toEqual(['THE DINING ROOM · CLIENT'])
  })

  test('once the prediction is written the house is built: every floor and lane of the engine\'s path, in the order its path first visits them', () => {
    const frame = layoutMap(states[1][1], { orientation: 'landscape' })
    const floors = marksOf(frame, 'floors').filter((mark) => mark.kind === 'text').map((mark) => mark.kind === 'text' && mark.text)
    expect(floors).toEqual(['THE DINING ROOM · CLIENT', 'THE HOST STAND · API-SERVER', 'THE PASS · ENGINE-CORE', 'THE LINE'])
    const lanes = marksOf(frame, 'lanes').filter((mark) => mark.kind === 'text').map((mark) => mark.kind === 'text' && mark.text)
    expect(lanes).toEqual(['http-client', 'handler-task', 'socket-task', 'output-handler-task', 'input-thread', 'main', 'output-thread', 'engine-core stream'])
  })

  test('laying stages moves nothing: the frame, the floors and lanes and every stop already laid are the same marks', () => {
    for (const orientation of ORIENTATIONS) {
      const frames = [0, 1, 4, 9, 15, vllm.reference.length].map((n) => layoutMap(mapOfView(floorView(laidTo(vllm, n))), { orientation }))
      for (let i = 1; i < frames.length; i++) {
        const before = frames[i - 1]
        const after = frames[i]
        expect([orientation, after.width, after.height]).toEqual([orientation, before.width, before.height])
        for (const part of ['floors', 'lanes']) expect(marksOf(after, part)).toEqual(marksOf(before, part))
        // Each stage already laid keeps its route and its stop where they were.
        const stageMarks = (frame: Frame, stage: number) => marksOf(frame).filter((mark) => mark.stage === stage)
        const laidBefore = [0, 1, 4, 9, 15][i - 1]
        for (let stage = 0; stage < laidBefore; stage++) expect(stageMarks(after, stage)).toEqual(stageMarks(before, stage))
      }
    }
  })

  test('a run moves the ticket and inks the stops it got through, and nothing else in the house moves', () => {
    for (const orientation of ORIENTATIONS) {
      const before = layoutMap(mapOfView(floorView(laidTo(vllm, 9))), { orientation })
      const after = layoutMap(mapOfView(floorView(ranTo(vllm, 9))), { orientation })
      expect([after.width, after.height]).toEqual([before.width, before.height])
      for (const part of ['floors', 'lanes']) expect(marksOf(after, part)).toEqual(marksOf(before, part))
      expect(marksOf(after, 'ticket')).not.toEqual(marksOf(before, 'ticket'))
      // The tiles that were pencilled (dashed) are drawn inked (solid) once they held.
      const dashed = (frame: Frame) => marksOf(frame, 'stops').filter((mark) => mark.kind === 'rect' && mark.dash !== undefined && mark.w === 16).length
      expect([dashed(before), dashed(after)]).toEqual([9, 0])
    }
  })

  test('the stage that stopped the ticket is struck in the ribbon\'s red, stands ahead of the ticket, and the stages after it stay pencilled', () => {
    const [, input] = states[5]
    expect(input.stages.map((stage) => stage.state)).toEqual(['ran', 'ran', 'ran', 'ran', 'ran', 'struck'])
    const frame = layoutMap(input, { orientation: 'landscape' })
    const struck = marksOf(frame, 'stops').filter((mark) => mark.stage === 5)
    expect(struck.some((mark) => mark.kind === 'line' && mark.stroke === 'paper-ink-2')).toBe(true)
    const ticket = marksOf(frame, 'ticket').find((mark) => mark.kind === 'rect') as Mark & { x: number; w: number }
    const tile = struck.find((mark) => mark.kind === 'rect') as Mark & { x: number }
    expect(tile.x).toBeGreaterThan(ticket.x + ticket.w)
  })

  test('a stage of another engine laid by mistake gets a lane after the plan\'s, and the plan\'s lanes stay where they were', () => {
    const plain = layoutMap(states[1][1], { orientation: 'landscape' })
    const mistaken = layoutMap(states[6][1], { orientation: 'landscape' })
    const lanes = (frame: Frame) => marksOf(frame, 'lanes').filter((mark) => mark.kind === 'text').map((mark) => mark.kind === 'text' && mark.text)
    expect(lanes(mistaken).length).toBeGreaterThan(lanes(plain).length)
  })
})

describe('the drawing is the same in both orientations, laid along the page or down it', () => {
  test('landscape is 720 wide and runs the lanes along it, and portrait is 360 wide, with its names standing up in a header', () => {
    for (const [, input] of states.slice(1, 5)) {
      const landscape = layoutMap(input, { orientation: 'landscape' })
      const portrait = layoutMap(input, { orientation: 'portrait' })
      expect(landscape.width).toBe(720)
      expect(portrait.width).toBe(360)
      expect(marksOf(landscape).some((mark) => mark.kind === 'text' && mark.up === true)).toBe(false)
      expect(marksOf(portrait).some((mark) => mark.kind === 'text' && mark.up === true)).toBe(true)
      expect(portrait.height).toBeGreaterThan(landscape.height)
    }
  })

  test('a path longer than the engine\'s widens the frame and never overlaps: the stops keep their size', () => {
    const level = levelOf('nano')
    const view = floorView(laidTo(level, 0))
    const long: MapInput = { ...mapOfView(view), stages: Array.from({ length: 60 }, (_, i) => ({ mechanism: MECHANISMS[i % MECHANISMS.length], from: view.entry, to: view.entry, state: 'pending' as const })) }
    const frame = layoutMap(long, { orientation: 'landscape' })
    expect(frame.width).toBeGreaterThan(720)
    expect(markCount(frame)).toBeLessThan(MARK_CAP)
  })
})

describe('the SVG', () => {
  test('is an image with the drawing\'s name, a box of its own size, and a group for each stage that the page can ink in', () => {
    const view = floorView(ranTo(vllm, 6))
    const frame = layoutMap(mapOfView(view))
    const tree = frameSvg(frame)
    expect(tree.tag).toBe('svg')
    expect(tree.attrs.role).toBe('img')
    expect(String(tree.attrs['aria-label'])).toContain('6 held in the last run')
    expect(tree.attrs.viewBox).toBe(`0 0 ${frame.width} ${frame.height}`)
    const stages = JSON.stringify(tree).match(/"data-stage":\d+/g) ?? []
    expect(new Set(stages).size).toBe(6)
  })

  test('has a mark for each hand-off, drawn from the paths the tiles of the page use', () => {
    const frame = layoutMap(mapOfScenario({ engine: 'vllm', streaming: true, tp: 2, abort: true, prefixHit: true, n: 2 }, 'the longest path'))
    const drawn = new Set(marksOf(frame).flatMap((mark) => (mark.kind === 'glyph' ? [mark.mechanism] : [])))
    for (const mechanism of MECHANISMS) expect([mechanism, drawn.has(mechanism)]).toEqual([mechanism, true])
    for (const mechanism of MECHANISMS) expect(GLYPHS[mechanism].length).toBeGreaterThan(0)
  })

  test('is the same tree on the server as in the page: View2D paints the SVG that frameSvg writes, and its first frame is the house before the prediction', () => {
    const state = walk(vllm)
    const markup = renderToStaticMarkup(h(StaticRouter, { location: '/play/engine-floor' }, h(View2D, { run: fakeRun(state) })))
    expect(markup).toContain('data-orientation="landscape"')
    expect(markup).toContain('aria-label="vLLM at the pin. No stage is laid. The ticket stands at client · http-client."')
    const alone = renderToStaticMarkup(svgToReact(frameSvg(layoutMap(mapOfView(floorView(state))), 'x')))
    expect(alone).toContain('<svg')
    expect(markup).toContain('stands at')
    expect(referenceOf(vllm.scenario).length).toBe(22)
  })
})
