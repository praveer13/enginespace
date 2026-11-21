/*
 * W2b-T50: "Defend your receipt" (src/receipts/defend; ASSESSMENT §7.1 to §7.3). The step, checked without a browser:
 *
 *   - which stages can be defended, and that each has a question set (the registry the receipt's page carries, against the sets of the lazy chunk);
 *   - the file: the artifact is read only from the file of this receipt, and only as the receipt lists it;
 *   - what an attempt is worth: a pass on a verified receipt writes a `prove` event with provenance `proved`; inside the 24 hours after an attempt that
 *     counted, a verified receipt's attempt is `practice`; a synthetic or unverified receipt shows the same questions, as practice, and writes nothing;
 *   - a stage 3 receipt is verified, and so can be defended, while the site holds no reference bank;
 *   - the order: the step's markup holds nothing the run recorded until the answers are in, and then holds each record and its computation;
 *   - the words: no banned word, no task or decision id, and nothing that doubts the run was the learner's.
 * What a click does is checked in a real browser, in e2e/receipts-import.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { decodeEvent, type LedgerEvent, type ReceiptRecord } from '@es/ledger'
import { TR0_POINTS_SCHEMA_TAG } from '@es/schema/bundle'
import { tr0Questions, type RecordedPoint } from '@es/sim/defend/tr0'
import { verifyBundle, type CheckedOutcome } from '@es/verify'
import { findBanned } from '@/copy/banned'
import { PROVE_WINDOW_MS, stakeOf } from '@/prove/window'
import { ATLAS } from '@/receipts/atlas'
import { BANKS, STAGE_DECLARATIONS } from '@/receipts/declared'
import { artifactOf } from '@/receipts/defend/bundle'
import { DEFEND_COPY } from '@/receipts/defend/copy'
import { DefendView, type DefendViewProps } from '@/receipts/defend/Defend'
import { holdBundle, heldBundle } from '@/receipts/defend/handoff'
import { afterLine, stakeLine } from '@/receipts/defend/lines'
import { canDefend, DEFEND_STAGES, defendRef } from '@/receipts/defend/registry'
import { DEFEND_SETS, setOf, TR0_SET } from '@/receipts/defend/sets'
import { isSynthetic, settle, standingOf, type Standing } from '@/receipts/defend/standing'
import { PUBLISHED_GRADERS } from '@/receipts/graders'
import { receiptRecord } from '@/receipts/keep'
import { ENGINE_PINS } from '@/receipts/pins'
import { defendLinks } from '@/labs/defend-links'
import { forwardBundle, gzipped, receiptShaOf, recordedPoints, type ForwardStage } from './defend-support'
import { Ledger } from './support'

const NOW = Date.parse('2026-11-09T12:00:00.000Z')
const HOUR = 3_600_000

const fileOf = (bundle: unknown, name = 'tr0.forward-s3.es.json.gz'): File => new File([new Uint8Array(gzipped(bundle))], name, { type: 'application/gzip' })

/** The site's own check of a bundle, as the receipt worker runs it, with the challenge booked a day before. */
async function checked(bundle: ReturnType<typeof forwardBundle>): Promise<CheckedOutcome> {
  const { receipt } = bundle
  const outcome = await verifyBundle(fileOf(bundle), {
    book: [{ token: receipt.challenge.token, stage: receipt.stage, seed: receipt.challenge.seed, nonce: receipt.challenge.nonce, issuedOn: receipt.challenge.issuedOn, at: '2026-11-08T12:00:00.000Z' }],
    nowMs: NOW,
    graders: PUBLISHED_GRADERS,
    pins: ENGINE_PINS,
    atlas: ATLAS,
    stages: STAGE_DECLARATIONS,
    banks: BANKS,
  })
  if (outcome.kind !== 'checked') throw new Error(`the bundle was refused: ${JSON.stringify(outcome.rules)}`)
  return outcome
}

