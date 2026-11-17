/*
 * Broken benchmark's page as markup, in the instrument frame (REDESIGN §2.6, §2.7, §3.5; GAMES.md §11; A§6.9, D-048, D-049): what the frame,
 * the chart, the report, the dock, the table and the result put on the page, rendered on the server so that the structure a screen reader and
 * a stylesheet get can be read. What needs a DOM, a focus, a viewport or a timer (the arrow keys across the flaws, focus moving on, the
 * live region as it speaks, the boxes in the first screen, a graded attempt's fresh seed) is walked in a browser by e2e/broken-bench.spec.ts.
 *
 *   - The frame: the title strip, the goal line with the pass rule, the chart with the switch over it and the report beside it, the legend,
 *     and in the dock the report form with the range rule printed above its fields.
 *   - The verdict word comes from the grade's data: Passed never sits over a body that says a report did not stand enough, nor Not yet over
 *     one that says every report stood.
 *   - No banned word or phrase in anything the page renders (src/copy/banned.ts).
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import { caseOf } from '@es/play/broken-bench/cases'
import { BENCH_COPY, BENCH_PARTS, COORDINATED_OMISSION, LOOK, RANGE_RULE, partsOf } from '@es/play/broken-bench/copy'
import { TAIL_ROWS } from '@es/play/broken-bench/desk'
import { FLAW_FACTS } from '@es/play/broken-bench/flaws'
import { INTERVAL_WIDTH_FACTOR, NUMBER_TOLERANCE_PERMILLE } from '@es/play/broken-bench/judge'
import { latencyUs } from '@es/play/broken-bench/desk'
import { layoutHistogram, layoutTimeline, longestWait, orderNo } from '@es/play/broken-bench/layout'
import { slotsOf } from '@es/play/broken-bench/levels'
import { benchLevel } from '@es/play/broken-bench/session'
import type { BenchAction, BenchLevelId, BenchState, CaseSlot } from '@es/play/broken-bench/types'
import { findBanned } from '@/copy/banned'
import { formatReadout } from '@/design/format'
import { Controls } from '@/games/broken-bench/Controls'
import { Debrief } from '@/games/broken-bench/Debrief'
import { deskFor, deskKey, LOG_ROWS, logStart, NO_SETTINGS, type DeskSettings } from '@/games/broken-bench/desk'
import { DockView } from '@/games/broken-bench/DockView'
import Game from '@/games/broken-bench/Game'
import { benchKit, partRows } from '@/games/broken-bench/kit'
import { Mirror } from '@/games/broken-bench/Mirror'
import { parseMs } from '@/games/broken-bench/parse'
import { Plot } from '@/games/broken-bench/Plot'
import { useOrientation } from '@/games/broken-bench/useOrientation'
import { Production } from '@/games/broken-bench/Production'
import { ReadoutStrip } from '@/games/broken-bench/ReadoutStrip'
import { Claim, Setup } from '@/games/broken-bench/Report'
import { noteLines, setupLines } from '@/games/broken-bench/Setup'
import { View2D } from '@/games/broken-bench/View2D'
import Log from '@/games/broken-bench/Log'
import { DueMark, SentMark } from '@/games/broken-bench/Marks'
import { fakeRun, filing, outcomeOf, play, rightAnswer, runAfter } from './broken-bench-support'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/broken-bench' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const text = (markup: string) => markup.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
/** What a learner reads in markup: its text, and its aria labels and titles. */
const readOf = (markup: string) => [text(markup), ...[...markup.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1])].join('\n')
const noop = () => undefined
/** A state a few actions into a level, and the desk on it as the page makes it. */
const stateOf = (id: BenchLevelId, seed: number, actions: readonly BenchAction[] = []): BenchState => runAfter(id, seed, actions).state
const deskOf = (run: ReturnType<typeof fakeRun>, settings: DeskSettings = NO_SETTINGS) => {
  const desk = deskFor(settings, noop, run)
  if (desk === null) throw new Error('every report is filed')
  return desk
}
/** The log sheet, which the page loads when the sheet is chosen: drawn here with the tools the page hands it. */
const logOf = (run: ReturnType<typeof fakeRun>, settings: DeskSettings = NO_SETTINGS) => {
  const scene = run.view.scene
  if (scene === null) throw new Error('every report is filed')
  return render(h(Log, { scene, desk: deskOf(run, settings), tools: { latencyUs, orderNo, LOG_ROWS, logStart, useOrientation, DueMark, SentMark } }))
}
const board = (run: ReturnType<typeof fakeRun>, settings: DeskSettings = NO_SETTINGS) => render(h(View2D, { run, desk: deskOf(run, settings), moment: null, exhibits: null }))

