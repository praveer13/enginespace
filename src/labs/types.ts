/*
 * What a graded lab's page is made from: one descriptor per lab of lane L (the laptop's CPU) or lane F (a GPU), the labs that issue
 * challenges and take receipts (src/receipts/labs.ts). The page (GradedLabView.tsx) is the same for all nine of them, and draws the
 * descriptor as REDESIGN 3.9's numbered procedure: download the kit, fetch the inputs, get a challenge, edit the named file, run the
 * grader, bring the receipt back, read the checks, prove it.
 *
 * A descriptor holds facts and the lab's own words, never a verdict. The state of each stage is one of a fixed set (`StageState`), and
 * its words are src/labs/copy.ts's, so no lab can say it was run when it was not. tests/labs/descriptors.test.ts holds every descriptor
 * to the lab list, to the checks that packages/verify/stages.ts gives each stage, and to the tag rule for numbers.
 *
 * Text fields are plain sentences. A run in backticks is set as code (an identifier, a file, a command's name), as the content
 * compiler sets it, and a number inside backticks is an identifier, not a figure that needs a tag.
 */

/** Which file of `public/labs/manifest.json` a step links: the GPU-lane kit, the grader as a wheel, or a forge lab's crate. */
export type KitRef = { kind: 'gpu-kit' } | { kind: 'grader-wheel' } | { kind: 'forge-lab'; lab: string }

/**
 * Where a stage stands for the course itself, one of four and no other:
 *   not-run-weights  built, and the course has not run it on the pinned model weights (a lab of lane L);
 *   not-run-engine   built, and the course has not run it on a real engine (a lab of lane F);
 *   awaiting-bank    a check of it needs the course's reference bank, which is not recorded yet, so no receipt of it can pass;
 *   verified         the course ran it, on the day and at the commit given, and it passed.
 */
export type StageState =
  | { kind: 'not-run-weights' }
  | { kind: 'not-run-engine' }
  | { kind: 'awaiting-bank' }
  | { kind: 'verified'; on: string; commit: string }

/** A line of shell for the learner's terminal. */
export interface LabCommand {
  /** The line, whole, as it is copied. `<token>` stands for a challenge's token where the learner pastes one. */
  line: string
  /** What the terminal shows when it worked, said so the learner can tell. */
  then: string
  /**
   * Where the line comes from: the course's own grader and kit (`course`), or the documents of a pinned project (`pin`). A line of a
   * pin's documents that the course has never run is printed with the tag unverified.
   */
  from: 'course' | 'pin'
  /** The course ran this line, on this day. */
  ran?: string
}

/** One check of a stage, as the receipt's verdict names it. */
export interface LabCheck {
  /** The id the grader writes into `receipt.checks`, or the browser's re-check: packages/verify/stages.ts names each. */
  id: string
  /** What it checks, in the engine's terms. */
  label: string
  /** The mistake it was written to catch. */
  catches: string
  /** `grader`: your grader checks it on your machine and the receipt carries its word. `browser`: this browser checks it again from the receipt. */
  by: 'grader' | 'browser'
  /** It may fail without changing the stage's verdict. */
  optional?: boolean
}

/** One stage of the lab, as its page tells it. The stage's id, number and name are src/receipts/labs.ts's. */
export interface LabStagePage {
  /** `tr0.forward.s2`. */
  id: string
  state: StageState
  /** What the stage asks of the learner's code, in one sentence. */
  asks: string
  /** The command that grades it. Its challenge's token is `<token>`. */
  run: LabCommand
  checks: readonly LabCheck[]
}

/** One thing the lab needs before it starts. */
export interface LabNeed {
  /** `Machine`, `Disk`, `Software`. */
  term: string
  detail: string
}

export interface GradedLab {
  /** `tr0.forward`: a lab of src/receipts/labs.ts. */
  id: string
  /** What the learner builds, in the engine's words: the page's heading. A published lab's is its `labName`, so the tab and the served document agree. */
  title: string
  /** What the lab builds, in two sentences at most. */
  builds: string
  needs: readonly LabNeed[]
  /** The files to download, in the order they are used. */
  kit: readonly KitRef[]
  /** The folder the kit unzips to, where every command runs. */
  folder: string
  /** The commands that install the lab's environment and fetch its pinned inputs, in order. */
  inputs: readonly LabCommand[]
  /** The one file the learner edits, from the kit's folder, and what to leave alone. */
  edit: { file: string; note: string }
  stages: readonly LabStagePage[]
  /**
   * The questions about the learner's own receipt. `asks` says what they ask of this lab's run, in one sentence; until `open`, the last step
   * says they are not published yet.
   */
  prove: { open: boolean; asks: string }
}
