/*
 * W0-T16 acceptance checks 3 and 4: the poster SVG equals the 2D view's first frame (both from one pure function), and the 2D view
 * stays at or under 2,000 SVG marks in its default window (A§6.3, A§6.11, GAMES.md §3 "2D path").
 *
 * The poster is `scripts/posters.ts`: the practice seed of the first level as a view, laid out and written as SVG text. The 2D view is
 * `View2D`, which draws the same tree as React elements. The first group renders the real component on the server and cuts the
 * <svg> out of its markup, so what is compared is what the page paints and not a second copy of the code. The rest hold the layout to
 * its promises: it paints with token roles and nothing else, it stays in its frame and under its cap, and its window moves by whole fires.
 *
 * Measured by the first group of the cap test [measured 2026-11-04 at a5907b1]: at most 281 marks in 236 frames of the four levels, in
 * both orientations and with overlap on and off, against the cap of 2,000. The two posters are 78 and 57 marks, and 9,545 and 7,205 bytes.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ROLES } from '@/design/tokens'
import { svgToReact } from '@/games/loop/svg'
import { View2D } from '@/games/loop/View2D'
import { hang, initState, step } from '@es/play/loop/engine'
import { DETAIL_FIRES, MARK_CAP, MIRROR_TICKS, PAINTS, STRIP, WINDOW_TICKS, frameSvg, layoutFrame, layoutStrip, markCount, ticketNo, windowOf } from '@es/play/loop/layout'
import type { Frame, Mark, Orientation } from '@es/play/loop/layout'
import { firesOfRun } from '@es/play/loop/compare'
import { buildLevel, services } from '@es/play/loop/levels'
import { loopView } from '@es/play/loop/session'
import { countMarks, escapeText, svgMarkup } from '@es/play/loop/svg'
import type { SvgNode } from '@es/play/loop/svg'
import type { FireView, LoopView, PlaceView } from '@es/play/loop/types'
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

  test('the poster is the same for every visitor: drawing it twice, and from a rebuilt level, gives the same text', () => {
    expect(renderPosters().map((poster) => poster.svg)).toEqual(renderPosters().map((poster) => poster.svg))
  })

  test('the committed posters under public/posters are what the code draws now (`bun scripts/posters.ts --check`)', () => {
    expect(stalePosters()).toEqual([])
  })

  test('the first frame is the empty rail with six tickets waiting, and every state of it is a drawn mark the poster can show without script', () => {
    const [landscape] = renderPosters()
    expect(landscape.svg).toContain('role="img"')
    expect(landscape.svg).toContain('aria-label="Fill the rail. The rail has 4 clips and 0 are hung. 6 tickets wait.')
    for (const no of ['01', '02', '03', '04', '05', '06']) expect(landscape.svg).toContain(`>${no}</text>`)
    expect(landscape.svg.match(/>empty<\/text>/g)).toHaveLength(4)
  })
})

describe('the 2D view stays at or under 2,000 SVG marks in its default window', () => {
  test('across every state of a night on every level, in both orientations and with overlap on and off', () => {
    let most = 0
    let frames = 0
    for (const id of ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par'] as const) {
      for (const overlap of [false, true]) {
        // The overlap switch is not on the panel in the first two levels.
        if (overlap && buildLevel(id, 1).overlap === 'locked') continue
        for (const state of statesOfHouseNight(buildLevel(id, 1), { overlap })) {
          for (const orientation of ORIENTATIONS) {
            const marks = markCount(layoutFrame(loopView(state), { orientation }))
            most = Math.max(most, marks)
            frames += 1
          }
        }
      }
    }
    console.log(`2D view marks: at most ${most} in ${frames} frames of the four levels (cap ${MARK_CAP})`)
    expect(frames).toBeGreaterThan(200)
    expect(most).toBeLessThanOrEqual(MARK_CAP)
  })

  /** A night of `fires` fires, each 4 ticks, on a rail of four, with `waiting` tickets waiting: made by hand, far longer than the world's. */
  function longNight(fires: number, waiting: number): LoopView {
    const places: PlaceView[] = [
      { state: 'plate', req: 1 },
      { state: 'binned', req: 2 },
      { state: 'empty', req: null },
      { state: 'plate', req: 3 },
    ]
    const list: FireView[] = Array.from({ length: fires }, (_, index) => ({ index, startUs: 2 + index * 7, endUs: 6 + index * 7, places, admits: 0, bubbleUs: 3, ghosts: 1, onLine: false }))
    const base = loopView(initState(buildLevel('first-4-par', 1)))
    return { ...base, fires: list, clockUs: 7 * fires + 2, step: fires, waiting: Array.from({ length: waiting }, (_, i) => i), cpu: list.flatMap((fire) => [{ step: fire.index, kind: 'schedule' as const, startUs: fire.startUs - 2, endUs: fire.startUs }]) }
  }

  test('a night far longer than any of the world\'s stays under the cap: the window shows the last ticks, and the mirror\'s rows are the same fires', () => {
    const view = longNight(300, 200)
    for (const orientation of ORIENTATIONS) {
      const frame = layoutFrame(view, { orientation })
      expect(markCount(frame), orientation).toBeLessThanOrEqual(MARK_CAP)
      const shown = windowOf(view, WINDOW_TICKS[orientation])
      expect(shown.fires.length + shown.hidden).toBe(300)
      expect(shown.fires.length).toBeLessThan(20)
    }
  })

  test('a window too long for the cap loses its numbers, then its places, then its oldest fires, and the cap holds for any night', () => {
    const marksOf = (frame: Frame, kind: Mark['kind']) => frame.layers.flatMap((layer) => layer.marks).filter((mark) => mark.kind === kind).length
    // 500 fires in a window of 3,600 ticks: drawn in full they would pass the cap by a long way, with every fire a slab, up to 4 places and a label.
    const view = longNight(500, 0)
    expect(windowOf(view, 3600).fires).toHaveLength(500)
    const wide = layoutFrame(view, { windowTicks: 3600 })
    expect(markCount(wide)).toBeLessThanOrEqual(MARK_CAP)
    // Fires older than the last 48 are slabs, so what is left of the places is at most those of 48 fires.
    expect(DETAIL_FIRES).toBe(48)
    expect(marksOf(wide, 'rect')).toBeLessThan(MARK_CAP)
    // The night's tape stamps the clock only where the last stamp leaves room, so a long window never crowds it.
    expect(wide.layers.find((layer) => layer.part === 'clock')?.marks.length).toBeLessThanOrEqual(40)
    // A night so long that even slabs pass the cap is cut to its last fires.
    const huge = longNight(3000, 0)
    const cut = layoutFrame(huge, { windowTicks: 21000 })
    expect(markCount(cut)).toBeLessThanOrEqual(MARK_CAP)
    expect(markCount(cut)).toBeGreaterThan(100)
  })

  test('the default window is a window of the same drawing: its scale is 8 units a tick in landscape and 5 in portrait, and a longer window shrinks it to fit', () => {
    const view = loopView(initState(buildLevel('first-4-par', 1)))
    const lane = (frame: Frame) => frame.layers.find((layer) => layer.part === 'gpu')?.marks[0]
    const landscape = lane(layoutFrame(view)) as Extract<Mark, { kind: 'rect' }>
    const portrait = lane(layoutFrame(view, { orientation: 'portrait' })) as Extract<Mark, { kind: 'rect' }>
    expect([landscape.w, portrait.h]).toEqual([608, 200])
    expect([landscape.w / WINDOW_TICKS.landscape, portrait.h / WINDOW_TICKS.portrait]).toEqual([8, 5])
    const longer = lane(layoutFrame(view, { windowTicks: 152 })) as Extract<Mark, { kind: 'rect' }>
    expect(longer.w).toBe(608)
  })
})

