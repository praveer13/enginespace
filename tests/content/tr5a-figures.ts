/*
 * The four figures of TR5a's lessons (W1-T25), drawn from the hybrid KV model by the functions below, so that a figure is the model's own
 * numbers and a change to the model that moves one makes `tests/content/tr5a-module.test.ts` say which figure is stale.
 *
 *   bun tests/content/tr5a-figures.ts      writes public/figures/tr5a/*.svg from the model
 *
 * A figure is drawn in the page's ink and nothing else (DESIGN.md; AGENTS.md rule 9): `currentColor` for every stroke and fill, shades by
 * `fill-opacity`, and no typeface of its own. Nothing in one is a colour, so nothing in one means a state by colour alone.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { acceptedEdges, adapterRows, blockTables, hitLoop, HIT_A, HIT_B, TWO_KINDS } from './tr5a-demos.ts'
import type { Cached } from './tr5a-demos.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1: the block tables of the design document's request                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A kept block is a square with a light fill and its page inside it. A block that the group has let go is dashed and struck through. */
export function l1BlockTables(): string {
  const X0 = 52
  const STEP = 42
  const W = 36
  const H = 26
  const Y0 = 22
  const ROW = 38
  const names: Record<string, string> = { full0: 'full', sw0: 'sliding', sw1: 'sliding' }
  const x = (i: number) => X0 + STEP * i
  const y = (r: number) => Y0 + ROW * r
  const held: string[] = []
  const gone: string[] = []
  const slash: string[] = []
  const pages: string[] = []
  const heads: string[] = []
  const labels: string[] = []
  blockTables(112).forEach((row, r) => {
    labels.push(`    <text x="4" y="${y(r) + 17}">${names[row.id]}</text>`)
    let page = 0
    row.held.forEach((keeps, i) => {
      if (r === 0) heads.push(`    <text x="${x(i) + W / 2}" y="13">${i}</text>`)
      if (keeps) {
        held.push(`    <rect x="${x(i)}" y="${y(r)}" width="${W}" height="${H}"/>`)
        pages.push(`    <text x="${x(i) + W / 2}" y="${y(r) + 17}">p${row.pages[page++]}</text>`)
      } else {
        gone.push(`    <rect x="${x(i)}" y="${y(r)}" width="${W}" height="${H}"/>`)
        slash.push(`M${x(i)} ${y(r) + H}L${x(i) + W} ${y(r)}`)
      }
    })
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 140" width="360" height="140" fill="none" stroke="currentColor" stroke-width="1.5">
  <title>The block tables of the design document's request in three groups, with the blocks each group keeps filled in</title>
  <desc>Three rows of squares, one for each group, with a square for each of the request's seven blocks. The full group keeps all seven. Each sliding group has let go of the first five, drawn dashed and struck through, and keeps the last two. A kept square carries the page that holds it.</desc>
  <g stroke="none" fill="currentColor" font-size="10" text-anchor="middle">
    <text x="22" y="13">block</text>
${heads.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="10">
${labels.join('\n')}
  </g>
  <g fill="currentColor" fill-opacity="0.16">
${held.join('\n')}
  </g>
  <g stroke-width="1" stroke-dasharray="3 3">
${gone.join('\n')}
  </g>
  <g stroke-width="1">
    <path d="${slash.join('')}"/>
  </g>
  <g stroke="none" fill="currentColor" font-size="10" text-anchor="middle">
${pages.join('\n')}
  </g>
</svg>
`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 2: one block, many pieces                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The memory layout of the same request: a page is a row of ten pieces, one in each buffer, and the three groups' pages are rows of one pool. */
export function l2Layout(): string {
  const groups = blockTables(112)
  const layers = TWO_KINDS.groups[0].layers
  const X0 = 112
  const STEP = 22
  const W = 20
  const H = 10
  const Y0 = 42
  const PITCH = 11
  const SHADE = [0.5, 0.28, 0.12]
  const NAMES = ['full', 'sliding', 'sliding']
  const cells: string[][] = [[], [], []]
  const ids: string[] = []
  const cols: string[] = []
  const braces: string[] = []
  const labels: string[] = []
  let row = 0
  groups.forEach((g, gi) => {
    const first = row
    for (const page of g.pages) {
      ids.push(`    <text x="${X0 - 6}" y="${Y0 + PITCH * row + 8}">p${page}</text>`)
      for (let c = 0; c < layers; c++) cells[gi].push(`    <rect x="${X0 + STEP * c}" y="${Y0 + PITCH * row}" width="${W}" height="${H}"/>`)
      row++
    }
    const top = Y0 + PITCH * first
    const bottom = Y0 + PITCH * row - 1
    braces.push(`M${X0 - 40} ${top}V${bottom}`)
    labels.push(`    <text x="${X0 - 46}" y="${(top + bottom) / 2 + 3}">${NAMES[gi]}</text>`)
  })
  for (let c = 0; c < layers; c++) cols.push(`    <text x="${X0 + STEP * c + W / 2}" y="${Y0 - 5}">${c}</text>`)
  const height = Y0 + PITCH * row + 8
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 ${height}" width="360" height="${height}" fill="none" stroke="currentColor" stroke-width="0.75">
  <title>The memory layout of the design document's request: a page is a row of pieces, one in each of the ten buffers that the layers of a group share with the other groups</title>
  <desc>A grid with a row for each of the request's eleven pages and a column for each of ten buffers. The first seven rows are the full group's pages, the next two are the first sliding group's and the last two are the second sliding group's, each set apart by a bracket and a lighter shade. A page is one piece in each buffer, so one page id names ten pieces. A buffer holds one layer of each of the three groups.</desc>
  <g stroke="none" fill="currentColor" font-size="10">
    <text x="${X0}" y="11">ten buffers, each shared by one layer</text>
    <text x="${X0}" y="22">of every group</text>
  </g>
  <g stroke="none" fill="currentColor" font-size="9" text-anchor="middle">
${cols.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="9" text-anchor="end">
${ids.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="10" text-anchor="end">
${labels.join('\n')}
  </g>
  <g stroke-width="1">
    <path d="${braces.join('')}"/>
  </g>
  <g fill="currentColor" fill-opacity="${SHADE[0]}">
${cells[0].join('\n')}
  </g>
  <g fill="currentColor" fill-opacity="${SHADE[1]}">
${cells[1].join('\n')}
  </g>
  <g fill="currentColor" fill-opacity="${SHADE[2]}">
${cells[2].join('\n')}
  </g>
</svg>
`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 3: the edges that every group accepts                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Two caches of one prompt of eleven blocks. A cached block is a square with a light fill, an uncached one is dashed. A triangle under a row is
 * an edge that the group accepts, and a dashed vertical line is an edge that all three accept.
 */
export function l3Intersection(): string {
  const X0 = 60
  const STEP = 25
  const W = 22
  const H = 14
  const PITCH = 28
  const BLOCKS = 11
  const PANEL = 130
  const rowsOf = (c: Cached) => [
    { label: 'full', cached: c.full, edges: acceptedEdges(c).full },
    { label: 'sliding', cached: c.sw0, edges: acceptedEdges(c).sw0 },
    { label: 'sliding', cached: c.sw1, edges: acceptedEdges(c).sw1 },
  ]
  const edgeX = (m: number) => X0 + STEP * m - (STEP - W) / 2
  const held: string[] = []
  const gone: string[] = []
  const marks: string[] = []
  const texts: string[] = []
  const heads: string[] = []
  const lines: string[] = []
  const notes: string[] = []
  ;[
    { title: 'the sliding groups hold different runs', cached: HIT_A },
    { title: 'the first has a gap in its run', cached: HIT_B },
  ].forEach(({ title, cached }, p) => {
    const top = 4 + PANEL * p
    texts.push(`    <text x="4" y="${top + 10}">${p === 0 ? 'A' : 'B'}: ${title}</text>`)
    for (let b = 0; b < BLOCKS; b++) heads.push(`    <text x="${X0 + STEP * b + W / 2}" y="${top + 24}">${b}</text>`)
    rowsOf(cached).forEach((row, r) => {
      const y = top + 30 + PITCH * r
      texts.push(`    <text x="4" y="${y + 11}">${row.label}</text>`)
      for (let b = 0; b < BLOCKS; b++) {
        const rect = `    <rect x="${X0 + STEP * b}" y="${y}" width="${W}" height="${H}"/>`
        ;(row.cached.includes(b) ? held : gone).push(rect)
      }
      for (const m of row.edges) marks.push(`M${edgeX(m) - 3} ${y + 23}L${edgeX(m)} ${y + 17}L${edgeX(m) + 3} ${y + 23}Z`)
    })
    const hit = hitLoop(cached)
    const yFrom = top + 28
    const yTo = top + 30 + PITCH * 2 + 25
    if (hit.blocks > 0) {
      lines.push(`M${edgeX(hit.blocks)} ${yFrom}V${yTo}`)
      notes.push(`    <text x="${edgeX(hit.blocks)}" y="${yTo + 11}">edge ${hit.blocks}</text>`)
    } else {
      notes.push(`    <text x="${X0 + (STEP * BLOCKS) / 2}" y="${yTo + 11}">no edge that all three accept</text>`)
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 ${PANEL * 2 + 4}" width="360" height="${PANEL * 2 + 4}" fill="none" stroke="currentColor" stroke-width="1.5">
  <title>Two caches of the same prompt, with the edges that each of the three groups accepts marked under its row</title>
  <desc>Two panels, each with three rows of squares, one for the full group and one for each sliding group, and a square for each of the prompt's eleven blocks. A filled square is a cached block. A small triangle under a row is an edge that the group accepts. In the first panel the three groups share one edge, marked by a vertical line. In the second panel they share none.</desc>
  <g stroke="none" fill="currentColor" font-size="10">
${texts.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="9" text-anchor="middle">
${heads.join('\n')}
  </g>
  <g fill="currentColor" fill-opacity="0.16">
${held.join('\n')}
  </g>
  <g stroke-width="1" stroke-dasharray="3 3">
${gone.join('\n')}
  </g>
  <g fill="currentColor" stroke="none">
    <path d="${marks.join('')}"/>
  </g>
  <g stroke-width="1" stroke-dasharray="4 3">
    <path d="${lines.join('')}"/>
  </g>
  <g stroke="none" fill="currentColor" font-size="10" text-anchor="middle">
${notes.join('\n')}
  </g>
</svg>
`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 4: a slot as wide as the largest adapter                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Adapters of three ranks as the pages they take, each in a row as wide as a slot sized for the largest. A solid square is a page the adapter takes. */
export function l4SlotWidth(): string {
  const rows = adapterRows()
  const widest = rows[rows.length - 1]
  const X0 = 60
  const STEP = 11
  const W = 10
  const H = 14
  const Y0 = 30
  const PITCH = 34
  const held: string[] = []
  const idle: string[] = []
  const texts: string[] = []
  rows.forEach((row, r) => {
    const y = Y0 + PITCH * r
    texts.push(`    <text x="4" y="${y + 9}">rank ${row.rank}</text>`)
    texts.push(`    <text x="4" y="${y + 21}">${row.pages} pages</text>`)
    for (let i = 0; i < widest.pages; i++) {
      const rect = `    <rect x="${X0 + STEP * i}" y="${y}" width="${W}" height="${H}"/>`
      ;(i < row.pages ? held : idle).push(rect)
    }
  })
  const right = X0 + STEP * (widest.pages - 1) + W
  const height = Y0 + PITCH * rows.length
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 ${height}" width="360" height="${height}" fill="none" stroke="currentColor" stroke-width="1.5">
  <title>Three adapters of different ranks drawn as the pages they take, each in a row as wide as a slot sized for the largest rank</title>
  <desc>Three rows of small squares, one for each rank, each as wide as a slot sized for the largest. In each row the squares that the adapter's pages fill are solid, and the rest of the slot's width is dashed and empty. The smallest adapter fills a small part of its row, the middle one a little more, and the largest fills it.</desc>
  <g stroke="none" fill="currentColor" font-size="10">
    <text x="${X0}" y="12">a slot sized for the largest rank, ${widest.pages} pages wide</text>
${texts.join('\n')}
  </g>
  <g stroke-width="1">
    <path d="M${X0} 22V18H${right}V22"/>
  </g>
  <g fill="currentColor" fill-opacity="0.16">
${held.join('\n')}
  </g>
  <g stroke-width="1" stroke-dasharray="2 2">
${idle.join('\n')}
  </g>
</svg>
`
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