/** The record the ledger keeps for a checked bundle: the receipt and the report of its check. */
const recordOf = async (bundle: ReturnType<typeof forwardBundle>): Promise<ReceiptRecord> => receiptRecord(await checked(bundle), new Date(NOW).toISOString())

const standingOfBundle = async (bundle: ReturnType<typeof forwardBundle>): Promise<Standing> => {
  const record = await recordOf(bundle)
  return standingOf(bundle.receipt, record.reports)
}

const valueOf = (stage: ForwardStage, points?: unknown[]) => {
  const data = points === undefined ? recordedPoints(stage) : { ...recordedPoints(stage), points }
  const read = TR0_SET.read(data, stage)
  if (!read.ok) throw new Error(read.problem)
  return read.value
}

describe('which receipts can be defended', () => {
  test('the stages of the registry are the stages of the sets, each set reading its lab\'s artifact', () => {
    expect(DEFEND_STAGES).toEqual({ 'tr0.forward.s2': 'tr0.forward', 'tr0.forward.s3': 'tr0.forward' })
    for (const [stage, lab] of Object.entries(DEFEND_STAGES)) {
      expect(canDefend(stage)).toBe(true)
      expect(setOf(stage)?.lab).toBe(lab)
    }
    expect(Object.keys(DEFEND_SETS).sort()).toEqual([...new Set(Object.values(DEFEND_STAGES))].sort())
    expect(TR0_SET.format).toBe(TR0_POINTS_SCHEMA_TAG)
    for (const stage of ['tr0.forward.s1', 'tr3.profile.s2', 'tr8.replay.s2']) {
      expect(canDefend(stage)).toBe(false)
      expect(setOf(stage)).toBeUndefined()
    }
    expect(defendRef('tr0.forward')).toBe('prove:tr0.forward')
  })

  test('the file a receipt came back in is held for this tab by its hash, the newest four', () => {
    const files = Array.from({ length: 5 }, (_, at) => new File(['x'], `f${at}`))
    files.forEach((file, at) => holdBundle(`sha-${at}`, file))
    expect(heldBundle('sha-0')).toBeUndefined()
    expect(heldBundle('sha-4')?.name).toBe('f4')
    expect(heldBundle('sha-1')?.name).toBe('f1')
  })
})

describe('the file', () => {
  test('gives the points of this receipt, as the receipt lists them', async () => {
    const bundle = forwardBundle('tr0.forward.s3')
    const read = await artifactOf(fileOf(bundle), receiptShaOf(bundle.receipt), TR0_POINTS_SCHEMA_TAG)
    expect(read).toEqual({ ok: true, data: recordedPoints('tr0.forward.s3') })
  })

  test('of another receipt gives nothing, and says so', async () => {
    const mine = forwardBundle('tr0.forward.s3')
    const other = forwardBundle('tr0.forward.s3', { seed: 0x12345678 })
    expect(await artifactOf(fileOf(other), receiptShaOf(mine.receipt), TR0_POINTS_SCHEMA_TAG)).toEqual({ ok: false, problem: DEFEND_COPY.fileOther })
  })

  test('whose points were changed after the run, and the receipt not, gives nothing', async () => {
    const bundle = forwardBundle('tr0.forward.s3')
    const points = bundle.artifacts.points as { encoding: 'json'; data: { points: { shape?: number[] }[] } }
    points.data.points[0].shape = [1, 1, 1024]
    expect(await artifactOf(fileOf(bundle), receiptShaOf(bundle.receipt), TR0_POINTS_SCHEMA_TAG)).toEqual({ ok: false, problem: DEFEND_COPY.fileEdited })
  })

  test('that is not a bundle gives nothing, with the reason', async () => {
    const read = await artifactOf(new File(['not gzip'], 'notes.txt'), 'a'.repeat(64), TR0_POINTS_SCHEMA_TAG)
    expect(read.ok).toBe(false)
    expect(read.ok ? '' : read.problem).toStartWith('That file cannot be read as a receipt: ')
  })
})

