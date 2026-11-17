import { ASK_WORDS, DOCK_STEP_WORDS, FIRST_MOVE_KIND, firstMoveOf, lookLine, moveWords, partsOf, VERIFIER_MOMENTS } from '@es/play/verifier/copy'
import type { VerifierAction, VerifierLevelId, VerifierView } from '@es/play/verifier/types'
import type { GameKit, KitMoment, KitPart } from '@/games/kit/first-move'
import { DockView } from './DockView'

/*
 * What the rejection sampler gives the instrument frame (REDESIGN §2.6, R-T30): its parts on a level with where each is drawn, its named
 * moment, and its first run. The words are packages/play/verifier/copy.ts's; this file only places them.
 *
 * The first run on every level is: the parts, a look at one token's bars, the level's own first ask, then play. The level's own ask is a
 * prediction on `overlap` and `chain`, which the session needs before any round is drawn, so it cannot be skipped; on the other levels it
 * is the level's own decision (the temperature-0 question, the weights, the five names, the draft length), which has no skip either. The
 * pointed first move is never the reference's own first action, since that is the answer: it is the first harmless move of the level.
 */

/** Where each part is drawn, inside the frame: the intro's callout sits on it. A part with none is named in the list only. */
const ANCHORS: Readonly<Record<string, string>> = {
  draft: '[data-vf-row="0"] .es-vf__bar[data-kind="draft"][data-tallest], [data-vf-legend] [data-part="draft"]',
  target: '[data-vf-row="0"] .es-vf__bar[data-kind="target"][data-tallest], [data-vf-legend] [data-part="target"]',
  token: '[data-vf-row="0"] [data-vf-token="0"] .es-vf__name',
  accepted: '[data-vf-legend] [data-part="accepted"]',
  residual: '[data-vf-legend] [data-part="residual"]',
  alpha: '[data-vf-alpha]',
  round: '[data-vf-readout] [data-readout-id="rounds"]',
  output: '[data-vf-out]',
  position: '[data-vf-row="0"] .es-vf__label',
  bonus: '[data-vf-row][data-kind="bonus"] .es-vf__label',
  gamma: '[data-vf-gamma]',
}

/** The parts the level draws, as the Parts list shows them, with the engine's identifier set as code. */
export const partRows = (level: VerifierLevelId): KitPart[] =>
  partsOf(level).map((part) => ({
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

const MOMENTS: readonly KitMoment<VerifierView>[] = VERIFIER_MOMENTS.map((moment) => ({
  id: moment.id,
  line: moment.line,
  anchor: () => '[data-vf-readout] [data-readout-id="share"]',
}))

const levelParts = (level: string): readonly string[] => partsOf(level as VerifierLevelId).map((part) => part.id)

/** Whether the level's own first ask is still open: nothing has been answered, drawn or set yet. */
const askIsOpen = (view: VerifierView): boolean => {
  if (view.done || view.ask === null) return false
  switch (view.ask.kind) {
    case 'predict-plates':
    case 'predict-tokens':
      return !view.committed
    case 'judge':
      return view.judged === null
    case 'recipe':
      return view.weightTotal === 0 && view.counters.rounds === 0
    case 'audit':
      return (view.cards ?? []).every((card) => card.label === null && card.taste === null && card.coins === null)
    case 'choose-gamma':
      return (view.gamma?.pick ?? 0) < 1
    case 'finish':
      return false
  }
}

/**
 * The move the dock's Step takes in this view (practice only): the first harmless move the level has. Null once there is nothing to take, and
 * while the level's first ask is open, since a move would use up the chance to answer it first.
 */
export function verifierStep(view: VerifierView): VerifierAction | null {
  if (view.done || view.ask === null) return null
  const kind = view.ask.kind
  if (kind === 'predict-plates' || kind === 'predict-tokens') return null
  if (kind === 'finish') return view.canDraw ? { t: 'draw', n: 10 } : null
  if (kind === 'judge') return null
  if (kind === 'recipe') return { t: 'sculpt', token: 0, delta: 1 }
  if (kind === 'audit') {
    const next = (view.cards ?? []).find((card) => card.taste === null)
    return next === undefined ? null : { t: 'taste', card: next.index }
  }
  return { t: 'gamma', k: Math.min((view.gamma?.pick ?? 0) + 1, view.gamma?.max ?? 1) }
}

/**
 * What the sampler gives the frame (REDESIGN §2.6): its drawing, its parts on this level, its named moment, and its first run. The first
 * ask is the level's own, and before it the learner looks at one token's bars.
 */
export function verifierKit(levelId: VerifierLevelId): GameKit<VerifierAction, VerifierView, never> {
  const firstMove = firstMoveOf(levelId)
  return {
    parts: partRows(levelId),
    moments: MOMENTS,
    firstMove,
    firstMoveWords: moveWords(firstMove),
    firstMoveKind: FIRST_MOVE_KIND,
    firstAsk: 'required',
    askOpen: askIsOpen,
    isAsk: (action) => (levelId === 'overlap' || levelId === 'chain' ? action.t === 'commit' : levelId === 'greedy-ngram' ? action.t === 'judge' : false),
    askWords: () => ASK_WORDS[levelId],
    look: (view) => {
      const detail = lookLine(view, 0)
      if (detail === null) return null
      return { label: 'Token 0', title: 'Token 0, its two bars', detail, anchor: '[data-vf-token="0"]' }
    },
    levelParts,
    DockView,
    step: verifierStep,
    stepWords: DOCK_STEP_WORDS,
  }
}
