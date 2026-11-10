/*
 * The words of /receipts that are whole sentences (W2-T06). The page's lead is also the meta description of its served document
 * (scripts/pages/plan.ts), so the tab and the heading do not change when the app takes over, and tests/receipts/copy.test.ts holds the
 * two together, holds every string here to the number gate (rule 7: a number in a sentence carries a tag, and a tag is a Readout), and
 * reads the tracker for the task that the page names as still to come.
 */

import { labForStage, stageOf } from './labs'

/** The page's lead, and the description of its document. */
export const LEAD = 'Issue a challenge for a lab that runs on your own machine, and read the receipts that you hold. Nothing here is sent anywhere.'

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
  /** The ledger could not keep the challenge, so a receipt could not be matched with it. */
  memoryOnly: 'This browser is not keeping your ledger. A challenge issued now is lost when this tab closes, and a receipt could not be matched with it. Export your evidence to keep it.',
  readOnly: 'This browser has handed your ledger to a newer version of the site. Reload the page to get a challenge.',
  refused: 'The ledger would not take the challenge.',
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
  loading: 'Printing your challenges',
  empty: 'No challenge issued yet',
  open: 'open',
  used: 'used',
  expired: 'expired',
  refused: 'The browser would not copy. The token is shown and selected: copy it yourself.',
} as const

export const RECEIPTS = {
  title: 'Your receipts',
  lead: 'The receipts this browser holds, newest first. A receipt is the file that a grader writes after a stage, kept as it wrote it. One that you bring back is listed here, and opens at an address of its own.',
  loading: 'Printing your receipts',
  empty: 'No receipt yet',
  unreadable: 'Not a receipt this build can read',
  unchecked: 'Not checked in this browser yet',
  back: 'All receipts',
  notFound: 'This browser holds no receipt with that hash',
  notFoundNote: 'A receipt is kept on the device that imported it, so its address opens there and nowhere else.',
  loadingDetail: 'Printing the receipt',
} as const

/** The wave a task belongs to: `W2-T07` arrives with `W2` (src/unbuilt/copy.ts has the same one-liner for the pages that are not built). */
export const waveOf = (task: string): string => task.split('-')[0]

/** The part of the page that is still to come (src/unbuilt/copy.ts says the same of a whole page). */
export const COMING = {
  title: 'Bring a receipt back',
  lead: 'Drop the file that your grader writes, and this browser will check it against the challenge you issued here, rule by rule, and list it above.',
  tasks: ['W2-T07'] as readonly string[],
  /** The task that the sentence above is about, whose tracker line says so. */
  about: 'Receipt worker and import',
} as const

export const TAPE = {
  label: 'Challenges and receipts, counted',
  stamp: 'counted in this browser',
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
  walk({ LEAD, ISSUE, TICKET, CHALLENGES, RECEIPTS, COMING, TAPE })
  return out
}
