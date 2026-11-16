import { useCallback, useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { useEvidence } from '@/evidence/useEvidence'
import { clockNow, heldChallenges, writeChallenge } from '@/receipts/challenge'
import type { IssuePanelProps } from '@/receipts/IssuePanel'
import { hashOfFragment } from '@/receipts/records'
import { ReceiptsView } from '@/receipts/ReceiptsView'
import { useImport } from '@/receipts/useImport'
import './panels.css'

/*
 * `/receipts` (ARCHITECTURE §3.1, §8.4): get a challenge for a lab that runs on your own machine, bring back the receipt that your grader wrote
 * and see how this browser checked it, see which of your challenges are open, used or expired, and open a receipt that this browser holds, at
 * `/receipts#<sha256>`. The page opens the ledger on its own (`useEvidence()`) and shows tickets that are still printing until it has. W2-T06
 * builds the deck and the lists; W2-T07 adds the slip: the file goes to a worker that checks it by the first six rules of A§8.5, and a receipt
 * that was read whole is kept in the ledger (src/receipts/importer.ts).
 *
 * Issuing a challenge writes one `challenge` event to the ledger and sends nothing anywhere (I1). The token's entropy is the browser's
 * `crypto.getRandomValues`, and `?stage=tr8.replay.s2` opens the page on a stage, which is how a lab's page links to it. A file dropped on the
 * slip is read in this tab, in a worker, and goes nowhere else.
 */
export function Component() {
  const evidence = useEvidence()
  const { hash } = useLocation()
  const [params] = useSearchParams()
  const { append, events } = evidence

  // Open, used and expired are counted at the instant the page last read the ledger. A token's life is days, so a page left open for a
  // day shows the state it had; reading the ledger again, which a write or another tab's does, counts afresh.
  const held = useMemo(() => heldChallenges(events, clockNow()), [events])

  const issue = useCallback<IssuePanelProps['issue']>((stage) => writeChallenge(stage, { append }), [append])
  const importer = useImport(evidence)

  return (
    <ReceiptsView
      ready={evidence.ready}
      backend={evidence.backend}
      readOnly={evidence.readOnly}
      held={held}
      receipts={evidence.receipts}
      open={hashOfFragment(hash)}
      preset={params.get('stage') ?? undefined}
      issue={issue}
      importer={importer.state}
      onChoose={(file) => void importer.choose(file)}
      onClear={importer.clear}
    />
  )
}
