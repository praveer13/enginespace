/*
 * KV page pool's page as markup, in the instrument frame (REDESIGN §2.6, §2.7, §3.5; GAMES.md §10; A§6.9, D-018, D-048, D-063): what the
 * frame, the diagram, the dock, the table and the result put on the page, rendered on the server so that the structure a screen reader and
 * a stylesheet get can be read. What needs a DOM, a focus, a viewport or a timer (the arrows along a list, focus following the decision,
 * the boxes in the first screen, the live region as it speaks) is walked in a browser by e2e/pool.spec.ts.
 *
 *   - The frame: the title strip (the title, the role line, the level menu as one control, Diagram and 3D, Parts, How to play, Keyboard), the
 *     goal line in four parts on every level, the diagram and its legend, the dock, the foot strip, the title block and the table, in that
 *     order. The diagram is the default view.
 *   - The diagram draws the engine's page pool: a cell for every page in rows of 16, a page's state by its colour and glyph (the legend's),
 *     the running batch with each request's block table, and the free queue. The drawing is hidden from a reader; the table lists it.
 *   - The dock offers every legal action as HTML: the guess first, then one decision, its list one tab stop; an eviction says in practice
 *     what each page costs, and in a graded run that it does not.
 *   - The table lists everything the diagram shows. The result's verdict word comes from the grade; its sentence is the engine's words.
 *   - No banned word or phrase in anything the page renders (src/copy/banned.ts), and no 'Say it first'.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { findBanned } from '@/copy/banned'
import { changeLine } from '@/games/pool/announce'
import { Controls } from '@/games/pool/Controls'
import { Debrief } from '@/games/pool/Debrief'
import { dumpOf } from '@/games/pool/dump'
import Game from '@/games/pool/Game'
import { Mirror } from '@/games/pool/Mirror'
import { ReadoutStrip } from '@/games/pool/ReadoutStrip'
import { PoolLegend, View2D } from '@/games/pool/View2D'
import { POOL_COPY } from '@es/play/pool/copy'
import { buildLevel } from '@es/play/pool/levels'
import { engine, house } from '@es/play/pool/policy'
import { poolSession } from '@es/play/pool/session'
import type { PoolAsk, PoolLevel, PoolLevelId, PoolState } from '@es/play/pool/types'
import { kvPreset } from '@es/sim/kv'
import { PRACTICE, fakeRun, outcomeOf, playThrough, practiceOf } from './pool-support'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/pool' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const textOf = (markup: string) => markup.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<code>[\s\S]*?<\/code>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
/** What a learner reads in markup: its text, and its aria labels and titles. */
const readOf = (markup: string) => [textOf(markup), ...[...markup.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1])].join('\n')
const S = poolSession
const noop = () => undefined

/** The first state of the reference's run at which the decision is of this kind. */
const asking = (level: PoolLevel, kind: PoolAsk['kind']): PoolState => {
  const found = playThrough(level, house).states.find((state) => state.ask?.kind === kind)
  if (found === undefined) throw new Error(`the reference is never asked to ${kind} on ${level.id}`)
  return found
}

const controls = (state: PoolState, mode: 'practice' | 'graded' = 'practice') => {
  const run = fakeRun(state, { mode })
  return render(h(Controls, { run, dump: dumpOf(run.view, null, noop), mode, onPoint: noop }))
}

const diagram = (state: PoolState, pick = false) => {
  const run = fakeRun(state)
  return render(h(View2D, { run, dump: dumpOf(run.view, null, noop), pointed: [], pick }))
}

/** A tight pool, in which a running request cannot grow: the reference is asked to preempt. */
const tight = (): PoolLevel => {
  const base = buildLevel('one-group', 2)
  return { ...base, spec: kvPreset(base.preset, 20, { prefixCaching: true }) }
}

