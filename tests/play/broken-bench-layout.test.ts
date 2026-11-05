/*
 * W1-T33: the 2D view is a first-class rendering of the same kitchen, never a chart (GAMES.md §11 "2D design", §2.6 "The Inspection";
 * W0's finish review turned a chart away). These tests hold the sheets to that:
 *   - they paint with token roles and nothing else, and amber only as the lamp's pool over the order that is the present;
 *   - their text is the ticks of a ruler, an order's number, and names on masking tape, never a count or a time (those are DOM);
 *   - they stay in their frame, under the cap of 2,000 marks (A§6.4), in both orientations;
 *   - the flags on the histogram never lie on one another, however close the numbers they flag;
 *   - the SVG is what the page paints: the React view writes the markup that `sheetSvg` writes.
 *
 * Measured by the cap test [measured 2026-11-04 on this task's branch]: see the line it prints.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ROLES } from '@/design/tokens'
import { Plot } from '@/games/broken-bench/Plot'
import { rngFor } from '@es/sim/core'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import { caseOf } from '@es/play/broken-bench/cases'
import { harnessDesk, latencyUs, readingOf } from '@es/play/broken-bench/desk'
import { MARK_CAP, MAX_DOTS, PAINTS, edgeLabel, layoutHistogram, layoutTimeline, markCount, orderNo, sheetSvg, stretchStart } from '@es/play/broken-bench/layout'
import type { Mark, Orientation, Paint, Sheet } from '@es/play/broken-bench/layout'
import { svgMarkup } from '@es/play/broken-bench/svg'
import type { CaseSlot, SceneView } from '@es/play/broken-bench/types'

const ORIENTATIONS: readonly Orientation[] = ['landscape', 'portrait']

/** Two cases of each flaw. */
const slots: CaseSlot[] = BENCH_FLAWS.flatMap((flaw, i) => [{ seed: 40 + i, flaw }, { seed: 80 + i, flaw }])
const scenes: SceneView[] = slots.map((slot) => caseOf(slot).scene)

function histogramOf(scene: SceneView, orientation: Orientation, over: Partial<Parameters<typeof layoutHistogram>[0]> = {}): Sheet {
  const desk = harnessDesk(scene.claim.timerStartsAt, scene.harnessCut)
  return layoutHistogram({
    orientation,
    latencies: scene.rows.map((row) => latencyUs(row, desk.clock)),
    cut: desk.cut,
    selected: Math.floor(scene.rows.length / 2),
    claimUs: scene.claim.valueUs,
    p99Us: readingOf(scene.rows, desk).p99Us,
    ...over,
  })
}

const everySheet = (): { name: string; sheet: Sheet }[] =>
  scenes.flatMap((scene, i) =>
    ORIENTATIONS.flatMap((orientation) => [
      { name: `${slots[i].flaw}#${slots[i].seed} histogram ${orientation}`, sheet: histogramOf(scene, orientation) },
      { name: `${slots[i].flaw}#${slots[i].seed} timeline ${orientation}`, sheet: layoutTimeline({ orientation, rows: scene.rows, selected: Math.floor(scene.rows.length / 3) }) },
    ]),
  )

const marksOf = (sheet: Sheet, part?: string): Mark[] => sheet.layers.filter((layer) => part === undefined || layer.part === part).flatMap((layer) => [...layer.marks])
const paintsOf = (mark: Mark): Paint[] => {
  switch (mark.kind) {
    case 'rect':
    case 'circle':
    case 'line':
    case 'path':
      return [mark.fill, mark.stroke].filter((paint): paint is Paint => paint !== undefined)
    case 'text':
      return [mark.fill]
  }
}

