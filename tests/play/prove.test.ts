/*
 * W2b-T42: Prove mode for a graded level (ASSESSMENT §7.1 to §7.3), apart from a browser. The window is read from the ledger with a set
 * clock: an attempt that counted, passed or not, closes the next 24 hours to attempts that count, and a run inside them is stamped practice.
 * The run's event is a graded run of the Prove level with its stamp, and the ledger's codec takes it. The panel asks for the attestation
 * before any game is drawn, so the seed is drawn when the Prove run starts; its words hold no banned word. The frame, given a Prove run,
 * hides the readout until the result, names the level in words and says the Prove run's mode in its foot strip.
 *
 * e2e/verifier.spec.ts plays a Prove run by keyboard in a browser.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { decodeEvent, stampEvent } from '@es/ledger'
import type { LedgerEvent, WriterContext } from '@es/ledger'
import { applyAction, drawInBand, finishRun, GAMES, levelOf, startRun } from '@es/play'
import type { RunResult } from '@es/play'
import { POOL } from '@es/play/pool/entry'
import { poolSession } from '@es/play/pool/session'
import { buildLevel } from '@es/play/verifier/levels'
import { VERIFIER } from '@es/play/verifier/entry'
import { verifierSession } from '@es/play/verifier/session'
import { excessPlates } from '@es/play/verifier/state'
import { findBanned } from '@/copy/banned'
import { Frame } from '@/games/kit/Frame'
import { playDraft, provenanceOf } from '@/games/kit/record'
import { ProveContext, type ProveFrame } from '@/prove/context'
import { PROVE_COPY } from '@/prove/copy'
import ProveSession, { ProvePanel } from '@/prove/ProveSession'
import { afterAttempt, openAt, openKey, opensWords, PROVE_WINDOW_MS, proveRef, stakeAt, stakeOf } from '@/prove/window'

const HOUR = 3_600_000
const T0 = Date.parse('2026-11-20T09:00:00.000Z')
const REF = proveRef('verifier', 'exact')

let counter = 0
/** A `play` event of a ref at a time, with the fields the window reads. */
function play(ref: string, at: number, provenance: string, ok = true): LedgerEvent {
  counter += 1
  return { id: `e${counter}`, v: 1, kind: 'play', ref, at: new Date(at).toISOString(), tz: 0, day: '2026-11-20', dev: 'dev-test', score: ok ? 1 : 0, ok, provenance } as unknown as LedgerEvent
}

/** A finished run of `exact` on a seed drawn in band: the residual's weights (a pass) or one weight too many (a miss). */
function exactRun(entropy: number, pass: boolean): RunResult {
  const seed = drawInBand(verifierSession, 'exact', entropy)
  const residual = excessPlates(buildLevel('exact', seed))
  const heavy = residual.indexOf(Math.max(...residual))
  let run = startRun(verifierSession, { game: 'verifier', level: 'exact', seed })
  for (const [token, weight] of residual.entries()) {
    const delta = pass || token !== heavy ? weight : weight + 1
    if (delta > 0) run = applyAction(verifierSession, run, { t: 'sculpt', token, delta })
  }
  run = applyAction(verifierSession, run, { t: 'submit' })
  const finished = finishRun(verifierSession, run)
  if (finished === null) throw new Error('the exact run is not over')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash }
}

const writer = (at: number): WriterContext => ({ clock: { nowIso: () => new Date(at).toISOString(), tzOffsetMinutes: () => 0 }, newId: () => `ev-${at}`, dev: 'dev-a1' })

describe('the Prove level (ASSESSMENT §7.2)', () => {
  test('the Rejection sampler names `exact` as its Prove level, and every Prove level a game names is one of its graded levels', () => {
    expect(VERIFIER.prove).toBe('exact')
    for (const game of GAMES.games) if (game.prove !== undefined) expect([game.id, levelOf(game, game.prove)?.graded]).toEqual([game.id, true])
  })
})

