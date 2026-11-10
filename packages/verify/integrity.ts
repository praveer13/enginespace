/**
 * Rule 3, integrity (ARCHITECTURE §8.5, ASSESSMENT §5.5): the SHA-256 of every artifact's canonical bytes, and their count, must equal the
 * receipt's entry for it. An artifact that was edited after the run, or damaged on the way, hashes to something else, and the problem names it.
 *
 * Only the artifacts that travel are hashed. A capture too large for the caps is listed with `inBundle: false`, by its hash and size, and
 * the learner keeps the file: the receipt vouches for its name and nothing here can look inside it. The schema has already required that the
 * bundle holds data for exactly the artifacts the receipt lists as in it (bundle.ts), so every entry that travels has its data here.
 *
 * Integrity is not authenticity. A forger who edits an artifact can write the new hash into the receipt as well, and this rule passes. What
 * catches that is recomputation (rule 8): the numbers a receipt claims must follow from the raw records, and an edited record that still
 * follows is the forger that A§8.6 says no zero-server design stops. This rule stops a file that is damaged, or edited by hand and not re-signed.
 */
import type { Bundle } from '@es/schema/bundle'
import { firstProblems, grouped } from './format'
import { canonicalBytes, sha256Hex } from './hashing'

export interface IntegrityResult {
  /** What is wrong, one sentence for each artifact that does not match. Empty when every artifact that travels matches. */
  readonly problems: readonly string[]
  /** How many artifacts were hashed. */
  readonly hashed: number
  /** How many the receipt lists as kept by the learner, by hash and size only. */
  readonly kept: number
}

/** The reason an artifact's data has no canonical bytes, from the error that said so: the path inside it is the useful part. */
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export async function checkIntegrity(bundle: Bundle): Promise<IntegrityResult> {
  const problems: string[] = []
  let hashed = 0
  let kept = 0
  for (const entry of bundle.receipt.artifacts) {
    if (!entry.inBundle) {
      kept += 1
      continue
    }
    const artifact = bundle.artifacts[entry.id]
    let bytes: Uint8Array<ArrayBuffer>
    try {
      bytes = canonicalBytes(artifact)
    } catch (error) {
      problems.push(`Artifact "${entry.id}": its data has no canonical bytes to hash (${reasonOf(error)}).`)
      continue
    }
    hashed += 1
    const digest = await sha256Hex(bytes)
    if (digest !== entry.sha256) problems.push(`Artifact "${entry.id}": its data in the bundle hashes to ${digest}, and the receipt lists ${entry.sha256}.`)
    if (bytes.byteLength !== entry.bytes) {
      problems.push(`Artifact "${entry.id}": its data in the bundle is ${grouped(bytes.byteLength)} bytes, and the receipt lists ${grouped(entry.bytes)}.`)
    }
  }
  return { problems: firstProblems(problems), hashed, kept }
}
