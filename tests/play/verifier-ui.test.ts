/*
 * The rejection sampler's page as markup, in the instrument frame (REDESIGN §2.6, §2.7, §2.9, §3.5; GAMES.md §2.6, §10; A§6.9, D-048,
 * D-063): what the frame, the diagram, the dock, the table and the result put on the page, rendered on the server so that the structure a
 * screen reader and a stylesheet get can be read. What needs a DOM, a focus, a viewport or a timer (the arrow keys across the weights, focus
 * moving on, the boxes in the first screen, the live region as it speaks) is walked in a browser by e2e/verifier.spec.ts.
 *
 *   - The frame stands in the order of the brief, and the diagram is the default view.
 *   - The diagram draws two bars for each token, 0 to 5: the draft q and the target p, cut into the accepted part min(p, q) and the residual
 *     (p - q)+ where the level lets them print. The words draft and target are on screen in every level.
 *   - The dock offers every action as HTML, and says why a required prediction cannot be skipped.
 *   - The table lists everything the diagram shows. The result's verdict word comes from the grade; its sentences are the engine's words.
 *   - No banned word or phrase in anything the page renders (src/copy/banned.ts).
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { findBanned } from '@/copy/banned'
import { SLOT_MARKS } from '@/design/code'
import { VERIFIER_COPY, partOf, partsOf } from '@es/play/verifier/copy'
import { buildLevel } from '@es/play/verifier/levels'
import { verifierInit, verifierSession } from '@es/play/verifier/session'
import { excessPlates } from '@es/play/verifier/state'
import { DISHES, MUTANT_IDS } from '@es/play/verifier/types'
import type { VerifierAction, VerifierLevelId, VerifierState } from '@es/play/verifier/types'
import { isForgeLab } from '@/forge/ids'
import { changeLine } from '@/games/verifier/announce'
import { WorldCard } from '@/games/verifier/Card'
import { Controls } from '@/games/verifier/Controls'
import { Debrief } from '@/games/verifier/Debrief'
import Game from '@/games/verifier/Game'
import { partRows } from '@/games/verifier/kit'
import { Mirror } from '@/games/verifier/Mirror'
import { ReadoutStrip } from '@/games/verifier/ReadoutStrip'
import { VerifierLegend, View2D } from '@/games/verifier/View2D'
import { PRACTICE, fakeRun, houseActions, outcomeOf, runOf, sculptActions, stateAfter } from './verifier-support'

const root = path.resolve(import.meta.dirname, '../..')
const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/verifier' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const textOf = (markup: string) => markup.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<code>[\s\S]*?<\/code>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
/** What a learner reads in markup: its text, and its aria labels and titles. */
const readOf = (markup: string) => [textOf(markup), ...[...markup.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1])].join('\n')
const S = verifierSession
const noop = () => undefined

