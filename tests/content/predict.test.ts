/*
 * W1b-T02: the lesson's prediction box (src/content/render/Predict.tsx, predicted.ts, slip.ts, reveal.ts), under Bun, as markup and as
 * the pure parts it is made of. The browser's half (a ticket that takes an answer by keys, waits for the game, reveals after it and
 * writes its event; nothing of the answer on the page before; axe at 360 and 1280 px) is e2e/lesson-predict.spec.ts.
 *
 *   - Before anything is played the ticket asks, and nothing of the answer is in its markup or in what it loaded.
 *   - A prediction revealed at commit (D-067) asks like the rest, with a stub that is never held down, and shows no lock and no task id.
 *   - A question that is held (no row, or no run below it) prints its stem and no input, no lock and no task id.
 *   - An answer revealed at commit writes one `predict` event with the learner's value and the truth, and no seed, because it read no run.
 *   - A committed prediction is final; the reveal opens only for a run that ended after the commit.
 *   - The `predict` event carries the value and the outcome (A§7.2), passes the ledger's codec, and is written at the reveal.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { decodeEvent, MemoryStore, seededIds, stampEvent } from '@es/ledger'
import { courseMapSchema } from '@es/schema'
import type { CompiledBlock } from '@es/schema'
import { gradePrediction } from '@es/play/predictions/grade'
import type { PredictAnswer } from '@es/play/predictions/grade'
import { NO_BLOCK, PLAN, UNLISTED } from '@es/play/predictions/plan'
import { commitFor } from '@es/play/predictions/truth'
import { commitPrediction, forgetPredictions, phaseOf, predictionState, revealPrediction } from '@/content/render/predicted'
import { AnsweredTicket, PredictTicket } from '@/content/render/Predict'
import { predictDraft, reveal, revealAtCommit } from '@/content/render/reveal'
import { finishBlockRun, forgetBlockRuns, latestSeq } from '@/content/render/runs'
import type { BlockRun } from '@/content/render/runs'
import { readSlip, unitName } from '@/content/render/slip'
import { closeEvidence, configureEvidence } from '@/evidence/useEvidence'
import { deriveProgress } from '@/progress/derive'
import { appSources, homeModule } from '@/progress/sources'
import { compileContent } from '../../scripts/content/build.ts'
import { trackerTasks } from '../ci/support.ts'
import { fixedClock } from '../evidence/support.ts'
import { finishedRun } from '../play/predictions-support.ts'
import { repo } from './support.ts'

type PredictBlock = Extract<CompiledBlock, { type: 'predict' }>

/** The page's predictions, each drawn as the lesson draws it, among the page's blocks (a prediction finds the run that answers it by them). */
const render = (...blocks: CompiledBlock[]) =>
  renderToString(
    h(
      StaticRouter,
      { location: '/' },
      blocks.flatMap((block, at) => (block.type === 'predict' ? [h(PredictTicket, { key: at, block, scope: 'tr2.l4', at, blocks, rev: 'a1b2c3d4' })] : [])),
    ),
  ).replaceAll('<!-- -->', '')
const COMMIT = /<button[^>]*>(?:<[^>]+>)*Commit answer/

const numeric = (id: string, unit: string, rel_tol: number, reveal: PredictBlock['reveal'] = 'after-game'): PredictBlock => ({
  type: 'predict',
  id,
  prompt: 'How many?',
  answer: { kind: 'numeric', unit, rel_tol },
  reveal,
  kcs: ['tr2.mrv2-delta'],
})
const game = (id: string, level: string): CompiledBlock => ({ type: 'game', id, level, mode: 'practice' })

afterEach(() => {
  forgetPredictions()
  forgetBlockRuns()
  closeEvidence()
})

