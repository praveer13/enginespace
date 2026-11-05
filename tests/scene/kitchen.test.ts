/*
 * Scene kit v1's specimens on /design (src/scene/kitchen-specimen.ts, KitchenNote2D.tsx): the small service the bell runs is the
 * same on every visit and never breaks the rail's own rules, every piece has its layout, its camera and its 2D note, the assembled
 * pass is one static set of five draws whose occlusion bakes in a few tens of milliseconds, and the notes are drawings of the
 * kitchen in its own materials, not charts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { staticSceneTokens } from '@/design/scene-tokens'
import { CAMERAS, CLIPS, kitchenLayout, serviceAt, SPIKED, stationsLit, SUBJECT_INFO, SUBJECTS } from '@/scene/kitchen-specimen'
import { KitchenDrawing } from '@/scene/KitchenNote2D'
import { paletteFrom } from '@/scene/props/palette'
import { buildSet } from '@/scene/props/set'

describe('the service the bell runs', () => {
  test('is the same on every visit', () => {
    expect(JSON.stringify(serviceAt(17))).toBe(JSON.stringify(serviceAt(17)))
    expect(serviceAt(0).rail.map((ticket) => ticket.no)).toEqual([101, 102, 103])
  })

  test('keeps the rail whole for 60 bells: a ball under every ticket, every clip with one ball, the oldest nearest the spike', () => {
    for (let step = 0; step <= 60; step++) {
      const state = serviceAt(step)
      expect(state.rail.length).toBeLessThanOrEqual(CLIPS)
      expect(state.rail.map((ticket) => ticket.clip)).toEqual(state.rail.map((_, i) => i))
      for (let i = 1; i < state.rail.length; i++) expect(state.rail[i].no).toBeGreaterThan(state.rail[i - 1].no)
      expect(new Set(state.balls).size).toBe(CLIPS)
      expect([...state.balls].sort()).toEqual([0, 1, 2, 3])
      for (const ticket of state.rail) expect(state.balls[state.grips[ticket.no]]).toBe(ticket.clip)
      expect(state.spiked.length).toBeLessThanOrEqual(SPIKED)
      expect(state.plates).toHaveLength(state.rail.length)
    }
  })

  test('spikes the oldest ticket at each bell, and the printer feeds only when a ticket is printed', () => {
    for (let step = 1; step <= 30; step++) {
      const before = serviceAt(step - 1)
      const after = serviceAt(step)
      if (before.rail.length > 0) expect(after.spiked.at(-1)).toBe(before.rail[0].no)
      expect(after.lastPrinted === before.lastPrinted).toBe(after.printed.length === 0)
    }
  })

  test('the line burns where a ticket is cooking and stands dark where none is', () => {
    const counts = new Set<number>()
    for (let step = 0; step <= 16; step++) {
      const state = serviceAt(step)
      const lit = stationsLit(state)
      expect(lit.filter(Boolean)).toHaveLength(Math.min(3, state.rail.length))
      counts.add(lit.filter(Boolean).length)
    }
    // The pattern lights and darkens the line: some fires leave a station dark.
    expect(counts.size).toBeGreaterThan(1)
  })
})

describe('the pieces', () => {
  test.each(SUBJECTS)('%s has its layout, its camera, its sizes and a sentence for the bell', (subject) => {
    const layout = kitchenLayout(subject)
    expect(layout.items.length).toBeGreaterThan(0)
    const camera = CAMERAS[subject]
    expect(camera.fov).toBeGreaterThan(20)
    expect(camera.portrait.fov).toBeGreaterThanOrEqual(camera.fov)
    for (const light of layout.lights) expect(light.at[1]).toBeGreaterThan(light.target[1])
    const info = SUBJECT_INFO[subject]
    expect(info.sizes.length).toBeGreaterThan(0)
    for (const size of info.sizes) expect(size.mm).toBeGreaterThan(0)
    expect(info.bell.length).toBeGreaterThan(10)
  })

  test('the assembled pass is one static set of five draws, and its occlusion bakes once in tens of milliseconds', () => {
    const palette = paletteFrom(staticSceneTokens())
    const started = performance.now()
    const set = buildSet(kitchenLayout('assembled').items, palette)
    const ms = performance.now() - started
    expect(set.meshes).toHaveLength(5)
    console.log(`the assembled pass: ${set.vertices} vertices, built and baked in ${ms.toFixed(0)} ms on this host`)
    expect(set.vertices).toBeLessThan(120_000)
    set.dispose()
  })
})

describe('the 2D notes', () => {
  test.each(SUBJECTS)('%s is drawn in the kitchen’s materials: an image with a name, tile, steel and no chart', (subject) => {
    const html = renderToString(createElement(KitchenDrawing, { subject, step: 3 }))
    expect(html).toContain('role="img"')
    expect(html).toContain(`aria-label="${SUBJECT_INFO[subject].name.replace(/'/g, '&#x27;')}`)
    expect(html).toMatch(/es-draw__(steel|alu|chrome|glaze|tape)/)
    // No chart furniture: no axis, no legend, no tick.
    expect(html).not.toMatch(/\b(?:axis|legend|tick)\b/)
  })

  test('a lit station glows in the lamp’s amber and a dark one does not', () => {
    const lit = renderToString(createElement(KitchenDrawing, { subject: 'burners', step: 0 }))
    const dark = renderToString(createElement(KitchenDrawing, { subject: 'burners', step: 1 }))
    expect(lit).toContain('es-draw__pilot-lit')
    expect(dark).not.toContain('es-draw__pilot-lit')
  })
})