describe('the frame stands in the order of REDESIGN §2.6', () => {
  const markup = render(h(Game, null))

  test('the title strip, the goal line, the diagram and its legend, the dock, the foot strip, the title block and the table, in that order', () => {
    const at = (needle: string) => markup.indexOf(needle)
    const order = ['class="es-frame__strip"', 'class="es-frame__goal-box"', 'data-frame-diagram=""', 'class="es-frame__legend"', 'data-dock=""', 'class="es-frame__foot"', 'es-titleblock', 'data-state-table=""'].map(at)
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  test('the strip holds the title with its role line, one level menu, Diagram and 3D, Parts, How to play and Keyboard; no row of level chips', () => {
    const strip = markup.slice(markup.indexOf('class="es-frame__strip"'), markup.indexOf('class="es-frame__goal-box"'))
    expect(strip).toMatch(/<h2 id="[^"]+" class="es-frame__title">KV page pool<\/h2><p class="es-frame__role">You are the KV allocator.<\/p>/)
    expect(count(strip, /<select /g)).toBe(1)
    expect(count(strip, /<option /g)).toBe(7)
    expect(strip).toContain('>Level 1 of 7 · One KV group · practice</option>')
    expect(strip).toContain('>Level 3 of 7 · Choose what to evict · graded</option>')
    expect(strip).not.toContain('aria-current="step"')
    for (const words of ['>Diagram</button>', '>3D</button>', '>Parts</button>', '>How to play</button>', '>Keyboard</button>']) expect(strip).toContain(words)
    expect(strip).not.toContain('>Keys</button>')
    expect(strip).toContain('<nav aria-label="Breadcrumb"')
  })

  test('the diagram is the default view: the 2D surface, the Diagram button pressed', () => {
    expect(markup).toContain('data-view="2d"')
    expect(markup).toContain('data-surface="2d"')
    expect(markup).not.toContain('data-surface="3d"')
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Diagram<\/button>/)
  })

  test('the table is in the DOM under a closed disclosure, with the requests and the pages', () => {
    const table = markup.slice(markup.indexOf('data-state-table=""'))
    expect(markup).toMatch(/<details class="es-frame__table" data-state-table="">/)
    expect(table).toContain('>State as a table</summary>')
    expect(count(table, /<table /g)).toBe(2)
    expect(markup).toMatch(/aria-describedby="[^"]+"/)
  })

  test('the title block says what the drawing is a model of, its clock, and opens what the model leaves out', () => {
    expect(markup).toContain('Model of a KV page pool, after vLLM v0.33.0')
    expect(markup).toContain('Clock: engine steps, synthetic')
    expect(markup).toContain('What this model leaves out')
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'evict' }))).toContain('data-level="evict"')
    expect(render(h(Game, { level: 'manager' }))).toContain('data-level="manager"')
    expect(render(h(Game, { level: 'first-1-fill' }))).toContain('data-level="one-group"')
    expect(render(h(Game, { level: 'constructor' }))).toContain('data-level="one-group"')
  })

  test('inside a lesson: the title one level down, no breadcrumb and no menu, and the level named in words with its mode', () => {
    const embed = render(h(Game, { placement: 'embed', level: 'two-kinds' }))
    expect(embed).toMatch(/<h3 id="[^"]+" class="es-frame__title">KV page pool<\/h3>/)
    expect(embed).not.toContain('Breadcrumb')
    expect(embed).not.toContain('<select')
    expect(textOf(embed)).toContain('Full attention and a sliding window · practice')
  })

  test('a graded level can be played as a graded run, which says it shows no costs; a level that cannot be graded opens in practice whatever it is asked', () => {
    const graded = render(h(Game, { level: 'evict', mode: 'graded' }))
    expect(graded).toContain('data-mode="graded"')
    expect(graded).toContain('Graded: a fresh seed, no undo, and no costs shown.')
    expect(graded).toContain('>Back to practice</button>')
    expect(graded).toContain('>Level 3 of 7 · Choose what to evict · graded</option>')
    expect(graded).not.toContain('>Undo</button>')
    expect(render(h(Game, { level: 'evict' }))).toContain('>Start a graded run</button>')
    const plain = render(h(Game, { level: 'one-group', mode: 'graded' }))
    expect(plain).toContain('data-mode="practice"')
    expect(plain).toContain('Practice: fixed numbers and undo.')
    expect(plain).not.toContain('Start a graded run')
  })
})

