/**
 * posters: renders the step loop's posters, the first frame of its timing diagram as a file (A§6.11, REDESIGN §2.9).
 *
 * A poster is the front page's diagram at its first frame, drawn from the lane layout (packages/play/loop/lanes.ts) by src/front/poster.ts:
 * the practice seed of the first demo level, as a view (`loopView`), laid out at the front page's two geometries and written as SVG. It
 * has two orientations, a desk's and a phone's. The Games index draws the landscape one in the step loop's well.
 *
 * The SVG paints with the design system's custom properties (`var(--es-paper)` and the rest) and nothing else, so it takes the look of
 * whatever page holds it; opened alone it falls back to the browser's defaults.
 *
 *   bun scripts/posters.ts            print what the posters are and how big
 *   bun scripts/posters.ts --write    write public/posters/*.svg
 *   bun scripts/posters.ts --check    fail when a committed poster is not what the code draws now
 *
 * `renderPosters` is the whole of it: the file name and the markup of each poster. The tests call it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { countMarks, svgMarkup } from '../packages/play/loop/svg'
import { ORIENTATIONS, passDrawing, posterView, type Orientation } from '../src/front/poster'

export { POSTER_LEVEL, POSTER_SEED } from '../src/front/poster'

export interface Poster {
  /** The file under `public/posters/`. */
  readonly file: string
  readonly orientation: Orientation
  readonly svg: string
  readonly marks: number
}

/** Both posters, landscape first. */
export function renderPosters(): Poster[] {
  const view = posterView()
  return ORIENTATIONS.map((orientation): Poster => {
    const tree = passDrawing(view, orientation)
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
    return readFileSync(file, 'utf8') === poster.svg ? [] : [`public/posters/${poster.file} is not what the lane layout draws now: run bun scripts/posters.ts --write`]
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
