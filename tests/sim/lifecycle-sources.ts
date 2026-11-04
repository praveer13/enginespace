/*
 * Shared by tests/sim/lifecycle-sources.test.ts: reads the source file a stage cites, in a tree that holds the engines' pinned tarballs
 * unpacked side by side, and judges the citation. A tree is a folder named <repo-name>-<commit>, which is what GitHub's codeload
 * tarball for a commit unpacks to; `ES_LIFECYCLE_SOURCES` names the folder that holds them.
 *
 * A citation holds when the file exists, line `line` contains `quote`, and the definitions that enclose that line, from the outside in,
 * begin with `symbol`. The enclosing definitions are found from indentation alone (a `def` or `class` line with less indentation than
 * the line, and then than that definition), which is exact for Python written the way these engines write it.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { SourceRef } from '../../packages/sim/lifecycle'

/** Where the tree of a citation's repository and commit lies under `root`. */
export const treeOf = (root: string, source: SourceRef): string => path.join(root, `${source.repo.split('/')[1]}-${source.ref}`)

const leading = (text: string): number => text.length - text.trimStart().length
const DEFINITION = /^\s*(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)/

/** The names of the definitions around line `index` (0-based), outermost first; the line's own name comes last when it is a definition. */
export function enclosing(lines: readonly string[], index: number): string[] {
  const chain: string[] = []
  const own = DEFINITION.exec(lines[index])
  let indent = leading(lines[index])
  if (own) chain.push(own[1])
  for (let j = index - 1; j >= 0 && indent > 0; j--) {
    const text = lines[j]
    if (text.trim() === '') continue
    const here = leading(text)
    if (here >= indent) continue
    const found = DEFINITION.exec(text)
    if (found) {
      chain.push(found[1])
      indent = here
    }
  }
  return chain.reverse()
}

/** Whether the definitions in `chain` begin with `symbol` (`A.b` is the chain [A, b], and also begins `A`). */
export const holds = (chain: readonly string[], symbol: string): boolean => {
  const joined = chain.join('.')
  return joined === symbol || joined.startsWith(`${symbol}.`)
}

/** Every 1-based line that has `quote` in it and sits inside `symbol`. */
export function candidates(lines: readonly string[], symbol: string, quote: string): number[] {
  const out: number[] = []
  lines.forEach((text, i) => {
    if (text.includes(quote) && holds(enclosing(lines, i), symbol)) out.push(i + 1)
  })
  return out
}

const cache = new Map<string, string[]>()
function linesOf(file: string): string[] | null {
  const known = cache.get(file)
  if (known) return known
  if (!existsSync(file)) return null
  const lines = readFileSync(file, 'utf8').split('\n')
  cache.set(file, lines)
  return lines
}

/** What is wrong with one citation against the trees under `root`; empty when it holds. */
export function checkSource(root: string, source: SourceRef): string[] {
  const where = `${source.repo}@${source.ref.slice(0, 7)} ${source.path}:${source.line}`
  const lines = linesOf(path.join(treeOf(root, source), source.path))
  if (lines === null) return [`${where}: the file is not in the tree`]
  if (source.line < 1 || source.line > lines.length) return [`${where}: the file has ${lines.length} lines`]
  const problems: string[] = []
  if (!lines[source.line - 1].includes(source.quote)) {
    const others = candidates(lines, source.symbol, source.quote)
    problems.push(`${where}: the line does not hold the quote ${JSON.stringify(source.quote)}${others.length > 0 ? `; inside ${source.symbol} it is on line ${others.join(' and ')}` : ''}`)
  }
  const chain = enclosing(lines, source.line - 1)
  if (!holds(chain, source.symbol)) problems.push(`${where}: the line is inside ${chain.join('.') || '(no definition)'}, not ${source.symbol}`)
  return problems
}