describe('the frame stands in the order of REDESIGN §2.6, with the switch and the report form beside the chart', () => {
  const markup = render(h(Game, null))

  test('the title strip, the goal line, the diagram and its legend, the dock, the foot strip, the title block and the table, in that order', () => {
    const at = (needle: string) => markup.indexOf(needle)
    const order = ['class="es-frame__strip"', 'class="es-frame__goal-box"', 'data-frame-diagram=""', 'class="es-frame__legend"', 'data-dock=""', 'class="es-frame__foot"', 'es-titleblock', 'data-state-table=""'].map(at)
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(markup).toContain('data-game="broken-bench"')
  })

  test('names the game and its role, offers the four levels as one control, and has no 3D view', () => {
    expect(text(markup)).toContain('Broken benchmark')
    expect(text(markup)).toContain('You audit a benchmark.')
    expect(count(markup, /<select /g)).toBe(1)
    for (const title of ['From due time', 'Warm-up cut', 'p99 interval', 'Five reports']) expect(markup).toContain(title)
    expect(markup).toContain('Level 1 of 4')
    expect(markup).not.toContain('3D')
  })

  test('the switch stands in the diagram over the chart it changes, the report beside it, and the form in the dock', () => {
    const diagram = markup.slice(markup.indexOf('data-frame-diagram'), markup.indexOf('class="es-frame__legend"'))
    const dock = markup.slice(markup.indexOf('data-dock'), markup.indexOf('class="es-frame__foot"'))
    expect(diagram).toContain('data-bench-switch')
    expect(diagram).toContain('role="switch"')
    expect(diagram.indexOf('data-bench-switch')).toBeLessThan(diagram.indexOf('data-sheet='))
    expect(diagram).toContain('data-bench-claim')
    expect(diagram).toContain('data-bench-setup')
    expect(dock).toContain('data-bench-form')
    expect(dock).not.toContain('role="switch"')
  })

  test('prints the range rule above the form\'s fields, with the judge\'s own bars', () => {
    const dock = markup.slice(markup.indexOf('data-dock'))
    expect(dock.indexOf('data-bench-rule')).toBeGreaterThan(0)
    expect(dock.indexOf('data-bench-rule')).toBeLessThan(dock.indexOf('Your p99 (ms)'))
    const rule = text(dock.slice(dock.indexOf('data-bench-rule'), dock.indexOf('Your p99 (ms)')))
    expect(RANGE_RULE.percent).toBe(NUMBER_TOLERANCE_PERMILLE / 10)
    expect(RANGE_RULE.width).toBe(INTERVAL_WIDTH_FACTOR)
    expect(rule).toContain(`within ${NUMBER_TOLERANCE_PERMILLE / 10}%`)
    expect(rule).toContain(`at most ${INTERVAL_WIDTH_FACTOR} times as wide as its bootstrap interval`)
  })

  test('each level shows its title, its goal line in four parts and, played graded, its pass rule before the run', () => {
    for (const level of ['due', 'warm', 'sure', 'court'] as const) {
      const copy = BENCH_COPY[level]
      const practice = render(h(Game, { level }))
      const graded = render(h(Game, { level, mode: 'graded' }))
      expect(practice).toContain(copy.title)
      for (const part of [copy.goal.aim, copy.goal.controls, copy.goal.ends]) expect(text(practice)).toContain(part)
      expect(text(graded)).toContain(copy.passRule)
      expect(text(practice)).toContain(copy.practiceBeat)
      expect(text(practice)).not.toContain(`${copy.passRule} Ends`)
      expect(graded).toContain('data-mode="graded"')
    }
  })

  test('a graded attempt hides the desk\'s p99, and practice shows it', () => {
    expect(text(markup)).toContain('p99 now')
    const graded = render(h(Game, { mode: 'graded' }))
    expect(text(graded)).not.toContain('p99 now')
    expect(text(graded)).toContain('reported p99')
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'court' }))).toContain('Level 4 of 4 · Five reports')
    expect(render(h(Game, { level: 'rain-and-relay' }))).toContain('Level 1 of 4')
    expect(render(h(Game, { level: 'constructor' }))).toContain('Level 1 of 4')
  })

  test('inside a lesson it has no breadcrumb and no level menu, and names the level in words', () => {
    const embedded = render(h(Game, { placement: 'embed' }))
    expect(embedded).toContain('data-placement="embed"')
    expect(count(embedded, /<select /g)).toBe(0)
    expect(embedded).toContain('From due time · practice')
  })

  test('keeps the Latency from switch\'s words, the cut, and a named moment line that says coordinated omission', () => {
    expect(text(markup)).toContain('Latency from the due time')
    expect(text(markup)).toContain('Leave out the first')
    const line = COORDINATED_OMISSION.line('90.1', '5,073.6')
    expect(line).toContain('Coordinated omission')
    expect(line).toContain('90.1 ms')
    expect(line).toContain('5,073.6 ms')
    expect(findBanned(line)).toEqual([])
  })
})

