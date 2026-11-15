/**
 * `tr5a.pages-for-adapter`: how many pages of the pool an adapter takes, and what that does to the pages left (TR5a; KC `tr5a.adapter-pages`). It
 * is the exit item of TR5a's fourth lesson, two of its three, and GAMES.md §8's Keep item "pages for a rank-r adapter". The pool is the learner's
 * design, S-LoRA's unified paging (D-042), and not an engine's at the pins: vLLM and SGLang keep adapters in slots outside the KV pool (claims
 * vllm.lora.s-lora-scope, sglang.lora.pool), which `tr5a.slots-vs-pages` asks about. In the course's pool (D-045):
 *
 *   an adapter takes ⌈adapter bytes ÷ page bytes⌉ pages, stored anywhere (claims kv.slora.page-vector, kv.slora.non-contiguous: S-LoRA's page is one
 *   vector of the hidden size, so a rank-R adapter takes R of those, and the course's page is the block of a group, which is coarser). A LoRA
 *   adapter has a down matrix and an up matrix for each projection it adapts, `rank × hidden` weights each, so its bytes are
 *   `2 × rank × hidden × projections × layers × bytes per weight` (the sim's `kvLoraBytes`; kernelspace's T6.L9).
 *   a request runs only when its adapter is resident, and every request on an adapter shares its pages (lesson 4, rules 3 and 4), so an adapter that
 *   is resident takes no page again for a second request;
 *   a load takes all of its pages or none (claim kv.kernelspace.lab02-all-or-nothing): a refused load leaves the pool as it was. Unloading an adapter
 *   returns its pages and touches no KV page.
 *
 * What the variants ask:
 *   pages       the pages an adapter of a rank takes (levels 0 to 3);
 *   to-run      the pages left after a request is admitted, whose adapter is resident already or has to be loaded first (levels 0 to 3);
 *   free-after  the pages the pool can supply after a load, an unload, or a load that is refused (levels 0 to 3);
 *   empty-share the share of the adapter's pages that stays empty in its last page, in percent (levels 1 to 3).
 * At levels 0 to 2 the bytes of the adapter for each unit of its rank and the bytes of a page are given. At level 3 the surface changes: the adapter
 * is given by its shape (hidden size, layers, projections, bytes of a weight) and the page by its make-up (layers in a group, tokens in a block, bytes
 * of a token in a layer), and the learner works out the two sizes first. At level 0 a worked example with other numbers comes first, and at level 1
 * the words of the first step.
 *
 * tests/play/items-tr5a-pages-for-adapter.test.ts holds every key to the sim (`kvAdapterPages`, `kvLoraBytes`, and the reference manager's replies to a
 * load, an unload and an admit). The scene is synthetic and every number in it is [estimated]: the lesson's adapter (65,536 bytes for each unit of
 * rank, in pages of 163,840 bytes) is among the draws.
 */