describe("every level's goal line has its four parts (P4)", () => {
  test('the aim, what the learner controls, the number to beat or the pass rule, and when the level ends', () => {
    for (const [id] of PRACTICE) {
      const goal = render(h(Game, { level: id }))
      const line = goal.slice(goal.indexOf('<p class="es-goal'), goal.indexOf('</p>', goal.indexOf('<p class="es-goal')))
      const copy = POOL_COPY[id].goal
      expect([id, line.includes(`<span data-part="aim">${copy.aim}</span>`)]).toEqual([id, true])
      expect([id, line.includes(`<span data-part="control">${copy.controls}</span>`)]).toEqual([id, true])
      expect([id, textOf(line).includes(copy.beat)]).toEqual([id, true])
      expect([id, /<span data-part="ends">Ends /.test(line)]).toEqual([id, true])
      if (POOL_COPY[id].passRule !== undefined) expect(copy.beat).toBe(POOL_COPY[id].passRule as string)
    }
  })
})

describe('the diagram draws the engine\'s page pool (REDESIGN §2.9, §3.5)', () => {
  const level = practiceOf('evict')
  const state = asking(level, 'evict')
  const markup = diagram(state)

  test('a cell for every page, in rows of 16, each in its place for its whole life, in every state of every level', () => {
    for (const [id, seed] of PRACTICE) {
      const lvl = buildLevel(id, seed)
      const { states } = playThrough(lvl, house)
      for (const s of [states[0], states[Math.floor(states.length / 2)], states[states.length - 1]]) {
        const grid = diagram(s)
        const cells = grid.slice(grid.indexOf('class="es-pool__grid"'), grid.indexOf('data-pool-queue'))
        expect([id, count(cells, /class="es-pool__cell"/g)]).toEqual([id, lvl.spec.poolPages])
      }
    }
    expect(markup).toContain('--es-cols:16')
  })

  test("a page's state is its memory role and the glyph of the legend; the legend names each state in the engine's words", () => {
    for (const state of ['free', 'used', 'cached']) expect(markup).toContain(`data-state="${state}"`)
    expect(markup).toMatch(/data-state="used"[^>]*><svg[^>]*data-glyph="circle"/)
    const legend = render(h(PoolLegend, { view: S.view(state) }))
    for (const word of ['free', 'in use', 'cached', 'chosen to evict']) expect(legend).toContain(`<span>${word}</span>`)
    expect(legend).toContain('aria-label="Legend: a page&#x27;s state"')
    expect(textOf(legend)).toContain('KV groups: 1 full attention · 2 sliding window · 3 sliding window')
    for (const id of ['full0', 'sw0', 'sw1']) expect(legend).toContain(`<code>${id}</code>`)
    expect(render(h(PoolLegend, { view: S.view(S.init(practiceOf('one-group'))) }))).toContain('One KV group, <code>full0</code>: full attention.')
  })

  test('the running batch is one slot to a batch slot, dashed while empty, a running request with its block table', () => {
    const batch = markup.slice(markup.indexOf('data-pool-batch'), markup.indexOf('data-pool-grid'))
    const view = S.view(state)
    expect(count(batch, /class="es-pool__slot"/g)).toBe(view.cap)
    expect(count(batch, /data-empty=""/g)).toBe(view.cap - view.running.length)
    expect(count(batch, /class="es-pool__ruler-row"/g)).toBe(view.running.length * view.stations.length)
    expect(textOf(batch)).toContain(`Running batch ${view.running.length} of ${view.cap} slots`)
  })

  test('the free queue leads with its free pages, counted, then the cached pages in the order they go', () => {
    const queue = markup.slice(markup.indexOf('data-pool-queue'))
    const view = S.view(state)
    const free = view.rotation.filter((id) => view.pans[id].state === 'free').length
    if (free > 0) expect(textOf(queue)).toContain(`${free} free`)
    expect(textOf(queue)).toContain('next to evict on the left')
  })

  test('the drawing is hidden from a reader, and the table lists it; its only inline styles are its custom properties', () => {
    expect(count(markup, /class="es-pool__grid" aria-hidden="true"/g)).toBe(1)
    // Two strips: the free queue, and the waiting queue the parts list's third part points at (build B's finish review).
    expect(count(markup, /class="es-pool__strip" aria-hidden="true"/g)).toBe(2)
    for (const style of markup.match(/style="[^"]*"/g) ?? []) expect(style).toMatch(/^style="(--es-[a-z-]+:[^;"]+;?)+"$/)
  })

  test('a pointer may pick the pages of an open eviction in the grid, and a phone picks from the list', () => {
    const picked = diagram(state, true)
    expect(count(picked, /data-pick=""/g)).toBe((state.ask as Extract<PoolAsk, { kind: 'evict' }>).candidates.length)
    expect(markup).not.toContain('data-pick=""')
    // The pages the eviction will take carry the marker: chosen, and drawn evicted.
    expect(count(markup, /data-chosen="true"/g)).toBeGreaterThanOrEqual((state.ask as Extract<PoolAsk, { kind: 'evict' }>).need)
  })

  test("an adapter's pages are its own state, in the same grid", () => {
    const loaded = playThrough(practiceOf('adapters'), house).states.find((s) => S.view(s).stock.kits > 0) as PoolState
    expect(diagram(loaded)).toContain('data-state="adapter"')
    expect(textOf(diagram(loaded))).toMatch(/adapters \d+/)
  })
})

describe('the counts over the grid are the sim\'s own (GAMES.md §8, "Invariants": conservation)', () => {
  test('free, in use, cached and adapters add up to the pool, on every state of the reference\'s run on every level', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      for (const state of playThrough(level, house).states) {
        const view = S.view(state)
        const pages = state.kv.pages
        expect([id, view.stock]).toEqual([
          id,
          {
            bare: pages.filter((page) => page.st === 'free').length,
            held: pages.filter((page) => page.st === 'used').length,
            cached: pages.filter((page) => page.st === 'cached').length,
            kits: pages.filter((page) => page.st === 'adapter').length,
          },
        ])
        expect([id, view.stock.bare + view.stock.held + view.stock.cached + view.stock.kits]).toEqual([id, level.spec.poolPages])
      }
    }
  })

  test('the grid\'s head and the table\'s summary say the same counts', () => {
    const state = asking(practiceOf('evict'), 'evict')
    const view = S.view(state)
    expect(textOf(diagram(state))).toContain(`free ${view.stock.bare} · in use ${view.stock.held} · cached ${view.stock.cached}`)
    expect(textOf(render(h(Mirror, { run: fakeRun(state) })))).toContain(`Pages: free ${view.stock.bare} , in use ${view.stock.held} , cached ${view.stock.cached} .`)
  })
})

