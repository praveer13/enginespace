import { useSyncExternalStore } from 'react'
import type { Orientation } from '@es/play/loop/layout'

/** Below 480 px wide each scene has a portrait layout, where long axes run down a phone's height (GAMES.md §2.3, "Portrait framing"). */
const NARROW = '(max-width: 479px)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Portrait on a phone, landscape otherwise. The server and the first paint say landscape, which is also the static poster's default. */
export function useOrientation(): Orientation {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(NARROW).matches ? 'portrait' : 'landscape'),
    () => 'landscape',
  )
}