describe('the first run: the parts, the switch, then the report form', () => {
  test('the parts table has the five parts of REDESIGN §3.5 on every level, each with an anchor the diagram draws', () => {
    expect(BENCH_PARTS.map((part) => part.id)).toEqual(['claim', 'histogram', 'timeline', 'switch', 'form'])
    expect(BENCH_PARTS.map((part) => part.name)).toEqual(['Claim', 'Histogram', 'Timeline', 'Latency switch', 'Report form'])
    const markup = render(h(Game, null))
    for (const level of ['due', 'warm', 'sure', 'court'] as const) {
      expect(partsOf(level)).toHaveLength(5)
      const rows = partRows(level)
      expect(rows.map((row) => row.id)).toEqual(['claim', 'histogram', 'timeline', 'switch', 'form'])
      for (const row of rows) expect([level, row.id, row.anchor !== undefined]).toEqual([level, row.id, true])
    }
    // Each anchor names something the page draws.
    const anchors = { claim: 'data-bench-claim', histogram: 'data-bench-tab="histogram"', timeline: 'data-bench-tab="timeline"', switch: 'data-bench-switch', form: 'data-bench-form' }
    for (const needle of Object.values(anchors)) expect(markup).toContain(needle)
  })

  test('asks for the report as a required ask, looks at the switch first, and points at no move that would answer it', () => {
    const kit = benchKit('due')
    const run = fakeRun(stateOf('due', 0))
    expect(kit.firstAsk).toBe('required')
    expect(kit.firstMove).toBeNull()
    expect(kit.moments).toEqual([])
    expect(kit.askOpen?.(run.view)).toBe(true)
    const look = kit.look?.(run.view)
    expect(look?.title).toBe(LOOK.title)
    expect(look?.anchor).toBe('[data-bench-switch] label')
    // The look files nothing: it is a view change, and the session's actions are not touched by it.
    expect(text(String(look?.lead))).toContain('files nothing')
    expect(kit.askLead).toBe(LOOK.ask)
    const filed = fakeRun(stateOf('due', 0, [{ t: 'flaw', flaw: 'none' }]))
    expect(kit.askOpen?.(filed.view)).toBe(false)
    expect(kit.look?.(fakeRun(play('due', 0, rightAnswer).state).view)).toBeNull()
  })

  test('holds the form back until the parts and the switch are met, and says so', () => {
    const held = fakeRun(stateOf('due', 0), { intro: { askShown: false, ring: null } })
    const markup = render(h(Controls, { run: held }))
    expect(markup).toContain('data-held')
    expect(markup).not.toContain('data-bench-form')
    expect(text(markup)).toContain('The report form opens after the parts and the switch.')
  })

  test('the dock\'s compact view draws the claim, the histogram at the report\'s own clock and how many reports are filed', () => {
    const run = fakeRun(stateOf('due', 0))
    const markup = render(
      h(DockView, {
        run: { place: { scope: 's', key: 'k', anchor: 'a' }, game: 'broken-bench', gameTitle: 'Broken benchmark', levelTitle: 'From due time', mode: 'practice', view: run.view, done: false, turns: 0, canUndo: false, askOpen: true, step: null, stepWords: '', dispatch: noop, undo: noop, restart: noop, DockView: null, touched: 0 },
      }),
    )
    expect(markup).toContain('data-bench-dock')
    expect(text(markup)).toContain('Reported p99')
    expect(count(markup, /<svg [^>]*role="img"/g)).toBe(1)
    expect(text(markup)).toContain('0 filed')
  })
})

describe('the chart is the diagram', () => {
  const run = fakeRun(stateOf('due', 0))
  const markup = board(run)

  test('has the switch and the three sheets over the chart, the claim first, and the histogram is the one that lies on it', () => {
    expect(markup.indexOf('data-bench-claim')).toBeLessThan(markup.indexOf('data-bench-switch'))
    expect(markup.indexOf('data-bench-switch')).toBeLessThan(markup.indexOf('data-sheet='))
    expect(markup).toContain('data-tab="histogram"')
    expect(markup).toMatch(/aria-pressed="true"[^>]*data-bench-tab="histogram"|data-bench-tab="histogram"[^>]*aria-pressed="true"/)
    for (const name of ['Histogram', 'Timeline', 'Log']) expect(text(markup)).toContain(name)
    expect(count(markup, /<svg [^>]*role="img"/g)).toBe(1)
    expect(markup).toContain('aria-label="Histogram.')
  })

  test('says the report\'s claim with its tag once, and the setup and the counts off the log', () => {
    const words = text(markup)
    expect(words).toContain('Reported p99 time to first token')
    expect(count(markup, /data-word="synthetic"/g)).toBe(1)
    expect(markup).toContain('data-line="timer"')
    expect(words).toContain('Counted off the log')
    expect(markup).toContain('data-line="late"')
  })

  test('the log sheet is a listbox of the requests around the selection, one tab stop, the marker on the selected', () => {
    const rows = fakeRun(stateOf('due', 0, [{ t: 'view', v: 'rows' }]))
    const log = logOf(rows)
    expect(log).toContain('role="listbox"')
    expect(count(log, /role="option"/g)).toBe(LOG_ROWS.landscape)
    expect(log).toContain('data-native-keys="ArrowUp ArrowDown Home End PageUp PageDown"')
    const selected = logOf(rows, { key: deskKey(rows), selected: 300 })
    expect(count(selected, /aria-selected="true"/g)).toBe(1)
    expect(selected).toContain('Request 0301')
    expect(text(selected)).not.toMatch(/stopwatch|tape/i)
    // The line under the chart reads the selected request's four times, with the marker.
    const line = board(rows, { key: deskKey(rows), selected: 300 })
    expect(text(line)).toContain('Request 0301')
    expect(line).toContain('es-marker')
  })

  test('the requests the cut leaves out are listed as left out, in words as well as in ink', () => {
    const rows = fakeRun(stateOf('due', 0, [{ t: 'view', v: 'rows' }]))
    const log = logOf(rows, { key: deskKey(rows), selected: 5 })
    expect(log).toContain('left out by the cut')
    expect(count(log, /data-cut="true"/g)).toBeGreaterThan(0)
  })

  test('draws the timeline for a selected request', () => {
    const timeline = fakeRun(stateOf('due', 0, [{ t: 'view', v: 'timeline' }]))
    const drawn = board(timeline, { key: deskKey(timeline), selected: 40 })
    expect(drawn).toContain('data-tab="timeline"')
    expect(drawn).toContain('data-row="40"')
    expect(drawn).toContain('aria-label="Timeline.')
  })

  test('says a moment once it is given one, beside the chart, in a status line', () => {
    const line = COORDINATED_OMISSION.line('90.1', '5,073.6')
    const named = render(h(View2D, { run, desk: deskOf(run), moment: line, exhibits: null }))
    expect(named).toContain('data-moment="coordinated-omission"')
    expect(named).toContain('role="status"')
    expect(markup).not.toContain('data-moment')
  })

  test('draws the exhibits in place of the case once every report is filed', () => {
    const done = fakeRun(play('due', 0, rightAnswer).state)
    const drawn = render(h(View2D, { run: done, desk: null, moment: null, exhibits: h('p', { 'data-exhibits-here': '' }, 'x') }))
    expect(drawn).toContain('data-done')
    expect(drawn).toContain('data-exhibits-here')
    expect(drawn).not.toContain('data-bench-switch')
  })

  test('the readout strip has the reported p99, the p99 now (practice only), the requests measured and the requests sent late, with one stamp', () => {
    const practice = render(h(ReadoutStrip, { run, desk: deskOf(run) }))
    expect(count(practice, /data-readout-id=/g)).toBe(4)
    for (const id of ['reported', 'measured', 'requests', 'late']) expect(practice).toContain(`data-readout-id="${id}"`)
    expect(count(practice, /data-word="synthetic"/g)).toBe(1)
    const graded = fakeRun(stateOf('due', 0), { mode: 'graded' })
    const hidden = render(h(ReadoutStrip, { run: graded, desk: deskOf(graded) }))
    expect(hidden).not.toContain('data-readout-id="measured"')
  })
})

