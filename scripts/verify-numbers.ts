/*
 * verify:numbers (ARCHITECTURE §4.4, §10.2; W0-T08). Every digit run in prose must carry one of the five tags within its
 * sentence: [measured], [derived], [estimated], [synthetic] or [unverified]. It does not need one when it sits in code or in a reference,
 * in an id (H100, p99, tr2.l3, v0.33.0) or in an ISO date, and a table says once what its numbers are by tagging the header
 * of their column. The rule, and what counts as a sentence, are in scripts/content/prose.ts (`untaggedNumbers`).
 *
 * The gate reads the prose of every lesson and module, and the plain text of their blocks and front matter: a prediction's
 * prompt, a card's words, a figure's alt text, a title and an outcome. It also reads the front page's copy (src/front/copy.ts,
 * W0-T18), every fixed string the page prints, by the same rule: the page's own numbers come from the model and the course index
 * through Readouts, each with its tag, so its copy holds none.
 *
 * A number that the course's own model printed is [synthetic], never [measured]. The gate refuses `model-number-measured`: a
 * [measured] tag in a sentence that names the model as its source, in the caption of a table that names it, in a cell of that table
 * or of a later table of the same `##` part, or in a later sentence of the part that quotes a number of that table. The plain text of
 * blocks and front matter, and the front page's copy, are read by the sentence rule.
 *
 *   bun scripts/verify-numbers.ts [--root <dir>]
 *
 * Exit status: 0 when no error, 1 when one is found, 2 for a usage error.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runGate } from './content/build.ts'
import { problem } from './content/parse.ts'
import type { Diagnostic } from './content/parse.ts'
import { modelMeasuredSentences, modelMessage, numberMessage, untaggedNumbers } from './content/prose.ts'
import { frontCopy } from '../src/front/copy.ts'

/** Where the front page's copy lives, from the repository's root. */
export const FRONT_COPY = 'src/front/copy.ts'

/**
 * The untagged numbers in the front page's copy, each on the line of copy.ts that holds its string (or the first line, for a string
 * the file builds). `copy` and `source` stand in for the real ones in the tests.
 */
export function frontCopyDiagnostics(copy: readonly string[] = frontCopy(), source?: string): Diagnostic[] {
  const text = source ?? readFileSync(path.resolve(import.meta.dirname, '..', FRONT_COPY), 'utf8')
  const lineOf = (value: string): number => {
    const at = text.indexOf(value.slice(0, 40))
    return at < 0 ? 1 : text.slice(0, at).split('\n').length
  }
  return copy.flatMap((value) => [
    ...modelMeasuredSentences(value).map((sentence) => problem('numbers', 'error', 'model-number-measured', FRONT_COPY, lineOf(value), modelMessage(sentence.text))),
    ...untaggedNumbers(value).map((finding) => problem('numbers', 'error', 'untagged-number', FRONT_COPY, lineOf(value), numberMessage(finding))),
  ])
}

export const main = (argv: readonly string[]): number => runGate('numbers', argv, () => frontCopyDiagnostics())

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