describe('what an attempt is worth', () => {
  test('a stage 3 receipt is verified while the site holds no reference bank, so it can be defended', async () => {
    expect(BANKS).toEqual({})
    const bundle = forwardBundle('tr0.forward.s3')
    expect((await checked(bundle)).verdict.provenance).toBe('gpu-verified')
    expect(await standingOfBundle(bundle)).toEqual({ kind: 'verified' })
    expect(tr0Questions(valueOf('tr0.forward.s3').points, 1)).toHaveLength(3)
  })

  test('a stage 2 receipt is not verified until the bank is in, and a synthetic receipt never is: both are practice', async () => {
    expect(await standingOfBundle(forwardBundle('tr0.forward.s2'))).toEqual({ kind: 'practice', why: 'unverified' })
    const synthetic = forwardBundle('tr0.forward.s3', { synthetic: true })
    expect(isSynthetic(synthetic.receipt)).toBe(true)
    expect(await standingOfBundle(synthetic)).toEqual({ kind: 'practice', why: 'synthetic' })
    // A grader build that writes only synthetic fixtures makes its receipts synthetic, whatever they say of themselves.
    const fixtures = forwardBundle('tr0.forward.s3')
    expect(isSynthetic(fixtures.receipt, [{ ...PUBLISHED_GRADERS[0], synthetic: true }])).toBe(true)
    // A receipt with no report this build can read is not verified.
    expect(standingOf(fixtures.receipt, [])).toEqual({ kind: 'practice', why: 'unverified' })
  })

  const attemptOn = (seed: number) => {
    const value = valueOf('tr0.forward.s3')
    const questions = tr0Questions(value.points, seed)
    return { lab: 'tr0.forward', receiptSha256: 'b'.repeat(64), seed, questions }
  }

  test('a pass on a verified receipt writes a prove event with provenance proved, which the ledger takes', () => {
    const attempt = attemptOn(5)
    const settled = settle({ kind: 'verified' }, null, NOW, { ...attempt, answers: attempt.questions.map((question) => [...question.key]) })
    expect(settled.marked.ok).toBe(true)
    expect(settled.counted).toBe(true)
    expect(settled.draft).toMatchObject({ kind: 'prove', ref: 'prove:tr0.forward', ok: true, score: 1, provenance: 'proved', seed: 5 })
    expect(settled.draft?.data).toMatchObject({ agentClosed: true, receiptSha256: 'b'.repeat(64) })
    expect(settled.draft?.data.actual).toEqual(attempt.questions.map((question) => ({ id: question.id, key: [...question.key] })))
    const ledger = new Ledger()
    if (settled.draft === null) throw new Error('no draft')
    const event = ledger.write('2026-11-09T12:00:00.000Z', settled.draft)
    expect(decodeEvent(JSON.parse(JSON.stringify(event))).ok).toBe(true)
    expect(event.kind === 'prove' && event.provenance).toBe('proved')
  })

  test('a miss that counted is proved and not ok, which credits nothing and opens the window as a pass does', () => {
    const attempt = attemptOn(6)
    const settled = settle({ kind: 'verified' }, null, NOW, { ...attempt, answers: attempt.questions.map(() => [1]) })
    expect(settled.draft).toMatchObject({ provenance: 'proved', ok: false, score: 0 })
  })

  test('a synthetic or unverified receipt shows the questions at practice weight and writes nothing', () => {
    const attempt = attemptOn(7)
    const answers = attempt.questions.map((question) => [...question.key])
    for (const standing of [{ kind: 'practice', why: 'synthetic' }, { kind: 'practice', why: 'unverified' }] as const) {
      const settled = settle(standing, null, NOW, { ...attempt, answers })
      expect(settled.marked.ok).toBe(true)
      expect(settled.counted).toBe(false)
      expect(settled.draft).toBeNull()
    }
    expect(stakeLine({ kind: 'practice', why: 'synthetic' }, null, null)).toBe(DEFEND_COPY.synthetic)
    expect(stakeLine({ kind: 'practice', why: 'unverified' }, null, null)).toBe(DEFEND_COPY.unverified)
  })

  test('a credited attempt opens the 24-hour window: on a set clock, an attempt an hour later is practice, and one 24 hours later counts', () => {
    const ledger = new Ledger()
    const attempt = attemptOn(8)
    const first = settle({ kind: 'verified' }, stakeOf(ledger.events, 'prove:tr0.forward', NOW, 'prove'), NOW, { ...attempt, answers: attempt.questions.map((question) => [...question.key]) })
    if (first.draft === null) throw new Error('no draft')
    ledger.write(new Date(NOW).toISOString(), first.draft)
    const events: LedgerEvent[] = ledger.events

    const hourLater = NOW + HOUR
    const inside = stakeOf(events, 'prove:tr0.forward', hourLater, 'prove')
    expect(inside).toEqual({ counts: false, last: { at: NOW, ok: true }, opensAt: NOW + PROVE_WINDOW_MS })
    const second = settle({ kind: 'verified' }, inside, hourLater, { ...attempt, seed: 9, answers: attempt.questions.map((question) => [...question.key]) })
    expect(second.counted).toBe(false)
    expect(second.draft?.provenance).toBe('practice')
    expect(stakeLine({ kind: 'verified' }, inside, 'at 12:00 tomorrow')).toBe(DEFEND_COPY.waitPassed('at 12:00 tomorrow'))

    const dayLater = NOW + PROVE_WINDOW_MS
    expect(stakeOf(events, 'prove:tr0.forward', dayLater - 1, 'prove').counts).toBe(false)
    const open = stakeOf(events, 'prove:tr0.forward', dayLater, 'prove')
    expect(open.counts).toBe(true)
    expect(settle({ kind: 'verified' }, open, dayLater, { ...attempt, seed: 10, answers: [] }).draft?.provenance).toBe('proved')
    // The window of a lab is its own: a game's Prove run, a play event, does not move it, and a defence does not move a game's.
    expect(stakeOf(events, 'prove:tr0.forward', hourLater, 'play').counts).toBe(true)
    expect(stakeOf(events, 'play:shape-shifter/fewest', hourLater).counts).toBe(true)
  })

  test('the line under a result says what the attempt was worth', () => {
    const marked = { right: [true, true, true], score: 1, ok: true }
    const done = { marked, answers: [], at: NOW, counted: true, problem: null }
    expect(afterLine({ kind: 'verified' }, done, 'at 12:00 tomorrow')).toBe(DEFEND_COPY.proved('at 12:00 tomorrow'))
    expect(afterLine({ kind: 'verified' }, { ...done, marked: { ...marked, ok: false } }, 'at 12:00 tomorrow')).toBe(DEFEND_COPY.missed('at 12:00 tomorrow'))
    expect(afterLine({ kind: 'verified' }, { ...done, counted: false }, null)).toBe(DEFEND_COPY.practiceOpen)
    expect(afterLine({ kind: 'practice', why: 'unverified' }, done, null)).toBe(DEFEND_COPY.practiceNothing)
  })
})

