/**
 * The step loop's words for the instrument frame on the five full levels (R-T28, REDESIGN §2.6, §3.7): the parts table, the first move in
 * words, the named moments and the end of each level. They sit beside the full levels' own copy.ts and load with the full levels' chunk,
 * never with the demo levels' route or the front page.
 *
 * A part is a drawn object: its engine name, one sentence, the levels it is drawn on, and the claim that sources it. A part with no claim
 * is a model object, and its popover says so. The Parts list, the first-run intro and the popover read these rows.
 */
import type { FullAction, FullLevelId, StageWorld } from './types'

export interface FullPart {
  readonly id: string
  readonly name: string
  readonly sentence: string
  /** The class, function or flag the pinned engine names it by, set as code. */
  readonly engine?: string
  readonly levels: readonly FullLevelId[] | 'all'
  readonly claim?: string
}

const GRAPHY: readonly FullLevelId[] = ['graphs', 'close']

/** The parts, in the order the intro names them: the cost card first, because every number on the diagram is priced by it. */
export const FULL_PARTS: readonly FullPart[] = [
  {
    id: 'cost-card',
    name: 'Cost card',
    sentence: 'The price list of a step: how long a forward takes on the GPU, and what each call costs the CPU. Every microsecond on the diagram is read off it, and its name says whose numbers they are.',
    levels: 'all',
    claim: 'loop.s5.t-seq',
  },
  {
    id: 'cpu',
    name: 'CPU lane',
    sentence: 'The engine core thread: one slab for each call it makes in a step, named schedule, prepare, launch, sync and sample.',
    engine: 'EngineCoreProc.run_busy_loop',
    levels: 'all',
    claim: 'vllm.engine-core.busy-loop',
  },
  { id: 'forward', name: 'GPU lane', sentence: 'One forward for each step. The number on a slab is the batch it ran: the requests that got one output token in it.', levels: 'all' },
  {
    id: 'bubble',
    name: 'Bubble',
    sentence: 'A dashed box on the GPU lane: the GPU idle while the CPU prepared the next step. The line across it carries its width in µs.',
    levels: 'all',
  },
  { id: 'live', name: 'Slots live', sentence: 'Under each forward, how many of the batch’s slots held a request: the share of the GPU’s work that came out as tokens.', levels: 'all' },
  {
    id: 'reference',
    name: 'Reference run',
    sentence: 'The same workload served with the configuration the course holds up as the bar. Once your run is served, its forwards stand under yours as hollow outlines, on the same axis.',
    levels: 'all',
  },
  { id: 'now', name: 'Now', sentence: 'The amber line: the CPU’s clock. The next call starts here.', levels: 'all' },
  {
    id: 'async',
    name: 'Async scheduling',
    sentence: 'The CPU schedules the next step while this one runs, so the GPU does not wait for it. A step may then compute one ghost token for a request that had just finished.',
    engine: 'async_scheduling',
    levels: ['async', 'mrv2', 'close'],
    claim: 'vllm.async-scheduling.default',
  },
  {
    id: 'runner',
    name: 'Model runner',
    sentence: 'The code that prepares each step’s inputs and launches the forward. MRV2 prepares them on the GPU; the legacy V1 runner does it on the CPU, so its CPU slabs are longer.',
    engine: 'VLLM_USE_V2_MODEL_RUNNER',
    levels: ['mrv2', 'close'],
    claim: 'vllm.mrv2.gpu-input-prep',
  },
  {
    id: 'eager',
    name: 'Eager launches',
    sentence: 'With no CUDA graph, the CPU launches every kernel of a step one by one: a row of thin ticks on the CPU lane, one for each launch.',
    levels: GRAPHY,
  },
  {
    id: 'replay',
    name: 'CUDA graph replay',
    sentence: 'A graph captured ahead of time replays the whole step with one call: a single slab on the CPU lane, labelled with the size it was captured at.',
    engine: 'cudagraph_mode',
    levels: GRAPHY,
    claim: 'vllm.cudagraph.modes',
  },
  {
    id: 'padding',
    name: 'Padding',
    sentence: 'A graph replays at its captured size, so a smaller batch runs with empty places: the hatched end of a forward, labelled with how many of the places held nothing.',
    levels: GRAPHY,
    claim: 'vllm.cudagraph.padding',
  },
  {
    id: 'capture',
    name: 'Capture sizes',
    sentence: 'The batch sizes a graph is captured at. A batch runs at the smallest captured size that holds it, and a larger one launches eagerly.',
    engine: 'cudagraph_capture_sizes',
    levels: GRAPHY,
    claim: 'vllm.cudagraph.capture-sizes',
  },
  {
    id: 'mask',
    name: 'Grammar mask',
    sentence: 'For structured output the CPU builds a bitmask of the tokens a grammar allows before a token is sampled. Its own row shows when it is built and how long it takes.',
    levels: ['mask'],
    claim: 'mask.kernelspace.token-mask',
  },
]

/** The parts a level draws, in the list's order. */
export const fullPartsOf = (level: FullLevelId): readonly FullPart[] => FULL_PARTS.filter((part) => part.levels === 'all' || part.levels.includes(level))

