import { useEffect, useState } from 'react'

/*
 * The instrument's parts that the first paint does not draw: the run as a table (the step loop's mirror) and the card of what the model
 * leaves out, each in a closed disclosure under the instrument. The page asks for them as soon as it has rendered, and each shows its
 * loading line in its own box until they are in, so the first-paint closure keeps its room under its budget (A§6.10, verify:bundle's front
 * row). They are the loop game's own parts, loaded on demand as a game's parts are. The static shell (shell.ts) loads them before it
 * renders, so the document holds the table and the card in full.
 */
export interface NightParts {
  readonly Mirror: typeof import('@/games/loop/Mirror').Mirror
  readonly WorldCard: typeof import('@/games/loop/Card').WorldCard
}

let parts: NightParts | null = null
let loading: Promise<NightParts> | null = null

/** Loads the parts once; every caller gets the same promise. */
export function loadNight(): Promise<NightParts> {
  loading ??= Promise.all([import('@/games/loop/Mirror'), import('@/games/loop/Card')]).then(
    ([mirror, card]) => (parts = { Mirror: mirror.Mirror, WorldCard: card.WorldCard }),
    (error: unknown) => {
      // A chunk that failed to arrive is asked for again on the next render that wants it; the loading line stays meanwhile.
      loading = null
      throw error
    },
  )
  return loading
}

/** The parts once they are in, and null until then; the first render asks for them. */
export function useNight(): NightParts | null {
  const [now, setNow] = useState<NightParts | null>(parts)
  useEffect(() => {
    if (now !== null) return
    let live = true
    loadNight().then(
      (loaded) => {
        if (live) setNow(loaded)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [now])
  return now
}
