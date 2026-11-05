/*
 * The forge labs that the site grades (ARCHITECTURE §8.3): for each, the checks with their plans (from packages/sim, where the oracle
 * is) and the words the lab's page prints. W1-T22, W1-T27 and W2-T29 add `hybrid-kv`, `rejection-sampler` and `kv-publisher` here, and
 * to ids.ts.
 */

import { REJECTION_SAMPLER_CHECKS, TOY_CHECKS } from '@es/sim'
import type { HostLab } from './invoke'

export interface ForgeLab extends HostLab {
  /** The lab's name on its page. */
  title: string
  /** The engine's word for the lab's subject, beside the kitchen's (GAMES.md §2.6, rule 2). */
  engineTerm: string
  /** What the lab is, in two sentences. */
  lead: string
  /** The crate that builds the module, and the file it writes. */
  crate: string
  wasm: string
}

export const FORGE_LABS: Readonly<Record<string, ForgeLab>> = {
  toy: {
    id: 'toy',
    title: 'The Rotation',
    engineTerm: 'an LRU free queue',
    lead: "The forge's practice lab. Keep a rotation of pans: touch a pan to keep it, and when the reach-in is full the next new pan dumps the one that nobody has touched for the longest.",
    crate: 'toy',
    wasm: 'toy.wasm',
    checks: TOY_CHECKS,
  },
  'rejection-sampler': {
    id: 'rejection-sampler',
    title: 'Keep or Re-plate',
    engineTerm: "speculative decoding's exact verifier, a rejection sampler",
    lead: "The commis plates a run of courses ahead of you, and you are the chef at the pass: keep a plate with probability min(1, p/q), and at the first one you send back, re-plate from the dishes the commis under-plates, (p − q)⁺. If every plate is kept you plate one more course yourself, and what goes out must be exactly what you would have plated alone.",
    crate: 'rejection-sampler',
    wasm: 'rejection_sampler.wasm',
    checks: REJECTION_SAMPLER_CHECKS,
  },
}
