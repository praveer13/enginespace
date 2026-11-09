/*
 * W1b-T01: the seam a lesson's game block finishes its runs into (src/content/render/runs.ts), which the prediction box reads to reveal
 * after the game (W1b-T02). A run is found by the page and the game block's place among its blocks; each new run of a block replaces the
 * last; `seq` grows with every run in the tab, so a reader that noted `latestSeq()` at its commit can tell a run played after it.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type { RunResult } from '@es/play'
import { blockRun, finishBlockRun, forgetBlockRuns, latestSeq, subscribeBlockRuns } from '@/content/render/runs'

const result = (seed: number): RunResult => ({
  record: { game: 'loop', level: 'async', seed, actions: [{ t: 'run', until: 'step' }], rev: 'a1b2c3d4' },
  grade: { score: 1, ok: true },
  debrief: { sentence: 'Well served.', names: null },
  hash: '0badf00d',
})

afterEach(() => forgetBlockRuns())

describe("a page's game runs", () => {
  test('a block has no run until one ends, and then the last one, with its result as the shell finished it', () => {
    expect(blockRun('tr2.l3', 7)).toBeNull()
    expect(latestSeq()).toBe(0)
    const stored = finishBlockRun({ scope: 'tr2.l3', at: 7, game: 'loop', level: 'async', mode: 'practice', result: result(11) })
    expect(stored.seq).toBe(1)
    expect(blockRun('tr2.l3', 7)).toEqual({ scope: 'tr2.l3', at: 7, game: 'loop', level: 'async', mode: 'practice', result: result(11), seq: 1 })
    expect(latestSeq()).toBe(1)
  })

  test('a block is found by its page and its place: another block, or the same place on another page, is another run', () => {
    finishBlockRun({ scope: 'tr2.l3', at: 7, game: 'loop', level: 'async', mode: 'practice', result: result(11) })
    expect(blockRun('tr2.l3', 8)).toBeNull()
    expect(blockRun('tr2.l4', 7)).toBeNull()
  })

  test('a new run replaces the block\'s last, and seq grows with every run in the tab, on any block', () => {
    finishBlockRun({ scope: 'tr2.l3', at: 7, game: 'loop', level: 'async', mode: 'practice', result: result(11) })
    finishBlockRun({ scope: 'tr8.l1', at: 3, game: 'broken-bench', level: 'due', mode: 'graded', result: result(12) })
    const again = finishBlockRun({ scope: 'tr2.l3', at: 7, game: 'loop', level: 'async', mode: 'graded', result: result(13) })
    expect(again.seq).toBe(3)
    expect(blockRun('tr2.l3', 7)?.result.record.seed).toBe(13)
    expect(blockRun('tr2.l3', 7)?.mode).toBe('graded')
    expect(blockRun('tr8.l1', 3)?.seq).toBe(2)
  })

  test('a reader is told of every run that ends, until it stops listening', () => {
    let heard = 0
    const stop = subscribeBlockRuns(() => {
      heard += 1
    })
    finishBlockRun({ scope: 'tr2.l3', at: 7, game: 'loop', level: 'async', mode: 'practice', result: result(11) })
    finishBlockRun({ scope: 'tr2.l3', at: 9, game: 'loop', level: 'close', mode: 'graded', result: result(12) })
    stop()
    finishBlockRun({ scope: 'tr2.l3', at: 7, game: 'loop', level: 'async', mode: 'practice', result: result(13) })
    expect(heard).toBe(2)
  })

  test('a run played before a reader noted the seq is told apart from one played after it', () => {
    finishBlockRun({ scope: 'tr6.l2', at: 4, game: 'verifier', level: 'overlap', mode: 'practice', result: result(11) })
    const committedAt = latestSeq()
    expect((blockRun('tr6.l2', 4)?.seq ?? 0) > committedAt).toBe(false)
    finishBlockRun({ scope: 'tr6.l2', at: 4, game: 'verifier', level: 'overlap', mode: 'practice', result: result(12) })
    expect((blockRun('tr6.l2', 4)?.seq ?? 0) > committedAt).toBe(true)
  })
})
