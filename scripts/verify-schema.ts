/*
 * verify:schema (ARCHITECTURE §10.2, D-030; W2-T01). The JSON Schema files in schemas/ are the zod schemas of packages/schema as the grader
 * reads them, and a drift between the two means that the site and the grader accept different receipts.
 *
 *   bun scripts/verify-schema.ts [--root <dir>]
 *
 * It fails when
 *   - a schema file is missing, or differs from what `z.toJSONSchema` writes now (the first line that differs is named);
 *   - a `.json` file at the top of schemas/ is one that nothing writes;
 *   - the same holds for the copy that the grader's package carries of each schema (W2-T02), because the grader is installed alone and
 *     validates with that copy, so a copy that lags is a grader that accepts what the site refuses;
 *   - an exported schema could not be read as the site reads it: a pattern whose meaning differs between ECMAScript and Python's `re`, or
 *     an object that leaves its keys open.
 * `bun scripts/export-schemas.ts` rewrites the files. A change to a schema is reviewed as the diff of schemas/*.schema.json beside it.
 *
 * Exit status: 0 when nothing is wrong, 1 when something is, 2 for a usage error.
 */
import path from 'node:path'
import { exportProblems, graderCopyDrift, SCHEMA_EXPORTS, schemaDrift } from './export-schemas.ts'

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..')

const USAGE = 'usage: bun scripts/verify-schema.ts [--root <dir>]'

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
  const problems = [...schemaDrift(root), ...graderCopyDrift(root), ...exportProblems()]
  for (const problem of problems) console.error(`verify:schema: ${problem}`)
  if (problems.length > 0) {
    console.error(`verify:schema failed: ${problems.length} problem(s). If the change is intended, run \`bun scripts/export-schemas.ts\` and review the diff of schemas/ (D-030).`)
    return 1
  }
  console.log(`verify:schema passed: ${SCHEMA_EXPORTS.length} JSON Schemas, and the grader's copy of each, are what the zod schemas of packages/schema export`)
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
