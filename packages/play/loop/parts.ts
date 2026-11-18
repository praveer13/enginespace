/**
 * The step loop's words for the instrument frame on the demo levels (R-T17, REDESIGN §2.6): the parts table, the first move in words, the
 * named moments, the line a level opens on, the end of each level, and demo level 3's guess.
 *
 * They sit beside copy.ts and not in it because the front page's first paint imports copy.ts through the session (the level titles and
 * goal lines), and a shared module carries every export any page uses: these load with the game's page and a lesson's dock, never with
 * the front page.
 */
import { requestName } from './copy'
import type { LoopLevelId } from './types'

/**
 * A part of the demo levels' timing diagram (REDESIGN §2.6): its engine name, one sentence, the levels it is drawn on, and the claim that
 * sources it. The Parts list, the first-run intro and the source popover read these rows. A part with no claim is a model object: the
 * course's model draws it, and the popover says so.
 */
export interface LoopPart {
  readonly id: string
  readonly name: string
  readonly sentence: string
  /** The class or function the pinned engine names it by, set as code. */
  readonly engine?: string
  readonly levels: readonly LoopLevelId[] | 'all'
  readonly claim?: string
}

const LATER: readonly LoopLevelId[] = ['first-2-slot', 'first-3-gap', 'first-4-par']
const ASYNC: readonly LoopLevelId[] = ['first-3-gap', 'first-4-par']

/** The parts, in the order the intro names them: the brief's five first, so the first level's first run names exactly those. */
export const LOOP_PARTS: readonly LoopPart[] = [
  { id: 'waiting', name: 'Waiting queue', sentence: 'Requests not yet in the batch. Tap one to admit it into an empty slot.', levels: 'all', claim: 'vllm.scheduler.order' },
  { id: 'slot', name: 'Batch slots', sentence: 'The running batch. A slot with a request gets one token per step; its label names the request in it.', levels: 'all', claim: 'loop.world.clips' },
  {
    id: 'cpu',
    name: 'CPU lane',
    sentence: 'The engine core thread: it schedules each step, then syncs to read the step’s tokens back.',
    engine: 'EngineCoreProc.run_busy_loop',
    levels: 'all',
    claim: 'vllm.engine-core.busy-loop',
  },
  { id: 'gpu', name: 'GPU lane', sentence: 'One forward per step, drawn on every slot’s row: the request’s token, or nothing for an empty slot.', levels: 'all', claim: 'loop.world.forward-ticks' },
  { id: 'step', name: 'Step', sentence: 'Runs one step: every live slot gets one token.', levels: 'all', claim: 'loop.world.step-ticks-serial' },
  { id: 'now', name: 'Now', sentence: 'The amber line: the CPU’s clock. The next work starts here.', levels: 'all' },
  { id: 'empty', name: 'Empty slot', sentence: 'A slot the step paid for and nothing used: a wasted slot-step.', levels: LATER },
  { id: 'bubble', name: 'Bubble', sentence: 'A dashed box on the GPU rows: the GPU idle while the CPU prepares the next step. Its width is marked across it, in ticks.', levels: LATER, claim: 'loop.world.step-ticks-serial' },
  { id: 'async', name: 'Async scheduling', sentence: 'The CPU schedules the next step while this one runs, so the GPU does not wait for it.', levels: ASYNC, claim: 'vllm.async-scheduling.default' },
  { id: 'ghost', name: 'Ghost token', sentence: 'A token computed for a request that had already finished, then thrown away: the price of scheduling ahead.', levels: ASYNC },
  { id: 'reference', name: 'Reference run', sentence: 'The run the course holds up as the bar: its clock is the number to beat.', levels: ASYNC },
]

/** The parts a level draws, in the list's order. */
export const loopPartsOf = (level: LoopLevelId): readonly LoopPart[] => LOOP_PARTS.filter((part) => part.levels === 'all' || part.levels.includes(level))

/** A part's row by id. */
export const loopPart = (id: string): LoopPart | undefined => LOOP_PARTS.find((part) => part.id === id)

/** An action of the demo levels, in words, from its kind's row: what the intro's first move and the dock's Step say. */
export function loopMoveWords(action: { readonly t: string; readonly req?: number; readonly name?: string; readonly value?: unknown }): string {
  if (action.t === 'admit' && action.req !== undefined) return `Admit ${requestName(action.req)} into a batch slot`
  if (action.t === 'lever' && action.name === 'async') return action.value === true ? 'Turn async scheduling on' : 'Turn async scheduling off'
  return 'Step'
}