describe('the step as markup', () => {
  const render = (element: ReactElement): string => renderToString(createElement(StaticRouter, { location: '/receipts' }, element)).replaceAll('<!-- -->', '')
  const text = (html: string): string => html.replace(/<\/?code>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const value = valueOf('tr0.forward.s2')
  const questions = tr0Questions(value.points, 42)
  const base: DefendViewProps = {
    set: TR0_SET as unknown as DefendViewProps['set'],
    stage: 'tr0.forward.s2',
    standing: { kind: 'verified' },
    stake: { counts: true, last: null, opensAt: null },
    when: null,
    file: { kind: 'ready', name: 'tr0.forward-s2.es.json.gz', held: true, value } as DefendViewProps['file'],
    onFile: () => undefined,
    attested: false,
    onAttest: () => undefined,
    asked: null,
    value,
    texts: [],
    errors: [],
    onText: () => undefined,
    onStart: () => undefined,
    onCheck: () => undefined,
    done: null,
  }
  /** Every tuple the run recorded, as the page would print it. */
  const recordedTuples = (value.points as RecordedPoint[]).flatMap((point) => (point.found ? [`(${point.shape.join(', ')})`, `(${point.strides.join(', ')})`] : []))

  test('before Start: the lead, why, the stake, the file and the attestation, and Start waits for the box', () => {
    const html = render(createElement(DefendView, base))
    const words = text(html)
    expect(words).toContain(DEFEND_COPY.why)
    expect(words).toContain(DEFEND_COPY.counts)
    expect(words).toContain(DEFEND_COPY.fileHeld('tr0.forward-s2.es.json.gz'))
    expect(words).toContain(DEFEND_COPY.attest)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Start the questions/)
    expect(render(createElement(DefendView, { ...base, attested: true }))).not.toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Start the questions/)
    for (const tuple of recordedTuples) expect(words).not.toContain(tuple)
  })

  test('the answers are taken before anything the run recorded is shown', () => {
    const asking = render(createElement(DefendView, { ...base, attested: true, asked: { seed: 42, questions }, texts: ['', '', ''], errors: [null, null, null] }))
    const words = text(asking)
    expect(asking.match(/<input[^>]*type="text"|<input(?![^>]*type=)[^>]*class="es-field__input"/g)?.length ?? asking.match(/es-field__input/g)?.length).toBe(3)
    for (const question of questions) expect(words).toContain(TR0_SET.ask(question, value).replaceAll('`', ''))
    expect(words).toContain(TR0_SET.context(value).replaceAll('`', ''))
    for (const tuple of recordedTuples) expect(words).not.toContain(tuple)
    for (const key of questions.map((question) => question.key.join(', '))) expect(words).not.toContain(key)
    expect(words).not.toContain(DEFEND_COPY.recorded)

    const answers = questions.map((question) => [...question.key])
    const done = render(
      createElement(DefendView, {
        ...base,
        attested: true,
        asked: { seed: 42, questions },
        texts: answers.map((answer) => answer.join(', ')),
        errors: [null, null, null],
        done: { marked: { right: [true, true, true], score: 1, ok: true }, answers, at: NOW, counted: true, problem: null },
        when: 'at 12:00 tomorrow',
      }),
    )
    const shown = text(done)
    expect(shown).toContain(DEFEND_COPY.resultTitle(3, 3))
    expect(shown).toContain(DEFEND_COPY.proved('at 12:00 tomorrow'))
    for (const question of questions) {
      expect(shown).toContain(`(${question.key.join(', ')})`)
      for (const line of [TR0_SET.reveal(question, value).recorded, ...TR0_SET.reveal(question, value).lines]) expect(shown).toContain(line.replaceAll('`', ''))
    }
    expect(done).not.toContain('es-field__input')
  })

  test('an answer that cannot be read says so beside it, and the stake stays under the questions', () => {
    const html = render(createElement(DefendView, { ...base, attested: true, asked: { seed: 42, questions }, texts: ['eight', '', '1, 2'], errors: [DEFEND_COPY.unreadable, DEFEND_COPY.empty, null] }))
    expect(text(html)).toContain(DEFEND_COPY.unreadable)
    expect(text(html)).toContain(DEFEND_COPY.empty)
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2)
  })

  test('a file that is not this receipt\'s, or one with nothing to ask, says why, and Start stays shut', () => {
    const other = render(createElement(DefendView, { ...base, attested: true, file: { kind: 'error', name: 'x.es.json.gz', problem: DEFEND_COPY.fileOther } as DefendViewProps['file'], value: null }))
    expect(text(other)).toContain(DEFEND_COPY.fileOther.replaceAll('`', ''))
    expect(other).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Start the questions/)
    const none = valueOf('tr0.forward.s2', (recordedPoints('tr0.forward.s2').points as RecordedPoint[]).map((point) => ({ name: point.name, found: false })))
    const empty = render(createElement(DefendView, { ...base, attested: true, file: { kind: 'ready', name: 'x', held: false, value: none } as DefendViewProps['file'], value: none }))
    expect(text(empty)).toContain(TR0_SET.none.replaceAll('`', ''))
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Start the questions/)
    const needed = render(createElement(DefendView, { ...base, file: { kind: 'none' } as DefendViewProps['file'], value: null }))
    expect(text(needed)).toContain(DEFEND_COPY.fileNeeded)
    expect(text(needed)).toContain(DEFEND_COPY.fileChoose)
  })
})

