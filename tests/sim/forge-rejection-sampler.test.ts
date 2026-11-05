/*
 * W1-T27: the oracle of the rejection-sampler lab (packages/sim/forge/rejection-sampler.ts), driven through a TypeScript stand-in for the
 * learner's module (rejection-sampler-support.ts), which is built from W1-T26's reference and bestiary. No worker and no Rust: the plans
 * are judged against the wrong samplers of the sim. tests/forge/rejection-sampler-wasm.test.ts runs the same questions at the wasm builds
 * that the crate makes of the same members, through the real host, and the two must agree.
 *
 *   - The reference passes every check on every seed. The four exact checks cannot fail it, and the chi-square fails it with probability
 *     about 2e-4 [derived], which these fixed seeds (a run is a function of the code) do not meet.
 *   - Every member of the bestiary fails the checks that labs/forge/rejection-sampler/bestiary/bestiary.json names for it, on every seed.
 *   - The plans are pure and seeded, bounded in the commands they send, and say what is wrong.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readBestiary } from '../../scripts/labs/bestiary'
import { BESTIARY, REFERENCE, flatPosition } from '../../packages/sim/spec'
import { ENUMERATION_BATCH, EXACT_DRAFTS, REJECTION_SAMPLER_CHECKS, ROUNDS_PER_CASE, ROUND_DRAFTS, acceptProbes, exactCase, exactSeeds } from '../../packages/sim/forge'
import type { CheckPlan } from '../../packages/sim/forge'
import { drive, emulate } from './rejection-sampler-support'
import { SEED_COUNT, seeds } from '../seeds'

setDefaultTimeout(60_000)

const checks = Object.fromEntries(REJECTION_SAMPLER_CHECKS.map((check) => [check.id, check]))
const bestiary = readBestiary(new URL('../../labs/forge/rejection-sampler/', import.meta.url).pathname)
/** A check can take half a minute at the nightly size. */
const TIMEOUT_MS = 30 * 60_000
/**
 * How many seeds each check runs on. `residual` and `round` send a few dozen commands and run on all of them. `accept` and `pick`
 * enumerate every coin and every draw, tens of thousands of commands, and run on a twentieth of them (never fewer than 50), and the
 * chi-square sends 40,000 rounds and runs on a fifth (never fewer than 40) [estimated]. The seeds are the first of the list, and the nightly
 * run's 10,000 scale all three.
 */
const ENUMERATED_SEEDS = Math.max(50, Math.floor(SEED_COUNT / 20))
const EXACT_SEEDS = Math.max(40, Math.floor(SEED_COUNT / 5))
const seedsOf = (id: string): number => (id === 'exact' ? EXACT_SEEDS : id === 'accept' || id === 'pick' ? ENUMERATED_SEEDS : SEED_COUNT)
/** Whether `check` runs on `seed`. */
const runs = (id: string, seed: number): boolean => seed < seedsOf(id)

describe('the reference', () => {
  test(`passes accept and pick on ${ENUMERATED_SEEDS} seeds, the chi-square on ${EXACT_SEEDS}, and residual and round on ${SEED_COUNT}`, () => {
    const failed: string[] = []
    for (const seed of seeds()) {
      for (const check of REJECTION_SAMPLER_CHECKS) {
        if (!runs(check.id, seed)) continue
        const outcome = drive(check.plan(seed), emulate(REFERENCE))
        if (!outcome.ok) failed.push(`${check.id} on seed ${seed}: ${outcome.message}`)
      }
    }
    expect(failed).toEqual([])
  }, TIMEOUT_MS)
})