describe('a prediction that a run answers, before anything is played', () => {
  const html = render(numeric('tr2.l4.p1', 'us', 0.05), game('loop', 'mrv2'))

  test('asks: a slip with its unit, the three plates, a live Commit, and no placeholder', () => {
    expect(html).toContain('data-phase="asking"')
    expect(html).toContain('data-predict="tr2.l4.p1"')
    expect(html).toContain('Your number')
    expect(html).toContain('in µs')
    for (const plate of ['guess', 'think so', 'sure']) expect(html).toContain(`>${plate}<`)
    expect(html).toMatch(COMMIT)
    expect(html).not.toMatch(/<button[^>]*disabled=""/)
    expect(html).not.toContain('data-placeholder')
    expect(html).not.toContain('Its reveal waits')
  })

  test('says what counts as right in words, and shows no KC id and no tape of facts', () => {
    expect(html).toContain('Within 5% of the answer counts as right.')
    for (const fact of ['answer · numeric', 'reveal · after the run', 'tr2.mrv2-delta']) expect(html).not.toContain(fact)
  })

  test('holds nothing of the answer: the model\'s number is not on the page, and no reading has been asked for', () => {
    // MRV2 takes 304 µs off a decode step of twelve rows, and a replay saves 1,986 µs of launches (tests/play/predictions.test.ts).
    for (const answer of ['304', '1,986', '1986']) expect(html).not.toContain(answer)
    expect(html).not.toContain('data-truth')
    expect(html).not.toContain('the model')
    expect(html).not.toContain('es-guess__reveal')
  })
})

describe('a prediction revealed at commit, before anything is played', () => {
  const html = render(numeric('tr8.l1.p1', 'ms', 0.1, 'at-commit'), game('broken-bench', 'due'))

  test('asks like the rest: a slip with its unit, the three plates and a live Commit, and no lock and no task id', () => {
    expect(html).toContain('data-phase="asking"')
    expect(html).toContain('data-reveal="at-commit"')
    expect(html).toContain('Your number')
    expect(html).toContain('How sure are you?')
    expect(html).toMatch(COMMIT)
    expect(html).not.toMatch(/<button[^>]*disabled=""/)
    expect(html).not.toContain('data-placeholder')
    expect(html).not.toContain('Its reveal waits')
    expect(html).not.toMatch(/W\d-T\d\d|R-T\d\d/)
  })

  test('holds nothing of the answer: the model\'s answer, its working and its source are not in the markup, and none of it was asked for', () => {
    // The toy log's p99 is 100 ms, and the working says how it is counted.
    expect(html).not.toContain('data-truth')
    expect(html).not.toContain('The working')
    expect(html).not.toContain('nearest rank')
    expect(html).not.toContain('es-guess__reveal')
  })

  test('every prediction of the table that is revealed at commit has the same ticket, in the block of its own lesson, whatever game follows it', () => {
    for (const id of ['tr1.l2.p1', 'tr2.l7.p1', 'tr6.l4.p1', 'tr8.l4.p1']) {
      const out = render(numeric(id, 'ms', 0, 'at-commit'))
      expect([id, out.includes('data-reveal="at-commit"'), out.includes('data-phase="asking"')]).toEqual([id, true, true])
    }
  })
})

/** The prediction's own ticket, out of a page that has a game block beside it. */
const ticketOf = (html: string): string => /<section[^>]*data-block="predict".*?<\/section>/s.exec(html)?.[0] ?? ''

