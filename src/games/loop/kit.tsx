import { LOOP_DOCK_STEP, LOOP_MOMENTS, loopMoveWords, loopPartsOf } from '@es/play/loop/parts'
import { askOf, initState } from '@es/play/loop/engine'
import { FIRST_SERVICE } from '@es/play/loop/entry'
import { buildLevel } from '@es/play/loop/levels'
import type { LoopAction, LoopLevelId, LoopView } from '@es/play/loop/types'
import type { GameKit, KitMoment, KitPart } from '@/games/kit/first-move'
import { DockView } from './DockView'

/* ------------------------------------------------------------------------------------------------------------------ */
/* What the step loop gives the frame                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Where each part is drawn, inside the frame: the intro's callout sits on it. A part with none is named in the list only. */
const ANCHORS: Readonly<Record<string, string>> = {
  waiting: '[data-lane-label="queue"]',
  slot: '[data-lane-label="slot-0"] .es-lanes__holds',
  cpu: '[data-lane-label="cpu"]',
  gpu: '[data-lane-label="slot-1"] .es-lanes__slotname',
  step: '[data-loop-step]',
  now: '[data-lane-now]',
  empty: '[data-use="empty"]',
  bubble: '[data-lane-idle]',
  async: '[data-loop-async]',
  ghost: '[data-use="ghost"]',
  reference: '[data-loop-readout] [data-readout-id="clock"]',
}

/** The parts a demo level draws, as the Parts list shows them, with vLLM's identifier set as code. */
export const partRows = (level: LoopLevelId): KitPart[] =>
  loopPartsOf(level).map((part) => ({
    id: part.id,
    name: part.name,
    ...(ANCHORS[part.id] === undefined ? {} : { anchor: ANCHORS[part.id] }),
    sentence:
      part.engine === undefined ? (
        part.sentence
      ) : (
        <>
          {part.sentence} In vLLM: <code>{part.engine}</code>.
        </>
      ),
  }))

/** The row a moment is about: the first slot the latest step left empty, or the first that ran a ghost token, else the second slot. */
function rowOf(after: LoopView, state: 'empty' | 'binned'): number {
  const fire = after.fires[after.step - 1]
  const at = fire === undefined ? -1 : fire.places.findIndex((place) => place.state === state)
  return at >= 0 ? at : Math.min(1, after.slots - 1)
}

/**
 * Where a named moment is said: beside the label of the slot row it is about, so the note lies over the run's older steps and never over
 * the step just drawn or the dock's controls (REDESIGN §2.6: "beside the object").
 */
const MOMENT_ANCHOR: Readonly<Record<string, (after: LoopView) => string>> = {
  batching: () => '[data-lane-label="slot-0"]',
  empty: (after) => `[data-lane-label="slot-${rowOf(after, 'empty')}"]`,
  bubble: (after) => `[data-lane-label="slot-${Math.min(1, after.slots - 1)}"]`,
  ghost: (after) => `[data-lane-label="slot-${rowOf(after, 'binned')}"]`,
}

const MOMENTS: readonly KitMoment<LoopView>[] = LOOP_MOMENTS.map((moment) => ({
  id: moment.id,
  line: moment.line,
  anchor: (_before, after) => MOMENT_ANCHOR[moment.id](after),
}))

/**
 * The move the lesson dock's Step takes: admit the first waiting request into a free slot while one is free, else run the next step. Null
 * when the level is over or nothing can run.
 */
export function loopStep(view: LoopView): LoopAction | null {
  if (view.done) return null
  if (view.canHang && view.waiting.length > 0) return { t: 'admit', req: view.waiting[0] }
  return view.canFire ? { t: 'run', until: 'step' } : null
}

/**
 * The reference run's first action on a level: async scheduling on where the level has the switch (the reference turns it on before
 * anything else), else the first waiting request admitted where a slot is free, else a step. It is always legal on the level's first state.
 */
export function firstMoveOf(levelId: LoopLevelId, seed: number): LoopAction {
  const level = buildLevel(levelId, seed)
  const state = initState(level)
  if (level.overlap === 'free' && !state.overlap) return { t: 'lever', name: 'async', value: true }
  const ask = askOf(state)
  if (ask !== null && ask.waiting.length > 0) return { t: 'admit', req: ask.waiting[0] }
  return { t: 'run', until: 'step' }
}

/** What the step loop gives the frame on a demo level (REDESIGN §2.6): its parts, its named moments, its first move and its compact view. */
export function loopKit(levelId: LoopLevelId, seed: number): GameKit<LoopAction, LoopView, never> {
  const firstMove = firstMoveOf(levelId, seed)
  return {
    parts: partRows(levelId),
    moments: MOMENTS,
    firstMove,
    firstMoveWords: loopMoveWords(firstMove),
    // The demo levels ask no guess of the session: the first move is real (§2.6's table). Level 3's guess is the view's own (Controls.tsx).
    firstAsk: 'none',
    levelParts: (level) => (FIRST_SERVICE.some((entry) => entry.id === level) ? loopPartsOf(level as LoopLevelId).map((part) => part.id) : []),
    DockView,
    step: loopStep,
    stepWords: LOOP_DOCK_STEP,
  }
}
