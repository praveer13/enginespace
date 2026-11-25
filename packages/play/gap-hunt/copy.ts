/**
 * What Trace attribution says, by level (GAMES.md §6; TR3's design, "Before you write", items 2, 6 and 8): the title in the level menu, the
 * goal line, the line a level opens on, the guess's question with the unit its answer is in, a pass rule, and the readouts.
 *
 * The words are display copy and no rule reads them, so they are in no level and no state: rewording one moves no state hash. Every figure
 * a sentence prints is read from the level or the state it is about. The word for the stretch in which the GPU idles while the CPU prepares
 * the next step is `GAP_WORD` of src/copy/terms.ts, which this pure package may not import: `copyOf` takes it as an argument, so the page
 * passes the key, and a test passes another word to see every line that names it change (tests/copy/game-copy.test.ts).
 *
 * The game's graded bar and the lesson block's are never printed as one rule (TR3's design, item 8): the lines here carry the game's own, which
 * divides by the step's ns, and name no other.
 */
import type { GoalLine } from '../types'
import { PASS_PERCENT } from './score'
import type { HuntLevel, HuntLevelId } from './types'

export const HUNT_TITLES: Readonly<Record<HuntLevelId, string>> = {
  read: 'A launch and its kernel',
  graphs: 'Graph replays',
  gap: 'The largest gap',
  attribute: 'Every nanosecond',
}

/** What a level asks the learner to predict, in words, and the unit its answer is in. */
export interface HuntPredictCopy {
  readonly ask: string
  readonly unit: 'category' | 'kernels'
}

export interface HuntCopy {
  readonly title: string
  readonly goal: GoalLine
  /** The line the level opens on. */
  readonly prompt: string
  /** Only `gap`, `attribute` and `graphs` open on a guess. */
  readonly predict?: HuntPredictCopy
  /** A graded level's pass rule, stated before the run (REDESIGN §2.6). Only a graded level has one. */
  readonly passRule?: string
  /** What passes a practice level, in practice. Only a practice level has one. */
  readonly practiceRule?: string
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** The four categories as a goal line lists them: `kernel, copy-only, CPU gap or both idle`. */
const categoriesLine = (gapWord: string): string => `kernel, copy-only, ${gapWord} or both idle`

const practiceGap = 'Passes in practice when your gap is the largest one, edge to edge, and your cause is its event.'
const practiceAttribute = (gapWord: string): string => `Passes in practice when at least ${PASS_PERCENT}% of the step's ns are in the right category and the cause is right. The ${categoriesLine(gapWord)} that the GPU runs arrive marked.`

const gapRule = (n: number): string => `Passes when, on each of ${plural(n, 'new step', 'new steps')}, your gap is the largest one, edge to edge, and your cause is its event.`
const attributeRule = (n: number): string => `Passes when, on each of ${plural(n, 'new step', 'new steps')}, at least ${PASS_PERCENT}% of the step's ns are in the right category and the cause is right.`

/** The copy of a level, with every figure read from the level and the form's word from `gapWord`. */
export function copyOf(level: HuntLevel, gapWord: string): HuntCopy {
  const n = level.needed
  switch (level.id) {
    case 'read':
      return {
        title: HUNT_TITLES.read,
        goal: {
          aim: 'Find a launch call and the kernel it started.',
          controls: 'You set two marks: name the launch call, and mark the kernel.',
          beat: "Passes in practice when the kernel you marked carries the launch call's correlation id.",
          ends: 'Ends when the pair is marked and you submit.',
        },
        prompt: 'A kernel runs on the GPU because a launch call of the CPU queued it. The two carry one correlation id: follow it from the call to the kernel.',
        practiceRule: "Passes in practice when the kernel you marked carries the launch call's correlation id.",
      }
    case 'graphs':
      return {
        title: HUNT_TITLES.graphs,
        goal: {
          aim: 'Count the kernels one graph replay ran.',
          controls: 'You switch between the two traces of the replay: as one launch, and at node level.',
          beat: 'Passes in practice when your count equals the kernels the node-level trace shows.',
          ends: 'Ends when you commit a count.',
        },
        prompt: 'A graph replay is one launch of many kernels. The trace of the launch shows one call; the trace at node level shows each kernel the replay ran.',
        predict: { ask: 'How many kernels did this replay run?', unit: 'kernels' },
        practiceRule: 'Passes in practice when your count equals the kernels the node-level trace shows.',
      }
    case 'gap': {
      const rule = gapRule(n)
      return {
        title: HUNT_TITLES.gap,
        goal: {
          aim: 'Find the largest gap of the step and the call that caused it.',
          controls: "You mark the gap from one edge to the other, and name one cause. The GPU's own work arrives marked.",
          beat: level.graded ? rule : `Practice is not graded. The graded rule: ${gapRule(3)}`,
          ends: level.graded ? `Ends when you have submitted all ${n} steps.` : 'Ends when you submit.',
        },
        prompt: `The GPU idles only when its queue runs empty. Find the longest stretch in which nothing runs on it, and read what the main thread was doing before the launch that ended it.`,
        predict: { ask: `Which takes the most of this step: ${categoriesLine(gapWord)}?`, unit: 'category' },
        ...(level.graded ? { passRule: rule } : { practiceRule: practiceGap }),
      }
    }
    case 'attribute': {
      const rule = attributeRule(n)
      return {
        title: HUNT_TITLES.attribute,
        goal: {
          aim: `Put every nanosecond of the step in one category: ${categoriesLine(gapWord)}.`,
          controls: "You mark each stretch from one edge to another with a category, then name the largest gap's cause.",
          beat: level.graded ? rule : `Practice is not graded. The graded rule: ${attributeRule(3)}`,
          ends: level.graded ? `Ends when you have submitted all ${n} steps, each with every ns marked and the cause named.` : 'Ends when every ns is marked, the cause is named and you submit.',
        },
        prompt: `A step's time is GPU-busy time, plus ${gapWord}, plus both idle. Cover the whole step with marks, so that nothing is left unaccounted.`,
        predict: { ask: `Which takes the most of this step: ${categoriesLine(gapWord)}?`, unit: 'category' },
        ...(level.graded ? { passRule: rule } : { practiceRule: practiceAttribute(gapWord) }),
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Readouts                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The ns of the step that no mark covers: the counter that must reach 0. */
export const unaccountedLine = (ns: number): string => (ns === 0 ? 'Unaccounted: 0 ns, every ns of the step is marked' : `Unaccounted: ${ns} ns`)

/** The marks the learner has made, those a case starts with left out. */
export const marksLine = (n: number): string => (n === 0 ? 'No marks yet' : plural(n, 'mark', 'marks'))

export const causeLine = (named: boolean): string => (named ? 'A cause is named' : 'No cause is named yet')

export const overlapLine = 'Marks of different categories overlap'

/** Which case is in play: `Step 2 of 3`. */
export const stepLine = (at: number, of: number): string => `Step ${at + 1} of ${of}`