describe('the report form', () => {
  test('is a radio group of eleven flaws, each by its engine term, three fields and a control that files the report', () => {
    const run = fakeRun(stateOf('due', 0))
    const markup = render(h(Controls, { run }))
    expect(count(markup, /type="radio"/g)).toBe(11)
    expect(new Set([...markup.matchAll(/type="radio" name="([^"]+)"/g)].map((m) => m[1])).size).toBe(1)
    for (const flaw of BENCH_FLAWS) {
      expect(markup).toContain(`value="${flaw}"`)
      expect(text(markup)).toContain(FLAW_FACTS[flaw].term)
    }
    for (const label of ['Your p99 (ms)', 'Range from (ms)', 'to (ms)']) expect(text(markup)).toContain(label)
    expect(text(markup)).toContain('File the report')
    expect(text(markup)).not.toMatch(/ruling|stub|checklist/i)
  })

  test('cannot file until a flaw is named and a p99 with a range that holds it is written, and says what is missing', () => {
    const markup = render(h(Controls, { run: fakeRun(stateOf('due', 0)) }))
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>File the report<\/button>/)
    expect(text(markup)).toContain('To file it: name a flaw, and write a p99 and a range that holds it.')
  })

  test('shows the named flaw checked, the written figures in their fields, and a control that can file them', () => {
    const answer = rightAnswer(benchLevel('due', 0).slots[0])
    const run = fakeRun(stateOf('due', 0, [{ t: 'flaw', flaw: answer.flaw }, { t: 'predict', p99Us: answer.p99Us, loUs: answer.loUs, hiUs: answer.hiUs }]))
    const markup = render(h(Controls, { run }))
    expect(count(markup, /type="radio"[^>]*checked=""/g)).toBe(1)
    expect(markup).toContain(`value="${answer.p99Us / 1000}"`)
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>File the report/)
    expect(markup).not.toContain('To file it:')
  })

  test('asks only for what is missing once a flaw is named, and says what a flaw means', () => {
    const markup = render(h(Controls, { run: fakeRun(stateOf('due', 0, [{ t: 'flaw', flaw: 'none' }])) }))
    expect(text(markup)).toContain('To file it: write a p99 and a range that holds it.')
    expect(text(markup)).not.toContain('name a flaw')
    expect(text(markup)).toContain(FLAW_FACTS.none.means)
  })

  test('has no digit in the names of the flaws, which are a list of names', () => {
    const markup = render(h(Controls, { run: fakeRun(stateOf('due', 0)) }))
    const names = text(markup.slice(markup.indexOf('<fieldset class="es-bench-flaws"'), markup.indexOf('<p class="es-bench-rule"')))
    expect(names.replaceAll('p99', '')).not.toMatch(/\d/)
  })

  test('on a court, names the report it is on and how many are filed', () => {
    const markup = render(h(Controls, { run: fakeRun(stateOf('court', 4)) }))
    expect(text(markup)).toContain('Report form: report 1 of 5')
    expect(text(markup)).toContain('None filed yet.')
  })

  test('says that every report is filed once none is left', () => {
    const done = fakeRun(play('due', 0, rightAnswer).state)
    expect(render(h(Controls, { run: done }))).toContain('Every report is filed.')
  })
})

