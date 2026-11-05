/*
 * The Inspection's page as markup (GAMES.md §11, §2.6; A§6.9, D-048, D-049): what the 2D view, the controls, the mirror and the debrief put
 * on the page, rendered on the server so that the structure a screen reader and a stylesheet get can be read. What needs a DOM, a focus or
 * a timer (the arrow keys across the checklist, focus moving on, the live region as it speaks, a graded attempt's fresh seed) is walked in
 * a browser by e2e/broken-bench.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import { caseOf } from '@es/play/broken-bench/cases'
import { FLAW_FACTS } from '@es/play/broken-bench/flaws'
import { slotsOf } from '@es/play/broken-bench/levels'
import { benchLevel } from '@es/play/broken-bench/session'
import type { BenchAction, BenchLevelId, BenchState, CaseSlot } from '@es/play/broken-bench/types'
import { formatReadout } from '@/design/format'
import { Clipboard } from '@/games/broken-bench/Clipboard'
import { Controls } from '@/games/broken-bench/Controls'
import { Debrief } from '@/games/broken-bench/Debrief'
import { deskFor, deskKey, NO_SETTINGS, TAPE_ORDERS, tapeStart, type DeskSettings } from '@/games/broken-bench/desk'
import Game from '@/games/broken-bench/Game'
import { Mirror } from '@/games/broken-bench/Mirror'
import { parseMs } from '@/games/broken-bench/parse'
import { noteLines, setupLines } from '@/games/broken-bench/Setup'
import { View2D } from '@/games/broken-bench/View2D'
import { fakeRun, filing, outcomeOf, play, rightAnswer, runAfter } from './broken-bench-support'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/broken-bench' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const text = (markup: string) => markup.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const noop = () => undefined
/** A state a few actions into a level, and the desk on it as the page makes it. */
const stateOf = (id: BenchLevelId, seed: number, actions: readonly BenchAction[] = []): BenchState => runAfter(id, seed, actions).state
const deskOf = (run: ReturnType<typeof fakeRun>, settings: DeskSettings = NO_SETTINGS) => {
  const desk = deskFor(settings, noop, run)
  if (desk === null) throw new Error('the case has risen')
  return desk
}

describe('the page names the game as D-049 says, and opens on the first level', () => {
  test('the display name over its engine concept, the level and its mode on a tape label, and no working name', () => {
    const markup = render(h(Game, null))
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-type-heading">The Inspection<\/h2><p class="es-type-body[^"]*">benchmark methodology<\/p>/)
    expect(markup).toContain('From the due time · practice')
    expect(markup).toContain('data-game="broken-bench"')
    expect(markup).not.toContain('The Broken Bench')
    expect(render(h(Game, { placement: 'embed' }))).toMatch(/<h3 id="[^"]+" class="es-type-heading">The Inspection<\/h3>/)
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'court' }))).toContain('The court · practice')
    expect(render(h(Game, { level: 'sure' }))).toContain('How sure · practice')
    expect(render(h(Game, { level: 'warm' }))).toContain('The warm-up cut · practice')
    expect(render(h(Game, { level: 'rain-and-relay' }))).toContain('From the due time · practice')
    expect(render(h(Game, { level: 'constructor' }))).toContain('From the due time · practice')
  })

  test('has Play and Debrief, the keys button, no view switch (the game has no 3D scene yet), and the four levels in a docket', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('>Play</button>')
    expect(markup).toContain('>Debrief</button>')
    expect(markup).toContain('>Keys</button>')
    expect(markup).not.toContain('aria-label="View"')
    expect(markup).not.toContain('3D view')
    expect(markup).toContain('data-surface="2d"')
    const docket = markup.slice(markup.indexOf('aria-label="Levels of the Inspection"'), markup.indexOf('aria-label="Attempt"'))
    for (const title of ['From the due time', 'The warm-up cut', 'How sure', 'The court']) expect(docket).toContain(`>${title}</button>`)
    expect(count(docket, /aria-current="true"/g)).toBe(1)
    expect(markup).toContain('Graded attempt, fresh seed')
    expect(markup).toContain('aria-pressed="true">Practice</button>')
  })

  test('opens a graded attempt on a seed it draws, and the board hides the desk\'s p99 there', () => {
    const markup = render(h(Game, { mode: 'graded' }))
    expect(markup).toContain('From the due time · graded')
    expect(markup).toContain('data-mode="graded"')
    expect(markup).not.toContain('At the desk')
    expect(markup).toContain('Count down from the slowest to the order at the p99')
    expect(render(h(Game, null))).toContain('At the desk')
  })

  test('a graded attempt draws its seed from entropy on the page, and the pure package reads none (I3)', () => {
    expect(render(h(Game, { mode: 'graded' }))).toContain('data-mode="graded"')
  })
})

