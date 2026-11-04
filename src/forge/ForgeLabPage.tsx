import { useCallback } from 'react'
import { useEvidence } from '@/evidence/useEvidence'
import { ForgeView } from './ForgeView'
import { FORGE_LABS } from './labs'
import { useForge, type RecordRun } from './useForge'
import '@/pages/panels.css'
import './forge.css'

/*
 * A forge lab's page, once its code has loaded (src/pages/Lab.tsx loads this file lazily, and the host, the oracle and the view with
 * it). It joins the three things the view needs: the lab (src/forge/labs.ts), the state machine that runs it (useForge.ts) and the
 * ledger that a run that counts is written to (src/evidence).
 */
export default function ForgeLabPage({ labId }: { labId: string }) {
  const lab = FORGE_LABS[labId]
  const { append } = useEvidence()
  const record = useCallback<RecordRun>(
    async (draft) => {
      const written = await append(draft)
      return written.ok ? { ok: true, durable: written.durable } : { ok: false, detail: written.detail }
    },
    [append],
  )
  const forge = useForge(lab, record)
  return <ForgeView lab={lab} state={forge.state} onChoose={(file) => void forge.choose(file)} onRunAgain={() => void forge.runAgain()} onReplay={() => void forge.replay()} />
}
