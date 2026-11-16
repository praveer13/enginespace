import { FULL_SERVICE } from '@es/play/loop/entry'
import { FULL_DOCK_STEP, FULL_MOMENTS, fullFirstMove, fullMoveWords, fullPartsOf } from '@es/play/loop/full/parts'
import type { FullAction, FullLevelId, FullView } from '@es/play/loop/full/types'
import type { GameKit, KitMoment, KitPart } from '@/games/kit/first-move'
import { FullDockView } from './DockView'
import { Us } from './FullView2D'
import { cardName, tagOf } from './tags'
import { pricesOf, worldOf } from './world'

/* ------------------------------------------------------------------------------------------------------------------ */
/* What the step loop's full levels give the frame                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Where each part is drawn, inside the frame: the intro's callout sits on it. A part with none is named in the list only. */
const ANCHORS: Readonly<Record<string, string>> = {
  'cost-card': '[data-full-card] [data-card-name]',
  cpu: '[data-lane-label="cpu"]',
  forward: '[data-lane-label="forward"]',
  bubble: '[data-lane-idle]',
  live: '[data-lane-label="live"]',
  now: '[data-lane-now]',
  reference: '[data-lane-label="reference"], [data-fit-run]',
  async: '[data-full-async]',
  runner: '[data-full-runner]',
  eager: '[data-mark="eager"]',
  replay: '[data-mark="replay"]',
  padding: '[data-mark="padding"]',
  capture: '[data-full-ladder]',
  mask: '[data-lane-label="mask"]',
}

/** The parts a full level draws, as the Parts list shows them, with the engine's identifier set as code. */
export const fullPartRows = (level: FullLevelId): KitPart[] =>
  fullPartsOf(level).map((part) => ({
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

/** Where a named moment is said: beside the label of the row it is about, so the note lies over the run's older steps. */
const MOMENT_ANCHOR: Readonly<Record<string, string>> = {
  bubble: '[data-lane-label="forward"]',
  mask: '[data-lane-label="mask"], [data-lane-label="forward"]',
  eager: '[data-lane-label="cpu"]',
  replay: '[data-lane-label="cpu"]',
  padding: '[data-lane-label="live"]',
}

const MOMENTS: readonly KitMoment<FullView>[] = FULL_MOMENTS.map((moment) => ({ id: moment.id, line: moment.line, anchor: () => MOMENT_ANCHOR[moment.id] }))

/**
 * The move the lesson dock's Step takes: the next step of the run, or on to the next stage once this one is closed. Null before the stage's
 * prediction is committed (the instrument asks it), and at the end.
 */
export function fullStep(view: FullView): FullAction | null {
  if (view.done || view.stage.predicted === null) return null
  if (view.stage.closed) {
    const next = view.stages.find((stage) => !stage.closed)
    return next === undefined ? null : { t: 'stage', to: next.id }
  }
  return view.canFire ? { t: 'run', until: 'step' } : null
}

/**
 * What the full levels give the frame (REDESIGN §2.6): their parts on this level, their named moments, and their first run. The session
 * asks the stage's prediction first and requires it, so the first run is the parts, a look at the cost card's row, the prediction, and then the
 * reference run's first move, pointed at. The cost card holds what the look shows: prices, never the prediction's answer.
 */
export function fullKit(levelId: FullLevelId, seed: number): GameKit<FullAction, FullView, never> {
  const firstMove = fullFirstMove(worldOf(levelId, seed, 0))
  return {
    parts: fullPartRows(levelId),
    moments: MOMENTS,
    firstMove,
    firstMoveWords: fullMoveWords(firstMove),
    firstAsk: 'required',
    askOpen: (view) => view.stage.predicted === null,
    isAsk: (action) => action.t === 'commit',
    askWords: (view) => view.stage.prediction.question,
    look: (view) => {
      const prices = pricesOf(levelId, seed, view.at)
      const rows = prices.decodeUs
      const host = view.levers.runner === 'mrv2' ? prices.mrv2 : prices.v1
      return {
        label: `${cardName(view.synthetic)} card`,
        title: `Cost card: ${cardName(view.synthetic)}`,
        anchor: '[data-full-card]',
        detail: (
          <>
            The price list every step is read off. A GPU forward of {rows[0].rows} {rows[0].rows === 1 ? 'row' : 'rows'} costs <Us value={rows[0].us} tag={tagOf(view, 'line')} />, and of{' '}
            {rows[rows.length - 1].rows} rows <Us value={rows[rows.length - 1].us} tag={tagOf(view, 'line')} />. On the CPU, a schedule call costs <Us value={host.scheduleBaseUs} tag={tagOf(view, 'host')} /> and a sync{' '}
            <Us value={host.syncUs} tag={tagOf(view, 'host')} />.
          </>
        ),
      }
    },
    levelParts: (level) => (FULL_SERVICE.some((entry) => entry.id === level) ? fullPartsOf(level as FullLevelId).map((part) => part.id) : []),
    DockView: FullDockView,
    step: fullStep,
    stepWords: FULL_DOCK_STEP,
  }
}
