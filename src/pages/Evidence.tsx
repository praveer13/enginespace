import { useMemo } from 'react'
import { GAMES } from '@es/play'
import { useIndex } from '@/content/load'
import { countEvents } from '@/evidence/counts'
import { EvidenceView } from '@/evidence/EvidenceView'
import { LedgerFiles } from '@/evidence/LedgerFiles'
import { StorageTape } from '@/evidence/StorageTape'
import { useEvidence } from '@/evidence/useEvidence'
import './panels.css'

/*
 * /evidence (ARCHITECTURE §3.1): the learner's ledger, counted, with the means to keep a copy. The page opens the ledger on its
 * own (`useEvidence()`), and shows a ticket that is still printing until it has. The counts are derived here from the events and
 * never stored; `EvidenceView` draws them.
 */

/** A game's home module: the first its registry entry lists (packages/play/types.ts). */
const homeModule = (game: string): string | undefined => GAMES.get(game)?.modules[0]

export function Component() {
  const evidence = useEvidence()
  const index = useIndex()
  const counts = useMemo(() => countEvents(evidence.events, homeModule), [evidence.events])
  const modules = index.status === 'ready' ? index.value.modules.map(({ id, title }) => ({ id, title })) : null
  return (
    <EvidenceView
      ready={evidence.ready}
      counts={counts}
      modules={modules}
      side={<StorageTape ledger={evidence} />}
      files={<LedgerFiles api={evidence} checkpoints={evidence.checkpoints} />}
    />
  )
}
