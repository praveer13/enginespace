/*
 * W2b-T42: a Prove run, as progress reads it (ASSESSMENT §3.2, §3.3 and §7.3). The events are the ones a Prove run of the Rejection
 * sampler's `exact` writes (src/games/kit/record.ts, stamped as src/prove decides), and progress is derived from them as the map and the
 * module pages derive it: a passed attempt that counted is read as proved and earns the level's KCs; a failed one is not, and earns
 * nothing; the retry played at once is stamped practice, and its pass is partial credit, not a proof.
 */
import { describe, expect, test } from 'bun:test'
import { stampEvent } from '@es/ledger'
import type { LedgerEvent, WriterContext } from '@es/ledger'
import { applyAction, drawInBand, finishRun, startRun } from '@es/play'
import type { RunResult } from '@es/play'
import type { CourseMap } from '@es/schema'
import { buildLevel } from '@es/play/verifier/levels'
import { verifierSession } from '@es/play/verifier/session'
import { excessPlates } from '@es/play/verifier/state'
import { playDraft } from '@/games/kit/record'
import { deriveProgress } from '@/progress/derive'
import type { KcSources } from '@/progress/kcmap'
import { proveRef, stakeOf } from '@/prove/window'

const HOUR = 3_600_000
const T0 = Date.parse('2026-11-20T09:00:00.000Z')
const REF = proveRef('verifier', 'exact')

/** TR6 with the KC that `exact` exercises; the game `verifier` is TR6's. */
const MAP: Pick<CourseMap, 'modules' | 'kcs'> = {
  modules: [{ id: 'tr6', prereqs: [], artifacts: [], labs: [], kcs: ['tr6.exact-acceptance'] }] as unknown as CourseMap['modules'],
  kcs: [{ id: 'tr6.exact-acceptance', module: 'tr6', description: 'You can resample from the residual.', requires: [] }] as unknown as CourseMap['kcs'],
}
const SOURCES: KcSources = { refs: {}, game: (game) => (game === 'verifier' ? ['tr6.exact-acceptance'] : []), variant: () => [], lab: () => [] }
const home = (game: string) => (game === 'verifier' ? 'tr6' : undefined)

/** A finished run of `exact` on a seed drawn in band: the residual (a pass) or one weight too many (a miss). */
function exactRun(entropy: number, pass: boolean): RunResult {
  const seed = drawInBand(verifierSession, 'exact', entropy)
  const residual = excessPlates(buildLevel('exact', seed))
  const heavy = residual.indexOf(Math.max(...residual))
  let run = startRun(verifierSession, { game: 'verifier', level: 'exact', seed })
  for (const [token, weight] of residual.entries()) {
    const delta = pass || token !== heavy ? weight : weight + 1
    if (delta > 0) run = applyAction(verifierSession, run, { t: 'sculpt', token, delta })
  }
  const finished = finishRun(verifierSession, applyAction(verifierSession, run, { t: 'submit' }))
  if (finished === null) throw new Error('the exact run is not over')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash }
}

let counter = 0
const writer = (at: number): WriterContext => {
  counter += 1
  return { clock: { nowIso: () => new Date(at).toISOString(), tzOffsetMinutes: () => 0 }, newId: () => `ev-${counter}`, dev: 'dev-a1' }
}

/** Plays a Prove run at `at` against the ledger so far, stamped as the Prove session stamps it, and returns the ledger with its event. */
async function prove(ledger: readonly LedgerEvent[], at: number, pass: boolean): Promise<LedgerEvent[]> {
  const counts = stakeOf(ledger, REF, at).counts
  const event = stampEvent(writer(at), await playDraft(exactRun(at % 1000, pass), 'graded', undefined, { counts })) as LedgerEvent
  return [...ledger, event]
}

const tr6 = (events: readonly LedgerEvent[]) => deriveProgress(events, MAP, SOURCES, home).modules.get('tr6')

describe('a Prove run, read by src/progress/derive.ts', () => {
  test('a passed, attested attempt that counts is read as proved, and earns the KC at full weight', async () => {
    const ledger = await prove([], T0, true)
    expect(ledger[0]).toMatchObject({ provenance: 'proved', ok: true })
    expect(tr6(ledger)?.loop.proved).toBe(true)
    expect(tr6(ledger)?.loop.play).toEqual({ tried: 1, credited: 1, partial: 0 })
    expect(tr6(ledger)?.kcs[0]?.state).toBe('earned')
  })

  test('a failed attempt is not read as proved and earns nothing; the retry at once is practice weight, and its pass is partial', async () => {
    const failed = await prove([], T0, false)
    expect(failed[0]).toMatchObject({ provenance: 'proved', ok: false })
    expect(tr6(failed)?.loop.proved).toBe(false)
    expect(tr6(failed)?.kcs[0]?.state).toBe('practised')

    const retried = await prove(failed, T0 + 60_000, true)
    expect(retried[1]).toMatchObject({ provenance: 'practice', ok: true })
    expect(tr6(retried)?.loop.proved).toBe(false)
    expect(tr6(retried)?.loop.play).toEqual({ tried: 2, credited: 0, partial: 1 })
    expect(tr6(retried)?.kcs[0]?.state).toBe('practised')
  })

  test('24 hours after the attempt that counted, the next one counts again, and its pass is read as proved', async () => {
    const failed = await prove([], T0, false)
    const early = await prove(failed, T0 + 23 * HOUR, true)
    expect(tr6(early)?.loop.proved).toBe(false)
    const later = await prove(early, T0 + 24 * HOUR, true)
    expect(later[2]).toMatchObject({ provenance: 'proved', ok: true })
    expect(tr6(later)?.loop.proved).toBe(true)
  })
})