describe('a question to hold', () => {
  test('prints its stem and why it has no answer, and no slip, no lock, no task id and no Commit', () => {
    const html = ticketOf(render(numeric('tr9.l9.p9', 'us', 0.05), game('loop', 'mrv2')))
    expect(html).toContain('data-phase="held"')
    expect(html).toContain('How many?')
    expect(html).toContain(UNLISTED.why)
    expect(html).not.toContain('Your number')
    expect(html).not.toContain('How sure are you?')
    expect(html).not.toMatch(COMMIT)
    expect(html).not.toContain('data-placeholder')
    expect(html).not.toMatch(/W\d-T\d\d|R-T\d\d|waits/)
  })

  test('a row whose game block the lesson lacks is held too: tr2.l4.p1 is answered by loop/mrv2, and this page has no block of it after the prediction', () => {
    const lacking = ticketOf(render(game('loop', 'mrv2'), numeric('tr2.l4.p1', 'us', 0.05)))
    expect(lacking).toContain('data-phase="held"')
    expect(lacking).toContain(NO_BLOCK.why)
    expect(lacking).not.toMatch(COMMIT)
  })

  test('a choice that is held lists its options, as it did', () => {
    const block: PredictBlock = {
      type: 'predict',
      id: 'tr9.l9.p8',
      prompt: 'Which runner?',
      answer: { kind: 'choice', options: [{ id: 'mrv2-on', text: 'MRV2, with async scheduling on' }, { id: 'refused', text: 'The engine refuses to start' }] },
      reveal: 'after-game',
      kcs: ['tr6.proposer-families'],
    }
    const html = render(block)
    expect(html).toContain('<ol class="es-guess__options"><li>MRV2, with async scheduling on</li><li>The engine refuses to start</li></ol>')
    expect(html).toContain('data-phase="held"')
  })
})

describe('the slip of each shape of answer', () => {
  const ticket = (block: PredictBlock) =>
    renderToString(h(StaticRouter, { location: '/' }, h(AnsweredTicket, { block, scope: 'tr2.l4', plan: { game: 'loop', level: 'async' }, place: 1 }))).replaceAll('<!-- -->', '')

  test('a choice is a fieldset of lines with a tick box each, labelled by what it is, and no number slip', () => {
    const html = ticket({
      type: 'predict',
      id: 'tr9.l1.p1',
      prompt: 'Which?',
      answer: { kind: 'choice', options: [{ id: 'a-yes', text: 'Yes, it fits' }, { id: 'b-no', text: 'No, it does not' }] },
      reveal: 'after-game',
      kcs: ['tr2.bubble'],
    })
    expect(html).toContain('<fieldset class="es-guess__choice"')
    expect(html).toContain('Your pick')
    expect(html.match(/type="radio"/g)?.length).toBe(2)
    expect(html).toContain('Yes, it fits')
    expect(html).not.toContain('Your number')
  })

  test('an interval is two slips, the low end and the high end, in the unit', () => {
    const html = ticket({ type: 'predict', id: 'tr9.l1.p2', prompt: 'Between?', answer: { kind: 'interval', unit: 'ms' }, reveal: 'after-game', kcs: ['tr2.bubble'] })
    expect(html).toContain('Low end')
    expect(html).toContain('High end')
    expect(html.match(/in ms/g)?.length).toBe(2)
    expect(html).not.toContain('Your number')
  })
})

