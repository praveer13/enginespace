/*
 * The full service's kitchen, drawn (GAMES.md §2.6, "TR2's levels in the kitchen"; §3, "2D path"): the mold rack, the padding's molds, the
 * comb and the allergy card, in the 2D frame (packages/play/loop/full/layout.ts) and in the 3D scene's layout (src/games/loop/full/scene.ts),
 * from one plan (packages/play/loop/full/kitchen.ts). Neither draws a number but a ticket's or a mold's size, and the 2D view stays under its
 * mark cap.
 */
import { describe, expect, test } from 'bun:test'
import { COMB, rackOf, teethOf } from '@es/play/loop/full/kitchen'
import { fullFrame } from '@es/play/loop/full/layout'
import { fullSession } from '@es/play/loop/full/session'
import type { FullAction, FullLevelId, FullState } from '@es/play/loop/full/types'
import { MARK_CAP } from '@es/play/loop/layout'
import { countMarks } from '@es/play/loop/svg'
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

  test('stamps each mold\'s size in front of it, the mold the fire dropped into on a chip in the lamp\'s light', () => {
    let s = play(start('graphs'), { t: 'stage', to: 'sizes' }, { t: 'commit', prediction: 0 }, { t: 'capture', sizes: [6, 12] })
    for (let i = 0; i < 40 && fullSession.view(s).rack?.picked === null; i++) s = play(s, { t: 'run', until: 'step' })
    const view = fullSession.view(s)
    const rack = fullFrame(view).layers.find((layer) => layer.part === 'rack')!
    // The rack's numerals; its name on the tape is in marker.
    const stamps = rack.marks.flatMap((mark) => (mark.kind === 'text' && mark.face === 'numeric' ? [mark] : []))
    expect(stamps.map((mark) => mark.text)).toEqual(['6', '12'])
    expect(view.rack?.picked).not.toBeNull()
    expect(rack.marks.filter((mark) => mark.kind === 'rect' && mark.fill === 'lamp')).toHaveLength(1)
    expect(stamps[view.rack!.picked!].fill).toBe('paper-ink')
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

  test('the allergy card lies in front of the expo with ALLERGY printed in its head, on the mask level alone', () => {
    const mask = sceneOfFull(fullSession.view(play(start('mask'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' })))
    expect(mask.card?.ticket.id).toBe('allergy')
    expect(mask.anchors.find((anchor) => anchor.kind === 'card')).toMatchObject({ frame: 'ticket:allergy', text: 'allergy' })
    expect(sceneOfFull(fullSession.view(start('async'))).card).toBeNull()
  })
})
