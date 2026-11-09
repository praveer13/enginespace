/*
 * /settings as markup (W0-T22): the view that the page draws once it has its settings, the device and the ledger. It renders on the
 * server renderer, with every input as a prop, so each state of every control is read here. What a click does is checked in a real
 * browser, in e2e/settings.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { DEFAULT_SETTINGS } from '@/settings/model'
import type { Settings } from '@/settings/model'
import { Choice } from '@/settings/Choice'
import { EffectTape, SettingsView, type SettingsViewProps } from '@/settings/SettingsView'
import type { DeviceHints, DeviceTier } from '@/scene/tiers'
import { TIERS } from '@/scene/tiers'

const HINTS: DeviceHints = { webgl2: true, majorPerformanceCaveat: false, coarsePointer: false, deviceMemory: 8, hardwareConcurrency: 8, maxTextureSize: 16384, saveData: false }
const device = (patch: Partial<DeviceTier> = {}): DeviceTier => ({ tier: 2, reason: 'default', known: true, hints: HINTS, ...patch })
const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch })

const render = (element: ReactElement) => renderToString(createElement(StaticRouter, { location: '/settings' }, element)).replaceAll('<!-- -->', '')
const decode = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')

function view(patch: Partial<SettingsViewProps> = {}): string {
  return render(
    createElement(SettingsView, { settings: settings(), device: device(), systemReduces: false, onChange: () => undefined, problem: null, data: createElement('p', { 'data-slot': 'data' }, 'the data panel'), ...patch }),
  )
}

/** The switch with this label: whether it is on. Its block runs from its own opening tag to its label. */
function switchOn(html: string, label: string): boolean | undefined {
  const at = html.indexOf(`>${label}</label>`)
  if (at < 0) return undefined
  const start = html.lastIndexOf('<div class="es-toggle"', at)
  const checked = /role="switch" aria-checked="(true|false)"/.exec(html.slice(start, at))?.[1]
  return checked === undefined ? undefined : checked === 'true'
}

/** The plates of the group with this name: their words, and whether each is pressed. */
function plates(html: string, group: string): { label: string; pressed: boolean; disabled: boolean }[] {
  const start = html.indexOf(`>${group}</span>`)
  const block = html.slice(start, html.indexOf('</div>', html.indexOf('role="group"', start)))
  return [...block.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)].map((match) => ({
    label: match[2].replace(/<[^>]+>/g, '').trim(),
    pressed: /aria-pressed="true"/.test(match[1]),
    disabled: /disabled=""/.test(match[1]),
  }))
}

describe('the page', () => {
  const html = view()

  test('has one h1, "Settings", and a panel for the view, motion, keys, and the slot the page fills with this device`s data', () => {
    expect([...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1])).toEqual(['Settings'])
    expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((match) => match[1])).toEqual(['View', 'Motion', 'Keys'])
    expect(html).toContain('data-slot="data"')
  })

  test('says that the choices are kept on this device, sent nowhere, and apply at once in every tab', () => {
    expect(decode(html)).toContain('kept on this device and sent nowhere')
    expect(decode(html)).toContain('applies at once, in every tab you have open')
  })

  test('the printer`s tape stands in an aside of its own, after the panels in the page', () => {
    expect(html).toContain('<aside class="es-page__side" aria-label="What these settings do"')
    expect(html.indexOf('es-page__main')).toBeLessThan(html.indexOf('es-page__side'))
  })

  test('the controls are real switches and real buttons, each named', () => {
    expect([...html.matchAll(/role="switch"/g)]).toHaveLength(2)
    expect(html).toContain('Draw the games in 3D')
    expect(html).toContain('Game keys')
    for (const group of ['Quality cap', 'Reduced motion']) expect(html).toContain(`>${group}</span>`)
    expect([...html.matchAll(/role="group" aria-labelledby=/g)]).toHaveLength(2)
  })
})

