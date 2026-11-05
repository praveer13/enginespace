/**
 * The Reach-In's record in the game registry (ARCHITECTURE §6.3, D-049): what is known about the game without running it, which the Play
 * index, the static-routes script and `verify:games` read. It is data and one loader. The rules load with the game (`session`, below),
 * so the registry never pulls the sim into a page that only lists games.
 *
 * Practice seeds are pinned here as plain numbers because this file may not import the levels (they import the sim). Each is the first
 * seed from 0 that the level's band accepts (GAMES.md §2.1), and tests/play/pool-levels.test.ts checks that it still is.
 */
import type { GameEntry } from '../types'

export const POOL: GameEntry = {
  id: 'pool',
  modules: ['tr5a'],
  title: 'The Reach-In',
  subtitle: 'hybrid KV pages and adapters',
  // The 3D scene is W1-T24's: it adds src/games/pool/Scene3D.tsx and flips this.
  has3d: false,
  // The graded `manager` level is the first graded reference for these two (content/kc/graph.yaml). The rest of TR5a's KCs wait for the lab.
  kcs: ['tr5a.kv-groups', 'tr5a.page-size-unification'],
  keys: [
    { id: 'wait', code: 'KeyW', label: 'W', description: 'Hang none, or bring no kit in, this step' },
    { id: 'dump', code: 'KeyD', label: 'D', description: 'Dump the pans chosen' },
  ],
  levels: [
    { id: 'one-group', title: 'One station', graded: false, practiceSeed: 2 },
    { id: 'two-kinds', title: 'Two kinds of station', graded: false, practiceSeed: 10 },
    { id: 'evict', title: 'Dump the right pans', graded: true, practiceSeed: 10 },
    { id: 'same-size', title: 'One pan size', graded: false, practiceSeed: 0 },
    { id: 'state', title: 'A station of state', graded: false, practiceSeed: 0 },
    { id: 'adapters', title: 'Recipe kits', graded: true, practiceSeed: 0 },
    { id: 'manager', title: 'The whole manager', graded: true, practiceSeed: 0 },
  ],
  card: 'kv',
  claims: [
    'vllm.hybrid-kv.single-pool',
    'vllm.hybrid-kv.intersection',
    'vllm.hybrid-kv.n-group-lookup',
    'vllm.hybrid-kv.one-lru',
    'vllm.hybrid-kv.sliding-skipped-tokens',
    'vllm.hybrid-kv.page-unify',
    'vllm.hybrid-kv.doc-example-blocks',
    'vllm.hybrid-kv.doc-gemma3-layers',
    'vllm.kv-pool.allocate-from-front',
    'vllm.kv-pool.free-reverse',
    'vllm.kv-pool.admission-counts-evictable',
    'vllm.scheduler.preemption-recompute',
    'vllm.scheduler.preemption-victim',
    'vllm.cache.block-size-default',
    'kv.slora.unified-paging',
    'vllm.lora.slot-count',
    'vllm.lora.admission-cap',
    'sglang.lora.pool',
  ],
  session: async () => (await import('./session')).poolSession,
}
