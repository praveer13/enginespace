// The rejection-sampler lab's oracle: the five checks that the site fires at a learner's verify step (labs/forge/rejection-sampler,
// ARCHITECTURE §5.5 and §8.3, curriculum TR6 §5, ASSESSMENT §4.5).
//
// The learner writes four functions of src/verify.rs, and the site drives them through `ks_invoke`:
//
//   accept(px, qx, u)           keep the commis's plate x, from one coin u in 0..qx: exactly min(px, qx) of the qx coins keep it
//   residual(p, q)              the excess max(0, p − q) of every dish
//   pick(weights, draw)         the first dish whose running total passes the draw: each dish is picked by exactly its weight of the draws
//   verify(p, q, draft, rng)    one round: a coin and `accept` for each draft, at the first send-back a dish picked from the residual, and
//                               after a full run a bonus dish picked from p
//
// The oracle stays outside the module (D-025). It never asks the module whether it is right: it sends coins, draws and drafts it chose, and
// judges the replies itself, with `packages/sim/spec` beside it. Every check is exact (no false fail) except the last, which is a
// chi-square test and fails an exact sampler with probability about 1e-4 on each of its two seeds [derived from α = 1e-4, A§8.3].
//
// Where the randomness lives. The three small functions take their coin or their draw as an argument, so the site can try every one of them
// (a statistic could only sample them), and any rule with the right counts passes: keeping the top coins of a plate instead of the bottom
// ones, or walking the weights from the end, is exact too. `verify` draws its own coins from the `Rng` that the harness seeds with `seed`, in
// whatever order the learner likes, so the only thing that can judge it as a whole is its output: the cases of `round` leave it no choice,
// and `exact` counts.
//
// The wire is the crate's (labs/forge/rejection-sampler/src/lib.rs). One command goes in through `ks_invoke` and one line comes out:
//
//   accept <px> <qx> <u>       one coin through your accept, u in 0..qx                    → yes | no
//   residual <p> <q>           your residual of two weight lists, such as 5,3,0 2,6,0       → <w>,<w>,...
//   weights <w>,<w>,...        keep a weight list for pick, each weight 0 to 65,536          → ok
//   pick <draw>                your pick on the kept weights, draw below their sum          → <token>
//   chain <p>|<p>|.. <q>|<q>   keep a chain: one more p than q, each adding up to 65,536    → ok
//   seed <n>                   seed the coins that rounds draw, n a u32                     → ok
//   round <x>,<x>,...          your verify on the kept chain and the draft x,x,...          → <token>,<token>,...
//
// The checks, in grading order. Each one's seed draws its cases, so a learner cannot special-case them:
//
//   accept     every coin of the plates that p and q give a seeded pair (one dish of each kind: p = 0, p < q, p = q, p > q), and of a few
//              hand cases. Exactly min(p, q) of the coins must keep the plate. With `pick`, this is the look that sees the boundary-inclusive
//              comparison of SGLang PR #35798, which moves a dish by 1/65,536 [derived] where a chi-square sees it in about one trial
//              in nine [measured 2026-11-04: 1,163 of 10,000 cases; tests/sim/rejection-sampler-rates.ts] (packages/sim/spec/check.ts).
//   residual   the excess of a few hand pairs and of three seeded pairs, one from each band.
//   pick       every draw of a few hand lists, of the residual of a seeded pair (in 1/16ths), and of a small seeded list: each dish is
//              picked by exactly as many draws as its weight, and a dish of weight 0 never.
//   round      rounds in which no coin matters: a plate that p rules out is sent back for sure, a plate with p = q is kept for sure, and a
//              residual with one dish picks it whatever the draw. What an exact round emits is known, and the check sends 16 rounds of each
//              of four such cases: a stop at the first send-back, a stop at the second, a full run with a known bonus, and a flat first target
//              whose first plate p rules out, followed by a plate that is kept for sure (a lossy rule keeps the first anyway).
//   exact      the first token of 20,000 rounds on each of two seeds, against p[0], by chi-square at α = 1e-4 (packages/sim/spec/check.ts).
//
// The crate's own checks (`cargo test`) ask the same questions in Rust, on cases of their own. The site's are these, and credit comes only
// from these. The two lists must agree on ids, labels and stages, and tests/forge/rejection-sampler.test.ts reads the Rust and fails when they differ.