describe('the dock offers every legal action as HTML', () => {
  test('the guess comes first, as a field, Commit and Skip the guess, and is gone once an action has been taken; a waiting row holds back the page count, which is its answer', () => {
    const level = practiceOf('one-group')
    const first = controls(S.init(level))
    expect(first).toContain('data-pool-predict=""')
    expect(first).toContain('>Your guess</h3>')
    expect(first).toContain(POOL_COPY['one-group'].predict.ask)
    expect(first).toContain('A whole number of pages. The run answers it.')
    expect(first).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Commit<\/button>/)
    expect(first).toContain('>Skip the guess</button>')
    expect(first).not.toContain('Say it first')
    expect(textOf(first)).not.toMatch(/\d+ new pages?/)
    const moved = controls(S.reduce(S.init(level), playThrough(level, house).actions[0]))
    expect(moved).not.toContain('data-pool-predict')
  })

  test('admitting: the waiting requests are buttons, one tab stop for the list, and "Admit none this step", which W also does', () => {
    const state = asking(practiceOf('evict'), 'admit')
    const markup = controls(state.history.length === 0 ? S.reduce(state, { t: 'commit', prediction: 1 }) : state)
    expect(markup).toContain('data-ask="admit"')
    expect(markup).toContain('>Admit a request</h3>')
    expect(count(markup, /data-roving=""[^>]*tabindex="0"/g)).toBe(1)
    expect(markup).toMatch(/aria-label="Admit request \d+, conversation [A-Z], turn \d+ of \d+"/)
    expect(markup).toMatch(/aria-keyshortcuts="W"[^>]*>Admit none this step<\/button>/)
    expect(textOf(markup)).toMatch(/prefix hit \d+/)
  })

  test('a waiting request that cannot be admitted is on the list, disabled, with the reason', () => {
    for (const [id, seed] of PRACTICE) {
      for (const state of playThrough(buildLevel(id, seed), house).states) {
        const view = S.view(state)
        if (state.ask?.kind !== 'admit' || view.waiting.length === state.ask.candidates.length) continue
        const markup = controls(state)
        expect(markup).toMatch(/disabled=""[^>]*aria-label="Admit request \d+, conversation [A-Z], turn \d+ of \d+, (its adapter has not loaded|its pages do not fit yet)"/)
        return
      }
    }
    throw new Error('no level has a request that waits and cannot be admitted')
  })

  test('evicting: a new decision, announced; the cached pages in the free queue\'s order, the next ones chosen, and a button that evicts exactly as many as the decision needs', () => {
    const state = asking(practiceOf('evict'), 'evict')
    const ask = state.ask as Extract<PoolAsk, { kind: 'evict' }>
    const markup = controls(state)
    expect(markup).toContain('>New decision: the pool is full</h3>')
    expect(count(markup, /data-pick-row=""/g)).toBe(ask.candidates.length)
    expect(count(markup, /aria-pressed="true"/g)).toBe(ask.need)
    expect(markup).toContain(`>Evict ${ask.need} ${ask.need === 1 ? 'page' : 'pages'}</button>`)
    expect(textOf(markup)).toContain(`Chosen ${ask.need} of ${ask.need}`)
  })

  test('in practice each option shows its cost before it is chosen; in a graded run none does, and the dock says so', () => {
    const state = asking(practiceOf('evict'), 'evict')
    const practice = controls(state, 'practice')
    expect(practice).toContain('data-pool-costs="shown"')
    expect(practice).toContain('Each page shows the tokens that evicting it costs.')
    const rows = practice.split('data-pick-row=""').slice(1)
    expect(rows.every((row) => /costs? (nothing now|<span class="font-numeric">\d+<\/span> tokens?)/.test(row.split('</button>')[0]))).toBe(true)
    const graded = controls(state, 'graded')
    expect(graded).toContain('data-pool-costs="hidden"')
    expect(graded).toContain('A graded run shows no costs: read them off the diagram.')
    expect(graded.split('data-ask-list="evict"')[1]).not.toMatch(/cost/)
    const admit = controls(asking(practiceOf('evict'), 'admit'), 'graded')
    expect(textOf(admit.split('data-ask-list="admit"')[1])).not.toContain('prefix hit')
  })

  test('preempting: when the batch cannot grow, the running requests are buttons, and the one that cannot grow says so', () => {
    const state = asking(tight(), 'preempt')
    const markup = controls(state)
    expect(markup).toContain('>New decision: the batch cannot grow</h3>')
    expect(markup).toMatch(/aria-label="Preempt request \d+, conversation [A-Z], turn \d+ of \d+, the one that cannot grow"/)
  })

  test('loading an adapter: the adapters that waiting requests need, what they take and how long they take to load, and "Load none yet"', () => {
    const state = asking(practiceOf('adapters'), 'prefetch')
    const markup = controls(state)
    expect(markup).toContain('>New decision: load an adapter</h3>')
    expect(markup).toMatch(/aria-label="Load adapter \d+, rank \d+"/)
    expect(textOf(markup)).toMatch(/\d+ pages? · \d+ steps? to load · for R\d+/)
    expect(markup).toMatch(/aria-keyshortcuts="W"[^>]*>Load none yet<\/button>/)
  })

  test('the dock is empty once the run is over: the result takes its place', () => {
    const { states } = playThrough(practiceOf('one-group'), house)
    expect(controls(states[states.length - 1])).toBe('')
  })
})

