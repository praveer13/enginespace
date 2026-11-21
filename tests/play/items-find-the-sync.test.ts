/*
 * W2b-T29: `tr0.find-the-sync`. Every row of the rule table is a claim: each claim exists in content/claims/tr0.yaml, is measured and is
 * pinned to torch, and no row rests on the one claim that is [unverified] (that printing a GPU tensor waits). Each key is then read again
 * from the lines that the ticket prints, by patterns written here and not taken from the table.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { bandAcceptance, bandedSeeds, BAND_FLOOR, drawInBand, FAMILIES, familyById, fixedSeeds, LEVELS, measureBlind, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { findTheSync } from '@es/play/items/families/tr0/find-the-sync'
import { QUEUING, SYNC_RULES, WAITING } from '@es/play/items/families/tr0/sync-rules'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { linesOf } from './items-tr0-support.ts'

setDefaultTimeout(60_000)

const root = path.resolve(import.meta.dirname, '../..')
const SEEDS = fixedSeeds(300, 0x5c1)
const claims = load(readFileSync(path.join(root, 'content/claims/tr0.yaml'), 'utf8')) as { id: string; tag: string; pin: string; text: string }[]
const claim = (id: string) => claims.find((candidate) => candidate.id === id)

/** What PyTorch 2.14's documents say waits, as patterns on a line: written here from the claims, not from the table. */
const WAITS = [/\.item\(\)/, /\.tolist\(\)/, /\.cpu\(\)/, /\.to\('cpu'\)/, /^torch\.cuda\.synchronize\(\)$/]
const waits = (line: string): boolean => WAITS.some((pattern) => pattern.test(line.trim()))

describe('the rule table', () => {
  test('every row is a claim: each claim exists, is measured, and is pinned to torch', () => {
    expect(SYNC_RULES.length).toBeGreaterThanOrEqual(10)
    for (const rule of SYNC_RULES) {
      expect(rule.claims.length).toBeGreaterThan(0)
      for (const id of rule.claims) {
        const found = claim(id)
        expect(found, `${rule.id}: ${id}`).toBeDefined()
        expect(found?.tag).toBe('measured')
        expect(found?.pin).toBe('torch')
      }
    }
  })

  test('rests on nothing that no page says: printing a GPU tensor is not a row, and no claim of a row is the unverified one', () => {
    expect(claim('torch.cuda.print-waits')?.tag).toBe('unverified')
    for (const rule of SYNC_RULES) {
      expect(rule.claims).not.toContain('torch.cuda.print-waits')
      expect(rule.line('x', 'y')).not.toMatch(/print/)
    }
  })

  test('a waiting row cites a claim that is about a call that waits or copies off the GPU, and a queuing row one about work that is queued or moves no data', () => {
    const waitingIds = ['torch.cuda.item-synchronizes', 'torch.tolist.moves-to-cpu', 'torch.cpu.copies', 'torch.to.copies', 'torch.cuda.non-blocking', 'torch.cuda.synchronize-waits']
    const queuingIds = ['torch.cuda.enqueued', 'torch.cuda.async-by-default', 'torch.views.no-data-moves', 'torch.views.view-ops']
    for (const rule of WAITING) expect(rule.claims.some((id) => waitingIds.includes(id))).toBe(true)
    for (const rule of QUEUING) expect(rule.claims.every((id) => queuingIds.includes(id))).toBe(true)
    expect(claim('torch.cuda.item-synchronizes')?.text).toContain('.item()')
    expect(claim('torch.cuda.enqueued')?.text).toContain('x.sum()')
    expect(WAITING.map((rule) => rule.id)).toEqual(['item', 'tolist', 'cpu', 'to-cpu', 'synchronize'])
  })

  test('says "waits" only for the rows whose line an independent reading takes for a wait, and the words of a row hold no digit', () => {
    for (const rule of SYNC_RULES) {
      expect(waits(rule.line('x', 'y'))).toBe(rule.waits)
      expect(rule.why).not.toMatch(/\d/)
    }
  })
})

/** A ticket's waits by the patterns above: the loop's passes read from its head, the body from its indentation. */
function derive(item: Item): number {
  const lines = linesOf(item)
  const head = lines[0].match(/^for layer in range\((\d+)\):$/)
  expect(head).not.toBeNull()
  const passes = Number(head?.[1])
  const body = lines.slice(1).filter((line) => line.startsWith('    '))
  const after = lines.slice(1).filter((line) => !line.startsWith('    '))
  return passes * body.filter(waits).length + after.filter(waits).length
}

describe('the family', () => {
  test('is registered, names the KC of the graph, and has a numeric variant at every level', () => {
    expect(familyById('tr0.find-the-sync')).toBe(findTheSync)
    expect(FAMILIES).toContain(findTheSync)
    const graph = readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8')
    const ids = new Set([...graph.matchAll(/^- id: (\S+)/gm)].map((match) => match[1]))
    for (const kc of findTheSync.kcs) expect(ids.has(kc)).toBe(true)
    for (const level of LEVELS) expect(offeredAt(findTheSync, level).map((variant) => findTheSync.make(SEEDS[0], level, variant.id).answer.kind).sort()).toEqual(['choice', 'numeric'])
  })
})

