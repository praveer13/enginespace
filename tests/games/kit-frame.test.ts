/*
 * The frame's `seedInPage` option: with false a graded or Prove run writes the seed nowhere in the page, and the test hook that
 * returns it exists only in a test build. The built games keep `data-seed`.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { POOL } from '@es/play/pool/entry'
import { poolSession } from '@es/play/pool/session'
import { Frame } from '@/games/kit/Frame'
import { exposeSeed, SEED_HOOK, writesSeed } from '@/games/kit/seed-hook'

const SEED = 4812937

const frame = (over: Record<string, unknown>) =>
  renderToStaticMarkup(
    h(StaticRouter, { location: '/play/pool' }, h(Frame, {
      game: POOL,
      role: 'You are the KV allocator.',
      session: poolSession,
      level: 'one-group',
      levelTitle: 'One KV group',
      seed: SEED,
      mode: 'graded',
      goal: () => ({ aim: 'The aim.', control: 'What you control.', target: 'The number to beat.', ends: 'Ends when it ends.' }),
      diagram: () => h('div', null, 'the diagram'),
      legend: () => h('ul'),
      dock: () => h('div', null, 'the decision'),
      readout: () => h('div', null, 'the readout'),
      result: () => h('div'),
      mirror: (run: { mirrorId: string }) => h('table', { id: run.mirrorId }),
      parts: [{ id: 'pool', name: 'KV page pool', sentence: 'Every page.' }],
      howTo: h('p', null, 'How to play it.'),
      titleBlock: { model: 'Model of a thing', clock: 'Clock: steps' },
      ...over,
    } as never) as ReactElement),
  )

describe('seedInPage', () => {
  test('false: no data-seed and no seed in any attribute or text of a graded run', () => {
    const markup = frame({ seedInPage: false })
    expect(markup).not.toContain('data-seed')
    expect(markup).not.toContain(String(SEED))
  })

  test('the built games keep the attribute: unset and true write it, in every mode', () => {
    for (const over of [{}, { seedInPage: true }, { mode: 'practice' }, { mode: 'practice', seedInPage: false }]) {
      expect(frame(over)).toContain(`data-seed="${SEED}"`)
    }
    expect(writesSeed(undefined, 'graded')).toBe(true)
    expect(writesSeed(false, 'graded')).toBe(false)
    expect(writesSeed(false, 'prove')).toBe(false)
  })

  test('the frame without the option has the same attributes as before (a snapshot of its opening tag)', () => {
    const tag = /<section[^>]*data-game=[^>]*>/.exec(frame({}))?.[0] ?? ''
    expect(tag).toMatch(/data-game="pool" data-level="one-group" data-seed="4812937" data-mode="graded" data-view="2d" data-phase="play" data-placement="page"/)
  })
})

describe('the test hook', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  test('is absent outside a test build', () => {
    expect(SEED_HOOK).toBe(false)
    ;(globalThis as { window?: unknown }).window = {}
    const off = exposeSeed(() => SEED)
    expect((globalThis as unknown as { window: { __esSeed?: unknown } }).window.__esSeed).toBeUndefined()
    off()
  })

  test('in a test build returns the seed while the run lives, and goes with it', () => {
    ;(globalThis as { window?: unknown }).window = {}
    const w = (globalThis as unknown as { window: { __esSeed?: () => number } }).window
    const off = exposeSeed(() => SEED, true)
    expect(w.__esSeed?.()).toBe(SEED)
    off()
    expect(w.__esSeed).toBeUndefined()
  })
})