describe('the drawing paints with the design system\'s roles', () => {
  test('every role it names is a role of src/design/tokens.ts', () => {
    const real = new Set(Object.keys(ROLES))
    for (const paint of PAINTS) expect([paint, real.has(paint)]).toEqual([paint, true])
  })

  test('every mark of every sheet uses a role of the list, or none', () => {
    const allowed = new Set<string>([...PAINTS, 'none'])
    for (const { name, sheet } of everySheet()) for (const mark of marksOf(sheet)) for (const paint of paintsOf(mark)) expect([name, paint, allowed.has(paint)]).toEqual([name, paint, true])
  })

  test('the markup holds no literal colour and no face but the two of the design system', () => {
    for (const { name, sheet } of everySheet().slice(0, 12)) {
      const markup = svgMarkup(sheetSvg(sheet))
      expect([name, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(/.test(markup)]).toEqual([name, false])
      for (const face of markup.matchAll(/font-family="([^"]*)"/g)) expect(['var(--es-font-numeric)', 'var(--es-font-label)']).toContain(face[1])
      for (const fill of markup.matchAll(/(?:fill|stroke)="([^"]*)"/g)) expect([name, fill[1] === 'none' || /^var\(--es-[a-z0-9-]+\)$/.test(fill[1])]).toEqual([name, true])
    }
  })

  test('amber is the lamp\'s pool and ring over the present order, and nothing else is amber (One Lamp)', () => {
    for (const { name, sheet } of everySheet()) {
      for (const layer of sheet.layers) {
        const lit = layer.marks.some((mark) => paintsOf(mark).some((paint) => paint === 'lamp' || paint === 'lamp-ring'))
        expect([name, layer.part, lit && layer.part !== 'present']).toEqual([name, layer.part, false])
      }
      expect(sheet.layers.filter((layer) => layer.part === 'present')).toHaveLength(1)
    }
  })

  test('with nothing selected no lamp is lit', () => {
    for (const orientation of ORIENTATIONS) {
      expect(histogramOf(scenes[0], orientation, { selected: null }).layers.some((layer) => layer.part === 'present')).toBe(false)
      expect(layoutTimeline({ orientation, rows: scenes[0].rows, selected: null }).layers.some((layer) => layer.part === 'present')).toBe(false)
    }
  })
})

describe('what the drawing writes', () => {
  test('is the ticks of a ruler, an order\'s number and names on tape, and not a count or a time: no mark is a figure of the report', () => {
    for (const { name, sheet } of everySheet()) {
      for (const mark of marksOf(sheet)) {
        if (mark.kind !== 'text') continue
        const text = mark.text
        const ok =
          /^[A-Z][A-Z .,'-]*$/.test(text) || // names on tape: REPORTED, AT DESK, CUT, SECONDS, EACH ORDER, DUE TO DONE
          /^\d{4}$/.test(text) || // an order's number
          /^\d+(\.\d+)? (ms|s)$/.test(text) || // a ruler's edge on the histogram
          /^\d+(\.\d+)?$/.test(text) // a tick in seconds on the timeline, or a stack's tally
        expect([name, text, ok]).toEqual([name, text, true])
      }
    }
  })

  test('puts a stack\'s tally in the printer\'s face, a name in marker, and nothing else in either', () => {
    for (const mark of marksOf(histogramOf(scenes[3], 'landscape'))) {
      if (mark.kind !== 'text') continue
      expect(mark.face).toBe(/^[A-Z][A-Z .]*$/.test(mark.text) && !/^\d/.test(mark.text) ? 'label' : 'numeric')
    }
  })

  test('prints an edge the way the printer does: milliseconds under a second, seconds above, and an order\'s number in four digits', () => {
    expect([10_000, 18_000, 560_000, 1_000_000, 1_800_000, 100_000_000].map(edgeLabel)).toEqual(['10 ms', '18 ms', '560 ms', '1 s', '1.8 s', '100 s'])
    expect([0, 8, 99, 999, 9998].map(orderNo)).toEqual(['0001', '0009', '0100', '1000', '9999'])
  })
})

describe('the histogram', () => {
  const scene = scenes[0]

  test('flags the report\'s number, and the desk\'s, the corrected one and the learner\'s only when it is told them', () => {
    const names = (sheet: Sheet) =>
      marksOf(sheet, 'flags')
        .filter((mark): mark is Extract<Mark, { kind: 'text' }> => mark.kind === 'text')
        .map((mark) => mark.text)
        .sort()
    expect(names(histogramOf(scene, 'landscape', { p99Us: null, cut: 0 }))).toEqual(['REPORTED'])
    expect(names(histogramOf(scene, 'landscape', { cut: 0 }))).toEqual(['AT DESK', 'REPORTED'])
    expect(names(histogramOf(scene, 'landscape', { cut: 0, correctedUs: 500_000, yoursUs: 700_000 }))).toEqual(['AT DESK', 'CORRECTED', 'REPORTED', 'YOURS'])
    expect(names(histogramOf(scene, 'portrait', { cut: 12 }))).toEqual(['AT DESK', 'CUT', 'REPORTED'])
  })

  test('never lays one flag\'s tape on another\'s, however close the numbers, and keeps every tape inside the sheet', () => {
    for (const orientation of ORIENTATIONS) {
      for (const gap of [0, 1, 1000, 20_000, 100_000, 2_000_000]) {
        const base = scene.claim.valueUs
        const sheet = histogramOf(scene, orientation, { cut: 0, p99Us: base + gap, correctedUs: base + 2 * gap, yoursUs: base + 3 * gap })
        const flags = sheet.layers.find((layer) => layer.part === 'flags')?.marks ?? []
        const tapes: { name: string; y: number; h: number }[] = []
        flags.forEach((mark, i) => {
          const next = flags[i + 1]
          if (mark.kind === 'rect' && mark.fill === 'tape' && next?.kind === 'text' && next.text !== 'CUT') tapes.push({ name: next.text, y: mark.y, h: mark.h })
        })
        expect(tapes.map((tape) => tape.name).sort()).toEqual(['AT DESK', 'CORRECTED', 'REPORTED', 'YOURS'])
        tapes.sort((a, b) => a.y - b.y)
        for (let i = 0; i < tapes.length; i++) {
          expect([orientation, gap, tapes[i].name, tapes[i].y >= 0 && tapes[i].y + tapes[i].h <= sheet.height]).toEqual([orientation, gap, tapes[i].name, true])
          if (i > 0) expect([orientation, gap, tapes[i].name, tapes[i].y >= tapes[i - 1].y + tapes[i - 1].h]).toEqual([orientation, gap, tapes[i].name, true])
        }
      }
    }
  })

  test('draws the orders the cut leaves out hollow and the others solid, and the cut as a dashed line on its tape', () => {
    const cut = 20
    const sheet = histogramOf(scene, 'landscape', { cut })
    const dots = sheet.layers.find((layer) => layer.part === 'dots')?.marks ?? []
    const squares = (d: string) => (d.match(/M/g) ?? []).length
    const hollow = dots.filter((mark): mark is Extract<Mark, { kind: 'path' }> => mark.kind === 'path' && mark.fill === 'paper')
    const solid = dots.filter((mark): mark is Extract<Mark, { kind: 'path' }> => mark.kind === 'path' && mark.fill === 'paper-ink')
    expect(hollow).toHaveLength(1)
    expect(solid).toHaveLength(1)
    expect(squares(hollow[0].d)).toBe(cut)
    expect(squares(solid[0].d)).toBe(scene.rows.length - cut)
    const flags = marksOf(sheet, 'flags')
    expect(flags.some((mark) => mark.kind === 'line' && mark.dash === '4 3')).toBe(true)
    expect(flags.some((mark) => mark.kind === 'text' && mark.text === 'CUT')).toBe(true)
    expect(marksOf(histogramOf(scene, 'landscape', { cut: 0 }), 'flags').some((mark) => mark.kind === 'text' && mark.text === 'CUT')).toBe(false)
  })

  test('thins a long log to MAX_DOTS dots but never loses the slow ones, which a p99 is about', () => {
    const rng = rngFor(5, 'test/broken-bench/long-log')
    const latencies = Array.from({ length: 9000 }, () => 40_000 + (rng() % 160_000))
    for (const slow of [123, 4567, 8999]) latencies[slow] = 30_000_000 + slow
    const sheet = layoutHistogram({ latencies, cut: 0, selected: null, claimUs: 200_000 })
    const dots = marksOf(sheet, 'dots').filter((mark): mark is Extract<Mark, { kind: 'path' }> => mark.kind === 'path')
    const drawn = dots.reduce((total, mark) => total + (mark.d.match(/M/g) ?? []).length, 0)
    const slowest = [...latencies].sort((a, b) => b - a).slice(0, Math.floor(9000 * 0.05))
    expect(drawn).toBeLessThan(MAX_DOTS + slowest.length + 1)
    expect(drawn).toBeGreaterThanOrEqual(slowest.length)
    expect(markCount(sheet)).toBeLessThanOrEqual(MARK_CAP)
  })

  test('is cut to the log\'s own range: a log between 40 and 300 ms is not drawn in its bottom corner', () => {
    const latencies = Array.from({ length: 300 }, (_, i) => 40_000 + i * 870)
    const sheet = layoutHistogram({ latencies, cut: 0, selected: null, claimUs: 150_000 })
    const edges = marksOf(sheet, 'ruler').filter((mark): mark is Extract<Mark, { kind: 'text' }> => mark.kind === 'text').map((mark) => mark.text)
    expect(edges.length).toBeGreaterThanOrEqual(6)
    expect(edges).not.toContain('560 s')
    expect(edges).not.toContain('10 ms')
  })

  test('a tap on an order\'s slip is possible on the timeline and not on the histogram, whose dots are a picture of the whole log', () => {
    expect(marksOf(histogramOf(scene, 'landscape')).some((mark) => mark.kind === 'rect' && mark.row !== undefined)).toBe(false)
    expect(marksOf(layoutTimeline({ rows: scene.rows, selected: 5 })).some((mark) => mark.kind === 'rect' && mark.row !== undefined)).toBe(true)
  })
})

describe('the timeline', () => {
  const scene = scenes[2]
  const n = scene.rows.length

  test('shows a stretch of 32 orders that holds the selected one, held inside the log', () => {
    expect(stretchStart(1000, null, 32)).toBe(0)
    expect(stretchStart(1000, 0, 32)).toBe(0)
    expect(stretchStart(1000, 16, 32)).toBe(0)
    expect(stretchStart(1000, 17, 32)).toBe(1)
    expect(stretchStart(1000, 999, 32)).toBe(968)
    expect(stretchStart(10, 5, 32)).toBe(0)
    for (const selected of [null, 0, 7, Math.floor(n / 2), n - 1]) {
      const sheet = layoutTimeline({ rows: scene.rows, selected })
      const hits = marksOf(sheet, 'hits').filter((mark): mark is Extract<Mark, { kind: 'rect' }> => mark.kind === 'rect')
      expect(hits).toHaveLength(Math.min(32, n))
      const ids = hits.map((mark) => mark.row as number)
      for (let i = 1; i < ids.length; i++) expect(ids[i]).toBe(ids[i - 1] + 1)
      if (selected !== null) expect(ids).toContain(scene.rows[selected].id)
      expect(sheet.layers.some((layer) => layer.part === 'present')).toBe(selected !== null)
    }
  })

  test('draws the wait between the due time and the send as a dashed line, for the orders that were sent late, and it is the one dashed ink-2 stroke', () => {
    const co = caseOf({ seed: 41, flaw: 'coordinated-omission' }).scene
    let late = 0
    co.rows.forEach((row, i) => {
      if (row.sentUs - row.dueUs > co.rows[late].sentUs - co.rows[late].dueUs) late = i
    })
    expect(co.rows[late].sentUs - co.rows[late].dueUs).toBeGreaterThan(0)
    const sheet = layoutTimeline({ rows: co.rows, selected: late })
    const dashed = marksOf(sheet, 'slips').filter((mark) => mark.kind === 'path' && mark.stroke === 'paper-ink-2' && mark.dash !== undefined)
    expect(dashed).toHaveLength(1)
  })

  test('every drawn order has its hit rectangle inside the sheet and as wide as its row', () => {
    const sheet = layoutTimeline({ rows: scene.rows, selected: 3 })
    for (const mark of marksOf(sheet, 'hits')) {
      if (mark.kind !== 'rect') continue
      expect(mark.x).toBeGreaterThanOrEqual(0)
      expect(mark.x + mark.w).toBeLessThanOrEqual(sheet.width)
      expect(mark.y).toBeGreaterThanOrEqual(0)
      expect(mark.y + mark.h).toBeLessThanOrEqual(sheet.height)
      expect(mark.h).toBeGreaterThan(5)
    }
  })
})

describe('the sheets are within the cap and the frame', () => {
  test('under 2,000 marks, for every case and both orientations', () => {
    let most = 0
    let where = ''
    for (const { name, sheet } of everySheet()) {
      const marks = markCount(sheet)
      if (marks > most) {
        most = marks
        where = name
      }
      expect([name, marks <= MARK_CAP]).toEqual([name, true])
    }
    console.log(`  the sheets of ${scenes.length} cases in both orientations: at most ${most} marks (${where}), against the cap of ${MARK_CAP}`)
  })

  test('every mark lies inside its sheet\'s frame (a text can run past by the width of its tape, so only its anchor is held)', () => {
    for (const { name, sheet } of everySheet()) {
      for (const mark of marksOf(sheet)) {
        const points: [number, number][] =
          mark.kind === 'rect'
            ? mark.soft === true
              ? []
              : [[mark.x, mark.y], [mark.x + mark.w, mark.y + mark.h]]
            : mark.kind === 'line'
              ? [[mark.x1, mark.y1], [mark.x2, mark.y2]]
              : mark.kind === 'circle'
                ? [[mark.cx, mark.cy]]
                : mark.kind === 'text'
                  ? [[mark.x, mark.y]]
                  : []
        for (const [x, y] of points) expect([name, x >= 0 && x <= sheet.width && y >= 0 && y <= sheet.height]).toEqual([name, true])
      }
    }
  })
})

describe('the drawing is the page', () => {
  test('is a function of its inputs: the same sheet twice is the same markup, and only the lamp\'s blur takes the id', () => {
    const a = histogramOf(scenes[1], 'landscape')
    const b = histogramOf(scenes[1], 'landscape')
    expect(svgMarkup(sheetSvg(a))).toBe(svgMarkup(sheetSvg(b)))
    const one = svgMarkup(sheetSvg(a, 'one'))
    const two = svgMarkup(sheetSvg(a, 'two'))
    expect(one).not.toBe(two)
    expect(one.replaceAll('one', 'two')).toBe(two)
  })

  test('has the label of the drawing on its root, as an image', () => {
    const svg = svgMarkup(sheetSvg(histogramOf(scenes[1], 'landscape')))
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Graph paper.')
    expect(svg).toContain(`viewBox="0 0 ${histogramOf(scenes[1], 'landscape').width} ${histogramOf(scenes[1], 'landscape').height}"`)
  })

  test('the React view writes the markup that `sheetSvg` writes', () => {
    for (const sheet of [histogramOf(scenes[1], 'landscape'), histogramOf(scenes[1], 'portrait'), layoutTimeline({ rows: scenes[1].rows, selected: 9 })]) {
      const rendered = renderToStaticMarkup(h(Plot, { sheet }))
      const id = /id="(es-bench-pool-[A-Za-z0-9]+)"/.exec(rendered)?.[1]
      expect(id).toBeDefined()
      expect(rendered).toContain(svgMarkup(sheetSvg(sheet, id)))
    }
  })

  test('a sheet is a sentence to assistive technology: its label says what it shows, and the numbers are not in it but the count of orders', () => {
    const sheet = histogramOf(scenes[1], 'landscape')
    expect(sheet.label.startsWith('Graph paper.')).toBe(true)
    expect(sheet.label).toContain(`${scenes[1].rows.length} orders`)
    const timeline = layoutTimeline({ rows: scenes[1].rows, selected: 0 })
    expect(timeline.label).toMatch(/hollow notch/)
  })
})