describe('the readout strip: five numbers and one stamp', () => {
  test('served, prefix hits, recomputed (the cost where adapters are in play), evictions and preemptions, under one synthetic stamp', () => {
    const view = S.view(asking(practiceOf('evict'), 'evict'))
    const strip = render(h(ReadoutStrip, { view }))
    expect(count(strip, /class="es-strip__item"/g)).toBe(5)
    expect(count(strip, /data-word="synthetic"/g)).toBe(1)
    for (const label of ['served', 'prefix hits', 'recomputed', 'evictions', 'preemptions']) expect(strip).toContain(`>${label}</dt>`)
    const kits = render(h(ReadoutStrip, { view: S.view(asking(practiceOf('adapters'), 'prefetch')) }))
    expect(kits).toContain('>cost</dt>')
  })
})

describe('the table lists everything the diagram shows (GAMES.md §2.3; A§6.9)', () => {
  const state = asking(practiceOf('evict'), 'evict')
  const markup = render(h(Mirror, { run: fakeRun(state) }))
  const view = S.view(state)

  test('a row for every request that has arrived, with its prefix hit and its blocks in each KV group; one not yet arrived is not a row', () => {
    const arrived = view.tickets.filter((ticket) => ticket.status !== 'future').length
    const requests = markup.slice(0, markup.indexOf('Every page that holds something'))
    expect(count(requests, /<tr aria-current|<tr data-lamp|<tr class/g)).toBeGreaterThan(0)
    expect(count(requests, /scope="row"/g)).toBe(arrived)
    for (const head of ['Request', 'State', 'Tokens', 'Prefix-hit tokens', 'Recomputed tokens', 'Blocks per KV group']) expect(requests).toContain(`>${head}</th>`)
  })

  test('the row the eviction is for carries the marker, once', () => {
    expect(count(markup, /data-lamp="true"/g)).toBe(1)
  })

  test('a row for every page that holds something, with its state, group, label, hash and holders', () => {
    const pages = markup.slice(markup.indexOf('Every page that holds something'))
    expect(count(pages, /scope="row"/g)).toBe(view.pans.filter((page) => page.state !== 'free').length)
    for (const head of ['Page', 'KV group', 'Label', 'Hash, last six digits', 'Held by']) expect(pages).toContain(`>${head}</th>`)
  })

  test('says every figure is a count of the synthetic model', () => {
    expect(textOf(markup)).toContain('Every figure is a count of the synthetic model.')
  })
})

