/*
 * verify:content (ARCHITECTURE §4.7, §10.2; W0-T08). Compiles `content/` in memory and fails on what is wrong with its
 * structure, each problem with the file and the line:
 *   - a schema: a key the front matter or a directive does not know, a value of the wrong kind, a ninth block type (D-016);
 *   - an id or a ref: a lesson that does not belong to its file or its module, a prediction that does not belong to its lesson;
 *   - a link: a game, a lab, a KC, a claim, a card, a pin or a figure's file that does not exist;
 *   - the prose itself: raw HTML, an image, a heading that skips a level, a reference that does not parse;
 *   - a size: the course index over 6 KB gz, or a module or lesson over 40 KB gz [estimated].
 * A claim's own fields are verify:claims', and an untagged number is verify:numbers'.
 *
 *   bun scripts/verify-content.ts [--root <dir>]
 *
 * Exit status: 0 when no error, 1 when one is found, 2 for a usage error.
 */
import { runGate } from './content/build.ts'

export const main = (argv: readonly string[]): number => runGate('content', argv)

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
