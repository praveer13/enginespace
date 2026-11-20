/**
 * Rule 7, the correctness re-checks the browser can run (ARCHITECTURE §8.5 rule 7, ASSESSMENT §5.7 and §5.8; W2-T08). The grader checks correctness
 * against references on the learner's machine, and these are the parts of it that follow from raw records this browser can read, so that the
 * grader's word is not all there is. The rest is attested (A§8.6).
 *
 *   identity-tally     TR1's instrumented fork against the plain run, TR6's speculative against plain outputs, under the tie-aware identity of
 *                      D-046. Per sequence the grader writes where the two runs first differ and the first run's top-2 log-probability gap
 *                      there (`enginespace/identity@1`). A sequence passes if it is identical, or if its gap is at most 0.05 nats, a near tie that
 *                      a different batch shape can flip. The stage passes when every sequence passes and at most 5% are tie-diverged. The
 *                      browser re-tallies the sequences; the gap is the grader's, since a log-probability is not recomputed without the logits.
 *   acceptance-counts  TR6's raw per-round counts (`enginespace/acceptance@1`): accepted is at most proposed in every round, tokens out are accepted
 *                      plus the bonus token, and a claimed acceptance (`performance.claimed[<id>]`: `{ rounds, proposed, accepted, ratePermille }`) equals the totals.
 *   claims-backed      every key of `performance.claimed` names an artifact of the receipt: a claim under any other key has nothing behind it and fails.
 *   argmax-bank        TR0's argmax token ids (`enginespace/argmax@1`) at the positions of the owner's pinned bank (W2-T17), which the site holds.
 *
 * A re-check over nothing is not a pass (the review of W2's grader track). An artifact with no sequence, no round or no position, and a bank with no position, say nothing
 * that a rule can hold, and a count of nothing satisfies every rule that is about each of its members. So each fails, and says that there was nothing to count: a receipt
 * that kept the entry and left the evidence out would otherwise have the browser's own check of its stage pass for it.
 *
 * A re-check runs when the receipt has its artifact, or when the stage requires it and then it fails without one. The three are the ones whose
 * rules ASSESSMENT states in full. The others of rule 7 (TR1's span order, TR4's errors, TR5b's probe log and event replay) are pending (stages.ts)
 * and arrive with their labs, which define the artifacts they read.
 */
import { divRound } from '@es/sim/core/int'
import { bareClaims, claimOf, fail, firstDifference, na, pass } from './checks'
import type { ArgmaxBank, Outcome, Run } from './checks'
import { ACCEPTANCE_FORMAT, ARGMAX_FORMAT, IDENTITY_FORMAT, readAcceptance, readArgmax, readArtifacts, readIdentity } from './evidence'
import type { ArgmaxLog, Parsed } from './evidence'
import { cut, grouped, plural } from './format'
import { PROBLEM_CHARS } from './limits'
import { ARGMAX_KEPT_ROWS } from './report'
import type { CheckResult } from './report'

/** A near tie: the first run's top-2 gap at the first mismatch is at most this, in thousandths of a nat [estimated] (D-046: 0.05 nats). */
export const NEAR_TIE_MILLI = 50
/** The share of sequences that may tie-diverge, in permille [estimated] (D-046: at most 5%). */
export const TIE_SHARE_PERMILLE = 50

/** The first artifact of a kind that is not readable, as the sentence a check fails with; null when all are. */
const unreadable = (id: string, all: readonly Parsed<unknown>[]): Outcome | null => {
  const bad = all.find((parsed) => !parsed.ok)
  return bad === undefined || bad.ok ? null : fail(id, cut(`the artifact "${bad.id}" could not be read: ${bad.problem}.`, PROBLEM_CHARS))
}

/** The first artifact of a kind whose receipt entry does not say what its own data says, as the sentence a check fails with; null when none. */
const relabelledIn = (id: string, all: readonly Parsed<unknown>[]): Outcome | null => {
  const bad = all.find((parsed) => parsed.ok && parsed.relabelled !== undefined)
  return bad === undefined || !bad.ok ? null : fail(id, cut(`the artifact "${bad.id}": ${bad.relabelled}.`, PROBLEM_CHARS))
}