describe('the live region says one sentence for each change, in the engine\'s words (A§6.9)', () => {
  test('an admission, an eviction, a finished request, a new step, the next decision and the end of the run each have their words', () => {
    const { states } = playThrough(practiceOf('evict'), house)
    const lines = states.slice(1).map((state, at) => changeLine(S.view(states[at]), S.view(state)))
    expect(lines.every((line) => line === '' || /[.]$/.test(line))).toBe(true)
    expect(lines.some((line) => /^Admitted R\d+: \d+ tokens? from a prefix hit, \d+ tokens? computed\./.test(line))).toBe(true)
    expect(lines.some((line) => /Evicted \d+ pages?\./.test(line))).toBe(true)
    expect(lines.some((line) => /Finished R\d+/.test(line))).toBe(true)
    expect(lines.some((line) => /Step \d+\./.test(line))).toBe(true)
    expect(lines.some((line) => /\d+ requests? fits?: admit one\./.test(line))).toBe(true)
    expect(lines.some((line) => /New decision: the pool is full\. Choose \d+ cached pages? to evict\./.test(line))).toBe(true)
    expect(lines[lines.length - 1]).toContain('The run is over: every request is served.')
    expect(findBanned(lines.join('\n'))).toEqual([])
  })

  test('a preemption and an adapter that could load are announced, and a run that ran out of steps says requests were left unserved', () => {
    const { states } = playThrough(tight(), house)
    const lines = states.slice(1).map((state, at) => changeLine(S.view(states[at]), S.view(state)))
    expect(lines.some((line) => line.includes('A request was preempted.'))).toBe(true)
    expect(lines.some((line) => line.includes('New decision: the batch cannot grow. Choose a request to preempt.'))).toBe(true)
    const kits = playThrough(practiceOf('adapters'), house).states
    const kitLines = kits.slice(1).map((state, at) => changeLine(S.view(kits[at]), S.view(state)))
    expect(kitLines.some((line) => /New decision: \d+ adapters? could be loaded\./.test(line))).toBe(true)
    const idle = playThrough(practiceOf('evict'), () => ({ t: 'admit', req: null })).states
    expect(changeLine(S.view(idle[idle.length - 2]), S.view(idle[idle.length - 1]))).toContain('The run is over, with requests unserved.')
    expect(findBanned([...lines, ...kitLines].join('\n'))).toEqual([])
  })

  test('a committed guess is announced, and nothing is said when nothing changed or the level changed under it', () => {
    const first = S.init(practiceOf('one-group'))
    const committed = S.reduce(first, { t: 'commit', prediction: 4 })
    expect(changeLine(S.view(first), S.view(committed))).toBe('Guess committed.')
    expect(changeLine(S.view(committed), S.view(committed))).toBe('')
    expect(changeLine(S.view(S.init(practiceOf('evict'))), S.view(S.init(practiceOf('one-group'))))).toBe('')
  })
})