describe('the 3D switch and the quality cap', () => {
  test('3D on by default, with the cap at tier 3 pressed', () => {
    const html = view()
    expect(switchOn(html, 'Draw the games in 3D')).toBe(true)
    expect(plates(html, 'Quality cap')).toEqual([
      { label: 'Tier 1 · light', pressed: false, disabled: false },
      { label: 'Tier 2 · standard', pressed: false, disabled: false },
      { label: 'Tier 3 · full', pressed: true, disabled: false },
    ])
  })

  test('the chosen cap is the one pressed, and its own line shows under the plates', () => {
    const html = view({ settings: settings({ tierCap: 1 }) })
    expect(plates(html, 'Quality cap').map((plate) => plate.pressed)).toEqual([true, false, false])
    expect(decode(html)).toContain('The lightest 3D view')
    expect(decode(view({ settings: settings({ tierCap: 2 }) }))).toContain('Smoother, with anti-aliasing')
  })

  test('with 3D off, the switch is off and the cap cannot be chosen, whatever it is set to', () => {
    const html = view({ settings: settings({ view3d: false, tierCap: 2 }), device: device({ tier: 0, reason: 'chosen-2d' }) })
    expect(switchOn(html, 'Draw the games in 3D')).toBe(false)
    expect(plates(html, 'Quality cap').every((plate) => plate.disabled)).toBe(true)
    expect(plates(html, 'Quality cap').find((plate) => plate.pressed)?.label).toBe('Tier 2 · standard')
  })

  test.each([
    ['a phone or a small machine', { ...HINTS, coarsePointer: true }, 'This device starts at tier 1, and the cap can only lower that.'],
    ['an ordinary laptop', HINTS, 'This device starts at tier 2, and the cap can only lower that.'],
    ['a browser with no WebGL2', { ...HINTS, webgl2: false }, 'This browser has no WebGL2, so the view stays in 2D and there is nothing to cap.'],
    ['software rendering', { ...HINTS, majorPerformanceCaveat: true }, 'This browser draws 3D in software, so the view stays in 2D and there is nothing to cap.'],
  ])('says what %s would start at', (_, hints, sentence) => {
    expect(decode(view({ device: device({ hints }) }))).toContain(sentence)
  })

  test('says it is checking before the browser has been asked, and prints no guess', () => {
    const html = decode(view({ device: device({ known: false, tier: 0, hints: null }) }))
    expect(html).toContain('Checking what this device can draw.')
    expect(html).not.toContain('This device starts at')
  })
})

describe('reduced motion', () => {
  test('three ways to decide, with the system`s own answer beside "follow my system"', () => {
    const html = view({ systemReduces: true })
    expect(plates(html, 'Reduced motion')).toEqual([
      { label: 'Follow my system', pressed: true, disabled: false },
      { label: 'Reduce motion', pressed: false, disabled: false },
      { label: 'Keep motion', pressed: false, disabled: false },
    ])
    expect(decode(html)).toContain('Your system asks for reduced motion right now.')
    expect(decode(view({ systemReduces: false }))).toContain('Your system asks for full motion right now.')
    expect(decode(view({ systemReduces: null }))).toContain('This browser does not say what your system asks.')
  })

  test('an override is the plate that is pressed, and what it does is under the row', () => {
    const reduce = view({ settings: settings({ motion: 'reduce' }) })
    expect(plates(reduce, 'Reduced motion').map((plate) => plate.pressed)).toEqual([false, true, false])
    expect(decode(reduce)).toContain('Always reduced, whatever your system asks.')
    const full = view({ settings: settings({ motion: 'full' }), systemReduces: true })
    expect(plates(full, 'Reduced motion').map((plate) => plate.pressed)).toEqual([false, false, true])
    expect(decode(full)).toContain('Always full, whatever your system asks.')
  })

  test('says what reduced motion does: the cameras cut, time steps, nothing moves without input', () => {
    const text = decode(view())
    expect(text).toContain('the cameras cut, time advances in steps, and nothing moves until you press something')
  })
})

describe('game keys', () => {
  test('on by default, and off when the learner turned them off', () => {
    expect(switchOn(view(), 'Game keys')).toBe(true)
    expect(switchOn(view({ settings: settings({ gameKeys: false }) }), 'Game keys')).toBe(false)
    // The two switches are independent.
    expect(switchOn(view({ settings: settings({ gameKeys: false }) }), 'Draw the games in 3D')).toBe(true)
  })

  test('says that off, every control is still a button', () => {
    expect(decode(view())).toContain('every control is still a button')
  })
})

describe('a change that could not be saved', () => {
  test.each([
    ['view3d', 'Draw the games in 3D'],
    ['gameKeys', 'Game keys'],
  ] as const)('is printed at the switch for %s, in an alert, and nowhere else', (setting, label) => {
    const html = view({ problem: { setting, detail: 'this tab is read-only, so it cannot save. Reload to update.' } })
    expect([...html.matchAll(/role="alert"/g)]).toHaveLength(1)
    expect(decode(html)).toContain('Not saved: this tab is read-only, so it cannot save. Reload to update.')
    // The alert belongs to the control that failed: it comes after that switch's label.
    expect(html.indexOf('role="alert"')).toBeGreaterThan(html.indexOf(label))
  })

  test.each(['tierCap', 'motion'] as const)('is printed under the plates for %s', (setting) => {
    const html = view({ problem: { setting, detail: 'the browser would not open its storage.' } })
    expect(html).toContain('es-choice__error')
    expect(decode(html)).toContain('Not saved: the browser would not open its storage.')
    expect([...html.matchAll(/role="alert"/g)]).toHaveLength(1)
  })

  test('is not printed when there is none', () => {
    expect(view()).not.toContain('role="alert"')
  })
})