import { below, rngFor } from '../core'
import type { Rng, Seed } from '../core'
import { DIST_TOTAL, FINE_BAND, LAB_DRAWS, LAB_LEVEL, LAB_SEEDS, SPARSE_BAND, SPEC_BAND, chiSquare, criticalValue, drawCase, drawDist, drawPair, drawToken, draftChain, flatPosition, residualDist, walkCdf } from '../spec'
import type { Dist, PairBand } from '../spec'
import { scripted, shown, wrongReply } from './plan'
import type { CheckPlan, Exchange } from './plan'
import type { PlannedCheck } from './toy'

/** What every distribution of the lab adds up to. */
const TOTAL = DIST_TOTAL

/** The numbers that the oracle and the crate (labs/forge/rejection-sampler/src/lib.rs) both hold: the total, and the most tokens and drafts over the wire. */
export const SAMPLER_LIMITS = { total: TOTAL, maxTokens: 64, maxDrafts: 8 } as const

/** The three bands of packages/sim/spec, one of which a seeded check draws its pair from. */
const BANDS: readonly PairBand[] = [SPEC_BAND, SPARSE_BAND, FINE_BAND]

/** The commands of one batch of an enumeration. A batch is one message to the worker, and the budget of a check is spent between them. */
export const ENUMERATION_BATCH = 4096

/** A list of numbers on the wire. */
const list = (items: readonly number[]): string => items.join(',')

/** `chain …` for a chain of distributions. */
const chainCommand = (p: readonly Dist[], q: readonly Dist[]): string => `chain ${p.map((d) => list(d.weights)).join('|')} ${q.map((d) => list(d.weights)).join('|')}`

const say = (send: string, expect: string, note?: string): Exchange => (note === undefined ? { send, expect } : { send, expect, note })

/* ---------------------------------------------------------------------------------------------------------------------------------- */
/* Plans built from parts                                                                                                              */
/* ---------------------------------------------------------------------------------------------------------------------------------- */

/** A run of commands that is judged as a whole, once every reply is in: an enumeration of coins or of draws. */
interface Group {
  commands: readonly string[]
  /** What is wrong with the replies to all of the commands, as a sentence, or null. */
  verdict(replies: readonly string[]): string | null
}

/** Groups in order, each sent in batches of at most `width` commands and judged when its last batch is in. */
function grouped(groups: readonly Group[], passed: string, width: number = ENUMERATION_BATCH): CheckPlan {
  let at = 0
  let sent = 0
  let last = 0
  let collected: string[] = []
  return {
    next() {
      if (at >= groups.length) return null
      const batch = groups[at].commands.slice(sent, sent + width)
      last = batch.length
      sent += last
      return batch
    },
    judge(replies) {
      if (replies.length !== last) return `the module answered ${replies.length} of the ${last} commands sent`
      for (const reply of replies) collected.push(reply)
      if (sent < groups[at].commands.length) return null
      const verdict = groups[at].verdict(collected)
      collected = []
      sent = 0
      at += 1
      return verdict
    },
    passed: () => passed,
  }
}

/** A group of one command that must answer `ok`: the setup of a list or a chain. */
const setup = (command: string): Group => ({
  commands: [command],
  verdict: (replies) => (replies[0] === 'ok' ? null : wrongReply(command, 'ok', replies[0])),
})

/* ---------------------------------------------------------------------------------------------------------------------------------- */
/* Seeded cases                                                                                                                        */
/* ---------------------------------------------------------------------------------------------------------------------------------- */

const caseRng = (seed: Seed, salt: string): Rng => rngFor(seed, `forge/rejection-sampler/${salt}`)

/** One of the three bands, by the next draw. */
const bandOf = (rng: Rng): PairBand => BANDS[below(rng, BANDS.length)]

/** Six tokens in whole 1/64ths of the total, none of them 0: a draw of `drawDist` that has no empty dish. */
function positiveDist(rng: Rng): Dist {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const d = drawDist(rng, 6, 1024)
    if (d.weights.every((w) => w > 0)) return d
  }
  throw new Error('no six-token distribution without an empty dish after 1000 draws')
}

/** The index of the smallest weight, and of the smallest of the others (the lowest index on a tie). */
function twoSmallest(d: Dist): [number, number] {
  const order = Array.from(d.weights.keys()).sort((a, b) => d.weights[a] - d.weights[b] || a - b)
  return [order[0], order[1]]
}

