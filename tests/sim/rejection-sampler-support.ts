/*
 * Shared by tests/sim/forge-rejection-sampler.test.ts (W1-T27). Not a test: bun test collects only *.test.ts.
 *
 * A learner's module, as the oracle sees it, is a function from a command to a reply (the wire of labs/forge/rejection-sampler). This file
 * writes that function in TypeScript from a member of packages/sim/spec's bestiary, so that the oracle's plans are tested against the
 * wrong samplers of W1-T26 without a Rust toolchain and without a worker. The wasm builds of the same members are tested through the
 * real host in tests/forge/rejection-sampler-wasm.test.ts, and the two must agree on which check catches which member.
 */
import { splitmix32u } from '../../packages/sim/core'
import type { Rng } from '../../packages/sim/core'
import { REFERENCE, residualDist, walkCdf } from '../../packages/sim/spec'
import type { Dist, Member } from '../../packages/sim/spec'
import type { CheckPlan } from '../../packages/sim/forge'

/** A module: one command in, one line out. */
export type Send = (command: string) => string

const numbers = (text: string): number[] => text.split(',').map(Number)
const distOf = (text: string): Dist => {
  const weights = numbers(text)
  return { weights, total: weights.reduce((a, b) => a + b, 0) }
}

/**
 * The module that `member` stands for. `inclusive` makes the walk of `pick` the boundary-inclusive one, as bestiary/boundary-inclusive.rs
 * writes it (the crate's `pick` is one function, used by the residual and by the bonus alike).
 */
export function emulate(member: Member = REFERENCE, options: { inclusive?: boolean } = {}): Send {
  const inclusive = options.inclusive ?? member.id === 'boundary-inclusive'
  let weights: number[] = []
  let p: Dist[] = []
  let q: Dist[] = []
  let coins: Rng = splitmix32u(0)
  return (command) => {
    const [verb, a, b, c] = command.split(' ')
    switch (verb) {
      case 'accept':
        return member.accept(Number(a), Number(b), Number(c)) ? 'yes' : 'no'
      case 'residual': {
        const excess = residualDist(distOf(a), distOf(b)).weights
        // bestiary/residual-off-by-one.rs writes the excess of dish x at x + 1, wrapping: the sim's member picks the dish after the right one.
        return (member.id === 'residual-off-by-one' ? [excess[excess.length - 1], ...excess.slice(0, -1)] : excess).join(',')
      }
      case 'weights':
        weights = numbers(a)
        return 'ok'
      case 'pick':
        return String(walkCdf(weights, Number(a), inclusive))
      case 'chain':
        p = a.split('|').map(distOf)
        q = b.split('|').map(distOf)
        return 'ok'
      case 'seed':
        coins = splitmix32u(Number(a))
        return 'ok'
      case 'round':
        try {
          return member.verify(p, q, numbers(a), coins).tokens.join(',')
        } catch (e) {
          // The model's rules throw where the crate's would pick from an empty residual: a reply that no right module gives.
          return `err ${e instanceof Error ? e.message : String(e)}`
        }
      default:
        return `err unknown command '${command}'`
    }
  }
}

export interface Outcome {
  ok: boolean
  /** The check's own words: what a pass established, or what went wrong. */
  message: string
  /** Commands sent. */
  commands: number
}

/** Drives a plan against a module to its end, as src/forge/invoke.ts does: the first wrong reply ends the check. */
export function drive(plan: CheckPlan, send: Send): Outcome {
  let commands = 0
  for (let batch = plan.next(); batch !== null; batch = plan.next()) {
    const replies = batch.map(send)
    commands += batch.length
    const wrong = plan.judge(replies)
    if (wrong !== null) return { ok: false, message: wrong, commands }
  }
  return { ok: true, message: plan.passed(), commands }
}
