/**
 * `tr3.launch-and-kernel`: which kernel a launch call started, and how long the kernel waited (TR3; KC `tr3.trace-anatomy`). It is TR3's
 * Keep family for reading a trace: a launch call on the main thread and the kernel it started on a GPU stream carry one correlation id,
 * and the id, not the order in time, ties them. The scenes are a few launch calls and their kernels, written as the spans of a `trace@1`
 * with the trace builder, and every key is read from that trace's columns.
 *
 *   which-kernel   the launch call that starts at a given time: which kernel did it start? From level 2 the kernels run on two streams,
 *                  and the order in which they start is not the order of the calls.
 *   lag            the same call: how many µs from its return to its kernel's start? The kernel may also wait behind earlier work on its
 *                  stream, so the lag is not the call's own length.
 *
 * Kernel names are the course's generic layer names (the trace model's), and every time is synthetic.
 */
import { between, shuffle } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { CAT_KERNEL, CAT_LAUNCH, traceBuilder } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, rich } from '../../rich'
import type { Gen, Given, Item, Level, Step, VariantSpec } from '../../types'
import { drawOutcome, EXACT, NS, placeEntries, us, usDerived, workedPart } from './kit'
import type { Entry } from './kit'

const FAMILY = 'tr3.launch-and-kernel'
const VERSION = 1
const KC = 'tr3.trace-anatomy'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'which-kernel', title: 'The kernel a launch call started', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'lag', title: 'From a launch call to its kernel', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'which-kernel' | 'lag'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** The names of kernels of one layer (the trace model's own generic names): each is used once in a scene. */
const NAMES = ['rms_norm', 'qkv_proj', 'rope', 'attention', 'o_proj', 'gate_up_proj', 'silu_mul', 'down_proj'] as const

export interface Launch {
  readonly corr: number
  readonly callFromUs: number
  readonly callToUs: number
  readonly name: string
  readonly stream: number
  readonly kernelFromUs: number
  readonly kernelToUs: number
}

export interface Scene {
  readonly launches: readonly Launch[]
  /** Which launch the question is about: the key's own. */
  readonly ask: number
}

const callsAt = (level: Level): number => (level <= 1 ? 3 : level === 2 ? 4 : 5)

export function drawScene(variant: VariantId, level: Level, seed: number, purpose: string): Scene {
  const rng: Rng = itemRng(FAMILY, variant, level, seed, purpose)
  const n = callsAt(level)
  const names = shuffle(rng, NAMES).slice(0, n)
  const free = [0, 0]
  let callAt = between(rng, 8, 24)
  let corr = between(rng, 10, 60)
  const launches: Launch[] = []
  for (let at = 0; at < n; at += 1) {
    const callToUs = callAt + between(rng, 3, 6)
    const stream = level >= 2 ? between(rng, 0, 1) : 0
    const kernelFromUs = Math.max(callToUs + between(rng, 2, 30), free[stream])
    const kernelToUs = kernelFromUs + between(rng, 10, 40)
    free[stream] = kernelToUs
    launches.push({ corr, callFromUs: callAt, callToUs, name: names[at], stream: stream + 1, kernelFromUs, kernelToUs })
    callAt = callToUs + between(rng, 1, 6)
    corr += between(rng, 1, 6)
  }
  // Answer first: the call asked about is each of the scene's calls on one seed in n.
  return { launches, ask: drawOutcome(FAMILY, variant, level, seed, n) }
}

/** The scene as a `trace@1`: the calls on a CUDA API track, each kernel on its stream, and a flow from every call to its kernel. */
export function launchTrace(scene: Scene): EsTrace {
  const b = traceBuilder()
  const api = b.track('cuda-api', 'CUDA API')
  const streams = new Map<number, number>()
  for (const launch of scene.launches) if (!streams.has(launch.stream)) streams.set(launch.stream, b.track('gpu-stream', `stream ${launch.stream}`))
  for (const launch of scene.launches) {
    const call = b.span(api, launch.callFromUs * NS, (launch.callToUs - launch.callFromUs) * NS, 'cudaLaunchKernel', CAT_LAUNCH, launch.corr)
    const kernel = b.span(streams.get(launch.stream) ?? 0, launch.kernelFromUs * NS, (launch.kernelToUs - launch.kernelFromUs) * NS, launch.name, CAT_KERNEL, launch.corr)
    b.flow(call, kernel, 'launch')
  }
  return b.build({ source: 'synthetic', synthetic: true })
}

interface Read {
  readonly kernel: string
  readonly lagUs: number
  readonly corr: number
}

/** What the trace says of the call that starts at `callFromUs`: its correlation id, the kernel with that id, and the µs from the call's return to the kernel's start. */
export function readCall(trace: EsTrace, callFromUs: number): Read {
  const { startNs, durNs, corr, name, cat } = trace.spans
  const isLaunch = trace.strings.map((s) => s === CAT_LAUNCH)
  const isKernel = trace.strings.map((s) => s === CAT_KERNEL)
  let call = -1
  for (let i = 0; i < startNs.length; i += 1) if (isLaunch[cat[i]] && startNs[i] === callFromUs * NS) call = i
  if (call < 0) throw new RangeError(`${FAMILY}: no launch call starts at ${callFromUs} µs`)
  for (let i = 0; i < startNs.length; i += 1) {
    if (isKernel[cat[i]] && corr[i] === corr[call]) return { kernel: trace.strings[name[i]], lagUs: (startNs[i] - (startNs[call] + durNs[call])) / NS, corr: corr[call] }
  }
  throw new RangeError(`${FAMILY}: no kernel has the id ${corr[call]}`)
}

export const keyOf = (scene: Scene): Read => readCall(launchTrace(scene), scene.launches[scene.ask].callFromUs)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

function givensOf(scene: Scene): Given[] {
  const calls = scene.launches.map((l, at): Given => ({ label: `launch call ${at + 1}`, value: code(`id ${l.corr}, from ${l.callFromUs} to ${l.callToUs}`) }))
  const streams = [...new Set(scene.launches.map((l) => l.stream))].sort((a, b) => a - b)
  const kernels = streams.flatMap((stream) =>
    scene.launches
      .filter((l) => l.stream === stream)
      .sort((a, b) => a.kernelFromUs - b.kernelFromUs)
      .map((l, at): Given => ({ label: `GPU stream ${stream}, span ${at + 1}`, value: code(`${l.name}, id ${l.corr}, from ${l.kernelFromUs} to ${l.kernelToUs}`) })),
  )
  return [...calls, ...kernels]
}

/*
 * The first step of each solution is the rule alone: no id, no name of a kernel, no time of the scene. At level 1 it is the step a learner
 * is shown before answering, and the questions of a lesson's Test are asked at level 1, so it must not say which kernel or how long.
 */
const WHICH_RULE = rich('A launch call and the kernel it started carry one correlation id. Read the id off the call, then look for the kernel with that id. The order in which kernels start does not pair them: a kernel waits behind the work already queued on its stream, and two streams run side by side.')
const LAG_RULE = rich('A launch call returns before its kernel starts. Pair them by the correlation id, then take the time at which the call ends, which is its start plus its own length, and count from there to the kernel\'s start.')

function whichSteps(scene: Scene): Step[] {
  const l = scene.launches[scene.ask]
  return [
    { text: WHICH_RULE },
    { text: rich('The call that starts at ', us(l.callFromUs), ' has the id ', code(String(l.corr)), '.') },
    { text: rich('The kernel with id ', code(String(l.corr)), ' is ', code(l.name), '.') },
  ]
}

function lagSteps(scene: Scene): Step[] {
  const l = scene.launches[scene.ask]
  return [
    { text: LAG_RULE },
    { text: rich('The call with the id ', code(String(l.corr)), ' starts at ', us(l.callFromUs), ' and returns at ', usDerived(l.callToUs), '; its kernel starts at ', us(l.kernelFromUs), '.') },
    { text: rich('The kernel starts this long after the call returns.'), result: usDerived(l.kernelFromUs - l.callToUs) },
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
    const l = scene.launches[scene.ask]
    return value === l.kernelFromUs - l.callFromUs
      ? { id: `${FAMILY}.from-call-start`, message: rich('That counts from the start of the call. The call runs for a while first, and the wait that matters begins when it returns.') }
      : null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    const trace = launchTrace(scene)
    const other = scene.launches.findIndex((l, at) => at !== scene.ask && readCall(trace, l.callFromUs).lagUs === value)
    return other >= 0 ? { id: `${FAMILY}.other-call`, message: rich('That is the wait of the call that starts at ', us(scene.launches[other].callFromUs), ', not of the one asked about. Pair a call with its kernel by their id.') } : null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function entriesFor(scene: Scene): Entry[] {
  const trace = launchTrace(scene)
  const asked = scene.launches[scene.ask]
  const right = readCall(trace, asked.callFromUs).kernel
  // The kernel that starts soonest after the asked call returns, other than its own: the lure of "the next kernel to start".
  const soonest = scene.launches
    .filter((l, at) => at !== scene.ask && l.kernelFromUs >= asked.callToUs)
    .sort((a, b) => a.kernelFromUs - b.kernelFromUs)[0]
  return scene.launches.map((l): Entry => {
    if (l.name === right) return { text: rich(code(l.name)), right: true, why: rich(code(l.name), ' carries the id ', code(String(asked.corr)), ', the id of the call that starts at ', us(asked.callFromUs), '.') }
    const near = soonest !== undefined && l.name === soonest.name
    return {
      text: rich(code(l.name)),
      why: near
        ? rich(code(l.name), ' starts soon after the call returns, but it carries the id ', code(String(l.corr)), ', which belongs to the call that starts at ', us(l.callFromUs), '. A kernel waits in its stream\'s queue, so the next to start is not always the one this call launched.')
        : rich(code(l.name), ' carries the id ', code(String(l.corr)), ': it was started by the call that starts at ', us(l.callFromUs), ', not by this one.'),
      miss: `${FAMILY}.${near ? 'next-to-start' : 'other-call'}`,
    }
  })
}

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const scene = drawScene(variant, level, seed, 'scene')
  const asked = scene.launches[scene.ask]
  const gen = { id: FAMILY, version: VERSION }
  const base = {
    variant: spec.id,
    level,
    seed,
    kcs: spec.kcs,
    params: { scene: scene.launches.map((l) => `${l.corr}:${l.callFromUs}:${l.callToUs}:${l.name}:${l.stream}:${l.kernelFromUs}:${l.kernelToUs}`).join('|'), ask: scene.ask },
    givens: givensOf(scene),
  }
  const other = (attempt: number): Scene => drawScene(variant, level, seed, `example-${attempt}`)
  if (variant === 'which-kernel') {
    const { options, correct } = placeEntries(FAMILY, variant, level, seed, entriesFor(scene))
    const key = keyOf(scene).kernel
    return finishItem(gen, {
      ...base,
      stem: rich('A step\'s trace holds launch calls on the main thread and kernels on the GPU. Which kernel did the launch call that starts at ', us(asked.callFromUs), ' start?'),
      worked: workedPart(level, whichSteps(scene), (attempt) => {
        const s = other(attempt)
        return keyOf(s).kernel === key && s.launches[s.ask].name === key ? null : whichSteps(s)
      }),
      answer: { kind: 'choice', label: 'the kernel it started', options, correct },
    })
  }
  const key = keyOf(scene).lagUs
  return finishItem(gen, {
    ...base,
    stem: rich('A step\'s trace holds launch calls on the main thread and kernels on the GPU. How many µs after the launch call that starts at ', us(asked.callFromUs), ' returns does its kernel start?'),
    worked: workedPart(level, lagSteps(scene), (attempt) => {
      const s = other(attempt)
      return keyOf(s).lagUs === key ? null : lagSteps(s)
    }),
    answer: { kind: 'numeric', label: 'the time from the call\'s return to the kernel\'s start', unit: 'µs', truth: key, tolerance: EXACT },
  })
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const launchAndKernel: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'A launch call and its kernel',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the call asked about is drawn first, one seed in n.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, DIAGNOSES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    const scene = sceneOfItem(item)
    return item.variant === 'lag' ? lagSteps(scene) : whichSteps(scene)
  },
}
