/*
 * W1-T01's course.lock.json against the documents that propose it: D-035's pins, ARCHITECTURE §4.4's table of proposed entries and its
 * rule that every pin is exact. The file holds the edition-1 pins, proposed until the owner confirms them (O-4, W1-T02), and these tests
 * compare the file with the documents and never with constants of their own, so the owner's confirmation, or a change of a pin that
 * edits the file and the documents together, keeps them green, and a file that no longer matches its documents fails them.
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

/** The eight pins that W1-T01 owns, in the order the tracker names them. */
const W1_KEYS = ['vllm', 'sglang', 'nano-vllm', 'mini-sglang', 'inside-vllm', 'nsys', 'ncu', 'perfetto']

describe('course.lock.json', () => {
  test('is the schema’s file and holds the eight pins that W1-T01 owns, in the tracker’s order, before any other', () => {
    expect(lock.schema).toBe('enginespace/lock@1')
    expect(lock.entries.map((one) => one.key).slice(0, W1_KEYS.length)).toEqual(W1_KEYS)
    expect(lock.entries.slice(0, W1_KEYS.length).map((one) => one.kind)).toEqual(['pypi', 'pypi', 'git', 'git', 'blog', 'tool', 'tool', 'git'])
  })

  test('is written the way the build writes it: two-space JSON, one final newline', () => {
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`)
  })

  test('pins the two engines by version and by commit, and every other pin by what its kind needs', () => {
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

  test('sets a TTL that fits what the pin follows: at most a quarter for an engine, a reading target or a tool, at most a year for a post', () => {
    for (const key of ['vllm', 'sglang', 'nano-vllm', 'mini-sglang', 'nsys', 'ncu', 'perfetto']) expect([key, entry(key).ttlDays <= 90]).toEqual([key, true])
    expect(entry('inside-vllm').ttlDays).toBeLessThanOrEqual(365)
  })
})

describe('D-035’s pins', () => {
  for (const key of ['vllm', 'sglang', 'nano-vllm', 'mini-sglang', 'inside-vllm']) {
    test(`${key} is at a commit that D-035 records`, () => {
      expect(d035).toContain(entry(key).commit as string)
    })
  }

  test('vLLM and SGLang are at the releases that D-035 pins', () => {
    expect(d035).toContain(`Pin vLLM v${entry('vllm').version}`)
    expect(d035).toContain(`Pin SGLang v${entry('sglang').version}`)
  })

  test('the fallback of the driver gate is in the vLLM notes with its commit, as D-035 gives it, while vLLM is the pinned minor', () => {
    const fallback = /v0\.32\.0 \(`([0-9a-f]{40})`\)/.exec(d035)?.[1]
    expect(fallback).toBeDefined()
    if (entry('vllm').version === '0.33.0') {
      expect(entry('vllm').notes).toContain(fallback as string)
      expect(entry('vllm').notes).toContain('R580')
    }
  })

  test('D-035 states its status, which is proposed until the owner confirms the pins in W1-T02', () => {
    expect(d035).toMatch(/- \*\*Status:\*\* (?:proposed; the owner confirms \(O-4\)|accepted|changed)/)
  })
})

describe('ARCHITECTURE §4.4’s table', () => {
  test('names the tools’ versions and the profiler commit that the file holds', () => {
    const row = table.split('\n').find((line) => line.startsWith('| `nsys`')) ?? ''
    for (const key of ['nsys', 'ncu', 'perfetto']) expect([key, row.includes(entry(key).version as string)]).toEqual([key, true])
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
