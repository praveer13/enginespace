/*
 * The stylesheets the Data Book rules read (R-T16): every stylesheet under src/ but the generated tokens.css and the old scenes' own.
 * The scene kit's sheets (src/scene/) are read since R-T44 removed the kitchen from them. A game's scene3d.css is the old engine-floor
 * kitchen scene's, which leaves the tree with that scene (REDESIGN 2.9), and stays untouched until then.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'

export const repo = path.resolve(import.meta.dirname, '../..')

/** Whether a repository path is one of an old kitchen scene's own stylesheets. */
export const kitchen = (file: string) => /^src\/games\/[^/]+\/scene3d\.css$/.test(file)

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