describe('reading a slip', () => {
  const slip = { text: '', pick: null, lo: '', hi: '' }
  const numericAnswer = { kind: 'numeric', unit: 'us', rel_tol: 0.05 } as const
  const choiceAnswer: PredictAnswer = { kind: 'choice', options: [{ id: 'a-yes', text: 'Yes' }, { id: 'b-no', text: 'No' }] }
  const intervalAnswer = { kind: 'interval', unit: 'ms' } as const

  test('a number is read with its unit as the page prints it or as the lesson writes it, with thousands in groups, and nothing else is a number', () => {
    for (const [text, value] of [['380', 380], ['380 µs', 380], ['380 us', 380], ['1,200', 1200], ['0.5', 0.5], ['  42 ', 42]] as const) {
      expect([text, readSlip(numericAnswer, { ...slip, text })]).toEqual([text, { ok: true, value }])
    }
    for (const text of ['', 'about 300', '12 34', '300 ms', 'three']) {
      const read = readSlip(numericAnswer, { ...slip, text })
      expect([text, read.ok]).toEqual([text, false])
      if (!read.ok) expect(read.problem).toBe('Write a number, in µs, and then commit.')
    }
  })

  test('a per cent answer takes the sign or none, and a unit the readout has no name for is the lesson\'s own word', () => {
    const percent = { kind: 'numeric', unit: 'percent', rel_tol: 0.02 } as const
    expect([readSlip(percent, { ...slip, text: '87.5%' }), readSlip(percent, { ...slip, text: '87.5 %' }), readSlip(percent, { ...slip, text: '87.5' })]).toEqual(
      Array.from({ length: 3 }, () => ({ ok: true, value: 87.5 })),
    )
    expect(unitName('percent')).toBe('%')
    expect(unitName('us')).toBe('µs')
    expect(unitName('boundaries')).toBe('boundaries')
    expect(readSlip({ kind: 'numeric', unit: 'boundaries', rel_tol: 0 }, { ...slip, text: '3 boundaries' })).toEqual({ ok: true, value: 3 })
  })

  test('a choice is the id of a ticked option, and no tick, or a line the prediction lacks, is asked about again', () => {
    expect(readSlip(choiceAnswer, { ...slip, pick: 'b-no' })).toEqual({ ok: true, value: 'b-no' })
    expect(readSlip(choiceAnswer, slip)).toEqual({ ok: false, problem: 'Tick one line, and then commit.' })
    expect(readSlip(choiceAnswer, { ...slip, pick: 'c-maybe' }).ok).toBe(false)
  })

  test('a range is two positive numbers, read the way round that was meant, and a missing or non-positive end is asked about again', () => {
    expect(readSlip(intervalAnswer, { ...slip, lo: '10', hi: '90 ms' })).toEqual({ ok: true, value: { lo: 10, hi: 90 } })
    expect(readSlip(intervalAnswer, { ...slip, lo: '90', hi: '10' })).toEqual({ ok: true, value: { lo: 10, hi: 90 } })
    for (const [lo, hi] of [['', '5'], ['5', ''], ['0', '5'], ['-1', '5']]) expect([lo, hi, readSlip(intervalAnswer, { ...slip, lo, hi }).ok]).toEqual([lo, hi, false])
  })
})

describe('a committed prediction', () => {
  const commitment = { value: 300, conf: null, after: 0 } as const

  test('cannot change: a second commit of the same prediction is refused, in the same lesson and the same tab', () => {
    commitPrediction('tr2.l4', 'tr2.l4.p1', commitment)
    expect(() => commitPrediction('tr2.l4', 'tr2.l4.p1', { ...commitment, value: 304 })).toThrow('does not change')
    expect(predictionState('tr2.l4', 'tr2.l4.p1').committed?.value).toBe(300)
    // Another prediction, and the same id on another page, are other predictions.
    commitPrediction('tr2.l4', 'tr2.l4.p2', commitment)
    commitPrediction('tr2.l5', 'tr2.l4.p1', commitment)
  })

  test('is revealed once, and only after it was committed', () => {
    const revealed = { truth: 304, ok: true, score: 1, reads: 'Read.', run: { game: 'loop', level: 'mrv2', seed: 0 }, working: [], sources: [], tag: null, unsaved: null }
    expect(() => revealPrediction('tr2.l4', 'tr2.l4.p1', revealed)).toThrow('after it is committed')
    commitPrediction('tr2.l4', 'tr2.l4.p1', commitment)
    revealPrediction('tr2.l4', 'tr2.l4.p1', revealed)
    expect(() => revealPrediction('tr2.l4', 'tr2.l4.p1', revealed)).toThrow('revealed already')
    expect(() => commitPrediction('tr2.l4', 'tr2.l4.p1', commitment)).toThrow('does not change')
  })

  test('waits for the game: the reveal opens for a run that ended after the commit, and not for one that ended before it', async () => {
    const result = await finishedRun('loop', 'mrv2', 'practice')
    const play = () =>
      finishBlockRun({ scope: 'tr2.l4', at: 3, game: 'loop', level: 'mrv2', mode: 'practice', result: { record: result, grade: { score: 1, ok: true }, debrief: { sentence: 'Served.', names: null }, hash: '0badf00d' } })
    const early = play()
    // Committed after a run that has ended: that run was played in sight of the answer.
    commitPrediction('tr2.l4', 'tr2.l4.p1', { ...commitment, after: latestSeq() })
    const state = predictionState('tr2.l4', 'tr2.l4.p1')
    expect(phaseOf(predictionState('tr2.l4', 'tr2.l4.p9'), early)).toBe('asking')
    expect(phaseOf(state, early)).toBe('committed')
    expect(phaseOf(state, null)).toBe('committed')
    const late = play()
    expect(late.seq).toBeGreaterThan(early.seq)
    expect(phaseOf(state, late)).toBe('ready')
    revealPrediction('tr2.l4', 'tr2.l4.p1', { truth: 304, ok: true, score: 1, reads: 'Read.', run: { game: 'loop', level: 'mrv2', seed: 0 }, working: [], sources: [], tag: null, unsaved: null })
    expect(phaseOf(predictionState('tr2.l4', 'tr2.l4.p1'), late)).toBe('revealed')
  })
})

