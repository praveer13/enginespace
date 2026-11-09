/**
 * The families' faces (ARCHITECTURE §8.2, D-059): every family of the registry (registry.ts), in its order, as a page shows it and plans
 * with it before its code is loaded. Today composes a prep from these, and a lesson's item block shows its waiting ticket from one; the
 * code that makes, bands and grades an item loads when one is drawn (src/items/families.ts). A family is about 3.4 KB of gzip, most of
 * it its words (D-056), and a page that imported the registry carried every family's code whether or not it drew an item.
 *
 * Each face is the family's own fields, written out, because a face that imported its family would bring the family's code with it.
 * tests/items/catalog.test.ts holds this list to the registry, field for field and in order, and prints the face of a family that is
 * missing here. Data only: no DOM, no clock and no entropy, like the rest of packages/play.
 */
import type { GenFace } from './types'

export const CATALOG: readonly GenFace[] = [
  {
    id: 'tr1.request-state',
    version: 1,
    title: 'The states of a request',
    kcs: ['tr1.request-states', 'tr1.abort-path'],
    variants: [
      { id: 'next', title: 'The status after an event', kcs: ['tr1.request-states'], levels: [0, 1, 2, 3] },
      { id: 'moves', title: 'What moves a request on', kcs: ['tr1.request-states'], levels: [1, 2] },
      { id: 'count', title: 'Which statuses are finished', kcs: ['tr1.request-states'], levels: [2, 3] },
      { id: 'abort', title: 'The status after an abort', kcs: ['tr1.request-states', 'tr1.abort-path'], levels: [1, 2] },
    ],
  },
  {
    id: 'tr1.step-budget',
    version: 1,
    title: 'One step, two schedulers',
    kcs: ['tr1.phases-vs-one-budget'],
    variants: [
      { id: 'step', title: 'The tokens the next step runs', kcs: ['tr1.phases-vs-one-budget'], levels: [0, 1, 2, 3] },
      { id: 'holds', title: 'What the next step holds', kcs: ['tr1.phases-vs-one-budget'], levels: [0, 1, 2] },
      { id: 'left', title: 'The tokens still waiting after a step', kcs: ['tr1.phases-vs-one-budget'], levels: [2, 3] },
    ],
  },
  {
    id: 'tr1.what-moved',
    version: 1,
    title: 'What moved since the post',
    kcs: ['tr1.read-at-the-pin'],
    variants: [
      { id: 'box', title: 'What became of a box of the post', kcs: ['tr1.read-at-the-pin'], levels: [0, 1, 2, 3] },
      { id: 'statement', title: 'Whether a statement of the post still holds', kcs: ['tr1.read-at-the-pin'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr1.where-does-it-run',
    version: 1,
    title: 'Where a stage runs',
    kcs: ['tr1.sglang-lifecycle', 'tr1.vllm-lifecycle', 'tr1.abort-path'],
    variants: [
      { id: 'sglang', title: "Where a stage of Mini-SGLang's or SGLang's path runs", kcs: ['tr1.sglang-lifecycle'], levels: [0, 1, 2, 3] },
      { id: 'vllm', title: "Where a stage of vLLM's path runs", kcs: ['tr1.vllm-lifecycle'], levels: [0, 1, 2, 3] },
      { id: 'abort', title: "Where a stage of an abort's path runs", kcs: ['tr1.abort-path'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr1.which-mechanism',
    version: 1,
    title: 'Which mechanism joins a stage',
    kcs: ['tr1.five-mechanisms', 'tr1.sglang-lifecycle', 'tr1.vllm-lifecycle'],
    variants: [
      { id: 'nano', title: "A stage of nano-vllm's path", kcs: ['tr1.five-mechanisms'], levels: [0, 1, 2, 3] },
      { id: 'sglang', title: "A stage of Mini-SGLang's or SGLang's path", kcs: ['tr1.five-mechanisms', 'tr1.sglang-lifecycle'], levels: [0, 1, 2, 3] },
      { id: 'vllm', title: "A stage of vLLM's path", kcs: ['tr1.five-mechanisms', 'tr1.vllm-lifecycle'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr2.bubble-width',
    version: 1,
    title: 'Bubble width',
    kcs: ['tr2.bubble', 'tr2.async-overlap'],
    variants: [
      { id: 'async-off', title: 'The gap with async scheduling off', kcs: ['tr2.bubble'], levels: [0, 1, 2, 3] },
      { id: 'async-on', title: 'The gap with async scheduling on', kcs: ['tr2.async-overlap'], levels: [0, 1, 2, 3] },
      { id: 'close-it', title: 'The smallest change that closes the gap', kcs: ['tr2.bubble', 'tr2.async-overlap'], levels: [2, 3] },
    ],
  },
  {
    id: 'tr2.default-budget',
    version: 1,
    title: 'Defaults that move with the card',
    kcs: ['tr2.gpu-dependent-defaults'],
    variants: [
      { id: 'tier', title: 'The defaults a card starts with', kcs: ['tr2.gpu-dependent-defaults'], levels: [0, 1, 2, 3] },
      { id: 'budget-left', title: 'The budget left for a prompt', kcs: ['tr2.gpu-dependent-defaults'], levels: [0, 1, 2, 3] },
      { id: 'waiting', title: 'The requests still waiting', kcs: ['tr2.gpu-dependent-defaults'], levels: [1, 2, 3] },
    ],
  },
  {
    id: 'tr2.dispatch-key',
    version: 1,
    title: 'Dispatch keys',
    kcs: ['tr2.dispatch-keys'],
    variants: [
      { id: 'which-graph', title: 'Which graph replays a step', kcs: ['tr2.dispatch-keys'], levels: [0, 1, 2, 3] },
      { id: 'captured', title: 'The graphs captured at start-up', kcs: ['tr2.dispatch-keys'], levels: [0, 1, 2, 3] },
      { id: 'fields', title: 'The fields of the key', kcs: ['tr2.dispatch-keys'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr2.graph-hit',
    version: 1,
    title: 'Graph hit',
    kcs: ['tr2.graph-replay'],
    variants: [
      { id: 'hit-or-miss', title: 'What a step launches', kcs: ['tr2.graph-replay'], levels: [0, 1, 2, 3] },
      { id: 'launch-saved', title: 'The launch time a replay saves', kcs: ['tr2.graph-replay'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr2.kv-after-graphs',
    version: 1,
    title: 'The KV cache after the graphs',
    kcs: ['tr2.graph-memory'],
    variants: [
      { id: 'kv-tokens', title: 'The KV cache that is left', kcs: ['tr2.graph-memory'], levels: [0, 1, 2, 3] },
      { id: 'graphs-cost', title: 'What the graphs cost the cache', kcs: ['tr2.graph-memory'], levels: [0, 1, 2, 3] },
      { id: 'share', title: 'The share of the cache the graphs take', kcs: ['tr2.graph-memory'], levels: [1, 2, 3] },
    ],
  },
  {
    id: 'tr2.padding-waste',
    version: 1,
    title: 'Padding waste',
    kcs: ['tr2.capture-padding'],
    variants: [
      { id: 'padded-size', title: 'The size a step pads to', kcs: ['tr2.capture-padding'], levels: [0, 1, 2, 3] },
      { id: 'night-waste', title: 'The padding a night wastes', kcs: ['tr2.capture-padding'], levels: [0, 1, 2, 3] },
      { id: 'choose-sizes', title: 'Sizes that waste the least', kcs: ['tr2.capture-padding'], levels: [2, 3] },
    ],
  },
  {
    id: 'tr2.preempt-victim',
    version: 1,
    title: 'The victim, and the one budget',
    kcs: ['tr2.one-budget'],
    variants: [
      { id: 'victim', title: 'Which request is preempted', kcs: ['tr2.one-budget'], levels: [0, 1, 2, 3] },
      { id: 'restart', title: 'The tokens a victim computes again', kcs: ['tr2.one-budget'], levels: [1, 2, 3] },
      { id: 'chunk', title: 'The prompt a step takes', kcs: ['tr2.one-budget'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr2.runner-fallback',
    version: 1,
    title: 'The V2 runner, and when it falls back',
    kcs: ['tr2.mrv2-delta'],
    variants: [
      { id: 'which-runner', title: 'Which runner serves a configuration', kcs: ['tr2.mrv2-delta'], levels: [0, 1, 2, 3] },
      { id: 'phase', title: 'The phase a change of MRV2 shortens', kcs: ['tr2.mrv2-delta'], levels: [0, 1, 2, 3] },
      { id: 'saves', title: 'The CPU work MRV2 takes off a step', kcs: ['tr2.mrv2-delta'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr2.step-order',
    version: 1,
    title: 'One step, five calls',
    kcs: ['tr2.step-calls', 'tr2.bubble'],
    variants: [
      { id: 'order', title: 'The order of the calls', kcs: ['tr2.step-calls'], levels: [2, 3] },
      { id: 'role', title: 'What a call does and what it waits for', kcs: ['tr2.step-calls'], levels: [0, 1, 2, 3] },
      { id: 'idle-before', title: "The GPU's idle time before a step", kcs: ['tr2.bubble'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr6.exactness-test',
    version: 1,
    title: 'Testing a sampler for exactness',
    kcs: ['tr6.exactness-testing'],
    variants: [
      { id: 'df', title: 'The degrees of freedom of the test', kcs: ['tr6.exactness-testing'], levels: [0, 1, 2, 3] },
      { id: 'false-fail', title: 'How often an exact sampler fails by chance', kcs: ['tr6.exactness-testing'], levels: [0, 1, 2, 3] },
      { id: 'visible', title: 'Which check sees a bug', kcs: ['tr6.exactness-testing'], levels: [1, 2, 3] },
      { id: 'draws-needed', title: 'Draws until a bias shows', kcs: ['tr6.exactness-testing'], levels: [2, 3] },
    ],
  },
  {
    id: 'tr6.mask-fits',
    version: 1,
    title: 'The grammar mask against the forward',
    kcs: ['tr6.mask-overlap'],
    variants: [
      { id: 'gap', title: "The GPU's idle gap with a mask", kcs: ['tr6.mask-overlap'], levels: [0, 1, 2, 3] },
      { id: 'fits', title: 'How much of the fill the GPU waits for', kcs: ['tr6.mask-overlap'], levels: [1, 2, 3] },
      { id: 'heaviest', title: 'The heaviest grammar that adds nothing', kcs: ['tr6.mask-overlap'], levels: [2, 3] },
    ],
  },
  {
    id: 'tr6.mask-phases',
    version: 1,
    title: 'The four phases of a grammar mask',
    kcs: ['tr6.mask-phases'],
    variants: [
      { id: 'name', title: 'Name the phase', kcs: ['tr6.mask-phases'], levels: [0, 1, 2, 3] },
      { id: 'runs-on', title: 'What runs the phase', kcs: ['tr6.mask-phases'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr6.verify-shape',
    version: 1,
    title: 'One speculative step',
    kcs: ['tr6.verify-shape'],
    variants: [
      { id: 'positions', title: 'The positions one verify step computes', kcs: ['tr6.verify-shape'], levels: [0, 1, 2, 3] },
      { id: 'tokens-out', title: 'The tokens one verify step emits', kcs: ['tr6.verify-shape'], levels: [0, 1, 2, 3] },
      { id: 'uniform', title: 'The graph that serves a speculative step', kcs: ['tr6.verify-shape'], levels: [1, 2, 3] },
    ],
  },
  {
    id: 'tr6.which-runner',
    version: 1,
    title: 'Proposers, and the runner they run on',
    kcs: ['tr6.proposer-families'],
    variants: [
      { id: 'needs', title: 'What a method drafts from', kcs: ['tr6.proposer-families'], levels: [0, 1, 2, 3] },
      { id: 'choose', title: 'The method for what the team has', kcs: ['tr6.proposer-families'], levels: [1, 2, 3] },
      { id: 'runner', title: 'The runner a configuration runs on', kcs: ['tr6.proposer-families'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr8.goodput-denominator',
    version: 1,
    title: 'The denominator of a goodput',
    kcs: ['tr8.goodput-denominator'],
    variants: [
      { id: 'tool-prints', title: 'What a tool prints for a run', kcs: ['tr8.goodput-denominator'], levels: [0, 1, 2, 3] },
      { id: 'convert', title: 'A goodput over the other clock', kcs: ['tr8.goodput-denominator'], levels: [0, 1, 2, 3] },
      { id: 'which-clock', title: 'The clock a printed goodput divides by', kcs: ['tr8.goodput-denominator'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr8.littles-law',
    version: 1,
    title: "Little's law as a check on a log",
    kcs: ['tr8.littles-law'],
    variants: [
      { id: 'in-flight', title: 'Requests in flight, from the rate and the latency', kcs: ['tr8.littles-law'], levels: [0, 1, 2, 3] },
      { id: 'solve-for', title: 'The latency or the rate, from the other two', kcs: ['tr8.littles-law'], levels: [0, 1, 2, 3] },
      { id: 'check', title: 'Whether a log agrees with itself', kcs: ['tr8.littles-law'], levels: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'tr8.which-flag',
    version: 1,
    title: 'Which flag of the benchmark tools',
    kcs: ['tr8.tool-defaults', 'tr8.client-queue'],
    variants: [
      { id: 'at-fault-vllm', title: 'The flag of vllm bench serve at fault', kcs: ['tr8.tool-defaults'], levels: [0, 1, 2, 3] },
      { id: 'at-fault-sglang', title: 'The flag of sglang.bench_serving at fault', kcs: ['tr8.tool-defaults'], levels: [0, 1, 2, 3] },
      { id: 'default-does', title: 'What a tool does when a flag is left out', kcs: ['tr8.tool-defaults'], levels: [3] },
      { id: 'send-rate', title: 'The rate a capped run sends', kcs: ['tr8.client-queue', 'tr8.tool-defaults'], levels: [0, 1, 2, 3] },
    ],
  },
]

const BY_ID: ReadonlyMap<string, GenFace> = new Map(CATALOG.map((face) => [face.id, face]))

/** The face of the family called `id`, or undefined for an id this build has no family for (a lesson may name one that a later task builds). */
export function faceById(id: string, faces: readonly GenFace[] = CATALOG): GenFace | undefined {
  return faces === CATALOG ? BY_ID.get(id) : faces.find((face) => face.id === id)
}
