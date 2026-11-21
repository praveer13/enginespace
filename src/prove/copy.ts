/*
 * The words of Prove mode (ASSESSMENT §7.1 to §7.3): the request to close the coding agent, why the course asks, what a Prove run changes,
 * and what an attempt was worth. They ask and they explain; they never accuse, because the course cannot see an agent and does not try to,
 * and they put the run itself first: working the level out unaided is what it is for. tests/play/prove.test.ts holds them clear of
 * src/copy/banned.ts.
 */

export const PROVE_COPY = {
  title: (level: string) => `Prove it: ${level}`,
  lead: 'Close your coding agent and any AI chat, then play this level on your own.',
  why: "Working it out unaided is the point of this level: it is what you will bring to an engine's own code. Nothing on this page can tell whether an agent is open, and nothing tries; the course takes your word.",
  listHead: 'In a Prove run',
  list: [
    'Fresh numbers, drawn the moment you start.',
    'The readouts stay hidden until your answer is in. The drawing and State as a table are there as usual.',
    'No undo and no clock: take as long as you need.',
    'A run that misses can be played again at once on fresh numbers, recorded as practice. The next attempt that counts opens 24 hours after the last one that counted.',
  ],
  reading: 'Reading your record of past attempts…',
  counts: 'This attempt counts: a pass is recorded as proved.',
  waitPassed: (when: string) => `You have proved this level. The next attempt that counts opens ${when}; a run before then is recorded as practice.`,
  waitMissed: (when: string) =>
    `Your last attempt that counted did not pass. The next one that counts opens ${when}; a run before then is recorded as practice.`,
  attest: 'My coding agent and any AI chat are closed.',
  start: 'Start the Prove run',
  back: 'Back to practice',
  hidden: 'Readouts are hidden until your answer is in.',
  footCounts: 'Prove run, agent closed. This attempt counts.',
  footPractice: (when: string) => `Prove run, agent closed. Recorded as practice; the next attempt that counts opens ${when}.`,
  leave: 'Leave Prove mode',
  proved: (when: string) => `Proved, with your agent closed. The next attempt that counts opens ${when}.`,
  missed: (when: string) =>
    `This attempt counted and did not pass. Play again now, recorded as practice; the next attempt that counts opens ${when}.`,
  practice: (when: string) => `Recorded as practice. The next attempt that counts opens ${when}.`,
  practiceOpen: 'Recorded as practice. The next attempt counts.',
} as const
