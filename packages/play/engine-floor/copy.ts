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
import type { FloorLevelId, FloorView, LaidView } from './types'

export interface FloorCopy {
  readonly title: string
  readonly goal: GoalLine
  readonly prompt: string
  /** The graded level's pass rule, stated before the run (REDESIGN §2.6), with the level's bar in it. */
  readonly passRule?: string
}

/**
 * The question every practice level opens on: the process boundaries a sampled token crosses. The lessons' guesses that ask the same
 * quantity of one engine are paired with it in packages/play/predictions/same.ts, and a test fails when either wording changes alone.
 */
export const FLOOR_QUESTION = 'How many process boundaries does a sampled token cross on its way to the client?'

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

/* ------------------------------------------------------------------------------------------------------------------ */
/* The parts of the swimlane (R-T29, REDESIGN §2.6, §3.5, §3.6)                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A part of the swimlane, as the parts list names it: an id, the engine's name, one sentence, the levels it is drawn on, and the claim that
 * sources it on each level. The Parts list, the first-run intro and the source popover all read these rows. A part with no claim on a level
 * is a model object: the course's model draws it, and the popover says so.
 */
export interface FloorPart {
  readonly id: string
  readonly name: string
  readonly sentence: string
  /** The levels that draw it, or every level. */
  readonly levels: readonly FloorLevelId[] | 'all'
  /** The claim (content/claims) that holds it, by level: a fact of the engine that level lays. */
  readonly claims?: Partial<Readonly<Record<FloorLevelId, string>>>
}

const THREADED: readonly FloorLevelId[] = ['mini', 'inside', 'vllm', 'sglang', 'abort', 'map']

/** The parts, in the order the list shows them: the five the first level names (REDESIGN §3.5), then what a level adds. */
export const FLOOR_PARTS: readonly FloorPart[] = [
  { id: 'request', name: 'The request', sentence: 'One request, drawn as the first node at the top: where it begins. Time runs down the page from it.', levels: 'all' },
  {
    id: 'processes',
    name: 'Processes',
    sentence: 'One column each, named at its head; the GPU has a column of its own at the right. A change of process needs IPC or shared memory.',
    levels: 'all',
    claims: {
      'nano-tp': 'nano-vllm.tp-worker-process',
      mini: 'mini-sglang.processes',
      inside: 'vllm.request.engine-core-process',
      vllm: 'vllm.request.engine-core-process',
      sglang: 'sglang.engine.components',
      abort: 'vllm.request.engine-core-process',
    },
  },
  { id: 'stage-list', name: 'Stage list', sentence: 'What can happen next: every stage you may lay, with its mechanism and where it runs. Filter it by process or by typing.', levels: 'all' },
  {
    id: 'hop',
    name: 'A hop',
    sentence: 'An arrow from one stage to the next, labelled with its mechanism as a mark and a word: compute (a call or a launch), a queue, IPC, a copy or a sync.',
    levels: 'all',
    claims: { mini: 'mini-sglang.transport', sglang: 'sglang.engine.ipc', inside: 'vllm.engine-core.queues', vllm: 'vllm.engine-core.queues', abort: 'vllm.engine-core.queues' },
  },
  {
    id: 'boundaries',
    name: 'Boundaries crossed',
    sentence: 'The count you will predict: the hops from one process to another on a sampled token’s way to the client.',
    levels: 'all',
  },
  {
    id: 'threads',
    name: 'Threads',
    sentence: 'The thin sub-columns of a process. A change of thread inside a process needs a queue.',
    levels: THREADED,
    claims: { inside: 'vllm.engine-core.queues', vllm: 'vllm.engine-core.queues', abort: 'vllm.engine-core.queues' },
  },
  {
    id: 'sync',
    name: 'Sync',
    sentence: 'The host waits for the GPU before it reads what a copy brought back to it.',
    levels: 'all',
    claims: {
      nano: 'lifecycle.torch.copy-synchronizes',
      'nano-tp': 'lifecycle.torch.copy-synchronizes',
      inside: 'lifecycle.torch.copy-synchronizes',
      vllm: 'vllm.async-output.event-sync',
      abort: 'vllm.async-output.event-sync',
      mini: 'mini-sglang.overlap-default',
      sglang: 'sglang.overlap.loop',
    },
  },
  {
    id: 'copy',
    name: 'Copy',
    sentence: 'A host-to-device copy sends a step’s inputs to the GPU, and a device-to-host copy brings the sampled ids back to the host.',
    levels: 'all',
    claims: { vllm: 'vllm.async-output.copy-stream', abort: 'vllm.async-output.copy-stream' },
  },
  {
    id: 'one-process',
    name: 'One process',
    sentence: 'nano-vllm as an offline library: the caller, the scheduler and the model runner share one process and one thread.',
    levels: ['nano', 'nano-tp'],
    claims: { 'nano-tp': 'nano-vllm.tp-worker-process' },
  },
  {
    id: 'async',
    name: 'Async scheduling',
    sentence: 'The busy loop launches a step and plans the next before it reads the last back; the step’s future waits in `batch_queue`.',
    levels: ['vllm', 'abort'],
    claims: { vllm: 'vllm.step.batch-queue', abort: 'vllm.step.batch-queue' },
  },
  { id: 'shm', name: 'Shared memory', sentence: 'A buffer two processes both reach: how nano-vllm passes each call to the second rank’s worker.', levels: ['nano-tp'], claims: { 'nano-tp': 'nano-vllm.tp-shared-memory' } },
  { id: 'collective', name: 'Collective', sentence: 'A hop between the GPUs of two ranks: each layer’s partial results gathered to rank 0.', levels: ['nano-tp'], claims: { 'nano-tp': 'nano-vllm.logits-gather' } },
  { id: 'now', name: 'now', sentence: 'The amber line on the row the next stage starts from: the end of the laid path, or where a run stopped.', levels: 'all' },
]

