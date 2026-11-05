/**
 * The Inspection's record in the game registry (ARCHITECTURE §6.3, D-049): what is known about the game without running it, which the
 * Play index, the static-routes script and `verify:games` read. It is data and one loader. The rules load with the game (`session`,
 * below), so the registry never pulls the sim into a page that only lists games, and the first paint of the front page pays for this
 * record and nothing else of the game.
 *
 * The display name leads and the engine concept follows it (D-049): the game's id, its levels and its actions stay the engine's.
 * Practice seeds are pinned here as plain numbers because this file may not import the levels (they import the sim). Each is the first
 * seed from 0 that the level's band accepts (GAMES.md §2.1), which is 0, since the band is kept inside every case (session.ts), and
 * tests/play/broken-bench-entry.test.ts checks that each still is and that it deals the flaw the level teaches.
 */
import type { GameEntry } from '../types'

/** The three sheets of the board, which `[` and `]` move between (GAMES.md §11, "Controls": view tabs). */
const SHEETS = ['rows', 'timeline', 'histogram'] as const

export const BROKEN_BENCH: GameEntry = {
  id: 'broken-bench',
  modules: ['tr8'],
  title: 'The Inspection',
  subtitle: 'benchmark methodology',
  // The 3D opener, rain-and-relay, is a stretch built after `court` ships (GAMES.md §11), so the game has no Scene3D.tsx yet.
  has3d: false,
  kcs: ['tr8.latency-from-due', 'tr8.open-vs-closed', 'tr8.client-queue', 'tr8.warmup-rule', 'tr8.min-n-tail', 'tr8.bootstrap-p99', 'tr8.time-shaped-replay'],
  keys: [
    { id: 'stopwatch', code: 'KeyT', label: 'T', description: 'Time each order from the send, or from when it was due' },
    { id: 'next-row', code: 'KeyJ', label: 'J', description: 'Select the next order in the log' },
    { id: 'prev-row', code: 'KeyK', label: 'K', description: 'Select the previous order in the log' },
  ],
  levels: [
    { id: 'due', title: 'From the due time', graded: true, practiceSeed: 0, stages: SHEETS },
    { id: 'warm', title: 'The warm-up cut', graded: true, practiceSeed: 0, stages: SHEETS },
    { id: 'sure', title: 'How sure', graded: true, practiceSeed: 0, stages: SHEETS },
    { id: 'court', title: 'The court', graded: true, practiceSeed: 0, stages: SHEETS },
  ],
  card: 'trace-room-bench',
  // The claims the debrief can cite: the real-world instance of each flaw (FLAW_CLAIMS in packages/sim/bench/broken.ts), then the flags of the
  // In-production card (src/games/broken-bench/Production.tsx).
  claims: [
    'bench.kernelspace.samples-rule',
    'bench.kernelspace.warm-up-rule',
    'bench.schroeder.closed-vs-open',
    'bench.wrk2.from-should-have',
    'bench.wrk2.stall-corrected-p99',
    'bench.wrk2.stall-ratio',
    'bench.wrk2.stall-uncorrected-p99',
    'sglang.bench.flush-cache-after-warmup',
    'sglang.bench.goodput',
    'sglang.bench.max-concurrency-semaphore',
    'sglang.bench.rust-client-2500-requests',
    'sglang.bench.rust-client-sets-throughput',
    'sglang.bench.timer-inside-request',
    'sglang.bench.warmup-default',
    'vllm.bench.arrivals',
    'vllm.bench.burstgpt-lengths-only',
    'vllm.bench.client-queue-time',
    'vllm.bench.e2el-including-client-queue',
    'vllm.bench.guide-mean-median-p99',
    'vllm.bench.guide-ten-prompts',
    'vllm.bench.max-concurrency-closed-loop',
    'vllm.bench.max-concurrency-recommended',
    'vllm.bench.max-tokens-is-output-len',
    'vllm.bench.metric-percentiles-default',
    'vllm.bench.num-warmups-default',
    'vllm.bench.prefix-cache-reuse',
    'vllm.bench.request-rate-default',
    'vllm.bench.self-timed-default',
    'vllm.bench.sharegpt-output-len',
  ],
  session: async () => (await import('./session')).benchSession,
}
