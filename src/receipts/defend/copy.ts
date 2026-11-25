/*
 * The words of "Defend your receipt" (ASSESSMENT §7.2, §7.3). The step is the learner showing that they understand their own run: they built it, so they can
 * say what it did, and the questions are about their own code's tensors. The words ask and explain, and never doubt that the run was theirs. The request to
 * close the agent and the attestation are Prove mode's own (src/prove/copy.ts), so the two read as one practice. A question set's own words are its
 * own (sets.ts). tests/receipts/defend.test.ts holds every line clear of src/copy/banned.ts and of task and decision ids.
 */
import { PROVE_COPY } from '@/prove/copy'

export const DEFEND_COPY = {
  title: 'Defend your receipt',
  why: 'You built this run, so you can say what it did. Close your coding agent and any AI chat, and answer from what you know of your code. Nothing here can tell whether an agent is open, and nothing tries: the course takes your word.',
  attest: PROVE_COPY.attest,
  reading: PROVE_COPY.reading,
  counts: 'This attempt counts: every answer right is recorded as proved.',
  waitPassed: (when: string) => `You have proved this lab. The next attempt that counts opens ${when}; an attempt before then is recorded as practice.`,
  waitMissed: (when: string) => `Your last attempt that counted missed a question. The next one that counts opens ${when}; an attempt before then is recorded as practice.`,
  synthetic: 'This receipt is a synthetic one, which the course\'s tests made and no run of yours did. The questions work as they do on yours, as practice, and nothing is recorded.',
  unverified: 'This browser has not verified this receipt, so the questions are practice and nothing is recorded. On a receipt of yours that passes its checks, they count.',
  fileHeld: (name: string) => `The questions come from ${name}, the file you brought this receipt back in.`,
  fileNeeded: 'The questions come from this receipt\'s file, which this browser does not keep. Choose it again: it is read in this tab, and nothing of it leaves.',
  fileChoose: 'Choose the receipt file',
  fileChooseAnother: 'Choose another file',
  fileInput: 'The receipt file, ending in .es.json.gz',
  fileReading: 'Reading the file.',
  fileUnread: (why: string) => `That file cannot be read as a receipt: ${why}`,
  fileOther: 'That file holds another receipt. Choose the file this one came back in: it is in the `receipts` folder of your kit, and its name starts with the stage.',
  fileNoArtifact: 'That file is this receipt, and the record the questions come from is not in it.',
  fileEdited: 'The record the questions come from has changed since the run: it is not the one the receipt lists. Choose the file as the grader wrote it.',
  start: 'Start the questions',
  questionsLabel: 'Questions about your run',
  answerLabel: (n: number) => `Answer ${n}`,
  hint: 'Whole numbers separated by commas, such as 2, 3, 4.',
  empty: 'No answer yet.',
  unreadable: 'That is not a list of whole numbers.',
  check: 'Check my answers',
  resultTitle: (right: number, total: number) => `${right} of ${total} right`,
  yours: 'Your answer',
  recorded: 'Your run recorded',
  right: 'Right',
  wrong: 'Not what your run recorded',
  proved: (when: string) => `Proved, with your agent closed. The next attempt that counts opens ${when}.`,
  missed: (when: string) => `This attempt counted, and a question was missed. Try new questions now, recorded as practice; the next attempt that counts opens ${when}.`,
  practice: (when: string) => `Recorded as practice. The next attempt that counts opens ${when}.`,
  practiceOpen: 'Recorded as practice. The next attempt counts.',
  practiceNothing: 'Practice: nothing was recorded, because this receipt is not one this browser verified.',
  practiceSynthetic: 'Practice: nothing was recorded, because this receipt is a synthetic one.',
  notRecorded: (why: string) => `This attempt could not be recorded: ${why}`,
  again: 'Try new questions',
} as const