describe('the keys', () => {
  test.each(LEVELS)('at level %p, which-line: exactly one printed line waits, and it is the key; the place is the draw\'s', (level) => {
    const places = new Array<number>(5).fill(0)
    for (const seed of SEEDS) {
      const item = findTheSync.make(seed, level, 'which-line')
      const lines = linesOf(item).filter((line) => (level >= 2 ? line.startsWith('    ') : true))
      expect(lines).toHaveLength(5)
      const at = lines.flatMap((line, place) => (waits(line) ? [place] : []))
      expect(at).toHaveLength(1)
      expect(item.answer.kind === 'choice' && item.answer.correct).toBe(`line-${at[0] + 1}`)
      places[at[0]] += 1
      if (item.answer.kind === 'choice') {
        const correct = item.answer.correct
        const key = item.answer.options.find((option) => option.id === correct)
        expect(key?.text).toEqual([{ t: 'code', code: lines[at[0]].trim() }])
      }
    }
    for (const count of places) {
      expect(count).toBeGreaterThan(SEEDS.length / 5 / 1.7)
      expect(count).toBeLessThan(SEEDS.length / 5 / 0.6)
    }
  })

  test.each(LEVELS)('at level %p, count: the key is the passes times the waits of the body, plus the waits after the loop', (level) => {
    for (const seed of SEEDS) {
      const item = findTheSync.make(seed, level, 'count')
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'waits', truth: derive(item) })
      // The stem prints the passes as a number, and it is the loop's.
      const passes = item.stem.find((part) => part.t === 'num')
      expect(passes?.t === 'num' && passes.value).toBe(Number(linesOf(item)[0].match(/\((\d+)\)/)?.[1]))
    }
  })

  test('the key is never the number of passes, and from level 2 a wait can follow the loop', () => {
    let after = 0
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        const item = findTheSync.make(seed, level, 'count')
        const passes = Number(linesOf(item)[0].match(/\((\d+)\)/)?.[1])
        expect(item.answer.kind === 'numeric' && item.answer.truth).not.toBe(passes)
        if (level <= 1) expect(linesOf(item).slice(1).every((line) => line.startsWith('    '))).toBe(true)
        else if (linesOf(item).some((line, at) => at > 0 && !line.startsWith('    ') && waits(line))) after += 1
      }
    }
    expect(after).toBeGreaterThan(SEEDS.length / 2)
  })

  test('no line prints a GPU tensor or leans on a call that no claim states', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const level of LEVELS) {
        for (const variant of offeredAt(findTheSync, level)) {
          for (const line of linesOf(findTheSync.make(seed, level, variant.id))) expect(line).not.toMatch(/print|float\(|int\(|if /)
        }
      }
    }
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const variant of offeredAt(findTheSync, level)) {
        const item = findTheSync.make(seed, level, variant.id)
        expect(findTheSync.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(findTheSync, item, { seed, level, variant: variant.id })).toEqual([])
        expect(findTheSync.grade(item, keyOf(item)).ok).toBe(true)
        expect(findTheSync.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('has no digit in a sentence, every option says why, and a lure names the misconception it encodes', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        for (const variant of offeredAt(findTheSync, level)) {
          const item = findTheSync.make(seed, level, variant.id)
          const sentences = [item.stem, ...item.worked.map((step) => step.text), ...findTheSync.solution(item).map((step) => step.text)]
          for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
          if (item.answer.kind === 'choice') {
            for (const option of item.answer.options) {
              expect(plain(option.why).length).toBeGreaterThan(30)
              if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
              else expect(option.miss).toMatch(/^tr0\.find-the-sync\.[a-z-]+$/)
            }
          } else expect(findTheSync.solution(item).at(-1)?.result?.value).toBe(item.answer.truth)
        }
      }
    }
  })

  test('level 0 shows a whole solution of another scene, level 1 the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['which-line', 'count']) {
        expect(findTheSync.make(seed, 0, variant).worked.length).toBeGreaterThanOrEqual(2)
        const one = findTheSync.make(seed, 1, variant)
        expect(one.worked).toHaveLength(1)
        expect(one.worked[0].result).toBeUndefined()
        expect(findTheSync.make(seed, 2, variant).worked).toEqual([])
      }
    }
  })
})

describe('diagnoses', () => {
  test('a wrong count that a rule recognises is named', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      const item = findTheSync.make(seed, 3, 'count')
      if (item.answer.kind !== 'numeric') continue
      for (let value = 0; value <= 80; value += 1) {
        if (value === item.answer.truth) continue
        const graded = findTheSync.grade(item, { kind: 'numeric', value })
        expect(graded.ok).toBe(false)
        if (graded.diagnosis !== undefined) seen.add(graded.diagnosis.id)
      }
    }
    expect([...seen].sort()).toEqual(['tr0.find-the-sync.after-forgotten', 'tr0.find-the-sync.every-line', 'tr0.find-the-sync.loop-once', 'tr0.find-the-sync.passes-only'])
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(findTheSync, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(50, 4)) expect(findTheSync.band(drawInBand(findTheSync, level, entropy).seed, level)).toBe(true)
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(findTheSync, level, bandedSeeds(findTheSync, level, 1000))
      expect(report.over).toEqual([])
    }
  })
})