/** What the lesson's dock says its Step does. */
export const LOOP_DOCK_STEP = 'Runs one step, or admits the first waiting request into a free slot.'

/**
 * The line a level opens on when it opens mid-run (REDESIGN §2.6, "Levels begin and end out loud"): the step it starts at and the tokens
 * already out. The counts are the model's, in its synthetic world. Null for a level that starts at the first step.
 */
export function openingLine(view: { readonly step: number; readonly counters: { readonly usefulTokens: number } }): string | null {
  if (view.step === 0) return null
  const tokens = view.counters.usefulTokens
  return `This run starts at step ${view.step + 1}, with ${tokens} ${tokens === 1 ? 'token' : 'tokens'} already out.`
}

/** The goal line's end, once it is met. */
export const LOOP_MET: Readonly<Record<LoopLevelId, string>> = {
  'first-1-fill': 'The first step’s tokens are read back: the level is over.',
  'first-2-slot': 'The step after the freed slot is read back: the level is over.',
  'first-3-gap': 'A ghost token is read back: the level is over.',
  'first-4-par': 'Every request is served: the level is over.',
}

/**
 * The view-only guess on demo level 3 (REDESIGN §3.1): before async scheduling is turned on, how many of the next step's ticks the GPU is
 * busy for. Its numbers come from the run itself: the last step's cycle, from its `schedule` to the clock, and its forward. Nothing stores
 * the guess: it is the learner's to check against the drawing. Null where the level has no such step to read.
 */
export function busyGuess(view: {
  readonly level: LoopLevelId
  readonly clockUs: number
  readonly overlap: boolean
  readonly cpu: readonly { readonly step: number; readonly kind: string; readonly startUs: number }[]
  readonly fires: readonly { readonly index: number; readonly startUs: number; readonly endUs: number }[]
}): { readonly question: string; readonly window: number; readonly busy: number; readonly reveal: string } | null {
  if (view.level !== 'first-3-gap' || view.overlap) return null
  const last = view.fires[view.fires.length - 1]
  if (last === undefined) return null
  const plan = view.cpu.find((span) => span.step === last.index && span.kind === 'schedule')
  if (plan === undefined) return null
  const window = view.clockUs - plan.startUs
  const busy = last.endUs - last.startUs
  return {
    question: `Async scheduling is off. Of the next ${window} ticks, for how many is the GPU busy?`,
    window,
    busy,
    reveal: `The GPU is busy for ${busy} of the ${window} ticks: one forward. For the other ${window - busy} it waits while the CPU syncs and schedules: a bubble.`,
  }
}

/** A named moment's words, from the two views either side of an action (REDESIGN §2.6: "the first time a rule is felt ... named once"). */
export interface LoopMomentWords<View> {
  readonly id: 'batching' | 'empty' | 'bubble' | 'ghost'
  readonly line: (before: View, after: View) => string | null
}

interface MomentView {
  readonly level: string
  readonly step: number
  readonly fires: readonly { readonly places: readonly { readonly state: string }[]; readonly bubbleUs: number }[]
  readonly counters: { readonly bubbleUs: number; readonly ghostTokens: number }
}

const newFire = (before: MomentView, after: MomentView) => (after.level === before.level && after.step > before.step ? after.fires[after.step - 1] : undefined)

/** The step loop's four named moments, in the order they are said when two land together. */
export const LOOP_MOMENTS: readonly LoopMomentWords<MomentView>[] = [
  {
    id: 'batching',
    line: (before, after) => {
      const fire = newFire(before, after)
      return fire !== undefined && fire.places.filter((place) => place.state !== 'empty').length > 1
        ? 'A step costs the GPU about the same for one request as for four. That is batching.'
        : null
    },
  },
  {
    id: 'empty',
    line: (before, after) => {
      const fire = newFire(before, after)
      return fire !== undefined && fire.places.some((place) => place.state === 'empty') ? 'That slot ran empty for a step: the GPU paid for it, and nothing came out.' : null
    },
  },
  {
    id: 'bubble',
    line: (before, after) => {
      const fire = newFire(before, after)
      if (fire === undefined || fire.bubbleUs <= 0 || after.counters.bubbleUs <= before.counters.bubbleUs) return null
      return `That gap is a bubble: the GPU waited ${fire.bubbleUs} ${fire.bubbleUs === 1 ? 'tick' : 'ticks'} for the CPU.`
    },
  },
  {
    id: 'ghost',
    line: (before, after) =>
      after.level === before.level && after.counters.ghostTokens > before.counters.ghostTokens
        ? 'That is a ghost token: the GPU computed it for a request that had already finished, and it is thrown away.'
        : null,
  },
]
