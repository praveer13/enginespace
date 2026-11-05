/*
 * W1-T16's first acceptance check, "every stage cites its file at its commit", against the files themselves.
 *
 * The citations of the five engines (file, symbol, line and a quote of one line, at the commit that course.lock.json pins) cannot be read
 * from a gate, which has no network, so the check that matters most runs on a machine that has the sources. Set ES_LIFECYCLE_SOURCES to a
 * folder that holds the tarballs of the pins unpacked side by side, each in the folder GitHub names it, <repository>-<commit>:
 *
 *   curl -sSL -A 'Mozilla/5.0 (X11; Linux x86_64)' https://codeload.github.com/vllm-project/vllm/tar.gz/<commit> | tar -xz -C <folder>
 *
 * for each repository and commit of ENGINES (vllm-project/vllm at two commits, sgl-project/sglang, sgl-project/mini-sglang and
 * GeeeekExplorer/nano-vllm). Then every stage of every scenario is judged: the file is in the tree, line `line` holds `quote`, and the
 * definitions around that line begin with `symbol`. Without the variable the real check is skipped and the rest of this file still runs.
 *
 * W1-T16 ran it on 2026-11-04 against tarballs whose embedded commit ids (`git get-tar-commit-id`) were the lock's: every citation held. At
 * the next re-pin the citations are re-read and this test is the way to know they were.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ENGINES, referencePath, scenarios } from '../../packages/sim/lifecycle'
import type { SourceRef } from '../../packages/sim/lifecycle'
import { candidates, checkSource, enclosing, holds, treeOf } from './lifecycle-sources'

const SOURCES = process.env.ES_LIFECYCLE_SOURCES

const PYTHON = `class A:
    def f(self):
        x = 1  # target
        return (
            g(x)
        )

    async def h(self):
        return 2


async def top():
    def inner():
        y = 2
        return y

    z = 3
    return inner
`
const LINES = PYTHON.split('\n')
const at = (needle: string): number => LINES.findIndex((line) => line.includes(needle))

describe('the citation checker', () => {
  test('finds the definitions around a line, outermost first, from indentation alone', () => {
    expect(enclosing(LINES, at('x = 1'))).toEqual(['A', 'f'])
    expect(enclosing(LINES, at('g(x)'))).toEqual(['A', 'f'])
    expect(enclosing(LINES, at('return 2'))).toEqual(['A', 'h'])
    expect(enclosing(LINES, at('y = 2'))).toEqual(['top', 'inner'])
    expect(enclosing(LINES, at('z = 3'))).toEqual(['top'])
    // A definition line is its own symbol, and a module-level line is in none.
    expect(enclosing(LINES, at('def f'))).toEqual(['A', 'f'])
    expect(enclosing(LINES, at('async def top'))).toEqual(['top'])
    expect(enclosing(LINES, 0)).toEqual(['A'])
  })

  test('holds a symbol when the chain begins with it, at a dot', () => {
    expect(holds(['A', 'f'], 'A.f')).toBe(true)
    expect(holds(['A', 'f'], 'A')).toBe(true)
    expect(holds(['top', 'inner'], 'top')).toBe(true)
    expect(holds(['A', 'f'], 'A.g')).toBe(false)
    expect(holds(['A', 'fx'], 'A.f')).toBe(false)
    expect(holds(['B'], 'A')).toBe(false)
    expect(holds([], 'A')).toBe(false)
  })

  test('lists the lines that have a quote inside a symbol, and only those', () => {
    expect(candidates(LINES, 'A.f', 'x = 1')).toEqual([at('x = 1') + 1])
    expect(candidates(LINES, 'A.h', 'x = 1')).toEqual([])
    expect(candidates(LINES, 'top', 'return')).toEqual([at('return y') + 1, at('return inner') + 1])
  })

  test('judges a citation against a tree: the file, the line, the quote and the symbol', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'enginespace-lifecycle-'))
    try {
      const ref = 'a'.repeat(40)
      const cite = (o: Partial<SourceRef>): SourceRef => ({ repo: 'o/pkg', ref, path: 'pkg/mod.py', symbol: 'A.f', line: at('x = 1') + 1, quote: 'x = 1', ...o })
      mkdirSync(path.join(treeOf(root, cite({})), 'pkg'), { recursive: true })
      writeFileSync(path.join(treeOf(root, cite({})), 'pkg/mod.py'), PYTHON)
      expect(treeOf(root, cite({}))).toBe(path.join(root, `pkg-${ref}`))
      expect(checkSource(root, cite({}))).toEqual([])
      expect(checkSource(root, cite({ symbol: 'A' }))).toEqual([])
      expect(checkSource(root, cite({ path: 'pkg/gone.py' }))[0]).toContain('the file is not in the tree')
      expect(checkSource(root, cite({ line: 999 }))[0]).toContain('the file has')
      expect(checkSource(root, cite({ line: at('z = 3') + 1 }))[0]).toContain('does not hold the quote')
      expect(checkSource(root, cite({ quote: 'x = 2' }))[0]).toContain('does not hold the quote')
      expect(checkSource(root, cite({ symbol: 'A.h' }))[0]).toContain('is inside A.f, not A.h')
      // A line that is in the right symbol but not the cited one names the line where the quote is.
      expect(checkSource(root, cite({ line: at('g(x)') + 1, quote: 'x = 1' }))[0]).toContain(`it is on line ${at('x = 1') + 1}`)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('the engines\' citations, offline', () => {
  test('are many, on lines a source file plausibly has, in five trees of four repositories', () => {
    const lines = new Set<string>()
    for (const sc of scenarios()) {
      for (const stage of referencePath(sc)) {
        const c = stage.source
        expect([stage.id, c.line < 20_000]).toEqual([stage.id, true])
        lines.add(`${c.repo}@${c.ref}:${c.path}:${c.line}`)
      }
    }
    // One line can back several stages (nano-vllm's `.tolist()` is a sampling launch, a copy and a wait), so lines are fewer than stages.
    expect(lines.size).toBeGreaterThan(130)
    expect(new Set(Object.values(ENGINES).map((e) => `${e.repo}@${e.ref}`)).size).toBe(5)
    expect(new Set(Object.values(ENGINES).map((e) => e.repo)).size).toBe(4)
  })
})

describe.skipIf(!SOURCES)('check 1 against the unpacked tarballs of the pins', () => {
  const root = SOURCES ?? ''
  const cited = new Map<string, SourceRef>()
  for (const sc of scenarios()) for (const stage of referencePath(sc)) cited.set(`${stage.id}|${stage.source.line}|${stage.source.quote}`, stage.source)
  afterAll(() => cited.clear())

  test('has the tree of every pin', () => {
    const missing = Object.values(ENGINES)
      .map((engine) => treeOf(root, { repo: engine.repo, ref: engine.ref } as SourceRef))
      .filter((tree) => !existsSync(tree))
    expect(missing).toEqual([])
  })

  test('holds every citation: the file, the line, the quote and the symbol', () => {
    const problems: string[] = []
    for (const source of cited.values()) problems.push(...checkSource(root, source))
    expect(problems).toEqual([])
    expect(cited.size).toBeGreaterThan(130)
  })
})
