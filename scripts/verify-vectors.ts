/*
 * verify:vectors (ARCHITECTURE §10.2, §9.8, D-030; W2-T01). The TypeScript side of the cross-language contract. schemas/vectors holds
 * cases of the seeded generator, the sub-streams, the challenge token, canonical JSON and SHA-256, written from the TypeScript code, and
 * the Python grader's tests (W2-T02) read them and must match every one. This gate holds the other end: the files are what the TypeScript code
 * writes now, so a change to the code that moves a case fails here until the files are rewritten and the diff is reviewed, and the
 * grader's job in labs.yml fails until the Python port follows.
 *
 *   bun scripts/verify-vectors.ts [--root <dir>]
 *
 * It fails when
 *   - a vector file is missing, or differs from what the builders write now (the first line that differs is named);
 *   - a `.json` file in schemas/vectors is one that nothing writes;
 *   - a file holds a number token that the two languages might read differently: not exactly what `String(Number(token))` writes, so a
 *     negative zero, a whole number too large to be exact, a fraction of more than the shortest digits, or `1.0`.
 * `bun scripts/export-schemas.ts` rewrites the files. This is not scripts/vectors.ts, which pins the simulation models' golden vectors.
 *
 * Exit status: 0 when nothing is wrong, 1 when something is, 2 for a usage error.
 */
import path from 'node:path'
import { vectorDrift } from './export-schemas.ts'
import { VECTOR_FILES } from './schemas/vectors.ts'

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..')

const USAGE = 'usage: bun scripts/verify-vectors.ts [--root <dir>]'

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export function main(argv: readonly string[]): number {
  let root = DEFAULT_ROOT
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' && argv[i + 1] !== undefined) root = path.resolve(argv[++i])
    else {
      console.error(USAGE)
      return 2
    }
  }
  const problems = vectorDrift(root)
  for (const problem of problems) console.error(`verify:vectors: ${problem}`)
  if (problems.length > 0) {
    console.error(`verify:vectors failed: ${problems.length} problem(s). If the change is intended, run \`bun scripts/export-schemas.ts\`, review the diff of schemas/vectors, and let the Python port follow (D-030).`)
    return 1
  }
  const count = VECTOR_FILES.reduce((total, { build }) => total + build().vectors.length, 0)
  console.log(`verify:vectors passed: ${VECTOR_FILES.length} files and ${count} vectors are what the TypeScript code writes`)
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
