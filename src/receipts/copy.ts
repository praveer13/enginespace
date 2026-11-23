/*
 * The words of /receipts that are whole sentences (W2-T06, W2-T07). The page's lead is also the meta description of its served document
 * (scripts/pages/plan.ts), so the tab and the heading do not change when the app takes over, and tests/receipts/copy.test.ts holds the
 * two together and holds every string here to the number gate (rule 7: a number in a sentence carries a tag, and a tag is a Readout).
 */

import { labForStage, stageOf } from './labs'

/** The page's lead, and the description of its document. */
export const LEAD =
  'Get a challenge for a lab that runs on your own machine, bring back the receipt file that your grader writes and see how this browser checked it, and read the results you hold. Nothing here is sent anywhere.'

export const ISSUE = {
  title: 'Get a challenge',
  lead: 'A challenge is a one-use token. Your grader draws every seed of the run from it, so the run cannot be prepared before the token exists.',
  labLabel: 'Lab',
  labPlaceholder: 'Choose a lab',
  labMissing: 'Choose a lab first.',
  stageLabel: 'Stage',
  stagePlaceholder: 'Choose a stage',
  stageMissing: 'Choose a stage first.',
  action: 'Get a challenge',
  where: { L: "It runs on your laptop's CPU.", F: 'It needs a GPU, yours or a rented one.' },
  optional: 'The module does not need it.',
  /** The record could not keep the challenge, so a receipt file could not be matched with it. */
  memoryOnly: 'This browser is not keeping your record. A challenge issued now is lost when this tab closes, and its receipt file could not be matched with it. Export your progress to keep it.',
  readOnly: 'This browser has handed your record to a newer version of the site. Reload the page to get a challenge.',
  refused: 'Your record would not take the challenge.',
} as const

export const TICKET = {
  tokenLabel: 'The token',
  run: "Run it on your machine, with the grader from the lab's kit:",
  copyToken: 'Copy the token',
  copyCommand: 'Copy the command',
  labPage: "The lab's page",
  copiedToken: 'Copied the token.',
  copiedCommand: 'Copied the command.',
  refused: 'The browser would not copy. The text is selected: copy it yourself.',
  notSaved: 'Your browser has not confirmed that it kept this challenge. It will try again.',
} as const

export const CHALLENGES = {
  title: 'Your challenges',
  loading: 'Loading your challenges',
  empty: 'No challenge issued yet',
  open: 'open',
  used: 'used',
  expired: 'expired',
  refused: 'The browser would not copy. The token is shown and selected: copy it yourself.',
} as const

export const RECEIPTS = {
  title: 'Your results',
  lead: 'The results this browser holds, newest first. Each is the receipt file that a grader writes after a stage, kept as it wrote it. One that you bring back is listed here, and opens at an address of its own.',
  loading: 'Loading your results',
  empty: 'No result yet',
  unreadable: 'Not a receipt this build can read',
  unchecked: 'Not checked in this browser yet',
  back: 'All results',
  notFound: 'This browser holds no result with that hash',
  notFoundNote: 'A result is kept on the device that imported it, so its address opens there and nowhere else.',
  loadingDetail: 'Loading the result',
  defend: 'Defend your receipt',
  defendLoading: 'Loading the questions about your run.',
} as const

/** Bringing a receipt back (src/receipts/ImportPanel.tsx): the slip that takes the grader's file, and what it says of each outcome. */
export const IMPORT = {
  title: 'Bring a result back',
  lead: 'Drop the receipt file that your grader writes after a stage. This browser reads it here, checks it against the challenge you issued, and keeps it with how it was checked. The file never leaves the tab.',
  head: 'Receipt file',
  meta: '.es.json.gz',
  drop: 'Drop a receipt file',
  dropNote: 'Your grader writes it to its receipts folder as one file that ends in .es.json.gz. Drop it here, or choose it.',
  inputLabel: 'The receipt file',
  choose: 'Choose a file',
  chooseAnother: 'Choose another file',
  waiting: 'Your record is opening, and the page takes a file as soon as it has.',
  readOnly: 'This browser has handed your record to a newer version of the site. Reload the page to bring a result back.',
  memoryOnly: 'This browser is not keeping your record. A result kept now is lost when this tab closes. Export your progress to keep it.',
  capsLabel: 'The site reads at most',
  capsFile: 'as a file',
  capsInside: 'inside it',
  checking: 'Checking the receipt',
  rulesLabel: 'How this browser checked the file',
  refusedHead: 'Not kept',
  refusedTitle: 'Not a receipt this browser can read',
  refusedNote: 'Nothing was kept and no challenge was spent. Mend the file, or run the stage again, and bring it back.',
  failedTitle: 'Not kept',
  failedNote: 'Nothing was kept. The file may be a good one: bring it back to try again.',
  keptHead: 'Kept',
  keptTitle: 'Kept in your record',
  recheckTitle: 'Checked again',
  keptNote: 'The result is in your record with this check beside it.',
  recheckNote: 'This result was in your record already. This check is added to it, and nothing else is written.',
  open: 'Open the result',
  clear: 'Clear this',
} as const

/** The words of each rule's result: a mark is never a colour alone. */
export const RULE_WORDS = { pass: 'pass', fail: 'fail', skipped: 'not run' } as const

/** What a verdict is called on a line of the list of receipts. A receipt with no report is `unchecked`. */
export const VERDICT_WORDS = { unchecked: 'unchecked', 'gpu-unverified': 'not counted', assisted: 'passed in practice', practice: 'counted as practice', 'gpu-verified': 'passed' } as const

/** The "How this browser checked it" part of a receipt's page. */
export const REPORTS = {
  title: 'How this browser checked it',
  none: 'Not checked in this browser yet. Bring the grader\'s receipt file back on this page, and the rules it was checked by will be listed here.',
  unreadable: 'A check that a version of the site wrote, and this one cannot read.',
  verdict: 'What it is worth now',
  /** The list of the verdict's checks under the reasons: each is a word, the bound it was held to, and who checked it. */
  checks: 'Check by check',
  checksLabel: 'The verdict, check by check',
  recheckedHere: 're-checked here',
  /** `attested by grader 0.1.0`: the version follows. */
  attestedBy: 'attested by grader',
} as const

/** The words of a check's result in the verdict: a mark is never a colour alone. */
export const CHECK_WORDS = { pass: 'pass', fail: 'fail', attested: 'attested' } as const

export const TAPE = {
  label: 'Challenges and results, counted',
  empty: 'Nothing issued yet',
} as const

/** What the page says of a stage when it is chosen: where it runs, and that the module can do without it. A stage that no lab lists gets nothing. */
export function stageNote(stage: string): string {
  const entry = stageOf(stage)
  const lab = labForStage(stage)
  if (entry === undefined || lab === undefined) return ''
  return [ISSUE.where[lab.lane], entry.optional ? ISSUE.optional : ''].filter(Boolean).join(' ')
}

/** Every string above, for the tests. */
export function receiptsCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk({ LEAD, ISSUE, TICKET, CHALLENGES, RECEIPTS, IMPORT, RULE_WORDS, VERDICT_WORDS, REPORTS, CHECK_WORDS, TAPE })
  return out
}