describe('the 2D view is the evidence board', () => {
  const run = fakeRun(stateOf('due', 0))
  const markup = render(h(View2D, { run, desk: deskOf(run) }))

  test('opens on the task, then the report, then the pass with its three sheets, and the histogram is the one that lies on it', () => {
    expect(markup.indexOf('A kitchen quotes a p99')).toBeLessThan(markup.indexOf('data-bench-clip'))
    expect(markup.indexOf('data-bench-clip')).toBeLessThan(markup.indexOf('aria-label="Sheet"'))
    expect(markup).toContain('data-tab="histogram"')
    expect(markup).toMatch(/aria-pressed="true">Histogram<\/button>/)
    expect(markup).toMatch(/aria-pressed="false">Rows<\/button>/)
    expect(markup).toMatch(/aria-pressed="false">Timeline<\/button>/)
    expect(count(markup, /<svg /g)).toBe(1)
    expect(markup).toContain('role="img"')
  })

  test('says what the report said, what the desk reads and how many orders it measured, and the report\'s number is on a tape flag with its tag', () => {
    const lines = text(markup)
    expect(lines).toContain('Reported')
    expect(lines).toContain('At the desk')
    expect(lines).toContain('Measured')
    expect(markup).toContain('data-tag="synthetic"')
    expect(lines).toContain('Select an order, on the tape or on a sheet, to read its four times.')
  })

  test('the rows sheet is the stopwatch\'s tape: a listbox of the orders around the selection, one tab stop, the lamp on the selected', () => {
    const rows = fakeRun(stateOf('due', 0, [{ t: 'view', v: 'rows' }]))
    const markup = render(h(View2D, { run: rows, desk: deskOf(rows) }))
    expect(markup).toContain('role="listbox"')
    expect(count(markup, /role="option"/g)).toBe(TAPE_ORDERS.landscape)
    expect(count(markup, /tabindex="0"/g)).toBeGreaterThanOrEqual(1)
    expect(markup).toContain('data-native-keys="ArrowUp ArrowDown Home End PageUp PageDown"')
    const selected = deskOf(rows, { key: deskKey(rows), selected: 300 })
    const chosen = render(h(View2D, { run: rows, desk: selected }))
    expect(count(chosen, /aria-selected="true"/g)).toBe(1)
    expect(chosen).toContain('data-order="300"')
    expect(chosen).toContain('Order 0301')
    expect(text(chosen)).toContain('Order 0301 selected')
  })

  test('the orders the cut leaves out are printed as left out, in words as well as in ink', () => {
    const rows = fakeRun(stateOf('due', 0, [{ t: 'view', v: 'rows' }]))
    const desk = deskOf(rows, { key: deskKey(rows), selected: 5 })
    const markup = render(h(View2D, { run: rows, desk }))
    expect(markup).toContain('left out by the cut')
    expect(count(markup, /data-cut="true"/g)).toBeGreaterThan(0)
  })

  test('draws the timeline for a selected order and says what its dashes are', () => {
    const timeline = fakeRun(stateOf('due', 0, [{ t: 'view', v: 'timeline' }]))
    const markup = render(h(View2D, { run: timeline, desk: deskOf(timeline, { key: deskKey(timeline), selected: 40 }) }))
    expect(markup).toContain('data-tab="timeline"')
    expect(markup).toContain('data-row="40"')
    expect(text(markup)).toContain('The ribbon-red dashes are the wait between when an order was due and when it was sent')
  })

  test('says that the court has risen once every case is filed', () => {
    const done = play('due', 0, rightAnswer)
    const run = fakeRun(done.state)
    expect(render(h(View2D, { run, desk: null }))).toContain('The court has risen')
  })

  test('hides the desk\'s p99 in a graded attempt, and shows the report\'s number all the same', () => {
    const graded = fakeRun(stateOf('due', 0), { mode: 'graded' })
    const markup = render(h(View2D, { run: graded, desk: deskOf(graded) }))
    expect(text(markup)).not.toContain('At the desk')
    expect(text(markup)).toContain('Reported')
  })
})

