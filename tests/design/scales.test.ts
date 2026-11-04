/*
 * W1's design carry-over (W0 finish finding F6): the design system's own stylesheets keep to its scales. The detector of impeccable (the
 * `design-system-font-size`, `design-system-radius` and `design-system-color` advisories) found 74 font sizes, 19 radii and 12 white or
 * black highlights in the scanned directories that were not in DESIGN.md's scales. Each is now a step of a scale in tokens.ts, or a
 * one-off that keeps a one-line comment saying why, in the detector's own waiver form:
 *
 *     font-size: 2rem; /* impeccable-disable-line design-system-font-size -- a specimen shows its face at display size *\/
 *
 * The detector is a local tool and runs nowhere in CI, so this reads the stylesheets of src/design by the same rules, and fails on a
 * literal that has gone back in. It does not read the other directories of src/: the front page, the stage, the content and the pages
 * took the same steps where the detector found them, and a page that adds a stylesheet of its own is held to the detector's advisory
 * and to tests/design/literals.test.ts, not to this.
 *   - font-size: a step of the size ramp (`var(--es-size-*)`), a type role's own size, a size relative to its parent, or a clamp()
 *     whose ends are those. Anything else is waived.
 *   - border-radius: a step of the rounded scale (`var(--es-radius-*)`), nothing, or a circle. Anything else is waived.
 *   - white and black: the glint is the only white, taken through `color-mix`, and the only black is a mask's, which reads alpha alone.
 *     Any other literal white or black is waived, and a waiver names its reason.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const root = path.resolve(import.meta.dirname, '../..')
const design = path.join(root, 'src/design')

/** The stylesheets the design system writes by hand: tokens.css is generated from tokens.ts, which holds the values themselves. */
const sheets = readdirSync(design)
  .filter((name) => name.endsWith('.css') && name !== 'tokens.css')
  .sort()

/** A waiver on the declaration's own line, or `-next-line` above it, with a reason after the `--`. */
function waived(lines: readonly string[], line: number, rule: string): boolean {
  const same = new RegExp(`impeccable-disable-line ${rule} -- \\S`)
  const above = new RegExp(`impeccable-disable-next-line ${rule} -- \\S`)
  return same.test(lines[line - 1] ?? '') || above.test(lines[line - 2] ?? '')
}

interface Check {
  file: string
  line: number
  what: string
}

function declarations(file: string, props: RegExp): { text: string; lines: string[]; found: { line: number; prop: string; value: string }[] } {
  const text = readFileSync(path.join(design, file), 'utf8')
  const found: { line: number; prop: string; value: string }[] = []
  postcss.parse(text, { from: file }).walkDecls(props, (decl) => {
    found.push({ line: decl.source?.start?.line ?? 0, prop: decl.prop, value: decl.value.trim() })
  })
  return { text, lines: text.split('\n'), found }
}

/** The ends of a clamp(), min() or max(): its first and last arguments, split where the commas are not inside a call. */
function ends(value: string): string[] {
  const inside = /^(?:clamp|min|max)\((.*)\)$/s.exec(value)?.[1]
  if (inside === undefined) return []
  const parts: string[] = []
  let depth = 0
  let from = 0
  for (let index = 0; index < inside.length; index += 1) {
    if (inside[index] === '(') depth += 1
    else if (inside[index] === ')') depth -= 1
    else if (inside[index] === ',' && depth === 0) {
      parts.push(inside.slice(from, index).trim())
      from = index + 1
    }
  }
  parts.push(inside.slice(from).trim())
  return parts.length === 3 ? [parts[0], parts[2]] : parts
}

const TOKEN_SIZE = /^var\(--es-(?:size|font)-[a-z-]+\)$/
const RELATIVE_SIZE = /^[\d.]+(?:em|%)$/

/** Whether a font-size value is on the ramp: a token, a size relative to its parent, or a fluid size whose ends are tokens. */
function onRamp(value: string): boolean {
  if (TOKEN_SIZE.test(value) || RELATIVE_SIZE.test(value) || value === 'inherit') return true
  const limits = ends(value)
  return limits.length > 0 && limits.every((limit) => TOKEN_SIZE.test(limit))
}

