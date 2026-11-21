/*
 * The grader builds this site has published (ARCHITECTURE §8.5 rule 5, §9.3; ASSESSMENT §5.5), which a receipt's grader is compared with. A receipt
 * whose `grader.version` is not on this list, or whose `grader.sourceSha256` is not the hash listed for that version, is `gpu-unverified` with
 * the reason shown. A§16: "a receipt from an unknown grader build earns no credit".
 *
 * The list is the site's own and is compiled into it: a worker fetches nothing (A§12), and a list that the page could fetch is a list that the
 * page's host could change under a build. A build is published when its wheel is packed into public/labs/ with its SHA-256, and `bun scripts/pack-kit.ts`
 * (W2-T10) writes the entry below from the source hash of the packed package (labs/grader/src/enginespace_grader/identity.py), so that the list and
 * the wheel cannot part: tests/grader/pack-kit.test.ts and labs/grader/tests/test_published.py compare them with the wheel and with identity.py. Do not
 * edit the list by hand. Before the owner publishes the course, packing again replaces the entry of the same version; once it is published, a change
 * to the grader's package needs a new `version` and the old entry stays.
 *
 * An entry is `{ version, sourceSha256 }`: the grader's version string, and the 64 lower-case hex digits of the hash over the files of its import package.
 * Versions are listed once each, in the order they were published.
 */
import type { PublishedGrader } from '@es/verify'

export const PUBLISHED_GRADERS: readonly PublishedGrader[] = [
  { version: '0.1.0', sourceSha256: '7981b39a81d901d9f473e0b8086f8368d7a63dce5097685874bd75bcd05613cf' },
]
