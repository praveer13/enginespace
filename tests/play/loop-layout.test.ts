/*
 * Service's 2D view (packages/play/loop/layout.ts): the poster SVG equals the front page's first frame and the 2D view draws the same
 * pure function on Service's own page (both from one pure function), the view stays far under 2,000 SVG marks (A§6.3, A§6.11,
 * GAMES.md §3 "2D path"), and it is the same kitchen as the 3D scene drawn flat at the scene's scale (the finish review's round 1, fix
 * 7): the room and the hood, the line's stations burning or cold, the rail with paper tickets on its clips, the lamps and their pools
 * on the pass, the plates of the last fire, the heated shelf with its plate stacks, and no lane, no axis and no legend.
 *
 * The poster is `scripts/posters.ts`: the practice seed of the first level as a view, laid out through the front page's shot and
 * written as SVG text. The 2D view is `View2D`, which draws Service's own shot as React elements. The first group renders the real
 * component on the server and cuts the <svg> out of its markup, so what is compared is what the page paints and not a second copy of
 * the code.
 *
 * Measured by the poster script [measured 2026-11-04 on this task's tree]: the two posters are 140 marks each and 20,746 and 20,744
 * characters (`bun scripts/posters.ts`), 4,755 and 4,731 bytes under `gzip -9`.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ROLES } from '@/design/tokens'
import { svgToReact } from '@/games/loop/svg'
import { View2D } from '@/games/loop/View2D'
import { hang, initState, setOverlap, step } from '@es/play/loop/engine'
import { clipX, RAIL, SHOTS, viewOf } from '@es/play/loop/kitchen'
import { FRAMES, MARK_CAP, MIRROR_TICKS, PAINTS, STRIP, WINDOW_TICKS, frameSvg, layoutFrame, layoutStrip, markCount, ticketNo, windowOf } from '@es/play/loop/layout'
import type { Frame, Mark, Orientation, ShotName } from '@es/play/loop/layout'
import { firesOfRun } from '@es/play/loop/compare'
import { buildLevel, services } from '@es/play/loop/levels'
import { loopView } from '@es/play/loop/session'
import { countMarks, escapeText, svgMarkup } from '@es/play/loop/svg'
import type { SvgNode } from '@es/play/loop/svg'
import type { FireView, LoopState, LoopView, PlaceView } from '@es/play/loop/types'
import { POSTER_LEVEL, POSTER_SEED, renderPosters, stalePosters } from '../../scripts/posters'
import { fakeRun, handLevel, houseNight, statesOfHouseNight } from './loop-support'

const ORIENTATIONS: readonly Orientation[] = ['landscape', 'portrait']
const SHOT_NAMES: readonly ShotName[] = ['front', 'loop']
const first = loopView(initState(buildLevel(POSTER_LEVEL, POSTER_SEED)))

/** The <svg> of a server-rendered page. */
const svgIn = (markup: string): string => {
  const start = markup.indexOf('<svg')
  const end = markup.lastIndexOf('</svg>')
  return markup.slice(start, end + '</svg>'.length)
}
const marksOf = (frame: Frame, part: string): readonly Mark[] => frame.layers.find((layer) => layer.part === part)?.marks ?? []
const texts = (marks: readonly Mark[]) => marks.flatMap((mark) => (mark.kind === 'text' ? [mark.text] : []))
const fill = (s: LoopState, n = Number.POSITIVE_INFINITY): LoopState => {
  let state = s
  for (let i = 0; i < n && state.waiting.length > 0 && state.tray.includes(null); i++) state = hang(state, state.waiting[0])
  return state
}
/** Half a rail fired: clips 0 and 1 hung and rung, so stations 0 and 1 burn and 2 and 3 stand dark. */
const half = () => loopView(step(fill(initState(buildLevel(POSTER_LEVEL, POSTER_SEED)), 2)))

