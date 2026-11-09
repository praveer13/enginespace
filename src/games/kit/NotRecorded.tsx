import { Icon } from '@/design/components/Glyph'

/** The line under a game whose last run the ledger did not take (useRecorder.ts). The game plays on; the learner is told, and knows what to do. */
export function NotRecorded({ detail }: { detail: string }) {
  return (
    <p className="flex items-start gap-2 font-bold text-paper-ink-2" role="status" data-not-recorded="">
      <Icon name="alert" className="mt-1 size-4 flex-none" />
      <span>This run was not written to your record. {detail} Reload the page to keep your runs.</span>
    </p>
  )
}