describe('the window, with a set clock (ASSESSMENT §7.3)', () => {
  test('with no attempt that counted, an attempt now counts', () => {
    expect(stakeOf([], REF, T0)).toEqual({ counts: true, last: null, opensAt: null })
  })

  test('a credited attempt opens a 24-hour window: an attempt inside it does not count, and one at its end does', () => {
    const events = [play(REF, T0, 'proved')]
    expect(PROVE_WINDOW_MS).toBe(24 * HOUR)
    expect(stakeOf(events, REF, T0 + HOUR)).toEqual({ counts: false, last: { at: T0, ok: true }, opensAt: T0 + 24 * HOUR })
    expect(stakeOf(events, REF, T0 + 24 * HOUR - 1).counts).toBe(false)
    expect(stakeOf(events, REF, T0 + 24 * HOUR)).toEqual({ counts: true, last: { at: T0, ok: true }, opensAt: null })
  })

  test('a failed attempt can be retried at once, at practice weight: the retry inside the window is stamped practice', () => {
    const events = [play(REF, T0, 'proved', false)]
    const retry = stakeOf(events, REF, T0 + 60_000)
    expect(retry).toEqual({ counts: false, last: { at: T0, ok: false }, opensAt: T0 + 24 * HOUR })
    expect(provenanceOf('graded', { counts: retry.counts })).toBe('practice')
  })

  test('the newest attempt that counted sets the window, whatever order the events come in', () => {
    const events = [play(REF, T0 + 30 * HOUR, 'proved', false), play(REF, T0, 'proved')]
    expect(stakeOf(events, REF, T0 + 31 * HOUR)).toEqual({ counts: false, last: { at: T0 + 30 * HOUR, ok: false }, opensAt: T0 + 54 * HOUR })
  })

  test('runs that did not count, and other levels, open no window', () => {
    const events = [play(REF, T0, 'practice'), play(REF, T0, 'unseen'), play(proveRef('verifier', 'chain'), T0, 'proved'), play(proveRef('pool', 'exact'), T0, 'proved')]
    expect(stakeOf(events, REF, T0 + HOUR).counts).toBe(true)
  })

  test("this visit's own attempt moves the window before the ledger reads it back, and the window ends on its own", () => {
    const open = stakeOf([], REF, T0)
    expect(afterAttempt(open, { at: T0, ok: true, counted: false })).toBe(open)
    const closed = afterAttempt(open, { at: T0, ok: true, counted: true })
    expect(closed).toEqual({ counts: false, last: { at: T0, ok: true }, opensAt: T0 + 24 * HOUR })
    expect(stakeAt(closed, T0 + 23 * HOUR)).toBe(closed)
    expect(stakeAt(closed, T0 + 24 * HOUR).counts).toBe(true)
  })

  test('an attempt that counted and was left before its end is a miss at the time it started, and opens the window as a miss does', () => {
    // Start wrote the open record at T0; the run was left (a reload, Leave Prove mode) and wrote no event.
    expect(stakeOf([], REF, T0 + HOUR, 'play', T0)).toEqual({ counts: false, last: { at: T0, ok: false, left: true }, opensAt: T0 + 24 * HOUR })
    expect(stakeOf([], REF, T0 + 24 * HOUR, 'play', T0).counts).toBe(true)
    // An older attempt that ended is overruled by the newer one that was left, and an attempt that ended after its start overrules it.
    expect(stakeOf([play(REF, T0 - 30 * HOUR, 'proved')], REF, T0 + HOUR, 'play', T0).last).toEqual({ at: T0, ok: false, left: true })
    expect(stakeOf([play(REF, T0 + 10 * 60_000, 'proved')], REF, T0 + HOUR, 'play', T0).last).toEqual({ at: T0 + 10 * 60_000, ok: true })
  })

  test("the open record's key and value: the level's ref under its own namespace, and the time the attempt started", () => {
    expect(openKey(REF)).toBe('prove-open:play:verifier/exact')
    expect(openAt({ at: new Date(T0).toISOString() })).toBe(T0)
    for (const bad of [null, 'x', { at: 3 }, { at: 'not a time' }, {}]) expect(openAt(bad)).toBeNull()
  })

  test('when the next attempt opens, in words: today, tomorrow, or a date', () => {
    const utc = { timeZone: 'UTC', locale: 'en-GB' }
    expect(opensWords(T0 + 3 * HOUR, T0, utc)).toBe('at 12:00 today')
    expect(opensWords(T0 + 24 * HOUR, T0, utc)).toBe('at 09:00 tomorrow')
    expect(opensWords(T0 + 72 * HOUR, T0, utc)).toBe('at 09:00 on 23 November')
  })
})

