/**
 * The stages of the labs, and what each asks of a receipt (ARCHITECTURE §8.5 rule 10; ASSESSMENT §5.9, "Required checks per stage"; W2-T08).
 *
 * ASSESSMENT owns the table and this file is its code. tests/verify/stages.test.ts reads §5.9 and fails when this list and it part: the stages are the
 * same, a stage requires something exactly when §5.9 does, and each row's grader-attested ("A") and browser-re-checked ("R") entries are as many as
 * §5.9 names. A row says, for one stage:
 *
 *   attested   the grader's checks the stage requires, by the `id` the grader writes in `receipt.checks` (the lab's kit lists them). The browser takes
 *              them as the grader's word, once the grader is one the site published (rule 5), and they count only if they are there and they passed
 *   rechecked  the checks this browser re-runs, by the ids of checks.ts: B1 to B14, T1 to T10, X1 to X5, P1 to P4, and a re-check's own name. A check
 *              the stage names and this build does not have is `PENDING` with the task that builds it, and a receipt of the stage is not credited
 *              until it exists: the verdict says which one is missing and whose it is
 *   optional   grader checks the stage lists as optional: they may fail without changing the verdict
 *   captured   browser checks that run when the receipt's evidence supports them and count only if they fail, which is what ASSESSMENT's "optional R"
 *              and "as captured" mean. `'*'` is every check that the evidence present calls for
 *
 * A stage that requires nothing (no `attested`, no `rechecked`) earns practice credit only (§5.9: "Stages marked optional earn practice credit
 * only"), and a receipt of it is `practice` when it is whole and whatever it captured is consistent. `tr4.sweep.s4` is the one stage that §5.9 marks
 * "its own KC at full weight", and requires what s2 and s3 do.
 *
 * Why the check names are here and not in the labs. The labs are other tasks (W2-T16, T23, T26, T32, T34, T35, T36, T38), and each needs this table to
 * credit anything, so it is written once, from §5.9, with a name for each check that §5.9 describes in words. A lab's kit writes the ids of its
 * `attested` list into `receipt.checks`, and a re-check that a lab owns is added to the registry when the lab lands.
 */

export interface Stage {
  readonly id: string
  readonly attested: readonly string[]
  readonly rechecked: readonly string[]
  readonly optional: readonly string[]
  readonly captured: readonly string[]
}

/** Every benchmark check the browser has, B13 being P3 (floors.ts): the whole of ASSESSMENT §6.2 but B11, the tool's own identities. */
const BENCH = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B12', 'B13', 'B14'] as const

/** Ids that ASSESSMENT gives to one check twice: T9 is P1 (the floor of a step), and B13 is P3 (the ceiling of throughput). */
export const ALIASES: Readonly<Record<string, string>> = { T9: 'P1', B13: 'P3' }

/**
 * The checks that §5.9 requires and this build does not have yet, each with the task that builds it. A receipt of a stage that requires one is not
 * credited, and says so: "X is not built yet; W2-Tnn builds it". When a task builds a check, it moves it from here to the registry.
 */
export const PENDING: Readonly<Record<string, string>> = {
  X1: 'W2-T23', // a trace inside its replay's window, and its decode tokens equal to the rows' (needs the trace and the log on one clock)
  'runner-log': 'W2-T23', // the runner and the graph mode that the engine's own log shows (engine_config.py's patterns, ported)
  'attribution-coverage': 'W2-T23', // the learner's categories cover 95% of each window, the causes and the finding (the attribution report's format)
  'span-order': 'W2-T34', // the spans of the fork in the order of the nano-vllm path the learner laid in The Engine Floor
  'preemption-spans': 'W2-T34',
  'backend-log': 'W2-T26', // the backend the engine selected and the mode it ran in, from its log
  'sweep-errors': 'W2-T26', // recorded errors against their tolerances
  'sweep-timings': 'W2-T26', // medians and intervals from the raw repeats
  P4: 'W2-T26', // an attention call against the bytes it must move
  'sweep-ranking': 'W2-T26',
  'probe-hashes': 'W2-T32', // every KV block's hash at load equals its hash at save
  'loaded-tokens': 'W2-T32',
  'failure-log': 'W2-T32',
  'events-replay': 'W2-T28', // the event log replayed through packages/sim/tiers
  'same-runner-async': 'W2-T35', // the two sides of the speedup claim ran on one runner and one async setting
  'tpot-ratio': 'W2-T35', // the TPOT ratio and its interval, recomputed
  B11: 'W2-T36', // vllm bench serve's own identities (completed ÷ duration and the rest), from its saved result
  'config-diff': 'W2-T38',
  'draft-fields': 'W2-T38',
  'capstone-sides': 'W3-T02', // X2, and everything tr8.replay.s2 and tr3.profile.s2 require, for each side of the pair
  'capstone-form': 'W3-T03', // every number in the explanation form equal to the recomputed one
}

