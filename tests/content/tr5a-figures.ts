/*
 * The four figures of TR5a's lessons, drawn from the hybrid KV model by the functions below, so that a figure is the model's own
 * numbers and a change to the model that moves one makes `tests/content/tr5a-module.test.ts` say which figure is stale.
 *
 *   bun tests/content/tr5a-figures.ts      writes public/figures/tr5a/*.svg from the model
 *
 * A figure is drawn in the diagram language (REDESIGN §2.8, `tests/content/figure-kit.ts`): a page is a square cell with its glyph. A page
 * in use is blue, a cached one yellow, one shared by a prefix hit green, an adapter's brown, and a free or let-go one a dashed hollow cell.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { acceptedEdges, adapterRows, blockTables, hitLoop, HIT_A, HIT_B, TWO_KINDS } from './tr5a-demos.ts'
import type { Cached } from './tr5a-demos.ts'
import { Fig, INK } from './figure-kit.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1: the block tables of the design document's request                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A kept block is a blue cell with the page that holds it. A block that the group has let go is a dashed hollow cell, struck through. */
export function l1BlockTables(): string {
  const X0 = 52
  const STEP = 44
  const W = 38
  const H = 26
  const Y0 = 26
  const ROW = 58
  const names: Record<string, string> = { full0: 'full', sw0: 'sliding', sw1: 'sliding' }
  const x = (i: number) => X0 + STEP * i
  const y = (r: number) => Y0 + ROW * r
  const tables = blockTables(112)
  const fig = new Fig(
    Y0 + ROW * tables.length + 40,
    "The block tables of the design document's request in three groups, with the blocks each group keeps filled in",
    "Three rows of squares, one for each group, with a square for each of the request's seven blocks. The full group keeps all seven. Each sliding group has let go of the first five, drawn dashed and struck through, and keeps the last two. A kept square carries the page that holds it.",
  )
  fig.text(4, Y0 - 8, 'block', { mono: true })
  tables.forEach((row, r) => {
    fig.text(4, y(r) + 17, names[row.id], { bold: true })
    let page = 0
    let first = -1
    row.held.forEach((keeps, i) => {
      if (r === 0) fig.text(x(i) + W / 2, Y0 - 8, String(i), { mono: true, anchor: 'middle' })
      if (keeps) {
        if (first < 0) first = i
        fig.mark('blue', x(i), y(r), W, H, { kind: 'cell', label: `p${row.pages[page++]}` })
      } else {
        fig.idle(x(i), y(r), W, H, 'cell')
        fig.rule(`M${x(i)} ${y(r) + H}L${x(i) + W} ${y(r)}`)
      }
    })
    const kept = row.held.filter(Boolean).length
    fig.dim(x(first), x(row.held.length - 1) + W, y(r) + H + 10, `${kept} kept`, { below: true, anchor: 'start' })
  })
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'page held' },
      { slot: 'white', word: 'block let go', hollow: true },
    ],
    4,
    Y0 + ROW * tables.length + 4,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 2: one block, many pieces                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The memory layout of the same request: a page is a row of ten pieces, one in each buffer, and the three groups' pages are rows of one pool. */
