/*
 * The labs that issue challenges and take receipts, and the stages of each (ARCHITECTURE §8.4, §9.6; ASSESSMENT §5.9; W2-T06).
 *
 * A challenge is for one stage, such as `tr8.replay.s2`, and a stage belongs to a lab that runs on the learner's own machine: the
 * laptop's CPU (lane L, TR0's forward pass) or a GPU (lane F, every other). The browser labs (lane B) are graded in the tab and have
 * no challenge, so they are not here. The lab's own page and its `lab.toml` (labs/gpu/<lab>/) come with the task that builds each lab,
 * and until then this list is where the site learns that a stage exists.
 *
 * Nothing here is new. The stage ids are ASSESSMENT §5.9's table and the curriculum's `receipt:<stage>` rows, a stage's name is the
 * curriculum's word for it, and a stage is optional when §5.9 requires nothing of it (the module can be finished without it). The
 * lanes are course.yaml's. tests/receipts/labs.test.ts reads all four documents and fails when this list and they part, so a stage
 * that a later task adds, renames or makes optional is caught there and not in front of a learner.
 */
import { labOfStage as labIdOfStage } from '@es/schema/refs'

/** The lane of a lab that runs on the learner's machine: `L` is the laptop's CPU and `F` is a GPU, their own or a rented one (A§8.1). */
export type ReceiptLane = 'L' | 'F'

export interface ReceiptStage {
  /** `tr8.replay.s2`. */
  id: string
  /** The stage's number, from 1: the `2` of `s2`. */
  n: number
  /** What the stage is, in a few words: the curriculum's name for it. */
  name: string
  /** Whether the module can be finished without it (ASSESSMENT §5.9 asks no check of it). */
  optional: boolean
}

export interface ReceiptLab {
  /** `tr8.replay`: the lab's id, and the first two parts of each of its stages' ids. */
  id: string
  /** `tr8`. */
  module: string
  lane: ReceiptLane
  stages: readonly ReceiptStage[]
}

/** A stage's name, or its name with `optional` after it when the module does not need the stage. */
type StageDef = string | readonly [name: string, flag: 'optional']

function lab(id: string, lane: ReceiptLane, defs: readonly StageDef[]): ReceiptLab {
  const stages = defs.map((def, at): ReceiptStage => {
    const [name, flag] = typeof def === 'string' ? [def, undefined] : def
    return { id: `${id}.s${at + 1}`, n: at + 1, name, optional: flag === 'optional' }
  })
  return { id, module: id.slice(0, id.indexOf('.')), lane, stages }
}

/** The labs in the course's order, TR0 to the capstone. */
export const RECEIPT_LABS: readonly ReceiptLab[] = [
  lab('tr0.forward', 'L', [['one layer', 'optional'], 'the full forward pass', 'with a KV cache']),
  lab('tr1.fork', 'F', ['stock nano-vllm', 'the instrumented fork', ['a forced preemption', 'optional']]),
  lab('tr3.profile', 'F', [['preflight', 'optional'], 'graphs on and off', 'the attribution report', 'async on and off', ['nsys or SGLang', 'optional']]),
  lab('tr4.sweep', 'F', ['inventory', 'correctness', 'timings', ['Hopper', 'optional']]),
  lab('tr5b.connector', 'F', ['the example connector', 'your connector', 'injected failures', ['KV events', 'optional']]),
  lab('tr6.proposer', 'F', ['the built-in n-gram', 'your proposer', 'the speedup claim']),
  lab('tr7.reproduce', 'F', ['reproduce a number', 'the issue draft']),
  lab('tr8.replay', 'F', [['a smoke replay', 'optional'], 'the BurstGPT replay', ['vllm bench serve', 'optional']]),
  lab('capstone.pair', 'F', ['the paired runs', 'the explanation']),
]

/** Every stage of every lab, in order. */
export const RECEIPT_STAGES: readonly ReceiptStage[] = RECEIPT_LABS.flatMap((entry) => entry.stages)

const STAGES: ReadonlyMap<string, ReceiptStage> = new Map(RECEIPT_STAGES.map((stage) => [stage.id, stage]))
const LABS: ReadonlyMap<string, ReceiptLab> = new Map(RECEIPT_LABS.map((entry) => [entry.id, entry]))

/** The stage with this id, or undefined for one this build does not list (a newer build's, or an edited file's). */
export const stageOf = (id: string): ReceiptStage | undefined => STAGES.get(id)

/** The lab with this id. */
export const labById = (id: string): ReceiptLab | undefined => LABS.get(id)

/** The lab that lists this stage: `tr8.replay.s2` is a stage of `tr8.replay`. A stage id of another build may name a lab that this one lacks. */
export const labForStage = (stage: string): ReceiptLab | undefined => LABS.get(labIdOfStage(stage))

/** A stage as a person says it: `tr8.replay.s2, the BurstGPT replay`. A stage this build does not know is its id alone. */
export function stageTitle(id: string): string {
  const stage = STAGES.get(id)
  return stage === undefined ? id : `${id}, ${stage.name}`
}

/** The first letter of a stage's name in capitals, as a ticket's title takes it; a stage that this build does not list is its id. */
export function stageHeading(id: string): string {
  const name = STAGES.get(id)?.name
  return name === undefined ? id : name.charAt(0).toUpperCase() + name.slice(1)
}

/** What a lane is called, as the course map calls it (`laneName` in src/content/render/model.ts): the laptop, or a GPU. */
export const LANE_NAME: Readonly<Record<ReceiptLane, string>> = { L: 'laptop', F: 'GPU' }
