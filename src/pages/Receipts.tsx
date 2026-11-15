import { UNBUILT } from '@/unbuilt/copy'
import { Unbuilt } from '@/unbuilt/Unbuilt'

/*
 * `/receipts` (ARCHITECTURE §3.1, §8.4): the page for the labs that run on the learner's own machine. A challenge is issued here, the
 * grader's bundle is imported here, and the receipts are listed here. W2-T06 builds the page and the challenge, and W2-T07 the import,
 * so until then it says what it will hold and which tasks build it (src/unbuilt/copy.ts).
 */
export function Component() {
  return <Unbuilt {...UNBUILT.receipts} />
}