/** A target for which the plate x is sent back for sure and t is the one dish that replaces it: q with all of x's weight moved to t. */
function sureReject(q: Dist, x: number, t: number): Dist {
  const weights = [...q.weights]
  weights[t] += weights[x]
  weights[x] = 0
  return { weights, total: q.total }
}

/** The one-dish distribution with all of the weight on `token`. */
const only = (token: number, size: number): Dist => ({ weights: Array.from({ length: size }, (_, i) => (i === token ? TOTAL : 0)), total: TOTAL })

/* ---------------------------------------------------------------------------------------------------------------------------------- */
/* accept                                                                                                                              */
/* ---------------------------------------------------------------------------------------------------------------------------------- */

/** Plates that p and q give, by hand, and what is special about each. */
const HAND_PLATES: readonly (readonly [number, number, string])[] = [
  [3, 5, 'p is less than q, so p of the q coins keep the plate'],
  [0, 5, 'p rules the dish out, so no coin keeps it, not even the coin 0'],
  [5, 5, 'p equals q, so every coin keeps the plate'],
  [9, 5, 'p is bigger than q, so every coin keeps the plate'],
  [1, 1, 'one coin, and it keeps the plate'],
  [0, 1, 'one coin, and it does not'],
]

/** All the coins of a plate with weights px and qx through `accept`: exactly min(px, qx) of them must keep it. */
function keepGroup(px: number, qx: number, why: string): Group {
  const commands = Array.from({ length: qx }, (_, u) => `accept ${px} ${qx} ${u}`)
  return {
    commands,
    verdict(replies) {
      let kept = 0
      for (let u = 0; u < replies.length; u++) {
        if (replies[u] === 'yes') kept += 1
        else if (replies[u] !== 'no') return `${commands[u]} should answer "yes" or "no", and the module answered ${shown(replies[u])}`
      }
      const want = Math.min(px, qx)
      if (kept === want) return null
      // The module's rule against the course's `u < p`: the first coin where they part, for the learner to look at.
      const first = replies.findIndex((reply, u) => (reply === 'yes') !== u < px)
      const where = first < 0 ? '' : ` The first coin where it parts from u < p is u = ${first}, which it ${replies[first] === 'yes' ? 'kept' : 'sent back'}.`
      return `accept(${px}, ${qx}, u) kept ${kept} of the ${qx} coins u in 0..${qx}, and exactly min(p, q) = ${want} should: ${why}.${where}`
    },
  }
}

type Kind = 'zero' | 'below' | 'equal' | 'above'
const KINDS: readonly Kind[] = ['zero', 'below', 'equal', 'above']
const KIND_WORDS: Record<Kind, string> = {
  zero: 'p rules the dish out, so no coin keeps the plate',
  below: 'p is less than q, so p of the q coins keep the plate',
  equal: 'p equals q, so every coin keeps the plate',
  above: 'p is bigger than q, so every coin keeps the plate',
}
const kindOf = (px: number, qx: number): Kind => (px === 0 ? 'zero' : px < qx ? 'below' : px === qx ? 'equal' : 'above')

/** For each kind of plate that the pair has, the dish with the fewest coins, so that all four kinds are tried and few commands are sent. */
export function acceptProbes(p: Dist, q: Dist): number[] {
  const best: (number | undefined)[] = KINDS.map(() => undefined)
  for (let x = 0; x < q.weights.length; x++) {
    if (q.weights[x] === 0) continue
    const k = KINDS.indexOf(kindOf(p.weights[x], q.weights[x]))
    const held = best[k]
    if (held === undefined || q.weights[x] < q.weights[held]) best[k] = x
  }
  return best.flatMap((x) => (x === undefined ? [] : [x]))
}

function acceptPlan(seed: Seed): CheckPlan {
  const rng = caseRng(seed, 'accept')
  const { p, q } = drawPair(rng, bandOf(rng))
  const probes = acceptProbes(p, q)
  const groups = [
    ...HAND_PLATES.map(([px, qx, why]) => keepGroup(px, qx, why)),
    ...probes.map((x) => keepGroup(p.weights[x], q.weights[x], KIND_WORDS[kindOf(p.weights[x], q.weights[x])])),
  ]
  const coins = probes.reduce((sum, x) => sum + q.weights[x], 0)
  return grouped(groups, `every coin of ${HAND_PLATES.length} hand plates and of the ${coins} coins of ${probes.length} plates of a seeded pair: exactly min(p, q) of them keep a plate`)
}