function identityTally(run: Run): Outcome {
  const all = readArtifacts(run, 'outputs', IDENTITY_FORMAT, readIdentity)
  if (all.length === 0) return na(`the receipt carries no sequence comparison (${IDENTITY_FORMAT})`)
  const bad = unreadable('identity-tally', all)
  if (bad !== null) return bad
  const relabelled = relabelledIn('identity-tally', all)
  if (relabelled !== null) return relabelled
  for (const parsed of all) {
    if (parsed.ok && parsed.value.first.length === 0) {
      return fail('identity-tally', cut(`the artifact "${parsed.id}" holds no sequence, so no run was compared with another: an identity over no sequence is no identity.`, PROBLEM_CHARS))
    }
  }
  let sequences = 0
  let identical = 0
  let ties = 0
  for (const parsed of all) {
    if (!parsed.ok) continue
    for (let i = 0; i < parsed.value.first.length; i += 1) {
      sequences += 1
      if (parsed.value.first[i] === -1) identical += 1
      else if (parsed.value.gapMilli[i] <= NEAR_TIE_MILLI) ties += 1
    }
  }
  const diverged = sequences - identical - ties
  const text = `${plural(sequences, 'sequence')}: ${grouped(identical)} identical, ${grouped(ties)} tie-diverged (a first mismatch at a gap of at most 0.05 nats [estimated]) and ${grouped(diverged)} diverged`
  if (diverged > 0) return fail('identity-tally', cut(`${text}; a sequence that differs at more than a near tie fails.`, PROBLEM_CHARS))
  if (ties * 1000 > sequences * TIE_SHARE_PERMILLE) return fail('identity-tally', cut(`${text}; at most 5% [estimated] may tie-diverge.`, PROBLEM_CHARS))
  return pass('identity-tally', cut(`${text}; none diverged, and the tie-diverged are within 5% [estimated].`, PROBLEM_CHARS))
}

function acceptanceCounts(run: Run): Outcome {
  const all = readArtifacts(run, 'counts', ACCEPTANCE_FORMAT, readAcceptance)
  if (all.length === 0) return na(`the receipt carries no acceptance counts (${ACCEPTANCE_FORMAT})`)
  const bad = unreadable('acceptance-counts', all)
  if (bad !== null) return bad
  const relabelled = relabelledIn('acceptance-counts', all)
  if (relabelled !== null) return relabelled
  for (const parsed of all) {
    if (parsed.ok && parsed.value.proposed.length === 0) {
      return fail('acceptance-counts', cut(`the artifact "${parsed.id}" holds no round of speculation, so there is nothing to count: accepted ≤ proposed and tokens out = accepted + bonus say nothing about no round.`, PROBLEM_CHARS))
    }
  }
  for (const parsed of all) {
    if (!parsed.ok) continue
    const { proposed, accepted, bonus, emitted } = parsed.value
    let totalProposed = 0
    let totalAccepted = 0
    for (let i = 0; i < proposed.length; i += 1) {
      if (proposed[i] < 0 || accepted[i] < 0 || bonus[i] < 0 || emitted[i] < 0) return fail('acceptance-counts', cut(`round ${i} has a negative count.`, PROBLEM_CHARS))
      if (accepted[i] > proposed[i]) return fail('acceptance-counts', cut(`round ${i} accepted ${grouped(accepted[i])} of ${grouped(proposed[i])} proposed: accepted tokens never exceed proposed ones.`, PROBLEM_CHARS))
      if (emitted[i] !== accepted[i] + bonus[i]) {
        return fail('acceptance-counts', cut(`round ${i} emitted ${grouped(emitted[i])} tokens, and its ${grouped(accepted[i])} accepted plus ${grouped(bonus[i])} bonus make ${grouped(accepted[i] + bonus[i])}.`, PROBLEM_CHARS))
      }
      totalProposed += proposed[i]
      totalAccepted += accepted[i]
    }
    const rate = totalProposed === 0 ? 0 : divRound(totalAccepted * 1000, totalProposed)
    const claim = claimOf(run, parsed.id)
    const found = claim === undefined ? null : firstDifference(claim, { rounds: proposed.length, proposed: totalProposed, accepted: totalAccepted, ratePermille: rate }, 'acceptance')
    if (found !== null) return fail('acceptance-counts', cut(`${found}, recomputed from the raw counts of ${plural(proposed.length, 'round')}.`, PROBLEM_CHARS))
  }
  return pass('acceptance-counts', `${plural(all.length, 'artifact')}: in every round accepted ≤ proposed and tokens out = accepted + bonus, and any claimed acceptance equals the totals.`)
}

