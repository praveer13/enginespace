/**
 * Back of House's run (GAMES.md §5, "Core loop" step 4 and `runPath`): the ticket is sent along the laid path and stops at the first
 * stage that breaks a rule or is not the engine's own.
 *
 * A stage holds when it passes three checks, in this order, and the run reports the first that fails:
 *   1. The rules of GAMES.md §5, which packages/sim/lifecycle keeps as functions: it starts where the last stage ended (`legal`), its
 *      mechanism is the kind that crosses the boundary between its two places (`stageFits`), and nothing reads what a device-to-host
 *      copy brought before a sync has waited for it (`walk`).
 *   2. It is the engine's next stage. A stage can be legal where the ticket stands and still not be the one the engine makes: a stage
 *      of another engine that starts in a place this one also has, or one of this engine's own that comes earlier or later in its path.
 *
 * The explanation of a stop comes from the stage's source (GAMES.md §5: "The reason names the rule, or cites the pinned source file and
 * symbol"): the sentence names the rule or says the stage is not the engine's next, and the stop carries the stage that was laid and the
 * stage the engine has in that place, each with the file, symbol, line and quote it is cited to.
 */
import { FITS, RULES, boundaryOf, entryOf, legal, walk } from '@es/sim/lifecycle'
import type { EngineId, Rule, Scenario, StageDef } from '@es/sim/lifecycle'
import { noteOf, ownerOf, referenceOf, stageIn } from './stages'
import type { Failure, FloorRun, Mistake, Stop } from './types'
import { placeName } from './words'

/** An engine in the words a sentence uses: no version, no commit, because a version is a number and a sentence carries none. */
export const ENGINE_NAMES: Readonly<Record<EngineId, string>> = {
  'nano-vllm': 'nano-vllm',
  'mini-sglang': 'Mini-SGLang',
  'inside-vllm': 'vLLM at the Inside vLLM commit',
  vllm: 'vLLM at the pin',
  sglang: 'SGLang at the pin',
}

const named = (stage: StageDef): string => `“${stage.label}”`
const code = (text: string): string => `\`${text}\``

/** The sentence for a stage that broke one of the rules: the places, and the rule in the words of GAMES.md §5. */
function ruleSentence(rule: Rule, at: StageDef['from'], stage: StageDef): string {
  if (rule === 'async') return `${named(stage)} comes after a device-to-host copy, and the host has not waited for the copy yet. ${RULES.async}`
  const start = legal(at, stage)
  if (!start.ok) return `The ticket stands at ${code(placeName(at))}, and ${named(stage)} starts at ${code(placeName(stage.from))}. ${RULES[rule]}`
  const gap = boundaryOf(stage.from, stage.to)
  return `${named(stage)} goes from ${code(placeName(stage.from))} to ${code(placeName(stage.to))} by ${stage.mechanism}, and only ${FITS[gap].join(' or ')} crosses that. ${RULES[rule]}`
}

/** The sentence for a stage that obeys the rules and is still not the engine's next. */
function pathSentence(sc: Scenario, stage: StageDef, index: number): string {
  const reference = referenceOf(sc)
  const engine = ENGINE_NAMES[sc.engine]
  if (reference[index] === undefined) {
    return `The request is already back where it began, so there is nothing more to lay: ${named(stage)} is a hand-off that ${engine} does not make here.`
  }
  const owner = ownerOf(stage.id)
  if (owner !== undefined && owner !== sc.engine) {
    return `${named(stage)} is a stage of ${ENGINE_NAMES[owner]}. ${engine} does not make it here.`
  }
  const at = reference.findIndex((candidate) => candidate.id === stage.id)
  if (at < 0) return `${named(stage)} is not a hand-off that ${engine} makes.`
  const where = at === 0 ? 'It opens the path.' : `It follows ${named(reference[at - 1])}.`
  return `${named(stage)} is a hand-off of ${engine}, but it comes ${at > index ? 'later' : 'earlier'} in the path. ${where}`
}

/** Where the ticket stands before the stage at `index`: the engine's entry, or where the stage before it ended. */
const standing = (sc: Scenario, stages: readonly StageDef[], index: number) => (index === 0 ? entryOf(sc.engine) : stages[index - 1].to)

/** The stop at `index`: the rule it broke (or null for a stage that is legal and not the engine's), the sentence, and the two stages. */
function stopAt(sc: Scenario, stages: readonly StageDef[], index: number, rule: Rule | null): Stop {
  const stage = stages[index]
  const want = referenceOf(sc)[index]
  const failure: Failure = rule ?? 'path'
  return {
    at: index,
    failure,
    sentence: rule === null ? pathSentence(sc, stage, index) : ruleSentence(rule, standing(sc, stages, index), stage),
    laid: noteOf(stage),
    expected: want === undefined ? null : noteOf(want),
  }
}

/**
 * Sends the ticket along `laid` and reports how far it got (GAMES.md §5, `runPath`). Throws a RangeError for an id that no engine of
 * the model has, because a log that names one is not a log of this game.
 */
export function runPath(sc: Scenario, laid: readonly string[]): FloorRun {
  const reference = referenceOf(sc)
  const stages = laid.map((id) => {
    const def = stageIn(sc, id)
    if (def === undefined) throw new RangeError(`there is no stage "${id}" in the lifecycle model`)
    return def
  })
  const broken = walk(entryOf(sc.engine), stages)
  let off: number | null = null
  for (let i = 0; i < stages.length; i++) {
    if (reference[i] === undefined || stages[i].id !== reference[i].id) {
      off = i
      break
    }
  }
  // A stage that breaks a rule is named by the rule, even when it is also not the engine's: the rule is the concept.
  const byRule = broken.firstWrong !== null && (off === null || broken.firstWrong <= off)
  const index = byRule ? broken.firstWrong : off
  if (index === null) return { reached: stages.length, stop: null, complete: stages.length === reference.length }
  return { reached: index, stop: stopAt(sc, stages, index, byRule ? broken.rule : null), complete: false }
}

/**
 * The stop that a mistake was, found again from the engine's own path: a stage that held is the engine's stage at its place, so the
 * stages before the mistake are the reference's, and the stop is the run of that prefix and the stage laid after it.
 */
export function stopOfMistake(sc: Scenario, mistake: Mistake): Stop {
  const prefix = referenceOf(sc)
    .slice(0, mistake.index)
    .map((stage) => stage.id)
  const found = runPath(sc, [...prefix, mistake.stage]).stop
  if (found === null) throw new Error('internal: a mistake that does not stop the ticket')
  return found
}

