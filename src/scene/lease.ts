/*
 * One live 3D canvas per page (ARCHITECTURE §6.4). A Stage that wants its scene asks for the lease; while another Stage
 * holds it, this one shows its 2D view and a button that takes the lease over, and the holder falls back to its 2D view.
 * Browsers cap live WebGL contexts at a small number, and one scene is what a reader looks at anyway.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'

export interface Lease {
  readonly holder: () => string | null
  /** Takes the lease if it is free. True when `id` holds it afterwards. */
  acquire(id: string): boolean
  /** Takes the lease whoever holds it: the learner opened this view. */
  take(id: string): void
  release(id: string): void
  subscribe(listener: () => void): () => void
}

export function createLease(): Lease {
  let holder: string | null = null
  const listeners = new Set<() => void>()
  const set = (next: string | null) => {
    if (next === holder) return
    holder = next
    for (const listener of listeners) listener()
  }
  return {
    holder: () => holder,
    acquire(id) {
      if (holder === null) set(id)
      return holder === id
    },
    take: (id) => set(id),
    release(id) {
      if (holder === id) set(null)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The page's lease. */
export const pageLease = createLease()

/**
 * Holds the page's lease while `want` is true. `held` says whether this Stage may draw its scene; `take()` takes the lease
 * from whoever has it.
 */
export function useLease(id: string, want: boolean, lease: Lease = pageLease): { held: boolean; holder: string | null; take: () => void } {
  const holder = useSyncExternalStore(lease.subscribe, lease.holder, () => null)
  useEffect(() => {
    if (!want) return
    lease.acquire(id)
    // A lease freed by another Stage goes to whichever Stage still wants one.
    const unsubscribe = lease.subscribe(() => {
      if (lease.holder() === null) lease.acquire(id)
    })
    return () => {
      unsubscribe()
      lease.release(id)
    }
  }, [id, want, lease])
  const take = useCallback(() => lease.take(id), [id, lease])
  return { held: want && holder === id, holder, take }
}
