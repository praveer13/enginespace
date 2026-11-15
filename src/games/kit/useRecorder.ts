import { useCallback, useState } from 'react'
import type { GameMode, RunResult } from '@es/play'
import { recordPlay } from './record'

/*
 * The recorder as a page holds it (W1b-T01): a game's own page and a lesson's game block pass `record` as the game's `onFinish`, so every
 * run that ends is written to the ledger as the same `play` event (record.ts). The ledger's own code loads with the first run that ends
 * (record.ts imports it then), so a page that is only looked at never opens it. A run the ledger would not take is said under the game
 * (NotRecorded.tsx), with the reason; one it took says nothing.
 */

export interface Recorder {
  /** The game's `onFinish`: writes the run. */
  record(result: RunResult, mode: GameMode): void
  /** Why the last run was not written, or null. */
  readonly problem: string | null
}

export function useRecorder(): Recorder {
  const [problem, setProblem] = useState<string | null>(null)
  const record = useCallback((result: RunResult, mode: GameMode) => {
    // recordPlay never throws: a run it could not write comes back with the reason.
    void recordPlay(result, mode).then((written) => setProblem(written.ok ? null : written.detail))
  }, [])
  return { record, problem }
}
