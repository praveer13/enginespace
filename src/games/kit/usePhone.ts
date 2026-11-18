import { useSyncExternalStore } from 'react'

/** A phone's width: the frame's own breakpoint (frame.css, front.css). */
const PHONE = '(max-width: 47.999rem)'

function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * Whether the window is a phone's width. The first paint says it is not, which is what a server or a static shell draws; a phone answers on
 * the client. A scene whose 3D has no legible phone layout yet withholds its view switch here (REDESIGN §2.9: 2D on phones).
 */
export const usePhone = (): boolean =>
  useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE).matches,
    () => false,
  )
