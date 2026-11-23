/*
 * The seed a game leaves out of its page (`seedInPage: false` on the Frame): in a test build (`VITE_ES_TEST_HOOKS=1`, the flag the
 * scene kit's hook and the walks use) `window.__esSeed` returns the run's seed, so an e2e spec reads it without the page writing
 * `data-seed`. In any other build `SEED_HOOK` is the constant false and the bundler drops every line that uses it.
 */
export const SEED_HOOK: boolean = import.meta.env.VITE_ES_TEST_HOOKS === '1'

declare global {
  interface Window {
    __esSeed?: () => number | null
  }
}

/** Whether the frame writes `data-seed`: always, unless the game opted out and the run is graded or a Prove run. */
export const writesSeed = (seedInPage: boolean | undefined, mode: string): boolean => seedInPage !== false || mode === 'practice'

/** Puts the seed behind `window.__esSeed` while the run lives. A no-op outside test builds (or with `enabled` false). */
export function exposeSeed(read: () => number, enabled: boolean = SEED_HOOK): () => void {
  if (!enabled || typeof window === 'undefined') return () => undefined
  const hook = () => read()
  window.__esSeed = hook
  return () => {
    if (window.__esSeed === hook) delete window.__esSeed
  }
}
