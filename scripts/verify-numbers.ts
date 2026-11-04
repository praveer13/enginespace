/*
 * verify:numbers (ARCHITECTURE §4.4, §10.2; W0-T08). Every digit run in prose must carry one of the four tags within its
 * sentence: [measured], [derived], [estimated] or [unverified]. It does not need one when it sits in code or in a reference,
 * in an id (H100, p99, tr2.l3, v0.33.0) or in an ISO date, and a table says once what its numbers are by tagging the header
 * of their column. The rule, and what counts as a sentence, are in scripts/content/prose.ts (`untaggedNumbers`).
 *
 * The gate reads the prose of every lesson and module, and the plain text of their blocks and front matter: a prediction's
 * prompt, a card's words, a figure's alt text, a title and an outcome.
 *
 *   bun scripts/verify-numbers.ts [--root <dir>]
 *
 * Exit status: 0 when no error, 1 when one is found, 2 for a usage error.
 */
import { runGate } from './content/build.ts'

export const main = (argv: readonly string[]): number => runGate('numbers', argv)

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
