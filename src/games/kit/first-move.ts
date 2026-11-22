import type { ComponentType, ReactNode } from 'react'
import type { GameAction } from '@es/play'
import type { PartRow } from '@/design/components/PartsList'
import type { DockViewProps } from './RunContext'
import { isObject, PLACE_KEYS, readJson, writeJson } from '@/settings/store'

/*
 * The first run (REDESIGN §2.6, "The first run, under a minute"): what a game gives the frame, the order of the intro's steps, the parts it
 * calls out, and the intro flag. Pure apart from the flag's two functions, so the order can be tested without a page; Intro.tsx draws it.
 *
 *   1. What you are looking at: up to five parts the learner has not met, numbered on the live diagram and listed in the dock.
 *   2. Look, or move. Where the session has no prediction to ask first, the learner makes one real move (the reference run's first) with the
 *      amber ring on its control. Elsewhere the learner selects one part and reads what it holds, and nothing is dispatched.
 *   3. The level's first ask, then the reference run's first move is pointed at.
 *
 * Not a modal: nothing is disabled, focus is not trapped, and Skip intro or Escape ends it at any step. A real move ends it as well, since
 * the learner is playing. When it ends, the parts it listed are kept in `es:intro`, per game, so that a level whose parts have all been met
 * does not open it again, and a level with one new part calls out only that one.
 */

/** A part of the drawing, as the parts list and the intro read it, with where it is drawn: a selector inside the frame. */
export interface KitPart extends PartRow {
  /** Where the part is drawn, as a CSS selector inside the frame: the callout's disc sits on it. None: the list names it only. */
  readonly anchor?: string
}

/** The session's first ask: none (the first move is a session action), a prediction the session requires, or one it lets the learner skip. */
export type FirstAsk = 'none' | 'required' | 'optional'

/** The part the learner selects and reads before the ask, and what it says: never the answer. */
export interface KitLook {
  /** The control's words: "Request 1". */
  readonly label: string
  /** The popover's title. */
  readonly title: string
  readonly detail: ReactNode
  readonly anchor?: string
  /** The look's own instruction, where selecting and reading is not all it is: "Flip the switch and watch the chart move". */
  readonly lead?: ReactNode
}

/** A rule named the first time it is felt in a level (moments.ts reads the table). */
export interface KitMoment<View> {
  readonly id: string
  /** The line, or null when the rule did not occur between these two views. */
  readonly line: (before: View, after: View) => string | null
  /** The object it is said beside, as a selector inside the frame, from the two views. */
  readonly anchor?: (before: View, after: View) => string
}

/**
 * What every game gives the frame (REDESIGN §2.6): its diagram and its compact view, the parts it draws on this level, its named moments
 * and its first move. The parts list, the intro and the popover read the same rows.
 */
export interface GameKit<Action extends GameAction, View, Props = never> {
  readonly Diagram2D?: ComponentType<Props>
  /** The compact 2D view a lesson's dock draws, over the same run as the instrument (RunContext.tsx). */
  readonly DockView?: ComponentType<DockViewProps<View>>
  /** The move the dock's Step takes in this view, in practice, or null when there is none. */
  readonly step?: (view: View) => Action | null
  /** What Step does, in the game's words. */
  readonly stepWords?: string
  readonly parts: readonly KitPart[]
  readonly moments: readonly KitMoment<View>[]
  /** The first action of the level's reference run: always legal, and pointed at once the ask is answered. */
  readonly firstMove: Action | null
  /** The first move in words, from the action kind's row in the game's copy: "Admit request 1". */
  readonly firstMoveWords: string
  /** What the pointed move is, where it is not the reference run's first move: a game whose reference moves are the answers points at a move that gives none away. */
  readonly firstMoveKind?: string
  readonly firstAsk: FirstAsk
  /** Whether the session's first ask is still open in this view (before the frame's own Skip). None: it has no ask. */
  readonly askOpen?: (view: View) => boolean
  /** Whether an action is the answer to the session's first ask (a committed prediction), and so not a move. */
  readonly isAsk?: (action: Action) => boolean
  /** The first ask in the session's own words, for the intro's ask step. */
  readonly askWords?: (view: View) => ReactNode
  /** What the ask step says in place of the guess's words, for an ask that is not a guess (a report to file). */
  readonly askLead?: ReactNode
  /** The part to look at, where the session asks first. */
  readonly look?: (view: View) => KitLook | null
  /** The part ids a level draws: a level the ledger says was played has its parts met. */
  readonly levelParts?: (level: string) => readonly string[]
  /**
   * Whether the strip is held blank in its place after the first move until the hand leaves the dock, rather than taken out at once: for a
   * game whose first move is pressed again where it was (a stepper's "one more"), which the strip's going would move from under the hand.
   */
  readonly holdsStrip?: boolean
}

export type IntroStep = 'parts' | 'look' | 'move' | 'ask' | 'point'

/** The steps of the first run, in order, for a session's first ask (REDESIGN §2.6's table). */
export function introSteps(firstAsk: FirstAsk, canLook: boolean): readonly IntroStep[] {
  if (firstAsk === 'none') return ['parts', 'move']
  return canLook ? ['parts', 'look', 'ask', 'point'] : ['parts', 'ask', 'point']
}

/** Callouts on the diagram: at most five (REDESIGN §2.6). */
export const MAX_CALLOUTS = 5