describe('the mirror is the tail as a table', () => {
  test('lists the slowest requests from the slowest, with a rank, a request number and the time, and flags the p99 in practice', () => {
    const run = fakeRun(stateOf('due', 0))
    const desk = deskOf(run)
    const markup = render(h(Mirror, { run, desk }))
    expect(markup).toContain('data-mirror=""')
    expect(text(markup)).toContain(`ranked from the slowest, up to ${formatReadout(TAIL_ROWS)} of them`)
    expect(count(markup, /<tr[^>]*role="row"/g)).toBe(desk.tail.length + 1)
    expect(count(markup, /data-row-button/g)).toBe(desk.tail.length)
    expect(text(markup)).toContain(`The p99 is the ${formatReadout(desk.reading.fromTop)}`)
    expect(count(markup, /es-bench-p99mark/g)).toBe(1)
    expect(text(markup)).toContain('Every figure is synthetic.')
    for (const term of ['Rank', 'Request', 'To first token']) expect(text(markup)).toContain(term)
    expect(text(markup)).not.toMatch(/stopwatch|clipboard|printer/i)
  })

  test('says nothing of where the p99 sits in a graded attempt: the learner counts down', () => {
    const run = fakeRun(stateOf('due', 0), { mode: 'graded' })
    const markup = render(h(Mirror, { run, desk: deskOf(run) }))
    expect(text(markup)).not.toMatch(/The p99 is the/)
    expect(count(markup, /es-bench-p99mark/g)).toBe(0)
    expect(text(markup)).toContain("Count down from the slowest to the request at the p99's rank.")
  })

  test('prints as many lines for every log, in practice and in a graded attempt, so that its length says nothing of where the p99 sits', () => {
    for (const [level, seed] of [['due', 0], ['due', 1], ['warm', 0], ['sure', 0], ['sure', 1]] as const) {
      for (const mode of ['practice', 'graded'] as const) {
        const run = fakeRun(stateOf(level, seed), { mode })
        for (const settings of [NO_SETTINGS, { key: deskKey(run), clock: 'due', cut: 128 } satisfies DeskSettings]) {
          const desk = deskOf(run, settings)
          expect([level, seed, mode, count(render(h(Mirror, { run, desk })), /data-row-button/g)]).toEqual([level, seed, mode, Math.min(desk.reading.n, TAIL_ROWS)])
        }
      }
    }
  })

  test('holds the counts behind the histogram as a table of nineteen bins, and says when every report is filed', () => {
    const run = fakeRun(stateOf('due', 0))
    const markup = render(h(Mirror, { run, desk: deskOf(run) }))
    expect(markup).toContain('Counts behind the histogram')
    expect(count(markup.slice(markup.indexOf('Requests measured, counted into the histogram')), /<tr class="[^"]*">|<tr>/g)).toBeGreaterThanOrEqual(19)
    const done = fakeRun(play('due', 0, rightAnswer).state)
    expect(text(render(h(Mirror, { run: done, desk: null })))).toContain('1 report is filed')
  })
})

describe('the report is the claim on trial, and not the answer', () => {
  const slots: CaseSlot[] = BENCH_FLAWS.map((flaw, i) => ({ seed: 300 + i, flaw }))

  test.each(slots.map((slot) => [slot.flaw, slot] as const))('%s: carries the claim, the setup and the counts, and no flaw\'s name or the corrected number', (flaw, slot) => {
    const built = caseOf(slot)
    const markup = render(h('div', null, h(Claim, { scene: built.scene, caseNo: 1, cases: 1 }), h(Setup, { scene: built.scene })))
    const words = text(markup)
    expect(count(markup, /data-word="synthetic"/g)).toBe(1)
    for (const fact of Object.values(FLAW_FACTS)) {
      expect([flaw, words.includes(fact.term)]).toEqual([flaw, false])
      expect([flaw, words.toLowerCase().includes(fact.phrase.toLowerCase())]).toEqual([flaw, false])
    }
    const corrected = formatReadout(built.truth.correction.p99Us / 1000, 1)
    if (corrected !== formatReadout(built.scene.claim.valueUs / 1000, 1)) expect([flaw, words.includes(corrected)]).toEqual([flaw, false])
    expect(markup).toContain('data-line="timer"')
    expect(findBanned(readOf(markup))).toEqual([])
  })

  test('has a line for each flag the harness used and none for one it did not, in the words of its flags', () => {
    const capped = setupLines(caseOf({ seed: 301, flaw: 'capped-output' }).scene).map((line) => line.id)
    const closed = setupLines(caseOf({ seed: 300, flaw: 'closed-loop' }).scene).map((line) => line.id)
    const fair = setupLines(caseOf({ seed: 310, flaw: 'none' }).scene).map((line) => line.id)
    expect(capped).toContain('cap')
    expect(fair).not.toContain('cap')
    expect(closed).not.toContain('cache')
    expect(setupLines(caseOf({ seed: 304, flaw: 'warm-cache' }).scene).map((line) => line.id)).toContain('cache')
    expect(setupLines(caseOf({ seed: 308, flaw: 'client-bottleneck' }).scene).map((line) => line.id)).toContain('client')
    for (const ids of [capped, closed, fair]) expect(ids.slice(0, 4)).toEqual(['arrivals', 'timer', 'offered', 'warmup'])
    expect(noteLines(caseOf({ seed: 300, flaw: 'closed-loop' }).scene).map((line) => line.id)).toEqual(['late', 'flight', 'finished', 'replies'])
  })

  test('reads without a doubled word in any line of any case', () => {
    for (const slot of slots) {
      const built = caseOf(slot)
      const words = text(render(h(Setup, { scene: built.scene })))
      expect([slot.flaw, /\b([A-Za-z]+) \1\b/i.exec(words)?.[0] ?? null]).toEqual([slot.flaw, null])
    }
  })
})

/** What a learner reads once the run is over: the debrief's text, its labels and its attributes of verdict and count. */
const resultOf = (done: ReturnType<typeof play>, over: { next?: { id: string; title: string } | null } = {}) => {
  const run = fakeRun(done.state)
  return render(h(Debrief, { run, outcome: outcomeOf(done), next: over.next ?? null, onNext: noop, shown: 0, onShow: noop }))
}

describe('the result reads the grade', () => {
  test('a report that stands is Passed, names the flaw, shows the arithmetic and cites the instance', () => {
    const done = play('due', 0, rightAnswer)
    const markup = resultOf(done, { next: { id: 'warm', title: 'Warm-up cut' } })
    const words = text(markup)
    expect(markup).toContain('data-verdict="Passed"')
    expect(words).toContain('Passed')
    expect(words).toContain('You named coordinated omission')
    expect(words).toContain('The rule, and the arithmetic')
    expect(words).toContain('In the real tools')
    expect(words).toContain('Next level: Warm-up cut')
    expect(words).toContain('Run again')
    expect(words).toContain('New numbers')
    expect(markup).toContain('data-ruling-body="1"')
  })

  test('a report that falls is Not yet, says which of its three parts was wrong, and leaves the level to the module link on the last', () => {
    const right = rightAnswer(benchLevel('due', 0).slots[0])
    const wrong = play('due', 0, () => ({ flaw: 'warm-cache', p99Us: right.p99Us * 3, loUs: right.p99Us * 2, hiUs: right.p99Us * 4 }))
    const markup = resultOf(wrong)
    const words = text(markup)
    expect(markup).toContain('data-verdict="Not yet"')
    expect(count(markup, /data-ok="false"/g)).toBeGreaterThanOrEqual(3)
    expect(words).toContain('You named a warm cache')
    expect(markup).toContain('href="/m/tr8"')
  })

  test('the verdict word agrees with its body for every number of reports that stand, on a single report and on five', () => {
    const wrongAnswer = (slot: CaseSlot) => {
      const right = rightAnswer(slot)
      return { flaw: slot.flaw === 'warm-cache' ? ('none' as const) : ('warm-cache' as const), p99Us: right.p99Us * 3, loUs: right.p99Us * 2, hiUs: right.p99Us * 4 }
    }
    const runs: { done: ReturnType<typeof play>; stood: number; cases: number; needed: number }[] = []
    for (const stood of [0, 1]) runs.push({ done: play('due', 0, (slot) => (stood === 1 ? rightAnswer(slot) : wrongAnswer(slot))), stood, cases: 1, needed: 1 })
    for (let stood = 0; stood <= 5; stood++) runs.push({ done: play('court', 4, (slot, at) => (at < stood ? rightAnswer(slot) : wrongAnswer(slot))), stood, cases: 5, needed: 4 })
    for (const { done, stood, cases, needed } of runs) {
      const markup = resultOf(done)
      const words = text(markup)
      const label = `${stood} of ${cases}`
      const heading = /data-result-heading="">([^<]+)</.exec(markup)?.[1]
      const passes = stood >= needed
      expect([label, heading]).toEqual([label, passes ? 'Passed' : 'Not yet'])
      expect([label, markup.includes(`data-stood="${stood}"`), markup.includes(`data-needed="${needed}"`)]).toEqual([label, true, true])
      const sentence = text(/<p class="es-debrief__sentence">([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? '')
      if (passes) {
        // Passed never sits over a failing body.
        expect([label, /\b(did not stand|falls|not yet)\b/i.test(sentence) && !sentence.startsWith('Enough reports stood to pass')]).toEqual([label, false])
        expect([label, stood === cases || sentence.startsWith('Enough reports stood to pass') || cases === 1]).toEqual([label, true])
        expect(words).not.toContain('Not yet')
      } else {
        // Not yet never sits over a passing body.
        expect([label, /Every report stood|Enough reports stood to pass|^You found no flaw|applied the rule that corrects it/.test(sentence)]).toEqual([label, false])
        expect(words).not.toContain('Passed')
      }
    }
  })

  test('a single report sets its exhibits in the diagram, and the dock holds the number line, the arithmetic and the real tools in one ledger', () => {
    const done = play('due', 0, rightAnswer)
    expect(done.state.level.slots[0].flaw).toBe('coordinated-omission')
    const markup = resultOf(done)
    expect(markup).toContain('data-cases="one"')
    expect(markup).toContain('es-numline')
    expect(markup.indexOf('es-numline')).toBeLessThan(markup.indexOf('data-ruling-body'))
    expect(markup).toContain('es-bench-ledger')
    expect(markup).not.toContain('data-exhibits')
    expect(count(markup, /data-word="synthetic"/g)).toBe(1)
    expect(markup).toContain('The flags that would have made it admissible')
  })

  test('a case whose log sent nothing late has no stretch of waits, and the exhibits draw the corrected run for each report', async () => {
    const { default: Exhibits } = await import('@/games/broken-bench/Exhibits')
    const tools = { Plot, useOrientation, layoutHistogram, layoutTimeline, longestWait, orderNo }
    const calm = play('warm', 0, rightAnswer)
    const calmRulings = fakeRun(calm.state).view.rulings ?? []
    const drawn = render(h(Exhibits, { ruling: calmRulings[0], tools }))
    expect(drawn).toContain('data-exhibit="run"')
    expect(drawn).not.toContain('data-exhibit="waits"')
    const done = play('due', 0, rightAnswer)
    const ruling = fakeRun(done.state).view.rulings?.[0]
    if (ruling === undefined) throw new Error('no ruling')
    const exhibits = render(h(Exhibits, { ruling, tools }))
    expect(exhibits).toMatch(/<text[^>]*>THE CORRECTED RUN<\/text>/)
    expect(exhibits).toMatch(/<text[^>]*>YOUR LOG, AROUND ITS LONGEST WAIT<\/text>/)
    expect(exhibits).toMatch(/<path d="[^"]+" stroke="var\(--es-paper-ink-2\)"[^>]*stroke-dasharray/)
    expect(text(exhibits)).toContain("Each red dash is a request's wait between its due tick and its sent tick, and the report's timer, started at the send, counted none of it.")
    expect(text(exhibits)).toMatch(/Request \d{4} waited [\d,.]+ ms/)
    expect(exhibits).not.toContain('var(--es-lamp)')
    expect(count(exhibits, /data-word="synthetic"/g)).toBe(2)
  })

  test('the flags that would have made it admissible are three ledgers of claims', () => {
    const production = render(h(Production, null))
    expect(production).toContain('The flags that would have made it admissible')
    expect(count(production, /<ul class="es-bench-instances es-bench-ledger">/g)).toBe(3)
  })

  test('five reports are set side by side in a docket, each with a control that draws its corrected run', () => {
    const done = play('court', 4, rightAnswer)
    const markup = resultOf(done)
    expect(markup).toContain('aria-label="The reports"')
    expect(count(markup, /<tr data-ruling="\d"/g)).toBe(5)
    expect(count(markup, /aria-pressed="(true|false)"[^>]*>Show \d/g)).toBe(5)
    expect(markup).toContain('data-shown')
    expect(text(markup)).toContain('Passed')
    expect(text(markup)).toContain('Open module TR8')
  })

  test('reads without a doubled word in any report of any flaw, right or wrong', () => {
    const uncovered = new Set<string>(BENCH_FLAWS)
    const seeds: number[] = []
    for (let seed = 0; uncovered.size > 0 && seed < 300; seed++) {
      const fresh = slotsOf('court', seed).filter((slot) => uncovered.has(slot.flaw))
      if (fresh.length === 0) continue
      seeds.push(seed)
      for (const slot of fresh) uncovered.delete(slot.flaw)
    }
    expect([...uncovered]).toEqual([])
    for (const seed of seeds) {
      for (const filed of [rightAnswer, (slot: CaseSlot) => ({ ...rightAnswer(slot), flaw: 'warm-cache' as const, p99Us: rightAnswer(slot).p99Us * 3, loUs: rightAnswer(slot).p99Us * 2, hiUs: rightAnswer(slot).p99Us * 4 })]) {
        const done = play('court', seed, filed)
        const run = fakeRun(done.state)
        for (let shown = 0; shown < 5; shown++) {
          const markup = render(h(Debrief, { run, outcome: outcomeOf(done), next: null, onNext: noop, shown, onShow: noop }))
          const prose = [...markup.matchAll(/<(p|dd)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((match) => text(match[2]))
          for (const sentence of prose) expect([seed, sentence, /\b([A-Za-z]+) \1\b/i.exec(sentence)?.[0] ?? null]).toEqual([seed, sentence, null])
          expect(text(markup)).toContain(FLAW_FACTS[done.state.level.slots[shown].flaw].term)
        }
      }
    }
  })
})

describe('the copy guard on what the page renders (REDESIGN §2.7, P1)', () => {
  test('no banned word or phrase in any level, practice or graded, at the start, with a flaw named, or at the result', () => {
    const found: string[] = []
    const check = (label: string, markup: string) => found.push(...findBanned(readOf(markup)).map((f) => `${label}: ${f.rule}: ${f.match}`))
    for (const level of ['due', 'warm', 'sure', 'court'] as const) {
      for (const mode of ['practice', 'graded'] as const) check(`${level} ${mode}`, render(h(Game, { level, mode })))
      const run = fakeRun(stateOf(level, 0, [{ t: 'flaw', flaw: 'closed-loop' }]))
      check(`${level} form`, render(h(Controls, { run })))
      for (const tab of ['rows', 'timeline', 'histogram'] as const) check(`${level} ${tab}`, board(fakeRun(stateOf(level, 0, [{ t: 'view', v: tab }])), { key: deskKey(run), selected: 12 }))
      check(`${level} mirror`, render(h(Mirror, { run, desk: deskOf(run) })))
      for (const flaw of ['none', 'warm-cache'] as const) {
        const done = play(level, 0, (slot) => ({ ...rightAnswer(slot), flaw }))
        check(`${level} result ${flaw}`, resultOf(done))
      }
    }
    check('moment', COORDINATED_OMISSION.line('90.1', '5,073.6'))
    expect(found).toEqual([])
    expect(findBanned('<p>File the ruling</p>').length).toBeGreaterThan(0)
  })
})

describe('the desk', () => {
  /** A page's state, held in a variable. */
  function holder() {
    let settings: DeskSettings = NO_SETTINGS
    const set = (update: DeskSettings | ((before: DeskSettings) => DeskSettings)) => {
      settings = typeof update === 'function' ? update(settings) : update
    }
    return { get: () => settings, set }
  }

  test('starts as the report read the log: the harness\'s clock and its own cut, with nothing selected', () => {
    const run = fakeRun(stateOf('due', 0))
    const { scene } = run.view
    const desk = deskOf(run)
    expect(scene).not.toBeNull()
    expect(desk.clock).toBe(scene?.claim.timerStartsAt === 'send' ? 'sent' : 'due')
    expect(desk.cut).toBe(scene?.harnessCut)
    expect(desk.selected).toBeNull()
    expect(desk.reading.p99Us).toBe(scene?.claim.valueUs)
  })

  test('moves the clock and the cut, and the reading follows; selecting and moving hold the request inside the log', () => {
    const run = fakeRun(stateOf('due', 0))
    const last = (run.view.scene?.rows.length ?? 0) - 1
    const page = holder()
    const at = () => deskFor(page.get(), page.set, run)
    if (at() === null) throw new Error('no desk')
    at()?.setClock('due')
    expect(at()?.clock).toBe('due')
    expect(at()?.reading.p99Us).toBeGreaterThan(run.view.scene?.claim.valueUs ?? Infinity)
    at()?.setCut(0)
    expect(at()?.cut).toBe(0)
    expect(at()?.reading.n).toBe(last + 1)
    at()?.setCut(10 ** 9)
    expect(at()?.cut).toBe(last)
    at()?.setCut(-5)
    expect(at()?.cut).toBe(0)
    at()?.move('next')
    expect(at()?.selected).toBe(0)
    at()?.move('next')
    expect(at()?.selected).toBe(1)
    at()?.move('previous')
    at()?.move('previous')
    expect(at()?.selected).toBe(0)
    at()?.move('last')
    expect(at()?.selected).toBe(last)
    at()?.move('next')
    expect(at()?.selected).toBe(last)
    at()?.move({ by: -10 })
    expect(at()?.selected).toBe(last - 10)
    at()?.move('first')
    expect(at()?.selected).toBe(0)
    at()?.select(null)
    expect(at()?.selected).toBeNull()
    at()?.move('previous')
    expect(at()?.selected).toBe(last)
  })

  test('is the page\'s own: a new case, or a new seed, is a new desk', () => {
    const one = fakeRun(stateOf('due', 0))
    const another = fakeRun(stateOf('due', 2))
    const page = holder()
    deskFor(page.get(), page.set, one)?.setClock('due')
    deskFor(page.get(), page.set, one)?.select(7)
    expect(deskFor(page.get(), page.set, one)?.selected).toBe(7)
    expect(deskKey(one)).not.toBe(deskKey(another))
    expect(deskFor(page.get(), page.set, another)?.selected).toBeNull()
    expect(deskFor(page.get(), page.set, another)?.clock).toBe(another.view.scene?.claim.timerStartsAt === 'send' ? 'sent' : 'due')
  })

  test('has no desk once every report is filed', () => {
    const done = fakeRun(play('due', 0, rightAnswer).state)
    expect(deskFor(NO_SETTINGS, noop, done)).toBeNull()
  })

  test('lists a stretch of the log around the selection, held inside the log', () => {
    expect(logStart(1000, null, 128, 21)).toBe(128 + 10 - 10)
    expect(logStart(1000, 500, 0, 21)).toBe(490)
    expect(logStart(1000, 0, 0, 21)).toBe(0)
    expect(logStart(1000, 999, 0, 21)).toBe(979)
    expect(logStart(10, 5, 0, 21)).toBe(0)
    expect(LOG_ROWS).toEqual({ landscape: 21, portrait: 9 })
  })
})

describe('what a learner types', () => {
  test('is milliseconds as digits, with commas and spaces allowed, a decimal point allowed, and nothing else', () => {
    expect(parseMs('90.1')).toBe(90.1)
    expect(parseMs('5,073.6')).toBe(5073.6)
    expect(parseMs(' 1 234 ')).toBe(1234)
    expect(parseMs('0.5')).toBe(0.5)
    for (const bad of ['', ' ', 'abc', '12ms', '-3', '1e3', '0', '0.0', '1.2.3', '.5', '5.', '1,2,3x', 'Infinity', 'NaN']) expect([bad, parseMs(bad)]).toEqual([bad, null])
  })

  test('files the figures it parses as whole microseconds', () => {
    const run = fakeRun(stateOf('due', 0, [{ t: 'flaw', flaw: 'coordinated-omission' }, { t: 'predict', p99Us: 5_073_600, loUs: 4_887_600, hiUs: 5_205_100 }]))
    const markup = render(h(Controls, { run }))
    expect(markup).toContain('value="5073.6"')
    expect(markup).toContain('value="4887.6"')
    expect(markup).toContain('value="5205.1"')
    expect(filing({ flaw: 'none', p99Us: 1, loUs: 1, hiUs: 1 })).toHaveLength(3)
  })
})