describe('the words', () => {
  const lines = (): string[] => {
    const out: string[] = []
    const walk = (entry: unknown) => {
      if (typeof entry === 'string') out.push(entry)
      else if (typeof entry === 'function') out.push(String((entry as (...args: unknown[]) => string)('at 12:00 tomorrow', 3)))
      else if (entry !== null && typeof entry === 'object') Object.values(entry).forEach(walk)
    }
    walk(DEFEND_COPY)
    out.push(TR0_SET.lead, TR0_SET.none, TR0_SET.context(valueOf('tr0.forward.s2')), TR0_SET.context(valueOf('tr0.forward.s3')))
    for (const stage of ['tr0.forward.s2', 'tr0.forward.s3'] as const) {
      const value = valueOf(stage)
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        for (const question of tr0Questions(value.points, seed)) {
          out.push(TR0_SET.ask(question, value))
          const shown = TR0_SET.reveal(question, value)
          out.push(shown.recorded, ...shown.lines)
        }
      }
    }
    return out
  }

  test('hold no banned word, no task or decision id, and never doubt that the run was the learner\'s', () => {
    const all = lines()
    expect(findBanned(all.join('\n'))).toEqual([])
    for (const line of all) {
      expect(line, line).not.toMatch(/\b(?:W\d+b?-T\d+|D-\d{3}|R-T\d+|[NOQ]-\d+)\b/)
      expect(line, line).not.toMatch(/\b(?:cheat|cheating|honest|honesty|prove you|suspicious|fake|faked)\b/i)
    }
  })

  test('the lab page leads to the newest verified receipt of each stage that can be defended', () => {
    const ledger = new Ledger()
    const s3 = forwardBundle('tr0.forward.s3').receipt.challenge.token
    ledger.receipt('2026-11-09T10:00:00.000Z', s3, 'a'.repeat(64))
    ledger.receipt('2026-11-09T11:00:00.000Z', forwardBundle('tr0.forward.s3', { seed: 0x12345678 }).receipt.challenge.token, 'c'.repeat(64))
    ledger.receipt('2026-11-09T11:30:00.000Z', forwardBundle('tr0.forward.s2').receipt.challenge.token, 'd'.repeat(64))
    // Until the ledger's reading has worked out what a receipt is worth, none is listed.
    expect(defendLinks(ledger.events, 'tr0.forward')).toEqual([])
    const credited = ledger.events.map((event) => (event.kind !== 'receipt' ? event : { ...event, ok: event.ref.endsWith('s3'), score: 1, provenance: event.ref.endsWith('s3') ? 'gpu-verified' : 'gpu-unverified' })) as LedgerEvent[]
    expect(defendLinks(credited, 'tr0.forward')).toEqual([{ stage: 'tr0.forward.s3', sha256: 'c'.repeat(64) }])
    expect(defendLinks(credited, 'tr3.profile')).toEqual([])
  })
})
