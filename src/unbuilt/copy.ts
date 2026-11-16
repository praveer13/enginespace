/*
 * The words of the pages that are not published yet: what each will hold. The pages are src/pages/TraceRoom.tsx and Lab.tsx (for the labs not published yet), and src/unbuilt/Unbuilt.tsx draws them. A page that is published takes
 * its words out of here: /receipts did, and has its words in src/receipts/copy.ts.
 *
 * The words are the engine's own and say nothing of how the site is built: no task, no wave. A learner who follows a link here reads that
 * the page is not published yet, what it will hold, and is handed back to Continue. What a page holds is what ARCHITECTURE §3.1 and
 * §8.4 say of it, and a lab's one line is what content/course.yaml says the learner hands in. tests/pages/unbuilt.test.ts reads the
 * compiled course map, so a lab whose artifact changes fails there and not in front of a learner. No number is in them that no tag
 * covers (rule 7).
 */

export interface UnbuiltCopy {
  /** The page's `<h1>`, which is the heading of its served document as well. */
  title: string
  /** What the page is for, or for a page that holds something today, what it holds. */
  lead: string
  /** The headline of the ticket that lists what is missing. */
  heading: string
  /** What the page will hold, a line each. */
  holds: readonly string[]
}

/** The pages with a route of their own. A page's `lead` is the sentence its meta description gives too (scripts/pages/plan.ts), and a test holds the two together. */
export const UNBUILT = {
  traceRoom: {
    title: 'The Trace Room',
    lead: 'Read engine traces beside the seeded step-loop world, and hunt for the gaps. A trace without a real capture behind it is labelled synthetic.',
    heading: 'What it will hold',
    holds: [
      'The pinned traces and the synthetic ones, each with its card.',
      'Trace attribution: find the gap, mark the spans and name the cause.',
      'On a phone, the marking is done from a list, and it counts the same.',
    ],
  },
} as const satisfies Record<string, UnbuiltCopy>

/* ------------------------------------------------------------------------------------------------------------------ */
/* The labs not published yet                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The lanes of work (ARCHITECTURE §8.1): `B` is the browser, `L` the laptop's CPU and `F` a GPU. */
export type LabLane = 'B' | 'L' | 'F'

export interface LabStub {
  /** The module whose page names the lab (content/course.yaml). */
  module: string
  lane: LabLane
  /** What the learner hands in, as course.yaml words it. */
  handIn: string
}

/**
 * The ten labs with no page yet: every lab of the compiler's list (scripts/content/directives.ts) but the forge labs that have a
 * host (src/forge/ids.ts).
 */
export const LAB_STUBS: Readonly<Record<string, LabStub>> = {
  'kv-publisher': { module: 'tr5b', lane: 'B', handIn: 'Publisher conformance tests on your Rust module' },
  'tr0.forward': { module: 'tr0', lane: 'L', handIn: "A Qwen3 forward pass on the laptop's CPU that matches Hugging Face, graded by the local grader" },
  'tr1.fork': { module: 'tr1', lane: 'F', handIn: 'A nano-vllm fork that emits a span for every stage of your own map' },
  'tr3.profile': { module: 'tr3', lane: 'F', handIn: 'A profile of the pinned vLLM on your GPU, with an attribution report and two toggled pairs' },
  'tr4.sweep': { module: 'tr4', lane: 'F', handIn: 'Backend sweeps on your GPU: correctness against a full-precision reference, and timings with intervals' },
  'tr5b.connector': { module: 'tr5b', lane: 'F', handIn: 'A toy connector in the pinned vLLM that round-trips KV byte for byte' },
  'tr6.proposer': { module: 'tr6', lane: 'F', handIn: 'A proposer in the pinned vLLM' },
  'tr7.reproduce': { module: 'tr7', lane: 'F', handIn: 'A reproduction with a receipt, and an issue draft generated from it' },
  'tr8.replay': { module: 'tr8', lane: 'F', handIn: 'A timestamp-faithful BurstGPT replay against the pinned vLLM, re-checked from raw records' },
  'capstone.pair': { module: 'capstone', lane: 'F', handIn: 'Paired runs under one challenge, and a structured explanation checked against the evidence' },
}

/**
 * What a lab's page will hold (ARCHITECTURE §3.1): a forge lab takes a dropped `.wasm` and shows per-check results, and a GPU or local
 * lab offers its kit, a challenge and the receipt import (§8.4).
 */
export const LAB_HOLDS = {
  forge: [
    'The kit to download: the crate that you build to a .wasm.',
    'A slip to drop your .wasm on.',
    'A result for each check, with the seed it ran on.',
  ],
  graded: [
    'The kit to download.',
    'A challenge for each stage, as a token to copy.',
    'The receipt that your grader writes, imported here and checked in this browser.',
  ],
} as const

/** Every string above that holds words, for the tests. */
export function unbuiltCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk({ UNBUILT, LAB_STUBS, LAB_HOLDS })
  return out
}
