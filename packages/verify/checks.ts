/**
 * What the checks of rules 7 to 9 share (ARCHITECTURE §8.5; W2-T08): the data the page gives them, the receipt they look at, and the shape of an answer.
 *
 * Rules 7, 8 and 9 are many small checks, each with the id ASSESSMENT gives it (B1 to B14, T1 to T10, X1 to X5, P1 to P4) or a name of its own.
 * A check looks at a receipt and the artifacts that came with it, and answers in one of three ways:
 *   - `pass` or `fail`, with the bound it held the receipt to and what it found against it, printed in one sentence (A§8.5: "a bounded check
 *     prints its bound", statespace's I10);
 *   - `na`, with the reason, when the receipt has nothing for it to look at, such as a step count for a stage that declares none.
 * Which checks a stage asks for is stages.ts's (ASSESSMENT §5.9). A check that the stage asks for and cannot run fails, and says why; a check
 * the stage does not ask for, and cannot run, is left out.
 *
 * The package reads no ledger, no clock and no file. What a check needs of the site comes in as `VerifyContext`: the atlas, what each stage declares
 * about the workload its challenge draws, and the reference banks. All of it is plain data, so that it crosses to the worker as it is, and each
 * of the three is empty until the task that makes it lands (the atlas is W2-T09's; a stage's declaration and its bank come with its lab).
 */
import type { Bundle } from '@es/schema/bundle'
import type { Receipt } from '@es/schema/receipt'
import type { BenchSpec } from '@es/sim/bench'
import type { Atlas } from './atlas'
import { cut, grouped } from './format'
import type { CheckResult } from './report'

/**
 * What a stage declares of the workload that its challenge draws. The site holds it, never the receipt: a receipt that named its own workload
 * could name the one it ran, and the schedule would bind to nothing (B1). A stage that declares nothing cannot have the checks that need it
 * run, and they fail with that reason until its lab (W2-T23, W2-T36 and the other lab tasks) adds its entry.
 */
export interface StageDeclaration {
  /** The open-loop benchmark of the stage: the arrivals and lengths its seed draws, the arrival window and the objectives (B1, B8, B9, B10). */
  readonly bench?: BenchSpec
  /** The number of step windows the stage's challenge asks for, drawn from the seed: `between(rngFor(seed, salt), lo, hi)` (T6). */
  readonly steps?: { readonly salt: string; readonly lo: number; readonly hi: number }
  /** The most tokens one sequence emits in one step (P3): 1 unless the stage speculates. */
  readonly tokensPerSeqStep?: number
  /** The share of the model's weight bytes that one forward reads, in permille, for a model that is not dense (P1, P3). The atlas's `READ_PERMILLE` otherwise. */
  readonly readPermille?: number
}

export type StageDeclarations = Readonly<Record<string, StageDeclaration>>

/** A reference bank: the argmax token ids of a model at chosen positions of the stage's prompts, which the owner records (W2-T17). */
export interface ArgmaxBank {
  readonly positions: readonly number[]
  readonly ids: readonly number[]
}

export type Banks = Readonly<Record<string, ArgmaxBank>>

/** What the checks of rules 7 to 9 look at. */
export interface Run {
  readonly receipt: Receipt
  readonly artifacts: Bundle['artifacts']
  readonly atlas: Atlas
  /** The stage's declaration, if the site has one. */
  readonly declared: StageDeclaration | undefined
  /** The stage's reference bank, if the site has one. */
  readonly bank: ArgmaxBank | undefined
  /** Whether the grader build is one that only writes labelled synthetic fixtures, which the site's list says (identity.ts). The site's own list never does. */
  readonly synthetic: boolean
  /** What a check parsed, kept for the next one that wants it, by key. */
  readonly memo: Map<string, unknown>
}

/** A check that has nothing to look at in this receipt, and why. */
export interface NotApplicable {
  readonly na: string
}

export type Outcome = CheckResult | NotApplicable

export const isNa = (outcome: Outcome): outcome is NotApplicable => 'na' in outcome

export const pass = (id: string, bound: string): CheckResult => ({ id, status: 'pass', bound })
export const fail = (id: string, bound: string): CheckResult => ({ id, status: 'fail', bound })
export const na = (reason: string): NotApplicable => ({ na: reason })

/** Computes a value once for a run: the second check that asks for the same key gets the first one's answer. */
export function memoized<T>(run: Run, key: string, make: () => T): T {
  if (run.memo.has(key)) return run.memo.get(key) as T
  const made = make()
  run.memo.set(key, made)
  return made
}

/** A check over several artifacts (a pair of logs, two traces): it passes when every part passes, and prints each part's bound under the artifact's id. */
export function together(id: string, parts: readonly { readonly label: string; readonly result: CheckResult }[]): CheckResult {
  const failed = parts.some((part) => part.result.status === 'fail')
  const bound = parts.length === 1 ? parts[0].result.bound : parts.map((part) => `${part.label}: ${part.result.bound}`).join(' ')
  return failed ? fail(id, bound) : pass(id, bound)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Claims                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * What a receipt claims for an evidence artifact: `performance.claimed[<artifact id>]`, when it is an object. A claim is a summary that the grader's
 * port of the arithmetic wrote and that the browser recomputes and never trusts (D-028). The rest of `claimed` is ignored.
 */
export function claimOf(run: Run, artifactId: string): Record<string, unknown> | undefined {
  const claimed: unknown = run.receipt.performance?.claimed[artifactId]
  return isObject(claimed) ? claimed : undefined
}

const show = (value: unknown): string => (typeof value === 'number' ? grouped(value) : cut(JSON.stringify(value) ?? String(value), 40))

/**
 * The first place where a claim differs from what was recomputed, for the keys that both have; null when it agrees. A figure is equal or it is not:
 * they are integers, and "at the claimed rounding" (ASSESSMENT §6.5) is whole µs or whole ns. A key the recomputation does not have is not compared,
 * since credit never depends on a number the browser does not compute.
 */
export function firstDifference(claimed: unknown, actual: unknown, path: string): string | null {
  if (isObject(claimed)) {
    // A claim of figures where the rows give none is a difference: a time per token claimed for a log in which no request has a second token.
    if (!isObject(actual)) return `${path}: the receipt claims figures and the rows give ${show(actual)}`
    for (const [key, value] of Object.entries(claimed)) {
      if (!Object.hasOwn(actual, key)) continue
      const found = firstDifference(value, actual[key], `${path}.${key}`)
      if (found !== null) return found
    }
    return null
  }
  if (Array.isArray(claimed) && Array.isArray(actual)) {
    if (claimed.length !== actual.length) return `${path}: the receipt claims ${claimed.length} entries and the rows give ${actual.length}`
    for (let i = 0; i < claimed.length; i += 1) {
      const found = firstDifference(claimed[i], actual[i], `${path}[${i}]`)
      if (found !== null) return found
    }
    return null
  }
  return claimed === actual ? null : `${path}: the receipt claims ${show(claimed)} and the rows give ${show(actual)}`
}

/** `firstDifference` for one key of an artifact's claim: null when the receipt claims nothing under that key, or when what it claims agrees. */
export function firstDifferenceIn(run: Run, artifactId: string, key: string, actual: unknown): string | null {
  const claim = claimOf(run, artifactId)
  return claim === undefined || !Object.hasOwn(claim, key) ? null : firstDifference(claim[key], actual, key)
}