describe('the bestiary', () => {
  for (const member of bestiary.members) {
    test(`${member.id} fails ${Object.keys(member.fails).join(' and ')}, and passes ${member.passes.join(', ')}, on the seeds of each check`, () => {
      const model = BESTIARY.find((m) => m.id === member.id)
      expect(model, `W1-T26's bestiary has ${member.id}`).toBeDefined()
      const missed: string[] = []
      for (const seed of seeds()) {
        for (const id of Object.keys(member.fails)) {
          if (runs(id, seed) && drive(checks[id].plan(seed), emulate(model)).ok) missed.push(`${id} passed on seed ${seed}`)
        }
        for (const id of member.passes) {
          if (!runs(id, seed)) continue
          const outcome = drive(checks[id].plan(seed), emulate(model))
          if (!outcome.ok) missed.push(`${id} failed on seed ${seed}: ${outcome.message}`)
        }
      }
      expect(missed).toEqual([])
    }, TIMEOUT_MS)
  }
})

/** Every batch of a plan, with the commands as they are sent, answered by the reference. */
function batches(plan: CheckPlan): string[][] {
  const send = emulate(REFERENCE)
  const out: string[][] = []
  for (let batch = plan.next(); batch !== null; batch = plan.next()) {
    out.push([...batch])
    expect(plan.judge(batch.map(send))).toBeNull()
  }
  return out
}

describe('the plans', () => {
  test('are pure and seeded: a seed sends the same commands, and another seed sends others', () => {
    for (const check of REJECTION_SAMPLER_CHECKS) {
      const a = batches(check.plan(11))
      expect(batches(check.plan(11)), check.id).toEqual(a)
      expect(batches(check.plan(12)), check.id).not.toEqual(a)
    }
  })

  test('never send an empty batch or one wider than ENUMERATION_BATCH, and send few enough commands for the 2 s of a check [estimated]', () => {
    // Bun's worker does about a million of these a second here, and a slow phone a fifth of that [estimated]: 100,000 commands cost 0.5 s.
    for (const check of REJECTION_SAMPLER_CHECKS) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const all = batches(check.plan(seed))
        for (const batch of all) {
          expect(batch.length).toBeGreaterThan(0)
          expect(batch.length).toBeLessThanOrEqual(ENUMERATION_BATCH)
        }
        expect(all.flat().length, `${check.id} on seed ${seed}`).toBeLessThanOrEqual(110_000)
      }
    }
  })

  test('exact sends two seeds of 20,000 rounds and nothing else but the chain and the seed of each', () => {
    const all = batches(checks.exact.plan(5)).flat()
    expect(all.filter((c) => c.startsWith('round '))).toHaveLength(40_000)
    expect(all.filter((c) => c.startsWith('chain '))).toHaveLength(2)
    expect(all.filter((c) => c.startsWith('seed '))).toHaveLength(2)
    expect(all).toHaveLength(40_004)
  })

  test('round sends 16 rounds of each of four cases, behind a chain and a seed', () => {
    const all = batches(checks.round.plan(9)).flat()
    expect(all).toHaveLength(4 * (2 + ROUNDS_PER_CASE))
    expect(all.filter((c) => c.startsWith('chain '))).toHaveLength(4)
    for (const command of all.filter((c) => c.startsWith('round '))) expect(command.slice(6).split(',')).toHaveLength(ROUND_DRAFTS)
  })

  test('accept tries six hand plates and then a plate of each kind that the seeded pair has, every coin of each', () => {
    const kind = (px: number, qx: number) => (px === 0 ? 'zero' : px < qx ? 'below' : px === qx ? 'equal' : 'above')
    for (const seed of seeds(0, 25)) {
      const parsed = batches(checks.accept.plan(seed))
        .flat()
        .map((command) => command.split(' ').slice(1).map(Number))
      const plates: number[][] = []
      const off: string[] = []
      for (let at = 0; at < parsed.length; ) {
        const [px, qx] = parsed[at]
        for (let u = 0; u < qx; u++) {
          const [a, b, c] = parsed[at + u] ?? []
          if (a !== px || b !== qx || c !== u) off.push(`${px}/${qx} coin ${u}`)
        }
        plates.push([px, qx])
        at += qx
      }
      expect(off, `seed ${seed}`).toEqual([])
      expect(plates.slice(0, 6)).toEqual([[3, 5], [0, 5], [5, 5], [9, 5], [1, 1], [0, 1]])
      const probes = plates.slice(6).map(([px, qx]) => kind(px, qx))
      expect(new Set(probes).size, `seed ${seed}`).toBe(probes.length)
      expect(probes.length).toBeGreaterThanOrEqual(2)
    }
  })

  test('acceptProbes picks the dish with the fewest coins of each kind', () => {
    const probes = acceptProbes({ weights: [0, 10, 20, 30, 40], total: 100 }, { weights: [30, 30, 20, 10, 10], total: 100 })
    // p = 0 at dish 0 (q = 30), p < q at dish 1 (q = 30), p = q at dish 2 (q = 20), p > q at dishes 3 and 4 (q = 10 each, the lower index).
    expect(probes).toEqual([0, 1, 2, 3])
  })

  test('the exact check\'s chain is the Verifier\'s band with a flat first target, two drafts long, and its two seeds are distinct', () => {
    for (const seed of seeds(0, 300)) {
      const { p, q } = exactCase(seed)
      expect(p).toHaveLength(EXACT_DRAFTS + 1)
      expect(q).toHaveLength(EXACT_DRAFTS)
      expect(flatPosition(p[0])).toBe(true)
      const [a, b] = exactSeeds(seed)
      expect(a.test).not.toBe(b.test)
      expect(a.coins).not.toBe(b.coins)
    }
  })
})

