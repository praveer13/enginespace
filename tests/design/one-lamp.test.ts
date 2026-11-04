/*
 * W1's design carry-over (W0 finish findings F3 and F4): the One Lamp Rule in DESIGN.md says that heat-lamp amber is the only active
 * state, so a switch that is on and a station that is lit burn in the lamp, never in a board colour of the categorical code. The
 * finish review found the switch's pilot in board green and the station's lens in the GPU lane's green; this keeps them out of both.
 *
 * A lane's colour may say which lane a light belongs to, as a category mark beside the light and the same lit or dark; it never says
 * whether the light is on. The rule is read off the stylesheets, rule by rule, so a state rule that names a board colour fails whoever
 * writes it and wherever it is.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import postcss, { type AtRule, type Rule } from 'postcss'

const repo = path.resolve(import.meta.dirname, '../..')

function cssUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return cssUnder(full)
    return entry.name.endsWith('.css') ? [full] : []
  })
}

interface Found {
  file: string
  selector: string
  rule: Rule
}

/** Every rule of every stylesheet under src/ whose selector names an on state: a switch's `checked`, a light's `lit`, a pip's `data-lit`. */
function onStateRules(): Found[] {
  const found: Found[] = []
  for (const file of cssUnder(path.join(repo, 'src'))) {
    postcss.parse(readFileSync(file, 'utf8'), { from: file }).walkRules((rule) => {
      if (/\[data-state=['"](?:checked|lit)['"]\]|\[data-lit\]/.test(rule.selector)) found.push({ file: path.relative(repo, file), selector: rule.selector, rule })
    })
  }
  return found
}

/** The colour roles of the categorical code, and the status that is one of its edges: what a lane, a memory state or a check is drawn in. */
const CODE_COLOUR = /--es-(?:cat-|lane-|memory-|probability-|status-ok)/

const declarations = (rule: Rule) => {
  const found: { prop: string; value: string }[] = []
  rule.walkDecls((decl) => void found.push({ prop: decl.prop, value: decl.value }))
  return found
}

describe('an on state burns in the heat lamp, never in the code', () => {
  const rules = onStateRules()

  test('the scan reads the switch and the station light of the design system, among other on states', () => {
    const selectors = rules.map(({ selector }) => selector)
    expect(selectors).toContain(".es-toggle__switch[data-state='checked'] .es-toggle__pilot")
    expect(selectors).toContain(".es-station[data-state='lit'] .es-station__lens")
    expect(rules.length).toBeGreaterThanOrEqual(4)
  })

  test.each(rules.map((found) => [`${found.file}: ${found.selector}`, found] as const))('%s names no colour of the code', (_, { rule }) => {
    const named = declarations(rule).filter(({ value }) => CODE_COLOUR.test(value))
    expect(named.map(({ prop, value }) => `${prop}: ${value}`)).toEqual([])
  })

  const lit = (selector: string) => {
    const found = rules.find((candidate) => candidate.selector === selector)
    if (!found) throw new Error(`no rule for ${selector}`)
    return declarations(found.rule)
  }

  test("a switch's pilot lights in the lamp, with the filament's edge", () => {
    const pilot = lit(".es-toggle__switch[data-state='checked'] .es-toggle__pilot")
    expect(pilot.find(({ prop }) => prop === 'background')?.value).toContain('var(--es-lamp)')
    expect(pilot.find(({ prop }) => prop === 'box-shadow')?.value).toContain('var(--es-lamp-ring)')
  })

  test("a lit station's lens burns in the lamp, with the filament's edge", () => {
    const lens = lit(".es-station[data-state='lit'] .es-station__lens")
    expect(lens.find(({ prop }) => prop === 'background')?.value).toContain('var(--es-lamp)')
    expect(lens.find(({ prop }) => prop === 'box-shadow')?.value).toContain('var(--es-lamp-ring)')
  })

  test('in forced colours the on states are solid Highlight, the lamp\'s mapping, in a block that wins the cascade', () => {
    // The system's gradients are dropped under forced colours, so a lit lens needs a colour of its own. The block must come after the rules
    // it overrides: Tailwind's build moves the rules of `@layer components` behind everything that is outside the layer, so a block outside
    // it loses to a rule of the same weight (which is how the pilot's mapping once did nothing).
    const sheet = postcss.parse(readFileSync(path.join(repo, 'src/design/components.css'), 'utf8'))
    const layer = sheet.nodes.find((node): node is AtRule => node.type === 'atrule' && node.name === 'layer' && node.params === 'components')
    if (!layer) throw new Error('components.css has no @layer components')
    const media = layer.nodes?.find(
      (node): node is AtRule => node.type === 'atrule' && node.name === 'media' && /forced-colors:\s*active/.test(node.params),
    )
    expect(media, 'a forced-colors block inside the layer').toBeDefined()
    const mapped = new Map<string, string>()
    media?.walkRules((rule) => {
      for (const selector of rule.selectors) mapped.set(selector, rule.nodes.map((node) => node.toString()).join(';'))
    })
    for (const selector of [".es-toggle__switch[data-state='checked'] .es-toggle__pilot", ".es-station[data-state='lit'] .es-station__lens"]) {
      expect(mapped.get(selector), selector).toBe('background: Highlight')
      const base = layer.nodes?.findIndex((node) => node.type === 'rule' && node.selector === selector)
      expect(base, `${selector} has a rule in the layer`).toBeGreaterThanOrEqual(0)
      expect(layer.nodes?.indexOf(media as AtRule), `the block comes after ${selector}`).toBeGreaterThan(base ?? Number.POSITIVE_INFINITY)
    }
  })

  test('no stylesheet gives a station light a colour of its own to burn in', () => {
    const own = cssUnder(path.join(repo, 'src')).filter((file) => readFileSync(file, 'utf8').includes('--es-station-light'))
    expect(own.map((file) => path.relative(repo, file))).toEqual([])
  })
})