/* ---------------------------------------------------------------------------------------------------------------------------------- */
/* residual                                                                                                                            */
/* ---------------------------------------------------------------------------------------------------------------------------------- */

const HAND_RESIDUALS: readonly (readonly [readonly number[], readonly number[], string])[] = [
  [[5, 3, 0, 8], [2, 6, 0, 8], 'the excess is 3 for the first dish and 0 for every dish where q is as big as p or bigger'],
  [[0, 10], [10, 0], 'the excess of the second dish is all of its weight'],
  [[4, 4], [4, 4], 'p equals q, so there is no excess anywhere'],
]

function residualPlan(seed: Seed): CheckPlan {
  const rng = caseRng(seed, 'residual')
  const exchanges: Exchange[] = HAND_RESIDUALS.map(([p, q, note]) =>
    say(`residual ${list(p)} ${list(q)}`, list(p.map((w, i) => Math.max(0, w - q[i]))), note),
  )
  for (const band of BANDS) {
    const { p, q } = drawPair(rng, band)
    exchanges.push(say(`residual ${list(p.weights)} ${list(q.weights)}`, list(residualDist(p, q).weights), 'the excess is max(0, p − q) for every dish, and never below 0'))
  }
  return scripted(exchanges, `the excess max(0, p − q) of ${HAND_RESIDUALS.length} hand cases and ${BANDS.length} seeded pairs, dish by dish`)
}

/* ---------------------------------------------------------------------------------------------------------------------------------- */
/* pick                                                                                                                                */
/* ---------------------------------------------------------------------------------------------------------------------------------- */

const HAND_LISTS: readonly (readonly number[])[] = [[3, 0, 2], [0, 4], [1, 1, 1, 1], [5], [0, 0, 3, 0]]

/** Every draw in 0..sum(weights) through `pick`: dish i must be picked by exactly weights[i] of them, and a dish of weight 0 by none. */
function pickGroup(weights: readonly number[]): Group {
  const sum = weights.reduce((a, b) => a + b, 0)
  const commands = Array.from({ length: sum }, (_, draw) => `pick ${draw}`)
  const total: Dist = { weights, total: sum }
  return {
    commands,
    verdict(replies) {
      const seen = new Array<number>(weights.length).fill(0)
      for (let draw = 0; draw < replies.length; draw++) {
        const token = /^\d+$/.test(replies[draw]) ? Number(replies[draw]) : -1
        if (token < 0 || token >= weights.length) return `pick ${draw} (the weights ${list(weights)}) should answer a token from 0 to ${weights.length - 1}, and the module answered ${shown(replies[draw])}`
        if (weights[token] === 0) return `pick(${list(weights)}, ${draw}) answered token ${token}, which has weight 0 and can never be picked`
        seen[token] += 1
      }
      for (let token = 0; token < weights.length; token++) {
        if (seen[token] === weights[token]) continue
        const first = replies.findIndex((reply, draw) => Number(reply) !== walkCdf(weights, draw))
        const where = first < 0 ? '' : ` The first draw where it parts from the walk "the first dish whose running total passes the draw" is ${first}: it picked ${replies[first]}, and the walk picks ${walkCdf(total.weights, first)}.`
        return `over the draws 0..${sum}, pick(${list(weights)}, draw) picked token ${token} ${seen[token]} times, and its weight is ${weights[token]}.${where}`
      }
      return null
    },
  }
}

/** A list of 8 weights that adds up to 120, some of them 0: many boundaries, few draws. */
function smallList(rng: Rng): number[] {
  const cuts = Array.from({ length: 7 }, () => below(rng, 121)).sort((a, b) => a - b)
  const weights: number[] = []
  let before = 0
  for (const cut of [...cuts, 120]) {
    weights.push(cut - before)
    before = cut
  }
  return weights
}

/**
 * The seeded pair's residual is enumerated in 1/16ths of its weights (the draws are a sixteenth as many): the walk is the same at any scale,
 * and a run of the check costs the module tens of thousands of commands otherwise. The bonus of the `round` check walks a list that adds up
 * to 65,536 with a draw up to 65,535, which is the top of the range.
 */
const PICK_SCALE = 16