describe('the frame stands in the order of REDESIGN §2.6, and the page names the game', () => {
  const markup = render(h(Game, null))

  test('the title strip, the goal line, the diagram and its legend, the dock, the foot strip, the title block and the table, in that order', () => {
    const at = (needle: string) => markup.indexOf(needle)
    const order = ['class="es-frame__strip"', 'class="es-frame__goal-box"', 'data-frame-diagram=""', 'class="es-frame__legend"', 'data-dock=""', 'class="es-frame__foot"', 'es-titleblock', 'data-state-table=""'].map(at)
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  test('the display name, its role line and the level as one control, and no working name', () => {
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-frame__title">Rejection sampler<\/h2><p class="es-frame__role">You are the verifier\.<\/p>/)
    expect(markup).toContain('data-game="verifier"')
    expect(markup).toContain('Level 1 of 6 · Acceptance rate: the overlap of p and q · practice')
    expect(markup).not.toContain('The Verifier')
    expect(render(h(Game, { placement: 'embed' }))).toMatch(/<h3 id="[^"]+" class="es-frame__title">Rejection sampler<\/h3>/)
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'exact' }))).toContain('Level 2 of 6 · Resample from the residual · practice')
    expect(render(h(Game, { level: 'gamma' }))).toContain('Level 6 of 6 · Choose γ · practice')
    expect(render(h(Game, { level: 'first-1-fill' }))).toContain('Level 1 of 6')
    expect(render(h(Game, { level: 'constructor' }))).toContain('Level 1 of 6')
  })

  test('the diagram is the default view; 3D is one switch away on the chain, and not offered where one draft position leaves depth empty', () => {
    expect(markup).toContain('data-view="2d"')
    expect(markup).toContain('data-surface="2d"')
    expect(markup).not.toContain('>3D</button>')
    const chain = render(h(Game, { level: 'chain' }))
    expect(chain).toMatch(/aria-pressed="true"[^>]*>Diagram<\/button>/)
    expect(chain).toContain('>3D</button>')
  })

  test('has Parts, How to play and Keyboard, and the model card under "What this model leaves out"', () => {
    for (const word of ['>Parts<', '>How to play<', '>Keyboard<', 'What this model leaves out']) expect(markup).toContain(word)
    expect(markup).toContain('Model of a rejection sampler, after vLLM v0.33.0')
  })

  test('the model card is in three parts, with its numbers as synthetic or estimated Readouts', () => {
    const card = render(h(WorldCard))
    for (const part of ['Models.', 'Ignores.', 'Calibrated against.']) expect(card).toContain(part)
    expect(count(card, /data-tag="synthetic"/g)).toBe(2)
    expect(count(card, /data-tag="estimated"/g)).toBe(1)
  })

  test('a graded run opens on a seed drawn at the start, with no undo and no live distance, and says so', () => {
    const graded = render(h(Game, { level: 'exact', mode: 'graded' }))
    expect(graded).toContain('Level 2 of 6 · Resample from the residual · graded')
    expect(graded).not.toContain('>Undo<')
    expect(graded).not.toContain('Start from p')
    expect(graded).not.toContain('Draw 10')
    expect(graded).toContain('Graded: fresh numbers, no undo, no live distance, one submission.')
    // A level that cannot be graded opens in practice whatever it is asked.
    expect(render(h(Game, { level: 'overlap', mode: 'graded' }))).toContain('Level 1 of 6 · Acceptance rate: the overlap of p and q · practice')
    expect(render(h(Game, { level: 'exact' }))).toContain('>Undo<')
  })

  test('every level has a goal line in four parts', () => {
    for (const [id] of PRACTICE) {
      const goal = VERIFIER_COPY[id].goal
      for (const part of [goal.aim, goal.controls, goal.beat, goal.ends]) expect([id, typeof part === 'string' && part.length > 10]).toEqual([id, true])
      expect(render(h(Game, { level: id }))).toContain('es-goal')
    }
  })
})

