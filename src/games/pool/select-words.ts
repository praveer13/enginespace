import type { MemoryState } from '@/design/code'
import type { StationView } from '@es/play/pool/types'

/*
 * The words the 3D view's selection panel (Stage3D.tsx) says a page and a request in. They are glyphs.ts's and words.ts's, said again here
 * on purpose: the panel's chunk loads only when the learner switches to 3D, and a value it imported from the page's modules would fold the
 * page's chunk into its own (the bundle check names the game's chunk by its source file). tests/play/pool-scene.test.ts holds the two
 * copies equal.
 */

export const STATE_WORDS: Readonly<Record<MemoryState, string>> = {
  free: 'free',
  used: 'in use',
  cached: 'cached',
  shared: 'a prefix hit waits on it',
  adapter: "an adapter's",
  evicted: 'chosen to evict',
}

export const KIND_WORDS: Readonly<Record<StationView['kind'], string>> = { full: 'full attention', sliding: 'sliding window', state: 'state' }

export const pagesWord = (n: number): string => (n === 1 ? 'page' : 'pages')

export const reqName = (id: number): string => `R${id + 1}`
