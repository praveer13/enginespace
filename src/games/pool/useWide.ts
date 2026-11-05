import { useSyncExternalStore } from 'react'

/** From 48rem the page has room: the list of levels is on it, and the pointer may pick a pan in the rack. A phone picks from the lists. */
const WIDE = '(min-width: 48rem)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Whether the window is wide. The first paint says wide, which is what a server or a static shell would draw. */
export const useWide = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => true,
  )
