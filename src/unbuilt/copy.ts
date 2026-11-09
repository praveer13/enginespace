/*
 * The words of the pages that are not built yet (W1b-T09): what each will hold, and the task that builds it. The pages are
 * src/pages/Receipts.tsx, Changes.tsx, About.tsx, TraceRoom.tsx and Lab.tsx (for the labs that W2 and W3 build), and
 * src/unbuilt/Unbuilt.tsx draws them. A page that is built takes its words out of here with its stub.
 *
 * Nothing in these words is new. What a page holds is what ARCHITECTURE §3.1 and §8.4 say of it and what its tasks in docs/TRACKER.md
 * ask for, and a lab's one line is what content/course.yaml says the learner hands in. tests/pages/unbuilt.test.ts reads the tracker
 * and the compiled course map, so a task that is renamed, or a lab whose artifact changes, fails there and not in front of a learner.
 * No number is in them that no tag covers (rule 7): a wave or a task is an identifier, and the tests hold the rest to the number gate.
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
  /** The tasks of docs/TRACKER.md that build it, the page's own first. */
  tasks: readonly string[]
  /** The one way on from here, to a page that is built. */
  next: { to: string; label: string }
}

/** The pages with a route of their own. A page's `lead` is the sentence its meta description gives too (scripts/pages/plan.ts), and a test holds the two together. */
export const UNBUILT = {
  /** ARCHITECTURE §3.1 and §8.4; W2-T06 issues the challenge and draws the page, W2-T07 imports the bundle. */
  receipts: {
    title: 'Receipts',
    lead: 'Issue a challenge for a GPU lab, import the receipt that the local grader writes, and read how your browser checked it.',
    heading: 'What it will hold',
    holds: [
      'A challenge for a lab and its stage, as a token to copy.',
      'The receipts you hold, listed, each opening to its detail.',
      'The bundle that your grader wrote, imported here and checked in this browser.',
    ],
    tasks: ['W2-T06', 'W2-T07'],
    next: { to: '/evidence', label: 'Open your evidence' },
  },
  /** ARCHITECTURE §3.1, ASSESSMENT §8; W3-T06. */
  changes: {
    title: 'Changes',
    lead: 'The claims and the pins that have moved, as change cards.',
    heading: 'What it will hold',
    holds: [
      'A card for each claim or pin that moved: the struck line, the new line and its source.',
      'A retrieval item or two on each card, and a way to acknowledge it.',
    ],
    tasks: ['W3-T06'],
    next: { to: '/map', label: 'Open the course map' },
  },
  /** ARCHITECTURE §3.1; W3-T15. The page holds its licences paragraph today (src/pages/About.tsx), and the lead says so. */
  about: {
    title: 'About',
    lead: 'The licences of the third-party code and the typefaces that this site uses.',
    heading: 'Still to come',
    holds: [
      'What each simulated world models and ignores.',
      'The claims and their sources.',
      'The privacy promise.',
      "The licences of the site's own code and content.",
    ],
    tasks: ['W3-T15'],
    next: { to: '/settings', label: 'Open the settings' },
  },
  /** ARCHITECTURE §3.1, GAMES.md §0 (The Tape is `gap-hunt`, D-049); W2-T20. */
  traceRoom: {
    title: 'The Trace Room',
    lead: 'Read engine traces beside the seeded step-loop world, and hunt for the gaps. A trace without a real capture behind it is labelled synthetic.',
    heading: 'What it will hold',
    holds: [
      'The pinned traces and the synthetic ones, each with its card.',
      'The Tape: find the gap, mark the spans and name the cause.',
      'On a phone, the marking is done from a list, and it counts the same.',
    ],
    tasks: ['W2-T20'],
    next: { to: '/play/loop', label: 'Play Service' },
  },
} as const satisfies Record<string, UnbuiltCopy>

/* ------------------------------------------------------------------------------------------------------------------ */
/* The labs that W2 and W3 build                                                                                      */
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
 * host (src/forge/ids.ts). The task that builds each is `LAB_TASKS` in src/content/render/model.ts, which the tests hold to the tracker.
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

/** The wave a task belongs to: `W2-T06` arrives with `W2`. */
export const waveOf = (task: string): string => task.split('-')[0]

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