function pickPlan(seed: Seed): CheckPlan {
  const rng = caseRng(seed, 'pick')
  const { p, q } = drawPair(rng, bandOf(rng))
  const residual = residualDist(p, q).weights.map((w) => Math.floor(w / PICK_SCALE))
  const lists = [...HAND_LISTS.map((w) => [...w]), residual, smallList(rng)]
  const groups = lists.flatMap((weights) => [setup(`weights ${list(weights)}`), pickGroup(weights)])
  const draws = lists.reduce((sum, weights) => sum + weights.reduce((a, b) => a + b, 0), 0)
  return grouped(groups, `every draw of ${lists.length} lists of weights, one of them a seeded residual (${draws} draws): each dish is picked as often as its weight`)
}

/* ---------------------------------------------------------------------------------------------------------------------------------- */
/* round                                                                                                                               */
/* ---------------------------------------------------------------------------------------------------------------------------------- */

/** Rounds sent for each case. A wrong rule that resamples from p or from q still returns the right dish now and then, and 16 times in a row is out of reach. */
export const ROUNDS_PER_CASE = 16

interface RoundCase {
  /** The position whose plate p rules out, which is sent back for sure. null: every plate is kept. */
  sentBack: number | null
  /** The first target is flat: no dish has half of the weight. */
  flat: boolean
  why: string
}

const ROUND_CASES: readonly RoundCase[] = [
  { sentBack: 0, flat: false, why: 'the first plate is sent back for sure, so the round stops there with the dish that replaces it, a dish of the residual' },
  { sentBack: 1, flat: false, why: 'the first plate is kept for sure and the second is sent back for sure, so the round emits the first plate and then the dish that replaces the second' },
  { sentBack: null, flat: false, why: 'every plate is kept for sure, so all of them go out and the bonus follows, picked from p after the last draft' },
  { sentBack: 0, flat: true, why: 'the first plate is sent back for sure, whatever follows it: a round never keeps a dish that p rules out' },
]

/** The drafts in a round-check chain. */
export const ROUND_DRAFTS = 3

/** Draws a distribution that is flat as a target (the weights of `sureReject` must be too, when `flatTarget`). */
function sureRejectChain(rng: Rng, flatTarget: boolean): { q: Dist; p: Dist; x: number; t: number } {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const q = positiveDist(rng)
    const [x, t] = twoSmallest(q)
    const p = sureReject(q, x, t)
    if (!flatTarget || flatPosition(p)) return { q, p, x, t }
  }
  throw new Error('no flat target after 1000 draws')
}

function roundPlan(seed: Seed): CheckPlan {
  const rng = caseRng(seed, 'round')
  const exchanges: Exchange[] = []
  for (const kase of ROUND_CASES) {
    const p: Dist[] = []
    const q: Dist[] = []
    const draft: number[] = []
    let replaced = -1
    for (let i = 0; i < ROUND_DRAFTS; i++) {
      if (kase.sentBack === i) {
        const rejected = sureRejectChain(rng, kase.flat)
        p.push(rejected.p)
        q.push(rejected.q)
        draft.push(rejected.x)
        replaced = rejected.t
      } else if (kase.sentBack === null || i < kase.sentBack || (kase.flat && i === 1)) {
        // Kept for sure: p equals q here.
        const d = positiveDist(rng)
        p.push(d)
        q.push(d)
        draft.push(drawToken(d, rng))
      } else {
        // After the send-back nothing matters: any pair will do.
        const pair = drawPair(rng, SPEC_BAND)
        p.push(pair.p)
        q.push(pair.q)
        draft.push(drawToken(pair.q, rng))
      }
    }
    const bonus = below(rng, 6)
    p.push(only(bonus, 6))
    const want = kase.sentBack === null ? [...draft, bonus] : [...draft.slice(0, kase.sentBack), replaced]
    exchanges.push(say(chainCommand(p, q), 'ok'), say(`seed ${rng()}`, 'ok'))
    for (let k = 0; k < ROUNDS_PER_CASE; k++) exchanges.push(say(`round ${list(draft)}`, list(want), kase.why))
  }
  return scripted(exchanges, `${ROUND_CASES.length} cases of ${ROUNDS_PER_CASE} rounds in which no coin matters: a stop at the first send-back, a stop at the second, a full run with the bonus, and a flat target`)
}

/* ---------------------------------------------------------------------------------------------------------------------------------- */
/* exact                                                                                                                               */
/* ---------------------------------------------------------------------------------------------------------------------------------- */

