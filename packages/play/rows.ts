/**
 * The game rows (ARCHITECTURE §6.3, D-059): one lean record for each game of the registry, in the registry's order, for the pages that
 * need only a game's id, modules, title, KCs, levels (id, title, graded) and Prove level: Today and the progress code (`src/progress`), the
 * Evidence page, the Games index. A game's subtitle, keys, claims, card, level seeds and loader are in its `entry.ts` and reach a page only
 * through `registry.ts`, so a game that joins costs these pages its row and not its record.
 *
 * A row repeats the fields of the game's entry, as the roster repeats its title and modules, and for the same reason: a page that imports
 * the entry carries the entry's whole chunk, and a row that the entry imported would be a chunk of its own in every page that reads the
 * entry, which measured 175 to 190 B on each game's route and 271 B on the front page [measured 2026-11-22 at f6386fdf]. So a row is
 * written here, beside the entry's own fields, and `tests/play/registry.test.ts` holds each row to its entry, field for field, and the
 * order of the rows to the registry's. A game's task adds its row to this list in the commit that adds its entry.
 *
 * Like `registry.ts`, the call that makes `ROWS` is marked pure, so that a build in which nothing reads it leaves this module out. The
 * package's index does not export it: a page imports `@es/play/rows`.
 */
import type { GameRow } from './types'

export interface GameRows {
  readonly rows: readonly GameRow[]
  /** The row for a game id, or undefined. A name such as `constructor` is unknown, not a function from a prototype. */
  get(id: string): GameRow | undefined
}

/** Rows over `rows`. Throws when two share an id, as `createRegistry` does. */
export function createRows(rows: readonly GameRow[]): GameRows {
  const byId = new Map<string, GameRow>()
  for (const row of rows) {
    if (byId.has(row.id)) throw new Error(`two games have a row as "${row.id}"`)
    byId.set(row.id, row)
  }
  return { rows: Object.freeze([...rows]), get: (id) => byId.get(id) }
}

const LOOP_ROW: GameRow = {
  id: 'loop',
  modules: ['tr2', 'tr6'],
  title: 'Step loop',
  kcs: ['tr2.bubble', 'tr2.async-overlap', 'tr2.mrv2-delta', 'tr2.graph-modes', 'tr2.graph-memory'],
  levels: [
    { id: 'first-1-fill', title: 'Fill the batch', graded: false },
    { id: 'first-2-slot', title: 'Refill a slot', graded: false },
    { id: 'first-3-gap', title: 'Close a bubble', graded: false },
    { id: 'first-4-par', title: 'Both levers', graded: false },
    { id: 'async', title: 'Async scheduling on two cost cards', graded: false },
    { id: 'graphs', title: 'CUDA graphs: launches against replay', graded: false },
    { id: 'mrv2', title: 'The V2 model runner', graded: false },
    { id: 'close', title: 'Every lever, on new numbers', graded: true },
    { id: 'mask', title: 'The grammar mask inside a step', graded: false },
  ],
}

const VERIFIER_ROW: GameRow = {
  id: 'verifier',
  modules: ['tr6'],
  title: 'Rejection sampler',
  kcs: ['tr6.exact-acceptance', 'tr6.residual-recovery', 'tr6.acceptance-length'],
  levels: [
    { id: 'overlap', title: 'Acceptance rate: the overlap of p and q', graded: false },
    { id: 'exact', title: 'Resample from the residual', graded: true },
    { id: 'chain', title: 'Tokens per round with γ drafts', graded: true },
    { id: 'greedy-ngram', title: 'Greedy target, n-gram draft', graded: false },
    { id: 'mutants', title: 'Five broken accept rules', graded: false },
    { id: 'gamma', title: 'Choose γ', graded: true },
  ],
  prove: 'exact',
}

const ENGINE_FLOOR_ROW: GameRow = {
  id: 'engine-floor',
  modules: ['tr1'],
  title: 'Request path',
  kcs: ['tr1.five-mechanisms', 'tr1.small-engine-anatomy', 'tr1.vllm-lifecycle', 'tr1.sglang-lifecycle', 'tr1.abort-path'],
  levels: [
    { id: 'nano', title: 'nano-vllm', graded: false },
    { id: 'nano-tp', title: 'nano-vllm on two GPUs', graded: false },
    { id: 'mini', title: 'Mini-SGLang', graded: false },
    { id: 'inside', title: 'Inside vLLM', graded: false },
    { id: 'vllm', title: 'vLLM at the pin', graded: false },
    { id: 'sglang', title: 'SGLang at the pin', graded: false },
    { id: 'abort', title: 'vLLM: the client disconnects', graded: false },
    { id: 'map', title: 'Map the request path', graded: true },
  ],
}

const BROKEN_BENCH_ROW: GameRow = {
  id: 'broken-bench',
  modules: ['tr8'],
  title: 'Broken benchmark',
  kcs: ['tr8.latency-from-due', 'tr8.open-vs-closed', 'tr8.client-queue', 'tr8.warmup-rule', 'tr8.min-n-tail', 'tr8.bootstrap-p99', 'tr8.time-shaped-replay'],
  levels: [
    { id: 'due', title: 'From due time', graded: true },
    { id: 'warm', title: 'Warm-up cut', graded: true },
    { id: 'sure', title: 'p99 interval', graded: true },
    { id: 'court', title: 'Five reports', graded: true },
  ],
}

const POOL_ROW: GameRow = {
  id: 'pool',
  modules: ['tr5a'],
  title: 'KV page pool',
  kcs: ['tr5a.kv-groups', 'tr5a.page-size-unification'],
  levels: [
    { id: 'one-group', title: 'One KV group', graded: false },
    { id: 'two-kinds', title: 'Full attention and a sliding window', graded: false },
    { id: 'evict', title: 'Choose what to evict', graded: true },
    { id: 'same-size', title: 'One page size for every group', graded: false },
    { id: 'state', title: 'A state group', graded: false },
    { id: 'adapters', title: 'LoRA adapters in the same pool', graded: true },
    { id: 'manager', title: 'The whole manager', graded: true },
  ],
}

const SHAPE_SHIFTER_ROW: GameRow = {
  id: 'shape-shifter',
  modules: ['tr0'],
  title: 'Tensor views',
  kcs: ['tr0.tensor-metadata', 'tr0.view-vs-copy', 'tr0.broadcast-stride-zero', 'tr0.triton-program-model', 'tr0.triton-masks'],
  levels: [
    { id: 'views', title: 'A transpose is a view', graded: false },
    { id: 'stride-zero', title: 'Broadcasting is stride 0', graded: false },
    { id: 'three-d', title: 'One block per head', graded: false },
    { id: 'fewest', title: 'Fewest copies', graded: true },
    { id: 'grid', title: 'A grid of programs', graded: true },
  ],
  prove: 'fewest',
}

/** The row of every game, in the order of `GAMES`. */
export const ROWS: GameRows = /* @__PURE__ */ createRows([LOOP_ROW, VERIFIER_ROW, ENGINE_FLOOR_ROW, BROKEN_BENCH_ROW, POOL_ROW, SHAPE_SHIFTER_ROW])
