/*
 * W2-T07: the pins and the published graders that the page hands to the receipt worker (src/receipts/pins.ts, src/receipts/graders.ts).
 *
 *   - The pins are course.lock.json's: the engines a lab runs (vllm and sglang from PyPI, nano-vllm by commit) with what the lock pins each by,
 *     and nothing else of the lock. A reading target, a profiler and a blog are not engines.
 *   - The list of published graders has the shape rule 5 needs, once for each version, and it holds no build that is not one: the synthetic grader
 *     of the test fixtures is not a published build.
 */
import { describe, expect, test } from 'bun:test'
import { lockFileSchema } from '@es/schema/lock'
import { PUBLISHED_GRADERS } from '@/receipts/graders'
import { ENGINE_PINS } from '@/receipts/pins'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { read, root } from '../ci/support'
import { sha256 } from '../verify/support'

const lock = lockFileSchema.parse(JSON.parse(read('course.lock.json')))
const entry = (key: string) => lock.entries.find((candidate) => candidate.key === key)

describe('the pins', () => {
  test('are the engines of course.lock.json: vllm and sglang by release and commit, nano-vllm by commit alone', () => {
    expect(ENGINE_PINS.map((pin) => pin.name)).toEqual(['vllm', 'sglang', 'nano-vllm'])
    expect(ENGINE_PINS[0]).toEqual({ name: 'vllm', version: entry('vllm')?.version, commit: entry('vllm')?.commit })
    expect(ENGINE_PINS[1]).toEqual({ name: 'sglang', version: entry('sglang')?.version, commit: entry('sglang')?.commit })
    expect(ENGINE_PINS[2]).toEqual({ name: 'nano-vllm', commit: entry('nano-vllm')?.commit })
    expect(ENGINE_PINS[2]).not.toHaveProperty('version')
  })

  test('hold the pins of A§9.2 as the lock states them: vLLM 0.33.0 and SGLang 0.5.23', () => {
    expect(ENGINE_PINS[0].version).toBe('0.33.0')
    expect(ENGINE_PINS[1].version).toBe('0.5.23')
    for (const pin of ENGINE_PINS) expect(pin.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  test('leave out what is not an engine: the reading targets, the profilers and the blog, and the lock\'s notes', () => {
    for (const pin of ENGINE_PINS) expect(Object.keys(pin).every((key) => ['name', 'version', 'commit'].includes(key))).toBe(true)
    for (const key of ['mini-sglang', 'inside-vllm', 'nsys', 'ncu', 'perfetto']) expect(ENGINE_PINS.some((pin) => pin.name === key)).toBe(false)
    expect(JSON.stringify(ENGINE_PINS)).not.toContain('proposed until the owner confirms')
  })
})

describe('the published graders', () => {
  test('are listed with a version and a source hash of 64 lower-case hex digits, each version once', () => {
    for (const grader of PUBLISHED_GRADERS) {
      expect(grader.version).toMatch(/^[0-9][0-9A-Za-z.+_-]{0,63}$/)
      expect(grader.sourceSha256).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(new Set(PUBLISHED_GRADERS.map((grader) => grader.version)).size).toBe(PUBLISHED_GRADERS.length)
  })

  test('do not hold the synthetic grader of the fixtures: a build that is not published cannot get on the list by accident', () => {
    // The Python grader's own bundle is made by a grader with an identity that no one published: the hash of a sentence.
    const fixture = sha256('enginespace-grader test fixture: not a published build')
    const bundle = JSON.parse(new TextDecoder().decode(gunzipSync(readFileSync(path.join(root, 'tests/fixtures/grader/sample.es.json.gz'))))) as { receipt: { grader: { sourceSha256: string } } }
    expect(bundle.receipt.grader.sourceSha256).toBe(fixture)
    expect(PUBLISHED_GRADERS.some((grader) => grader.sourceSha256 === fixture)).toBe(false)
  })
})