describe('the scanner', () => {
  test.each([
    ['a ramp step', 'var(--es-size-caption)', true],
    ['a type role size', 'var(--es-font-body-size)', true],
    ['a size relative to the parent', '0.8em', true],
    ['a fluid size between two steps', 'clamp(var(--es-size-micro), 0.55rem + 0.6vw, var(--es-size-caption))', true],
    ['a literal', '0.8125rem', false],
    ['a literal in pixels', '13px', false],
    ['a fluid size with a literal end', 'clamp(0.625rem, 1.3cqi, var(--es-size-print))', false],
    ['a fluid size with literal ends', 'clamp(2rem, 1.2rem + 3.4vw, 3.75rem)', false],
  ])('%s: %s', (_, value, expected) => {
    expect(onRamp(value)).toBe(expected)
  })

  test('a waiver needs its reason, on the line or above it', () => {
    const lines = ['a { font-size: 2rem; /* impeccable-disable-line design-system-font-size -- a specimen */ }', 'b { font-size: 2rem; /* impeccable-disable-line design-system-font-size */ }']
    expect(waived(lines, 1, 'design-system-font-size')).toBe(true)
    expect(waived(lines, 2, 'design-system-font-size')).toBe(false)
    expect(waived(['/* impeccable-disable-next-line design-system-radius -- a well */', 'a { border-radius: 6px }'], 2, 'design-system-radius')).toBe(true)
    expect(waived(lines, 1, 'design-system-radius')).toBe(false)
  })
})

describe('the design system keeps to the size ramp', () => {
  test('the stylesheets are read', () => {
    expect(sheets).toContain('components.css')
    expect(sheets).toContain('specimens.css')
    expect(sheets).toContain('base.css')
  })

  test.each(sheets)('%s: every font-size is a step, a role, or a one-off with its reason', (file) => {
    const { lines, found } = declarations(file, /^font-size$/)
    const offenders: Check[] = found
      .filter(({ value, line }) => !onRamp(value) && !waived(lines, line, 'design-system-font-size'))
      .map(({ line, value }) => ({ file, line, what: `font-size: ${value}` }))
    expect(offenders.map(({ file: name, line, what }) => `${name}:${line}: ${what}`)).toEqual([])
  })
})

describe('the design system keeps to the rounded scale', () => {
  const STEP = /var\(--es-radius-[a-z]+\)/g

  test.each(sheets)('%s: every radius is a step, nothing, or a one-off with its reason', (file) => {
    const { lines, found } = declarations(file, /radius$/)
    const offenders = found
      .filter(({ value, line }) => {
        const rest = value.replace(STEP, '').replace(/\b0(?:px)?\b/g, '').replace(/\b50%/g, '').replace(/[\s/()+-]|calc|inherit|unset|initial/g, '')
        return rest !== '' && !waived(lines, line, 'design-system-radius')
      })
      .map(({ line, prop, value }) => `${file}:${line}: ${prop}: ${value}`)
    expect(offenders).toEqual([])
  })
})

describe('the design system takes its white from the glint, and its black from nowhere but a mask', () => {
  /** The stylesheet with its comments blanked, so that a word in prose is not a colour; the lines stay where they were. */
  const blanked = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
  const LITERAL = /rgba?\(\s*(?:255[\s,]+255[\s,]+255|0[\s,]+0[\s,]+0)\b|#(?:fff|ffffff|000|000000)(?![\w-])|(?<![\w-])(?:white|black)(?![\w-])/i

  test.each(sheets)('%s: no literal white or black without a reason', (file) => {
    const source = readFileSync(path.join(design, file), 'utf8')
    const lines = source.split('\n')
    const offenders = blanked(source)
      .split('\n')
      .map((text, index) => ({ line: index + 1, text }))
      .filter(({ text, line }) => LITERAL.test(text) && !waived(lines, line, 'design-system-color'))
      .map(({ line, text }) => `${file}:${line}: ${text.trim()}`)
    expect(offenders).toEqual([])
  })

  test('tokens.ts takes its white from the glint too', () => {
    const source = readFileSync(path.join(design, 'tokens.ts'), 'utf8')
    const literal = source.split('\n').filter((line) => /rgba?\(\s*255[\s,]+255[\s,]+255/.test(line))
    expect(literal).toEqual([])
  })
})
