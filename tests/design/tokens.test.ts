/*
 * W0-T05's checks on the token contract (TRACKER W0-T05, accept 2, 3 and 4):
 *   - every role in src/design/tokens.ts has a CSS variable, a Tailwind key and a scene-token entry;
 *   - tokens.css is exactly what tokens.ts generates;
 *   - every declared pair meets its ARCHITECTURE §11.2 threshold in every colour scheme the system ships;
 *   - lane, memory, probability and status roles draw from the one categorical code;
 *   - verify:tokens lists every role with its value, passes on the tree, and fails on a stylesheet with one placeholder.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import resolveConfig from 'tailwindcss/resolveConfig'
import tailwindConfig from '../../tailwind.config'
import { contrastRatio } from '@/design/contrast'
import { sceneTokensFrom, staticSceneTokens } from '@/design/scene-tokens'
import {
  COLOR_ROLE_NAMES,
  cssVar,
  LANES,
  MEMORY_STATES,
  PAIRS,
  PROBABILITIES,
  resolveColor,
  ROLE_GROUPS,
  ROLE_NAMES,
  roleOf,
  rolesIn,
  SCHEME_NAMES,
  SCHEMES,
  SLOT_MARKS,
  SLOTS,
  slotOf,
  tailwindKey,
  THRESHOLDS,
  tokensCss,
  type ColorRoleName,
} from '@/design/tokens'
import { expectedVariables, rootVariables } from '../../scripts/verify-tokens'

const root = path.resolve(import.meta.dirname, '../..')
const tokensFile = path.join(root, 'src/design/tokens.css')
const tokensText = readFileSync(tokensFile, 'utf8')

/** The root's custom properties as a browser computes them: var() references followed. */
function computedReader(css: string) {
  const variables = rootVariables(css)
  const read = (variable: string, depth = 0): string => {
    const value = variables.get(variable) ?? ''
    const reference = /^var\((--es-[\w-]+)\)$/.exec(value)
    return reference && depth < 8 ? read(reference[1], depth + 1) : value
  }
  return (variable: string) => read(variable)
}

