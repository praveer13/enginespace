/*
 * The pointer for React (D-066): `nextStep`'s last answer, as `es:next` keeps it, or the empty ledger's answer (the first lesson) when it
 * holds none. It never opens the ledger, so the header and every empty state can say Continue at first paint. store.ts holds the key.
 */
import { useSyncExternalStore } from 'react'
import { hearPointer, pointerSnapshot, START_POINTER } from './store'
import type { Pointer } from './store'

export function usePointer(): Pointer {
  return useSyncExternalStore(hearPointer, pointerSnapshot, () => null) ?? START_POINTER
}