describe("a Prove run's event", () => {
  test('a passed attempt that counts is stamped proved; a failed one is proved and not ok; one inside the window is practice', async () => {
    const pass = exactRun(7, true)
    const miss = exactRun(7, false)
    expect([pass.grade.ok, miss.grade.ok]).toEqual([true, false])
    expect((await playDraft(pass, 'graded', undefined, { counts: true })).provenance).toBe('proved')
    expect(await playDraft(miss, 'graded', undefined, { counts: true })).toMatchObject({ provenance: 'proved', ok: false })
    expect((await playDraft(pass, 'graded', undefined, { counts: false })).provenance).toBe('practice')
    // Without a stamp a graded run is what it always was, and a practice run is never proved.
    expect((await playDraft(pass, 'graded')).provenance).toBe('unseen')
    expect(provenanceOf('practice', { counts: true })).toBe('practice')
  })

  test("the ledger's codec takes a proved event, passed or not, with its seed and its log", async () => {
    for (const result of [exactRun(11, true), exactRun(11, false)]) {
      const event = stampEvent(writer(T0), await playDraft(result, 'graded', undefined, { counts: true }))
      const decoded = decodeEvent(JSON.parse(JSON.stringify(event)))
      expect(decoded.ok).toBe(true)
      expect(event).toMatchObject({ kind: 'play', ref: REF, provenance: 'proved', ok: result.grade.ok, seed: result.record.seed })
    }
  })

  test('the window reads the events a Prove run writes', async () => {
    const event = stampEvent(writer(T0), await playDraft(exactRun(3, true), 'graded', undefined, { counts: true })) as LedgerEvent
    expect(stakeOf([event], REF, T0 + HOUR)).toMatchObject({ counts: false, last: { at: T0, ok: true } })
  })
})

const render = (element: ReactElement, location = '/play/verifier?mode=prove') => renderToStaticMarkup(h(StaticRouter, { location }, element))
/** The words of a markup: its text, with the tags out. */
const words = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'")

describe('the panel', () => {
  const panel = (over: Partial<Parameters<typeof ProvePanel>[0]> = {}) =>
    render(h(ProvePanel, { entry: VERIFIER, levelTitle: 'Resample from the residual', stake: { counts: true, last: null, opensAt: null }, when: null, attested: false, onAttest: () => undefined, onStart: () => undefined, back: '/play/verifier?level=exact', ...over }))

  test('asks the learner to close the agent, says why, and takes the attestation before Start can be pressed', () => {
    const markup = panel()
    expect(markup).toContain(PROVE_COPY.title('Resample from the residual'))
    for (const line of [PROVE_COPY.lead, PROVE_COPY.attest, PROVE_COPY.counts, ...PROVE_COPY.list]) expect(words(markup)).toContain(line)
    expect(markup).toMatch(/<input id="[^"]+" type="checkbox"/)
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*Start the Prove run/)
    expect(panel({ attested: true })).not.toMatch(/<button[^>]*disabled=""/)
  })

  test('says what an attempt now is worth, from the window: counts, or practice until it opens', () => {
    expect(panel({ stake: null })).toContain(PROVE_COPY.reading)
    const passed = panel({ stake: { counts: false, last: { at: T0, ok: true }, opensAt: T0 + 24 * HOUR }, when: 'at 09:00 tomorrow' })
    expect(words(passed)).toContain(PROVE_COPY.waitPassed('at 09:00 tomorrow'))
    const missed = panel({ stake: { counts: false, last: { at: T0, ok: false }, opensAt: T0 + 24 * HOUR }, when: 'at 09:00 tomorrow' })
    expect(words(missed)).toContain(PROVE_COPY.waitMissed('at 09:00 tomorrow'))
    const left = panel({ stake: { counts: false, last: { at: T0, ok: false, left: true }, opensAt: T0 + 24 * HOUR }, when: 'at 09:00 tomorrow' })
    expect(words(left)).toContain(PROVE_COPY.waitLeft('at 09:00 tomorrow'))
    expect(words(panel())).toContain('leaving the run before its end, or reloading the page, counts as a miss')
  })

  test('holds no word of src/copy/banned.ts, in its markup or in any line it can say', () => {
    const lines = Object.values(PROVE_COPY).flatMap((value) => (typeof value === 'function' ? [value('at 09:00 tomorrow')] : Array.isArray(value) ? value : [value]))
    expect(findBanned(lines.join('\n'))).toEqual([])
    expect(findBanned(words(panel()))).toEqual([])
  })

  test('draws no game before the attestation, so no seed exists until the Prove run starts', () => {
    let drawn = 0
    const Game = () => {
      drawn += 1
      return null
    }
    const markup = render(h(ProveSession, { entry: VERIFIER, level: 'exact', Game: Game as never, record: () => undefined }))
    expect(markup).toContain('data-prove-panel')
    expect(markup).not.toContain('data-seed')
    expect(drawn).toBe(0)
  })
})

