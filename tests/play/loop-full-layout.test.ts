/*
 * The full service's kitchen, drawn (GAMES.md §2.6, "TR2's levels in the kitchen"; §3, "2D path"): the mold rack, the padding's molds, the
 * comb and the allergy card, in the 2D frame (packages/play/loop/full/layout.ts) and in the 3D scene's layout (src/games/loop/full/scene.ts),
 * from one plan (packages/play/loop/full/kitchen.ts). Neither prints a number but a ticket's or a mold's size, both of them DOM over the
 * picture, and the 2D view stays under its mark cap.
 */
import { describe, expect, test } from 'bun:test'
import { COMB, RACK, rackOf, teethOf } from '@es/play/loop/full/kitchen'
import { PASS } from '@es/play/loop/kitchen'
import { fullFrame } from '@es/play/loop/full/layout'
import { fullSession } from '@es/play/loop/full/session'
import type { FullAction, FullLevelId, FullState } from '@es/play/loop/full/types'
import { MARK_CAP, PASS_LENS } from '@es/play/loop/layout'
import { countMarks, svgMarkup } from '@es/play/loop/svg'
import { frameSvg } from '@es/play/loop/layout'
import { sceneOfFull } from '@/games/loop/full/scene'

const play = (state: FullState, ...actions: FullAction[]): FullState => actions.reduce((s, a) => fullSession.reduce(s, a), state)
const start = (id: FullLevelId, seed = 0): FullState => fullSession.init(fullSession.level(id, seed))
const parts = (state: FullState) => fullFrame(fullSession.view(state)).layers.map((layer) => layer.part)