describe('the event a reveal writes (A§7.2)', () => {
  const writer = { clock: fixedClock(), newId: seededIds(9), dev: 'dev-predict' }

  async function revealed(block: PredictBlock, value: number | string | { lo: number; hi: number }, conf: 'guess' | 'think' | 'sure' | null, store: MemoryStore) {
    configureEvidence({ store, clock: fixedClock(), newId: seededIds(5), tabId: 'tab-predict', channelFactory: null, storageManager: null })
    const record = await finishedRun('loop', 'mrv2', 'practice', 'a1b2c3d4')
    const run: BlockRun = {
      scope: 'tr2.l4',
      at: 3,
      game: 'loop',
      level: 'mrv2',
      mode: 'practice',
      result: { record, grade: { score: 1, ok: true }, debrief: { sentence: 'Served.', names: null }, hash: '0badf00d' },
      seq: 1,
    }
    const input = { block, scope: 'tr2.l4', rev: 'a1b2c3d4', committed: { value, conf, after: 0 }, run }
    return { input, result: await reveal(input) }
  }

  test('carries the ref, the value and the truth, the outcome, the seed of the run and the lesson\'s revision, stamped as practice, and holds no key besides the truth it just read', async () => {
    const store = new MemoryStore()
    const block = numeric('tr2.l4.p1', 'us', 0.05)
    const { result } = await revealed(block, 300, 'think', store)
    expect(result).toMatchObject({ truth: 304, ok: true, score: 1, unsaved: null, run: { game: 'loop', level: 'mrv2', seed: 0 } })
    expect(result.reads).toMatch(/^Read from the V2 level/)
    const events = (await store.readAll()).events
    expect(events.length).toBe(1)
    expect(events[0]).toMatchObject({
      kind: 'predict',
      ref: 'predict:tr2.l4#tr2.l4.p1',
      score: 1,
      ok: true,
      provenance: 'practice',
      seed: 0,
      conf: 'think',
      rev: 'a1b2c3d4',
      data: { value: 300, truth: 304, unit: 'us' },
    })
    // It passes the ledger's own codec, as it comes out of a file.
    expect(decodeEvent(JSON.parse(JSON.stringify(events[0]))).ok).toBe(true)
  })

  test('a miss is written too, with its outcome: a prediction that was wrong is evidence of what the learner expected', async () => {
    const store = new MemoryStore()
    const { result } = await revealed(numeric('tr2.l4.p1', 'us', 0.05), 100, null, store)
    expect(result).toMatchObject({ truth: 304, ok: false, score: 0 })
    const event = (await store.readAll()).events[0]
    expect(event).toMatchObject({ ok: false, score: 0, data: { value: 100, truth: 304 } })
    expect(Object.keys(event)).not.toContain('conf')
  })

  test('a range is written with the truth as the degenerate range at the true value, so that the ledger holds the two in one shape', () => {
    const block: PredictBlock = { type: 'predict', id: 'tr2.l4.p1', prompt: 'Between?', answer: { kind: 'interval', unit: 'us' }, reveal: 'after-game', kcs: ['tr2.mrv2-delta'] }
    const record = { game: 'loop', level: 'mrv2', seed: 7, actions: [], rev: 'a1b2c3d4' }
    const run: BlockRun = { scope: 'tr2.l4', at: 3, game: 'loop', level: 'mrv2', mode: 'practice', result: { record, grade: { score: 1, ok: true }, debrief: { sentence: '', names: null }, hash: '0' }, seq: 1 }
    const draft = predictDraft({ block, scope: 'tr2.l4', committed: { value: { lo: 250, hi: 350 }, conf: null, after: 0 }, run }, 304, gradePrediction(block.answer, { lo: 250, hi: 350 }, 304))
    expect(draft.data).toEqual({ value: { lo: 250, hi: 350 }, truth: { lo: 304, hi: 304 }, unit: 'us' })
    expect(draft.seed).toBe(7)
    expect(decodeEvent(JSON.parse(JSON.stringify(stampEvent(writer, draft)))).ok).toBe(true)
  })

  test('a ledger that would not take the event says so and the reveal stands', async () => {
    const store = new MemoryStore()
    const block = numeric('tr2.l4.p1', 'us', 0.05)
    // A ledger that a newer build wrote is read-only (A§7.4): it refuses the event, the learner is told, and the prediction is revealed all the same.
    await store.commit({ putMeta: { deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 2 } }, { event: (existing) => existing, receipt: (existing) => existing, working: (existing) => existing })
    const { result } = await revealed(block, 300, null, store)
    expect(result).toMatchObject({ truth: 304, ok: true })
    expect(result.unsaved).toContain('read-only')
    expect((await store.readAll()).events).toEqual([])
  })

  test('a reveal for a prediction the model has no reading for, or for a run of another game, is refused and writes nothing', async () => {
    const store = new MemoryStore()
    configureEvidence({ store, clock: fixedClock(), newId: seededIds(5), tabId: 'tab-predict', channelFactory: null, storageManager: null })
    const run: BlockRun = { scope: 'tr8.l1', at: 2, game: 'broken-bench', level: 'due', mode: 'practice', result: { record: { game: 'broken-bench', level: 'due', seed: 1, actions: [] }, grade: { score: 1, ok: true }, debrief: { sentence: '', names: null }, hash: '0' }, seq: 1 }
    await expect(reveal({ block: numeric('tr8.l1.p1', 'ms', 0.1), scope: 'tr8.l1', committed: { value: 1, conf: null, after: 0 }, run })).rejects.toThrow('no reading')
    const mismatched: BlockRun = { ...run, scope: 'tr2.l4', game: 'loop', result: { ...run.result, record: { game: 'broken-bench', level: 'due', seed: 1, actions: [] } } }
    await expect(reveal({ block: numeric('tr2.l4.p1', 'us', 0.05), scope: 'tr2.l4', committed: { value: 1, conf: null, after: 0 }, run: mismatched })).rejects.toThrow('answered by a run of loop/mrv2')
    expect((await store.readAll()).events).toEqual([])
  })
})

