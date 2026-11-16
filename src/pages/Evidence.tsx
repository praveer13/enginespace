import { useMemo } from 'react'
import { GAMES } from '@es/play'
import { useMap } from '@/content/load-map'
import { useIndex } from '@/content/load'
import { countEvents } from '@/evidence/counts'
import { EvidenceView } from '@/evidence/EvidenceView'
import { LedgerFiles } from '@/evidence/LedgerFiles'
import { activityRows, attemptCounts, skillCounts } from '@/evidence/rows'
import { StorageTape } from '@/evidence/StorageTape'
import { useEvidence } from '@/evidence/useEvidence'
import { levelName, useProgress } from '@/progress/useProgress'
import './panels.css'

/*
 * /evidence, the page the course calls Progress (REDESIGN 2.3): what the learner did as dated rows in words, then the counts, with the means to
 * keep a copy. The page opens the ledger on its own (`useEvidence()`) and reads the compiled map, which names a lesson and a level, through
 * `useProgress`. Everything shown is derived here from the events and never stored; `EvidenceView` draws it.
 */

/** A game's home module: the first its registry entry lists (packages/play/types.ts). */
const homeModule = (game: string): string | undefined => GAMES.get(game)?.modules[0]

export function Component() {
  const evidence = useEvidence()
  const index = useIndex()
  const map = useMap()
  const mapValue = map.status === 'ready' ? map.value : null
  const { progress, next, last } = useProgress(mapValue)
  const counts = useMemo(() => countEvents(evidence.events, homeModule), [evidence.events])
  const rows = useMemo(() => (mapValue === null ? null : activityRows(evidence.events, { lessons: mapValue.lessons, levelName })), [evidence.events, mapValue])
  const skills = useMemo(() => (progress === null ? null : skillCounts(progress.counts)), [progress])
  const attempts = useMemo(() => attemptCounts(evidence.events), [evidence.events])
  const modules = index.status === 'ready' ? index.value.modules.map(({ id, title }) => ({ id, title })) : null
  return (
    <EvidenceView
      ready={evidence.ready}
      counts={counts}
      rows={rows}
      skills={skills}
      attempts={attempts}
      modules={modules}
      step={next}
      last={last}
      side={<StorageTape ledger={evidence} />}
      files={<LedgerFiles api={evidence} checkpoints={evidence.checkpoints} />}
    />
  )
}
