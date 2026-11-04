/*
 * The read-only notice, as a store of its own (ARCHITECTURE §7.4).
 *
 * The notice has to show wherever a tab is, and the engine that knows about it loads lazily, with the first page that uses
 * the ledger. So the shell reads the notice from here, a module of a few lines that costs the first paint nothing, and the
 * hook publishes into it when the engine goes read-only. Until some page has opened the ledger there is nothing to say, and
 * the shell shows nothing.
 */
import type { ReadOnlyReason } from '@es/ledger'

export interface ReadOnlyNotice {
  reason: ReadOnlyReason
  /** What happened, that nothing is lost, and what to do. */
  text: string
}

let current: ReadOnlyNotice | null = null
const listeners = new Set<() => void>()

export const getReadOnlyNotice = (): ReadOnlyNotice | null => current

/** Sets the notice, or clears it with null. Listeners hear of a change only. */
export function setReadOnlyNotice(next: ReadOnlyNotice | null): void {
  if (next?.reason === current?.reason && next?.text === current?.text) return
  current = next
  for (const listener of [...listeners]) listener()
}

export function subscribeReadOnlyNotice(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