describe('what a failing check says', () => {
  const wrongAccept = (rule: (px: number, qx: number, u: number) => boolean) => {
    const send = emulate({ ...REFERENCE, accept: rule })
    return drive(checks.accept.plan(3), send).message
  }

  test('accept names the plate, the count it kept, the count it should, and the first coin where it parts from u < p', () => {
    const message = wrongAccept((px, _qx, u) => u <= px)
    expect(message).toContain('accept(3, 5, u) kept 4 of the 5 coins u in 0..5')
    expect(message).toContain('exactly min(p, q) = 3 should')
    expect(message).toContain('The first coin where it parts from u < p is u = 3, which it kept.')
  })

  test('accept lets a rule that keeps the top coins instead of the bottom ones pass: it is exact too', () => {
    const outcome = drive(checks.accept.plan(3), emulate({ ...REFERENCE, accept: (px, qx, u) => u >= qx - Math.min(px, qx) }))
    expect(outcome.ok).toBe(true)
  })

  test('accept refuses a reply that is not yes or no, and says which command it answered', () => {
    const outcome = drive(checks.accept.plan(3), () => 'maybe')
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe('accept 3 5 0 should answer "yes" or "no", and the module answered "maybe"')
  })

  test('residual says what it should be, and what the module answered', () => {
    const outcome = drive(checks.residual.plan(3), () => '0,0,0,0')
    expect(outcome.message).toBe('residual 5,3,0,8 2,6,0,8 should answer "3,0,0,0", and the module answered "0,0,0,0": the excess is 3 for the first dish and 0 for every dish where q is as big as p or bigger')
  })

  test('pick lets a walk from the end pass (every dish is still picked by its weight), and fails a dish of weight 0', () => {
    const backwards = (weights: number[], draw: number): number => {
      let running = 0
      for (let token = weights.length - 1; token >= 0; token--) {
        running += weights[token]
        if (draw < running) return token
      }
      return 0
    }
    let weights: number[] = []
    const reversed = (command: string): string => {
      const [verb, a] = command.split(' ')
      if (verb === 'weights') {
        weights = a.split(',').map(Number)
        return 'ok'
      }
      return String(backwards(weights, Number(a)))
    }
    expect(drive(checks.pick.plan(3), reversed).ok).toBe(true)
    const zero = drive(checks.pick.plan(3), (command) => (command.startsWith('weights') ? 'ok' : '1'))
    expect(zero.message).toBe('pick(3,0,2, 0) answered token 1, which has weight 0 and can never be picked')
  })

  test('round names the draft, what it should emit, what the module emitted, and why', () => {
    const outcome = drive(checks.round.plan(3), emulate({ ...REFERENCE, verify: (...args) => ({ ...REFERENCE.verify(...args), tokens: [0] }) }))
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toMatch(/^round \d,\d,\d should answer "[\d,]+", and the module answered "0": the first plate is /)
  })

  test('exact says which seed rejected, the statistic and its limit, and the dish furthest from its share', () => {
    const outcome = drive(checks.exact.plan(3), emulate(BESTIARY.find((m) => m.id === 'resample-from-q')))
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toMatch(/^over 20000 rounds the first token that goes out should follow p, and it does not: chi-square [\d.]+ on 5 degrees of freedom is over the limit 25\.745 \(α = 1e-4\), on seed 1 of 2\. The dish furthest from its share is token \d: \d+ of the 20000 rounds are expected to emit it first, and \d+ did\.$/)
  })

  test('exact says that a statistic just over the limit may be chance, and that one far over it is not said to be', () => {
    // A module whose first tokens follow p to the round, then move `shift` rounds from one dish to another, for the first seed.
    const run = (shift: number) => {
      const plan = checks.exact.plan(3)
      const { p } = exactCase(3)
      const weights = p[0].weights
      const counts = weights.map((w) => Math.floor((20_000 * w) / 65_536))
      counts[counts.indexOf(Math.max(...counts))] += 20_000 - counts.reduce((a, b) => a + b, 0)
      const most = counts.indexOf(Math.max(...counts))
      const other = weights.findIndex((w, i) => i !== most && w > 0)
      counts[most] -= shift
      counts[other] += shift
      const tokens = counts.flatMap((count, token) => new Array<number>(count).fill(token))
      let at = 0
      return drive(plan, (command) => {
        if (!command.startsWith('round')) return 'ok'
        return String(tokens[at++ % tokens.length])
      })
    }
    // Find the least shift that puts the statistic over the limit, and one that puts it far over.
    let near = 0
    while (run(near).ok) near += 1
    const close = run(near).message
    expect(close).toContain('is over the limit 25.745')
    expect(close).toContain('This is close to the limit: an exact sampler lands over it about once in 5,000 runs [derived]')
    expect(run(near * 4).message).not.toContain('This is close to the limit')
  })

  test('exact says so when a token that p rules out goes out: a certain failure, with no statistic', () => {
    // Find a seed whose first target rules a dish out, and answer every round with that dish.
    let zero = -1
    let seed = 0
    for (; zero < 0; seed++) zero = exactCase(seed).p[0].weights.indexOf(0)
    seed -= 1
    const outcome = drive(checks.exact.plan(seed), (command) => (command.startsWith('round') ? String(zero) : 'ok'))
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe(`over 20000 rounds the first token that goes out was token ${zero} 20000 times, and p gives it weight 0: a token that p rules out must never go out (seed 1 of 2)`)
  })

  test('exact refuses a reply that is not tokens, a token that is not there, and a kept draft that is not the draft', () => {
    const reply = (text: string) => drive(checks.exact.plan(3), (command) => (command.startsWith('round') ? text : 'ok'))
    expect(reply('what').message).toMatch(/should answer the tokens that go out, such as 3,1,4, and the module answered "what"/)
    expect(reply('9').message).toMatch(/emitted "9", and there are only 6 tokens/)
    expect(reply('0,0,0,0').message).toMatch(/emitted 4 tokens, and a round of 2 drafts emits at most 3/)
    const wrong = drive(checks.exact.plan(3), (command) => {
      if (!command.startsWith('round')) return 'ok'
      const draft = command.slice(6).split(',').map(Number)
      return `${(draft[0] + 1) % 6},0`
    })
    expect(wrong.message).toMatch(/a draft that was kept goes out as it is, and the token at position 0 is not the draft/)
  })

  test('a module that answers too few replies, or a setup it refuses, is named', () => {
    const plan = checks.exact.plan(3)
    const batch = plan.next() as string[]
    expect(plan.judge(batch.slice(1).map(() => 'ok'))).toBe(`the module answered ${batch.length - 1} of the ${batch.length} commands sent`)
    const again = checks.exact.plan(3)
    again.next()
    expect(again.judge(['err no', 'ok', ...Array(2000).fill('0')])).toBe('chain should answer "ok", and the module answered "err no"')
  })
})