describe('the tape: what the pass does now', () => {
  const tape = (patch: Partial<Parameters<typeof EffectTape>[0]> = {}) =>
    decode(render(createElement(EffectTape, { settings: settings(), device: device(), systemReduces: false, ...patch })))
  const line = (html: string, label: string): string => new RegExp(`<dt>${label}</dt><dd>(.*?)</dd>`, 's').exec(html)?.[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '(no line)'

  test('in 3D: the tier, and what that tier budgets, each number tagged estimated (A§6.6)', () => {
    const html = tape()
    expect(line(html, 'view')).toBe('3D')
    expect(line(html, 'tier')).toBe('T2')
    expect(line(html, 'frame budget')).toBe('16.7 ms estimated')
    expect(line(html, 'pixel ratio, up to')).toBe('1.5 x estimated'.replace(' x', 'x'))
    expect(TIERS[2].frameBudgetMs.toFixed(1)).toBe('16.7')
  })

  test('at tier 1 it budgets a slower frame and a lower pixel ratio', () => {
    const html = tape({ device: device({ tier: 1 }) })
    expect(line(html, 'tier')).toBe('T1')
    expect(line(html, 'frame budget')).toBe('33.3 ms estimated')
    expect(line(html, 'pixel ratio, up to')).toBe('1.0x estimated')
  })

  test('in 2D: says so and why, and prints no tier or budget', () => {
    const html = tape({ settings: settings({ view3d: false }), device: device({ tier: 0, reason: 'chosen-2d' }) })
    expect(line(html, 'view')).toBe('2D')
    expect(line(html, 'because')).toBe('3D is off in Settings')
    expect(html).not.toContain('<dt>tier</dt>')
    expect(html).not.toContain('frame budget')
  })

  test.each([
    ['no-webgl2', 'This browser has no WebGL2'],
    ['software', 'This browser draws 3D in software'],
    ['capped', 'The tier cap in Settings is 2D'],
    ['lost-twice', 'The 3D view stopped twice in this session'],
  ] as const)('a 2D view for the reason %s says "%s"', (reason, words) => {
    expect(line(tape({ device: device({ tier: 0, reason }) }), 'because')).toBe(words)
  })

  test('says it is checking until the browser has been asked, and the printer is warming', () => {
    const html = tape({ device: device({ known: false, tier: 0, hints: null }) })
    expect(html).toContain('Warming up')
    expect(html).toContain('aria-busy="true"')
  })

  test('motion: the learner`s choice, or the system`s answer, and what it comes to', () => {
    expect(line(tape({ systemReduces: true }), 'motion')).toBe('reduced · your system')
    expect(line(tape({ systemReduces: false }), 'motion')).toBe('full · your system')
    expect(line(tape({ settings: settings({ motion: 'reduce' }), systemReduces: false }), 'motion')).toBe('reduced · your choice')
    expect(line(tape({ settings: settings({ motion: 'full' }), systemReduces: true }), 'motion')).toBe('full · your choice')
    expect(line(tape({ systemReduces: null }), 'motion')).toBe('full · your system')
  })

  test('game keys: on, or off in the ribbon`s red', () => {
    expect(line(tape(), 'game keys')).toBe('on')
    const off = render(createElement(EffectTape, { settings: settings({ gameKeys: false }), device: device(), systemReduces: false }))
    expect(line(off, 'game keys')).toBe('off')
    expect(off).toMatch(/data-tone="ink-2"[^>]*><dt>game keys/)
  })

  test('every number on it passes through the readout with a tag', () => {
    const html = tape()
    expect([...html.matchAll(/<data /g)].length).toBe(2)
    expect([...html.matchAll(/data-tag="estimated"/g)].length).toBe(2)
  })
})

describe('Choice', () => {
  const choose = (props: Partial<Parameters<typeof Choice<number>>[0]> = {}) =>
    render(
      createElement(Choice<number>, {
        label: 'Pick one',
        options: [
          { value: 1, label: 'One', hint: 'The first.' },
          { value: 2, label: 'Two' },
        ],
        value: 1,
        onChange: () => undefined,
        ...props,
      }),
    )

  test('is a named group of toggle buttons with one pressed', () => {
    const html = choose()
    expect(html).toMatch(/role="group" aria-labelledby="([^"]+)"/)
    const id = /aria-labelledby="([^"]+)"/.exec(html)?.[1]
    expect(html).toContain(`id="${id}">Pick one</span>`)
    expect(plates(html, 'Pick one')).toEqual([
      { label: 'One', pressed: true, disabled: false },
      { label: 'Two', pressed: false, disabled: false },
    ])
  })

  test('describes the group by the chosen option`s line, the general line, and an error, each its own paragraph', () => {
    const html = choose({ hint: 'In general.', error: 'Not saved.' })
    const described = /aria-describedby="([^"]+)"/.exec(html)?.[1].split(' ') ?? []
    expect(described).toHaveLength(3)
    for (const id of described) expect(html).toContain(`id="${id}"`)
    expect(html).toContain('data-hint="chosen">The first.</p>')
    expect(html).toContain('data-hint="group">In general.</p>')
    expect(html).toContain('role="alert"')
  })

  test('has no description to point at when there is none', () => {
    const html = choose({ options: [{ value: 1, label: 'One' }] })
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toContain('es-choice__hint')
  })

  test('disabled, every plate is disabled and the pressed one stays pressed', () => {
    expect(plates(choose({ disabled: true }), 'Pick one')).toEqual([
      { label: 'One', pressed: true, disabled: true },
      { label: 'Two', pressed: false, disabled: true },
    ])
  })
})
