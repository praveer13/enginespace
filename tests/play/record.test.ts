/*
 * W1b-T01: what a finished game run writes to the ledger (src/games/kit/record.ts). A game's own page and a lesson's game block both
 * pass the recorder as the game's `onFinish`, so the event is a function of the run and its mode and of nothing about the page: these
 * tests hold it to A§7.2's row for `play`, to the ledger's codec, to the replay that grades it again (A§6.3), and to the parts of
 * packages/play/replay.ts that it writes from their definitions (the log's text and the ref).
 *
 * e2e/lesson-games.spec.ts plays the same graded run on a lesson and on the game's page, in Chromium, and compares the two events.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { decodeEvent, LIMITS, stampEvent } from '@es/ledger'
import type { WriterContext } from '@es/ledger'
import { applyAction, encodeActions, finishRun, playRef, regrade, startRun, storedRunOf } from '@es/play'
import type { GameMode, RunResult } from '@es/play'
import { playDraft, provenanceOf, sha256Text } from '@/games/kit/record'
import { PRACTICE_SEED, toySession, type ToyAction } from './support'

/** A finished run of the toy, adding `moves` in order, with the lesson's `rev` when one is given. */
function toyRun(moves: readonly number[], rev?: string): RunResult {
  let run = startRun(toySession, { game: 'toy', level: 'pile', seed: PRACTICE_SEED, ...(rev === undefined ? {} : { rev }) })
  for (const n of moves) run = applyAction(toySession, run, { t: 'add', n } satisfies ToyAction)
  const finished = finishRun(toySession, run)
  if (finished === null) throw new Error('the toy run is not over: add more')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash }
}

/** The toy's target, so that a run of threes and a last smaller move fills the pile exactly, as the reference does. */
const target = toySession.level('pile', PRACTICE_SEED).target
const house = [...Array.from({ length: Math.floor(target / 3) }, () => 3), ...(target % 3 === 0 ? [] : [target % 3])]

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const writer: WriterContext = { clock: { nowIso: () => '2026-11-09T09:30:00.000Z', tzOffsetMinutes: () => 0 }, newId: () => 'ev-1', dev: 'dev-a1' }

describe('the play event of a run (A§7.2)', () => {
  test('a graded run is stamped unseen and a practice run practice: ASSESSMENT §3.2 weighs them 1.0 and 0.3 when the ledger is read', () => {
    expect(provenanceOf('graded')).toBe('unseen')
    expect(provenanceOf('practice')).toBe('practice')
  })

  test('carries the ref, the grade, the seed, the lesson\'s revision, the log as canonical JSON and its SHA-256', async () => {
    const result = toyRun(house, 'a1b2c3d4e5f6')
    const draft = await playDraft(result, 'graded')
    expect(draft).toEqual({
      kind: 'play',
      ref: playRef('toy', 'pile'),
      score: result.grade.score,
      ok: result.grade.ok,
      provenance: 'unseen',
      seed: PRACTICE_SEED,
      rev: 'a1b2c3d4e5f6',
      data: { actions: encodeActions(result.record.actions), actionsSha256: sha256(encodeActions(result.record.actions)) },
    })
    expect(draft.ok).toBe(true)
  })

  test('a run with no revision (the game\'s own page) carries none, and is otherwise the same event', async () => {
    const page = await playDraft(toyRun(house), 'graded')
    const lesson = await playDraft(toyRun(house, 'a1b2c3d4e5f6'), 'graded')
    expect(Object.keys(page)).not.toContain('rev')
    const { rev, ...rest } = lesson
    expect(rev).toBe('a1b2c3d4e5f6')
    expect(rest).toEqual(page)
  })

  test('the same run in the same mode makes the same event, whoever asks: nothing about the page goes in', async () => {
    const modes: GameMode[] = ['practice', 'graded']
    for (const mode of modes) expect(await playDraft(toyRun(house), mode)).toEqual(await playDraft(toyRun(house), mode))
    expect((await playDraft(toyRun(house), 'practice')).provenance).toBe('practice')
  })

  test('a run that misses is written too, with its grade: a miss is evidence of practice, and earns nothing', async () => {
    const result = toyRun(Array.from({ length: target }, () => 1))
    const draft = await playDraft(result, 'graded')
    expect(draft.ok).toBe(result.grade.ok)
    expect(draft.score).toBe(result.grade.score)
    expect(draft.score).toBeLessThan(1)
  })

  test("the browser's SHA-256 is the standard one", async () => {
    for (const text of ['', '[]', '[{"n":3,"t":"add"}]', 'µs and ±']) expect(await sha256Text(text)).toBe(sha256(text))
  })
})

describe('the event in the ledger', () => {
  test('stamps and decodes under the ledger\'s codec, as the engine writes it', async () => {
    const event = stampEvent(writer, await playDraft(toyRun(house, 'a1b2c3d4e5f6'), 'graded'))
    const decoded = decodeEvent(JSON.parse(JSON.stringify(event)))
    expect(decoded.ok).toBe(true)
    expect(event.data.actions.length).toBeLessThanOrEqual(LIMITS.actionsChars)
  })

  test('grades again from its own log to the grade it carries: the replay is the grade (A§6.3)', async () => {
    const result = toyRun(house, 'a1b2c3d4e5f6')
    const event = stampEvent(writer, await playDraft(result, 'graded'))
    const stored = storedRunOf(event)
    expect(stored).not.toBeNull()
    const again = regrade(toySession, stored!)
    expect(again.valid).toBe(true)
    if (again.valid) {
      expect(again.grade).toEqual(result.grade)
      expect(again.hash).toBe(result.hash)
      expect(again.storedMatches).toBe(true)
    }
  })
})
