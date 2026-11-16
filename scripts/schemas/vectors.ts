/*
 * The vector files of schemas/vectors, and the builder of each (ARCHITECTURE §9.8, D-030). TypeScript writes them and the Python grader's
 * tests read them; this registry is the one list, so a file that is not here is not written and is found by the checks as one that nothing owns.
 *
 * This is not scripts/vectors.ts, which holds the golden vectors of the simulation models in tests/fixtures/sim. Those pin what a model
 * does. These are the contract between two languages, so each is written for a reader that is not JavaScript (format.ts).
 */
import { challengeFile } from './challenge-vectors.ts'
import { canonicalFile } from './canonical-vectors.ts'
import { renderVectorFile } from './format.ts'
import type { VectorFile } from './format.ts'
import { rngFile, subseedFile } from './rng-vectors.ts'
import { sha256File } from './sha256-vectors.ts'

export interface VectorSpec {
  /** Repository-relative path. */
  readonly file: string
  readonly build: () => VectorFile
}

/** The five files of the contract, in the order the tracker names them. */
export const VECTOR_FILES: readonly VectorSpec[] = [
  { file: 'schemas/vectors/rng.json', build: rngFile },
  { file: 'schemas/vectors/subseed.json', build: subseedFile },
  { file: 'schemas/vectors/challenge.json', build: challengeFile },
  { file: 'schemas/vectors/canonical.json', build: canonicalFile },
  { file: 'schemas/vectors/sha256.json', build: sha256File },
]

/** A file as it is committed: its path and its bytes. */
export interface Rendered {
  readonly file: string
  readonly text: string
}

/** The bytes of every vector file, as the builders write them now. */
export function renderVectors(): Rendered[] {
  return VECTOR_FILES.map(({ file, build }) => ({ file, text: renderVectorFile(build()) }))
}
