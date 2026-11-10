/*
 * `useImport(ledger)`: bringing a receipt back, as a state machine for the page (ARCHITECTURE §8.4; W2-T07). The learner drops or chooses a file;
 * the hook hands it to the receipt worker with what the ledger holds, and keeps what comes back (importer.ts). The state is a plain value, and
 * ImportPanel draws it, so a test draws any state without a worker.
 *
 *   idle      nothing chosen yet
 *   checking  a file is in the worker
 *   refused   the file is not a receipt this browser can read: nothing was kept
 *   kept      the receipt was read whole and is in the ledger, with its report
 *   failed    the check broke, or the ledger would not take the receipt: nothing was kept
 *
 * One file is checked at a time. A file chosen while another is being checked is ignored, and the panel disables its controls for that time.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Evidence } from '@/evidence/useEvidence'
import { importReceipt } from './importer'
import type { FileFacts, ImportResult } from './importer'
import type { Verifier } from './protocol'
import { verifyInWorker } from './verify-in-worker'

export type ImportState = { step: 'idle' } | { step: 'checking'; file: FileFacts } | ImportResult

export interface Importer {
  state: ImportState
  /** Checks a file, and keeps it if it is a receipt. */
  choose(file: File): Promise<void>
  /** Puts the panel back to waiting for a file. */
  clear(): void
}

/** The part of the ledger the hook uses: `useEvidence()` gives all of it. */
export type ImportLedger = Pick<Evidence, 'events' | 'receipts' | 'keepReceipt'>

export function useImport(ledger: ImportLedger, verify: Verifier = verifyInWorker, now: () => number = Date.now): Importer {
  const [state, setState] = useState<ImportState>({ step: 'idle' })
  const busy = useRef(false)
  const alive = useRef(true)
  // What the handler reads is the ledger as it stands when the file is dropped, kept in a ref that an effect updates after each render.
  const latest = useRef(ledger)
  useEffect(() => {
    latest.current = ledger
  })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const choose = useCallback(
    async (file: File) => {
      if (busy.current) return
      busy.current = true
      setState({ step: 'checking', file: { name: file.name, bytes: file.size } })
      try {
        const result = await importReceipt(file, {
          verify,
          keep: (input) => latest.current.keepReceipt(input),
          ledger: { events: latest.current.events, receipts: latest.current.receipts },
          now,
          cancelled: () => !alive.current,
        })
        if (alive.current) setState(result)
      } finally {
        busy.current = false
      }
    },
    [verify, now],
  )

  const clear = useCallback(() => {
    if (!busy.current) setState({ step: 'idle' })
  }, [])

  return { state, choose, clear }
}