describe('the event an at-commit reveal writes (D-067)', () => {
  const writer = { clock: fixedClock(), newId: seededIds(9), dev: 'dev-commit' }
  const setup = (store: MemoryStore) => configureEvidence({ store, clock: fixedClock(), newId: seededIds(5), tabId: 'tab-commit', channelFactory: null, storageManager: null })

  test('is one `predict` event with the value and the truth both, the outcome and the lesson\'s revision, stamped as practice, and no seed, because no run was read', async () => {
    const store = new MemoryStore()
    setup(store)
    const result = await revealAtCommit({ block: numeric('tr2.l2.p1', 'tokens', 0), scope: 'tr2.l2', rev: 'a1b2c3d4', committed: { value: 1948, conf: 'sure', after: 0 } })
    expect(result).toMatchObject({ truth: 1948, ok: true, score: 1, run: null, unsaved: null, tag: 'derived' })
    expect(result.working.length).toBeGreaterThanOrEqual(2)
    expect(result.working[result.working.length - 1]).toContain('1,948')
    const events = (await store.readAll()).events
    expect(events.length).toBe(1)
    expect(events[0]).toMatchObject({ kind: 'predict', ref: 'predict:tr2.l2#tr2.l2.p1', score: 1, ok: true, provenance: 'practice', conf: 'sure', rev: 'a1b2c3d4', data: { value: 1948, truth: 1948, unit: 'tokens' } })
    expect(Object.keys(events[0])).not.toContain('seed')
    expect(decodeEvent(JSON.parse(JSON.stringify(events[0]))).ok).toBe(true)
  })

  test('a miss is written too, and a choice reveals its option by id', async () => {
    const store = new MemoryStore()
    setup(store)
    const miss = await revealAtCommit({ block: numeric('tr8.l3.p1', 'requests/s', 0.05), scope: 'tr8.l3', committed: { value: 10, conf: null, after: 0 } })
    expect(miss).toMatchObject({ ok: false, score: 0, run: null })
    const choice: PredictBlock = {
      type: 'predict',
      id: 'tr6.l4.p1',
      prompt: 'Which runner?',
      answer: { kind: 'choice', options: [{ id: 'mrv2-on', text: 'MRV2' }, { id: 'mrv1-off', text: 'MRV1, async off' }] },
      reveal: 'at-commit',
      kcs: ['tr6.proposer-families'],
    }
    const hit = await revealAtCommit({ block: choice, scope: 'tr6.l4', committed: { value: 'mrv1-off', conf: 'think', after: 0 } })
    expect(hit).toMatchObject({ truth: 'mrv1-off', ok: true, tag: 'measured' })
    expect(hit.sources.map((source) => source.claim)).toEqual(['vllm.mrv2.fallback-reasons', 'vllm.async-scheduling.mrv1-limits'])
    const events = (await store.readAll()).events
    expect(events.map((event) => [event.ref, 'ok' in event ? event.ok : null])).toEqual([['predict:tr8.l3#tr8.l3.p1', false], ['predict:tr6.l4#tr6.l4.p1', true]])
    expect(events[1]).toMatchObject({ data: { value: 'mrv1-off', truth: 'mrv1-off' } })
  })

  test('a ledger that would not take the event says so and the reveal stands, as after a run', async () => {
    const store = new MemoryStore()
    await store.commit({ putMeta: { deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 2 } }, { event: (existing) => existing, receipt: (existing) => existing, working: (existing) => existing })
    setup(store)
    const result = await revealAtCommit({ block: numeric('tr2.l2.p1', 'tokens', 0), scope: 'tr2.l2', committed: { value: 1948, conf: null, after: 0 } })
    expect(result).toMatchObject({ truth: 1948, ok: true })
    expect(result.unsaved).toContain('read-only')
    expect((await store.readAll()).events).toEqual([])
  })

  test('a prediction that a run answers, or that the model does not know, has no answer at commit, and writes nothing', async () => {
    const store = new MemoryStore()
    setup(store)
    await expect(revealAtCommit({ block: numeric('tr2.l4.p1', 'us', 0.05), scope: 'tr2.l4', committed: { value: 1, conf: null, after: 0 } })).rejects.toThrow('no answer at commit')
    await expect(revealAtCommit({ block: numeric('tr9.l9.p9', 'us', 0.05), scope: 'tr9.l9', committed: { value: 1, conf: null, after: 0 } })).rejects.toThrow('no answer at commit')
    expect(await commitFor('tr2.l4.p1')).toBeUndefined()
    expect((await store.readAll()).events).toEqual([])
    expect(decodeEvent(JSON.parse(JSON.stringify(stampEvent(writer, predictDraft({ block: numeric('tr2.l2.p1', 'tokens', 0), scope: 'tr2.l2', committed: { value: 1948, conf: null, after: 0 } }, 1948, gradePrediction({ kind: 'numeric', unit: 'tokens', rel_tol: 0 }, 1948, 1948))))) ).ok).toBe(true)
  })

  test('the page that reads predictions reads it: the loop counts it, the KCs are practised, and nothing is earned', async () => {
    const store = new MemoryStore()
    setup(store)
    await revealAtCommit({ block: numeric('tr2.l2.p1', 'tokens', 0), scope: 'tr2.l2', rev: 'a1b2c3d4', committed: { value: 1948, conf: null, after: 0 } })
    const events = (await store.readAll()).events
    const compiled = compileContent({ root: repo })
    const map = courseMapSchema.parse(JSON.parse(compiled.outputs.find((output) => output.path === 'src/content/generated/map.json')!.text))
    const progress = deriveProgress(events, map, appSources(map), homeModule)
    expect(progress.modules.get('tr2')?.loop.predicted).toBe(1)
    expect(progress.kcs.get('tr2.one-budget')).toMatchObject({ state: 'practised', events: 1 })
    expect(progress.counts.earned).toBe(0)
  })
})