describe('the controls', () => {
  test('are a desk, a checklist of eleven rulings as a radio group, and an answer slip with three fields and a stub', () => {
    const run = fakeRun(stateOf('due', 0))
    const markup = render(h(Controls, { run, desk: deskOf(run) }))
    expect(count(markup, /type="radio"/g)).toBe(11)
    expect(count(markup, /type="radio"[^>]*name="(cite-[^"]+)"/g)).toBe(11)
    expect(new Set([...markup.matchAll(/type="radio" name="([^"]+)"/g)].map((m) => m[1])).size).toBe(1)
    for (const flaw of BENCH_FLAWS) expect(markup).toContain(`value="${flaw}"`)
    for (const flaw of BENCH_FLAWS) expect(text(markup)).toContain(FLAW_FACTS[flaw].term)
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('Time each order from when it was due')
    expect(markup).toContain('Leave out the first')
    for (const label of ['Your p99 (ms)', 'Range from (ms)', 'to (ms)']) expect(text(markup)).toContain(label)
    expect(markup).toContain('File the ruling')
  })

  test('cannot file until a flaw is named and a p99 with a range that holds it is written, and says what is missing', () => {
    const run = fakeRun(stateOf('due', 0))
    const markup = render(h(Controls, { run, desk: deskOf(run) }))
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>File the ruling<\/span>/)
    expect(text(markup)).toContain('To file it: name a flaw, and write a p99 and a range that holds it.')
  })

  test('shows the named flaw checked, the written figures in their fields, and a stub that can file them', () => {
    const slot = benchLevel('due', 0).slots[0]
    const answer = rightAnswer(slot)
    const run = fakeRun(stateOf('due', 0, [{ t: 'flaw', flaw: answer.flaw }, { t: 'predict', p99Us: answer.p99Us, loUs: answer.loUs, hiUs: answer.hiUs }]))
    const markup = render(h(Controls, { run, desk: deskOf(run) }))
    expect(count(markup, /type="radio"[^>]*checked=""/g)).toBe(1)
    expect(markup).toMatch(new RegExp(`value="${answer.flaw}"[^>]*checked=""|checked=""[^>]*value="${answer.flaw}"`))
    expect(markup).toContain(`value="${answer.p99Us / 1000}"`)
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>File the ruling/)
    expect(markup).not.toContain('To file it:')
  })

  test('asks only for what is missing once a flaw is named', () => {
    const run = fakeRun(stateOf('due', 0, [{ t: 'flaw', flaw: 'none' }]))
    const markup = render(h(Controls, { run, desk: deskOf(run) }))
    expect(text(markup)).toContain('To file it: write a p99 and a range that holds it.')
    expect(text(markup)).not.toContain('name a flaw')
  })

  test('has no digit in the copy of the checklist, which is a list of names', () => {
    const run = fakeRun(stateOf('due', 0))
    const markup = render(h(Controls, { run, desk: deskOf(run) }))
    const checklist = text(markup.slice(markup.indexOf('data-bench-cite'), markup.indexOf('data-bench-answer')))
    expect(checklist.replaceAll('p99', '')).not.toMatch(/\d/)
  })

  test('says the court has risen once every case is filed', () => {
    const done = fakeRun(play('due', 0, rightAnswer).state)
    expect(render(h(Controls, { run: done, desk: null }))).toContain('The court has risen')
  })
})