/** A part's row by id. */
export const fullPart = (id: string): FullPart | undefined => FULL_PARTS.find((part) => part.id === id)

/** The goal line's end, once a level's stages have all closed. */
export const FULL_MET: Readonly<Record<FullLevelId, string>> = {
  async: 'Both stages are closed: the result is in the dock.',
  graphs: 'All three stages are closed: the result is in the dock.',
  mrv2: 'Both stages are closed: the result is in the dock.',
  close: 'The run is served: the result is in the dock.',
  mask: 'The stage is closed: the result is in the dock.',
}

/** What the lesson dock's Step does on these levels. */
export const FULL_DOCK_STEP = 'Runs the next step of the run.'

/**
 * The reference run's first move on a stage: the first lever its configuration sets that the stage's start does not, or the next step where
 * the two begin alike. It is always legal on the stage's first state.
 */
export function fullFirstMove(world: Pick<StageWorld, 'start' | 'house' | 'levers'>): FullAction {
  const { start, house } = world
  if (world.levers.includes('async') && start.async !== house.async) return { t: 'lever', name: 'async', value: house.async }
  if (world.levers.includes('maskOverlap') && start.maskOverlap !== house.maskOverlap) return { t: 'lever', name: 'maskOverlap', value: house.maskOverlap }
  if (world.levers.includes('runner') && start.runner !== house.runner) return { t: 'lever', name: 'runner', value: house.runner }
  if (world.levers.includes('graphMode') && start.graphMode !== house.graphMode) return { t: 'lever', name: 'graphMode', value: house.graphMode }
  if (world.levers.includes('capture') && start.captureSizes.join() !== house.captureSizes.join()) return { t: 'capture', sizes: house.captureSizes }
  return { t: 'run', until: 'step' }
}

/** An action of the full levels in words, from its kind's row: what the intro's first move and the dock's Step say. */
export function fullMoveWords(action: FullAction): string {
  switch (action.t) {
    case 'lever':
      if (action.name === 'async') return action.value === true ? 'Turn async scheduling on' : 'Turn async scheduling off'
      if (action.name === 'maskOverlap') return action.value === true ? 'Build the grammar mask during the forward' : 'Build the grammar mask after the forward'
      if (action.name === 'runner') return action.value === 'mrv2' ? 'Choose the V2 runner' : 'Choose the V1 runner'
      if (action.name === 'graphMode') return `Ask for the ${String(action.value)} graph mode`
      return 'Set the lever'
    case 'capture':
      return 'Set the capture sizes'
    case 'run':
      return action.until === 'step' ? 'Run the next step' : 'Run to the end'
    case 'commit':
      return 'Commit the prediction'
    case 'stage':
      return 'Go to the stage'
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Named moments                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

interface MomentFire {
  readonly bubbleUs: number
  readonly padded: number
  readonly mold: number | null
  readonly mode: 'FULL' | 'PIECEWISE' | 'NONE'
  readonly calls: number
  readonly maskUs?: number
}

interface MomentView {
  readonly level: string
  readonly at: number
  readonly step: number
  readonly fires: readonly MomentFire[]
}

export interface FullMomentWords<View> {
  readonly id: 'bubble' | 'eager' | 'replay' | 'padding' | 'mask'
  readonly line: (before: View, after: View) => string | null
}

/** The step the latest action ran, when it ran one on the same stage. */
const newStep = (before: MomentView, after: MomentView): MomentFire | undefined =>
  after.level === before.level && after.at === before.at && after.step > before.step ? after.fires[after.step - 1] : undefined

const formatUs = (us: number): string => us.toLocaleString('en-US')

/** The full levels' named moments, in the order they are said when two land together. Each is said once, the first time its rule is felt. */
export const FULL_MOMENTS: readonly FullMomentWords<MomentView>[] = [
  {
    id: 'bubble',
    line: (before, after) => {
      const fire = newStep(before, after)
      return fire !== undefined && fire.bubbleUs > 0 ? `That gap is a bubble: the GPU waited ${formatUs(fire.bubbleUs)} µs for the CPU.` : null
    },
  },
  {
    id: 'mask',
    line: (before, after) => {
      const fire = newStep(before, after)
      return fire !== undefined && (fire.maskUs ?? 0) > 0 && fire.bubbleUs > 0 ? 'The grammar mask outlasted the forward, so the GPU waited for it.' : null
    },
  },
  {
    id: 'eager',
    line: (before, after) => {
      const fire = newStep(before, after)
      return fire !== undefined && fire.mode === 'NONE' && fire.calls > 1 ? `Eager launches: the CPU made ${formatUs(fire.calls)} launches for this step, one for each kernel.` : null
    },
  },
  {
    id: 'replay',
    line: (before, after) => {
      const fire = newStep(before, after)
      return fire !== undefined && fire.mode === 'FULL' && fire.mold !== null ? 'One call replayed the whole step: that is a CUDA graph replay.' : null
    },
  },
  {
    id: 'padding',
    line: (before, after) => {
      const fire = newStep(before, after)
      return fire !== undefined && fire.padded > 0 && fire.mold !== null ? `Padding: the graph ran at size ${fire.mold}, and ${fire.padded} of its places held nothing.` : null
    },
  },
]
