/*
 * The Tasting's page as markup (GAMES.md §2.6, §10; A§6.9, D-048, D-049): what the 2D view, the controls, the mirror and the debrief put on the
 * page, rendered on the server so that the structure a screen reader and a stylesheet get can be read. What needs a DOM, a focus or a timer
 * (the arrow keys across the weights, focus moving on, the live region as it speaks) is walked in a browser by e2e/verifier.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { buildLevel } from '@es/play/verifier/levels'
import { verifierInit, verifierSession } from '@es/play/verifier/session'
import { excessPlates } from '@es/play/verifier/state'
import { DISHES, MUTANT_IDS } from '@es/play/verifier/types'
import type { VerifierAction, VerifierLevelId, VerifierState } from '@es/play/verifier/types'
import { isForgeLab } from '@/forge/ids'
import { changeLine } from '@/games/verifier/announce'
import { Controls } from '@/games/verifier/Controls'
import { Debrief } from '@/games/verifier/Debrief'
import Game from '@/games/verifier/Game'
import { Mirror } from '@/games/verifier/Mirror'
import { PRACTICE, fakeRun, houseActions, outcomeOf, runOf, sculptActions, stateAfter } from './verifier-support'

const root = path.resolve(import.meta.dirname, '../..')
const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/verifier' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const S = verifierSession
const noop = () => undefined

describe('the page names the game as D-049 says, and opens on the first level', () => {
  test('the display name over its engine concept, the level and its mode on a tape label, and no working name', () => {
    const markup = render(h(Game, null))
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-type-heading">The Tasting<\/h2><p class="es-type-body[^"]*">speculative decoding&#x27;s verifier<\/p>/)
    expect(markup).toContain('What the chef keeps · practice')
    expect(markup).toContain('data-game="verifier"')
    expect(markup).not.toContain('The Verifier')
    expect(render(h(Game, { placement: 'embed' }))).toMatch(/<h3 id="[^"]+" class="es-type-heading">The Tasting<\/h3>/)
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'exact' }))).toContain('Make it exact · practice')
    expect(render(h(Game, { level: 'gamma' }))).toContain('How far ahead · practice')
    expect(render(h(Game, { level: 'first-1-fill' }))).toContain('What the chef keeps · practice')
    expect(render(h(Game, { level: 'constructor' }))).toContain('What the chef keeps · practice')
  })

  test('has Play and Debrief, the keys button, no view switch (the game has no 3D scene yet), and the six levels in a rail', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('>Play</button>')
    expect(markup).toContain('>Debrief</button>')
    expect(markup).toContain('>Keys</button>')
    expect(markup).not.toContain('aria-label="View"')
    expect(markup).not.toContain('3D view')
    expect(markup).toContain('data-surface="2d"')
    const rail = markup.slice(markup.indexOf('aria-label="Levels of The Tasting"'))
    for (const title of ['What the chef keeps', 'Make it exact', 'A run of plates', 'The favourite and the copier', 'Five rules to audit', 'How far ahead']) expect(rail).toContain(title)
    expect(rail).toContain('aria-current="step"')
    expect(count(rail, /\(can be graded\)/g)).toBe(3)
  })

  test('keeps the notional-machine card to hand, in its three parts, with its numbers as synthetic Readouts', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('What this world models')
    for (const part of ['Models.', 'Ignores.', 'Calibrated against.']) expect(markup).toContain(part)
    expect(count(markup.slice(markup.indexOf('data-verifier-card')), /data-tag="synthetic"/g)).toBe(2)
  })

  test('a graded run opens on a seed drawn at the start, with no undo and no meter, and says so', () => {
    const markup = render(h(Game, { level: 'exact', mode: 'graded' }))
    expect(markup).toContain('Make it exact · graded')
    expect(markup).not.toContain('>Undo<')
    expect(markup).not.toContain('Start from p')
    expect(markup).not.toContain('Draw 10')
    expect(markup).toContain('A graded run: fresh numbers, no undo, no live meter, one submission.')
    // A level that cannot be graded opens in practice whatever it is asked.
    expect(render(h(Game, { level: 'overlap', mode: 'graded' }))).toContain('What the chef keeps · practice')
    expect(render(h(Game, { level: 'exact' }))).toContain('>Undo<')
  })
})

describe('the controls are HTML for every action', () => {
  const controls = (state: VerifierState, over = {}) => render(h(Controls, { run: fakeRun(state, over) }))

  test('`overlap` and `chain` ask for a number on a field with its label and its hint, and a Commit', () => {
    const plates = controls(stateAfter(buildLevel('overlap', 0)))
    expect(plates).toContain('Plates kept')
    expect(plates).toContain('Of the sixty-four. Count the plates both stacks share.')
    expect(plates).toContain('>Commit<')
    expect(plates).toMatch(/type="number"[^>]*min="0"[^>]*max="64"/)
    const tokens = controls(stateAfter(buildLevel('chain', 1)))
    expect(tokens).toContain('Courses per round')
    expect(tokens).toMatch(/type="number"[^>]*step="0.001"/)
  })

  test('once a prediction is in, the learner draws rounds and finishes, in batches of 10, 100 and 1,000', () => {
    const markup = controls(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))
    for (const label of ['Draw 10', 'Draw 100', 'Draw 1,000', 'Finish']) expect(markup).toContain(`>${label}<`)
    expect(markup).toContain('aria-keyshortcuts="D"')
    expect(markup).toContain('Your prediction is committed.')
  })

  test('`greedy-ngram` asks the temperature-0 question with two buttons, and then for a recipe', () => {
    const judge = controls(stateAfter(buildLevel('greedy-ngram', 0)))
    expect(judge).toContain('aria-label="At temperature zero, is the copier&#x27;s plate kept?"')
    expect(judge).toContain('>Kept<')
    expect(judge).toContain('>Sent back<')
    expect(controls(stateAfter(buildLevel('greedy-ngram', 0), { t: 'judge', kept: true }))).toContain('Recipe weights, one for each dish')
  })

  test('the recipe is a weight for each dish, each a field with a plate on either side that a reader names without repeating the field\'s name', () => {
    const markup = controls(stateAfter(buildLevel('exact', 0)))
    expect(count(markup, /type="number"/g)).toBe(6)
    for (const name of DISHES) {
      expect(markup).toContain(`aria-label="Recipe weight for ${name}"`)
      expect(markup).toContain(`aria-label="Add one to ${name}"`)
      expect(markup).toContain(`aria-label="Take one from ${name}"`)
    }
    expect(count(markup, /tabindex="-1"/g)).toBe(12)
    expect(markup).toContain('data-vf-autofocus')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Submit the recipe<\/button>|disabled=""[^>]*aria-keyshortcuts="Enter"[^>]*>Submit the recipe/)
    expect(markup).toContain('Start from p')
    expect(markup).toContain('Start from q')
  })

  test('a graded recipe offers neither the presets nor the draws, which would give the meter back', () => {
    const state = stateAfter(buildLevel('exact', 0), { t: 'sculpt', token: 0, delta: 3 })
    const markup = controls(state, { mode: 'graded' })
    expect(markup).not.toContain('Start from')
    expect(markup).not.toContain('Draw ')
    expect(markup).toContain('Submit the recipe')
    expect(controls(state)).toContain('Draw 100')
  })

  test('`mutants` deals five cards, each with its rule in two lines, its two instruments, and a choice of the five bugs', () => {
    const markup = controls(stateAfter(buildLevel('mutants', 0)))
    expect(count(markup, /data-vf-card="/g)).toBe(5)
    expect(count(markup, /<select/g)).toBe(5)
    expect(count(markup, /Check every coin/g)).toBe(5)
    expect(count(markup, />Taste 20,000</g)).toBe(5)
    expect(count(markup, /<option value="[a-z-]+"/g)).toBe(5 * MUTANT_IDS.length)
    for (const bug of MUTANT_IDS) expect(markup).toContain(`value="${bug}"`)
    expect(markup).toContain('Name the bug in every card first.')
    for (const bug of MUTANT_IDS) expect(markup).not.toContain(`data-bug="${bug}"`)
  })

  test('`gamma` has one stepper for the draft length, from 1 to 8, and a Serve it', () => {
    const markup = controls(stateAfter(buildLevel('gamma', 0)))
    expect(markup).toContain('aria-label="Draft length, plates ahead"')
    expect(markup).toMatch(/type="number"[^>]*min="1"[^>]*max="8"/)
    expect(markup).toContain('>Serve it<')
  })

  test('every control has a name a reader can say, and the level\'s prompt is on the page with no digit in it', () => {
    for (const [id, seed] of PRACTICE) {
      const markup = controls(stateAfter(buildLevel(id, seed)))
      expect(markup).toContain('data-verifier-prompt')
      // A prompt holds no figure of the world; the one digit it may hold is the 1 of the paper's rule, min(1, p ÷ q).
      const prompt = buildLevel(id, seed).prompt.replace('min(1, p ÷ q)', '')
      expect(/\d/.test(prompt)).toBe(false)
      for (const button of markup.match(/<button[^>]*>.*?<\/button>/g) ?? []) {
        const named = /aria-label="[^"]+"/.test(button) || />[^<]*[A-Za-z0-9+−][^<]*<|><\/?span[^>]*>[^<]*[A-Za-z]/.test(button) || /sr-only/.test(button)
        expect([id, button.slice(0, 60), named]).toEqual([id, button.slice(0, 60), true])
      }
    }
  })
})

describe('the mirror lists everything the drawing shows', () => {
  const mirror = (state: VerifierState, over = {}) => render(h(Mirror, { run: fakeRun(state, over) }))
  const tableIds = (markup: string) => markup.match(/<table id="[^"]+"/g) ?? []

  test('a single tasting is one table with a row for each dish, p and q first, and the other columns once the level lets them print', () => {
    const before = mirror(stateAfter(buildLevel('overlap', 0)))
    expect(count(before, /<tr[^>]*role="row"[^>]*>/g)).toBe(1 + 6)
    expect(before).toContain('soup')
    expect(before).not.toContain('min(p, q)')
    expect(before).not.toContain('α =')
    const after = mirror(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))
    expect(after).toContain('min(p, q)')
    expect(after).toContain('(p − q)⁺')
    expect(after).toContain('(q − p)⁺')
    expect(after).toContain('The chef keeps')
    expect(after).toContain('α = 19/32')
  })

  test('a run of drafts is a table for each plate and one for the chef\'s extra course, and the first holds the mirror\'s id', () => {
    const markup = mirror(stateAfter(buildLevel('chain', 1), { t: 'commit', prediction: 2400 }))
    const level = buildLevel('chain', 1)
    expect(count(markup, /<table /g)).toBe(level.q.length + 1)
    expect(tableIds(markup)).toEqual(['<table id="mirror"'])
    expect(markup).toContain("the chef&#x27;s extra course")
    expect(markup).toContain('Mirror · plate 1')
  })

  test('the recipe and the exact output join the table of `exact`, with the output\'s error from p, to two decimals', () => {
    const level = buildLevel('exact', 0)
    const wrong = mirror(stateAfter(level, { t: 'preset', from: 'p' }))
    for (const head of ['Recipe', 'Output', 'Error']) expect(wrong).toContain(head)
    expect(wrong).toContain('Distance from the chef&#x27;s tasting 133/1024 (exact).')
    expect(wrong).toContain('5.34')
    expect(wrong).toContain('−4.66')
    expect(mirror(stateAfter(level, ...sculptActions(excessPlates(level))))).toContain('Distance from the chef&#x27;s tasting 0 (exact).')
  })

  test('a graded run lists p, q and the recipe, and says nothing of the overlap, the excess, the exact output or the distance while it is on', () => {
    const level = buildLevel('exact', 0)
    const markup = mirror(stateAfter(level, { t: 'preset', from: 'p' }), { mode: 'graded' })
    for (const withheld of ['min(p, q)', '(p − q)⁺', '(q − p)⁺', 'Output', 'Error', 'α =', 'Distance from', 'distance from']) expect([withheld, markup.includes(withheld)]).toEqual([withheld, false])
    for (const kept of ['Recipe', '>p<', '>q<']) expect(markup).toContain(kept)
  })

  test('the printer\'s tape prints the prediction, the exact distance and the rounds, each with its tag', () => {
    const level = buildLevel('exact', 0)
    const markup = mirror(stateAfter(level, { t: 'preset', from: 'p' }, { t: 'draw', n: 100 }))
    for (const line of ['distance from her tasting', 'rounds drawn', 'plates kept', 'plates sent back', 'courses per round']) expect(markup).toContain(line)
    expect(markup).toContain('133/1024')
    expect(count(markup.slice(0, markup.indexOf('<table')), /data-tag="synthetic"/g)).toBeGreaterThanOrEqual(5)
    const predicted = mirror(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))
    expect(predicted).toContain('your prediction')
  })

  test('`mutants` lists the five cards with what each instrument found, and `gamma` lists each position\'s acceptance, with the working only in practice', () => {
    const level = buildLevel('mutants', 0)
    // On seed 0 card 1 is the rule that keeps a plate by comparing p and q, and card 2 is the boundary-inclusive comparison.
    const markup = mirror(stateAfter(level, { t: 'taste', card: 0 }, { t: 'coins', card: 0 }, { t: 'taste', card: 1 }))
    expect(count(markup, /Card \d/g)).toBeGreaterThanOrEqual(5)
    expect(markup).toContain(': rejected<')
    expect(markup).toContain(': not rejected<')
    expect(markup).toContain('coins kept')
    expect(tableIds(markup)).toEqual(['<table id="mirror"'])
    const gamma = stateAfter(buildLevel('gamma', 0), { t: 'gamma', k: 3 })
    expect(mirror(gamma)).toContain('Reach')
    expect(mirror(gamma, { mode: 'graded' })).not.toContain('Reach')
    expect(mirror(gamma)).toContain('plates ahead · draft length')
    expect(count(mirror(gamma), /plate [1-8]</g)).toBeGreaterThanOrEqual(8)
  })

  test('every table a page holds is a table, with its roles and its caption, whichever layout the stylesheet gives it', () => {
    for (const [id, seed] of PRACTICE) {
      const markup = mirror(stateAfter(buildLevel(id, seed)))
      for (const table of markup.match(/<table[\s\S]*?<\/table>/g) ?? []) {
        expect(table).toContain('<caption')
        expect(table).toContain('role="columnheader"')
        expect(table).toContain('role="rowheader"')
      }
    }
  })
})

describe('the debrief says what the run did and what the arithmetic says', () => {
  const debrief = (state: VerifierState, extra: Partial<Parameters<typeof Debrief>[0]> = {}) =>
    render(
      h(Debrief, {
        run: fakeRun(state, { done: true }),
        outcome: outcomeOf(state),
        next: { id: 'exact', title: 'Make it exact' },
        onNext: noop,
        onPracticeAgain: noop,
        onNewNumbers: noop,
        onGraded: null,
        ...extra,
      }),
    )
  const house = (id: VerifierLevelId, seed: number) => runOf(id, seed, ...houseActions(buildLevel(id, seed)))

  test('the house\'s run is well tasted on every level, and the page says so, with the one true thing under it', () => {
    for (const [id, seed] of PRACTICE) {
      const markup = debrief(house(id, seed))
      expect([id, markup.includes('Well tasted.')]).toEqual([id, true])
      expect(markup).toContain('Debrief')
      expect(markup).toContain('What to take away')
      expect(markup).toContain('The real engines')
      expect(markup).toContain('Next: Make it exact')
    }
  })

  test('a wrong recipe is not, and the debrief lays the learner\'s recipe against the house\'s, and each wrong rule\'s exact distance with its decimal', () => {
    const level = buildLevel('exact', 0)
    const markup = debrief(stateAfter(level, { t: 'preset', from: 'p' }, { t: 'submit' }))
    expect(markup).toContain('Taste it again.')
    expect(markup).toContain('The dish furthest out is the soup.')
    expect(markup).toContain('Your recipe against the house&#x27;s')
    expect(markup).toContain('133/1024')
    expect(markup).toContain('≈ 0.130')
    for (const rule of ['Re-plate from p, the whole tasting', 'Re-plate from q', 'Re-plate from p with the rejected dish taken out', 'one dish along', 'Keep a plate when p &gt; q, with no coin', 'Keep every plate']) expect(markup).toContain(rule)
    expect(count(markup, /data-tag="synthetic"/g)).toBeGreaterThan(6)
  })

  test('`chain` prints the exact courses per round as a fraction and a decimal, and the naive counts; `gamma` prints the whole sweep with the best marked', () => {
    const chain = debrief(stateAfter(buildLevel('chain', 1), { t: 'commit', prediction: 2485 }, { t: 'submit' }))
    expect(chain).toContain('78561/32768')
    expect(chain).toContain('2.397')
    expect(chain).toContain('Reading every position as the first')
    const gamma = debrief(stateAfter(buildLevel('gamma', 0), { t: 'gamma', k: 3 }, { t: 'submit' }))
    expect(count(gamma, /<tr data-best/g)).toBe(1)
    expect(gamma).toContain('yours')
    expect(gamma).toContain('best')
  })

  test('`mutants` lists each card: what the learner named, the true bug and its distance from p, with the learner\'s right answers marked', () => {
    const level = buildLevel('mutants', 0)
    if (level.id !== 'mutants') throw new Error('not the mutants level')
    const labels: VerifierAction[] = level.cards.map((bug, card): VerifierAction => ({ t: 'label', card, bug: card === 0 ? bug : 'resample-from-p' }))
    const markup = debrief(stateAfter(level, ...labels, { t: 'submit' }))
    expect(markup).toContain('The five cards')
    expect(markup).toContain('(right)')
    expect(count(markup, /Card \d/g)).toBe(5)
  })

  test('the last level\'s debrief points on to the course map, a level that can be graded offers a graded run, and the lab it links is a forge lab', () => {
    const last = debrief(house('gamma', 0), { next: null, onGraded: noop })
    expect(last).toContain('Open the course map')
    expect(last).toContain('Start a graded run')
    expect(debrief(house('overlap', 0))).not.toContain('Start a graded run')
    expect(debrief(house('gamma', 0), { onGraded: noop })).toContain('Play this level again')
    // The rejection-sampler lab (W1-T27) is the lab that the debrief sends a learner to build in, and it has to be a lab of this build.
    expect(isForgeLab('rejection-sampler')).toBe(true)
    expect(last).toContain('href="/labs/rejection-sampler"')
    expect(last).toContain('the rejection-sampler lab')
  })

  test('the real engines\' facts carry their claim ids and the day they were read, and the paper is a link that opens in a new tab and says so', () => {
    const markup = debrief(house('exact', 0))
    expect(markup).toContain('claim vllm.spec.rejection-sampler.exact')
    expect(markup).toContain('read 2026-11-04')
    expect(markup).toContain('href="https://arxiv.org/abs/2211.17192"')
    expect(markup).toContain('(opens in a new tab)')
    expect(debrief(house('mutants', 0))).toContain('claim sglang.spec.pr-35798')
    expect(debrief(house('chain', 1))).toContain('claim spec.paper.expected-tokens')
  })
})

describe('the live region says one sentence for a turn', () => {
  const before = S.view(stateAfter(buildLevel('exact', 0)))
  const line = (a: VerifierAction[], meter = true) => changeLine(before, S.view(stateAfter(buildLevel('exact', 0), ...a)), meter)

  test('a weight, the distance it leaves, and the moment the output is exact', () => {
    expect(line([{ t: 'sculpt', token: 0, delta: 7 }])).toBe('soup: weight 7. Distance from her tasting 1/8.')
    const level = buildLevel('exact', 0)
    const exact = changeLine(S.view(stateAfter(level, ...sculptActions(excessPlates(level)).slice(0, 2))), S.view(stateAfter(level, ...sculptActions(excessPlates(level)))), true)
    expect(exact).toBe("tart: weight 2. What goes out is the chef's tasting exactly.")
  })

  test('a graded run says nothing of the distance while it is on', () => {
    expect(line([{ t: 'sculpt', token: 0, delta: 7 }], false)).toBe('soup: weight 7.')
  })

  test('rounds drawn, a prediction committed, a question answered, a length chosen, a card named', () => {
    const o = S.view(stateAfter(buildLevel('overlap', 0)))
    const c = S.view(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))
    expect(changeLine(o, c, true)).toBe('Committed: 38 plates kept.')
    const d = S.view(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }, { t: 'draw', n: 10 }))
    expect(changeLine(c, d, true)).toMatch(/^Drew 10 rounds: \d+ plates? kept, \d+ plates? sent back\.$/)
    const g0 = S.view(stateAfter(buildLevel('greedy-ngram', 0)))
    expect(changeLine(g0, S.view(stateAfter(buildLevel('greedy-ngram', 0), { t: 'judge', kept: true })), true)).toBe('You called it kept.')
    const y0 = S.view(stateAfter(buildLevel('gamma', 0)))
    expect(changeLine(y0, S.view(stateAfter(buildLevel('gamma', 0), { t: 'gamma', k: 4 })), true)).toBe('Plating 4 courses ahead.')
    const m0 = S.view(stateAfter(buildLevel('mutants', 0)))
    expect(changeLine(m0, S.view(stateAfter(buildLevel('mutants', 0), { t: 'label', card: 1, bug: 'resample-from-q' })), true)).toBe('Card 2 named.')
    expect(changeLine(m0, S.view(stateAfter(buildLevel('mutants', 0), { t: 'taste', card: 0 })), true)).toMatch(/^Card 1 tasted: the chi-square (rejects it|does not reject it)\.$/)
    expect(changeLine(m0, S.view(stateAfter(buildLevel('mutants', 0), { t: 'coins', card: 0 })), true)).toMatch(/^Card 1: /)
  })

  test('a change of level says nothing, and nothing a listener needs to know is not said', () => {
    const other = S.view(stateAfter(buildLevel('gamma', 0)))
    expect(changeLine(before, other, true)).toBe('')
    expect(changeLine(before, before, true)).toBe('')
  })
})

describe('the source keeps the rules of the house', () => {
  const sources = (dir: string): string[] =>
    readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? sources(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
  const files = [...sources('src/games/verifier'), ...sources('packages/play/verifier')]

  test('the direction contract is development-only: its blocks are in the surface brief and in no file the page ships', () => {
    expect(files.length).toBeGreaterThan(15)
    for (const file of files) {
      const text = readFileSync(path.join(root, file), 'utf8')
      for (const marker of ['THESIS:', 'OWN-WORLD:', 'FIRST VIEWPORT:', 'FINISH: unreviewed', 'seed: none (specified surface']) expect([file, marker, text.includes(marker)]).toEqual([file, marker, false])
    }
    const brief = readFileSync(path.join(root, '.impeccable/surfaces/src-games-verifier-game-tsx.md'), 'utf8')
    for (const marker of ['THESIS:', 'OWN-WORLD:', 'STORY:', 'FIRST VIEWPORT:', 'FORM:', 'FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance']) {
      expect([marker, brief.includes(marker)]).toEqual([marker, true])
    }
    expect(brief).toContain('seed: none (specified surface, no roll)')
  })

  test('no file of the page names a literal colour or a face: the roles of src/design are the only palette (tests/design/literals.test.ts holds the whole of src/)', () => {
    for (const file of files.filter((f) => f.startsWith('src/'))) {
      const text = readFileSync(path.join(root, file), 'utf8')
      expect([file, /#[0-9a-fA-F]{6}\b/.test(text)]).toEqual([file, false])
    }
  })

  test('the game keeps its state in the session: no component of the page imports the generator or a clock', () => {
    for (const file of files.filter((f) => f.startsWith('src/'))) {
      const text = readFileSync(path.join(root, file), 'utf8')
      expect([file, /Math\.random|Date\.now|performance\.now/.test(text)]).toEqual([file, false])
    }
  })

  test('a fresh `verifierInit` of every level draws with no help from the page: the same state however it is built', () => {
    for (const [id, seed] of PRACTICE) expect(JSON.stringify(verifierInit(buildLevel(id, seed)))).toBe(JSON.stringify(S.init(S.level(id, seed))))
  })
})
