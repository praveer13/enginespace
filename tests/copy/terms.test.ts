/*
 * R-T04: src/copy/terms.ts, the one table a definition comes from (REDESIGN §2.7, policy 5; D-063).
 *
 *   - Every term, product word, state word, verdict and provenance word has a definition of 6 to 12 words, and no term is listed twice.
 *   - A coined term is marked as the course's own, and the three the brief names (bubble, ghost token, page as the pool's unit) are.
 *   - The product's own words are the brief's table, word for word.
 *   - The terms cover every engine term that the brief's naming table puts on screen for the five built games.
 */
import { describe, expect, test } from 'bun:test'
import { PRODUCT_WORDS, PROVENANCE_WORDS, STATE_WORDS, termOf, TERMS, VERDICT_WORDS } from '@/copy/terms'
import { read } from '../ci/support'

const words = (text: string): number => text.trim().split(/\s+/).length

describe('the terms', () => {
  test('each has a definition of 6 to 12 words, and no term is listed twice', () => {
    for (const term of TERMS) expect([term.term, words(term.definition) >= 6 && words(term.definition) <= 12]).toEqual([term.term, true])
    expect(new Set(TERMS.map((term) => term.term)).size).toBe(TERMS.length)
    const others = [...PRODUCT_WORDS.map((w) => [w.word, w.means]), ...[...Object.values(STATE_WORDS).flat(), ...VERDICT_WORDS, ...PROVENANCE_WORDS].map((w) => [w.word, w.means])]
    for (const [word, means] of others) expect([word, words(means) >= 6 && words(means) <= 12]).toEqual([word, true])
  })

  test("marks the course's own words, and only those: bubble, ghost token and the page as the pool's unit among them", () => {
    for (const term of TERMS) expect([term.term, term.coined === true]).toEqual([term.term, term.source === 'course'])
    for (const coined of ['bubble', 'ghost token', 'page', 'KV page']) expect([coined, termOf(coined)?.coined]).toEqual([coined, true])
    expect(termOf('page')?.definition).toContain("pool's unit")
    expect(termOf('page')?.engine).toBe('KVCacheBlock')
  })

  test("are the product's own words of the brief's table", () => {
    const table = read('docs/REDESIGN.md').split("**The product's own words, one meaning each**")[1].split('**The copy guard.**')[0]
    const rows = table
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| Word') && !line.startsWith('|---'))
      .map((line) => line.split('|')[1].trim())
    expect(PRODUCT_WORDS.map((w) => w.word)).toEqual(rows)
  })

  test("cover the engine's terms the naming table puts on the five built games' screens", () => {
    for (const term of ['request', 'waiting queue', 'running batch', 'batch slot', 'step', 'bubble', 'ghost token', 'async scheduling', 'static batching', 'CUDA graph replay', 'capture size', 'padding', 'grammar mask', 'KV page', 'KV page pool', 'KV group', 'conversation', 'shared system prompt', 'cost', 'sliding window', 'free queue', 'cached page', 'free page', 'LoRA adapter', 'prefix hit', 'evict', 'preempt', 'recompute', 'reference run', 'API server', 'client', 'process', 'thread', 'queue', 'IPC', 'shared memory', 'host-to-device copy', 'device-to-host copy', 'sync', 'tensor-parallel rank', 'collective', 'stage', 'tokenize', 'detokenize', 'draft model', 'target model', 'accept', 'residual', 'bonus token', 'open loop', 'closed loop', 'coordinated omission', 'trace']) {
      expect([term, termOf(term) === undefined]).toEqual([term, false])
    }
  })

  test("name the verdicts Passed and Not yet, and the four tags of the numbers", () => {
    expect(VERDICT_WORDS.map((w) => w.word)).toEqual(['Passed', 'Not yet'])
    for (const tag of ['measured', 'derived', 'estimated', 'unverified']) expect(PROVENANCE_WORDS.map((w) => w.word)).toContain(tag)
    expect(STATE_WORDS.skill.map((w) => w.word)).toEqual(['not started', 'tried', 'passed', 'kept'])
    expect(STATE_WORDS.attempt.map((w) => w.word)).toEqual(['not yet', 'passed in practice', 'passed'])
    expect(STATE_WORDS.lesson.map((w) => w.word)).toEqual(['not started', 'started', 'done'])
  })
})