describe('the mirror is the tail as a table', () => {
  test('lists the slowest orders from the slowest, with a rank, an order number and the time, and flags the p99 in practice', () => {
    const run = fakeRun(stateOf('due', 0))
    const desk = deskOf(run)
    const markup = render(h(Mirror, { run, desk }))
    expect(markup).toContain('data-mirror=""')
    expect(markup).toContain("The slowest orders under the desk&#x27;s stopwatch and cut, ranked from the slowest")
    expect(count(markup, /<tr[^>]*role="row"/g)).toBe(desk.tail.length + 1)
    expect(count(markup, /data-row-button/g)).toBe(desk.tail.length)
    expect(markup).toContain('data-native-keys="ArrowUp ArrowDown Home End"')
    expect(text(markup)).toContain(`The p99 is the ${formatReadout(desk.reading.fromTop)}`)
    expect(text(markup)).toContain(`with ${formatReadout(desk.reading.beyond)} beyond it`)
    expect(count(markup, /<span class="es-tape__text">p99<\/span>/g)).toBe(1)
    expect(text(markup)).toContain('Every figure is synthetic.')
  })

  test('says nothing of where the p99 sits in a graded attempt: the learner counts down', () => {
    const run = fakeRun(stateOf('due', 0), { mode: 'graded' })
    const markup = render(h(Mirror, { run, desk: deskOf(run) }))
    expect(text(markup)).not.toMatch(/The p99 is the/)
    expect(count(markup, /<span class="es-tape__text">p99<\/span>/g)).toBe(0)
    expect(text(markup)).toContain("Count down from the slowest to the order at the p99's rank.")
    expect(text(markup)).not.toContain('beyond it')
  })

  test('holds the inspector\'s clipboard beside the tail, and the counts behind the histogram as a table of nineteen bins', () => {
    const run = fakeRun(stateOf('due', 0))
    const markup = render(h(Mirror, { run, desk: deskOf(run) }))
    expect(markup.indexOf('data-bench-clip')).toBeLessThan(markup.indexOf('data-mirror=""'))
    expect(markup).toContain('Counts behind the histogram')
    const bins = markup.slice(markup.indexOf('Orders measured, counted into the histogram'))
    expect(count(bins, /<tr class="[^"]*">|<tr>/g)).toBeGreaterThanOrEqual(19)
  })

  test('says the court has risen once every case is filed', () => {
    const done = fakeRun(play('due', 0, rightAnswer).state)
    expect(render(h(Mirror, { run: done, desk: null }))).toContain('The court has risen')
  })
})

describe('the clipboard is the report on trial, and not the answer', () => {
  const slots: CaseSlot[] = BENCH_FLAWS.map((flaw, i) => ({ seed: 300 + i, flaw }))

  test.each(slots.map((slot) => [slot.flaw, slot] as const))('%s: carries the claim with its tag, the setup and the notes, and no flaw\'s name or the corrected number', (flaw, slot) => {
    const built = caseOf(slot)
    const markup = render(h(Clipboard, { scene: built.scene, caseNo: 1, cases: 1 }))
    const words = text(markup)
    expect(markup).toContain('data-tag="synthetic"')
    expect(words).toContain('Inspection report')
    expect(words).toContain('Every figure on this form is synthetic')
    expect(count(markup, /Every figure on this form is synthetic/g)).toBe(1)
    for (const fact of Object.values(FLAW_FACTS)) {
      expect([flaw, words.includes(fact.term)]).toEqual([flaw, false])
      expect([flaw, words.toLowerCase().includes(fact.phrase.toLowerCase())]).toEqual([flaw, false])
    }
    const corrected = formatReadout(built.truth.correction.p99Us / 1000, 1)
    if (corrected !== formatReadout(built.scene.claim.valueUs / 1000, 1)) expect([flaw, words.includes(corrected)]).toEqual([flaw, false])
    expect(markup).toContain('data-line="timer"')
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

  test('reads without a doubled word ("orders orders") in any line of any case', () => {
    for (const slot of slots) {
      const built = caseOf(slot)
      const words = text(render(h(Clipboard, { scene: built.scene, caseNo: 1, cases: 1 })))
      expect([slot.flaw, /\b([A-Za-z]+) \1\b/i.exec(words)?.[0] ?? null]).toEqual([slot.flaw, null])
    }
  })
})

describe('the debrief reads the rulings', () => {
  test('a ruling that stands says so, names the flaw, shows the arithmetic and the corrected benchmark on a sheet, and cites the instance', () => {
    const done = play('due', 0, rightAnswer)
    const run = fakeRun(done.state)
    const markup = render(h(Debrief, { run, outcome: outcomeOf(done), next: { id: 'warm', title: 'The warm-up cut' }, onNext: noop, onNew: noop }))
    const words = text(markup)
    expect(words).toContain('The ruling stands.')
    expect(words).toContain('You named coordinated omission')
    expect(words).toContain('The rule, and the arithmetic')
    expect(words).toContain('In the real tools')
    expect(markup).toContain('data-ruling="1"')
    expect(markup).toContain('data-right="true"')
    expect(count(markup, /<svg /g)).toBeGreaterThanOrEqual(1)
    expect(words).toContain('Next: The warm-up cut')
    expect(words).toContain('Play this level again')
    expect(words).toContain('New numbers')
  })

  test('a ruling that falls says so, and says which of its three parts was wrong', () => {
    const slot = benchLevel('due', 0).slots[0]
    const right = rightAnswer(slot)
    const wrong = play('due', 0, () => ({ flaw: 'warm-cache', p99Us: right.p99Us * 3, loUs: right.p99Us * 2, hiUs: right.p99Us * 4 }))
    const run = fakeRun(wrong.state)
    const markup = render(h(Debrief, { run, outcome: outcomeOf(wrong), next: null, onNext: noop, onNew: null }))
    const words = text(markup)
    expect(words).toContain('The ruling falls.')
    expect(count(markup, /data-ok="false"/g)).toBeGreaterThanOrEqual(3)
    expect(words).toContain('You named a warm cache')
    expect(words).not.toContain('New numbers')
    expect(markup).toContain('href="/m/tr8"')
  })

  test('the court sets its five cases side by side in a docket, and reads each ruling', () => {
    const done = play('court', 4, rightAnswer)
    const run = fakeRun(done.state)
    const markup = render(h(Debrief, { run, outcome: outcomeOf(done), next: null, onNext: noop, onNew: noop }))
    expect(markup).toContain('aria-label="The docket"')
    expect(count(markup, /data-ruling="\d"/g)).toBe(5)
    expect(count(markup, /<tr class="border-b border-paper-rule">/g)).toBe(5)
    expect(text(markup)).toContain('The court is satisfied.')
    expect(text(markup)).toContain('Open TR8')
  })

  test('reads without a doubled word in any ruling of any flaw, right or wrong', () => {
    // The fewest courts whose five cases between them hold all eleven flaws.
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
        const markup = render(h(Debrief, { run: fakeRun(done.state), outcome: outcomeOf(done), next: null, onNext: noop, onNew: null }))
        const prose = [...markup.matchAll(/<(p|dd)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((match) => text(match[2]))
        for (const sentence of prose) expect([seed, sentence, /\b([A-Za-z]+) \1\b/i.exec(sentence)?.[0] ?? null]).toEqual([seed, sentence, null])
        // Every flaw of the court is named by its engine term somewhere in its ruling, and the corrected benchmark is drawn again for each.
        for (const slot of done.state.level.slots) expect(text(markup)).toContain(FLAW_FACTS[slot.flaw].term)
        expect(count(markup, /<text[^>]*>CORRECTED<\/text>/g)).toBe(done.state.level.slots.length)
        expect(count(markup, /<text[^>]*>REPORTED<\/text>/g)).toBe(done.state.level.slots.length)
        expect(count(markup, /<text[^>]*>YOURS<\/text>/g)).toBe(done.state.level.slots.length)
      }
    }
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

  test('moves the stopwatch and the cut, and the reading follows; selecting and moving hold the order inside the log', () => {
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

  test('is the board\'s own: a new case, or a new seed, is a new desk', () => {
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

  test('has no desk once the court has risen', () => {
    const done = fakeRun(play('due', 0, rightAnswer).state)
    expect(deskFor(NO_SETTINGS, noop, done)).toBeNull()
  })

  test('prints a stretch of the tape around the selection, held inside the log', () => {
    expect(tapeStart(1000, null, 128, 21)).toBe(128 + 10 - 10)
    expect(tapeStart(1000, 500, 0, 21)).toBe(490)
    expect(tapeStart(1000, 0, 0, 21)).toBe(0)
    expect(tapeStart(1000, 999, 0, 21)).toBe(979)
    expect(tapeStart(10, 5, 0, 21)).toBe(0)
    expect(TAPE_ORDERS).toEqual({ landscape: 21, portrait: 9 })
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
    const markup = render(h(Controls, { run, desk: deskOf(run) }))
    expect(markup).toContain('value="5073.6"')
    expect(markup).toContain('value="4887.6"')
    expect(markup).toContain('value="5205.1"')
    expect(filing({ flaw: 'none', p99Us: 1, loUs: 1, hiUs: 1 })).toHaveLength(3)
  })
})
