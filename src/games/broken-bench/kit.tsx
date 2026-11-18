import { LOOK, partsOf } from '@es/play/broken-bench/copy'
import type { BenchAction, BenchLevelId, BenchView } from '@es/play/broken-bench/types'
import type { GameKit, KitPart } from '@/games/kit/first-move'
import { DockView } from './DockView'

/*
 * What Broken benchmark gives the instrument frame (REDESIGN §2.6, R-T31): its parts on a level with where each is drawn, its first run, and
 * the compact view a lesson's dock draws. The words are packages/play/broken-bench/copy.ts's; this file only places them.
 *
 * The first run is the table's: the parts, then a flip of the Latency from switch (a view change, which files nothing and so is not a move of
 * the session), then the report form with its range rule. The session asks for the report, and the report is the form, so the first run
 * has no pointed first move: naming a flaw is a real move, and ends the intro.
 *
 * Named moments. The one moment of the game, the p99 moving when latency counts from the due time, depends on the desk's clock, which is the
 * page's and not the session's, so the table the frame reads is empty and Game.tsx says the moment itself from `COORDINATED_OMISSION`.
 */

/**
 * Where each part is drawn, inside the frame: the intro's callout sits on it. A sheet is called out on its own drawing, inside its top, and
 * only while it is the sheet on the board: a sheet that is not drawn has no disc beside a tab, and its row in the list says so.
 */
const ANCHORS: Readonly<Record<string, string>> = {
  claim: '[data-bench-claim]',
  histogram: '[data-sheet="histogram"] .es-bench-sheet',
  timeline: '[data-sheet="timeline"] .es-bench-sheet',
  switch: '[data-bench-switch] label',
  form: '[data-bench-form] h3',
}

/** The parts the level draws, as the Parts list shows them. */
export const partRows = (level: BenchLevelId): KitPart[] =>
  partsOf(level).map((part) => ({ id: part.id, name: part.name, sentence: part.sentence, ...(ANCHORS[part.id] === undefined ? {} : { anchor: ANCHORS[part.id] }) }))

const levelParts = (level: string): readonly string[] => partsOf(level as BenchLevelId).map((part) => part.id)

export function benchKit(level: BenchLevelId): GameKit<BenchAction, BenchView, never> {
  return {
    parts: partRows(level),
    moments: [],
    firstMove: null,
    firstMoveWords: '',
    firstAsk: 'required',
    askOpen: (view) => view.pick === null && view.prediction === null,
    isAsk: () => false,
    askLead: LOOK.ask,
    look: (view) =>
      view.scene === null ? null : { label: LOOK.label, title: LOOK.title, detail: LOOK.detail, lead: LOOK.lead, anchor: '[data-bench-switch] label' },
    levelParts,
    DockView,
  }
}
