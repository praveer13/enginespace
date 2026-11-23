import { useSyncExternalStore } from 'react'

/*
 * Below the narrow breakpoint, 48rem, a trace is a list (GAMES.md §6 "Controls"; TR3's design, item 10): at 390 px the lanes are 358 px
 * wide, and there they cannot be read or marked. A phone held either way is narrow; a tablet held upright, at 48rem and more, is not.
 */
export const NARROW = '(max-width: 47.999rem)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Whether the window is below the narrow breakpoint. A server, or a page with no `matchMedia`, says it is not. */
export const useNarrow = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches,
    () => false,
  )
