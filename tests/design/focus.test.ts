/*
 * R-T16: the Ink Focus Rule (REDESIGN 2.8). The focus ring is 3 px of text-1 at a 2 px offset, with a paper halo. It is never amber, so
 * focus is never mistaken for now, and it reads against the amber button's own edge.
 *   - The focus role is text-1, in every scheme.
 *   - base.css draws it on every focusable thing: 3 px, solid, the focus role, a 2 px offset, and a paper halo.
 *   - No focus rule in any stylesheet outside the kitchen scene's draws with the marker or its edge, and none draws a thinner ring.
 *   - The ring holds 3:1 on every ground a control stands on, and on the marker.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { contrastRatio } from '@/design/contrast'
import { PAIRS, resolveColor, roleOf, SCHEME_NAMES } from '@/design/tokens'
import { repo, sheets } from './sheets'

const FOCUS = /:focus-visible|:focus-within|\[data-force='focus'\]|:focus\b/

describe('the focus ring is ink', () => {
  test('the focus role is text-1, in every scheme', () => {
    const role = roleOf('focus')
    expect(role.kind === 'color' && typeof role.value === 'object' ? role.value.ref : null).toBe('text-1')
    for (const scheme of SCHEME_NAMES) expect(resolveColor('focus', scheme)).toBe(resolveColor('text-1', scheme))
  })

  test('base.css draws 3 px of the focus role at a 2 px offset, with a paper halo', () => {
    let ring = ''
    postcss.parse(readFileSync(path.join(repo, 'src/design/base.css'), 'utf8')).walkRules((rule) => {
      if (rule.selector === ':focus-visible' && rule.parent?.type === 'atrule' && (rule.parent as postcss.AtRule).name === 'layer') ring = rule.toString()
    })
    expect(ring).toContain('outline: 3px solid var(--es-focus)')
    expect(ring).toContain('outline-offset: 2px')
    expect(ring).toMatch(/box-shadow: 0 0 0 \d+px var\(--es-paper\)/)
  })

  test('no focus rule draws with the marker or its edge, and no ring is thinner than 3 px', () => {
    const amber: string[] = []
    const thin: string[] = []
    for (const file of sheets()) {
      postcss.parse(readFileSync(path.join(repo, file), 'utf8'), { from: file }).walkRules((rule) => {
        if (!FOCUS.test(rule.selector)) return
        if (/--es-lamp/.test(rule.toString())) amber.push(`${file}: ${rule.selector}`)
        rule.walkDecls(/^outline$/, (decl) => {
          if (/var\(--es-focus\)/.test(decl.value) && !/^3px solid/.test(decl.value.trim())) thin.push(`${file}: ${rule.selector}: ${decl.value}`)
        })
      })
    }
    expect(amber).toEqual([])
    expect(thin).toEqual([])
  })

  test('the ring holds 3:1 on every ground a control stands on, and on the marker, as declared pairs', () => {
    for (const bg of ['surface-0', 'surface-1', 'surface-2', 'paper', 'lamp'] as const) {
      expect(PAIRS.some((pair) => pair.fg === 'focus' && pair.bg === bg && pair.kind === 'non-text')).toBe(true)
      for (const scheme of SCHEME_NAMES) expect(contrastRatio(resolveColor('focus', scheme), resolveColor(bg, scheme))).toBeGreaterThanOrEqual(3)
    }
  })
})
