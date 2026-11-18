/*
 * `useProgress(map)`: the learner's progress, derived from the ledger's events and the compiled map each time either changes
 * (ARCHITECTURE §7, ASSESSMENT §3.3), and the way on that the same events give (REDESIGN §2.4). The hook opens the ledger, as
 * `useEvidence()` does, and stores no progress: the answer is a function of the events and the content.
 *
 * Until the ledger is open `ready` is false and the progress is that of an empty ledger. A page says it is reading the ledger then,
 * and does not say that the learner has done nothing.
 *
 * The way on is `nextStep`'s answer over the events, the map's lessons table and the bookmark (`es:here`), with `lastTime`'s sentence.
 * Once the ledger is open the hook keeps a copy of the answer as the pointer (`es:next`, D-066), so that the header's Continue says the
 * same thing on every page, the front page included, which opens no ledger. The pointer is a label and a link: it holds no progress,
 * and deleting it changes the label only.
 */
import { useMemo } from 'react'
import { GAMES } from '@es/play'
import { faceById } from '@es/play/items/catalog'
import type { CourseMap } from '@es/schema/compiled'
import type { ItemNamer } from '@/evidence/rows'
import { useEvidence } from '@/evidence/useEvidence'
import { readPlace } from '@/settings/bookmark'
import { deriveProgress } from './derive'
import type { Progress } from './derive'
import { indexLessons, lastTime, standings } from './next'
import type { LessonState, LevelNamer, Step } from './next'
import { appSources, homeModule } from './sources'
import { useWayOn } from './useWayOn'

export interface ProgressState {
  /** False until the ledger has opened. */
  ready: boolean
  /** Null until the map is there to read the events against. */
  progress: Progress | null
  /** The way on: null until the ledger has opened and the map is there, so a page never offers a place it has not read. */
  next: Step | null
  /** "Last time: you ran ...", or null when no lesson has an event yet. */
  last: string | null
  /** Each lesson's state by id: not started, started or done. Empty until the ledger has opened. */
  lessons: ReadonlyMap<string, LessonState>
}

/** A level as the learner reads it: "KV page pool, One KV group", from the game registry. */
export const levelName: LevelNamer = (game, level) => {
  const entry = GAMES.get(game)
  const title = entry?.levels.find((candidate) => candidate.id === level)?.title
  return entry === undefined || title === undefined ? undefined : `${entry.title}, ${title}`
}

/** What a question asks about, as the learner reads it: its variant's title from the item families' faces. */
export const itemName: ItemNamer = (family, variant) => faceById(family)?.variants.find((spec) => spec.id === variant)?.title

export function useProgress(map: CourseMap | null): ProgressState {
  const { ready, events } = useEvidence()
  const progress = useMemo(() => (map === null ? null : deriveProgress(events, map, appSources(map), homeModule)), [events, map])
  const next = useWayOn(map?.lessons ?? null)
  const lessons = useMemo(() => {
    if (map === null || !ready) return new Map<string, LessonState>()
    return new Map([...standings(events, indexLessons(map.lessons), readPlace())].map(([id, standing]) => [id, standing.state]))
  }, [events, map, ready])
  const last = useMemo(() => (map === null || !ready ? null : lastTime(events, map.lessons, levelName, readPlace())), [events, map, ready])
  return { ready, progress, next, last, lessons }
}
