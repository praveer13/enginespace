/*
 * W1-T01's course.lock.json against the documents that propose it: D-035's pins, ARCHITECTURE §4.4's table of proposed entries and its
 * rule that every pin is exact. The file is the edition-1 pins, proposed until the owner confirms them (O-4, W1-T02), and this test is
 * what W1-T02 changes with it.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { lockFileSchema } from '@es/schema/lock'
import type { LockEntry } from '@es/schema/lock'
import { between, read as readDoc } from '../ci/support'

const root = path.resolve(import.meta.dirname, '../..')
const text = readFileSync(path.join(root, 'course.lock.json'), 'utf8')
const lock = lockFileSchema.parse(JSON.parse(text))
const entry = (key: string): LockEntry => {
  const found = lock.entries.find((one) => one.key === key)
  if (found === undefined) throw new Error(`course.lock.json has no ${key}`)
  return found
}

const decisions = readDoc('docs/DECISIONS.md')
const d035 = between(decisions, '### D-035 · Proposed edition-1 pins', '### D-036 ·')
const architecture = readDoc('docs/ARCHITECTURE.md')
const table = between(architecture, '| Key | Proposed pin | Evidence |', '**Why vLLM and SGLang each get their own environment.**')

describe('course.lock.json', () => {
  test('is the schema’s file, with the eight pins that W1-T01 owns, in the tracker’s order', () => {
    expect(lock.schema).toBe('enginespace/lock@1')
    expect(lock.entries.map((one) => one.key)).toEqual(['vllm', 'sglang', 'nano-vllm', 'mini-sglang', 'inside-vllm', 'nsys', 'ncu', 'perfetto'])
    expect(lock.entries.map((one) => one.kind)).toEqual(['pypi', 'pypi', 'git', 'git', 'blog', 'tool', 'tool', 'git'])
  })

  test('is written the way the build writes it: two-space JSON, one final newline', () => {
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`)
  })

  test('pins the two engines by version and by commit, and every other entry by what its kind needs', () => {
    for (const key of ['vllm', 'sglang']) {
      expect(entry(key).version).toBeDefined()
      expect(entry(key).commit).toBeDefined()
    }
    for (const key of ['nano-vllm', 'mini-sglang', 'inside-vllm', 'perfetto']) expect(entry(key).commit).toBeDefined()
    for (const key of ['nsys', 'ncu']) expect(entry(key).version).toBeDefined()
  })

  test('holds no range and no moving reference: a version is one release, never ^, ~, a wildcard or latest', () => {
    for (const one of lock.entries) {
      expect(`${one.key} ${one.version ?? ''}`).not.toMatch(/[\^~*<>=]|latest|stable|main|master/)
    }
  })

  test('sets a TTL that fits what the pin follows: a quarter for the engines, 60 days for a tool, a year for a post', () => {
    expect(Object.fromEntries(lock.entries.map((one) => [one.key, one.ttlDays]))).toEqual({
      vllm: 90,
      sglang: 90,
      'nano-vllm': 90,
      'mini-sglang': 90,
      'inside-vllm': 365,
      nsys: 60,
      ncu: 60,
      perfetto: 60,
    })
  })
})

describe('D-035’s pins', () => {
  const commits: [string, string][] = [
    ['vllm', '4ba787ec9959e566d3b587a796dff07673324da5'],
    ['sglang', '297e54fd105e974cdf401e5b4d20253a22c16f90'],
    ['nano-vllm', 'bb823b3e06983d71485a8e1f23715ebd87d98ef8'],
    ['mini-sglang', '9a91cfafe754aa85daee49998176275667eb58f2'],
    ['inside-vllm', '42172ad18fbc22c89d0063184e4570cc84186e16'],
  ]
  for (const [key, commit] of commits) {
    test(`${key} is at the commit that D-035 records`, () => {
      expect(entry(key).commit).toBe(commit)
      expect(d035).toContain(commit)
    })
  }

  test('vLLM is v0.33.0 and SGLang is v0.5.23, the releases D-035 pins', () => {
    expect(entry('vllm').version).toBe('0.33.0')
    expect(entry('sglang').version).toBe('0.5.23')
    expect(d035).toContain('Pin vLLM v0.33.0')
    expect(d035).toContain('Pin SGLang v0.5.23')
  })

  test('the fallback of the driver gate, v0.32.0, is in the notes with its commit, as D-035 gives it', () => {
    const fallback = '5df63a7203cdb9328d824a27b682e77c7b9928be'
    expect(d035).toContain(fallback)
    expect(entry('vllm').notes).toContain(fallback)
    expect(entry('vllm').notes).toContain('R580')
  })

  test('D-035 is still proposed, and so is every pin: the owner confirms them in W1-T02', () => {
    expect(d035).toContain('- **Status:** proposed; the owner confirms (O-4).')
    for (const key of ['vllm', 'sglang']) expect(entry(key).notes).toContain('proposed until the owner confirms it (O-4)')
  })
})

describe('ARCHITECTURE §4.4’s table', () => {
  test('names the tools’ versions and the profiler commit that the file holds', () => {
    expect(entry('nsys').version).toBe('2026.5.1')
    expect(entry('ncu').version).toBe('2026.3.1')
    expect(entry('perfetto').version).toBe('v59.1')
    const row = table.split('\n').find((line) => line.startsWith('| `nsys`')) ?? ''
    expect(row).toContain('2026.5.1')
    expect(row).toContain('2026.3.1')
    expect(row).toContain('v59.1')
    const commit = entry('perfetto').commit ?? ''
    expect(row).toContain(`${commit.slice(0, 8)}…${commit.slice(-6)}`)
  })

  test('shortens each commit the way the table does', () => {
    const short = (key: string, head: number, tail: number) => {
      const commit = entry(key).commit ?? ''
      return `${commit.slice(0, head)}…${commit.slice(-tail)}`
    }
    expect(table).toContain(short('vllm', 8, 6))
    expect(table).toContain(short('nano-vllm', 8, 5))
    expect(table).toContain(short('mini-sglang', 8, 4))
    expect(table).toContain(entry('inside-vllm').commit as string)
  })

  test('lists a kind for the tools, and the file’s kinds are the table’s', () => {
    expect(architecture).toContain('kind: pypi|git|blog|dataset|model|container|tool')
    expect(architecture).toContain('has the kind `tool` and is pinned by its version')
  })

  test('no longer asks W1-T01 to confirm the two reading targets', () => {
    expect(table).not.toContain('W1-T01 confirms them')
    expect(table).toContain('W1-T01 confirmed on 2026-11-04')
  })
})