describe('the result: the verdict from the grade, the decision that mattered, and the reference beside you', () => {
  const next = { id: 'two-kinds', title: 'Full attention and a sliding window' }

  function result(id: PoolLevelId, who: typeof engine | typeof house, over: { predicted?: number } = {}) {
    const { states } = playThrough(practiceOf(id), who)
    let state = states[states.length - 1]
    if (over.predicted !== undefined) state = { ...state, predicted: over.predicted }
    return render(h(Debrief, { run: fakeRun(state, { done: true }), outcome: outcomeOf(state), next, onNext: noop }))
  }

  const verdictOf = (markup: string) => /data-result-heading="">([^<]*)<\/h3>/.exec(markup)?.[1]

  test('the verdict word is the grade\'s: Passed and Not yet on a level with a pass rule, Finished (practice) on a level with a number to beat', () => {
    expect(verdictOf(result('evict', house))).toBe('Passed')
    expect(verdictOf(result('evict', engine))).toBe('Not yet')
    expect(verdictOf(result('one-group', house))).toBe('Finished (practice)')
    expect(verdictOf(result('one-group', engine))).toBe('Finished (practice)')
  })

  test('a run that missed its pass rule names a decision of yours, in the engine\'s words, with no digit in the sentence', () => {
    const markup = result('evict', engine)
    const sentence = textOf(/class="es-debrief__sentence">([^<]*)</.exec(markup)?.[1] ?? '')
    expect(sentence).toMatch(/You (admitted|evicted|preempted|loaded)/)
    expect(sentence).not.toMatch(/\d/)
    expect(textOf(markup)).toMatch(/The decision that mattered: your decision \d+ \./)
    expect(textOf(markup)).toMatch(/The pass rule asks the reference's cost over yours to be at least 0\.95 ; yours is 0\.\d\d \./)
  })

  test('a run that matches the reference says so, names no decision, and offers the next level first, then Run again and New numbers', () => {
    const markup = result('evict', house)
    expect(markup).not.toContain('The decision that mattered')
    expect(textOf(markup)).toContain('the same as the reference')
    const actions = markup.slice(markup.indexOf('es-debrief__actions'))
    expect(actions.indexOf('Next level: Full attention and a sliding window')).toBeLessThan(actions.indexOf('Run again'))
    expect(actions.indexOf('Run again')).toBeLessThan(actions.indexOf('New numbers'))
  })

  test('counts yours, the reference\'s and the engine\'s own pool side by side, and says In vLLM today with its source', () => {
    const markup = result('evict', engine)
    for (const head of ['Yours', 'Reference', 'The engine&#x27;s own pool']) expect(markup).toContain(`>${head}</th>`)
    expect(textOf(markup)).toContain('In vLLM today')
    expect(markup).toContain('https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/single_type_kv_cache_manager.py#L591-L599')
  })

  test('the guess and the answer land on one number line; a skipped guess gets the answer in words', () => {
    const answer = practiceOf('one-group').predict.answer
    const right = result('one-group', house, { predicted: answer })
    expect(right).toContain('class="es-numline')
    expect(right).toContain('your guess')
    expect(right).toContain('the answer')
    expect(textOf(result('one-group', house))).toContain(`You skipped the guess. The answer: ${answer} pages.`)
  })

  test('on a level with adapters it sets the pool against fixed slots, as the engines keep adapters (D-042); on the others it does not', () => {
    expect(result('adapters', engine)).toContain('The same run, with the adapters in fixed slots')
    expect(result('evict', engine)).not.toContain('fixed slots')
  })
})

describe('the copy guard on what the page renders (REDESIGN §2.7, P1)', () => {
  test('no banned word or phrase in the frame, the diagram, the dock, the table and the result of any level', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      const { states } = playThrough(level, house)
      const rendered = [render(h(Game, { level: id })), render(h(Game, { level: id, mode: 'graded' }))]
      for (const s of [states[0], ...states.filter((x) => x.ask !== null && x.ask.kind !== 'admit').slice(0, 6), ...states.filter((x) => x.ask?.kind === 'admit').slice(0, 3)]) {
        rendered.push(diagram(s), controls(s), render(h(Mirror, { run: fakeRun(s) })), render(h(PoolLegend, { view: S.view(s) })))
      }
      const last = states[states.length - 1]
      rendered.push(render(h(Debrief, { run: fakeRun(last, { done: true }), outcome: outcomeOf(last), next: null, onNext: noop })))
      const loss = playThrough(level, engine).states.at(-1) as PoolState
      rendered.push(render(h(Debrief, { run: fakeRun(loss, { done: true }), outcome: outcomeOf(loss), next: null, onNext: noop })))
      const found = rendered.flatMap((markup) => findBanned(readOf(markup)).map((f) => `${f.rule}: ${f.match}`))
      expect([id, [...new Set(found)]]).toEqual([id, []])
    }
  }, 30_000)

  test('the guard would see a kitchen word in rendered markup, if one came back', () => {
    expect(findBanned(readOf('<p>Dump the pans</p>')).length).toBeGreaterThan(0)
    expect(findBanned(readOf('<button aria-label="Hang ticket No. 01">x</button>')).length).toBeGreaterThan(0)
  })
})

