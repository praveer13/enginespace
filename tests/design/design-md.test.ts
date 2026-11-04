/*
 * W0-T25, accept 2: DESIGN.md describes the built world, and stays true to it. W0-T25's documenter wrote DESIGN.md and its sidecar
 * from the built world (3e9d078); W0-T24's exit review found this test unwritten and added it.
 *   - DESIGN.md opens with token front matter in the groups impeccable's format allows (name, description, colors, typography,
 *     rounded, spacing, components), and its body keeps the eight canonical sections in their order (impeccable reference/document.md).
 *   - Every colour value in the front matter appears in src/design/tokens.css, and it is the light scheme's value of the role of the
 *     same name, so a role that moves in tokens.ts and not here fails.
 *   - The type ramp, the radii and the spacing steps are the tokens' own values, role by role.
 *   - Every face it names is self-hosted: declared in src/design/fonts.css from a file under public/fonts/ that fonts.json pins.
 *   - .impeccable/design.json, the sidecar, exists and parses.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CORE_SCHEMA, load } from 'js-yaml'
import postcss from 'postcss'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const designMd = read('DESIGN.md')
const tokensCss = read('src/design/tokens.css')
const fontsCss = read('src/design/fonts.css')

/** The front matter between the first two `---` lines, and the Markdown after it. */
function split(text: string): { front: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  if (match === null) throw new Error('DESIGN.md does not open with a front matter block between two --- lines')
  return { front: match[1], body: match[2] }
}

interface TypeRole {
  fontFamily: string
  fontSize: string
  fontWeight: number
  lineHeight: number
  letterSpacing: string
}
interface FrontMatter {
  name: string
  description: string
  colors: Record<string, string>
  typography: Record<string, TypeRole>
  rounded: Record<string, string>
  spacing: Record<string, string>
  components: Record<string, Record<string, unknown>>
}

const { front, body } = split(designMd)
const fm = load(front, { schema: CORE_SCHEMA }) as FrontMatter

/** The light scheme: the custom properties of tokens.css's top-level `:root`, outside every @media block. */
const light = new Map<string, string>()
postcss.parse(tokensCss).each((node) => {
  if (node.type !== 'rule' || node.selector !== ':root') return
  node.walkDecls((decl) => {
    if (decl.prop.startsWith('--es-')) light.set(decl.prop, decl.value.trim())
  })
})

/** The faces fonts.css declares, by family, with the files they load from the site's origin. */
const declared = new Map<string, string[]>()
postcss.parse(fontsCss).walkAtRules('font-face', (rule) => {
  let family = ''
  let url = ''
  rule.walkDecls((decl) => {
    if (decl.prop === 'font-family') family = decl.value.replace(/['"]/g, '').trim()
    if (decl.prop === 'src') url = /url\(['"]?([^'")]+)['"]?\)/.exec(decl.value)?.[1] ?? ''
  })
  declared.set(family, [...(declared.get(family) ?? []), url])
})
const pinned = new Set(
  (JSON.parse(read('public/fonts/fonts.json')) as { faces: { file: string }[] }).faces.map((face) => path.basename(face.file)),
)

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-monospace', 'math'])
/** The named faces of a font-family list, in order, without the generic families. */
const faces = (family: string) =>
  family
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name !== '' && !GENERIC.has(name))

describe('DESIGN.md has token front matter and the canonical sections', () => {
  test('the front matter holds only the groups the format allows, and every token group is filled', () => {
    expect(Object.keys(fm).sort()).toEqual(['colors', 'components', 'description', 'name', 'rounded', 'spacing', 'typography'])
    expect(fm.name).toBe('enginespace')
    for (const group of ['colors', 'typography', 'rounded', 'spacing', 'components'] as const) {
      expect(Object.keys(fm[group]).length, group).toBeGreaterThan(0)
    }
  })

  test("the body's sections are impeccable's eight, in their canonical order", () => {
    const sections = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim())
    expect(sections).toEqual(['Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components', "Do's and Don'ts"])
  })

  test('the sidecar .impeccable/design.json exists and parses', () => {
    expect(existsSync(path.join(root, '.impeccable/design.json'))).toBe(true)
    const sidecar = JSON.parse(read('.impeccable/design.json')) as Record<string, unknown>
    expect(sidecar).toHaveProperty('schemaVersion')
    expect(sidecar).toHaveProperty('components')
  })
})

describe("DESIGN.md's tokens are the design system's", () => {
  const colors = Object.entries(fm.colors)

  test('every colour value in the front matter appears in src/design/tokens.css', () => {
    expect(colors.length).toBeGreaterThan(0)
    const css = tokensCss.toLowerCase()
    const missing = colors.filter(([, value]) => !css.includes(value.toLowerCase()))
    expect(missing).toEqual([])
  })

  test.each(colors)('colour %s is the light scheme value of its role', (name, value) => {
    expect(light.get(`--es-${name}`)?.toLowerCase(), `--es-${name}`).toBe(value.toLowerCase())
  })

  test.each(Object.entries(fm.typography))('type role %s has the family, size, weight, leading and tracking of its tokens', (role, type) => {
    expect(light.get(`--es-font-${role}`), `--es-font-${role}`).toBe(type.fontFamily)
    expect(light.get(`--es-font-${role}-size`), `--es-font-${role}-size`).toBe(type.fontSize)
    expect(light.get(`--es-font-${role}-weight`), `--es-font-${role}-weight`).toBe(String(type.fontWeight))
    expect(light.get(`--es-font-${role}-leading`), `--es-font-${role}-leading`).toBe(String(type.lineHeight))
    expect(light.get(`--es-font-${role}-tracking`), `--es-font-${role}-tracking`).toBe(type.letterSpacing)
  })

  test.each(Object.entries(fm.rounded))('radius %s is --es-radius-%s', (name, value) => {
    expect(light.get(`--es-radius-${name}`)).toBe(value)
  })

  test.each(Object.entries(fm.spacing))('spacing step %s is --es-space-%s', (name, value) => {
    expect(light.get(`--es-space-${name}`)).toBe(value)
  })
})

describe('every face DESIGN.md names is self-hosted', () => {
  const named = [...new Set(Object.values(fm.typography).flatMap((type) => faces(type.fontFamily)))]

  test('it names at least one face for every type role', () => {
    for (const [role, type] of Object.entries(fm.typography)) expect(faces(type.fontFamily).length, role).toBeGreaterThan(0)
  })

  test.each(named)('%s is declared in fonts.css from a pinned file under public/fonts', (face) => {
    const urls = declared.get(face) ?? []
    expect(urls.length, `no @font-face for ${face} in src/design/fonts.css`).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url.startsWith('/fonts/'), `${face} loads ${url}, which is not under /fonts/`).toBe(true)
      expect(existsSync(path.join(root, 'public', url)), `${url} is not under public/fonts`).toBe(true)
      expect(pinned.has(path.basename(url)), `${url} is not pinned in public/fonts/fonts.json`).toBe(true)
    }
  })
})