/** The intro's parts: those not met yet, in the list's order, at most five. A replay ("How to play") lists every part, the new ones first. */
export function introParts(parts: readonly KitPart[], shown: readonly string[], replay: boolean): readonly KitPart[] {
  const fresh = parts.filter((part) => !shown.includes(part.id))
  if (!replay) return fresh.slice(0, MAX_CALLOUTS)
  return [...fresh, ...parts.filter((part) => shown.includes(part.id))]
}

/** Whether the intro opens by itself: some part drawn on this level has not been met. */
export const introOpens = (parts: readonly KitPart[], shown: readonly string[]): boolean => parts.some((part) => !shown.includes(part.id))

/** The parts list as the title strip's Parts shows it: the parts not met first, each marked new. */
export function partsInOrder(parts: readonly KitPart[], shown: readonly string[] | null): KitPart[] {
  if (shown === null) return [...parts]
  const fresh = parts.filter((part) => !shown.includes(part.id)).map((part) => ({ ...part, isNew: true }))
  return [...fresh, ...parts.filter((part) => shown.includes(part.id))]
}

/** The first run as it stands: its steps, the one it is at, the parts it lists, and the log's length when it began. */
export interface IntroState {
  readonly steps: readonly IntroStep[]
  readonly at: number
  readonly parts: readonly KitPart[]
  readonly replay: boolean
  /** On a page with a ledger, the intro waits for it before it shows: a level the learner played has its parts met. */
  readonly checking: boolean
  readonly turns: number
  /** On a phone, the part the list shows. */
  readonly partAt: number
  /**
   * The intro is over, and its strip waits blank in its place (Frame.tsx): `typed` while a digit is being typed, `held` after a real move in a
   * game whose kit holds the strip, until the hand leaves the dock.
   */
  readonly ended?: 'typed' | 'held'
}

export interface IntroPlanInput {
  readonly firstAsk: FirstAsk
  readonly canLook: boolean
  /** The parts this level draws, and those the flag says were shown. */
  readonly parts: readonly KitPart[]
  readonly shown: readonly string[]
  /** "Show the first run again" from How to play: every part, whether met or not. */
  readonly replay: boolean
  /** Whether the page has a ledger. The front page has none, and reads the flag alone (D-038). */
  readonly ledger: boolean
  /** Actions in the log now. */
  readonly turns: number
}

/**
 * The first run for a level, or null when it has nothing to name. A replay in the middle of a run names the parts only, since the ask and
 * the first move belong to the level's start. On a page with a ledger the intro that opens by itself first waits for the ledger.
 */
export function introPlan(input: IntroPlanInput): IntroState | null {
  const parts = introParts(input.parts, input.shown, input.replay)
  if (parts.length === 0) return null
  const steps = input.replay && input.turns > 0 ? (['parts'] as const) : introSteps(input.firstAsk, input.canLook)
  return { steps, at: 0, parts, replay: input.replay, checking: !input.replay && input.ledger, turns: input.turns, partAt: 0 }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The steps, as a machine                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What the run tells the intro: whether a real move is in the log (the ask's own commit is not one), and whether the ask is still open. */
export interface IntroSignal {
  readonly moved: boolean
  readonly askOpen: boolean
}

/**
 * The step after `at`, or null when the intro is over. `next` is the learner's Next. A real move ends the intro wherever it is; the ask's
 * step ends when the ask is answered (committed or skipped) and the move's step ends when the move is made.
 */
export function introAfter(steps: readonly IntroStep[], at: number, event: 'next' | IntroSignal): number | null {
  const step = steps[at]
  if (event === 'next') return at + 1 < steps.length && step !== 'move' && step !== 'point' ? at + 1 : null
  if (event.moved) return null
  if (step === 'ask' && !event.askOpen) return at + 1 < steps.length ? at + 1 : null
  return at
}

/**
 * What the intro does for the learner at a step. At `move` it makes the first move through the run, so the move is in the action log; at
 * `look` it only shows what the part holds, and dispatches nothing. No other step dispatches.
 */
export function introAct<Action extends GameAction>(step: IntroStep, kit: Pick<GameKit<Action, unknown>, 'firstMove'>, dispatch: (action: Action) => void): void {
  if (step === 'move' && kit.firstMove !== null) dispatch(kit.firstMove)
}

/** The control the amber ring is on: the first move, at `move` and at `point`, and nothing before. */
export const introRing = <Action extends GameAction>(step: IntroStep | null, kit: Pick<GameKit<Action, unknown>, 'firstMove'>): Action | null =>
  step === 'move' || step === 'point' ? kit.firstMove : null

/** Whether the game may show its first ask now: not before the parts list and the look (P4, name then ask). */
export const askShown = (step: IntroStep | null): boolean => step === null || step === 'ask' || step === 'point' || step === 'move'

/** Two actions are the same when their canonical forms are. */
export const sameAction = (a: GameAction | null, b: GameAction | null): boolean => a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The intro flag (`es:intro`, D-066)                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The part ids the intro has shown for a game. Never throws: a blocked or broken key reads as none. */
export function readShown(game: string): readonly string[] {
  const flag = readJson(PLACE_KEYS.intro)
  if (!isObject(flag)) return []
  const ids = flag[game]
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length <= 60).slice(0, 200) : []
}

/** Adds part ids to a game's entry in the flag. A place, not evidence: losing it only shows an intro again. */
export function keepShown(game: string, ids: readonly string[]): void {
  const flag = readJson(PLACE_KEYS.intro)
  const all = isObject(flag) ? flag : {}
  const merged = [...new Set([...readShown(game), ...ids])]
  writeJson(PLACE_KEYS.intro, { ...all, [game]: merged })
}
