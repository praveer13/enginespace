/*
 * The grader builds this site has published (ARCHITECTURE §8.5 rule 5, §9.3; ASSESSMENT §5.5), which a receipt's grader is compared with. A receipt
 * whose `grader.version` is not on this list, or whose `grader.sourceSha256` is not the hash listed for that version, is `gpu-unverified` with
 * the reason shown. A§16: "a receipt from an unknown grader build earns no credit".
 *
 * The list is the site's own and is compiled into it: a worker fetches nothing (A§12), and a list that the page could fetch is a list that the
 * page's host could change under a build. It is empty today, and on purpose. A build is published when its wheel is packed into public/labs/ with
 * its SHA-256 (W2-T10), and that task adds its entry here, from the source hash that `enginespace version` prints for the packed package
 * (labs/grader/src/enginespace_grader/identity.py), so that the list and the wheel cannot part: W2-T10's second check compares them. Until then
 * no grader is a published one, and no receipt is credited, whatever its numbers say.
 *
 * An entry is `{ version, sourceSha256 }`: the grader's version string, and the 64 lower-case hex digits of the hash over the files of its import package.
 * Versions are listed once each, in the order they were published.
 */
import type { PublishedGrader } from '@es/verify'

export const PUBLISHED_GRADERS: readonly PublishedGrader[] = []
