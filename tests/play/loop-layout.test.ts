/*
 * Service's 2D view (packages/play/loop/layout.ts): the poster SVG equals the 2D view's first frame (both from one pure function), the
 * view stays far under 2,000 SVG marks (A§6.3, A§6.11, GAMES.md §3 "2D path"), and it is the pass drawn from above in the world's own
 * materials (W0 finding F1): a station over each clip with a hotel pan in its well, paper tickets on the rail, the plates of the last
 * fire on the pass under the lamp's amber, and no lane, no axis and no legend.
 *
 * The poster is `scripts/posters.ts`: the practice seed of the first level as a view, laid out and written as SVG text. The 2D view is
 * `View2D`, which draws the same tree as React elements. The first group renders the real component on the server and cuts the <svg>
 * out of its markup, so what is compared is what the page paints and not a second copy of the code.
 *
 * Measured by the poster script [measured 2026-11-04 on this task's tree]: the two posters are 64 and 72 marks, and 8,069 and 8,925
 * bytes (`bun scripts/posters.ts`).
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ROLES } from '@/design/tokens'
import { svgToReact } from '@/games/loop/svg'
import { View2D } from '@/games/loop/View2D'
import { hang, initState, setOverlap, step } from '@es/play/loop/engine'
import { MARK_CAP, MIRROR_TICKS, PAINTS, STRIP, WINDOW_TICKS, frameSvg, layoutFrame, layoutStrip, markCount, ticketNo, windowOf } from '@es/play/loop/layout'
import type { Frame, Mark, Orientation } from '@es/play/loop/layout'
import { firesOfRun } from '@es/play/loop/compare'
import { buildLevel, services } from '@es/play/loop/levels'
import { loopView } from '@es/play/loop/session'
import { countMarks, escapeText, svgMarkup } from '@es/play/loop/svg'
import type { SvgNode } from '@es/play/loop/svg'
import type { FireView, LoopState, LoopView, PlaceView } from '@es/play/loop/types'
import { POSTER_LEVEL, POSTER_SEED, renderPosters, stalePosters } from '../../scripts/posters'
import { fakeRun, handLevel, houseNight, statesOfHouseNight } from './loop-support'

const ORIENTATIONS: readonly Orientation[] = ['landscape', 'portrait']
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

describe('the poster is the 2D view\'s first frame', () => {
  test('scripts/posters.ts draws the practice seed of the first level, in both orientations, as `layoutFrame` and `frameSvg` write it', () => {
    expect([POSTER_LEVEL, POSTER_SEED]).toEqual(['first-1-fill', 1])
    const posters = renderPosters()
    expect(posters.map((poster) => poster.orientation)).toEqual(['landscape', 'portrait'])
    for (const poster of posters) {
      expect(poster.svg).toBe(`${svgMarkup(frameSvg(layoutFrame(first, { orientation: poster.orientation })))}\n`)
      expect(poster.file).toBe(`loop-first-frame-${poster.orientation}.svg`)
    }
  })

  test('the landscape poster is, byte for byte, the <svg> that View2D paints on its first render (which is landscape)', () => {
    const [landscape] = renderPosters()
    const painted = renderToStaticMarkup(h(View2D, { run: fakeRun(initState(buildLevel(POSTER_LEVEL, POSTER_SEED))) }))
    expect(svgIn(painted)).toBe(landscape.svg.trimEnd())
  })

  test('the portrait poster is the same tree in React: the markup the React side writes is the markup the script writes', () => {
    const [, portrait] = renderPosters()
    const tree = frameSvg(layoutFrame(first, { orientation: 'portrait' }))
    expect(renderToStaticMarkup(svgToReact(tree) as never)).toBe(portrait.svg.trimEnd())
  })

  test('the two renderers agree on every state of a night, in both orientations', () => {
    const level = buildLevel('first-4-par', 1)
    let checked = 0
    for (const overlap of [false, true]) {
      for (const state of statesOfHouseNight(level, { overlap })) {
        for (const orientation of ORIENTATIONS) {
          const tree = frameSvg(layoutFrame(loopView(state), { orientation }))
          expect(renderToStaticMarkup(svgToReact(tree) as never)).toBe(svgMarkup(tree))
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  test('the poster is the same for every visitor: drawing it twice gives the same text', () => {
    expect(renderPosters().map((poster) => poster.svg)).toEqual(renderPosters().map((poster) => poster.svg))
  })

  test('the committed posters under public/posters are what the code draws now (`bun scripts/posters.ts --check`)', () => {
    expect(stalePosters()).toEqual([])
  })

  test('the first frame is the empty rail with the tickets waiting by the printer, every state of it a drawn mark the poster shows without script', () => {
    const [landscape, portrait] = renderPosters()
    expect(landscape.svg).toContain('role="img"')
    expect(landscape.svg).toContain('aria-label="Fill the rail. The rail has 4 clips and 0 are hung. 6 tickets wait.')
    // Landscape lays three of the six beside the printer and counts the rest; portrait has room for all six.
    for (const no of ['01', '02', '03']) expect(landscape.svg).toContain(`>${no}</text>`)
    expect(landscape.svg).toContain('>+3</text>')
    for (const no of ['01', '02', '03', '04', '05', '06']) expect(portrait.svg).toContain(`>${no}</text>`)
    for (const poster of [landscape, portrait]) expect(poster.svg.match(/>empty<\/text>/g)).toHaveLength(4)
  })
})

describe('the 2D view stays far under 2,000 SVG marks', () => {
  test('across every state of a night on every level, in both orientations and with overlap on and off', () => {
    let most = 0
    let frames = 0
    for (const id of ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par'] as const) {
      for (const overlap of [false, true]) {
        // The overlap switch is not on the panel in the first two levels.
        if (overlap && buildLevel(id, 1).overlap === 'locked') continue
        for (const state of statesOfHouseNight(buildLevel(id, 1), { overlap })) {
          for (const orientation of ORIENTATIONS) {
            most = Math.max(most, markCount(layoutFrame(loopView(state), { orientation })))
            frames += 1
          }
        }
      }
    }
    console.log(`2D view marks: at most ${most} in ${frames} frames of the four levels (cap ${MARK_CAP})`)
    expect(frames).toBeGreaterThan(200)
    expect(most).toBeLessThanOrEqual(MARK_CAP / 10)
  })

  test('the plan draws the present, so a night of any length draws as few marks as its rail and its last fire', () => {
    const places: PlaceView[] = [
      { state: 'plate', req: 1 },
      { state: 'binned', req: 2 },
      { state: 'empty', req: null },
      { state: 'plate', req: 3 },
    ]
    const list: FireView[] = Array.from({ length: 3000 }, (_, index) => ({ index, startUs: 2 + index * 7, endUs: 6 + index * 7, places, admits: 0, bubbleUs: 3, ghosts: 1, onLine: false }))
    const base = loopView(initState(buildLevel('first-4-par', 1)))
    const long: LoopView = { ...base, fires: list, clockUs: 7 * 3000 + 2, step: 3000, waiting: Array.from({ length: 200 }, (_, i) => i) } // not seeds: 200 requests in the queue
    for (const orientation of ORIENTATIONS) expect(markCount(layoutFrame(long, { orientation }))).toBeLessThan(200)
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
        const markup = svgMarkup(frameSvg(layoutFrame(loopView(state), { orientation })))
        for (const [, name] of markup.matchAll(/var\(--es-([a-z0-9-]+)\)/g)) used.add(name)
        expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
        expect(markup).not.toMatch(/\b(?:rgba?|hsla?|oklch|hwb|lab|lch)\(/i)
        expect(markup).not.toMatch(/Doto|Handjet|Atkinson|Big Shoulders|Permanent Marker|sans-serif|monospace|Arial|Helvetica/)
        // Every paint attribute is a custom property or `none`: nothing is a keyword colour.
        for (const [, value] of markup.matchAll(/\b(?:fill|stroke)="([^"]*)"/g)) expect(value === 'none' || /^var\(--es-[a-z0-9-]+\)$/.test(value)).toBe(true)
      }
    }
    for (const name of used) expect([name, Object.hasOwn(ROLES, name)]).toEqual([name, true])
    // The drawing's materials: the lamp, the steel's three tones and its edge, the paper and its two inks and rule, the masking tape and
    // its marker, and the printer's dots.
    for (const name of ['lamp', 'surface-1', 'surface-2', 'surface-3', 'edge', 'paper', 'paper-ink', 'paper-ink-2', 'paper-rule', 'tape', 'tape-ink', 'font-numeric', 'font-ticket', 'font-label']) expect([name, used.has(name)]).toEqual([name, true])
  })

  test('no state takes a code colour, and the amber stays over the pass: the lamp lights only its pool', () => {
    for (const overlap of [false, true]) {
      for (const state of statesOfHouseNight(buildLevel('first-4-par', 1), { overlap })) {
        for (const orientation of ORIENTATIONS) {
          for (const layer of layoutFrame(loopView(state), { orientation }).layers) {
            for (const mark of layer.marks) {
              const paints = mark.kind === 'text' ? [mark.fill] : [mark.fill, mark.stroke]
              expect(paints.some((paint) => paint === 'lane-gpu')).toBe(false)
              if (paints.some((paint) => paint === 'lamp')) expect(layer.part).toBe('lamp')
            }
          }
        }
      }
    }
  })
})

describe('the pass from above, in its own materials (W0 finding F1)', () => {
  test('a ticket on the rail holds a hotel pan in its station\'s well, a rim round a recessed floor with its number on tape; an empty clip leaves the well bare and dark', () => {
    const view = loopView(step(fill(initState(buildLevel(POSTER_LEVEL, POSTER_SEED)), 2)))
    const line = marksOf(layoutFrame(view), 'line')
    // Two pans: each a rim of raised steel with its edge, a floor a shade down, the far wall's shadow and the near rim's light.
    const rims = line.filter((mark) => mark.kind === 'rect' && mark.fill === 'surface-1' && mark.stroke === 'edge' && mark.rx === 6)
    const floors = line.filter((mark) => mark.kind === 'rect' && mark.fill === 'surface-2' && mark.rx === 3)
    expect([rims.length, floors.length]).toEqual([2, 2])
    expect(line.filter((mark) => mark.kind === 'rect' && mark.fill === 'tape')).toHaveLength(2)
    expect(texts(line.filter((mark) => mark.kind === 'text' && mark.face === 'label'))).toEqual([ticketNo(0), ticketNo(1)])
    // The other two wells are bare: a dark hole in the counter.
    expect(line.filter((mark) => mark.kind === 'rect' && mark.fill === 'surface-3' && mark.rx === 5)).toHaveLength(2)
  })

  test('the burners: a ring on every station, its core struck solid where the latest fire cooked a course and open where the clip rode empty', () => {
    const view = loopView(step(fill(initState(buildLevel(POSTER_LEVEL, POSTER_SEED)), 2)))
    const line = marksOf(layoutFrame(view), 'line')
    expect(line.filter((mark) => mark.kind === 'circle' && mark.fill === 'text-1')).toHaveLength(2)
    expect(line.filter((mark) => mark.kind === 'circle' && mark.fill === 'none' && mark.stroke === 'text-1')).toHaveLength(4)
  })

  test('the plates of the last fire read back lie on the pass under their clips: a plate, an empty place\'s dark ring, a binned plate struck in red', () => {
    const view = loopView(step(fill(initState(buildLevel(POSTER_LEVEL, POSTER_SEED)), 2)))
    const plates = marksOf(layoutFrame(view), 'plates')
    expect(plates.filter((mark) => mark.kind === 'circle' && mark.fill === 'paper')).toHaveLength(2)
    expect(plates.filter((mark) => mark.kind === 'circle' && mark.stroke === 'surface-3' && mark.dash !== undefined)).toHaveLength(2)
    // A binned plate: a night with overlap, after a ticket has asked for the check.
    for (const state of statesOfHouseNight(buildLevel('first-4-par', 1), { overlap: true })) {
      const night = loopView(state)
      const served = [...night.fires].reverse().find((fire) => !fire.onLine)
      if (!served?.places.some((place) => place.state === 'binned')) continue
      const binned = marksOf(layoutFrame(night), 'plates').filter((mark) => mark.kind === 'circle' && mark.stroke === 'paper-ink-2')
      expect(binned.length).toBe(served.places.filter((place) => place.state === 'binned').length)
      return
    }
    throw new Error('no binned plate in the house\'s night')
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
      const frame = layoutFrame(view)
      const markup = svgMarkup(frameSvg(frame))
      for (const word of ['PLATE', 'EMPTY', 'BINNED', 'PLAN', 'READ', 'TICKS', 'SYNTHETIC']) expect(markup).not.toContain(`>${word}`)
      expect(markup).toContain('>THE LINE · GPU</text>')
      expect(markup).toContain('>THE EXPO · CPU</text>')
      expect(frame.layers.map((layer) => layer.part)).not.toContain('clock')
      // The only numbers drawn are tickets' numbers and the printer's count of what it still holds.
      for (const text of texts(frame.layers.flatMap((layer) => layer.marks))) if (/\d/.test(text)) expect(text).toMatch(/^\+?\d{1,3}$/)
    }
  })
})

describe('the drawing stays inside its frame', () => {
  const insideOf = (frame: Frame, mark: Mark): boolean => {
    const within = (x: number, y: number, slack = 2) => x >= -slack && y >= -slack && x <= frame.width + slack && y <= frame.height + slack
    switch (mark.kind) {
      case 'rect':
        return within(mark.x, mark.y) && within(mark.x + mark.w, mark.y + mark.h)
      case 'line':
        return within(mark.x1, mark.y1) && within(mark.x2, mark.y2)
      case 'circle':
        return within(mark.cx - mark.r, mark.cy - mark.r) && within(mark.cx + mark.r, mark.cy + mark.r)
      case 'text':
        return within(mark.x, mark.y, 0)
    }
  }

  test('every mark of every state of a night lies in the frame, in both orientations', () => {
    for (const overlap of [false, true]) {
      for (const state of statesOfHouseNight(buildLevel('first-4-par', 1), { overlap })) {
        for (const orientation of ORIENTATIONS) {
          const frame = layoutFrame(loopView(state), { orientation })
          for (const layer of frame.layers) for (const mark of layer.marks) expect([orientation, layer.part, mark, insideOf(frame, mark)]).toEqual([orientation, layer.part, mark, true])
        }
      }
    }
  })

  test('a frame is the box that the page reserves: its size is the viewBox\'s and never changes with the night, so nothing moves when it is drawn', () => {
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
    expect(layoutFrame(first, { orientation: 'portrait' }).width).toBe(360)
    expect(layoutFrame(first).width).toBe(720)
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
