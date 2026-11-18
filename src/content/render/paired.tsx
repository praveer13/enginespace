import { useState } from 'react'
import type { Confidence } from '@es/play/items/types'
import type { LessonGuess } from '@/games/kit/lessonGuess'
import type { Of } from './BlockFrame'
import { commitPrediction, usePrediction } from './predicted'
import { SurePlates } from './Sure'
import { Tagged } from './Tagged'
import { latestSeq } from './runs'

type PredictBlock = Of<'predict'>

/**
 * The lesson's guess, asked in a level's own guess slot (`paired`): the slot shows the lesson's question and how sure, and its Commit keeps
 * the prediction before the level's own commit is dispatched. Null once the guess is committed, so the slot asks nothing twice.
 */
export function usePairedGuess(block: PredictBlock | undefined, scope: string, label?: string): LessonGuess | null {
  const state = usePrediction(scope, block?.id ?? '')
  const [conf, setConf] = useState<Confidence | null>(null)
  if (block === undefined || state.committed !== null) return null
  return {
    ask: <Tagged text={block.prompt} />,
    ...(label === undefined ? {} : { label }),
    sure: <SurePlates value={conf} onChange={setConf} />,
    commit: (value) => {
      commitPrediction(scope, block.id, { value, conf, after: latestSeq() })
    },
  }
}