/** Drafts in the exact check's chain: two, so that a rule that looks at the next plate before it sends one back has a next plate to look at. */
export const EXACT_DRAFTS = 2
/** Rounds in a batch of the exact check. */
const EXACT_BATCH = 2000
/** A statistic under this many times its limit is called close to it in the message [estimated]. */
const CLOSE = 4

/**
 * The chain of the exact check for `seed`: the Verifier's band (six dishes in 1/64ths, α from 0.4 to 0.9, two dishes each way), with a flat
 * first target, so that every wrong rule of the bestiary that is not an accept-step slip differs from the exact one.
 */
export function exactCase(seed: Seed): { p: Dist[]; q: Dist[] } {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const chain = drawCase(attempt === 0 ? seed : caseRng(seed, `exact-case-${attempt}`)(), EXACT_DRAFTS, SPEC_BAND)
    if (flatPosition(chain.p[0])) return chain
  }
  throw new Error('no chain with a flat first target after 1000 draws')
}

/** The seeds of the two tests, and the module's coin seed for each: sub-streams of the check's seed. */
export function exactSeeds(seed: Seed): { test: Seed; coins: number }[] {
  const rng = caseRng(seed, 'exact-seeds')
  return Array.from({ length: LAB_SEEDS }, () => {
    const test = rng()
    return { test, coins: caseRng(test, 'coins')() }
  })
}

/** The words for a statistic over its limit: which dish is furthest from its share of the draws. */
function farthest(counts: readonly number[], p: Dist): string {
  let worst = 0
  let gap = -1
  for (let token = 0; token < counts.length; token++) {
    const want = (LAB_DRAWS * p.weights[token]) / p.total
    const off = Math.abs(counts[token] - want)
    if (off > gap) {
      gap = off
      worst = token
    }
  }
  const want = (LAB_DRAWS * p.weights[worst]) / p.total
  return `The dish furthest from its share is token ${worst}: ${Math.round(want)} of the ${LAB_DRAWS} rounds are expected to emit it first, and ${counts[worst]} did.`
}

/** A statistic to one decimal, and a limit as the table holds it (thousandths). */
const tenths = (x: number): string => (Math.round(x * 10) / 10).toString()
const thousandths = (x: number): string => (Math.round(x * 1000) / 1000).toString()

function exactPlan(seed: Seed): CheckPlan {
  const { p, q } = exactCase(seed)
  const tests = exactSeeds(seed)
  const size = p[0].weights.length
  const stats: string[] = []
  let test = 0
  let issued = 0
  let counts: number[] = []
  let drafts: Rng = () => 0
  /** The drafts of the batch last sent, which the replies must agree with. */
  let sent: number[][] = []
  /** How many commands of the last batch were setup, with the replies they need. */
  let preamble = 0
  return {
    next() {
      if (test >= tests.length) return null
      const batch: string[] = []
      preamble = 0
      if (issued === 0) {
        counts = new Array<number>(size).fill(0)
        drafts = rngFor(tests[test].test, 'spec/draft')
        batch.push(chainCommand(p, q), `seed ${tests[test].coins}`)
        preamble = batch.length
      }
      sent = []
      const end = Math.min(issued + EXACT_BATCH, LAB_DRAWS)
      for (; issued < end; issued++) {
        const draft = draftChain(q, drafts)
        sent.push(draft)
        batch.push(`round ${list(draft)}`)
      }
      return batch
    },
    judge(replies) {
      if (replies.length !== preamble + sent.length) return `the module answered ${replies.length} of the ${preamble + sent.length} commands sent`
      for (let i = 0; i < preamble; i++) {
        if (replies[i] !== 'ok') return wrongReply(i === 0 ? 'chain' : 'seed', 'ok', replies[i])
      }
      for (let i = 0; i < sent.length; i++) {
        const reply = replies[preamble + i]
        const draft = sent[i]
        if (!/^\d+(,\d+)*$/.test(reply)) return `round ${list(draft)} should answer the tokens that go out, such as 3,1,4, and the module answered ${shown(reply)}`
        const tokens = reply.split(',').map(Number)
        if (tokens.length > draft.length + 1) return `round ${list(draft)} emitted ${tokens.length} tokens, and a round of ${draft.length} drafts emits at most ${draft.length + 1}`
        if (tokens.some((token) => token >= size)) return `round ${list(draft)} emitted ${shown(reply)}, and there are only ${size} tokens`
        for (let k = 0; k < tokens.length - 1; k++) {
          if (tokens[k] !== draft[k]) return `round ${list(draft)} emitted ${shown(reply)}: a draft that was kept goes out as it is, and the token at position ${k} is not the draft`
        }
        counts[tokens[0]] += 1
      }
      if (issued < LAB_DRAWS) return null
      // The seed's rounds are in: test them, and go on to the next seed. A token that p rules out is a certain failure, not a statistical one.
      const leaked = counts.findIndex((count, token) => count > 0 && p[0].weights[token] === 0)
      if (leaked >= 0) {
        return `over ${LAB_DRAWS} rounds the first token that goes out was token ${leaked} ${counts[leaked]} times, and p gives it weight 0: a token that p rules out must never go out (seed ${test + 1} of ${tests.length})`
      }
      const { stat, df } = chiSquare(counts, p[0])
      const limit = criticalValue(LAB_LEVEL, df)
      if (stat > limit) {
        // Close to the limit, chance is the likelier cause for an exact sampler: say so, and what to do. A biased one stays over on every seed.
        const chance = stat < CLOSE * limit ? ` This is close to the limit: an exact sampler lands over it about once in 5,000 runs [derived], so if yours is exact, run it on new seeds.` : ''
        return `over ${LAB_DRAWS} rounds the first token that goes out should follow p, and it does not: chi-square ${tenths(stat)} on ${df} degrees of freedom is over the limit ${thousandths(limit)} (α = 1e-4), on seed ${test + 1} of ${tests.length}. ${farthest(counts, p[0])}${chance}`
      }
      stats.push(`${tenths(stat)} on ${df}`)
      test += 1
      issued = 0
      return null
    },
    passed: () => `chi-square ${stats.join(' and ')} degrees of freedom over ${LAB_DRAWS} rounds on each of ${tests.length} seeds, each under its limit at α = 1e-4`,
  }
}

