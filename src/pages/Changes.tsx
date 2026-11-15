import { UNBUILT } from '@/unbuilt/copy'
import { Unbuilt } from '@/unbuilt/Unbuilt'

/*
 * `/changes` (ARCHITECTURE §3.1): the change cards, one for each claim or pin that has moved (ASSESSMENT §8). W3-T06 builds the page,
 * so until then it says what it will hold and which task builds it (src/unbuilt/copy.ts).
 */
export function Component() {
  return <Unbuilt {...UNBUILT.changes} />
}
