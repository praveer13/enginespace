/*
 * W1-T05: the event a review writes (src/items/today/review.ts; ARCHITECTURE §7.2, ASSESSMENT §8). One `review:<kc>` event for each ticket
 * checked, with the FSRS grade, stamped `unseen` because Today draws every seed fresh. It passes the ledger's strict codec, holds no key
 * and no solution and no time, and the deck reads it back as the grade it carries.
 */
import { describe, expect, test } from 'bun:test'
import { decodeEvent, stampEvent } from '@es/ledger'
import type { WriterContext } from '@es/ledger'
import { answerItem, startAttempt } from '@es/play/items'
import { bubbleWidth } from '@es/play/items/families/tr2/bubble-width'
import { deriveCards } from '../../src/items/today/cards'
import { appKcsOfRef } from '../../src/items/today/kcs'
import { ratingOf, reviewDraft } from '../../src/items/today/review'
import { keyOf, wrongOf } from '../play/items-support.ts'
import { TestLedger } from './support'

const context: WriterContext = { clock: { nowIso: () => '2026-11-04T09:30:00.000Z', tzOffsetMinutes: () => 0 }, newId: () => 'ev-1', dev: 'dev-today' }
const BUBBLE = 'tr2.bubble'

/** A checked ticket for BUBBLE: item `index` of an attempt, answered right or wrong. */
function checked(right: boolean, conf?: 'guess' | 'think' | 'sure') {
  const attempt = startAttempt(bubbleWidth, 2, [5, 6, 7, 8])
  const index = attempt.served.findIndex((served) => served.item.kcs.includes(BUBBLE))
  const item = attempt.served[index].item
  const answered = answerItem(bubbleWidth, attempt, index, right ? keyOf(item) : wrongOf(item), conf)
  const grade = answered.answered[index]?.grade
  if (grade === undefined || grade === null) throw new Error('not answered')
  return { kc: BUBBLE, item, ok: grade.ok, score: grade.score, ...(conf === undefined ? {} : { conf }) }
}

describe('the review event', () => {
  test('names the idea, carries the grade, the seed, the item\'s fingerprint and the tap, and is stamped unseen', () => {
    const answer = checked(true, 'sure')
    const draft = reviewDraft(answer)
    expect(draft).toEqual({
      kind: 'review',
      ref: `review:${BUBBLE}`,
      score: 1,
      ok: true,
      provenance: 'unseen',
      seed: answer.item.seed,
      conf: 'sure',
      rev: answer.item.rev,
      data: { grade: 4 },
    })
  })

  test('is a miss when the answer was wrong, whatever the learner said, and has no tap when none was given', () => {
    const wrong = reviewDraft(checked(false, 'sure'))
    expect(wrong).toMatchObject({ ok: false, score: 0, conf: 'sure', data: { grade: 1 } })
    const bare = reviewDraft(checked(true))
    expect('conf' in bare).toBe(false)
    expect(bare.data.grade).toBe(3)
  })

  test('maps the answer to FSRS\'s grades: wrong is Again, a right guess Hard, a right answer Good, a right one that was sure Easy', () => {
    expect(ratingOf({ ok: false })).toBe(1)
    expect(ratingOf({ ok: true, conf: 'guess' })).toBe(2)
    expect(ratingOf({ ok: true, conf: 'think' })).toBe(3)
    expect(ratingOf({ ok: true })).toBe(3)
    expect(ratingOf({ ok: true, conf: 'sure' })).toBe(4)
  })

  test('passes the ledger\'s strict codec, for each answer', () => {
    for (const right of [true, false]) {
      for (const conf of [undefined, 'guess', 'think', 'sure'] as const) {
        const event = stampEvent(context, reviewDraft(checked(right, conf)))
        const decoded = decodeEvent(JSON.parse(JSON.stringify(event)))
        expect(decoded.ok, decoded.ok ? '' : decoded.reason).toBe(true)
      }
    }
  })

  test('holds no key, no solution and no time: the item\'s own answer never reaches the event', () => {
    const answer = checked(true, 'think')
    const text = JSON.stringify(stampEvent(context, reviewDraft(answer)))
    expect(text).not.toContain('truth')
    expect(text).not.toContain('"why"')
    expect(text).not.toContain('options')
    expect(Object.keys(JSON.parse(text).data)).toEqual(['grade'])
    for (const field of ['ms', 'nsec', 'elapsed', 'duration']) expect(text).not.toContain(`"${field}"`)
  })

  test('is read back by the deck as the grade it carries: a right one reschedules, a missed one is a lapse', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-30', BUBBLE, 3)
    const right = stampEvent(context, reviewDraft(checked(true, 'sure')))
    const afterRight = deriveCards([...ledger.events, right], appKcsOfRef, '2026-11-04').cards.get(BUBBLE)
    expect(afterRight).toMatchObject({ reps: 2, lapses: 0, lastDay: '2026-11-04' })
    const missed = stampEvent(context, reviewDraft(checked(false)))
    const afterMiss = deriveCards([...ledger.events, missed], appKcsOfRef, '2026-11-04').cards.get(BUBBLE)
    expect(afterMiss).toMatchObject({ reps: 2, lapses: 1 })
    expect((afterRight?.memory.stability ?? 0) > (afterMiss?.memory.stability ?? 1)).toBe(true)
  })
})
