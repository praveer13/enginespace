/*
 * R-T16: Data Book's flat paper and sentence case (REDESIGN 2.8).
 *   - Sentence case everywhere: no stylesheet under src/ outside the kitchen scene's own files transforms text to upper case, and no type
 *     role does, so vLLM, SGLang and v0.33.0 keep their casing.
 *   - The Flat Paper Rule: no texture role in tokens.ts, and none named in any stylesheet; two shadows, `paper` for a sheet and `lift` for
 *     a popover; paper cut square.
 *   - The kitchen's tape, tape ink, glint and fluorescent light are retired from every stylesheet. Their roles stay in tokens.ts for the
 *     kitchen scene, which reads them until stage 4 removes it.
 *   - The surface roles and paper-rule take the brief's new values, and every pair the brief names is declared.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { PAIRS, resolveColor, ROLE_NAMES, roleOf, type ColorRoleName } from '@/design/tokens'
import { allSheets, kitchen, repo, sheets } from './sheets'

const read = (file: string) => readFileSync(path.join(repo, file), 'utf8')

describe('sentence case everywhere', () => {
  test('the scan reads the stylesheets of the pages, the games and the design system, and leaves out only the kitchen scene', () => {
    const read = sheets()
    expect(read.length).toBeGreaterThan(20)
    expect(allSheets().filter((file) => !read.includes(file))).toEqual(
      expect.arrayContaining(['src/design/tokens.css', 'src/scene/kitchen.css']),
    )
    expect(allSheets().filter((file) => !read.includes(file) && file !== 'src/design/tokens.css').every(kitchen)).toBe(true)
  })

  test.each(sheets())('%s transforms no text to upper case', (file) => {
    const found: string[] = []
    postcss.parse(read(file), { from: file }).walkDecls('text-transform', (decl) => {
      if (/uppercase/i.test(decl.value)) found.push(`${decl.parent && 'selector' in decl.parent ? decl.parent.selector : ''}: ${decl.value}`)
    })
    expect(found).toEqual([])
  })

  test('no type role transforms its text', () => {
    for (const name of ROLE_NAMES) {
      const role = roleOf(name)
      if (role.kind === 'font') expect(role.case, name).toBe('none')
    }
    expect(read('src/design/tokens.css')).not.toMatch(/-case: uppercase/)
  })
})

describe('flat paper', () => {
  test('tokens.ts has no texture role, and two shadows: paper and lift', () => {
    expect(ROLE_NAMES.filter((name) => (roleOf(name).kind as string) === 'texture')).toEqual([])
    expect(ROLE_NAMES.filter((name) => roleOf(name).kind === 'shadow')).toEqual(['shadow-paper', 'shadow-lift'])
    expect(read('src/design/tokens.css')).not.toMatch(/--es-texture-/)
    expect((roleOf('radius-paper') as { value: string }).value).toBe('0px')
  })

  test.each(sheets())('%s names no texture role, no retired shadow and no retired colour', (file) => {
    const text = read(file).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(text.match(/--es-texture-[a-z-]+|--es-shadow-(?:plate|press|shelf)\b|--es-(?:tape|tape-ink|glint|light-fluorescent)\b/g) ?? []).toEqual([])
  })

  test('the ground carries no image: the page is a flat fill', () => {
    let html = ''
    postcss.parse(read('src/design/base.css')).walkRules('html', (rule) => {
      html += rule.toString()
    })
    expect(html).toContain('background-color: var(--es-surface-0)')
    expect(html).not.toMatch(/background-image/)
  })
})

describe("the brief's values and pairs (REDESIGN 2.8, Palette roles)", () => {
  test('the surfaces and the graticule take their new values; paper, edge, the inks and the marker keep theirs', () => {
    expect(resolveColor('surface-0')).toBe('#e9ece6')
    expect(resolveColor('surface-1')).toBe('#f4f5f0')
    expect(resolveColor('surface-2')).toBe('#d9ddd4')
    expect(resolveColor('surface-3')).toBe('#2b3138')
    expect(resolveColor('paper-rule')).toBe('#c2c8bd')
    expect(resolveColor('paper')).toBe('#fafaf6')
    expect(resolveColor('edge')).toBe('#5f666d')
    expect(resolveColor('paper-ink-2')).toBe('#a30f1a')
    expect(resolveColor('lamp')).toBe('#ffb547')
    expect(resolveColor('lamp-ring')).toBe('#9a3d00')
  })

  test.each([
    ['text-1', 'surface-0', 'text'],
    ['text-3', 'surface-0', 'text'],
    ['text-3', 'surface-2', 'text'],
    ['edge', 'surface-0', 'non-text'],
    ['paper', 'surface-3', 'text'],
    ['text-1', 'lamp', 'text'],
    ['lamp-ring', 'paper', 'non-text'],
    ['lamp-ring', 'lamp', 'non-text'],
  ] as const)('%s on %s is a declared %s pair', (fg, bg, kind) => {
    expect(PAIRS.some((pair) => pair.fg === (fg as ColorRoleName) && pair.bg === (bg as ColorRoleName) && pair.kind === kind)).toBe(true)
  })
})