describe('the drawing paints with token roles and nothing else', () => {
  test('every role the layout paints with is a role of src/design/tokens.ts', () => {
    expect(PAINTS.length).toBeGreaterThan(10)
    for (const role of PAINTS) expect([role, Object.hasOwn(ROLES, role)]).toEqual([role, true])
    for (const font of ['font-numeric', 'font-body']) expect(Object.hasOwn(ROLES, font)).toBe(true)
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
    // The drawing uses most of the roles it declares: the lamp, the expo's boards, the paper of the plates and the tape, the ribbon's
    // red of a binned plate and the stamp, the deep steel of the wells, the masking tape and its marker, and the dots of the printer.
    for (const name of ['lamp', 'lane-cpu', 'lane-sync', 'paper', 'paper-ink-2', 'surface-3', 'tape', 'tape-ink', 'font-numeric', 'font-label']) expect(used.has(name)).toBe(true)
  })

  test('no state takes a code colour, and the amber stays on the pass: the line has no green, and the lamp lights only its pool', () => {
    for (const overlap of [false, true]) {
      for (const state of statesOfHouseNight(buildLevel('first-4-par', 1), { overlap })) {
        for (const orientation of ORIENTATIONS) {
          const frame = layoutFrame(loopView(state), { orientation })
          for (const layer of frame.layers) {
            for (const mark of layer.marks) {
              const paints = mark.kind === 'text' ? [mark.fill] : [mark.fill, mark.stroke]
              // The code colours mark only what a board is: the expo's plan and read. Nothing on the line, and no state, takes one.
              expect(paints.some((paint) => paint === 'lane-gpu')).toBe(false)
              if (paints.some((paint) => paint === 'lane-cpu' || paint === 'lane-sync')) expect(layer.part).toBe('cpu')
              if (paints.some((paint) => paint === 'lamp')) expect(layer.part).toBe('lamp')
            }
          }
        }
      }
    }
  })
})