const stage = (id: string, rows: Partial<Omit<Stage, 'id'>> = {}): Stage => ({ id, attested: [], rechecked: [], optional: [], captured: [], ...rows })

const T_RULES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'] as const
/** What tr3.profile.s2 and s4 require of the traces: ASSESSMENT's "T1-T10; floors P1; cross-checks X1, X4, X5" (X5, the engine's integrity, is the grader's `engine-integrity`). */
const PROFILE = {
  attested: ['teacher-forced', 'engine-integrity'],
  rechecked: ['runner-log', ...T_RULES, 'X1', 'X4'],
} as const

/** ASSESSMENT §5.9, stage by stage. */
export const STAGES: readonly Stage[] = [
  stage('tr0.forward.s1', { optional: ['layer0-hidden'] }),
  stage('tr0.forward.s2', { attested: ['logits-fp32', 'import-guard'], rechecked: ['argmax-bank'] }),
  stage('tr0.forward.s3', { attested: ['cache-logits', 'cache-lengths'] }),

  stage('tr1.fork.s1', { attested: ['teacher-forced'] }),
  stage('tr1.fork.s2', { attested: ['tie-aware-identity', 'teacher-forced'], rechecked: ['span-order', 'T1', 'T2', 'T3', 'T4', 'T5'] }),
  stage('tr1.fork.s3', { captured: ['preemption-spans'] }),

  stage('tr3.profile.s1', { optional: ['ncu-probe'] }),
  stage('tr3.profile.s2', PROFILE),
  stage('tr3.profile.s3', { rechecked: ['T7', 'attribution-coverage'] }),
  stage('tr3.profile.s4', PROFILE),
  stage('tr3.profile.s5', { captured: ['*'] }),

  stage('tr4.sweep.s1', { attested: ['backends-run'], rechecked: ['backend-log'] }),
  stage('tr4.sweep.s2', { attested: ['sdpa-tolerance'], rechecked: ['sweep-errors'] }),
  stage('tr4.sweep.s3', { rechecked: ['sweep-timings', 'P4', 'sweep-ranking'] }),
  stage('tr4.sweep.s4', { attested: ['sdpa-tolerance'], rechecked: ['sweep-errors', 'sweep-timings', 'P4', 'sweep-ranking'] }),

  stage('tr5b.connector.s1', { attested: ['upstream-tests'] }),
  stage('tr5b.connector.s2', { attested: ['supports-hma', 'upstream-tests', 'teacher-forced'], rechecked: ['probe-hashes', 'loaded-tokens'] }),
  stage('tr5b.connector.s3', { attested: ['failed-blocks', 'teacher-forced'], rechecked: ['failure-log'] }),
  stage('tr5b.connector.s4', { captured: ['events-replay'] }),

  stage('tr6.proposer.s1', { attested: ['tie-aware-identity'], rechecked: ['acceptance-counts'] }),
  stage('tr6.proposer.s2', { attested: ['tie-aware-identity'], rechecked: ['acceptance-counts', 'runner-log'] }),
  stage('tr6.proposer.s3', { rechecked: [...BENCH, 'same-runner-async', 'tpot-ratio'] }),

  stage('tr7.reproduce.s1', { attested: ['teacher-forced'], rechecked: ['evidence', 'config-diff'] }),
  stage('tr7.reproduce.s2', { rechecked: ['draft-fields'] }),

  stage('tr8.replay.s1', { captured: ['B1', 'B2', 'B3'] }),
  stage('tr8.replay.s2', { attested: ['teacher-forced'], rechecked: BENCH }),
  stage('tr8.replay.s3', { captured: ['B11'] }),

  stage('capstone.pair.s1', { rechecked: ['capstone-sides'] }),
  stage('capstone.pair.s2', { rechecked: ['capstone-form'] }),
]

const BY_ID: ReadonlyMap<string, Stage> = new Map(STAGES.map((entry) => [entry.id, entry]))

/** The row for a stage id, or undefined for a stage this build does not list. */
export const stageRow = (id: string): Stage | undefined => BY_ID.get(id)

/** A stage that requires nothing earns practice credit only. */
export const isPractice = (row: Stage): boolean => row.attested.length === 0 && row.rechecked.length === 0

/** The id a check is run and reported under: an alias is the check it names. */
export const canonical = (id: string): string => ALIASES[id] ?? id