describe('the frame in a Prove run', () => {
  const prove: ProveFrame = {
    level: 'one-group',
    hidden: h('p', { 'data-probe': 'hidden' }, PROVE_COPY.hidden),
    foot: h('span', { 'data-probe': 'foot' }, PROVE_COPY.footCounts),
    after: () => h('p', { 'data-probe': 'after' }),
  }
  const frame = (over: Record<string, unknown> = {}, value: ProveFrame | null = prove, ledger = true) =>
    render(
      h(
        ProveContext.Provider,
        { value },
        h(Frame, {
          game: { ...POOL, prove: 'one-group' },
          role: 'You are the KV allocator.',
          session: poolSession,
          level: 'one-group',
          levelTitle: 'One KV group',
          seed: 2,
          mode: 'graded',
          ledger,
          menu: h('div', { 'data-probe': 'menu' }),
          modeSwitch: h('span', { 'data-probe': 'switch' }),
          goal: () => ({ aim: 'The aim.', control: 'What you control.', target: 'The number to beat.', ends: 'Ends when it ends.' }),
          diagram: () => h('div', { 'data-probe': 'diagram' }),
          legend: () => h('ul', { 'data-probe': 'legend' }),
          dock: () => h('div', { 'data-probe': 'dock' }),
          readout: () => h('div', { 'data-probe': 'readout' }, 'the readout'),
          result: () => h('div', { 'data-probe': 'result' }),
          mirror: (run: { mirrorId: string }) => h('table', { id: run.mirrorId }),
          parts: [{ id: 'pool', name: 'KV page pool', sentence: 'Every page.' }],
          howTo: h('p', null, 'How to play it.'),
          titleBlock: { model: 'Model of a thing', clock: 'Clock: steps' },
          ...over,
        } as never),
      ),
      '/play/pool?mode=prove',
    )

  test('the readout slot holds the Prove line until the result, the level is named in words, and the foot strip says the mode', () => {
    const markup = frame()
    expect(markup).toContain('data-probe="hidden"')
    expect(markup).toContain('data-readout-hidden=""')
    expect(markup).not.toContain('data-probe="readout"')
    expect(markup).toContain('One KV group · Prove run')
    expect(markup).not.toContain('data-probe="menu"')
    expect(markup).toContain('data-probe="foot"')
    expect(markup).not.toContain('data-probe="switch"')
    expect(markup).not.toContain('data-prove-entry')
  })

  test('a practice run, another level, or no Prove run at all is drawn as it always was, with the way into Prove mode on the Prove level', () => {
    for (const markup of [frame({ mode: 'practice' }), frame({}, { ...prove, level: 'two-groups' }), frame({}, null)]) {
      expect(markup).toContain('data-probe="readout"')
      expect(markup).not.toContain('data-readout-hidden')
      expect(markup).toContain('data-probe="menu"')
      expect(markup).toContain('data-probe="switch"')
      expect(markup).toContain('href="/play/pool?level=one-group&amp;mode=prove"')
    }
    // No ledger (the front page) and no Prove level: no way in.
    expect(frame({}, null, false)).not.toContain('data-prove-entry')
    expect(frame({ game: POOL }, null)).not.toContain('data-prove-entry')
  })
})
