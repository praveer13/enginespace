import { useSyncExternalStore } from 'react'
import type { Orientation } from '@es/play/broken-bench/layout'

/** Below 480 px wide each sheet has a portrait layout, where the long axis runs down a phone's height (GAMES.md §2.3, "Portrait framing"). */
const NARROW = '(max-width: 479px)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Portrait on a phone, landscape otherwise. The server and the first paint say landscape. */
export function useOrientation(): Orientation {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(NARROW).matches ? 'portrait' : 'landscape'),
    () => 'landscape',
  )
}
