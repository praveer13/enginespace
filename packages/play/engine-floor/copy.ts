/**
 * What Back of House's levels say, by level id (R-T02): the title on the rail and the line a level opens on. The words are display copy
 * and no rule reads them, so they are not in a level or a state: rewording one moves no state hash and no golden. The view reads them
 * here by id (`floorView`), and `levelTitle` serves the registry's record.
 *
 * Copy follows GAMES.md §2.6: the kitchen's word names the object and the engine's term rides beside it. It carries no digit, so no
 * number goes untagged. The facts in it are the lifecycle model's (content/cards/lifecycle.md), which cites the pinned source.
 *
 * A practice level's title names the engine and nothing of its architecture, and its prompt, which says what the level is about, is shown
 * once the prediction is written down: "one process" or "four processes" before it would answer it. The graded level's title names the
 * level and no engine, because the engine is the scenario's and the order shows it; its prompt says what the level asks and carries no
 * digit. Neither answers the prediction.
 */
import type { FloorLevelId } from './types'

export interface FloorCopy {
  readonly title: string
  readonly prompt: string
}

export const FLOOR_COPY: Readonly<Record<FloorLevelId, FloorCopy>> = {
  nano: {
    title: 'nano-vllm',
    prompt:
      'An offline library: the caller, the scheduler and the model runner share one process and one thread, so the ticket crosses no window. It goes down to the line by the dumbwaiter and comes back up, and the hands wait for it ("Heard!") before they read what it brought.',
  },
  'nano-tp': {
    title: 'nano-vllm on two GPUs',
    prompt:
      'A second rank is a second process. nano-vllm starts a worker for it and passes each call through shared memory (the window shelf), and the halves of every layer pass across between the two GPUs.',
  },
  mini: {
    title: 'Mini-SGLang',
    prompt:
      'Four processes joined by ZMQ, each a window: the API server, a tokenizer, a scheduler for the rank, and a detokenizer. The scheduler overlaps, so the sync on a copy comes in the next turn of its loop.',
  },
  inside: {
    title: 'Inside vLLM',
    prompt:
      'vLLM at the commit the post "Inside vLLM" reads. The API server and the engine core are two processes, and inside the engine core an input thread, the busy loop and an output thread pass the ticket to one another on spikes (queues).',
  },
  vllm: {
    title: 'vLLM at the pin',
    prompt:
      'vLLM at the pin plans the next step before the last one is read back: async scheduling is on by default, so the busy loop launches a batch, keeps its future in `batch_queue`, and waits on the oldest only when the queue is full.',
  },
  sglang: {
    title: 'SGLang at the pin',
    prompt:
      'SGLang at the pin: the scheduler launches one batch and reads the result of the one before it in the next turn of its loop. A prefix hit is found in the radix tree before the batch is built.',
  },
  abort: {
    title: 'vLLM, the client leaves',
    prompt:
      'The client goes away in the middle of the stream. In vLLM at the pin the abort rides a queue of its own and is drained before `update_from_output`. Lay the way the first token took, and then the abort.',
  },
  map: {
    title: 'The lifecycle map',
    prompt:
      'A request on one of the five engines, and no word of how its house is built. Lay its whole path from the tray, naming every queue, copy and sync, in the order the engine makes them. The ticket goes once, and the night\'s tape then reads every stage you laid against the spans the request leaves.',
  },
}