/* ---------------------------------------------------------------------------------------------------------------------------------- */
/* the lab                                                                                                                             */
/* ---------------------------------------------------------------------------------------------------------------------------------- */

/** The five checks of the rejection-sampler lab, in grading order. */
export const REJECTION_SAMPLER_CHECKS: readonly PlannedCheck[] = [
  {
    id: 'accept',
    label: 'keeping a plate keeps exactly min(p, q) of the coins',
    stage: 1,
    seeded: true,
    defaultSeed: 0xa001,
    catches:
      'A rule that keeps the wrong number of the coins: p > q taken as a yes or no with no coin, a comparison that includes the boundary (u <= p, the bug of SGLang PR #35798), or a dish that p rules out kept on the coin 0.',
    plan: acceptPlan,
  },
  {
    id: 'residual',
    label: "re-plating draws on p's excess over q",
    stage: 1,
    seeded: true,
    defaultSeed: 0xa002,
    catches: 'A residual that is not max(0, p − q) for every dish: a subtraction that wraps below 0, the lists the wrong way round, an excess written one place off, or a dish whose excess is lost.',
    plan: residualPlan,
  },
  {
    id: 'pick',
    label: 'a draw picks each dish as often as its weight',
    stage: 2,
    seeded: true,
    defaultSeed: 0xa003,
    catches:
      'A walk over the weights that picks a dish more or less often than its weight: a comparison that is off by one, a dish of weight 0 picked on the draw 0, or the last dish short.',
    plan: pickPlan,
  },
  {
    id: 'round',
    label: 'a run stops at the first send-back, and the chef finishes it',
    stage: 3,
    seeded: true,
    defaultSeed: 0xa004,
    catches:
      'A round that does not stop at the first send-back, re-plates from p or from q and not from the residual, shifts the dish it picks by one, loses the bonus or draws it from the wrong distribution, or keeps a plate that p rules out after looking ahead.',
    plan: roundPlan,
  },
  {
    id: 'exact',
    label: "what goes out is the chef's tasting: chi-square on two seeds",
    stage: 4,
    seeded: true,
    defaultSeed: 0xa005,
    catches:
      'Everything the four above miss: over 20,000 rounds [estimated] on each of two seeds, the first token that goes out must follow p, which a chi-square test checks at α = 1e-4 [estimated].',
    plan: exactPlan,
  },
]

// The knowledge components that a check assesses are in check-kcs.ts, a file that imports nothing, so that the map can read them without this
// oracle. They are exported from here as well.
export { REJECTION_SAMPLER_KCS } from './check-kcs'
