/*
 * The stylesheets the Data Book rules read (R-T16): every stylesheet under src/ but the kitchen scene's own and the generated tokens.css.
 * The kitchen scene's files (src/scene/, and each game's scene3d.css) leave the tree at stage 4 of wave R and stay untouched until then
 * (REDESIGN 2.9), so its tape, its light and its type keep working there.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'

export const repo = path.resolve(import.meta.dirname, '../..')

/** Whether a repository path is one of the kitchen scene's own stylesheets. */
export const kitchen = (file: string) => file.startsWith('src/scene/') || /^src\/games\/[^/]+\/scene3d\.css$/.test(file)

function cssUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return cssUnder(full)
    return entry.name.endsWith('.css') ? [full] : []
  })
}

/** Every stylesheet under src/, as repository paths. */
export const allSheets = () =>
  cssUnder(path.join(repo, 'src'))
    .map((file) => path.relative(repo, file))
    .sort()

/** The stylesheets the rules read. */
export const sheets = () => allSheets().filter((file) => !kitchen(file) && file !== 'src/design/tokens.css')
