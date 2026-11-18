/*
 * W1b-T07: the map and the module pages count items and lab checks toward progress, as well as game levels. Until now `appSources` named
 * KCs for a game run alone, so a learner who answered items and passed a lab saw progress from their game levels only, while Today
 * scheduled from the items (W1-report §5). The events here are the ledger's, and the course is the repository's own content as the app
 * loads it (its compiled map and index), so these tests follow the families and the labs as they are built.
 *
 * An item is evidence for the KCs of its variant (A§8.2), the rule that Today reads. A lab check is evidence for the KCs of the lab's
 * checks together, and a run is one event that passes only when every check does (ASSESSMENT §4.5). ASSESSMENT §9's states, which wait on
 * Q-5, are not derived.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import type { LedgerEvent } from '@es/ledger'
import { CATALOG } from '@es/play/items/catalog'
import type { ContentIndex, CourseMap } from '@es/schema'
import { LAB_CHECK_KCS } from '@es/sim/forge/kcs'
import { CourseMapView } from '@/map/CourseMap'
import { OUTCOME_KCS, outcomesPassed } from '@/map/outcomes'
import { deriveProgress } from '@/progress/derive'
import { appSources, homeModule } from '@/progress/sources'
import { compileContent } from '../../scripts/content/build.ts'
import { output, repo } from '../content/support.ts'
import { made } from '../progress/support'
import { render, textOf } from './support'

const compiled = compileContent({ root: repo })
const INDEX = JSON.parse(output(compiled, 'src/content/generated/index.json')) as ContentIndex
const MAP = JSON.parse(output(compiled, 'src/content/generated/map.json')) as CourseMap

const progressOf = (events: readonly LedgerEvent[]) => deriveProgress(events, MAP, appSources(MAP), homeModule)
const graph = new Set(MAP.kcs.map((kc) => kc.id))
const kcsOf = (module: string) => MAP.kcs.filter((kc) => kc.module === module)
const labKcs = (lab: string): string[] => [...new Set(Object.values(LAB_CHECK_KCS[lab].kcs).flat())]
const owner = (lab: string): string | undefined => MAP.modules.find((module) => module.labs.includes(lab))?.id
const item = (family: string, variant: string, options?: Parameters<typeof made>[2]) => made('item', `item:gen/${family}/${variant}`, options)
const labCheck = (lab: string, options?: Parameters<typeof made>[2]) => made('lab-check', `lab:${lab}`, options)

/** Every KC that the events touch, as `id:state`, sorted: what moved and how far. */
const moved = (events: readonly LedgerEvent[]): string[] =>
  [...progressOf(events).kcs.values()]
    .filter((kc) => kc.state !== 'none')
    .map((kc) => `${kc.id}:${kc.state}`)
    .sort()
const as = (state: string, kcs: readonly string[]): string[] => kcs.map((kc) => `${kc}:${state}`).sort()

describe('an item moves the KCs of its variant', () => {
  test('a right answer on a fresh seed earns the KC that its variant assesses, and no other of its family', () => {
    expect(moved([item('tr2.bubble-width', 'async-off')])).toEqual(['tr2.bubble:earned'])
    expect(moved([item('tr2.bubble-width', 'async-on')])).toEqual(['tr2.async-overlap:earned'])
    expect(moved([item('tr2.bubble-width', 'close-it')])).toEqual(['tr2.async-overlap:earned', 'tr2.bubble:earned'])
  })

  test('so it does for every variant of every family that is built, and each names KCs that the graph has', () => {
    for (const face of CATALOG) {
      for (const variant of face.variants) {
        expect(variant.kcs.filter((kc) => !graph.has(kc)), `${face.id}/${variant.id} names a KC the graph does not have`).toEqual([])
        expect(moved([item(face.id, variant.id)]), `${face.id}/${variant.id}`).toEqual(as('earned', variant.kcs))
      }
    }
  })

  test('a wrong answer, and a pass on a seed already seen or with help, practise the KC and earn nothing', () => {
    expect(moved([item('tr2.bubble-width', 'async-off', { ok: false })])).toEqual(['tr2.bubble:practised'])
    expect(moved([item('tr2.bubble-width', 'async-off', { provenance: 'practice' })])).toEqual(['tr2.bubble:practised'])
    expect(moved([item('tr2.bubble-width', 'async-off', { provenance: 'assisted' })])).toEqual(['tr2.bubble:practised'])
  })

  test('a right answer on a fresh seed 30 days after the KC was earned keeps it, and 29 days is too soon', () => {
    expect(moved([item('tr2.bubble-width', 'async-off', { day: 0 }), item('tr2.bubble-width', 'async-off', { day: 29 })])).toEqual(['tr2.bubble:earned'])
    expect(moved([item('tr2.bubble-width', 'async-off', { day: 0 }), item('tr2.bubble-width', 'async-off', { day: 30 })])).toEqual(['tr2.bubble:kept'])
  })

  test("an item moves the KCs of its own module, whichever game the learner has played", () => {
    const state = progressOf([item('tr6.mask-fits', 'gap')])
    expect(moved([item('tr6.mask-fits', 'gap')])).toEqual(['tr6.mask-overlap:earned'])
    expect(state.modules.get('tr6')?.counts.earned).toBe(1)
    expect(state.modules.get('tr2')?.counts.earned).toBe(0)
  })

  test('a variant that this build does not have moves no KC, and the item still counts for its module', () => {
    const state = progressOf([item('tr2.bubble-width', 'a-variant-that-was-removed')])
    expect(moved([item('tr2.bubble-width', 'a-variant-that-was-removed')])).toEqual([])
    expect(state.modules.get('tr2')?.loop.play).toEqual({ tried: 1, credited: 1, partial: 0 })
    expect(state.events).toBe(1)
  })
})

