/*
 * The forge labs that the site grades (ARCHITECTURE §8.3): for each, the checks with their plans (from packages/sim, where the oracle
 * is), the words the lab's page prints, the one file to edit and the command that builds it.
 */

import { HYBRID_KV_CHECKS, REJECTION_SAMPLER_CHECKS, TOY_CHECKS } from '@es/sim'
import type { HostLab } from './invoke'
import { LAB_TITLES } from './titles'

/**
 * A readout that follows a lab's checks (readout.ts): printed on the lab's page, never graded, never recorded. `slots` is the `hybrid-kv`
 * lab's, TR5a §5: one stream of adapter churn on the learner's module and on a model with fixed adapter slots.
 */
export interface LabReadout {
  kind: 'slots'
  /** The check that has to pass before the readout is played: TR5a §5 prints it "after s5". */
  after: string
}

export interface ForgeLab extends HostLab {
  /** The lab's name on its page (titles.ts). */
  title: string
  /** The engine's own name for what the lab builds, as the crate's README gives it. */
  engineTerm: string
  /** What the lab is, in two sentences, in the engine's words. */
  lead: string
  /** The crate that builds the module, and the file it writes. */
  crate: string
  wasm: string
  /** The one file of the crate that the learner edits, as the crate's header says (its "YOU EDIT" line). tests/forge/labs.test.ts holds the two together. */
  edit: string
  /** The command that builds the module, as `verify:labs` runs it for this crate. */
  build: string
  /** One sentence beside the file to edit, where the crate's own name for the thing is not the engine's (the toy's `rotation`). */
  editNote?: string
  readout?: LabReadout
}

/** The compiler that builds every forge lab, as labs/forge/rust-toolchain.toml pins it (tests/forge/labs.test.ts holds the two together). */
export const TOOLCHAIN = { rust: '1.96.0', target: 'wasm32-unknown-unknown' } as const

/** The file of a crate that is the grading harness: it is read, and never edited. Each crate's header says so. */
export const HARNESS = 'src/lib.rs'

/** The build command of a crate: what `verify:labs` runs (scripts/verify-labs.ts), without the gate's own bookkeeping flags. */
const buildOf = (crate: string): string => `cargo build --release --locked --target ${TOOLCHAIN.target} --package ${crate}`

export const FORGE_LABS: Readonly<Record<string, ForgeLab>> = {
  toy: {
    id: 'toy',
    title: LAB_TITLES.toy,
    engineTerm: 'an LRU free queue',
    lead: 'The practice lab: keep the order in which cached blocks would be evicted. Touching a key you hold moves it to the back, and when the queue is full a new key evicts the one that nobody has touched for the longest.',
    crate: 'toy',
    wasm: 'toy.wasm',
    edit: 'src/rotation.rs',
    editNote: 'The crate calls the free queue the rotation, so the file is rotation.rs and the type you fill in is Rotation.',
    build: buildOf('toy'),
    checks: TOY_CHECKS,
  },
  'rejection-sampler': {
    id: 'rejection-sampler',
    title: LAB_TITLES['rejection-sampler'],
    engineTerm: "speculative decoding's exact verifier, a rejection sampler",
    lead: 'A small draft model proposes a run of tokens and the target model checks them: accept a draft token with probability min(1, p/q), at the first rejection resample from the residual (p − q)⁺ and stop, and if every token is accepted pick one more from p. What comes out must follow the target model exactly.',
    crate: 'rejection-sampler',
    wasm: 'rejection_sampler.wasm',
    edit: 'src/verify.rs',
    build: buildOf('rejection-sampler'),
    checks: REJECTION_SAMPLER_CHECKS,
  },
  'hybrid-kv': {
    id: 'hybrid-kv',
    title: LAB_TITLES['hybrid-kv'],
    engineTerm: "a hybrid KV cache manager over one page pool, with LoRA adapters in the same pool (vLLM's hybrid manager, and S-LoRA's unified paging)",
    lead: "Manage one page pool for a model with several KV cache groups: every group's blocks and every LoRA adapter come from it, and a request is admitted only when its pages and its adapter all fit. Admit and finish requests, evict the least recently used cached block, find the longest prefix that every group still holds, and announce every block stored or removed.",
    crate: 'hybrid-kv',
    wasm: 'hybrid_kv.wasm',
    edit: 'src/manager.rs',
    build: buildOf('hybrid-kv'),
    checks: HYBRID_KV_CHECKS,
    readout: { kind: 'slots', after: 'adapter_pages' },
  },
}
