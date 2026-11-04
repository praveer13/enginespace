/**
 * posters: renders Service's poster, the static picture the front page paints before any script runs (A§6.11, GAMES.md §3 "2D path").
 *
 * The poster is the 2D view's first frame, drawn by the same pure code: the practice seed of the front page's first level, as a
 * view (`loopView`), laid out (`layoutFrame`) and written as SVG (`frameSvg`). The 2D view renders the same tree as React elements,
 * and tests/play/loop-layout.test.ts requires the two to be the same markup. It has two orientations, because the lanes run along
 * a phone's height in portrait (GAMES.md §2.3): the page shows one of them by its width.
 *
 * The SVG paints with the design system's custom properties (`var(--es-lane-gpu)` and the rest) and nothing else, so it takes the
 * look of whatever page holds it: inlined in `index.html` (W0-T18), or opened alone it falls back to the browser's defaults.
 *
 *   bun scripts/posters.ts            print what the posters are and how big
 *   bun scripts/posters.ts --write    write public/posters/*.svg
 *   bun scripts/posters.ts --check    fail when a committed poster is not what the code draws now
 *
 * `renderPosters` is the whole of it: the file name and the markup of each poster. The tests and W0-T18's build step call it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { frameSvg, layoutFrame } from '../packages/play/loop/layout'
import type { Orientation } from '../packages/play/loop/layout'
import { loopInit, loopLevel, loopView } from '../packages/play/loop/session'
import { countMarks, svgMarkup } from '../packages/play/loop/svg'

/** The level and seed the front page opens on: the first level, on its pinned practice seed (D-038, D-043). */
export const POSTER_LEVEL = 'first-1-fill'
export const POSTER_SEED = 1

export interface Poster {
  /** The file under `public/posters/`. */
  readonly file: string
  readonly orientation: Orientation
  readonly svg: string
  readonly marks: number
}

/** Both posters, landscape first. */
export function renderPosters(): Poster[] {
  const view = loopView(loopInit(loopLevel(POSTER_LEVEL, POSTER_SEED)))
  return (['landscape', 'portrait'] as const).map((orientation): Poster => {
    const tree = frameSvg(layoutFrame(view, { orientation }))
    return { file: `loop-first-frame-${orientation}.svg`, orientation, svg: `${svgMarkup(tree)}\n`, marks: countMarks(tree) }
  })
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const folder = (base: string) => path.join(base, 'public', 'posters')

/** What is wrong with the posters on disk under `base`, or an empty list. */
export function stalePosters(base = root): string[] {
  return renderPosters().flatMap((poster) => {
    const file = path.join(folder(base), poster.file)
    if (!existsSync(file)) return [`public/posters/${poster.file} is missing: run bun scripts/posters.ts --write`]
    return readFileSync(file, 'utf8') === poster.svg ? [] : [`public/posters/${poster.file} is not what layout.ts draws now: run bun scripts/posters.ts --write`]
  })
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  const posters = renderPosters()
  if (argv.includes('--write')) {
    mkdirSync(folder(root), { recursive: true })
    for (const poster of posters) writeFileSync(path.join(folder(root), poster.file), poster.svg)
  }
  for (const poster of posters) console.log(`posters: ${poster.file}: ${poster.marks} marks, ${poster.svg.length} bytes`)
  if (argv.includes('--check')) {
    const problems = stalePosters()
    for (const problem of problems) console.error(`posters: ${problem}`)
    if (problems.length > 0) return 1
    console.log('posters: ok')
  }
  return 0
}

if (import.meta.main) process.exitCode = main()