/** The ids of a receipt against the site's bank, as the check's result. It is the whole of the check once the ids are read, so a stored log can be held to a bank that the site gained later. */
export function argmaxAgainst(stage: string, log: ArgmaxLog, bank: ArgmaxBank | undefined): CheckResult {
  if (bank === undefined) return fail('argmax-bank', cut(`this site holds no argmax bank for ${stage} yet, so the ids cannot be compared.`, PROBLEM_CHARS))
  if (bank.positions.length === 0) return fail('argmax-bank', cut(`this site's argmax bank for ${stage} holds no position, so the ids cannot be compared: every id agrees with a bank of nothing.`, PROBLEM_CHARS))
  const given = new Map<number, number>()
  log.positions.forEach((position, i) => given.set(position, log.ids[i]))
  for (const [i, position] of bank.positions.entries()) {
    const id = given.get(position)
    if (id === undefined) return fail('argmax-bank', cut(`position ${grouped(position)} of the bank is not among the ${plural(given.size, 'position')} the receipt gives.`, PROBLEM_CHARS))
    if (id !== bank.ids[i]) return fail('argmax-bank', cut(`position ${grouped(position)}: the receipt's argmax is token ${grouped(id)}, and the pinned bank has ${grouped(bank.ids[i])} (every banked position must agree).`, PROBLEM_CHARS))
  }
  return pass('argmax-bank', `All ${plural(bank.positions.length, 'banked position')} have the pinned bank's argmax token.`)
}

function argmaxBank(run: Run): Outcome {
  const all = readArtifacts(run, 'outputs', ARGMAX_FORMAT, readArgmax)
  if (all.length === 0) return na(`the receipt carries no argmax ids (${ARGMAX_FORMAT})`)
  const bad = unreadable('argmax-bank', all)
  if (bad !== null) return bad
  const relabelled = relabelledIn('argmax-bank', all)
  if (relabelled !== null) return relabelled
  const parsed = all[0]
  if (!parsed.ok) return fail('argmax-bank', 'the ids could not be read.')
  return argmaxAgainst(run.receipt.stage, parsed.value, run.bank)
}

/**
 * The argmax ids that a stored report keeps, so that the check can be made again against a bank that the site gains after the receipt was brought back
 * (reread.ts). It is the log that `argmaxBank` reads, and nothing is kept when the receipt carries none, when it cannot be read or when it is longer than a report keeps.
 */
export function keptArgmax(run: Run): ArgmaxLog | undefined {
  const all = readArtifacts(run, 'outputs', ARGMAX_FORMAT, readArgmax)
  const first = all[0]
  if (first === undefined || !first.ok || all.some((parsed) => !parsed.ok)) return undefined
  return first.value.positions.length <= ARGMAX_KEPT_ROWS ? { positions: [...first.value.positions], ids: [...first.value.ids] } : undefined
}

/** Every key of a performance run's claim names an artifact the receipt carries; a key that names none is a claim with nothing behind it, and the browser recomputes nothing from it. */
function claimsBacked(run: Run): Outcome {
  const claimed = run.receipt.performance?.claimed
  if (claimed === undefined || Object.keys(claimed).length === 0) return na('the receipt claims nothing for a performance run')
  const bare = bareClaims(run)
  if (bare.length > 0) {
    const named = bare.slice(0, 3).map((key) => `"${cut(key, 40)}"`).join(', ')
    return fail('claims-backed', cut(`${plural(bare.length, 'claim')} (${named}${bare.length > 3 ? ', and more' : ''}) names no artifact of the receipt, so nothing was recomputed from it: a claim with nothing behind it.`, PROBLEM_CHARS))
  }
  return pass('claims-backed', `All ${plural(Object.keys(claimed).length, 'claim')} name an artifact of the receipt.`)
}

const RECHECKS: Readonly<Record<string, (run: Run) => Outcome>> = { 'identity-tally': identityTally, 'acceptance-counts': acceptanceCounts, 'argmax-bank': argmaxBank, 'claims-backed': claimsBacked }

/** The re-checks of this file, by id: ids.ts lists them, and a test holds the two together. */
export const RECHECKS_BUILT: readonly string[] = Object.keys(RECHECKS)

/** Runs re-check `id`. `na` when the receipt lacks the artifact it reads. */
export function recheck(run: Run, id: string): Outcome {
  const check = RECHECKS[id]
  return check === undefined ? na(`this site has no re-check called ${id}`) : check(run)
}