export function l2Layout(): string {
  const groups = blockTables(112)
  const layers = TWO_KINDS.groups[0].layers
  const X0 = 102
  const STEP = 25
  const W = 23
  const H = 12
  const Y0 = 50
  const PITCH = 13
  const GAP = 7
  const NAMES = ['full', 'sliding', 'sliding']
  const pageCount = groups.reduce((sum, g) => sum + g.pages.length, 0)
  const height = Y0 + PITCH * pageCount + GAP * (groups.length - 1) + 36
  const fig = new Fig(
    height,
    "The memory layout of the design document's request: a page is a row of pieces, one in each of the ten buffers that the layers of a group share with the other groups",
    "A grid with a row for each of the request's eleven pages and a column for each of ten buffers. The first seven rows are the full group's pages, the next two are the first sliding group's and the last two are the second sliding group's, each set apart by a gap and a dimension line. A page is one piece in each buffer, so one page id names ten pieces. A buffer holds one layer of each of the three groups.",
  )
  fig.text(X0, 11, 'each buffer holds one layer of every group')
  fig.dim(X0, X0 + STEP * layers - (STEP - W), 30, `${layers} buffers`, { anchor: 'start' })
  for (let c = 0; c < layers; c++) fig.text(X0 + STEP * c + W / 2, Y0 - 5, String(c), { mono: true, anchor: 'middle' })
  let row = 0
  groups.forEach((g, gi) => {
    const top = Y0 + PITCH * row + GAP * gi
    for (const page of g.pages) {
      const y = Y0 + PITCH * row + GAP * gi
      fig.text(X0 - 6, y + 10, `p${page}`, { mono: true, anchor: 'end' })
      for (let c = 0; c < layers; c++) fig.mark('blue', X0 + STEP * c, y, W, H, { kind: 'cell' })
      row++
    }
    const bottom = Y0 + PITCH * row + GAP * gi - 1
    fig.vdim(X0 - 40, top, bottom, NAMES[gi])
  })
  const bottom = fig.legend([{ slot: 'blue', word: 'one piece of a page' }], 4, height - 28)
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 3: the edges that every group accepts                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Two caches of one prompt of eleven blocks. A cached block is a yellow hatched cell, an uncached one a dashed hollow cell, and a cached
 * block inside the hit that every group accepts is green. A bar under a row is an edge that the group accepts, and a dashed vertical line is
 * an edge that all three accept.
 */
export function l3Intersection(): string {
  const X0 = 58
  const STEP = 26
  const W = 23
  const H = 14
  const PITCH = 30
  const BLOCKS = 11
  const PANEL = 152
  const rowsOf = (c: Cached) => [
    { label: 'full', cached: c.full, edges: acceptedEdges(c).full },
    { label: 'sliding', cached: c.sw0, edges: acceptedEdges(c).sw0 },
    { label: 'sliding', cached: c.sw1, edges: acceptedEdges(c).sw1 },
  ]
  const edgeX = (m: number) => X0 + STEP * m - (STEP - W) / 2
  const fig = new Fig(
    PANEL * 2 + 50,
    'Two caches of the same prompt, with the edges that each of the three groups accepts marked under its row',
    'Two panels, each with three rows of squares, one for the full group and one for each sliding group, and a square for each of the prompt\'s eleven blocks. A filled square is a cached block. A small bar under a row is an edge that the group accepts. In the first panel the three groups share one edge, marked by a vertical line. In the second panel they share none.',
  )
  ;[
    { title: 'the sliding groups hold different runs', cached: HIT_A },
    { title: 'the first has a gap in its run', cached: HIT_B },
  ].forEach(({ title, cached }, p) => {
    const top = 2 + PANEL * p
    const hit = hitLoop(cached)
    fig.text(4, top + 11, `${p === 0 ? 'A' : 'B'}: ${title}`, { bold: true })
    for (let b = 0; b < BLOCKS; b++) fig.text(X0 + STEP * b + W / 2, top + 28, String(b), { mono: true, anchor: 'middle' })
    rowsOf(cached).forEach((row, r) => {
      const y = top + 34 + PITCH * r
      fig.text(4, y + 11, row.label, { bold: true })
      const accepted = row.edges
      for (let b = 0; b < BLOCKS; b++) {
        if (!row.cached.includes(b)) fig.idle(X0 + STEP * b, y, W, H, 'cell')
        else fig.mark(b < hit.blocks ? 'green' : 'yellow', X0 + STEP * b, y, W, H, { kind: 'cell', noGlyph: false })
      }
      for (const m of accepted) fig.add(`<rect class="edge" x="${edgeX(m) - 1}" y="${y + H + 3}" width="2" height="9" fill="${INK}"/>`)
    })
    const yTo = top + 34 + PITCH * 2 + H + 14
    if (hit.blocks > 0) {
      fig.rule(`M${edgeX(hit.blocks)} ${top + 31}V${yTo}`, true)
      fig.dim(X0 - (STEP - W) / 2, edgeX(hit.blocks), yTo + 12, `the hit: ${hit.blocks} blocks`, { below: true, anchor: 'end' })
    } else {
      fig.text(X0, yTo + 22, 'no edge that all three accept')
    }
  })
  fig.add(`<rect class="edge-key" x="${5}" y="${PANEL * 2 + 6}" width="2" height="9" fill="${INK}"/>`)
  fig.text(12, PANEL * 2 + 14, 'an edge the group accepts')
  const bottom = fig.legend(
    [
      { slot: 'green', word: 'shared by the hit' },
      { slot: 'yellow', word: 'cached' },
      { slot: 'white', word: 'not cached', hollow: true },
    ],
    4,
    PANEL * 2 + 26,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 4: a slot as wide as the largest adapter                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Adapters of three ranks as the pages they take, each in a row as wide as a slot sized for the largest. A brown cell is a page the adapter takes. */
export function l4SlotWidth(): string {
  const rows = adapterRows()
  const widest = rows[rows.length - 1]
  const X0 = 60
  const STEP = 11
  const W = 10
  const H = 16
  const Y0 = 40
  const PITCH = 48
  const right = X0 + STEP * (widest.pages - 1) + W
  const fig = new Fig(
    Y0 + PITCH * rows.length + 30,
    'Three adapters of different ranks drawn as the pages they take, each in a row as wide as a slot sized for the largest rank',
    'Three rows of small squares, one for each rank, each as wide as a slot sized for the largest. In each row the squares that the adapter\'s pages fill are solid, and the rest of the slot\'s width is dashed and empty. The smallest adapter fills a small part of its row, the middle one a little more, and the largest fills it.',
  )
  fig.dim(X0, right, 16, `a slot sized for the largest rank, ${widest.pages} pages wide`, { anchor: 'start' })
  rows.forEach((row, r) => {
    const y = Y0 + PITCH * r
    fig.text(4, y + 12, `rank ${row.rank}`, { bold: true })
    for (let i = 0; i < widest.pages; i++) {
      if (i < row.pages) fig.mark('brown', X0 + STEP * i, y, W, H, { kind: 'cell', noGlyph: true })
      else fig.idle(X0 + STEP * i, y, W, H, 'cell')
    }
    fig.dim(X0, X0 + STEP * (row.pages - 1) + W, y + H + 10, `${row.pages} pages`, { below: true, anchor: 'start' })
  })
  const bottom = fig.legend(
    [
      { slot: 'brown', word: "the adapter's page" },
      { slot: 'white', word: 'unused', hollow: true },
    ],
    4,
    Y0 + PITCH * rows.length + 4,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/** Each figure's published path under `public/`, and the function that draws it. */
export const FIGURES: Readonly<Record<string, () => string>> = {
  'figures/tr5a/l1-block-tables.svg': l1BlockTables,
  'figures/tr5a/l2-one-block-many-pieces.svg': l2Layout,
  'figures/tr5a/l3-intersection.svg': l3Intersection,
  'figures/tr5a/l4-slot-width.svg': l4SlotWidth,
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dirname, '../..')
  for (const [file, draw] of Object.entries(FIGURES)) {
    writeFileSync(path.join(root, 'public', file), draw())
    console.log(`wrote public/${file}`)
  }
}