describe('the diagram draws two bars for each token, numbered 0 to 5', () => {
  const diagram = (state: VerifierState, over = {}) => render(h(View2D, { run: fakeRun(state, over) }))
  const legend = (state: VerifierState, over = {}) => render(h(VerifierLegend, { run: fakeRun(state, over) }))

  test('the six tokens are numbered 0 to 5, and each has a draft bar and a target bar', () => {
    expect([...DISHES]).toEqual(['token 0', 'token 1', 'token 2', 'token 3', 'token 4', 'token 5'])
    const markup = diagram(stateAfter(buildLevel('overlap', 0)))
    for (const name of DISHES) expect(markup).toContain(`>${name}<`)
    expect(count(markup, /data-vf-token="/g)).toBe(6)
    expect(count(markup, /es-vf__bar" data-kind="draft"/g)).toBe(6)
    expect(count(markup, /es-vf__bar" data-kind="target"/g)).toBe(6)
    expect(markup).toContain('aria-hidden="true"')
  })

  test('the four labels, each with its colour and glyph, once the level lets the decomposition print', () => {
    const markup = legend(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))
    for (const word of ['draft q', 'target p', 'accepted min(p, q)', 'residual (p − q)⁺']) expect(markup).toContain(word)
    expect(count(markup, /data-glyph="/g)).toBe(4)
    // Each slot's own glyph, as the design system's code gives it (src/design/code.ts): draft yellow, target blue, accepted green, residual red.
    for (const slot of ['yellow', 'blue', 'green', 'red'] as const) expect(markup).toContain(`data-glyph="${SLOT_MARKS[slot].glyph}"`)
    for (const slot of ['yellow', 'blue', 'green', 'red']) expect(markup).toContain(`--es-cat-${slot}`)
  })

  test('the words draft and target are on screen in every level, before and after any answer, and in a graded run', () => {
    for (const [id, seed] of PRACTICE) {
      for (const over of [{}, { mode: 'graded' as const }]) {
        const markup = legend(stateAfter(buildLevel(id, seed)), over)
        expect([id, /draft/i.test(textOf(markup)), /target/i.test(textOf(markup))]).toEqual([id, true, true])
      }
      const page = textOf(render(h(Game, { level: id })))
      expect([id, /draft/i.test(page), /target/i.test(page)]).toEqual([id, true, true])
    }
  })

  test('before the prediction the bars are whole, and after it they are cut into the accepted part and the residual', () => {
    const before = diagram(stateAfter(buildLevel('overlap', 0)))
    expect(before).not.toContain('data-part="accepted"')
    expect(before).toContain('α, the accepted share: to find')
    const after = diagram(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))
    expect(after).toContain('data-part="accepted"')
    expect(after).toContain('data-part="residual"')
    expect(after).toContain('data-part="draft"')
    expect(after).toContain('α = <span class="font-numeric">38</span> of 64 = <span class="font-numeric">19/32</span>')
  })

  test('a graded run draws the plain bars and no output, and a practice run draws the output as a ring on the target bar', () => {
    const state = stateAfter(buildLevel('exact', 0), { t: 'preset', from: 'p' })
    expect(diagram(state, { mode: 'graded' })).not.toContain('es-vf__out')
    expect(diagram(state, { mode: 'graded' })).not.toContain('data-part="accepted"')
    expect(diagram(state)).toContain('es-vf__out')
    expect(legend(state)).toContain('output of the sampler')
    expect(legend(state, { mode: 'graded' })).not.toContain('output of the sampler')
  })

  test('a drawn round is a dot on a draft bar, solid or hollow', () => {
    const markup = diagram(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }, { t: 'draw', n: 10 }))
    expect(count(markup, /es-vf__dot/g)).toBeGreaterThan(0)
    expect(legend(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }, { t: 'draw', n: 10 }))).toContain('es-vf__dotkey')
  })

  test('a run of drafts is a row for each draft position and one for the bonus token; the draft-length level has a bar for each position', () => {
    const level = buildLevel('chain', 1)
    const markup = diagram(stateAfter(level, { t: 'commit', prediction: 2400 }))
    expect(count(markup, /data-vf-row="/g)).toBe(level.q.length + 1)
    expect(markup).toContain('draft position 1')
    expect(markup).toContain('the bonus token')
    const gamma = diagram(stateAfter(buildLevel('gamma', 0), { t: 'gamma', k: 3 }))
    expect(count(gamma, /data-vf-token="/g)).toBe(8)
    expect(gamma).toContain('drafting 3')
  })

  test('a tap on a token column hands focus to its weight, while there are weights to set', () => {
    expect(count(diagram(stateAfter(buildLevel('exact', 0))), /data-tap="true"/g)).toBe(6)
    expect(diagram(stateAfter(buildLevel('overlap', 0)))).not.toContain('data-tap')
  })
})

describe('the parts table', () => {
  test('every level draws parts, each with a name, a sentence and a claim that exists, and the parts list reads the same rows', () => {
    const claims = readFileSync(path.join(root, 'content/claims/worlds/references.yaml'), 'utf8') + readFileSync(path.join(root, 'content/claims/worlds/engines.yaml'), 'utf8') + readFileSync(path.join(root, 'content/claims/vllm/spec.yaml'), 'utf8')
    for (const [id] of PRACTICE) {
      const parts = partsOf(id)
      expect(parts.length).toBeGreaterThanOrEqual(5)
      for (const part of parts) {
        expect([id, part.id, part.name.length > 2, part.sentence.length > 20]).toEqual([id, part.id, true, true])
        if (part.claim !== undefined) expect([part.claim, claims.includes(`id: ${part.claim}\n`)]).toEqual([part.claim, true])
      }
      // The parts list, the intro and the popover read the kit's rows, which are these rows, in this order.
      expect(partRows(id).map((row) => [row.id, row.name])).toEqual(parts.map((part) => [part.id, part.name]))
    }
  })

  test('the first parts are the models and the tokens, then what the bars are cut into', () => {
    expect(partsOf('overlap').map((part) => part.id).slice(0, 5)).toEqual(['draft', 'target', 'token', 'accepted', 'residual'])
    expect(partOf('residual')?.engine).toBe('recovered')
    expect(partsOf('gamma').map((part) => part.id)).not.toContain('token')
  })
})

describe('the dock is HTML for every action', () => {
  const controls = (state: VerifierState, over = {}) => render(h(Controls, { run: fakeRun(state, over) }))

  test('`overlap` and `chain` ask for a number on a field with its label and its hint, and a Commit, and say why there is no skip', () => {
    const shares = controls(stateAfter(buildLevel('overlap', 0)))
    expect(shares).toContain('Accepted, in sixty-fourths')
    expect(shares).toContain('Of the 64. Count what the draft and the target bars share, token by token.')
    expect(shares).toContain('>Commit<')
    expect(shares).toMatch(/type="number"[^>]*min="0"[^>]*max="64"/)
    expect(shares).toContain('No skip here: the grade needs your prediction before any round is drawn')
    expect(shares).not.toContain('Skip')
    const tokens = controls(stateAfter(buildLevel('chain', 1)))
    expect(tokens).toContain('Tokens per round')
    expect(tokens).toMatch(/type="number"[^>]*step="0.001"/)
    expect(tokens).toContain('No skip here')
  })

  test('the level\'s own ask waits for the parts and the look, and is in the dock once they are named', () => {
    const held = controls(stateAfter(buildLevel('overlap', 0)), { intro: { askShown: false, ring: null } })
    expect(held).toContain('The first decision opens once the parts are named')
    expect(held).not.toContain('>Commit<')
  })

  test('once a prediction is in, the learner draws rounds and finishes, in batches of 10, 100 and 1,000', () => {
    const markup = controls(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))
    for (const label of ['Draw 10', 'Draw 100', 'Draw 1,000', 'Finish']) expect(markup).toContain(`>${label}<`)
    expect(markup).toContain('aria-keyshortcuts="D"')
    expect(markup).toContain('Your prediction is committed.')
  })

  test('the amber ring is on the level\'s first move, Draw 10, and on no other control', () => {
    const markup = controls(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }), { intro: { askShown: true, ring: { t: 'draw', n: 10 } } })
    expect(count(markup, /es-vf-dock__ring/g)).toBe(1)
    expect(markup.indexOf('es-vf-dock__ring')).toBeLessThan(markup.indexOf('Draw 10'))
    expect(markup.indexOf('es-vf-dock__ring')).toBeGreaterThan(markup.indexOf('aria-label="Draw rounds"'))
  })

  test('`greedy-ngram` asks the temperature-0 question with two buttons, and then for the weights', () => {
    const judge = controls(stateAfter(buildLevel('greedy-ngram', 0)))
    expect(judge).toContain('aria-label="At temperature zero, is the n-gram&#x27;s token accepted?"')
    expect(judge).toContain('>Accepted<')
    expect(judge).toContain('>Rejected<')
    expect(controls(stateAfter(buildLevel('greedy-ngram', 0), { t: 'judge', kept: true }))).toContain('Resample weights, one for each token')
  })

  test('the weights are a field for each token, each with a button on either side that a reader names without repeating the field\'s name', () => {
    const markup = controls(stateAfter(buildLevel('exact', 0)))
    expect(count(markup, /type="number"/g)).toBe(6)
    for (const name of DISHES) {
      expect(markup).toContain(`aria-label="Resample weight for ${name}"`)
      expect(markup).toContain(`aria-label="Add one to ${name}"`)
      expect(markup).toContain(`aria-label="Take one from ${name}"`)
    }
    expect(count(markup, /tabindex="-1"/g)).toBe(12)
    expect(markup).toContain('data-vf-autofocus')
    expect(markup).toContain('Submit the weights')
    expect(markup).toContain('Start from p')
    expect(markup).toContain('Start from q')
  })

  test('graded weights offer neither the presets nor the draws, which would give the meter back', () => {
    const state = stateAfter(buildLevel('exact', 0), { t: 'sculpt', token: 0, delta: 3 })
    const markup = controls(state, { mode: 'graded' })
    expect(markup).not.toContain('Start from')
    expect(markup).not.toContain('Draw ')
    expect(markup).toContain('Submit the weights')
    expect(controls(state)).toContain('Draw 100')
  })

  test('`mutants` deals five cards, each with its rule in two lines, its two instruments, and a choice of the five bugs', () => {
    const markup = controls(stateAfter(buildLevel('mutants', 0)))
    expect(count(markup, /data-vf-card="/g)).toBe(5)
    expect(count(markup, /<select/g)).toBe(5)
    expect(count(markup, /Check every draw/g)).toBe(5)
    expect(count(markup, />Sample 20,000</g)).toBe(5)
    expect(count(markup, /<option value="[a-z-]+"/g)).toBe(5 * MUTANT_IDS.length)
    for (const bug of MUTANT_IDS) expect(markup).toContain(`value="${bug}"`)
    expect(markup).toContain('Name the bug in every card first.')
    for (const bug of MUTANT_IDS) expect(markup).not.toContain(`data-bug="${bug}"`)
  })

  test('`gamma` has one stepper for the draft length, from 1 to 8, and a Submit', () => {
    const markup = controls(stateAfter(buildLevel('gamma', 0)))
    expect(markup).toContain('aria-label="Draft length, tokens proposed"')
    expect(markup).toMatch(/type="number"[^>]*min="1"[^>]*max="8"/)
    expect(markup).toContain('>Submit γ<')
  })

  test('every control has a name a reader can say, and the level\'s prompt has no digit in it', () => {
    for (const [id, seed] of PRACTICE) {
      const markup = controls(stateAfter(buildLevel(id, seed)))
      expect(markup).toContain('data-verifier-prompt')
      // A prompt holds no figure of the world; the one digit it may hold is the 1 of the paper's rule, min(1, p ÷ q).
      const prompt = VERIFIER_COPY[id].prompt.replace('min(1, p ÷ q)', '')
      expect(/\d/.test(prompt)).toBe(false)
      for (const button of markup.match(/<button[^>]*>.*?<\/button>/g) ?? []) {
        const named = /aria-label="[^"]+"/.test(button) || />[^<]*[A-Za-z0-9+−][^<]*<|><\/?span[^>]*>[^<]*[A-Za-z]/.test(button) || /sr-only/.test(button)
        expect([id, button.slice(0, 60), named]).toEqual([id, button.slice(0, 60), true])
      }
    }
  })
})

describe('the readout strip counts the run in five numbers with one stamp', () => {
  const strip = (state: VerifierState, over = {}) => render(h(ReadoutStrip, { view: fakeRun(state, over).view, meter: over && !('mode' in over) }))

  test('rounds drawn, accepted, rejected, the accepted share and the level\'s fifth', () => {
    const markup = strip(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }, { t: 'draw', n: 100 }))
    for (const label of ['rounds drawn', 'accepted', 'rejected', 'accepted share', 'tokens a round']) expect(markup).toContain(`>${label}<`)
    expect(count(markup, /data-tag="synthetic"|es-stamp/g)).toBeGreaterThanOrEqual(1)
    expect(markup).toContain('data-readout-id="share"')
  })

  test('`exact` counts the distance from p, `mutants` the cards named, and `gamma` the draft length and its speedup', () => {
    expect(strip(stateAfter(buildLevel('exact', 0), { t: 'preset', from: 'p' }))).toContain('distance from p')
    expect(strip(stateAfter(buildLevel('mutants', 0)))).toContain('cards named')
    const gamma = strip(stateAfter(buildLevel('gamma', 0), { t: 'gamma', k: 3 }))
    for (const label of ['draft length γ', 'speedup']) expect(gamma).toContain(label)
  })
})

describe('the table lists everything the diagram shows', () => {
  const mirror = (state: VerifierState, over = {}) => render(h(Mirror, { run: fakeRun(state, over) }))
  const tableIds = (markup: string) => markup.match(/<table id="[^"]+"/g) ?? []

  test('a single draft position is one table with a row for each token, p and q first, and the other columns once the level lets them print', () => {
    const before = mirror(stateAfter(buildLevel('overlap', 0)))
    expect(count(before, /<tr[^>]*role="row"[^>]*>/g)).toBe(1 + 6)
    expect(before).toContain('token 0')
    expect(before).not.toContain('min(p, q)')
    expect(before).not.toContain('α =')
    const after = mirror(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))
    expect(after).toContain('min(p, q)')
    expect(after).toContain('(p − q)⁺')
    expect(after).toContain('(q − p)⁺')
    expect(after).toContain('The target accepts')
    expect(after).toContain('α = 19/32')
  })

  test('a run of drafts is a table for each draft position and one for the bonus token, and the first holds the id', () => {
    const markup = mirror(stateAfter(buildLevel('chain', 1), { t: 'commit', prediction: 2400 }))
    const level = buildLevel('chain', 1)
    expect(count(markup, /<table /g)).toBe(level.q.length + 1)
    expect(tableIds(markup)).toEqual(['<table id="mirror"'])
    expect(markup).toContain('The bonus token')
    expect(markup).toContain('draft position 1')
  })

  test('the weights and the exact output join the table of `exact`, with the output\'s error from p, to two decimals', () => {
    const level = buildLevel('exact', 0)
    const wrong = mirror(stateAfter(level, { t: 'preset', from: 'p' }))
    for (const head of ['Weight', 'Output', 'Error']) expect(wrong).toContain(head)
    expect(wrong).toContain('Distance of the output from p 133/1024 (exact).')
    expect(wrong).toContain('5.34')
    expect(wrong).toContain('−4.66')
    expect(mirror(stateAfter(level, ...sculptActions(excessPlates(level))))).toContain('Distance of the output from p 0 (exact).')
  })

  test('a graded run lists p, q and the weights, and says nothing of the overlap, the excess, the exact output or the distance while it is on', () => {
    const level = buildLevel('exact', 0)
    const markup = mirror(stateAfter(level, { t: 'preset', from: 'p' }), { mode: 'graded' })
    for (const withheld of ['min(p, q)', '(p − q)⁺', '(q − p)⁺', 'Output', 'Error', 'α =', 'Distance of', 'distance from']) expect([withheld, markup.includes(withheld)]).toEqual([withheld, false])
    for (const kept of ['Weight', '>p<', '>q<']) expect(markup).toContain(kept)
  })

  test('the run so far lists the prediction, the distance and the rounds, each with its tag', () => {
    const level = buildLevel('exact', 0)
    const markup = mirror(stateAfter(level, { t: 'preset', from: 'p' }, { t: 'draw', n: 100 }))
    for (const line of ['distance from p', 'rounds drawn', 'draft tokens accepted', 'draft tokens rejected', 'tokens per round']) expect(markup).toContain(line)
    expect(markup).toContain('133/1024')
    expect(count(markup.slice(0, markup.indexOf('<table')), /data-tag="synthetic"/g)).toBeGreaterThanOrEqual(5)
    expect(mirror(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))).toContain('your prediction')
  })

  test('`mutants` lists the five cards with what each instrument found, and `gamma` lists each position\'s acceptance, with the working only in practice', () => {
    const level = buildLevel('mutants', 0)
    const markup = mirror(stateAfter(level, { t: 'taste', card: 0 }, { t: 'coins', card: 0 }, { t: 'taste', card: 1 }))
    expect(count(markup, /Card \d/g)).toBeGreaterThanOrEqual(5)
    expect(markup).toContain(': rejected<')
    expect(markup).toContain(': not rejected<')
    expect(markup).toContain('draws accepted')
    expect(tableIds(markup)).toEqual(['<table id="mirror"'])
    const gamma = stateAfter(buildLevel('gamma', 0), { t: 'gamma', k: 3 })
    expect(mirror(gamma)).toContain('Reach')
    expect(mirror(gamma, { mode: 'graded' })).not.toContain('Reach')
    expect(mirror(gamma)).toContain('draft length γ')
    expect(count(mirror(gamma), /draft position [1-8]</g)).toBeGreaterThanOrEqual(8)
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

describe('the result says what the run did and what the arithmetic says', () => {
  const debrief = (state: VerifierState, extra: Partial<Parameters<typeof Debrief>[0]> = {}) =>
    render(
      h(Debrief, {
        run: fakeRun(state, { done: true }),
        outcome: outcomeOf(state),
        next: { id: 'exact', title: 'Resample from the residual' },
        onNext: noop,
        onGraded: null,
        ...extra,
      }),
    )
  const house = (id: VerifierLevelId, seed: number) => runOf(id, seed, ...houseActions(buildLevel(id, seed)))

  test('the reference\'s run passes or finishes on every level, and the page says so with the verdict word of the grade, and the one true thing under it', () => {
    for (const [id, seed] of PRACTICE) {
      const markup = debrief(house(id, seed))
      const word = VERIFIER_COPY[id].passRule === undefined ? 'Finished (practice)' : 'Passed'
      expect([id, markup.includes(`>${word}</h3>`)]).toEqual([id, true])
      expect(markup).toContain('data-vf-takeaway')
      expect(markup).toContain('In vLLM today')
      expect(markup).toContain('Next level: Resample from the residual')
    }
  })

  test('a wrong answer is Not yet, the debrief lays the learner\'s weights against the reference\'s, and each wrong rule\'s exact distance with its decimal', () => {
    const level = buildLevel('exact', 0)
    const markup = debrief(stateAfter(level, { t: 'preset', from: 'p' }, { t: 'submit' }))
    expect(markup).toContain('>Not yet</h3>')
    expect(markup).toContain('The token furthest out is named under the sentence.')
    expect(markup).toMatch(/The token furthest out<\/dt><dd><strong>token 0<\/strong>/)
    expect(markup).toContain('Your weights against the reference&#x27;s')
    expect(markup).toContain('133/1024')
    expect(markup).toContain('≈ 0.130')
    for (const rule of ['Resample from p, the whole target', 'Resample from q, the draft', 'with the rejected token taken out', 'one token along', 'Accept when p &gt; q, with no random draw', 'Accept every draft token']) expect(markup).toContain(rule)
    // One stamp per instrument (the Quiet Provenance Rule): the readout's, outside the result, and none in the result's sentences.
    expect(markup).not.toContain('es-stamp')
    expect(markup).toContain('The figures below are of a made-up world.')
  })

  test('`chain` prints the exact tokens per round as a fraction and a decimal, and the naive counts; `gamma` prints the whole sweep with the best marked', () => {
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

  test('the last level\'s result points on to the course, a level that can be graded offers a graded run, a lesson\'s run never leaves the lesson, and the lab it links is a forge lab', () => {
    const last = debrief(house('gamma', 0), { next: null, onGraded: noop })
    expect(last).toContain('Open the course')
    expect(last).toContain('Start a graded run')
    expect(debrief(house('overlap', 0))).not.toContain('Start a graded run')
    expect(debrief(house('gamma', 0), { onGraded: noop })).toContain('Run again')
    expect(isForgeLab('rejection-sampler')).toBe(true)
    expect(last).toContain('href="/labs/rejection-sampler"')
    expect(last).toContain('the rejection-sampler lab')
    const inLesson = debrief(house('overlap', 0), { next: null, embedded: true })
    expect(inLesson).not.toContain('Open the course')
    expect(inLesson).not.toContain('/labs/rejection-sampler')
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
    expect(line([{ t: 'sculpt', token: 0, delta: 7 }])).toBe('token 0: weight 7. Distance from p 1/8.')
    const level = buildLevel('exact', 0)
    const exact = changeLine(S.view(stateAfter(level, ...sculptActions(excessPlates(level)).slice(0, 2))), S.view(stateAfter(level, ...sculptActions(excessPlates(level)))), true)
    expect(exact).toBe('token 5: weight 2. The output is p exactly.')
  })

  test('a graded run says nothing of the distance while it is on', () => {
    expect(line([{ t: 'sculpt', token: 0, delta: 7 }], false)).toBe('token 0: weight 7.')
  })

  test('rounds drawn, a prediction committed, a question answered, a length chosen, a card named', () => {
    const o = S.view(stateAfter(buildLevel('overlap', 0)))
    const c = S.view(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }))
    expect(changeLine(o, c, true)).toBe('Committed: 38 of 64 accepted.')
    const d = S.view(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }, { t: 'draw', n: 10 }))
    expect(changeLine(c, d, true)).toMatch(/^Drew 10 rounds: \d+ accepted, \d+ rejected\.$/)
    const g0 = S.view(stateAfter(buildLevel('greedy-ngram', 0)))
    expect(changeLine(g0, S.view(stateAfter(buildLevel('greedy-ngram', 0), { t: 'judge', kept: true })), true)).toBe('You said it is accepted.')
    const y0 = S.view(stateAfter(buildLevel('gamma', 0)))
    expect(changeLine(y0, S.view(stateAfter(buildLevel('gamma', 0), { t: 'gamma', k: 4 })), true)).toBe('Drafting 4 tokens a round.')
    const m0 = S.view(stateAfter(buildLevel('mutants', 0)))
    expect(changeLine(m0, S.view(stateAfter(buildLevel('mutants', 0), { t: 'label', card: 1, bug: 'resample-from-q' })), true)).toBe('Card 2 named.')
    expect(changeLine(m0, S.view(stateAfter(buildLevel('mutants', 0), { t: 'taste', card: 0 })), true)).toMatch(/^Card 1 sampled: the chi-square (rejects it|does not reject it)\.$/)
    expect(changeLine(m0, S.view(stateAfter(buildLevel('mutants', 0), { t: 'coins', card: 0 })), true)).toMatch(/^Card 1: /)
  })

  test('a change of level says nothing, and nothing a listener needs to know is not said', () => {
    const other = S.view(stateAfter(buildLevel('gamma', 0)))
    expect(changeLine(before, other, true)).toBe('')
    expect(changeLine(before, before, true)).toBe('')
  })
})

describe('no banned word or phrase in anything a learner reads', () => {
  test('the frame, the diagram, the dock, the table and the result of every level, graded and in practice, at the start and at the end', () => {
    const found: string[] = []
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      const states = [stateAfter(level), runOf(id, seed, ...houseActions(level))]
      const answered = id === 'overlap' || id === 'chain' ? [stateAfter(level, { t: 'commit', prediction: id === 'overlap' ? 38 : 2400 }, { t: 'draw', n: 100 })] : id === 'exact' ? [stateAfter(level, { t: 'preset', from: 'p' }, { t: 'draw', n: 10 })] : id === 'mutants' ? [stateAfter(level, { t: 'taste', card: 0 }, { t: 'coins', card: 0 })] : []
      for (const state of [...states, ...answered]) {
        for (const over of [{}, { mode: 'graded' as const }]) {
          const run = fakeRun(state, { ...over, done: verifierSession.done(state) })
          const markups = [render(h(View2D, { run })), render(h(VerifierLegend, { run })), render(h(Controls, { run })), render(h(Mirror, { run })), render(h(ReadoutStrip, { view: run.view, meter: true }))]
          if (verifierSession.done(state)) markups.push(render(h(Debrief, { run, outcome: outcomeOf(state), next: { id: 'exact', title: 'Resample from the residual' }, onNext: noop, onGraded: noop })))
          for (const markup of markups) found.push(...findBanned(readOf(markup)).map((f) => `${id}: ${f.rule}: ${f.match}`))
        }
      }
      found.push(...findBanned(readOf(render(h(Game, { level: id })))).map((f) => `${id} page: ${f.rule}: ${f.match}`))
    }
    expect([...new Set(found)]).toEqual([])
    expect(findBanned(readOf('<p>Plate the dishes</p>')).length).toBeGreaterThan(0)
  })
})

describe('the source keeps the rules of the house', () => {
  const sources = (dir: string): string[] =>
    readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? sources(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
  const files = [...sources('src/games/verifier'), ...sources('packages/play/verifier')]

  test('the direction contract is development-only: its blocks are in no file the page ships', () => {
    expect(files.length).toBeGreaterThan(15)
    for (const file of files) {
      const text = readFileSync(path.join(root, file), 'utf8')
      for (const marker of ['THESIS:', 'OWN-WORLD:', 'FIRST VIEWPORT:', 'FINISH: unreviewed', 'seed: none (specified surface']) expect([file, marker, text.includes(marker)]).toEqual([file, marker, false])
    }
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
      expect([file, /Math\.random|Date\.now/.test(text)]).toEqual([file, false])
      // The 3D scene times its motion on the frame clock, as every scene of the kit does (src/scene/props/motion.ts); nothing else reads one.
      if (file !== 'src/games/verifier/Scene3D.tsx') expect([file, /performance\.now/.test(text)]).toEqual([file, false])
    }
  })

  test('a fresh `verifierInit` of every level draws with no help from the page: the same state however it is built', () => {
    for (const [id, seed] of PRACTICE) expect(JSON.stringify(verifierInit(buildLevel(id, seed)))).toBe(JSON.stringify(S.init(S.level(id, seed))))
  })
})