describe('every role reaches CSS, Tailwind and the scenes', () => {
  const css = rootVariables(tokensText)
  const theme = resolveConfig(tailwindConfig).theme as unknown as Record<string, Record<string, unknown>>

  test('the role list is the contract W0-T05 names', () => {
    for (const name of [
      'surface-0',
      'surface-1',
      'surface-2',
      'surface-3',
      'paper',
      'paper-ink',
      'paper-ink-2',
      'lamp',
      'tape',
      'text-1',
      'text-2',
      'text-3',
      'focus',
    ])
      expect(ROLE_NAMES).toContain(name)
    for (const status of ['ok', 'warn', 'bad', 'info']) expect(ROLE_NAMES).toContain(`status-${status}`)
    for (const lane of ['cpu', 'gpu', 'sync', 'copy', 'idle']) expect(ROLE_NAMES).toContain(`lane-${lane}`)
    for (const state of ['free', 'used', 'cached', 'shared', 'adapter', 'evicted']) expect(ROLE_NAMES).toContain(`memory-${state}`)
    for (const probability of ['target', 'draft', 'overlap', 'residual', 'observed']) expect(ROLE_NAMES).toContain(`probability-${probability}`)
    for (const type of ['display', 'heading', 'body', 'mono', 'numeric']) expect(ROLE_NAMES).toContain(`font-${type}`)
    for (const slot of SLOTS) expect(ROLE_NAMES).toContain(`cat-${slot}`)
    expect(ROLE_NAMES.filter((name) => roleOf(name).kind === 'duration').length).toBeGreaterThan(1)
    expect(ROLE_NAMES.filter((name) => roleOf(name).kind === 'easing').length).toBeGreaterThan(1)
    expect(ROLE_NAMES.filter((name) => roleOf(name).kind === 'radius').length).toBeGreaterThan(1)
    expect(ROLE_NAMES.filter((name) => roleOf(name).kind === 'space').length).toBeGreaterThan(3)
  })

  test('every role is in exactly one group', () => {
    const grouped = ROLE_GROUPS.flatMap((group) => rolesIn(group.id))
    expect([...grouped].sort()).toEqual([...ROLE_NAMES].sort())
  })

  test.each(ROLE_NAMES)('%s has a CSS variable with its value', (name) => {
    const variable = cssVar(name)
    expect(css.has(variable)).toBe(true)
    expect(css.get(variable)).toBe(expectedVariables().get(variable) ?? '')
    expect((css.get(variable) ?? '').length).toBeGreaterThan(0)
  })

  test.each(ROLE_NAMES)('%s has a Tailwind key that resolves to its variable', (name) => {
    const { section, key } = tailwindKey(name)
    expect(theme[section]?.[key]).toBe(`var(${cssVar(name)})`)
  })

  test.each(ROLE_NAMES)('%s has a scene-token entry', (name) => {
    const fromCss = sceneTokensFrom(computedReader(tokensText))
    expect(fromCss.roles[name]).toBeTruthy()
    expect(staticSceneTokens().roles[name]).toBe(fromCss.roles[name])
  })

  test('tokens.css is what tokens.ts generates', () => {
    expect(tokensText).toBe(tokensCss())
  })

  test('the scene materials are colours three can parse, taken from the roles', () => {
    const tokens = staticSceneTokens()
    const { stainless, paper, tape, heatLamp, fluorescent } = tokens.materials
    expect(stainless.color).toBe(resolveColor('surface-1'))
    expect(paper.color).toBe(resolveColor('paper'))
    expect(tape.color).toBe(resolveColor('tape'))
    expect(heatLamp.color).toBe(resolveColor('lamp'))
    expect(fluorescent.skyColor).toBe(resolveColor('light-fluorescent'))
    for (const color of [stainless.color, paper.color, tape.color, heatLamp.color, ...tokens.palette]) expect(color).toMatch(/^#[0-9a-f]{6}$/)
    expect(tokens.motion.bellMs).toBe(240)
    expect(tokens.motion.reduced).toBe(false)
  })

  test('under reduced motion the scenes read zero durations', () => {
    const reduced = sceneTokensFrom((variable) => (variable.startsWith('--es-dur-') ? '0ms' : computedReader(tokensText)(variable)))
    expect(reduced.motion).toMatchObject({ quickMs: 0, bellMs: 0, feedMs: 0, settleMs: 0, reduced: true })
  })
})

describe('contrast (ARCHITECTURE §11.2)', () => {
  test('the system ships one light scheme and its more-contrast variant, and no dark scheme (D-050)', () => {
    expect(SCHEME_NAMES).toEqual(['light', 'contrast-more'])
    expect(SCHEMES['contrast-more'].media).toBe('(prefers-contrast: more)')
    expect(tokensText).toContain('@media (prefers-contrast: more)')
    expect(tokensText).not.toContain('prefers-color-scheme')
  })

  test('the pairs cover text, focus, edges and the code', () => {
    const fgs = new Set(PAIRS.map((pair) => pair.fg))
    for (const name of [
      'text-1',
      'text-2',
      'text-3',
      'paper-ink',
      'paper-ink-2',
      'tape-ink',
      'focus',
      'edge',
      'status-ok',
      'status-warn',
      'status-bad',
      'status-info',
    ])
      expect(fgs.has(name as ColorRoleName)).toBe(true)
    for (const slot of SLOTS) expect(fgs.has(`cat-${slot}-edge` as ColorRoleName)).toBe(true)
  })

  for (const scheme of SCHEME_NAMES) {
    test.each(PAIRS.map((pair) => [`${pair.fg} on ${pair.bg}`, pair] as const))(`${scheme}: %s meets its threshold`, (_, pair) => {
      const ratio = contrastRatio(resolveColor(pair.fg, scheme), resolveColor(pair.bg, scheme))
      expect(ratio).toBeGreaterThanOrEqual(THRESHOLDS[pair.kind])
    })
  }

  test('contrastRatio agrees with WCAG on known pairs', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })
})

