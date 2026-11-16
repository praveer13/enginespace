/*
 * Every figure under public/figures is drawn in the diagram language (REDESIGN §2.8): the six code colours, each with its glyph or hatch,
 * the graticule, dimension lines with their values, mono labels, and words that stay inside the figure and legible at the column's width.
 * The files are the ones the generators draw (`tr2-figures.ts`, `tr5a-figures.ts`, `tr6-figure.ts`, `authored-figures.ts`), so a file that is
 * not what its function draws, or a file with no function, fails here.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { findBanned } from '../../src/copy/banned'
import { SLOTS } from '../../src/design/tokens'
import { AUTHORED } from './authored-figures.ts'
import { ALLOWED_COLOURS, MIN_TEXT, MONO, SANS, WIDTH, textWidth } from './figure-kit.ts'
import { FIGURES as TR2 } from './tr2-figures.ts'
import { FIGURES as TR5A } from './tr5a-figures.ts'
import { FIGURE_PATH, maskTimelineSvg } from './tr6-figure.ts'

const ROOT = path.resolve(import.meta.dir, '../..')
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8')

/** Each file under public/ and the function that draws it. */
const DRAWN: Record<string, () => string> = {
  ...Object.fromEntries(Object.entries(TR2).map(([file, draw]) => [`figures/tr2/${file}`, draw])),
  ...TR5A,
  [FIGURE_PATH.replace(/^public\//, '')]: maskTimelineSvg,
  ...AUTHORED,
}

const filesUnder = (dir: string): string[] =>
  readdirSync(path.join(ROOT, 'public', dir)).flatMap((name) => {
    const rel = `${dir}/${name}`
    return statSync(path.join(ROOT, 'public', rel)).isDirectory() ? filesUnder(rel) : [rel]
  })

/** The least number of dimension lines of a figure that names an interval: a gap, a total, a span of pages. */
const DIMENSIONS: Record<string, number> = {
  'figures/tr1/l1-boundaries.svg': 0,
  'figures/tr1/l3-mini-sglang.svg': 0,
  'figures/tr1/l5-vllm-threads.svg': 0,
  'figures/tr1/l6-overlap.svg': 0,
  'figures/tr1/l7-abort.svg': 0,
  'figures/tr8/l1-slip.svg': 1,
  'figures/tr2/l1-one-step.svg': 1,
  'figures/tr2/l2-budget.svg': 5,
  'figures/tr2/l3-overlap.svg': 4,
  'figures/tr2/l5-comb.svg': 3,
  'figures/tr2/l5-padding.svg': 1,
  'figures/tr2/l6-memory.svg': 5,
  'figures/tr2/l7-buckets.svg': 1,
  'figures/tr5a/l1-block-tables.svg': 3,
  'figures/tr5a/l2-one-block-many-pieces.svg': 4,
  'figures/tr5a/l3-intersection.svg': 1,
  'figures/tr5a/l4-slot-width.svg': 4,
  'figures/tr6/l5-mask-timeline.svg': 3,
}

const texts = (svg: string): { x: number; size: number; anchor: string; text: string }[] =>
  [...svg.matchAll(/<text x="([\d.-]+)"[^>]*font-size="(\d+)"[^>]*text-anchor="(\w+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({ x: Number(m[1]), size: Number(m[2]), anchor: m[3], text: m[4].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') }))

describe('every figure file is one that a function draws', () => {
  test('the files under public/figures are exactly the drawn ones', () => {
    expect(filesUnder('figures').sort()).toEqual(Object.keys(DRAWN).sort())
  })

  for (const [file, draw] of Object.entries(DRAWN)) {
    test(`${file} is what its function draws`, () => {
      expect(read(`public/${file}`)).toBe(draw())
    })
  }
})

describe('every figure is in the diagram language', () => {
  for (const file of Object.keys(DRAWN)) {
    const svg = read(`public/${file}`)

    test(`${file}: the six colours only, in the page's own faces`, () => {
      const hexes = [...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase())
      expect(hexes.length).toBeGreaterThan(0)
      for (const hex of hexes) expect([file, ALLOWED_COLOURS.includes(hex)]).toEqual([file, true])
      expect(svg).not.toMatch(/rgba?\(|hsla?\(|currentColor/)
      const faces = new Set([...svg.matchAll(/font-family="([^"]+)"/g)].map((m) => m[1]))
      for (const face of faces) expect([SANS, MONO]).toContain(face)
    })

    test(`${file}: a title and a description, and a viewBox of the column's width`, () => {
      expect(/<title>([\s\S]+?)<\/title>/.exec(svg)?.[1].trim().length ?? 0).toBeGreaterThan(8)
      expect(/<desc>([\s\S]+?)<\/desc>/.exec(svg)?.[1].trim().length ?? 0).toBeGreaterThan(40)
      expect(svg).toMatch(new RegExp(`viewBox="0 0 ${WIDTH} \\d+" width="${WIDTH}"`))
    })

    test(`${file}: each code colour it uses has its glyph in the legend, and its hatch where the code gives one`, () => {
      const used = SLOTS.filter((slot) => svg.includes(`data-slot="${slot}"`))
      expect(used.length).toBeGreaterThan(0)
      for (const slot of used) {
        expect([file, slot, new RegExp(`<g class="key[^"]*" data-slot="${slot}"`).test(svg)]).toEqual([file, slot, true])
        expect([file, slot, new RegExp(`<g class="glyph" data-slot="${slot}"`).test(svg)]).toEqual([file, slot, true])
        if (slot === 'yellow' || slot === 'brown') expect([file, slot, svg.includes(`fill="url(#code-${slot})"`)]).toEqual([file, slot, true])
      }
    })

    test(`${file}: every word is at least 10 px at the column's width, and inside the figure`, () => {
      const words = texts(svg)
      expect(words.length).toBeGreaterThan(3)
      for (const w of words) {
        expect([file, w.text, w.size >= MIN_TEXT]).toEqual([file, w.text, true])
        const width = textWidth(w.text, w.size)
        const left = w.anchor === 'start' ? w.x : w.anchor === 'end' ? w.x - width : w.x - width / 2
        expect([file, w.text, left >= -1, left + width <= WIDTH + 1]).toEqual([file, w.text, true, true])
      }
    })

    test(`${file}: it marks an interval with a dimension line and its value`, () => {
      const dims = [...svg.matchAll(/<g class="dim" data-value="([^"]+)">/g)].map((m) => m[1])
      expect(dims.length).toBeGreaterThanOrEqual(DIMENSIONS[file])
      for (const value of dims) expect(svg).toContain(`>${value.replace(/&amp;/g, '&')}</text>`)
    })

    test(`${file}: no word of the kitchen in it`, () => {
      const text = svg.replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/<[^>]+>/g, ' ')
      expect(findBanned(text)).toEqual([])
    })
  }
})

describe('the graticule is a time axis or a cell grid', () => {
  test('the figures that are drawn to a scale carry it, at 8 px and 40 px', () => {
    for (const file of ['figures/tr2/l1-one-step.svg', 'figures/tr2/l3-overlap.svg', 'figures/tr6/l5-mask-timeline.svg', 'figures/tr8/l1-slip.svg']) {
      const svg = read(`public/${file}`)
      expect(svg).toContain('class="graticule"')
      expect(svg).toMatch(/stroke-width="0\.5"/)
      expect(svg).toMatch(/stroke-width="0\.75"/)
    }
  })
})