describe('the line is the kitchen\'s own surfaces', () => {
  /** The marks of one layer of a frame. */
  const marksOf = (frame: Frame, part: string): readonly Mark[] => frame.layers.find((layer) => layer.part === part)?.marks ?? []
  const texts = (marks: readonly Mark[]) => marks.flatMap((mark) => (mark.kind === 'text' ? [mark.text] : []))

  test('a ticket holds a hotel pan in its clip\'s well, labelled with its number in marker on masking tape; an empty clip leaves an open groove', () => {
    // Two tickets hung and fired: a pan for each, in the first two wells, and the other two clips rode empty.
    let state = initState(buildLevel(POSTER_LEVEL, POSTER_SEED))
    for (const req of state.waiting.slice(0, 2)) state = hang(state, req)
    const view = loopView(step(state))
    const line = marksOf(layoutFrame(view), 'gpu')
    const tape = line.filter((mark) => mark.kind === 'rect' && mark.fill === 'tape')
    expect(tape).toHaveLength(2)
    const words = line.filter((mark) => mark.kind === 'text' && mark.face === 'label')
    expect(texts(words)).toEqual([ticketNo(0), ticketNo(1)])
    // Two plates on the pans, and two open grooves where the clips rode empty, each as long as the fire cooked.
    const fire = view.fires[0]
    const plates = line.filter((mark) => mark.kind === 'rect' && mark.fill === 'paper' && mark.stroke === 'paper-rule' && mark.width === 0.75)
    const grooves = line.filter((mark) => mark.kind === 'rect' && mark.fill === 'surface-3' && mark.stroke === 'surface-2')
    expect([plates.length, grooves.length]).toEqual([2, 2])
    for (const place of [...plates, ...grooves]) if (place.kind === 'rect') expect(place.w).toBeCloseTo((fire.endUs - fire.startUs) * 8 - 4)
  })

  test('the clock is the night\'s tape: a strip of paper stamped in red that the ticks are synthetic, and the clock in dots at each fire', () => {
    const view = loopView(houseNight(buildLevel(POSTER_LEVEL, POSTER_SEED), { overlap: false }))
    for (const orientation of ORIENTATIONS) {
      const clock = marksOf(layoutFrame(view, { orientation }), 'clock')
      expect(clock[0]).toMatchObject({ kind: 'rect', fill: 'paper' })
      const stamp = clock.filter((mark) => mark.kind === 'text' && mark.fill === 'paper-ink-2')
      expect(texts(stamp).join(' ')).toMatch(/TICKS.*SYNTHETIC/)
      const stamps = clock.filter((mark) => mark.kind === 'text' && mark.face === 'numeric')
      expect(texts(stamps)[0]).toBe('0')
      for (const text of texts(stamps).slice(1)) expect(view.fires.map((fire) => String(fire.startUs))).toContain(text)
      // A tape, not an axis: no tick marks, only the perforation along its edge.
      expect(clock.filter((mark) => mark.kind === 'line')).toHaveLength(1)
    }
  })

  test('no legend: the drawing names its lanes on tape and lets its objects say what they are', () => {
    const markup = svgMarkup(frameSvg(layoutFrame(first)))
    for (const word of ['PLATE', 'EMPTY', 'BINNED', 'PLAN', 'READ']) expect(markup).not.toContain(`>${word}</text>`)
    expect(markup).toContain('>THE LINE · GPU</text>')
    expect(markup).toContain('>THE EXPO · CPU</text>')
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

  test('a frame is the box that the page reserves: its width and height are the viewBox\'s, so nothing moves when the drawing arrives', () => {
    for (const orientation of ORIENTATIONS) {
      const frame = layoutFrame(first, { orientation })
      const svg = svgMarkup(frameSvg(frame))
      expect(svg).toContain(`viewBox="0 0 ${frame.width} ${frame.height}"`)
      expect(svg).toContain(`width="${frame.width}" height="${frame.height}"`)
    }
    expect(layoutFrame(first, { orientation: 'portrait' }).width).toBe(360)
    expect(layoutFrame(first).width).toBe(720)
  })

  test('ticket numbers are the id plus one, two digits', () => {
    expect([0, 8, 11].map(ticketNo)).toEqual(['01', '09', '12'])
  })
})

describe('the window moves by whole fires', () => {
  const level = buildLevel('first-4-par', 1)
  const states = [...statesOfHouseNight(level, { overlap: false })]
  const last = loopView(states[states.length - 1])

  test('while the night fits it starts at 0, and nothing is hidden', () => {
    const early = loopView(states[6])
    expect(early.clockUs).toBeLessThanOrEqual(WINDOW_TICKS.landscape)
    expect(windowOf(early, WINDOW_TICKS.landscape)).toMatchObject({ startUs: 0, hidden: 0 })
  })

  test('after that it starts at the plan of the oldest fire that lets the night end inside the window, and the older fires are counted, not drawn', () => {
    const shown = windowOf(last, WINDOW_TICKS.landscape)
    expect(last.clockUs).toBeGreaterThan(WINDOW_TICKS.landscape)
    expect(shown.hidden).toBeGreaterThan(0)
    expect(shown.fires.length + shown.hidden).toBe(last.fires.length)
    const plan = last.cpu.find((span) => span.step === shown.fires[0].index && span.kind === 'schedule')
    expect(shown.startUs).toBe(plan?.startUs)
    expect(last.clockUs - shown.startUs).toBeLessThanOrEqual(WINDOW_TICKS.landscape)
    // The oldest fire kept starts no earlier than the window: the one before it would not have fitted.
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

  test('the mirror\'s window is the larger of the two the drawing uses, so it names every fire either shows', () => {
    expect(MIRROR_TICKS).toBe(Math.max(WINDOW_TICKS.landscape, WINDOW_TICKS.portrait))
    const wide = windowOf(last, MIRROR_TICKS)
    for (const orientation of ORIENTATIONS) {
      const drawn = windowOf(last, WINDOW_TICKS[orientation])
      for (const fire of drawn.fires) expect(wide.fires).toContain(fire)
    }
  })

  test('the layout is a function of the view and the options: the same inputs give the same frame, and the options do change it', () => {
    const view = loopView(states[10])
    expect(layoutFrame(view)).toEqual(layoutFrame(view))
    expect(layoutFrame(view, { orientation: 'portrait' })).not.toEqual(layoutFrame(view))
    expect(markCount(layoutFrame(last, { windowTicks: 20 }))).toBeLessThan(markCount(layoutFrame(last, { windowTicks: 76 })))
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
    const farthest = (clock: number) => {
      const frame = layoutStrip(firesOfRun(s.refillAlone), { slots: 4, scaleTicks, label: 'x' })
      const slabs = frame.layers[0].marks.filter((mark) => mark.kind === 'rect' && mark.fill === 'lane-gpu')
      return Math.max(...slabs.map((mark) => (mark.kind === 'rect' ? mark.x + mark.w : 0))) * (clock / s.refillAlone.summary.clockUs)
    }
    expect(farthest(s.refillAlone.summary.clockUs)).toBeGreaterThan(300)
    const par = layoutStrip(firesOfRun(s.par), { slots: 4, scaleTicks, label: 'x' })
    const refill = layoutStrip(firesOfRun(s.refillAlone), { slots: 4, scaleTicks, label: 'x' })
    const reach = (frame: Frame) => Math.max(...frame.layers[0].marks.flatMap((mark) => (mark.kind === 'rect' && mark.fill === 'lane-gpu' ? [mark.x + mark.w] : [])))
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
    const frame = layoutFrame(view)
    expect(svgMarkup(frameSvg(frame)).match(/>empty<\/text>/g)).toHaveLength(1)
  })
})
