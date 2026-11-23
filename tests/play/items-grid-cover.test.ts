/*
 * W2b-T29: `tr0.grid-cover`. Each key is read again from the numbers that the stem prints, by a brute-force launch written here: every
 * program of the grid runs every lane, a lane is masked when its offset is not below the size, and an element is covered by the program
 * that has an unmasked lane on it. The model's `gridCoverage` and `programCells` are held to the same numbers.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { bandAcceptance, bandedSeeds, BAND_FLOOR, drawInBand, FAMILIES, familyById, fixedSeeds, LEVELS, measureBlind, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { gridCover } from '@es/play/items/families/tr0/grid-cover'
import { cdiv, gridCoverage, programCells } from '@es/sim/tensor'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'

setDefaultTimeout(60_000)

const root = path.resolve(import.meta.dirname, '../..')
const SEEDS = fixedSeeds(300, 0x6c1)

/** The numbers the stem prints, in order, and the code parts. */
const nums = (item: Item): number[] => item.stem.flatMap((part) => (part.t === 'num' ? [part.value] : []))
const codes = (item: Item): string[] => item.stem.flatMap((part) => (part.t === 'code' ? [part.code] : []))
const words = (item: Item): string => item.stem.flatMap((part) => (part.t === 'text' ? [part.text] : [])).join('')

interface Read {
  shape: number[]
  block: number[]
  /** The programs along each dimension, when the stem prints them. */
  grid: number[] | null
}

/** The launch as a reader takes it from the stem: sizes and BLOCKs in the order printed, then the grid if there is one. */
function read(item: Item): Read {
  const n = nums(item)
  const two = /by/.test(words(item))
  const printsGrid = /launch has|grid of the launch/.test(words(item))
  if (!two) return { shape: [n[0]], block: [n[1]], grid: printsGrid ? [n[2]] : null }
  return { shape: [n[0], n[1]], block: [n[2], n[3]], grid: printsGrid ? [n[4], n[5]] : null }
}

/** Every program runs every lane: the lanes that are not masked, and where the unmasked ones fall. */
function launch(shape: number[], block: number[], grid: number[]): { lanes: number; masked: number; covers: Map<string, string[]> } {
  let masked = 0
  let lanes = 0
  const covers = new Map<string, string[]>()
  const runDim = (d: number, pid: number[], lane: number[]): void => {
    if (d === shape.length) {
      lanes += 1
      const offsets = lane.map((l, k) => pid[k] * block[k] + l)
      if (offsets.some((o, k) => o >= shape[k])) masked += 1
      else covers.set(offsets.join(','), [...(covers.get(offsets.join(',')) ?? []), pid.join(',')])
      return
    }
    for (let l = 0; l < block[d]; l += 1) runDim(d + 1, pid, [...lane, l])
  }
  const runGrid = (d: number, pid: number[]): void => {
    if (d === shape.length) return runDim(0, pid, [])
    for (let p = 0; p < grid[d]; p += 1) runGrid(d + 1, [...pid, p])
  }
  runGrid(0, [])
  return { lanes, masked, covers }
}

const defaultGrid = (shape: number[], block: number[]): number[] => shape.map((size, d) => Math.ceil(size / block[d]))

describe('the family', () => {
  test('is registered, names the KCs of the graph, and has a numeric variant at every level', () => {
    expect(familyById('tr0.grid-cover')).toBe(gridCover)
    expect(FAMILIES).toContain(gridCover)
    const graph = readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8')
    const ids = new Set([...graph.matchAll(/^- id: (\S+)/gm)].map((match) => match[1]))
    for (const kc of gridCover.kcs) expect(ids.has(kc)).toBe(true)
    expect(gridCover.kcs).toEqual(['tr0.triton-program-model', 'tr0.triton-masks'])
    for (const level of LEVELS) {
      const kinds = offeredAt(gridCover, level).map((variant) => gridCover.make(SEEDS[0], level, variant.id).answer.kind)
      expect(kinds).toContain('numeric')
      expect(kinds).toContain('choice')
    }
  })

  test('every BLOCK it prints is a power of two, as tl.arange needs, and no dimension is a multiple of its BLOCK', () => {
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        for (const variant of offeredAt(gridCover, level)) {
          const { shape, block } = read(gridCover.make(seed, level, variant.id))
          for (const [d, b] of block.entries()) {
            expect(b & (b - 1)).toBe(0)
            expect(shape[d] % b).not.toBe(0)
          }
        }
      }
    }
  })
})

