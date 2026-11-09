/*
 * Helpers for the Today tests: a ledger written one valid event at a time, on days the test names, through the same `stampEvent` the
 * app uses, so an event that broke the codec would throw here, where the bug is. Time is a day and an hour in UTC with the zone at 0,
 * so the local day of an event is the day the test gave it, and events of one day sort in the order they were written.
 */
import { stampEvent } from '@es/ledger'
import type { Confidence, Draft, LedgerEvent, Provenance } from '@es/ledger'
import type { Rating } from '../../src/items/today/fsrs'

export const DEV = 'dev-today'

export interface Answer {
  ok?: boolean
  conf?: Confidence
  provenance?: Provenance
  seed?: number
}

export class TestLedger {
  readonly events: LedgerEvent[] = []
  private count = 0

  /** Writes a draft at `day`, `hour` o'clock UTC. */
  write<K extends LedgerEvent['kind']>(day: string, draft: Draft<K> & { kind: K }, hour = 9): LedgerEvent {
    this.count += 1
    const at = `${day}T${String(hour).padStart(2, '0')}:${String(Math.floor(this.count / 60) % 60).padStart(2, '0')}:${String(this.count % 60).padStart(2, '0')}.000Z`
    const event = stampEvent<K>({ clock: { nowIso: () => at, tzOffsetMinutes: () => 0 }, newId: () => `ev-${String(this.count).padStart(4, '0')}`, dev: DEV }, draft)
    this.events.push(event)
    return event
  }

  /** What Today writes: a review of `kc`, graded `grade`. Right unless the grade is Again. */
  review(day: string, kc: string, grade: Rating, extra: Answer = {}, hour = 9): LedgerEvent {
    const ok = extra.ok ?? grade !== 1
    return this.write(
      day,
      {
        kind: 'review',
        ref: `review:${kc}`,
        score: ok ? 1 : 0,
        ok,
        provenance: extra.provenance ?? 'unseen',
        ...(extra.seed === undefined ? {} : { seed: extra.seed }),
        ...(extra.conf === undefined ? {} : { conf: extra.conf }),
        data: { grade },
      },
      hour,
    )
  }

  /** What a lesson's item block writes. */
  item(day: string, variant: string, answer: Answer = {}, hour = 9, family = 'tr2.bubble-width'): LedgerEvent {
    const ok = answer.ok ?? true
    return this.write(
      day,
      {
        kind: 'item',
        ref: `item:gen/${family}/${variant}`,
        score: ok ? 1 : 0,
        ok,
        provenance: answer.provenance ?? 'unseen',
        ...(answer.seed === undefined ? {} : { seed: answer.seed }),
        ...(answer.conf === undefined ? {} : { conf: answer.conf }),
        data: { answer: { level: 2, response: { kind: 'numeric', value: 1 } } },
      },
      hour,
    )
  }

  /** A graded run of a game. */
  play(day: string, game: string, level: string, answer: Answer = {}, hour = 9): LedgerEvent {
    const ok = answer.ok ?? true
    return this.write(
      day,
      {
        kind: 'play',
        ref: `play:${game}/${level}`,
        score: ok ? 1 : 0,
        ok,
        provenance: answer.provenance ?? 'unseen',
        ...(answer.conf === undefined ? {} : { conf: answer.conf }),
        data: { actions: 'H4sIAAAAAAAAA', actionsSha256: 'a'.repeat(64) },
      },
      hour,
    )
  }

  /** A prediction. It may reschedule an idea that is earned and never earns one. */
  predict(day: string, lesson: string, id: string, answer: Answer = {}): LedgerEvent {
    const ok = answer.ok ?? true
    return this.write(day, {
      kind: 'predict',
      ref: `predict:${lesson}#${id}`,
      score: ok ? 1 : 0,
      ok,
      provenance: answer.provenance ?? 'unseen',
      data: { value: 300, truth: 312 },
    })
  }
}