describe('the categorical code is the only code', () => {
  const families = { lane: LANES, memory: MEMORY_STATES, probability: PROBABILITIES }

  test('every slot has its own glyph and a pattern', () => {
    const glyphs = SLOTS.map((slot) => SLOT_MARKS[slot].glyph)
    expect(new Set(glyphs).size).toBe(SLOTS.length)
    for (const slot of SLOTS) expect(SLOT_MARKS[slot].pattern).toBeTruthy()
  })

  for (const [family, members] of Object.entries(families)) {
    test(`every ${family} role stands for a slot of the code, and no two share one`, () => {
      const slots = members.map((member) => slotOf(`${family}-${member}` as ColorRoleName))
      expect(slots.every((slot) => slot !== undefined)).toBe(true)
      expect(new Set(slots).size).toBe(members.length)
      for (const member of members) {
        const role = roleOf(`${family}-${member}` as ColorRoleName)
        expect(role.kind === 'color' && typeof role.value === 'object').toBe(true)
      }
    })
  }

  test('status roles are the code’s edges and the ribbon’s red, never colours of their own', () => {
    for (const status of ['ok', 'warn', 'info']) expect(slotOf(`status-${status}` as ColorRoleName)).toBeUndefined()
    const refs = ['status-ok', 'status-warn', 'status-bad', 'status-info'].map((name) => {
      const role = roleOf(name as ColorRoleName)
      return role.kind === 'color' && typeof role.value === 'object' ? role.value.ref : 'literal'
    })
    expect(refs).toEqual(['cat-green-edge', 'cat-yellow-edge', 'paper-ink-2', 'cat-blue-edge'])
  })

  test('no colour role outside the materials, text and the code has a literal value', () => {
    for (const name of COLOR_ROLE_NAMES) {
      const role = roleOf(name)
      if (role.kind !== 'color') continue
      if (['material', 'text', 'categorical'].includes(role.group) && typeof role.value === 'string') continue
      expect(typeof role.value).toBe('object')
    }
  })

  test('a yellow or white mark carries its edge (3:1 on the grounds), the others stand on their fill', () => {
    for (const slot of SLOTS) {
      const ground = resolveColor('surface-0')
      const fill = contrastRatio(resolveColor(`cat-${slot}` as ColorRoleName), ground)
      const edge = contrastRatio(resolveColor(`cat-${slot}-edge` as ColorRoleName), ground)
      expect(edge).toBeGreaterThanOrEqual(3)
      if (SLOT_MARKS[slot].mark === 'fill') expect(fill).toBeGreaterThanOrEqual(3)
      else expect(fill).toBeLessThan(3)
    }
  })
})

describe('verify:tokens', () => {
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, ['scripts/verify-tokens.ts', ...args], { cwd: root, encoding: 'utf8' })
    return { status: result.status, out: `${result.stdout}${result.stderr}` }
  }

  test('passes on the tree, listing every role with its value', () => {
    const { status, out } = run()
    expect(status).toBe(0)
    for (const name of ROLE_NAMES) expect(out).toContain(`  ${name} `)
    expect(out).toContain('#ccd1d4')
    expect(out).toContain('Doto, Handjet, monospace')
    expect(out).toContain('verify:tokens passed')
  })

  test('the tree uses a system colour only inside its forced-colors block', () => {
    expect(tokensText).toMatch(/@media \(forced-colors: active\) \{[^}]*Highlight/)
  })

  /** tokens.css with one value replaced: the fixture with one placeholder. */
  const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-tokens-'))
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))
  const withOne = (name: string, edit: (css: string) => string) => {
    const file = path.join(scratch, `${name}.css`)
    const edited = edit(tokensText)
    if (edited === tokensText) throw new Error(`the ${name} fixture changed nothing`)
    writeFileSync(file, edited)
    return file
  }

  const fixtures: [string, (css: string) => string, RegExp][] = [
    ['system-colour', (css) => css.replace('--es-surface-0: #ccd1d4;', '--es-surface-0: Canvas;'), /system colour.*Canvas/],
    ['system-colour-text', (css) => css.replace('--es-text-1: #17191d;', '--es-text-1: CanvasText;'), /system colour.*CanvasText/],
    [
      'system-font-stack',
      (css) => css.replace("--es-font-body: 'Atkinson Hyperlegible', sans-serif;", '--es-font-body: system-ui, sans-serif;'),
      /system font stack/,
    ],
    ['empty-value', (css) => css.replace('--es-paper: #fafaf6;', '--es-paper: ;'), /empty value: --es-paper/],
    ['marker', (css) => css.replace('--es-lamp: #ffb547;', '--es-lamp: #ffb547; /* placeholder until DESIGN.md */'), /placeholder/],
  ]

  test.each(fixtures)('fails on a stylesheet with one placeholder: %s', (name, edit, message) => {
    const { status, out } = run('--css', withOne(name, edit))
    expect(status).toBe(1)
    expect(out).toMatch(message)
  })

  test('the generated tokens.css passes when given as the fixture path', () => {
    const file = path.join(scratch, 'copy.css')
    writeFileSync(file, tokensText)
    expect(run('--css', file).status).toBe(0)
  })
})