describe('the source keeps the rules of the page', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const sources = (dir: string): string[] =>
    readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? sources(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
  const files = [...sources('src/games/pool'), ...sources('packages/play/pool')]

  test('no file of the page names a literal colour: the roles of src/design are the only palette', () => {
    for (const file of files.filter((f) => f.startsWith('src/'))) {
      const text = readFileSync(path.join(root, file), 'utf8')
      expect([file, /#[0-9a-fA-F]{6}\b/.test(text), /\b(?:rgb|hsl|oklch)a?\(/.test(text)]).toEqual([file, false, false])
    }
  })

  test('the page keeps its state in the session: no file of it reads a clock or a generator of its own', () => {
    for (const file of files) {
      const text = readFileSync(path.join(root, file), 'utf8')
      expect([file, /Math\.random|Date\.now|performance\.now/.test(text)]).toEqual([file, false])
    }
  })

  test("the old shell's kitchen views are gone from the pool: no hotel pan, ticket, rail or printer tape", () => {
    for (const file of files.filter((f) => f.startsWith('src/') && f.endsWith('.tsx') && !/Scene3D|cabinet/.test(f))) {
      const text = readFileSync(path.join(root, file), 'utf8')
      expect([file, /from '@\/design\/components\/(Pan|Ticket|Rail|PrinterTape|TapeLabel|Stub)'/.test(text)]).toEqual([file, false])
    }
  })
})
