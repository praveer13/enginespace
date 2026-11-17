/**
 * Rule 5, grader identity (ARCHITECTURE §8.5, ASSESSMENT §5.5): `grader.version` must be one this site build published, and
 * `grader.sourceSha256` must equal that version's published source hash. If not, the receipt is `gpu-unverified`, with the reason shown.
 *
 * The hash is over the files of the grader's import package (labs/grader/src/enginespace_grader/identity.py): each file's path, length and
 * bytes, in the order of the paths. It tells a grader that was patched from one that was published. It holds only against a learner who
 * does not also change the version string and the code that computes the hash, and nothing in a zero-server design stops that learner
 * (A§8.6); the receipt of a grader build the site does not know is simply not credited (A§16).
 *
 * The list of published builds is the site's own and belongs to the page that makes the check: this package takes it as data, and a test
 * can publish a build of its own. A site that has published none knows no grader, and says so.
 */
import type { Receipt } from '@es/schema/receipt'
import { cut } from './format'
import type { RuleResult } from './report'

/** A grader build that this site published: its version, and the hash over its package that the receipts of that build carry. */
export interface PublishedGrader {
  readonly version: string
  readonly sourceSha256: string
  /**
   * Whether the build only writes labelled synthetic fixtures (W2-T08): its traces say they are synthetic, and rule 8's T1 lets them. The site's own
   * list never sets it, because a build that makes synthetic receipts is not one that a learner's receipts come from. The tests publish such a build
   * so that an honest synthetic bundle can pass every rule, and it passes nothing in a site that has not published it.
   */
  readonly synthetic?: boolean
}

const short = (sha: string): string => `${sha.slice(0, 12)}...`

const outcome = (status: 'pass' | 'fail', summary: string, problems: readonly string[] = []): RuleResult => ({ rule: 5, id: 'grader', status, summary, problems })

export function checkGrader(receipt: Receipt, published: readonly PublishedGrader[]): RuleResult {
  const { name, version, sourceSha256 } = receipt.grader
  const build = `${name} ${cut(version, 40)}`
  if (published.length === 0) {
    return outcome('fail', `${build} is not a build this site knows.`, [
      'This site build has published no grader yet, so it knows no build and credits no receipt. The list of published builds arrives with the kit and the grader wheel.',
    ])
  }
  const same = published.find((entry) => entry.version === version)
  if (same === undefined) {
    const known = published.map((entry) => entry.version).join(', ')
    return outcome('fail', `${build} is not a build this site published.`, [`This site published ${known}. A receipt from a build it did not publish earns no credit; run the stage again with the grader from this site's kit.`])
  }
  if (same.sourceSha256 !== sourceSha256) {
    return outcome('fail', `${build} is not the build this site published under that version.`, [
      `The site published version ${cut(version, 40)} with source hash ${short(same.sourceSha256)}, and the receipt says ${short(sourceSha256)}: the grader that made it is not the package that was published, or has been changed.`,
    ])
  }
  return outcome('pass', `${build} is a build this site published, with the source hash it published (${short(sourceSha256)}).`)
}