describe('the 2D frame', () => {
  test('draws the rack and the comb on a graphs night, the allergy card on the mask level, and the padding of a padded fire', () => {
    const graphs = play(start('graphs'), { t: 'commit', prediction: 0 }, { t: 'lever', name: 'graphMode', value: 'FULL_AND_PIECEWISE' }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' })
    expect(parts(graphs)).toEqual(expect.arrayContaining(['rack', 'comb']))
    expect(parts(graphs)).not.toContain('allergy')
    const mask = play(start('mask'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' })
    expect(parts(mask)).toContain('allergy')
    let padded = play(start('graphs'), { t: 'stage', to: 'sizes' }, { t: 'commit', prediction: 0 }, { t: 'capture', sizes: [6, 12] })
    for (let i = 0; i < 40 && !fullSession.view(padded).fires.some((fire) => fire.padded > 0 && !fire.onLine); i++) padded = play(padded, { t: 'run', until: 'step' })
    expect(parts(padded)).toContain('padding')
  })

  test('stamps each mold\'s size in front of it, the mold the fire dropped into on a chip in the lamp\'s light, as print the page prints over the drawing', () => {
    let s = play(start('graphs'), { t: 'stage', to: 'sizes' }, { t: 'commit', prediction: 0 }, { t: 'capture', sizes: [6, 12] })
    for (let i = 0; i < 40 && fullSession.view(s).rack?.picked === null; i++) s = play(s, { t: 'run', until: 'step' })
    const view = fullSession.view(s)
    const frame = fullFrame(view)
    const rack = frame.layers.find((layer) => layer.part === 'rack')!
    // The rack's numerals are the page's print, in the DOM over the drawing at the size ramp's steps (W1b close-out, Service's 2D labels);
    // its name is on tape, in marker.
    const stamps = frame.tags.filter((tag) => tag.kind === 'mold' || tag.kind === 'pick')
    expect(stamps.map((tag) => tag.text)).toEqual(['6', '12'])
    expect(view.rack?.picked).not.toBeNull()
    // The fire's mold's chip is the page's too, in the lamp's amber, and printed at every width; the rest need room, as the scene's do.
    expect(stamps.map((tag) => tag.kind)).toEqual(['6', '12'].map((_, i) => (i === view.rack!.picked ? 'pick' : 'mold')))
    expect(stamps.map((tag) => tag.room)).toEqual(['6', '12'].map((_, i) => (i === view.rack!.picked ? undefined : true)))
    expect(svgMarkup(frameSvg(frame))).not.toContain('<text')
    // In front of each mold, between the ring and the plates.
    rackOf(view.rack!.sizes).molds.forEach((mold, i) => {
      const ring = rack.marks.filter((mark) => mark.kind === 'ellipse' && mark.fill === 'surface-2')[i]
      expect(ring?.kind === 'ellipse' && Math.abs(stamps[i].x - ring.cx) < 1 && stamps[i].y > ring.cy).toBe(true)
      expect(mold.size).toBe(Number(stamps[i].text))
    })
  })

  test("the full service's twelve clips print no stub's word and need room for their numbers, and every number and word is print over the drawing", () => {
    // Async on: the first fire on the fired rail and the next on the rail, every clip hung; and the night's tail, where clips ride empty.
    let night = play(start('async'), { t: 'commit', prediction: 0 }, { t: 'lever', name: 'async', value: true }, { t: 'run', until: 'step' })
    const first = fullSession.view(night)
    while (fullSession.view(night).rail.every((clip) => clip.req !== null) && fullSession.view(night).step < 80) night = play(night, { t: 'run', until: 'step' })
    const tail = fullSession.view(night)
    expect(first.rail.every((clip) => clip.req !== null)).toBe(true)
    expect(tail.rail.some((clip) => clip.req === null)).toBe(true)
    for (const view of [first, tail]) {
      for (const orientation of ['landscape', 'portrait'] as const) {
        const frame = fullFrame(view, { orientation, ...(orientation === 'portrait' ? { lens: PASS_LENS } : {}) })
        expect(svgMarkup(frameSvg(frame))).not.toContain('<text')
        // An empty clip keeps its stub of perforated paper, with no word on it.
        const stubs = (frame.layers.find((layer) => layer.part === 'rail')?.marks ?? []).filter((mark) => mark.kind === 'poly' && mark.fill === 'paper' && mark.dash !== undefined)
        expect(stubs).toHaveLength(view.rail.filter((clip) => clip.req === null).length)
        expect(frame.tags.filter((tag) => tag.kind === 'empty')).toEqual([])
        // Every ticket's number on the rail and on the fired rail, each needing room.
        const ticketsOf = (clips: readonly { req: number | null }[]) => clips.flatMap((clip) => (clip.req === null ? [] : [String(clip.req + 1).padStart(2, '0')]))
        expect(frame.tags.filter((tag) => tag.kind === 'ticket').map((tag) => tag.text)).toEqual(ticketsOf(view.rail))
        expect(frame.tags.filter((tag) => tag.kind === 'fired').map((tag) => tag.text)).toEqual(ticketsOf(view.firedRail ?? []))
        const numbers = frame.tags.filter((tag) => tag.kind === 'ticket' || tag.kind === 'fired')
        expect(numbers.length).toBeGreaterThan(0)
        expect(numbers.every((tag) => tag.room === true)).toBe(true)
      }
    }
  })

  test('stays under the mark cap, and its name reads the clock in µs on the model\'s clock', () => {
    const night = play(start('async'), { t: 'commit', prediction: 0 }, { t: 'lever', name: 'async', value: true }, { t: 'run', until: 'decision' })
    const frame = fullFrame(fullSession.view(night))
    expect(countMarks(frameSvg(frame))).toBeLessThanOrEqual(MARK_CAP)
    // The fullest rack: the modes stage's, every size up to 64 on it.
    const modes = play(start('graphs'), { t: 'stage', to: 'modes' }, { t: 'commit', prediction: 0 }, { t: 'run', until: 'decision' })
    expect(countMarks(frameSvg(fullFrame(fullSession.view(modes))))).toBeLessThanOrEqual(MARK_CAP)
    expect(frame.label).toContain("µs on the model's clock")
    expect(frame.label).not.toContain('ticks')
  })

  test("the comb and the rack carry their names on tape stuck on themselves, which the page prints in the DOM: the comb's on the front edge under its left end, clear of the expo's, the rack's at its row's right end (W1b's finish review of the lesson blocks, round 2)", () => {
    const view = fullSession.view(play(start('graphs'), { t: 'commit', prediction: 0 }, { t: 'lever', name: 'graphMode', value: 'FULL_AND_PIECEWISE' }, { t: 'run', until: 'step' }))
    for (const orientation of ['landscape', 'portrait'] as const) {
      // As the 2D view draws it: a phone's through the wider lens.
      const frame = fullFrame(view, { orientation, ...(orientation === 'portrait' ? { lens: PASS_LENS } : {}) })
      const tapes = new Map(frame.tapes.map((tape) => [tape.id, tape]))
      expect(tapes.get('comb')).toMatchObject({ text: 'comb · launches' })
      expect(tapes.get('molds')).toMatchObject({ text: 'molds · sizes', place: 'right' })
      // The words are the page's: the drawing holds none of them.
      expect(svgMarkup(frameSvg(frame))).not.toMatch(/comb · launches|molds · sizes/i)
      // On the front edge with the expo's, and further along it from the expo's middle than the two strips' halves are long. The strips are
      // about 104 and 91 px long in a drawing 356 px wide on a 390 px phone, and 122 and 108 px in one 870 px wide and 504 px tall on a
      // laptop [measured 2026-11-09 over wave-1b at d7ea594 with this round's tree]: half their sum is 0.27 of the phone's frame, 0.30 of
      // it on a 360 px phone's 326 px drawing, and 0.09 of the laptop's [derived].
      const comb = tapes.get('comb')!
      const expo = tapes.get('expo')!
      expect(Math.abs(comb.y - expo.y)).toBeLessThan(1)
      expect(expo.x - comb.x).toBeGreaterThan(frame.width * (orientation === 'portrait' ? 0.3 : 0.1))
    }
    // No tape names a tool that is not on the pass.
    expect(fullFrame({ ...view, rack: null, comb: null }).tapes.map((tape) => tape.id)).toEqual(['line', 'fired', 'expo'].filter((id) => id !== 'fired' || view.firedRail !== null))
  })
})

describe('the 3D scene\'s layout', () => {
  test('a mold for every captured size, each with its size as a label, the fire\'s mold under the lamp, and the padding\'s molds on the pass', () => {
    let s = play(start('graphs'), { t: 'stage', to: 'sizes' }, { t: 'commit', prediction: 0 }, { t: 'capture', sizes: [6, 12] })
    for (let i = 0; i < 40 && !fullSession.view(s).fires.some((fire) => fire.padded > 0 && !fire.onLine); i++) s = play(s, { t: 'run', until: 'step' })
    const view = fullSession.view(s)
    const scene = sceneOfFull(view)
    const served = [...view.fires].reverse().find((fire) => !fire.onLine)!
    const pads = Math.min(served.padded, served.places.filter((place) => place.state === 'empty').length)
    expect(scene.molds).toHaveLength(rackOf(view.levers.captureSizes).molds.length + pads)
    expect(scene.moldShadows).toHaveLength(scene.molds.length)
    const sizes = scene.anchors.filter((anchor) => anchor.kind === 'mold' || anchor.kind === 'pick').map((anchor) => anchor.text)
    expect(sizes).toEqual(['6', '12'])
    expect(scene.anchors.filter((anchor) => anchor.kind === 'pick').length).toBe(view.rack?.picked === null ? 0 : 1)
  })

  test('the comb: a spine and a tooth a layer as tall as its calls, or one word; and its calls in the DOM', () => {
    const eager = sceneOfFull(fullSession.view(play(start('graphs'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' })))
    expect(eager.comb).toHaveLength(1 + 28)
    expect(eager.comb[1].size[1]).toBeCloseTo(COMB.tooth, 6)
    expect(eager.anchors.find((anchor) => anchor.id === 'calls')?.text).toBe('336 calls')
    const view = fullSession.view(play(start('graphs'), { t: 'commit', prediction: 0 }, { t: 'lever', name: 'graphMode', value: 'FULL_AND_PIECEWISE' }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' }))
    const word = sceneOfFull(view)
    expect(word.comb).toHaveLength(1 + 1)
    expect(teethOf(view.comb!)).toHaveLength(1)
    expect(word.anchors.find((anchor) => anchor.id === 'calls')?.text).toBe('1 call')
  })

  test('the comb and the rack carry their names on tape, stuck on themselves: the comb\'s on the expo\'s edge under it, the rack\'s at its row\'s end', () => {
    const view = fullSession.view(play(start('graphs'), { t: 'commit', prediction: 0 }, { t: 'lever', name: 'graphMode', value: 'FULL_AND_PIECEWISE' }, { t: 'run', until: 'step' }))
    const scene = sceneOfFull(view)
    const comb = scene.anchors.find((anchor) => anchor.id === 'tape-comb')
    expect(comb).toMatchObject({ kind: 'tape', text: 'comb · launches' })
    // Under the comb's middle, on the pass's rolled front edge, in front of where the comb lies.
    expect(comb!.at[0]).toBeCloseTo((COMB.x0 + COMB.x1) / 2, 6)
    expect(comb!.at[2]).toBeGreaterThan(COMB.z)
    expect(Math.abs(comb!.at[1] - PASS.top)).toBeLessThan(0.05)
    const molds = scene.anchors.find((anchor) => anchor.id === 'tape-molds')
    expect(molds).toMatchObject({ kind: 'tape', text: 'molds · sizes', place: 'right' })
    // At the right end of the rack's row, level with it, wherever the night's sizes put that end.
    expect(molds!.at[0]).toBeCloseTo(rackOf(view.rack!.sizes).x1, 6)
    expect(molds!.at[2]).toBe(RACK.z)
    // No tape names a tool that is not on the pass.
    const bare = sceneOfFull({ ...view, rack: null, comb: null })
    expect(bare.anchors.filter((anchor) => anchor.kind === 'tape')).toEqual([])
  })

  test('the allergy card lies in front of the expo with ALLERGY printed in its head, on the mask level alone', () => {
    const mask = sceneOfFull(fullSession.view(play(start('mask'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' })))
    expect(mask.card?.ticket.id).toBe('allergy')
    expect(mask.anchors.find((anchor) => anchor.kind === 'card')).toMatchObject({ frame: 'ticket:allergy', text: 'allergy' })
    expect(sceneOfFull(fullSession.view(start('async'))).card).toBeNull()
  })
})
