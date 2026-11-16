import { FLOOR_DOCK_STEP, FLOOR_MOMENTS, FLOOR_QUESTION, SOURCE_LATER, floorPartsOf } from '@es/play/engine-floor/copy'
import { floorSession } from '@es/play/engine-floor/session'
import { stageIn } from '@es/play/engine-floor/stages'
import type { FloorAction, FloorLevelId, FloorView } from '@es/play/engine-floor/types'
import { MECHANISM_WORDS, placeName, stageName } from '@es/play/engine-floor/words'
import type { GameKit, KitMoment, KitPart } from '@/games/kit/first-move'
import { Code } from './Code'
import { DockView } from './DockView'

/*
 * What Request path gives the instrument frame (REDESIGN §2.6, §3.5): its parts on a level with where each is drawn, its named moments with
 * the row each is said beside, its compact view for a lesson's dock, and its first run. The words are packages/play/engine-floor/copy.ts's;
 * this file only places them.
 *
 * The first run is §3.5's: the parts, then a look at one stage (its popover names its mechanism and the process it runs in, and dispatches
 * nothing), then the prediction, which the session requires (no skip, and the dock says why), and then the first stage of the reference
 * path is pointed at in the stage list. On the graded map the path is a secret until its run is judged, so the look is the stage list's
 * first tile and nothing is pointed at.
 */

/** Where each part is drawn, inside the frame: the intro's callout sits on it. A part not drawn yet has no callout and is named in the list. */
const ANCHORS: Readonly<Record<string, string>> = {
  request: '[data-lane-start]',
  processes: '[data-lane-head] .es-lanes__proc',
  'stage-list': '[data-floor-stages] .es-floor-stages__head',
  hop: '[data-lane-row] .es-lanes__tag',
  boundaries: '[data-floor-readout] [data-readout-id="boundaries"] dt',
  threads: '[data-lane-head] .es-lanes__thread',
  sync: '[data-legend-mechanism="sync"]',
  now: '[data-lane-now]',
}

/** The parts a level draws, as the Parts list shows them. */
export const partRows = (level: FloorLevelId): KitPart[] =>
  floorPartsOf(level).map((part) => ({
    id: part.id,
    name: part.name,
    ...(ANCHORS[part.id] === undefined ? {} : { anchor: ANCHORS[part.id] }),
    sentence: <Code>{part.sentence}</Code>,
  }))

const MOMENTS: readonly KitMoment<FloorView>[] = FLOOR_MOMENTS.map((moment) => ({
  id: moment.id,
  line: (before, after) => {
    const row = moment.at(before, after)
    return row === null ? null : moment.line(after, row)
  },
  // Said under the last row, over the empty part of the diagram, so it covers no row the learner reads.
  anchor: () => '[data-lane-moment]',
}))

/** The stage the first run points at, from the intro's ring, or null. */
export const ringOf = (action: FloorAction | null): string | null => (action !== null && action.t === 'lay' ? action.stage : null)

/** What the lesson dock's Step does: runs the path as laid, once there is something new to run. Laying is the instrument's. */
export const floorStep = (view: FloorView): FloorAction | null => (view.canRun ? { t: 'run' } : null)

/** The first move's words: "Lay `tokenize`". */
export const layWords = (label: string): string => `Lay ${stageName(label)}`

/**
 * What Request path gives the frame on a level and seed. The pointed first move is the reference path's first stage, which is legal once the
 * prediction is in; on the graded map nothing is pointed at, since the reference path is the answer there.
 */
export function floorKit(levelId: FloorLevelId, seed: number): GameKit<FloorAction, FloorView, never> {
  const level = floorSession.level(levelId, seed)
  const sealed = levelId === 'map'
  const first = sealed ? null : (level.reference[0] ?? null)
  const firstStage = first === null ? undefined : stageIn(level.scenario, first)
  const lookId = sealed ? level.tray[0] : first
  const lookStage = lookId === null || lookId === undefined ? undefined : stageIn(level.scenario, lookId)
  return {
    parts: partRows(levelId),
    moments: MOMENTS,
    firstMove: first === null ? null : { t: 'lay', stage: first },
    firstMoveWords: firstStage === undefined ? '' : layWords(firstStage.label),
    firstAsk: 'required',
    askOpen: (view) => view.step === 'predict',
    isAsk: (action) => action.t === 'commit',
    askWords: () => FLOOR_QUESTION,
    look: () =>
      lookStage === undefined
        ? null
        : {
            label: stageName(lookStage.label),
            title: `Stage: ${stageName(lookStage.label)}`,
            detail: (
              <>
                <strong>{MECHANISM_WORDS[lookStage.mechanism].tile}</strong>: {MECHANISM_WORDS[lookStage.mechanism].does}. It runs in <code>{placeName(lookStage.from)}</code>
                {placeName(lookStage.from) === placeName(lookStage.to) ? null : (
                  <>
                    {' '}
                    and lands in <code>{placeName(lookStage.to)}</code>
                  </>
                )}
                . {SOURCE_LATER}
              </>
            ),
            anchor: '[data-floor-stages] .es-floor-stages__head',
          },
    levelParts: (id) => floorPartsOf(id as FloorLevelId).map((part) => part.id),
    DockView,
    step: floorStep,
    stepWords: FLOOR_DOCK_STEP,
  }
}
