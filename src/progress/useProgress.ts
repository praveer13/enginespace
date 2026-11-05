/*
 * `useProgress(map)`: the learner's progress, derived from the ledger's events and the compiled map each time either changes
 * (ARCHITECTURE §7, ASSESSMENT §3.3). The hook opens the ledger, as `useEvidence()` does, and stores nothing: the answer is a
 * function of the events and the content.
 *
 * Until the ledger is open `ready` is false and the progress is that of an empty ledger. A page says it is reading the ledger then,
 * and does not say that the learner has done nothing.
 */
import { useMemo } from 'react'
import type { CourseMap } from '@es/schema/compiled'
import { useEvidence } from '@/evidence/useEvidence'
import { deriveProgress } from './derive'
import type { Progress } from './derive'
import { appSources, homeModule } from './sources'

export interface ProgressState {
  /** False until the ledger has opened. */
  ready: boolean
  /** Null until the map is there to read the events against. */
  progress: Progress | null
}

export function useProgress(map: CourseMap | null): ProgressState {
  const { ready, events } = useEvidence()
  const progress = useMemo(() => (map === null ? null : deriveProgress(events, map, appSources(map), homeModule)), [events, map])
  return { ready, progress }
}