/** The parts a level draws, in the list's order. */
export const floorPartsOf = (level: FloorLevelId): readonly FloorPart[] => FLOOR_PARTS.filter((part) => part.levels === 'all' || part.levels.includes(level))

/** The claim a part has on a level, or undefined for a model object. */
export const partClaim = (part: FloorPart, level: FloorLevelId): string | undefined => part.claims?.[level]

/** Why the prediction cannot be skipped, said beside it (REDESIGN §2.6: where the session allows no skip, the dock says why). */
export const NO_SKIP = 'No skip here: the level needs your prediction before the first stage, and the stage list opens once it is in. The run answers it.'

/** The prediction's hint: what counts. */
export const PREDICT_HINT = 'Count each hop from one process to another, the last one into the client included. A hop between threads of one process does not count.'

/** What the dock says on the graded run of the map, before it starts (REDESIGN §3.6). */
export const GRADED_LINE = 'A graded run: a fresh scenario, one run and no undo. It has no live readout: the counts come with the result.'

/** What the lesson dock's Step does here. */
export const FLOOR_DOCK_STEP = 'Step runs the path as laid. Lay the stages in the run itself.'

/** The readout strip's numbers, by id (REDESIGN §3.5: stages laid · boundaries crossed · copies · syncs). */
export const READOUT_WORDS = { laid: 'stages laid', boundaries: 'boundaries crossed', copies: 'copies', syncs: 'syncs' } as const

/** A stage the source of which is shown only once a run has judged it: its file names a repository, which would say whose stage it is. */
export const SOURCE_LATER = 'Its source shows once a run has judged it: the file would say whose stage it is.'

/** The head of a stop that broke no rule: the stage is legal where the request is, and is not the engine's next (a rule's head is its own words). */
export const PATH_HEAD = 'Legal here, and not the stage this engine makes next.'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Named moments (REDESIGN §2.6, §3.5)                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A rule named the first time it is felt in a level: the line, and the row it is said beside. */
export interface FloorMoment {
  readonly id: string
  /** The row the moment is about, or null when it did not occur between these two views. */
  readonly at: (before: FloorView, after: FloorView) => number | null
  readonly line: (after: FloorView, row: number) => string
}

/** The stages a run took the request through that it had not been through before. */
const newlyRan = (before: FloorView, after: FloorView): readonly LaidView[] => (after.runs > before.runs ? after.laid.filter((stage) => stage.state === 'ran' && stage.index >= before.reached) : [])

const firstOf = (stages: readonly LaidView[], test: (stage: LaidView) => boolean): number | null => stages.find(test)?.index ?? null

export const FLOOR_MOMENTS: readonly FloorMoment[] = [
  {
    id: 'process',
    at: (before, after) => firstOf(newlyRan(before, after), (stage) => stage.from.process !== stage.to.process && (stage.mechanism === 'ipc' || stage.mechanism === 'shm')),
    line: (after, row) => `That hop crosses a process boundary: it is ${after.laid[row]?.mechanism === 'shm' ? 'shared memory' : 'IPC'}, not a function call.`,
  },
  {
    id: 'copy',
    at: (before, after) => firstOf(newlyRan(before, after), (stage) => stage.mechanism === 'h2d'),
    line: () => 'That hop is a copy: the step’s inputs move from host memory to the GPU.',
  },
  {
    id: 'sync',
    at: (before, after) => firstOf(newlyRan(before, after), (stage) => stage.mechanism === 'sync'),
    line: () => 'The host waits here: a sync, so nothing reads what the copy brought back before it has landed.',
  },
  {
    id: 'stopped',
    at: (before, after) => (after.runs > before.runs && after.stop !== null ? after.stop.at : null),
    line: () => 'A run stops at the first stage that does not hold, and says which rule it broke.',
  },
]
