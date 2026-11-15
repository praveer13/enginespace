/**
 * What Request path's levels say, by level id (R-T02, R-T04): the title in the level menu, the goal line, the line a level opens on, and
 * for the graded level its pass rule. The words are display copy and no rule reads them, so they are not in a level or a state: rewording
 * one moves no state hash and no golden. The view reads them here by id (`floorView`), and `levelTitle` serves the registry's record.
 *
 * The words are the engine's (REDESIGN §2.7, D-063): process, thread, queue, IPC, shared memory, copy, sync, stage. Only the pass rule
 * carries a digit, the level's own bar, and tests/copy/game-copy.test.ts reads it from the level and finds it there. The facts are the
 * lifecycle model's (content/cards/lifecycle.md), which cites the pinned source.
 *
 * A practice level's title names the engine and nothing of its architecture, and its prompt, which says what the level is about, is shown
 * once the prediction is written down: "one process" or "four processes" before it would answer it. The graded level's title names the
 * level and no engine, because the engine is the scenario's and the order shows it; its prompt says what the level asks and carries no
 * digit. Neither answers the prediction.
 */
import type { GoalLine } from '../types'
import type { FloorLevelId } from './types'

export interface FloorCopy {
  readonly title: string
  readonly goal: GoalLine
  readonly prompt: string
  /** The graded level's pass rule, stated before the run (REDESIGN §2.6), with the level's bar in it. */
  readonly passRule?: string
}

const CONTROLS = 'You lay each stage from the stage list: its mechanism, and where it runs.'
const BEAT = "The number to beat is the engine's own path: the run stops at the first stage that departs from it."
const ENDS = 'Ends when the request reaches the client.'

/** The practice goal: lay one engine's path. */
const practice = (engine: string): GoalLine => ({ aim: `Lay the path one request takes through ${engine}, stage by stage.`, controls: CONTROLS, beat: BEAT, ends: ENDS })

/** The bar of `map` (ASSESSMENT §4.3): the whole path right on the level's one run, `attempts` in levels.ts. */
const MAP_PASS = 'Passes when the whole path is right on your 1 run: every stage you lay matches a span of the trace, in order.'

export const FLOOR_COPY: Readonly<Record<FloorLevelId, FloorCopy>> = {
  nano: {
    title: 'nano-vllm',
    goal: practice('nano-vllm'),
    prompt:
      'An offline library: the caller, the scheduler and the model runner share one process and one thread, so the request crosses no IPC. It goes to the GPU by a host-to-device copy and comes back by a device-to-host copy, and the CPU waits on a sync before it reads what came back.',
  },
  'nano-tp': {
    title: 'nano-vllm on two GPUs',
    goal: practice('nano-vllm on two GPUs'),
    prompt:
      "A second rank is a second process. nano-vllm starts a worker for it and passes each call through shared memory, and the two GPUs exchange every layer's partial results in a collective.",
  },
  mini: {
    title: 'Mini-SGLang',
    goal: practice('Mini-SGLang'),
    prompt:
      'Four processes joined by ZMQ: the API server, a tokenizer, a scheduler for the rank, and a detokenizer. The scheduler overlaps, so the sync on a copy comes in the next turn of its loop.',
  },
  inside: {
    title: 'Inside vLLM',
    goal: practice('vLLM as the post "Inside vLLM" reads it'),
    prompt:
      'vLLM at the commit the post "Inside vLLM" reads. The API server and the engine core are two processes, and inside the engine core an input thread, the busy loop and an output thread hand the request to one another through queues.',
  },
  vllm: {
    title: 'vLLM at the pin',
    goal: practice('vLLM at the pin'),
    prompt:
      'vLLM at the pin plans the next step before the last one is read back: async scheduling is on by default, so the busy loop launches a batch, keeps its future in `batch_queue`, and waits on the oldest only when the queue is full.',
  },
  sglang: {
    title: 'SGLang at the pin',
    goal: practice('SGLang at the pin'),
    prompt:
      'SGLang at the pin: the scheduler launches one batch and reads the result of the one before it in the next turn of its loop. A prefix hit is found in the radix tree before the batch is built.',
  },
  abort: {
    title: 'vLLM: the client disconnects',
    goal: {
      aim: 'Lay the path of a request whose client disconnects mid-stream, and of its abort.',
      controls: CONTROLS,
      beat: BEAT,
      ends: "Ends when the request's path and its abort both run through.",
    },
    prompt:
      'The client goes away in the middle of the stream. In vLLM at the pin the abort rides a queue of its own and is drained before `update_from_output`. Lay the way the first token took, and then the abort.',
  },
  map: {
    title: 'Map the request path',
    goal: {
      aim: 'Lay the whole path of a request through an engine you are not told the shape of.',
      controls: 'You lay every stage from the stage list, then run the request once.',
      beat: MAP_PASS,
      ends: 'Ends after your one run.',
    },
    prompt:
      'A request on one of the five engines, and no word of how the engine is built. Lay its whole path from the stage list, naming every queue, copy and sync, in the order the engine makes them. The request runs once, and the trace then checks every stage you laid against the spans the request leaves.',
    passRule: MAP_PASS,
  },
}
