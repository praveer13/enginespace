import { createContext, type ReactNode } from 'react'
import type { RunRecord } from '@es/play'

/*
 * What a Prove run tells the instrument frame (ASSESSMENT §7.2, src/games/kit/Frame.tsx). The game's page provides it once the learner has
 * attested that their agent is closed (ProveSession.tsx), and the frame reads it: on a graded run of `level`, the readout slot holds
 * `hidden` until the result, the foot strip holds `foot` in place of the game's own way between practice and a graded run, the level is
 * named in words in place of the level menu, and `after` stands over the readout at the result. Everywhere else, a lesson and the front page included,
 * there is no provider and the frame is as it was.
 *
 * The words are nodes made in the Prove chunk, so the frame carries none of them.
 */
export interface ProveFrame {
  /** The level the Prove run plays. A run of another level, or a practice run, is not a Prove run. */
  readonly level: string
  /** Stands in the readout slot while the run is on. */
  readonly hidden: ReactNode
  /** The foot strip's mode: for the run that is on (null), and at the result of the run `record`, where it speaks of the next run only. */
  readonly foot: (record: RunRecord | null) => ReactNode
  /** Under the result of the run `record`: what the attempt was worth, and when the next one that counts opens. */
  readonly after: (record: RunRecord) => ReactNode
}

export const ProveContext = createContext<ProveFrame | null>(null)