import { below, divCeil, divFloor, divRound, pick } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { num, rich, text } from '../../rich'
import type { Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import {
  ADAPTED_LAYERS,
  adapterPages,
  emptyBytes,
  EXACT,
  GROUP_LAYERS,
  HIDDEN,
  pageBytes,
  pagesOf,
  percentOf,
  PROJECTIONS,
  TOKEN_BYTES,
  unitBytes,
  workedPart,
} from './kit'
import type { AdapterShape, PageShape } from './kit'

/** The share of the adapter's pages that stays empty, in percent to one decimal: the empty bytes over the bytes of all its pages. */
export const emptyShare = (rank: number, unit: number, page: number): number => percentOf(emptyBytes(rank, unit, page), adapterPages(rank, unit, page) * page)

const FAMILY = 'tr5a.pages-for-adapter'
const VERSION = 1
const KC = 'tr5a.adapter-pages'

type VariantId = 'pages' | 'to-run' | 'free-after' | 'empty-share'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'pages', title: 'The pages an adapter takes', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'to-run', title: 'The pages left after a request runs', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'free-after', title: 'The pages free after a load or an unload', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'empty-share', title: 'The share of an adapter\'s pages left empty', kcs: [KC], levels: [1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Scene {
  readonly variant: VariantId
  readonly rank: number
  /** Bytes for each unit of rank, and bytes in a page: the numbers of levels 0 to 2, and what level 3 works out from the shapes. */
  readonly unit: number
  readonly page: number
  /** Level 3 only: the shapes the two sizes come from. */
  readonly adapter: AdapterShape | null
  readonly layout: PageShape | null
  /** `to-run`: the pages the request's blocks need, and whether its adapter is resident. `free-after`: the pages free before the operation. */
  readonly need: number
  readonly free: number
  readonly resident: boolean
  /** `free-after`: what is done to the adapter. */
  readonly op: 'load' | 'unload' | 'refuse'
}

/** The pages left or free after the operation of the scene, by the rules above. */
export function keyOf(scene: Scene): number {
  const pages = adapterPages(scene.rank, scene.unit, scene.page)
  switch (scene.variant) {
    case 'pages':
      return pages
    case 'to-run':
      return scene.free - scene.need - (scene.resident ? 0 : pages)
    case 'free-after':
      return scene.op === 'load' ? scene.free - pages : scene.op === 'unload' ? scene.free + pages : scene.free
    case 'empty-share':
      return emptyShare(scene.rank, scene.unit, scene.page)
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const RANKS = [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256] as const

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  const rank = pick(rng, RANKS)
  // The two sizes come from shapes at every level, so that they are not round; levels 0 to 2 give them outright, and level 3 gives the shapes.
  const adapter: AdapterShape = { hidden: pick(rng, HIDDEN), layers: pick(rng, ADAPTED_LAYERS), projections: pick(rng, PROJECTIONS), weightBytes: 2 }
  const layout: PageShape = { layers: pick(rng, GROUP_LAYERS), block: 16, tokenBytes: pick(rng, TOKEN_BYTES) }
  const unit = unitBytes(adapter)
  const page = pageBytes(layout)
  const pages = adapterPages(rank, unit, page)
  const need = 4 + below(rng, 57)
  const resident = below(rng, 2) === 0
  // The operation of `free-after`: mostly a load or an unload, and now and then a load that does not fit.
  const choice = below(rng, 100)
  const op: Scene['op'] = choice < 8 ? 'refuse' : choice < 54 ? 'load' : 'unload'
  let free: number
  if (variant === 'to-run') free = need + (resident ? 0 : pages) + 1 + below(rng, 80)
  else if (op === 'refuse') free = Math.max(0, pages - 1 - below(rng, Math.max(1, pages - 1)))
  else if (op === 'load') free = pages + below(rng, 90)
  else free = below(rng, 90)
  // What a variant does not use is left at nothing, so that it is not a part of the item's fingerprint.
  return {
    variant,
    rank,
    unit,
    page,
    adapter: level === 3 ? adapter : null,
    layout: level === 3 ? layout : null,
    need: variant === 'to-run' ? need : 0,
    free: variant === 'to-run' || variant === 'free-after' ? free : 0,
    resident: variant === 'to-run' ? resident : false,
    op: variant === 'free-after' ? op : 'load',
  }
}

/** Whether a scene makes a fair question (the band). All integer arithmetic. */
function isFair(scene: Scene): boolean {
  const bytes = scene.rank * scene.unit
  const pages = adapterPages(scene.rank, scene.unit, scene.page)
  // The adapter fills several pages and leaves its last page part empty, so that the rounding up is a part of the question, and the key is
  // not the rank, which S-LoRA's pages would give.
  if (pages < 4 || pages > 120 || bytes % scene.page === 0 || pages === scene.rank) return false
  switch (scene.variant) {
    case 'pages':
      return true
    case 'empty-share':
      return emptyShare(scene.rank, scene.unit, scene.page) >= 1
    case 'to-run':
      return keyOf(scene) >= 1
    case 'free-after':
      return scene.op === 'refuse' ? scene.free < pages : keyOf(scene) >= 0
  }
}

function paramsOf(scene: Scene): Params {
  const params: Record<string, number | string | boolean> = {
    rank: scene.rank,
    unit: scene.unit,
    page: scene.page,
    need: scene.need,
    free: scene.free,
    resident: scene.resident,
    op: scene.op,
  }
  if (scene.adapter !== null && scene.layout !== null) {
    params['hidden'] = scene.adapter.hidden
    params['adaptedLayers'] = scene.adapter.layers
    params['projections'] = scene.adapter.projections
    params['weightBytes'] = scene.adapter.weightBytes
    params['groupLayers'] = scene.layout.layers
    params['block'] = scene.layout.block
    params['tokenBytes'] = scene.layout.tokenBytes
  }
  return params
}

/** The scene an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const p = item.params
  const read = (name: string): number => {
    const value = p[name]
    if (typeof value !== 'number') throw new TypeError(`${FAMILY}: the param ${name} of ${item.variant} is not a number`)
    return value
  }
  const { resident, op } = p
  if (typeof resident !== 'boolean' || (op !== 'load' && op !== 'unload' && op !== 'refuse')) throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  const shaped = p['hidden'] !== undefined
  return {
    variant: item.variant,
    rank: read('rank'),
    unit: read('unit'),
    page: read('page'),
    adapter: shaped ? { hidden: read('hidden'), layers: read('adaptedLayers'), projections: read('projections'), weightBytes: read('weightBytes') } : null,
    layout: shaped ? { layers: read('groupLayers'), block: read('block'), tokenBytes: read('tokenBytes') } : null,
    need: read('need'),
    free: read('free'),
    resident,
    op,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (value: number, unit?: string): NumPart => num(value, { tag: 'synthetic', ...(unit === undefined ? {} : { unit }) })
const derivedBytes = (value: number): NumPart => num(value, { unit: 'bytes', tag: 'derived' })
const pagesResult = (value: number): NumPart => num(value, { unit: 'pages', tag: 'derived' })
const percent = (value: number): NumPart => num(value, { unit: '%', tag: 'derived', digits: 1 })

/** The steps that work out the two sizes at level 3, before the arithmetic every level shares. */
function shapeSteps(scene: Scene): Step[] {
  if (scene.adapter === null || scene.layout === null) return []
  const a = scene.adapter
  const l = scene.layout
  return [
    {
      text: rich(
        'An adapter has a down matrix and an up matrix for each projection of each layer it adapts, so each unit of rank weighs twice ',
        given(a.hidden, 'values'),
        ' × ',
        given(a.projections, 'projections'),
        ' × ',
        given(a.layers, 'layers'),
        ' × ',
        given(a.weightBytes, 'bytes'),
        ' = ',
        derivedBytes(scene.unit),
        '.',
      ),
      result: derivedBytes(scene.unit),
    },
    {
      text: rich('A page is the block of a group: ', given(l.layers, 'layers'), ' × ', given(l.block, 'tokens'), ' × ', given(l.tokenBytes, 'bytes'), ' = ', derivedBytes(scene.page), '.'),
      result: derivedBytes(scene.page),
    },
  ]
}

/** The steps that work out the pages of the adapter from the two sizes. */
function adapterSteps(scene: Scene): Step[] {
  const bytes = scene.rank * scene.unit
  const pages = adapterPages(scene.rank, scene.unit, scene.page)
  return [
    ...shapeSteps(scene),
    { text: rich('The adapter weighs ', given(scene.rank), ' × ', derivedBytes(scene.unit), ' = ', derivedBytes(bytes), '.'), result: derivedBytes(bytes) },
    {
      text: rich('A page holds ', derivedBytes(scene.page), ', and a last page that is only partly filled is a page too: ', derivedBytes(bytes), ' ÷ ', derivedBytes(scene.page), ' rounded up = ', pagesOf(pages), '.'),
      result: pagesResult(pages),
    },
  ]
}

function stepsOfScene(scene: Scene): Step[] {
  const pages = adapterPages(scene.rank, scene.unit, scene.page)
  const key = keyOf(scene)
  const base = adapterSteps(scene)
  switch (scene.variant) {
    case 'pages':
      return base
    case 'to-run':
      return [
        ...base,
        scene.resident
          ? { text: rich('The adapter is resident already. Its pages were taken when it loaded, and a request on it shares them, so the request takes only its own ', given(scene.need, 'pages'), '.') }
          : { text: rich('The adapter is not resident, and a request runs only when it is, so it loads first and takes ', pagesOf(pages), ' beside the request\'s own ', given(scene.need, 'pages'), '.') },
        {
          text: scene.resident
            ? rich('Of the ', given(scene.free, 'pages'), ' free, ', given(scene.need, 'pages'), ' are taken, which leaves ', pagesResult(key), '.')
            : rich('Of the ', given(scene.free, 'pages'), ' free, ', pagesOf(pages), ' + ', given(scene.need, 'pages'), ' are taken, which leaves ', pagesResult(key), '.'),
          result: pagesResult(key),
        },
      ]
    case 'free-after':
      return [
        ...base,
        scene.op === 'refuse'
          ? {
              text: rich(
                'A load takes all of the adapter\'s pages or none. The pool can supply ',
                given(scene.free, 'pages'),
                ' and the adapter needs ',
                pagesOf(pages),
                ', so the load is refused and the pool is left exactly as it was: ',
                pagesResult(key),
                '.',
              ),
              result: pagesResult(key),
            }
          : scene.op === 'load'
            ? { text: rich('The load takes all ', pagesOf(pages), ' out of the ', given(scene.free, 'pages'), ' free: ', given(scene.free, 'pages'), ' − ', pagesOf(pages), ' = ', pagesResult(key), '.'), result: pagesResult(key) }
            : {
                text: rich('Unloading gives the adapter\'s ', pagesOf(pages), ' back and touches no KV page: ', given(scene.free, 'pages'), ' + ', pagesOf(pages), ' = ', pagesResult(key), '.'),
                result: pagesResult(key),
              },
      ]
    case 'empty-share': {
      const total = pages * scene.page
      return [
        ...base,
        {
          text: rich('The ', pagesOf(pages), ' hold ', pagesOf(pages), ' × ', derivedBytes(scene.page), ' = ', derivedBytes(total), ', and the adapter fills ', derivedBytes(scene.rank * scene.unit), ' of them, so ', derivedBytes(emptyBytes(scene.rank, scene.unit, scene.page)), ' stay empty.'),
          result: derivedBytes(emptyBytes(scene.rank, scene.unit, scene.page)),
        },
        {
          text: rich('That is ', derivedBytes(emptyBytes(scene.rank, scene.unit, scene.page)), ' ÷ ', derivedBytes(total), ' = ', percent(key), ' of the adapter\'s pages.'),
          result: percent(key),
        },
      ]
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function sizesGivens(scene: Scene): Given[] {
  if (scene.adapter !== null && scene.layout !== null) {
    return [
      { label: 'hidden size', value: given(scene.adapter.hidden, 'values') },
      { label: 'layers adapted', value: given(scene.adapter.layers, 'layers') },
      { label: 'projections adapted in each layer', value: given(scene.adapter.projections, 'projections') },
      { label: 'bytes of a weight', value: given(scene.adapter.weightBytes, 'bytes') },
      { label: 'layers in a group', value: given(scene.layout.layers, 'layers') },
      { label: 'tokens in a block', value: given(scene.layout.block, 'tokens') },
      { label: 'bytes of a token in a layer', value: given(scene.layout.tokenBytes, 'bytes') },
    ]
  }
  return [
    { label: 'bytes for each unit of rank', value: given(scene.unit, 'bytes') },
    { label: 'bytes in a page', value: given(scene.page, 'bytes') },
  ]
}

/** How the two sizes are introduced in a stem: given outright, or by the shapes that make them. */
function sizesSentence(scene: Scene): Rich {
  return scene.adapter !== null && scene.layout !== null
    ? rich('The adapter has a down matrix and an up matrix, rank × hidden weights each, for each projection it adapts. A page of the pool is the block of a group of layers.')
    : rich('The adapter weighs ', given(scene.unit, 'bytes'), ' for each unit of its rank, and the pool\'s pages are ', given(scene.page, 'bytes'), ' each.')
}

function stemOf(scene: Scene): Rich {
  const adapter = rich('An adapter of rank ', given(scene.rank), ' is kept in the pool of the course, as pages that need not be together. ')
  switch (scene.variant) {
    case 'pages':
      return rich(...adapter, ...sizesSentence(scene), ' How many pages does the adapter take?')
    case 'empty-share':
      return rich(...adapter, ...sizesSentence(scene), ' Its last page is only partly filled. What share of the adapter\'s pages stays empty, in percent to one decimal place?')
    case 'to-run':
      return rich(
        'The pool has ',
        given(scene.free, 'pages'),
        ' free. A request needs ',
        given(scene.need, 'pages'),
        ' for its blocks, and it names an adapter of rank ',
        given(scene.rank),
        ', which is ',
        scene.resident ? 'resident already' : 'not resident',
        '. A request runs only when its adapter is resident. ',
        ...sizesSentence(scene),
        ' Once the request is admitted, how many pages can the pool supply?',
      )
    case 'free-after': {
      const what =
        scene.op === 'unload'
          ? rich('The resident adapter of rank ', given(scene.rank), ', which no running request uses, is unloaded.')
          : rich('A load of an adapter of rank ', given(scene.rank), ' is tried.')
      return rich('The pool can supply ', given(scene.free, 'pages'), '. ', ...what, ' ', ...sizesSentence(scene), ' How many pages can the pool supply afterwards?')
    }
  }
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const key = keyOf(scene)
  const worked = workedPart(level, stepsOfScene(scene), (attempt) => {
    const example = drawScene(scene.variant, level, seed, `example-${attempt}`)
    return isFair(example) && keyOf(example) !== key && example.rank !== scene.rank ? stepsOfScene(example) : null
  })
  const givens: Given[] = [
    { label: 'rank of the adapter', value: given(scene.rank) },
    ...sizesGivens(scene),
    ...(scene.variant === 'to-run' ? [{ label: 'pages the request\'s blocks need', value: given(scene.need, 'pages') }, { label: 'the adapter', value: text(scene.resident ? 'resident' : 'not resident') }] : []),
    ...(scene.variant === 'to-run' || scene.variant === 'free-after' ? [{ label: 'pages free now', value: given(scene.free, 'pages') }] : []),
    ...(scene.variant === 'free-after' ? [{ label: 'done to the adapter', value: text(scene.op === 'unload' ? 'unloaded' : 'a load is tried') }] : []),
  ]
  const share = scene.variant === 'empty-share'
  const label = scene.variant === 'pages' ? 'pages the adapter takes' : share ? 'share of its pages left empty' : 'pages the pool can supply'
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(scene),
      stem: stemOf(scene),
      givens,
      worked,
      // A share is right to the decimal that the question asks for, or within 2% of itself (ASSESSMENT §4.2: arithmetic on given numbers) [estimated].
      answer: share
        ? { kind: 'numeric', label, unit: '%', truth: key, tolerance: { rel: 0.02, abs: 0.05 }, digits: 1 }
        : { kind: 'numeric', label, unit: 'pages', truth: key, tolerance: EXACT },
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What each tempting rule gives for a scene, by the name of the misconception it encodes. */
function mistakes(scene: Scene): Readonly<Record<string, number>> {
  const bytes = scene.rank * scene.unit
  const pages = adapterPages(scene.rank, scene.unit, scene.page)
  switch (scene.variant) {
    case 'pages':
      return {
        'rounded-down': divFloor(bytes, scene.page),
        'rounded-nearest': divRound(bytes, scene.page),
        'rank-as-pages': scene.rank,
        'unit-only': divCeil(scene.unit, scene.page),
        'bytes-not-pages': bytes,
      }
    case 'empty-share': {
      const empty = emptyBytes(scene.rank, scene.unit, scene.page)
      return {
        'of-last-page': divRound(1000 * empty, scene.page) / 10,
        'filled-share': 100 - emptyShare(scene.rank, scene.unit, scene.page),
        'pages-not-share': pages,
      }
    }
    case 'to-run':
      return {
        'adapter-forgotten': scene.free - scene.need,
        'counted-twice': scene.free - scene.need - pages,
        'adapter-only': scene.free - pages,
        'request-only': scene.need,
      }
    case 'free-after':
      return scene.op === 'refuse'
        ? { 'took-the-free': 0, 'went-negative': scene.free - pages, 'rank-as-pages': scene.free - scene.rank }
        : {
            'wrong-direction': scene.op === 'unload' ? scene.free - pages : scene.free + pages,
            'no-change': scene.free,
            'rank-as-pages': scene.op === 'unload' ? scene.free + scene.rank : scene.free - scene.rank,
          }
  }
}

function messageFor(id: string, scene: Scene, value: number): Rich | null {
  const pages = adapterPages(scene.rank, scene.unit, scene.page)
  switch (id) {
    case 'rounded-down':
      return rich('That rounds down. The adapter\'s last page is only partly filled, but it is a page of the pool all the same, so the count rounds up.')
    case 'rounded-nearest':
      return rich('That rounds to the nearest page. A partly filled last page is still a page, so the count always rounds up.')
    case 'rank-as-pages':
      return scene.variant === 'pages'
        ? rich('That counts a page for each unit of rank, as S-LoRA\'s paper does with its pages of one vector of the hidden size. The course\'s page is the block of a group, which is much bigger, so the count is the adapter\'s bytes over the page\'s.')
        : rich('That takes a page for each unit of rank. An adapter takes its bytes over a page\'s, rounded up.')
    case 'unit-only':
      return rich('That is the pages of one unit of rank. The adapter weighs its rank times that.')
    case 'bytes-not-pages':
      return rich('That is the adapter\'s bytes, ', derivedBytes(value), '. A page holds ', derivedBytes(scene.page), ' of them, so divide.')
    case 'of-last-page':
      return rich('That is the share of the last page that stays empty. The question is the share of all the adapter\'s pages, and the other pages are full.')
    case 'filled-share':
      return rich('That is the share of the adapter\'s pages that is filled. The question is the share that stays empty.')
    case 'pages-not-share':
      return rich('That is the number of pages. The question is the share of them, in percent, that stays empty.')
    case 'adapter-forgotten':
      return rich('That leaves out the adapter. It is not resident, and a request runs only when its adapter is, so it loads first and takes ', pagesOf(pages), '.')
    case 'counted-twice':
      return rich('That takes the adapter\'s pages again. It is resident already: its pages were taken when it loaded, and every request on it shares them.')
    case 'adapter-only':
      return rich('That leaves out the request\'s own blocks, ', given(scene.need, 'pages'), ', which the admit takes as well.')
    case 'request-only':
      return rich('That is the request\'s own blocks. The question is the pages left in the pool.')
    case 'wrong-direction':
      return scene.op === 'unload'
        ? rich('That takes the adapter\'s pages out. Unloading gives them back to the pool.')
        : rich('That gives pages back. A load takes the adapter\'s pages out of the pool.')
    case 'took-the-free':
      return rich('That takes every free page before the load fails. A load takes all of its pages or none, so a refused load leaves the pool exactly as it was.')
    case 'went-negative':
      return rich('That takes the adapter\'s pages out although the pool could not supply them. A load takes all of its pages or none: this one is refused, and the pool is left exactly as it was.')
    case 'no-change':
      return scene.op === 'unload'
        ? rich('That leaves the pool as it was. Unloading gives the adapter\'s ', pagesOf(pages), ' back.')
        : rich('That leaves the pool as it was. This load fits, so it takes the adapter\'s ', pagesOf(pages), '.')
    default:
      return null
  }
}

const ORDER: readonly string[] = [
  'bytes-not-pages',
  'unit-only',
  'rounded-down',
  'rounded-nearest',
  'rank-as-pages',
  'of-last-page',
  'filled-share',
  'pages-not-share',
  'counted-twice',
  'adapter-forgotten',
  'adapter-only',
  'request-only',
  'took-the-free',
  'went-negative',
  'no-change',
  'wrong-direction',
]

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    const key = keyOf(scene)
    const wrong = mistakes(scene)
    for (const id of ORDER) {
      const target = wrong[id]
      if (target === undefined || target === key || value !== target) continue
      const message = messageFor(id, scene, value)
      if (message !== null) return { id: `${FAMILY}.${id}`, message }
    }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const pagesForAdapter: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Pages for an adapter',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return build(spec, drawScene(spec.id, level, seed, 'scene'), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    return isVariant(spec.id) && isFair(drawScene(spec.id, level, seed, 'scene'))
  },
  grade: (item, response) => gradeNumeric(item, response, RULES),
  solution: (item) => stepsOfScene(sceneOf(item)),
}