describe('the pages that read predictions read this event', () => {
  const compiled = compileContent({ root: repo })
  const map = courseMapSchema.parse(JSON.parse(compiled.outputs.find((output) => output.path === 'src/content/generated/map.json')!.text))
  const lessons = compiled.outputs.filter((output) => output.path.startsWith('src/content/generated/lessons/')).map((output) => JSON.parse(output.text) as { id: string; blocks: { type: string; id?: string }[] })

  test('its ref is the one the compiler wrote for the lesson: every prediction of the table has its KCs in the map, so that a page can place the event', () => {
    for (const lesson of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'predict' || block.id === undefined) continue
        const ref = `predict:${lesson.id}#${block.id}`
        expect([ref, Object.hasOwn(map.refs, ref) && map.refs[ref].length > 0]).toEqual([ref, true])
        expect(Object.hasOwn(PLAN, block.id)).toBe(true)
      }
    }
  })

  test("the module page's loop counts it in its Predict step, the map practises the KCs the lesson names, and nothing is earned (ASSESSMENT §4.7)", async () => {
    const store = new MemoryStore()
    configureEvidence({ store, clock: fixedClock(), newId: seededIds(5), tabId: 'tab-readers', channelFactory: null, storageManager: null })
    const record = await finishedRun('loop', 'mrv2', 'practice', 'a1b2c3d4')
    const run: BlockRun = { scope: 'tr2.l4', at: 3, game: 'loop', level: 'mrv2', mode: 'practice', result: { record, grade: { score: 1, ok: true }, debrief: { sentence: '', names: null }, hash: '0' }, seq: 1 }
    await reveal({ block: numeric('tr2.l4.p1', 'us', 0.05), scope: 'tr2.l4', rev: 'a1b2c3d4', committed: { value: 304, conf: 'sure', after: 0 }, run })
    const events = (await store.readAll()).events
    const progress = deriveProgress(events, map, appSources(map), homeModule)
    expect(progress.modules.get('tr2')?.loop.predicted).toBe(1)
    expect(progress.modules.get('tr2')?.loop.play).toEqual({ tried: 0, credited: 0, partial: 0 })
    // The lesson names `tr2.mrv2-delta` for the prediction: it is practised, and a right prediction at any weight earns nothing.
    expect(progress.kcs.get('tr2.mrv2-delta')).toMatchObject({ state: 'practised', events: 1 })
    expect(progress.counts.earned).toBe(0)
    expect(progress.modules.get('tr2')?.counts.earned).toBe(0)
  })

  test('the two readers that do not exist yet, Review\'s rescheduling and the calibration view on Progress, are one open task of the tracker that says so', () => {
    const text = trackerTasks().get('W2-T44') ?? ''
    expect(text.split('\n', 1)[0]).toMatch(/^#### \[[ ~]\] W2-T44 · Readers of the prediction event/)
    expect(text).toContain('Review (`/today`)')
    expect(text).toContain('calibration view on Progress')
    expect(text).toContain('src/items/today/kcs.ts')
  })
})