describe('the keys', () => {
  test.each(LEVELS)('at level %p, programs: the key is the programs of the default grid, counted by running it', (level) => {
    for (const seed of SEEDS) {
      const item = gridCover.make(seed, level, 'programs')
      const { shape, block } = read(item)
      const grid = defaultGrid(shape, block)
      const ran = launch(shape, block, grid)
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'programs', truth: grid.reduce((a, b) => a * b, 1) })
      expect(ran.lanes).toBe(grid.reduce((a, b) => a * b, 1) * block.reduce((a, b) => a * b, 1))
      const model = gridCoverage(shape, block)
      expect('error' in model ? -1 : model.programs).toBe(item.answer.kind === 'numeric' ? item.answer.truth : -2)
      expect(shape.map((n, d) => cdiv(n, block[d]))).toEqual(grid)
    }
  })

  test.each(LEVELS)('at level %p, masked: the key is the lanes that run past the end, counted by running the launch', (level) => {
    for (const seed of SEEDS) {
      const item = gridCover.make(seed, level, 'masked')
      const { shape, block, grid } = read(item)
      const used = grid ?? defaultGrid(shape, block)
      // At level 3 the grid is printed and is below the default along some dimension.
      expect(grid !== null).toBe(level === 3)
      if (level === 3) expect(used.some((g, d) => g < Math.ceil(shape[d] / block[d]))).toBe(true)
      const ran = launch(shape, block, used)
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'lanes', truth: ran.masked })
      expect(ran.masked).toBeGreaterThan(0)
    }
  })

  test.each(LEVELS)('at level %p, which-program: the key is the program with an unmasked lane on the element, or none', (level) => {
    const none: string[] = []
    for (const seed of SEEDS) {
      const item = gridCover.make(seed, level, 'which-program')
      const { shape, block, grid } = read(item)
      const at = codes(item).find((c) => /^\(\d/.test(c))?.slice(1, -1).split(',').map(Number) ?? []
      expect(at).toHaveLength(shape.length)
      const ran = launch(shape, block, grid ?? defaultGrid(shape, block))
      const cover = ran.covers.get(at.join(',')) ?? []
      expect(cover.length).toBeLessThanOrEqual(1)
      const key = item.answer.kind === 'choice' ? item.answer.correct : ''
      expect(key).toBe(cover.length === 0 ? 'none' : `p-${cover[0].split(',').join('-')}`)
      if (cover.length === 0) none.push(key)
      // The model's tiles say the same.
      const index = at.map((x, d) => Math.floor(x / block[d]))
      const tile = programCells(shape, block, index)
      expect('error' in tile ? false : tile.cells.some((cell) => cell.join() === at.join())).toBe(true)
      // The options are four programs of the grid and "none", the key among them once.
      if (item.answer.kind === 'choice') {
        expect(item.answer.options).toHaveLength(5)
        expect(item.answer.options.filter((option) => option.id === key)).toHaveLength(1)
        expect(item.answer.options.some((option) => option.id === 'none')).toBe(true)
      }
    }
    // "None" is right one time in five from level 2, and never before it.
    if (level < 2) expect(none).toHaveLength(0)
    else {
      expect(none.length).toBeGreaterThan(SEEDS.length / 5 / 1.7)
      expect(none.length).toBeLessThan(SEEDS.length / 5 / 0.6)
    }
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const variant of offeredAt(gridCover, level)) {
        const item = gridCover.make(seed, level, variant.id)
        expect(gridCover.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(gridCover, item, { seed, level, variant: variant.id })).toEqual([])
        expect(gridCover.grade(item, keyOf(item)).ok).toBe(true)
        expect(gridCover.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('has no digit in a sentence, every option says why, and a lure names the misconception it encodes', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        for (const variant of offeredAt(gridCover, level)) {
          const item = gridCover.make(seed, level, variant.id)
          const sentences = [item.stem, ...item.worked.map((step) => step.text), ...gridCover.solution(item).map((step) => step.text)]
          for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
          for (const given of item.givens) expect(given.value.t).not.toBe('text')
          if (item.answer.kind === 'choice') {
            for (const option of item.answer.options) {
              expect(plain(option.why).length).toBeGreaterThan(30)
              if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
              else expect(option.miss).toMatch(/^tr0\.grid-cover\.[a-z-]+$/)
            }
          } else expect(gridCover.solution(item).at(-1)?.result?.value).toBe(item.answer.truth)
          for (const part of item.stem) if (part.t === 'num') expect(part.tag).toBe('synthetic')
        }
      }
    }
  })

  test('level 0 shows a whole solution of another scene, level 1 the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['which-program', 'programs', 'masked']) {
        expect(gridCover.make(seed, 0, variant).worked.length).toBeGreaterThanOrEqual(2)
        const one = gridCover.make(seed, 1, variant)
        expect(one.worked).toHaveLength(1)
        expect(one.worked[0].result).toBeUndefined()
        expect(gridCover.make(seed, 2, variant).worked).toEqual([])
      }
    }
  })
})

describe('diagnoses', () => {
  test('a wrong number that a rule recognises is named', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      for (const variant of ['programs', 'masked'] as const) {
        const item = gridCover.make(seed, 2, variant)
        if (item.answer.kind !== 'numeric') continue
        for (let value = 0; value <= 600; value += 1) {
          if (value === item.answer.truth) continue
          const graded = gridCover.grade(item, { kind: 'numeric', value })
          expect(graded.ok).toBe(false)
          if (graded.diagnosis !== undefined) seen.add(graded.diagnosis.id)
        }
      }
    }
    expect([...seen].sort()).toEqual([
      'tr0.grid-cover.block-for-programs',
      'tr0.grid-cover.covered-for-masked',
      'tr0.grid-cover.lanes-for-masked',
      'tr0.grid-cover.one-dimension',
      'tr0.grid-cover.rounded-down',
    ])
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(gridCover, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(50, 4)) expect(gridCover.band(drawInBand(gridCover, level, entropy).seed, level)).toBe(true)
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(gridCover, level, bandedSeeds(gridCover, level, 1000))
      expect(report.over).toEqual([])
    }
  })
})
