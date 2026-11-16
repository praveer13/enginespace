/*
 * R-T11, touch a part, get its source (REDESIGN §2.6): KV page pool's parts table in packages/play/pool/copy.ts is the one table the parts
 * list and the source popover both read; every sourced part names a claim that exists, whose link is the file and symbol at the pinned
 * commit; a part with no claim says "model object"; a KV page's popover names vLLM's class, BlockPool, once; and the source is a lazy
 * chunk. The dock's Step for the pool is held here too: it takes the first option each decision lists, and every such move is legal.
 * e2e/lesson-games.spec.ts opens the popover in the instrument and in the dock, by keyboard and by pointer.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CORE_SCHEMA, load } from 'js-yaml'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Claim } from '@es/schema'
import { POOL } from '@es/play/pool/entry'
import { partOf, partsOf, POOL_PARTS } from '@es/play/pool/copy'
import { poolInit, poolReduce, poolSession } from '@es/play/pool/session'
import type { PoolLevelId } from '@es/play/pool/types'
import { MODEL_OBJECT, PartPopover } from '@/games/kit/PartPopover'
import { SourceLines } from '@/games/kit/PartSource'
import { partRows, poolStep } from '@/games/pool/kit'
import { PagePick, PartName } from '@/games/pool/View2D'
import { practiceOf } from './pool-support'

const repo = path.resolve(import.meta.dirname, '../..')

/** Every claim of content/claims, by id, as the compiler reads them. */
function claims(): Map<string, Claim> {
  const all = new Map<string, Claim>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.yaml')) for (const claim of (load(readFileSync(file, 'utf8'), { schema: CORE_SCHEMA }) as Claim[] | null) ?? []) all.set(claim.id, claim)
    }
  }
  walk(path.join(repo, 'content/claims'))
  return all
}
const CLAIMS = claims()
const LOCK = JSON.parse(readFileSync(path.join(repo, 'course.lock.json'), 'utf8')) as { entries: { key: string; version?: string }[] }
const LEVELS = POOL.levels.map((level) => level.id as PoolLevelId)

/** The text of markup, without its tags. */
const text = (markup: string) => markup.replace(/<[^>]+>/g, '')

describe('the parts list and the popover read one table', () => {
  test('on every level, the parts list’s lines are copy.ts’s rows, and each line’s popover is titled and worded from the same row', () => {
    for (const level of LEVELS) {
      const rows = partsOf(level)
      const lines = partRows(level)
      expect(lines.map((line) => line.id)).toEqual(rows.map((row) => row.id))
      expect(lines.map((line) => line.name)).toEqual(rows.map((row) => row.name))
      for (const row of rows) {
        const sheet = renderToStaticMarkup(h(PartPopover, { part: row, open: true }))
        expect(sheet).toContain(`data-part="${row.id}"`)
        // The trigger and the sheet's title are the row's name; the sheet's first line is the row's sentence.
        expect(text(sheet).startsWith(`${row.name}${row.name}`)).toBe(true)
        expect(sheet).toContain(row.sentence.replace(/'/g, '&#x27;'))
      }
    }
  })

  test('a region’s name on the diagram is its row’s popover: the running batch, the KV page pool and the free queue', () => {
    for (const id of ['batch', 'pool', 'free-queue']) {
      const markup = renderToStaticMarkup(h(PartName, { id }))
      expect(markup).toContain(`data-part="${id}"`)
      expect(markup).toContain(`>${partOf(id)?.name}</button>`)
      expect(markup).toContain('aria-haspopup="dialog"')
    }
  })
})

describe('each part’s source', () => {
  test('every claim a part names exists, and its link is the file and symbol at the pinned commit', () => {
    const vllm = LOCK.entries.find((entry) => entry.key === 'vllm')?.version
    expect(vllm).toBeDefined()
    for (const part of POOL_PARTS) {
      if (part.claim === undefined) continue
      const claim = CLAIMS.get(part.claim)
      expect(claim, part.id).toBeDefined()
      if (claim === undefined || claim.source === undefined) throw new Error(`${part.claim} has no source`)
      const lines = renderToStaticMarkup(h(SourceLines, { claim }))
      expect(lines).toContain(`href="${claim.source.url}"`)
      expect(lines).toContain(claim.tag)
      if (claim.pin === 'vllm') expect(claim.source.url).toContain(`/blob/v${vllm}/`)
    }
  })

  test('the parts the engine has no source for say "model object"', () => {
    const unsourced = POOL_PARTS.filter((part) => part.claim === undefined)
    expect(unsourced.map((part) => part.id)).toEqual(['cost', 'conversation'])
    for (const part of unsourced) {
      const sheet = renderToStaticMarkup(h(PartPopover, { part, open: true }))
      expect(sheet).toContain('data-model-object=""')
      expect(sheet).toContain(MODEL_OBJECT)
    }
    // A sourced part waits for its source, and never says model object.
    const pool = renderToStaticMarkup(h(PartPopover, { part: partOf('pool') ?? POOL_PARTS[0], open: true }))
    expect(pool).not.toContain('data-model-object')
  })

  test('a KV page’s popover names vLLM’s class, BlockPool, once, with the page’s own state and owner', () => {
    const view = poolSession.view(poolInit(practiceOf('one-group')))
    const markup = renderToStaticMarkup(h(PagePick, { view, page: 3, onClose: () => undefined }))
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('>KV page<')
    expect(text(markup).match(/BlockPool/g)?.length).toBe(1)
    expect(text(markup)).toContain('Page 4: free. Nobody holds it.')
  })

  test('the source is a lazy chunk: only PartPopover reaches PartSource, and only through import()', () => {
    const popover = readFileSync(path.join(repo, 'src/games/kit/PartPopover.tsx'), 'utf8')
    expect(popover).toContain("lazy(() => import('./PartSource'))")
    const statics: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(file)
        else if (/\.tsx?$/.test(entry.name) && /from\s+['"][^'"]*PartSource['"]/.test(readFileSync(file, 'utf8'))) statics.push(path.relative(repo, file))
      }
    }
    walk(path.join(repo, 'src'))
    expect(statics).toEqual([])
  })
})

describe('the pool’s Step in the dock', () => {
  test('takes the first option of each decision, and every move it takes is legal, to the end of every level', () => {
    for (const level of LEVELS) {
      let state = poolInit(practiceOf(level))
      let moves = 0
      while (!poolSession.done(state)) {
        const step = poolStep(poolSession.view(state))
        expect(step, `${level} after ${moves} moves`).not.toBeNull()
        if (step === null) break
        state = poolReduce(state, step)
        moves += 1
        if (moves > 5000) throw new Error(`${level} never ended`)
      }
      expect(poolSession.done(state)).toBe(true)
    }
  })

  test('evicts the pages at the front of the free queue, which is the engine’s own order', () => {
    const view = poolSession.view(poolInit(practiceOf('evict')))
    const ask = { kind: 'evict', need: 2, for: 'admit', target: 0, candidates: [9, 4, 7], price: [], spoken: [], soon: [], seated: [] } as const
    expect(poolStep({ ...view, ask })).toEqual({ t: 'evict', pages: [4, 9] })
  })
})
