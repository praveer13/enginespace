/**
 * `tr3.inside-a-graph`: what a trace shows of a replayed CUDA graph (TR3; KC `tr3.graph-traces`). It is TR3's Keep family for the
 * difference between a trace at graph level and one at node level. The scene is a decode step of a few layers, each layer a list of
 * kernels, written three ways as a `trace@1` with the trace builder; every key is counted from those traces' own columns.
 *
 *   graph level   a replay is one launch call and one GPU item for the whole graph (claim nsys.graph-trace-default).
 *   node level    the same replay is one launch call, and the kernels inside it are its nodes' activities (claim nsys.graph-trace-node).
 *   graphs off    every kernel has its own launch call.
 *
 * From level 2 the last few kernels of the step (sampling) run outside the graph, as eager launches, so that each trace holds them too.
 * The lure of the fourth option is that the kernels of a replay still sit under the ranges and Python frames of the code that launched
 * them: a replay carries none (claims sglang.profiling.nvtx-in-graphs and sglang.profiling.graph-hides-source).
 *
 *   what-shows   which description fits the trace of one of the three ways? The three are the key one time in three each, and the lure never.
 *   kernels      how many kernels does the node-level trace show for the step? The kernels of the layers and, from level 2, those outside.
 */
import { below, between } from '@es/sim/core'
import { CAT_KERNEL, CAT_LAUNCH, traceBuilder } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { Gen, Given, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { derived, drawOutcome, EXACT, NS, placeEntries, workedPart } from './kit'
import type { Entry } from './kit'

const FAMILY = 'tr3.inside-a-graph'
const VERSION = 1
const KC = 'tr3.graph-traces'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'what-shows', title: 'What a trace shows of a graph replay', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'kernels', title: 'The kernels a node-level trace shows', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'what-shows' | 'kernels'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** The kernels of one layer in the order they run (the trace model's generic names); a scene's layer is a prefix of this list. */
const LAYER = ['rms_norm', 'qkv_proj', 'rope', 'attention', 'o_proj', 'gate_up_proj', 'silu_mul', 'down_proj'] as const

type Way = 'graph' | 'node' | 'eager'

export interface Scene {
  readonly layers: number
  /** The kernels of one layer: the first so many of `LAYER`. */
  readonly perLayer: number
  /** Kernels after the layers that run outside the graph (sampling): 0 below level 2. */
  readonly outside: number
  /** The way asked about, drawn first: the key of `what-shows`. */
  readonly way: Way
}

const WAYS: readonly Way[] = ['graph', 'node', 'eager']

export function drawScene(variant: VariantId, level: Level, seed: number, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  const layers = level <= 1 ? between(rng, 2, 8) : between(rng, 3, 12)
  const perLayer = between(rng, 3, LAYER.length)
  const outside = level <= 1 ? 0 : between(rng, 1, 3)
  return { layers, perLayer, outside, way: WAYS[below(itemRng(FAMILY, variant, level, seed, `${purpose}/outcome`), 3)] }
}

/** The step traced one way. Every kernel and every call is 4 µs: only the counts of the trace are read. */
export function stepTrace(scene: Scene, way: Way): EsTrace {
  const b = traceBuilder()
  const api = b.track('cuda-api', 'CUDA API')
  const gpu = b.track('gpu-stream', 'stream 1')
  let callAt = 0
  let gpuAt = 8
  const launch = (name: string, corr: number): number => {
    const span = b.span(api, callAt * NS, 3 * NS, name, CAT_LAUNCH, corr)
    callAt += 4
    return span
  }
  const run = (name: string, cat: string, corr: number, from: number): number => {
    gpuAt = Math.max(gpuAt, from)
    const span = b.span(gpu, gpuAt * NS, 4 * NS, name, cat, corr)
    gpuAt += 4
    return span
  }
  const inGraph = scene.layers * scene.perLayer
  let corr = 1
  if (way === 'eager') {
    for (let at = 0; at < inGraph; at += 1) {
      const call = launch('cudaLaunchKernel', corr)
      b.flow(call, run(LAYER[at % scene.perLayer], CAT_KERNEL, corr, callAt), 'launch')
      corr += 1
    }
  } else {
    const call = launch('cudaGraphLaunch', corr)
    if (way === 'graph') b.flow(call, run('graph', 'graph', corr, callAt), 'launch')
    else {
      for (let at = 0; at < inGraph; at += 1) b.flow(call, run(LAYER[at % scene.perLayer], CAT_KERNEL, corr, callAt), 'launch')
    }
    corr += 1
  }
  for (let at = 0; at < scene.outside; at += 1) {
    const call = launch('cudaLaunchKernel', corr)
    b.flow(call, run(at === 0 ? 'logits' : 'sample', CAT_KERNEL, corr, callAt), 'launch')
    corr += 1
  }
  return b.build({ source: 'synthetic', synthetic: true })
}

/** What a trace holds, counted from its columns: the launch calls, the items on GPU streams, and the kernels among them. */
export function countsOf(trace: EsTrace): { calls: number; items: number; kernels: number } {
  const kind = new Map(trace.tracks.map((track) => [track.id, track.kind]))
  let calls = 0
  let items = 0
  let kernels = 0
  for (let i = 0; i < trace.spans.track.length; i += 1) {
    const cat = trace.strings[trace.spans.cat[i]]
    if (kind.get(trace.spans.track[i]) === 'gpu-stream') {
      items += 1
      if (cat === CAT_KERNEL) kernels += 1
    } else if (cat === CAT_LAUNCH) calls += 1
  }
  return { calls, items, kernels }
}

/** The kernels the node-level trace shows, from the trace model. */
export const nodeKernels = (scene: Scene): number => countsOf(stepTrace(scene, 'node')).kernels

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

function givensOf(scene: Scene): Given[] {
  return [
    { label: 'one layer launches', value: code(LAYER.slice(0, scene.perLayer).join(', ')) },
    { label: 'layers in the step', value: num(scene.layers, { tag: 'synthetic', unit: 'layers' }) },
    ...(scene.outside > 0 ? [{ label: 'kernels run outside the graph', value: num(scene.outside, { tag: 'synthetic', unit: scene.outside === 1 ? 'kernel' : 'kernels' }) } as Given] : []),
  ]
}

const WAY_WORDS: Readonly<Record<Way, Rich>> = {
  graph: rich('the trace taken with ', code('--cuda-graph-trace=graph')),
  node: rich('the trace taken with ', code('--cuda-graph-trace=node')),
  eager: rich('the trace of the same step with CUDA graphs off'),
}

const stemFor = (scene: Scene, variant: VariantId): Rich => {
  const lead = rich(scene.outside > 0 ? 'A decode step runs the layers below inside one CUDA graph that is replayed, and then the kernels that run outside the graph. ' : 'A decode step runs the layers below, all inside one CUDA graph that is replayed. ')
  return variant === 'what-shows'
    ? rich(...lead, 'Which description fits ', ...WAY_WORDS[scene.way], '?')
    : rich(...lead, 'How many kernels does the trace taken with ', code('--cuda-graph-trace=node'), ' show for the step?')
}

/*
 * The first step of each solution is the rule alone: no figure of the scene. At level 1 it is the step a learner is shown before
 * answering, and the questions of a lesson's Test are asked at level 1, so it must not say which description fits or how many kernels.
 */
const RULE = rich('A graph replay is one launch call. A trace at graph level keeps the whole replay as one item; one at node level opens the replay and shows each kernel inside it; with graphs off every kernel has its own launch call. Kernels that run outside the graph keep their own launch calls in all three.')
const KERNELS_RULE = rich('At node level the kernels of every layer show, each as its own item, so count the kernels of one layer and take that many for each layer. Kernels outside the graph are launched on their own and show too.')

function whatSteps(scene: Scene): Step[] {
  const c = countsOf(stepTrace(scene, scene.way))
  return [
    { text: RULE },
    { text: rich('For this step that trace holds ', num(c.calls, { tag: 'derived', unit: c.calls === 1 ? 'launch call' : 'launch calls' }), ' and ', num(c.items, { tag: 'derived', unit: c.items === 1 ? 'GPU item' : 'GPU items' }), '.') },
  ]
}

function kernelsSteps(scene: Scene): Step[] {
  const key = nodeKernels(scene)
  const inGraph = scene.layers * scene.perLayer
  return [
    { text: KERNELS_RULE },
    { text: rich('One layer has ', num(scene.perLayer, { tag: 'derived', unit: 'kernels' }), ' and the step has ', num(scene.layers, { tag: 'synthetic', unit: 'layers' }), ', so the graph holds ', num(inGraph, { tag: 'derived', unit: 'kernels' }), '.') },
    {
      text: scene.outside > 0 ? rich('The ', num(scene.outside, { tag: 'synthetic', unit: scene.outside === 1 ? 'kernel' : 'kernels' }), ' outside the graph are added.') : rich('Nothing runs outside the graph, so the graph\'s kernels are all of them.'),
      result: derived(key, 'kernels'),
    },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Diagnoses                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function sceneOfItem(item: Pick<Item, 'variant' | 'level' | 'seed'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  return drawScene(item.variant, item.level, item.seed, 'scene')
}

const DIAGNOSES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOfItem(item)
    return value === 1 + scene.outside
      ? { id: `${FAMILY}.one-item`, message: rich('That is what the graph-level trace holds: the replay as one item. The node-level trace opens the replay and shows each kernel inside it.') }
      : null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    return scene.outside > 0 && value === scene.layers * scene.perLayer
      ? { id: `${FAMILY}.outside-forgotten`, message: rich('That counts the kernels inside the graph only. The kernels run outside it are launched on their own, and the node-level trace shows them too.') }
      : null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    return value === scene.layers + scene.perLayer + scene.outside
      ? { id: `${FAMILY}.layers-plus-kernels`, message: rich('That adds the layers to the kernels of one layer. Each layer runs all of the layer\'s kernels again, so the two multiply.') }
      : null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Two ways to close each option, so that the length of an option is not a sign of which it is. */
const PHRASES: Readonly<Record<Way | 'ranges', readonly [string, string]>> = {
  graph: ['(the replay folded into a single item)', '(the whole replay, folded into one item whatever it holds)'],
  node: ['(one item for each kernel in the replay)', '(the replay opened up, one item for every kernel inside it)'],
  eager: ['(one call for every kernel, none shared)', '(every kernel launched on its own, with no replay to share)'],
  ranges: ['(each kernel under its own layer range)', '(each kernel under the range and Python frame of its layer)'],
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

function entriesFor(scene: Scene, seed: number): Entry[] {
  const g = countsOf(stepTrace(scene, 'graph'))
  const n = countsOf(stepTrace(scene, 'node'))
  const e = countsOf(stepTrace(scene, 'eager'))
  const phrase = (way: Way | 'ranges'): string => PHRASES[way][drawOutcome(FAMILY, `phrase-${way}`, 0, seed, 2)]
  const words = (c: { calls: number; items: number }, way: Way | 'ranges'): Rich =>
    rich(num(c.calls, { tag: 'synthetic', unit: plural(c.calls, 'launch call', 'launch calls') }), ' and ', num(c.items, { tag: 'synthetic', unit: plural(c.items, 'GPU item', 'GPU items') }), ` ${phrase(way)}`)
  const mine = scene.way
  const miss = (slug: string): { miss: string } => ({ miss: `${FAMILY}.${slug}` })
  const entry = (way: Way, lureWhy: Record<Way, [string, Rich]>, right: Rich): Entry =>
    way === mine ? { text: words(way === 'graph' ? g : way === 'node' ? n : e, way), right: true, why: right } : { text: words(way === 'graph' ? g : way === 'node' ? n : e, way), why: lureWhy[mine][1], ...miss(lureWhy[mine][0]) }
  return [
    entry(
      'graph',
      {
        graph: ['', rich('')],
        node: ['one-item-for-nodes', rich('That is the graph-level trace: the replay is one item, and nothing inside it shows. Node level opens the replay.')],
        eager: ['graph-for-eager', rich('That is the graph-level trace. With graphs off there is no replay to fold into one item: every kernel has its own launch call.')],
      },
      rich('At graph level the replay is one launch call and one item on the GPU, whatever it holds inside.'),
    ),
    entry(
      'node',
      {
        graph: ['nodes-for-graph', rich('That opens the replay, which only the node-level trace does. The graph-level trace keeps it as one item.')],
        node: ['', rich('')],
        eager: ['nodes-for-eager', rich('That has one launch call for the replay, and graphs off has none to share: every kernel is launched on its own.')],
      },
      rich('At node level the replay is still one launch call, and every kernel inside it is an item of its own.'),
    ),
    entry(
      'eager',
      {
        graph: ['eager-for-graph', rich('That is a step run without graphs. A graph is launched once, so its trace has far fewer launch calls than kernels.')],
        node: ['eager-for-node', rich('That gives each kernel its own launch call. At node level the kernels are shown, but the replay is still launched once.')],
        eager: ['', rich('')],
      },
      rich('With graphs off every kernel is launched on its own, so the trace holds one launch call for each kernel.'),
    ),
    {
      text: words(n, 'ranges'),
      why: rich('The kernels of a replay do not sit under the ranges or the Python frames of the code that launched them: those were open when the graph was captured, not when it replays.'),
      miss: `${FAMILY}.ranges-inside-a-replay`,
    },
  ]
}

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const scene = drawScene(variant, level, seed, 'scene')
  const gen = { id: FAMILY, version: VERSION }
  const base = {
    variant: spec.id,
    level,
    seed,
    kcs: spec.kcs,
    params: { layers: scene.layers, perLayer: scene.perLayer, outside: scene.outside, way: scene.way },
    stem: stemFor(scene, variant),
    givens: givensOf(scene),
  }
  if (variant === 'what-shows') {
    const { options, correct } = placeEntries(FAMILY, variant, level, seed, entriesFor(scene, seed))
    return finishItem(gen, {
      ...base,
      worked: workedPart(level, whatSteps(scene), (attempt) => {
        const other = drawScene(variant, level, seed, `example-${attempt}`)
        return other.way === scene.way ? null : whatSteps(other)
      }),
      answer: { kind: 'choice', label: 'what the trace shows', options, correct },
    })
  }
  const key = nodeKernels(scene)
  return finishItem(gen, {
    ...base,
    worked: workedPart(level, kernelsSteps(scene), (attempt) => {
      const other = drawScene(variant, level, seed, `example-${attempt}`)
      return nodeKernels(other) === key ? null : kernelsSteps(other)
    }),
    answer: { kind: 'numeric', label: 'the kernels shown', unit: 'kernels', truth: key, tolerance: EXACT },
  })
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const insideAGraph: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'What a trace shows of a graph replay',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the way asked about is drawn first, one seed in three, and the numbers differ between ways.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, DIAGNOSES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    const scene = sceneOfItem(item)
    return item.variant === 'kernels' ? kernelsSteps(scene) : whatSteps(scene)
  },
}

