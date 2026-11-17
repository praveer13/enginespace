/*
 * R-T16: the One Marker Rule (REDESIGN 2.8, "Named rules"; it replaces W1's One Lamp Rule, which this file held). Amber means now. It has
 * three carriers and no others:
 *   1. the control to act on now: the one amber-filled button (the primary button, a page's way on), or the amber ring on the control an
 *      intro points at;
 *   2. the "now" mark on a diagram: the cursor with its word, and the mark on the object the next move acts on;
 *   3. the current position in the rail and on the course track.
 * Callouts are ink discs, never amber, and focus is ink (tests/design/focus.test.ts).
 *
 * The rule is read off the stylesheets, rule by rule: every rule under src/ that fills with the marker (`var(--es-lamp)`) must be one of
 * the carriers below, each named with the carrier it is. The kitchen scene's own files are not read (tests/design/sheets.ts).
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss, { type Rule } from 'postcss'
import { contrastRatio } from '@/design/contrast'
import { resolveColor } from '@/design/tokens'
import { kitchen, repo, sheets } from './sheets'

const SHEETS = sheets()
const MARKER = /var\(--es-lamp\)/

/** The carriers, each with the carrier of the rule it is (1, 2 or 3) and what it is. */
const CARRIERS: { carrier: 1 | 2 | 3; what: string; selector: RegExp }[] = [
  { carrier: 1, what: 'the primary button', selector: /^\.es-primary-button__pull(?::is\(|$)/ },
  { carrier: 1, what: "a page's way on, where it has no move in hand", selector: /^\.es-header__next\[data-emphasis='primary'\]/ },
  { carrier: 1, what: 'the way on beside a lesson (NextStep)', selector: /^a?\.es-next__action(?::is\(|$)/ },
  { carrier: 1, what: "the lesson's foot bar: its way on", selector: /^\.es-lesson__foot-action$/ },
  { carrier: 1, what: 'the ring on the control an intro points at', selector: /^\.es-marker__ring$/ },
  { carrier: 2, what: 'the marker on a diagram: its shape and the cursor', selector: /^\.es-marker(?:__shape|\[data-kind='cursor'\]::before)$/ },
  { carrier: 2, what: 'the page or the light the next move acts on', selector: /^\.es-station\[data-lamp\] / },
  { carrier: 2, what: 'the pages an eviction is about to take', selector: /^\.es-pool__cell\[data-chosen\]$/ },
  { carrier: 3, what: 'the current section in the rail', selector: /^\.es-srail__segment\[data-at='now'\]$/ },
  { carrier: 3, what: 'the current position on the course: the mark on the way on, on the module\'s node and by the next lesson', selector: /^\.es-course__mark$/ },
]

interface Found {
  file: string
  selector: string
  rule: Rule
}

function markerRules(): Found[] {
  const found: Found[] = []
  for (const file of SHEETS) {
    postcss.parse(readFileSync(path.join(repo, file), 'utf8'), { from: file }).walkRules((rule) => {
      const fills = rule.nodes.some((node) => node.type === 'decl' && MARKER.test(node.value))
      if (fills) for (const selector of rule.selectors) found.push({ file, selector: selector.trim(), rule })
    })
  }
  return found
}

describe('the One Marker Rule: amber means now, on its three carriers only', () => {
  const rules = markerRules()

  test('the scan reads every stylesheet outside the kitchen scene, and finds the carriers', () => {
    expect(SHEETS).toContain('src/design/components.css')
    expect(SHEETS).toContain('src/design/parts.css')
    expect(SHEETS).toContain('src/front/front.css')
    expect(SHEETS.some(kitchen)).toBe(false)
    const selectors = rules.map(({ selector }) => selector)
    expect(selectors).toContain('.es-primary-button__pull')
    expect(selectors).toContain(".es-srail__segment[data-at='now']")
    expect(selectors).toContain(".es-marker[data-kind='cursor']::before")
    for (const carrier of [1, 2, 3]) expect(CARRIERS.some((entry) => entry.carrier === carrier)).toBe(true)
  })

  test.each(rules.map((found) => [`${found.file}: ${found.selector}`, found] as const))('%s is a carrier', (_, { selector }) => {
    const carrier = CARRIERS.find((candidate) => candidate.selector.test(selector))
    expect(carrier, `${selector} fills with amber and is none of the three carriers`).toBeDefined()
  })

  test('amber never stands alone: each carrier at rest draws the marker\'s edge with it', () => {
    const atRest = rules.filter(({ selector }) => !/:is\(|:hover|:active/.test(selector))
    expect(atRest.length).toBeGreaterThan(5)
    for (const { file, selector, rule } of atRest) expect(rule.toString(), `${file}: ${selector}`).toContain('var(--es-lamp-ring)')
  })

  test('callouts are ink discs: no callout rule names the marker', () => {
    const callouts: string[] = []
    for (const file of SHEETS) {
      postcss.parse(readFileSync(path.join(repo, file), 'utf8')).walkRules((rule) => {
        if (/\.es-callout/.test(rule.selector) && /--es-lamp/.test(rule.toString())) callouts.push(`${file}: ${rule.selector}`)
      })
    }
    expect(callouts).toEqual([])
    const parts = readFileSync(path.join(repo, 'src/design/parts.css'), 'utf8')
    expect(parts).toMatch(/\.es-callout__disc \{[^}]*background: var\(--es-text-1\)/)
  })

  test("the header's Continue and the page you are on are not amber: the outline, and an ink bar", () => {
    const sheet = postcss.parse(readFileSync(path.join(repo, 'src/design/components.css'), 'utf8'))
    const text = (selector: string) => {
      let found = ''
      sheet.walkRules((rule) => {
        if (rule.selectors.includes(selector)) found += rule.toString()
      })
      return found
    }
    expect(text('.es-header__next')).not.toMatch(/--es-lamp/)
    expect(text(".es-header__link[aria-current='page']::after")).toContain('var(--es-text-1)')
    expect(text(".es-header__link[aria-current='page']::after")).not.toMatch(/--es-lamp/)
  })

  test('a switch that is on and a busy light are not amber: the state is a shape and a word', () => {
    const components = readFileSync(path.join(repo, 'src/design/components.css'), 'utf8')
    const toggle = /\.es-toggle__switch\[data-state='checked'\] \{[^}]*\}/.exec(components)?.[0] ?? ''
    expect(toggle).toContain('var(--es-surface-3)')
    expect(toggle).not.toMatch(/--es-lamp/)
    expect(components).not.toContain('es-toggle__pilot')
    const lit = /\.es-station\[data-state='lit'\] \.es-station__lens \{[^}]*\}/.exec(components)?.[0] ?? ''
    expect(lit).toContain('var(--es-text-1)')
  })

  test('the marker on paper is under 3:1, so it always carries its edge, which holds 3:1 on paper and on the marker', () => {
    expect(contrastRatio(resolveColor('lamp'), resolveColor('paper'))).toBeLessThan(3)
    expect(contrastRatio(resolveColor('lamp-ring'), resolveColor('paper'))).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(resolveColor('lamp-ring'), resolveColor('lamp'))).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(resolveColor('text-1'), resolveColor('lamp'))).toBeGreaterThanOrEqual(4.5)
  })
})