describe("the poster is the front page's first frame, and the 2D view draws the same code", () => {
  test('scripts/posters.ts draws the practice seed of the first level, in both orientations, through the front shot', () => {
    expect([POSTER_LEVEL, POSTER_SEED]).toEqual(['first-1-fill', 1])
    const posters = renderPosters()
    expect(posters.map((poster) => poster.orientation)).toEqual(['landscape', 'portrait'])
    for (const poster of posters) {
      expect(poster.svg).toBe(`${svgMarkup(frameSvg(layoutFrame(first, { orientation: poster.orientation, shot: 'front' })))}\n`)
      expect(poster.file).toBe(`loop-first-frame-${poster.orientation}.svg`)
    }
  })

  test("View2D paints, byte for byte, Service's own shot of the same night on its first render (which is landscape), covering its box", () => {
    const painted = renderToStaticMarkup(h(View2D, { run: fakeRun(initState(buildLevel(POSTER_LEVEL, POSTER_SEED))) }))
    expect(svgIn(painted)).toBe(svgMarkup(frameSvg(layoutFrame(first, { orientation: 'landscape', shot: 'loop' }), { cover: true })))
    expect(svgIn(painted)).toContain('preserveAspectRatio="xMidYMid slice"')
  })

  test('the portrait poster is the same tree in React: the markup the React side writes is the markup the script writes', () => {
    const [, portrait] = renderPosters()
    const tree = frameSvg(layoutFrame(first, { orientation: 'portrait', shot: 'front' }))
    expect(renderToStaticMarkup(svgToReact(tree) as never)).toBe(portrait.svg.trimEnd())
  })

  test('the two renderers agree on every state of a night, in both orientations, through both shots', () => {
    const level = buildLevel('first-4-par', 1)
    let checked = 0
    for (const overlap of [false, true]) {
      for (const state of statesOfHouseNight(level, { overlap })) {
        for (const orientation of ORIENTATIONS) {
          for (const shot of SHOT_NAMES) {
            const tree = frameSvg(layoutFrame(loopView(state), { orientation, shot }))
            expect(renderToStaticMarkup(svgToReact(tree) as never)).toBe(svgMarkup(tree))
            checked += 1
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200)
  })

  test('the poster is the same for every visitor: drawing it twice gives the same text', () => {
    expect(renderPosters().map((poster) => poster.svg)).toEqual(renderPosters().map((poster) => poster.svg))
  })

  test('the committed posters under public/posters are what the code draws now (`bun scripts/posters.ts --check`)', () => {
    expect(stalePosters()).toEqual([])
  })

  test("the first frame is the empty rail, every clip's stub printed empty, and no printer: the front page holds its own", () => {
    const [landscape, portrait] = renderPosters()
    expect(landscape.svg).toContain('role="img"')
    expect(landscape.svg).toContain('aria-label="Fill the rail. The rail has 4 clips and 0 are hung. 6 tickets wait.')
    for (const poster of [landscape, portrait]) {
      expect(poster.svg.match(/>empty<\/text>/g)).toHaveLength(4)
      expect(poster.svg).not.toContain('data-part="printer"')
    }
  })

  test("Service's own shot draws the printer at the pass's left end, the tickets it has fed lying in front of it, and what it still holds", () => {
    const frame = layoutFrame(first, { shot: 'loop' })
    const printer = marksOf(frame, 'printer')
    expect(texts(printer)).toEqual([...first.waiting.slice(0, 5).map(ticketNo), `+${first.waiting.length - 5}`])
  })
})

describe('the 2D view stays far under 2,000 SVG marks', () => {
  test('across every state of a night on every level, in both orientations, through both shots, and with overlap on and off', () => {
    let most = 0
    let frames = 0
    for (const id of ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par'] as const) {
      for (const overlap of [false, true]) {
        // The overlap switch is not on the panel in the first two levels.
        if (overlap && buildLevel(id, 1).overlap === 'locked') continue
        for (const state of statesOfHouseNight(buildLevel(id, 1), { overlap })) {
          for (const orientation of ORIENTATIONS) {
            for (const shot of SHOT_NAMES) {
              most = Math.max(most, markCount(layoutFrame(loopView(state), { orientation, shot })))
              frames += 1
            }
          }
        }
      }
    }
    console.log(`2D view marks: at most ${most} in ${frames} frames of the four levels (cap ${MARK_CAP})`)
    expect(frames).toBeGreaterThan(400)
    expect(most).toBeLessThanOrEqual(MARK_CAP / 8)
  })

  test('the drawing is of the present, so a night of any length draws as few marks as its rail and its last fire', () => {
    const places: PlaceView[] = [
      { state: 'plate', req: 1 },
      { state: 'binned', req: 2 },
      { state: 'empty', req: null },
      { state: 'plate', req: 3 },
    ]
    const list: FireView[] = Array.from({ length: 3000 }, (_, index) => ({ index, startUs: 2 + index * 7, endUs: 6 + index * 7, places, admits: 0, bubbleUs: 3, ghosts: 1, onLine: false }))
    const base = loopView(initState(buildLevel('first-4-par', 1)))
    const long: LoopView = { ...base, fires: list, clockUs: 7 * 3000 + 2, step: 3000, waiting: Array.from({ length: 200 }, (_, i) => i) } // not seeds: 200 requests in the queue
    for (const orientation of ORIENTATIONS) for (const shot of SHOT_NAMES) expect(markCount(layoutFrame(long, { orientation, shot }))).toBeLessThan(250)
  })
})

describe('the drawing paints with token roles and nothing else', () => {
  test('every role the layout paints with is a role of src/design/tokens.ts', () => {
    expect(PAINTS.length).toBeGreaterThan(10)
    for (const role of PAINTS) expect([role, Object.hasOwn(ROLES, role)]).toEqual([role, true])
    for (const font of ['font-numeric', 'font-ticket', 'font-label']) expect(Object.hasOwn(ROLES, font)).toBe(true)
  })

  test('the markup of every state names only those roles, as custom properties, and holds no literal colour or face', () => {
    const level = buildLevel('first-4-par', 1)
    const used = new Set<string>()
    for (const state of statesOfHouseNight(level, { overlap: true })) {
      for (const orientation of ORIENTATIONS) {
        for (const shot of SHOT_NAMES) {
          const markup = svgMarkup(frameSvg(layoutFrame(loopView(state), { orientation, shot })))
          for (const [, name] of markup.matchAll(/var\(--es-([a-z0-9-]+)\)/g)) used.add(name)
          expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
          expect(markup).not.toMatch(/\b(?:rgba?|hsla?|oklch|hwb|lab|lch)\(/i)
          expect(markup).not.toMatch(/Doto|Handjet|Atkinson|Big Shoulders|Permanent Marker|sans-serif|monospace|Arial|Helvetica/)
          // Every paint attribute is a custom property or `none`: nothing is a keyword colour.
          for (const [, value] of markup.matchAll(/\b(?:fill|stroke)="([^"]*)"/g)) expect(value === 'none' || /^var\(--es-[a-z0-9-]+\)$/.test(value)).toBe(true)
        }
      }
    }
    for (const name of used) expect([name, Object.hasOwn(ROLES, name)]).toEqual([name, true])
    // The drawing's materials: the lamp and its filament, the steel's four tones, the paper and its two inks and rule, the masking
    // tape and its marker, and the printer's dots.
    for (const name of ['lamp', 'lamp-ring', 'surface-0', 'surface-1', 'surface-2', 'surface-3', 'paper', 'paper-ink', 'paper-ink-2', 'paper-rule', 'tape', 'tape-ink', 'font-numeric', 'font-ticket', 'font-label']) expect([name, used.has(name)]).toEqual([name, true])
  })

  test("no state takes a code colour, and the amber stays where the present is: the lamps' pools on the pass, their mouths, and a burning station", () => {
    const AMBER: ReadonlySet<string> = new Set(['pools', 'bulbs', 'heat'])
    for (const overlap of [false, true]) {
      for (const state of statesOfHouseNight(buildLevel('first-4-par', 1), { overlap })) {
        for (const orientation of ORIENTATIONS) {
          for (const shot of SHOT_NAMES) {
            for (const layer of layoutFrame(loopView(state), { orientation, shot }).layers) {
              for (const mark of layer.marks) {
                const paints = mark.kind === 'text' ? [mark.fill] : [mark.fill, mark.stroke]
                expect(paints.some((paint) => paint === 'lane-gpu')).toBe(false)
                if (paints.some((paint) => paint === 'lamp')) expect([layer.part, AMBER.has(layer.part)]).toEqual([layer.part, true])
              }
            }
          }
        }
      }
    }
  })

  test("the pools are light with no edge, one under each lamp on the pass, and a dark station's frame has no heat", () => {
    const frame = layoutFrame(first, { shot: 'front' })
    const pools = marksOf(frame, 'pools')
    expect(pools).toHaveLength(3)
    for (const pool of pools) expect(pool).toMatchObject({ kind: 'ellipse', fill: 'lamp', soft: true })
    expect(marksOf(frame, 'heat')).toEqual([])
  })
})

describe('the same kitchen as the scene, drawn flat in its own materials (the finish review, round 1)', () => {
  test('the room has its tile, its floor and its haze, and the hood hangs over the line', () => {
    const frame = layoutFrame(first, { shot: 'front' })
    const room = marksOf(frame, 'room')
    // The tile's grout and its joints, each one stroke; the haze a veil of the room's grey over the far wall.
    expect(room.filter((mark) => mark.kind === 'path' && mark.stroke === 'paper-rule').length).toBeGreaterThanOrEqual(2)
    expect(room.some((mark) => mark.kind === 'poly' && mark.fill === 'surface-0' && (mark.opacity ?? 1) < 1)).toBe(true)
    expect(marksOf(frame, 'hood').length).toBeGreaterThan(2)
  })

  test("the line's stations burn where the latest fire cooked a course: their pilots and heat in the lamp's amber, their burners' heads struck solid", () => {
    const frame = layoutFrame(half(), { shot: 'front' })
    const heat = marksOf(frame, 'heat')
    // Stations 0 (the griddle) and 1 (the burners) burn: two pilots, the griddle's plate and edge, and the burners' four bowls.
    expect(heat.filter((mark) => mark.kind === 'circle')).toHaveLength(2)
    expect(heat.filter((mark) => mark.kind === 'ellipse' && mark.soft === true)).toHaveLength(5)
    const line = marksOf(frame, 'line')
    // Station 1's four heads are solid, station 3's four are open rings; stations 2 and 3 show open pilots.
    expect(line.filter((mark) => mark.kind === 'ellipse' && mark.fill === 'paper-ink')).toHaveLength(4)
    expect(line.filter((mark) => mark.kind === 'ellipse' && mark.fill === 'none' && mark.stroke === 'paper-ink')).toHaveLength(4)
    expect(line.filter((mark) => mark.kind === 'circle' && mark.fill === 'none' && mark.stroke === 'surface-3')).toHaveLength(2)
  })

  test('a ticket on the rail is paper with its number printed; an empty clip shows a stub printed empty in the ribbon\'s red', () => {
    const view = loopView(fill(initState(buildLevel(POSTER_LEVEL, POSTER_SEED)), 2))
    const rail = marksOf(layoutFrame(view, { shot: 'front' }), 'rail')
    expect(texts(rail.filter((mark) => mark.kind === 'text' && mark.face === 'numeric'))).toEqual([ticketNo(0), ticketNo(1)])
    expect(rail.filter((mark) => mark.kind === 'text' && mark.text === 'empty' && mark.fill === 'paper-ink-2')).toHaveLength(2)
    expect(rail.filter((mark) => mark.kind === 'poly' && mark.fill === 'paper')).toHaveLength(4)
  })

  test('the plates of the last fire lie on the pass under their clips: a plate with its rim and shadow, an empty place a dashed ring, a binned plate struck in red', () => {
    const plates = marksOf(layoutFrame(half(), { shot: 'front' }), 'plates')
    expect(plates.filter((mark) => mark.kind === 'ellipse' && mark.fill === 'paper')).toHaveLength(4)
    expect(plates.filter((mark) => mark.kind === 'ellipse' && mark.fill === 'text-1')).toHaveLength(2)
    expect(plates.filter((mark) => mark.kind === 'ellipse' && mark.stroke === 'surface-3' && mark.dash !== undefined)).toHaveLength(2)
    // A binned plate: a night with overlap, after a ticket has asked for the check.
    for (const state of statesOfHouseNight(buildLevel('first-4-par', 1), { overlap: true })) {
      const night = loopView(state)
      const served = [...night.fires].reverse().find((fire) => !fire.onLine)
      if (!served?.places.some((place) => place.state === 'binned')) continue
      const binned = marksOf(layoutFrame(night), 'plates').filter((mark) => mark.kind === 'ellipse' && mark.stroke === 'paper-ink-2')
      expect(binned.length).toBe(served.places.filter((place) => place.state === 'binned').length)
      return
    }
    throw new Error("no binned plate in the house's night")
  })

  test('the heated shelf under the pass has its bars, and its plate stacks stand on them with their shadows', () => {
    const shelf = marksOf(layoutFrame(first, { shot: 'front' }), 'shelf')
    expect(shelf.filter((mark) => mark.kind === 'path').length).toBeGreaterThanOrEqual(2)
    expect(shelf.filter((mark) => mark.kind === 'ellipse' && mark.fill === 'text-1')).toHaveLength(2)
  })

  test('the fired rail is drawn only while a fire is on the line, a copy of each of its tickets on it', () => {
    expect(marksOf(layoutFrame(loopView(step(fill(initState(buildLevel('first-3-gap', 1)))))), 'fired')).toEqual([])
    const view = loopView(step(fill(setOverlap(initState(buildLevel('first-3-gap', 1)), true))))
    expect(view.firedRail).not.toBeNull()
    const fired = marksOf(layoutFrame(view), 'fired')
    const numbers = texts(fired.filter((mark) => mark.kind === 'text' && mark.face === 'numeric'))
    expect(numbers).toEqual((view.firedRail ?? []).flatMap((clip) => (clip.req === null ? [] : [ticketNo(clip.req)])))
    expect(texts(fired)).toContain('FIRED RAIL')
  })

  test('no lane chart and no legend: no axis, no clock stamps, no bars along time; tape names the line and the expo', () => {
    const night = loopView(houseNight(buildLevel(POSTER_LEVEL, POSTER_SEED), { overlap: false }))
    for (const view of [first, night]) {
      for (const shot of SHOT_NAMES) {
        const frame = layoutFrame(view, { shot })
        const markup = svgMarkup(frameSvg(frame))
        for (const word of ['PLATE', 'EMPTY', 'BINNED', 'PLAN', 'READ', 'TICKS', 'SYNTHETIC']) expect(markup).not.toContain(`>${word}`)
        expect(markup).toContain('>THE LINE · GPU</text>')
        expect(markup).toContain('>THE EXPO · CPU</text>')
        expect(frame.layers.map((layer) => layer.part)).not.toContain('clock')
        // The only numbers drawn are tickets' numbers and the printer's count of what it still holds.
        for (const text of texts(frame.layers.flatMap((layer) => layer.marks))) if (/\d/.test(text)) expect(text).toMatch(/^\+?\d{1,3}$/)
      }
    }
  })
})

describe('the frame', () => {
  test("what a night is read by lies inside the frame (the room, the rail's ends and a plate's far rim may run past it), in both orientations and through both shots", () => {
    const inside = (frame: Frame, mark: Mark): boolean => {
      const within = (x: number, y: number, slack = 2) => x >= -slack && y >= -slack && x <= frame.width + slack && y <= frame.height + slack
      switch (mark.kind) {
        case 'rect':
          return within(mark.x, mark.y) && within(mark.x + mark.w, mark.y + mark.h)
        case 'circle':
          return within(mark.cx - mark.r, mark.cy - mark.r) && within(mark.cx + mark.r, mark.cy + mark.r)
        case 'ellipse':
          return within(mark.cx - mark.rx, mark.cy - mark.ry) && within(mark.cx + mark.rx, mark.cy + mark.ry)
        case 'text':
          return within(mark.x, mark.y, 0)
        case 'poly':
          return mark.points.every(([x, y]) => within(x, y))
        default:
          return true
      }
    }
    for (const overlap of [false, true]) {
      for (const state of statesOfHouseNight(buildLevel('first-4-par', 1), { overlap })) {
        for (const orientation of ORIENTATIONS) {
          for (const shot of SHOT_NAMES) {
            const frame = layoutFrame(loopView(state), { orientation, shot })
            // Every clip, every printed number and word on the rails, and the middle of every place on the pass.
            const read = [...marksOf(frame, 'clips'), ...[...marksOf(frame, 'rail'), ...marksOf(frame, 'fired')].filter((mark) => mark.kind === 'text')]
            for (const mark of read) expect([orientation, shot, mark, inside(frame, mark)]).toEqual([orientation, shot, mark, true])
            for (const mark of marksOf(frame, 'plates')) if (mark.kind === 'ellipse') expect([orientation, shot, mark, inside(frame, { kind: 'text', x: mark.cx, y: mark.cy, text: '', size: 1, anchor: 'middle', fill: 'paper', face: 'ticket' })]).toEqual([orientation, shot, mark, true])
          }
        }
      }
    }
  })

  test("a frame is the box that the page reserves: its size is the viewBox's and never changes with the night, so nothing moves when it is drawn", () => {
    for (const orientation of ORIENTATIONS) {
      const frame = layoutFrame(first, { orientation })
      const svg = svgMarkup(frameSvg(frame))
      expect(svg).toContain(`viewBox="0 0 ${frame.width} ${frame.height}"`)
      expect(svg).toContain(`width="${frame.width}" height="${frame.height}"`)
      for (const state of statesOfHouseNight(buildLevel('first-4-par', 1), { overlap: true })) {
        const later = layoutFrame(loopView(state), { orientation })
        expect([later.width, later.height]).toEqual([frame.width, frame.height])
      }
    }
    expect([layoutFrame(first, { orientation: 'portrait' }).width, layoutFrame(first, { orientation: 'portrait' }).height]).toEqual([FRAMES.portrait.width, FRAMES.portrait.height])
    expect(layoutFrame(first).width).toBe(720)
  })

  test("the drawing's rail is the scene's: through the loop shot each clip's mark is centred where the camera puts the clip", () => {
    const frame = layoutFrame(first, { shot: 'loop' })
    const see = viewOf(SHOTS.loop.base)
    const centres = marksOf(frame, 'clips').map((mark) => (mark.kind === 'rect' ? mark.x + mark.w / 2 : Number.NaN))
    centres.forEach((centre, slot) => expect(Math.abs(centre - (frame.width / 2 + see([clipX(slot, 4), RAIL.y, RAIL.z]).c * (frame.height / 2)))).toBeLessThan(0.6))
  })

  test('ticket numbers are the id plus one, two digits', () => {
    expect([0, 8, 11].map(ticketNo)).toEqual(['01', '09', '12'])
  })
})

describe('the mirror\'s window moves by whole fires', () => {
  const level = buildLevel('first-4-par', 1)
  const states = [...statesOfHouseNight(level, { overlap: false })]
  const last = loopView(states[states.length - 1])

  test('while the night fits it starts at 0, and nothing is hidden', () => {
    const early = loopView(states[6])
    expect(early.clockUs).toBeLessThanOrEqual(WINDOW_TICKS.landscape)
    expect(windowOf(early, WINDOW_TICKS.landscape)).toMatchObject({ startUs: 0, hidden: 0 })
  })

  test('after that it starts at the plan of the oldest fire that lets the night end inside the window, and the older fires are counted, not listed', () => {
    const shown = windowOf(last, WINDOW_TICKS.landscape)
    expect(last.clockUs).toBeGreaterThan(WINDOW_TICKS.landscape)
    expect(shown.hidden).toBeGreaterThan(0)
    expect(shown.fires.length + shown.hidden).toBe(last.fires.length)
    const plan = last.cpu.find((span) => span.step === shown.fires[0].index && span.kind === 'schedule')
    expect(shown.startUs).toBe(plan?.startUs)
    expect(last.clockUs - shown.startUs).toBeLessThanOrEqual(WINDOW_TICKS.landscape)
    const before = last.cpu.find((span) => span.step === shown.fires[0].index - 1 && span.kind === 'schedule')
    expect(before === undefined || last.clockUs - before.startUs > WINDOW_TICKS.landscape).toBe(true)
  })

  test('a fire on the line that began before the window is kept: overlap\'s cooking runs into the window and is not cut away', () => {
    for (const state of statesOfHouseNight(level, { overlap: true })) {
      const view = loopView(state)
      const shown = windowOf(view, WINDOW_TICKS.landscape)
      for (const fire of view.fires) if (fire.endUs > shown.startUs) expect(shown.fires).toContain(fire)
    }
  })

  test('the mirror\'s window is the larger of the two', () => {
    expect(MIRROR_TICKS).toBe(Math.max(WINDOW_TICKS.landscape, WINDOW_TICKS.portrait))
  })

  test('the layout is a function of the view and the options: the same inputs give the same frame, and the orientation changes it', () => {
    const view = loopView(states[10])
    expect(layoutFrame(view)).toEqual(layoutFrame(view))
    expect(layoutFrame(view, { orientation: 'portrait' })).not.toEqual(layoutFrame(view))
  })
})

describe('the services of the compare view are strips of one scale', () => {
  const s = services(1)
  const scaleTicks = 255

  test('a strip has a slab for each fire and a place for every clip, and no text: its captions and counts are DOM', () => {
    const fires = firesOfRun(s.par)
    const frame = layoutStrip(fires, { slots: 4, scaleTicks, label: 'Par' })
    expect(frame.width).toBe(STRIP.width)
    const marks = frame.layers.flatMap((layer) => layer.marks)
    expect(marks.filter((mark) => mark.kind === 'text')).toHaveLength(0)
    expect(marks).toHaveLength(1 + fires.length * 5)
    expect(svgMarkup(frameSvg(frame))).toContain('aria-label="Par"')
  })

  test('the fires of a sim run: plates first, then binned plates, then empty places, and the dark stretch and the admissions as the sim counted them', () => {
    const fires = firesOfRun(s.par)
    expect(fires).toHaveLength(s.par.steps.length)
    fires.forEach((fire, i) => {
      const step = s.par.steps[i]
      expect(fire.places.map((place) => place.state)).toEqual([
        ...Array.from({ length: step.seqs - step.ghostSeqs }, () => 'plate'),
        ...Array.from({ length: step.ghostSeqs }, () => 'binned'),
        ...Array.from({ length: 4 - step.seqs }, () => 'empty'),
      ])
      expect([fire.bubbleUs, fire.admits, fire.ghosts]).toEqual([step.bubbleUs, step.prefillSeqs, step.ghostSeqs])
      expect([fire.startUs, fire.endUs]).toEqual([s.par.lanes['gpu-stream'][i].startUs, s.par.lanes['gpu-stream'][i].endUs])
    })
  })

  test('lengths compare: a service that takes longer runs further along the same scale', () => {
    const par = layoutStrip(firesOfRun(s.par), { slots: 4, scaleTicks, label: 'x' })
    const refill = layoutStrip(firesOfRun(s.refillAlone), { slots: 4, scaleTicks, label: 'x' })
    const reach = (frame: Frame) => Math.max(...frame.layers[0].marks.flatMap((mark) => (mark.kind === 'rect' && mark.fill === 'lane-gpu' ? [mark.x + mark.w] : [])))
    expect(reach(refill)).toBeGreaterThan(300)
    expect(reach(par)).toBeLessThan(reach(refill))
  })
})

describe('the SVG tree and its two writers', () => {
  const sample: SvgNode = {
    tag: 'svg',
    attrs: { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 10 10', role: 'img', 'aria-label': 'the expo\'s "lane" & <the line>' },
    children: [
      { tag: 'g', attrs: { 'data-part': 'x' }, children: [{ tag: 'rect', attrs: { x: 1.5, y: 2, width: 3, height: 4, rx: 2, fill: 'var(--es-paper)', strokeWidth: 1, strokeDasharray: '3 3', fillOpacity: 0.5 } }] },
      { tag: 'text', attrs: { x: 1, y: 2, textAnchor: 'middle', fontFamily: 'var(--es-font-numeric)', fontSize: 12, dominantBaseline: 'central' }, children: ['07 it\'s <b> & "q"'] },
    ],
  }

  test('the text writer and React\'s static renderer give the same markup, escapes included', () => {
    expect(svgMarkup(sample)).toBe(renderToStaticMarkup(svgToReact(sample) as never))
    expect(escapeText('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&#x27;f')
  })

  test('marks are the elements that draw, and groups are not marks', () => {
    expect(countMarks(sample)).toBe(2)
  })

  test('an attribute name with no SVG spelling here is refused, so a typo cannot ship as a camelCase attribute', () => {
    expect(() => svgMarkup({ tag: 'rect', attrs: { strokeWidth: 1, strokeMiterlimit: 4 } })).toThrow('no kebab-case form')
  })

  test('hand-made nights and levels build frames too: a level with one clip draws one clip', () => {
    const view = loopView(initState(handLevel([3], { slots: 1 })))
    expect(svgMarkup(frameSvg(layoutFrame(view))).match(/>empty<\/text>/g)).toHaveLength(1)
  })
})