describe("a lab check moves the KCs of the lab's checks", () => {
  const labs = Object.keys(LAB_CHECK_KCS)

  test('a run that passes every check earns them, and the lab is in the Build step of the module that lists it', () => {
    expect(labs).toEqual(['hybrid-kv', 'rejection-sampler'])
    for (const lab of labs) {
      const expected = labKcs(lab)
      expect(expected.length, `${lab} assesses a KC`).toBeGreaterThan(0)
      expect(expected.filter((kc) => !graph.has(kc)), `${lab} names a KC the graph does not have`).toEqual([])
      expect(moved([labCheck(lab)]), lab).toEqual(as('earned', expected))
      expect(owner(lab), `${lab} is listed by a module`).toBeDefined()
      expect(progressOf([labCheck(lab)]).modules.get(owner(lab) as string)?.loop.build, lab).toEqual({ tried: 1, credited: 1, partial: 0 })
    }
  })

  test('hybrid-kv earns the five KCs of TR5a that its checks assess, and rejection-sampler the three of TR6', () => {
    expect(moved([labCheck('hybrid-kv')])).toEqual([
      'tr5a.adapter-pages:earned',
      'tr5a.all-or-nothing:earned',
      'tr5a.hit-intersection:earned',
      'tr5a.sliding-free:earned',
      'tr5a.state-pages:earned',
    ])
    expect(moved([labCheck('rejection-sampler')])).toEqual(['tr6.exact-acceptance:earned', 'tr6.exactness-testing:earned', 'tr6.residual-recovery:earned'])
  })

  test("the module's KCs that no check assesses stay as they were", () => {
    for (const lab of labs) {
      const state = progressOf([labCheck(lab)])
      const rest = kcsOf(owner(lab) as string).filter((kc) => !labKcs(lab).includes(kc.id))
      expect(rest.length, `${lab}: the module has KCs beyond the lab's`).toBeGreaterThan(0)
      for (const kc of rest) expect(state.kcs.get(kc.id)?.state, `${lab}: ${kc.id}`).toBe('none')
    }
  })

  test('a run with a check red is "check failed, retry": it practises the KCs and earns none (ASSESSMENT §4.5, §4.6)', () => {
    for (const lab of labs) expect(moved([labCheck(lab, { ok: false })]), lab).toEqual(as('practised', labKcs(lab)))
    // A red run and then a green one: earned.
    expect(moved([labCheck('hybrid-kv', { ok: false }), labCheck('hybrid-kv', { day: 1 })])).toEqual(as('earned', labKcs('hybrid-kv')))
  })

  test('a lab that has no table moves no KC', () => {
    expect(moved([labCheck('toy')])).toEqual([])
    expect(moved([labCheck('kv-publisher')])).toEqual([])
  })
})

describe('the map and the module pages show it', () => {
  const events = [item('tr2.bubble-width', 'async-off'), labCheck('hybrid-kv')]
  const map = (ledger: readonly LedgerEvent[]) =>
    render(h(CourseMapView, { modules: INDEX.modules, totalHours: INDEX.totalHours, map: MAP, progress: progressOf(ledger), ready: true }), '/map')
  const rowOf = (html: string, module: string) => {
    const start = html.indexOf(`<li class="es-course__row" data-module="${module}"`)
    return html.slice(start, html.indexOf('</li>', html.indexOf('es-course__standing', start)))
  }

  test("the course's row for the item's module counts it as a skill passed", () => {
    expect(textOf(rowOf(map(events), 'tr2'))).toContain(`1 of ${kcsOf('tr2').length} skills passed`)
  })

  test("the course's row for the lab's module counts the lab's KCs", () => {
    expect(textOf(rowOf(map(events), 'tr5a'))).toContain(`${labKcs('hybrid-kv').length} of ${kcsOf('tr5a').length} skills passed`)
  })

  test('without the events, the same rows count none: the numbers come from the item and the lab', () => {
    const html = map([])
    expect(textOf(rowOf(html, 'tr2'))).toContain(`0 of ${kcsOf('tr2').length} skills passed`)
    expect(textOf(rowOf(html, 'tr5a'))).toContain(`0 of ${kcsOf('tr5a').length} skills passed`)
  })

  test('a module page ticks the outcomes whose KCs the item and the lab passed', () => {
    const states = new Map([...progressOf(events).kcs].map(([kc, row]) => [kc, row.state]))
    const passedOf = (id: string) => outcomesPassed(id, OUTCOME_KCS[id].length, states, true)
    // The one item passes tr2.bubble, which is one of five KCs under TR2's first outcome: no outcome is whole yet.
    expect(passedOf('tr2')).toEqual([false, false, false, false])
    // The lab passes five of TR5a's eight KCs, which complete the third outcome (one KC) and no other.
    expect(passedOf('tr5a')).toEqual([false, false, true, false])
  })
})
