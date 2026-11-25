/**
 * `tr3.gap-cause`: what made the GPU wait between two kernels (TR3; KC `tr3.gap-cause`). The next kernel was started by a launch call of
 * the main thread, so the gap's lead-in, from the end of the first kernel to the start of that call, is the time the main thread spent
 * before it could launch. The scenes are written as the spans of a `trace@1` with the trace builder, and each key is read from that trace.
 *
 *   which-call    the lead-in and the main thread's spans in it: which one caused the gap? The cause is the span that covers most of the
 *                 lead-in, the rule of `findCause` (`@es/sim/trace`); when two spans cover the same stretch, the nested one, which is the
 *                 shorter, is the cause (level 3: a frame that began during the first kernel, with a call inside it). The options are the
 *                 spans of the lead-in (and, at level 3, one that ended before the gap). The launch call is not one: a lure that is
 *                 never the key would let a blind learner discard it, so the rule says it covers none of the lead-in.
 *   three-parts   the gap cut in three, each part clipped to the gap: the time before the launch call begins, the part of the call that
 *                 falls inside the gap, and the wait from the call's return to the next kernel's start. A part is zero when the call began
 *                 before the first kernel ended (the host's time) or when the kernel starts the moment the call returns (the wait). The timestamps come from the item's seed and zero parts are kept:
 *                 the draw makes each about one seed in ten at most. At level 3 the call is given by its length and not by its return.
 *
 * The names of the spans are the course's model's, not a real engine's trace: no trace of the pinned engine has been opened.
 * Nothing here rests on a document, so no key cites a claim. The gap's word is `GAP_WORD` of src/copy/terms.ts (`CPU_GAP` of kit.ts,
 * held to it by tests/play/items-tr3-test-level.test.ts).
 */
import { between, shuffle } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { CAT_KERNEL, CAT_LAUNCH, CAT_SYNC, findCause, spanCount, spanView, traceBuilder } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, rich } from '../../rich'
import type { Gen, Given, Item, Level, Step, VariantSpec } from '../../types'
import { CPU_GAP, drawOutcomeOf, EXACT, NS, placeEntries, us, usDerived, workedPart } from './kit'
import type { Entry } from './kit'

const FAMILY = 'tr3.gap-cause'
const VERSION = 1
const KC = 'tr3.gap-cause'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'which-call', title: 'The span that caused a gap', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'three-parts', title: 'The three parts of a gap', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'which-call' | 'three-parts'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

const LAUNCH_CALL = 'cudaLaunchKernel'
const SYNCS = ['cudaStreamSynchronize', 'cudaEventSynchronize'] as const
const HOSTS = ['schedule', 'prepare', 'detokenize', 'update_state', 'log_stats'] as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* which-call                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface HostSpan {
  readonly name: string
  /** The CUDA API track holds the blocking calls; the main thread's own track holds the engine's frames. */
  readonly lane: 'cpu' | 'api'
  readonly fromUs: number
  readonly toUs: number
}

export interface CauseScene {
  /** When the first kernel ends: the gap starts. */
  readonly kEndUs: number
  /** The launch call of the next kernel. */
  readonly callFromUs: number
  readonly callToUs: number
  /** When the next kernel starts: the gap ends. */
  readonly kStartUs: number
  /** The main thread's spans that touch the lead-in or the first kernel, in time order. */
  readonly spans: readonly HostSpan[]
}

const splitInto = (rng: Rng, total: number, parts: number): number[] => {
  // `parts` lengths of at least 4 that add up to `total`, none larger than the room left for it.
  const out: number[] = []
  let left = total
  for (let at = 0; at < parts; at += 1) {
    const rest = parts - at - 1
    const piece = rest === 0 ? left : between(rng, 4, left - 4 * rest)
    out.push(piece)
    left -= piece
  }
  return out
}

export function drawCause(level: Level, seed: number, purpose: string): CauseScene {
  const rng = itemRng(FAMILY, 'which-call', level, seed, purpose)
  const kEndUs = between(rng, 40, 160)
  const lead = between(rng, 40, 90)
  const callFromUs = kEndUs + lead
  const callToUs = callFromUs + between(rng, 3, 6)
  const kStartUs = callToUs + between(rng, 1, 5)
  const sync = SYNCS[between(rng, 0, 1)]
  const pool = shuffle(rng, [...SYNCS, ...HOSTS])
  const laneOf = (name: string): 'cpu' | 'api' => ((SYNCS as readonly string[]).includes(name) ? 'api' : 'cpu')
  if (level === 3) {
    // A frame that began during the first kernel, with a call inside it that covers the same lead-in: the nested one is the cause.
    const [outer, inner, decoy] = pool
    const outerFrom = kEndUs - between(rng, 5, 12)
    const innerFrom = kEndUs - between(rng, 0, 3)
    const decoyTo = kEndUs - between(rng, 6, 12)
    return {
      kEndUs,
      callFromUs,
      callToUs,
      kStartUs,
      spans: [
        { name: decoy, lane: laneOf(decoy), fromUs: decoyTo - between(rng, 8, 14), toUs: decoyTo },
        { name: outer, lane: laneOf(outer), fromUs: outerFrom, toUs: callFromUs },
        { name: inner, lane: laneOf(inner), fromUs: innerFrom, toUs: callFromUs },
      ],
    }
  }
  const n = level === 2 ? 4 : 3
  // Level 2 always holds a blocking call among the spans, so the gap may be one that a call drained.
  const names = level === 2 ? shuffle(rng, [sync, ...pool.filter((name) => name !== sync).slice(0, n - 1)]) : pool.slice(0, n)
  // The cause covers more than half of the lead-in, so it is the one span that covers most; which of the names it is, and where it stands
  // in time, are drawn on their own.
  const cause = drawOutcomeOf(FAMILY, 'which-call', level, seed, purpose, n)
  const causeLen = Math.floor(lead * 0.55) + between(rng, 0, Math.floor(lead * 0.15))
  const rest = splitInto(rng, lead - causeLen, n - 1)
  const slot = between(rng, 0, n - 1)
  const others = names.filter((_, at) => at !== cause)
  const spans: HostSpan[] = []
  let from = kEndUs
  let next = 0
  for (let at = 0; at < n; at += 1) {
    const length = at === slot ? causeLen : rest[next]
    const name = at === slot ? names[cause] : others[next++]
    spans.push({ name, lane: laneOf(name), fromUs: from, toUs: from + length })
    from += length
  }
  return { kEndUs, callFromUs, callToUs, kStartUs, spans }
}

/** The scene as a `trace@1`: the first kernel, the main thread's spans, the launch call with a flow to the next kernel, and that kernel. */
export function causeTrace(scene: CauseScene): EsTrace {
  const b = traceBuilder()
  const cpu = b.track('cpu-thread', 'main thread')
  const api = b.track('cuda-api', 'CUDA API')
  const stream = b.track('gpu-stream', 'stream 1')
  b.span(stream, (scene.kEndUs - 30) * NS, 30 * NS, 'attention', CAT_KERNEL)
  for (const span of scene.spans) {
    if (span.lane === 'cpu') b.span(cpu, span.fromUs * NS, (span.toUs - span.fromUs) * NS, span.name, 'cpu')
    else b.span(api, span.fromUs * NS, (span.toUs - span.fromUs) * NS, span.name, CAT_SYNC)
  }
  const call = b.span(api, scene.callFromUs * NS, (scene.callToUs - scene.callFromUs) * NS, LAUNCH_CALL, CAT_LAUNCH, 7)
  const kernel = b.span(stream, scene.kStartUs * NS, 24 * NS, 'down_proj', CAT_KERNEL, 7)
  b.flow(call, kernel, 'launch')
  return b.build({ source: 'synthetic', synthetic: true })
}

/** The name of the span the trace model says caused the gap before the next kernel. */
export function causeOf(scene: CauseScene): string {
  const trace = causeTrace(scene)
  const found = findCause(trace, { fromNs: scene.kEndUs * NS, toNs: scene.kStartUs * NS })
  if (found === null) throw new RangeError(`${FAMILY}: the gap has no cause`)
  return spanView(trace, found.event).name
}

/** The µs of the lead-in that a span covers. */
export const coverUs = (scene: CauseScene, span: HostSpan): number => Math.max(0, Math.min(span.toUs, scene.callFromUs) - Math.max(span.fromUs, scene.kEndUs))

/* ------------------------------------------------------------------------------------------------------------------ */
/* three-parts                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Part = 'host' | 'call' | 'wait'
const PARTS: readonly Part[] = ['host', 'call', 'wait']

export interface PartsScene {
  readonly kEndUs: number
  readonly callFromUs: number
  readonly callToUs: number
  readonly kStartUs: number
  readonly ask: Part
}

export function drawParts(level: Level, seed: number, purpose: string): PartsScene {
  const rng = itemRng(FAMILY, 'three-parts', level, seed, purpose)
  const kEndUs = between(rng, 40, 200)
  const callUs = between(rng, 3, 9)
  // About one seed in five (one in eight at levels 0 and 1) has a call that began before the first kernel ended (no host time), and about one in twelve a kernel that starts
  // the moment the call returns (no wait): zero parts are kept, and neither is common enough to be the answer to guess.
  const early = level >= 2 ? between(rng, 0, 4) === 0 : between(rng, 0, 7) === 0
  const hostUs = early ? 0 : between(rng, 1, 70)
  const head = early ? between(rng, 0, callUs - 1) : 0
  const waitUs = between(rng, 0, 11) === 0 ? 0 : between(rng, 1, 14)
  const callFromUs = kEndUs + hostUs - head
  const callToUs = callFromUs + callUs
  return { kEndUs, callFromUs, callToUs, kStartUs: callToUs + waitUs, ask: PARTS[drawOutcomeOf(FAMILY, 'three-parts', level, seed, purpose, PARTS.length)] }
}

export function partsTrace(scene: PartsScene): EsTrace {
  const b = traceBuilder()
  const api = b.track('cuda-api', 'CUDA API')
  const stream = b.track('gpu-stream', 'stream 1')
  b.span(stream, (scene.kEndUs - 30) * NS, 30 * NS, 'attention', CAT_KERNEL)
  const call = b.span(api, scene.callFromUs * NS, (scene.callToUs - scene.callFromUs) * NS, LAUNCH_CALL, CAT_LAUNCH, 7)
  const kernel = b.span(stream, scene.kStartUs * NS, 24 * NS, 'down_proj', CAT_KERNEL, 7)
  b.flow(call, kernel, 'launch')
  return b.build({ source: 'synthetic', synthetic: true })
}

export interface GapParts {
  readonly gapUs: number
  readonly host: number
  readonly call: number
  readonly wait: number
}

/** The three parts of the gap, read from the trace: the launch call and the kernel it started are paired by their correlation id, and the first kernel is the one that ends first. */
export function readParts(trace: EsTrace): GapParts {
  let call = -1
  let first = -1
  let next = -1
  for (let at = 0; at < spanCount(trace); at += 1) {
    const view = spanView(trace, at)
    if (view.kind === 'cuda-api' && view.cat === CAT_LAUNCH) call = at
    else if (view.kind === 'gpu-stream' && view.cat === CAT_KERNEL && view.corr >= 0) next = at
    else if (view.kind === 'gpu-stream' && view.cat === CAT_KERNEL) first = at
  }
  if (call < 0 || first < 0 || next < 0) throw new RangeError(`${FAMILY}: the trace has no launch call or no pair of kernels`)
  const c = spanView(trace, call)
  const gapFrom = spanView(trace, first).endNs
  const gapTo = spanView(trace, next).startNs
  const ns = (value: number): number => value / NS
  return {
    gapUs: ns(gapTo - gapFrom),
    host: ns(Math.max(0, Math.min(c.startNs, gapTo) - gapFrom)),
    call: ns(Math.max(0, Math.min(c.endNs, gapTo) - Math.max(c.startNs, gapFrom))),
    wait: ns(gapTo - Math.max(c.endNs, gapFrom)),
  }
}

export const partOf = (scene: PartsScene): GapParts => readParts(partsTrace(scene))

export const keyOfParts = (scene: PartsScene): number => partOf(scene)[scene.ask]

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const spanLine = (span: HostSpan): string => `${span.name}, from ${span.fromUs} to ${span.toUs}`

function causeGivens(scene: CauseScene): Given[] {
  const out: Given[] = [{ label: 'first kernel', value: code(`ends at ${scene.kEndUs}`) }]
  for (const lane of ['cpu', 'api'] as const) {
    scene.spans
      .filter((span) => span.lane === lane)
      .sort((a, b) => a.fromUs - b.fromUs)
      .forEach((span, at) => out.push({ label: `${lane === 'cpu' ? 'CPU main thread' : 'CUDA API'}, span ${at + 1}`, value: code(spanLine(span)) }))
  }
  out.push({ label: 'launch call of the next kernel', value: code(`${LAUNCH_CALL}, from ${scene.callFromUs} to ${scene.callToUs}`) })
  out.push({ label: 'next kernel', value: code(`starts at ${scene.kStartUs}`) })
  return out
}

function partsGivens(scene: PartsScene, level: Level): Given[] {
  return [
    { label: 'first kernel', value: code(`ends at ${scene.kEndUs}`) },
    { label: 'launch call', value: code(level === 3 ? `starts at ${scene.callFromUs}, lasts ${scene.callToUs - scene.callFromUs}` : `from ${scene.callFromUs} to ${scene.callToUs}`) },
    { label: 'next kernel', value: code(`starts at ${scene.kStartUs}`) },
  ]
}

const PART_WORDS: Readonly<Record<Part, string>> = {
  host: 'the time before the launch call begins',
  call: 'the part of the launch call that falls inside the gap',
  wait: "the wait from the launch call's return to the next kernel's start",
}

const ASK_LABEL: Readonly<Record<Part, string>> = {
  host: 'the time before the launch call',
  call: 'the part of the launch call inside the gap',
  wait: 'the wait after the call returns',
}

const causeStem = rich(`The first kernel ends, and the GPU then waits while the main thread is busy: the stretch is a ${CPU_GAP}. The lead-in of the gap runs from the end of the first kernel to the start of the launch call of the next one. Which span of the main thread caused the gap?`)

const partsStem = (scene: PartsScene): Item['stem'] =>
  rich(
    'The gap between two kernels has up to three parts, each clipped to the gap: ',
    PART_WORDS.host,
    ', ',
    PART_WORDS.call,
    ', and ',
    PART_WORDS.wait,
    '. A part is zero when its time falls outside the gap. How many µs of the gap are ',
    PART_WORDS[scene.ask],
    '?',
  )

/*
 * The first step of each solution is the rule alone: no figure and no name of a span. At level 1 it is the step a learner is shown before
 * answering, and the questions of a lesson's Test are asked at level 1, so it must not say which span or how many µs.
 */
const CAUSE_RULE = rich(
  "The lead-in of a gap runs from the end of the first kernel to the start of the next kernel's launch call. The cause is the span of the main thread that covers most of the lead-in. When two spans cover the same stretch, one nested in the other, the shorter one is the cause, because the other is only the frame around it. The launch call ends the lead-in and covers none of it, so it is never the cause.",
)
const PARTS_RULE = rich(
  'Cut the gap at the launch call. What comes before the call begins is the host time; the stretch the call covers inside the gap is the call part; what is left from its return until the next kernel starts is the wait. A call that began before the first kernel ended has no host time, and only its length after the first kernel ended counts.',
)

function causeSteps(scene: CauseScene): Step[] {
  const key = causeOf(scene)
  const lead = scene.callFromUs - scene.kEndUs
  const covers = scene.spans.map((span) => rich(code(span.name), ' covers ', usDerived(coverUs(scene, span)), '.'))
  return [
    { text: CAUSE_RULE },
    { text: rich('The lead-in runs from ', us(scene.kEndUs), ' to ', us(scene.callFromUs), ', ', usDerived(lead), ' long.') },
    { text: rich(...covers.flatMap((sentence, at) => (at === 0 ? [...sentence] : [' ', ...sentence])), ' The cause is ', code(key), '.') },
  ]
}

function partsSteps(scene: PartsScene): Step[] {
  const parts = partOf(scene)
  return [
    { text: PARTS_RULE },
    { text: rich('The gap runs from ', us(scene.kEndUs), ' to ', us(scene.kStartUs), '.'), result: usDerived(parts.gapUs) },
    { text: rich('The call runs from ', us(scene.callFromUs), ' to ', usDerived(scene.callToUs), ', so ', PART_WORDS[scene.ask], ' is this long.'), result: usDerived(parts[scene.ask]) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Diagnoses                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function partsOfItem(item: Pick<Item, 'variant' | 'level' | 'seed'>): PartsScene {
  if (item.variant !== 'three-parts') throw new RangeError(`${FAMILY}/${item.variant} has no parts`)
  return drawParts(item.level, item.seed, 'scene')
}

const DIAGNOSES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = partsOfItem(item)
    const parts = partOf(scene)
    return value === parts.gapUs && parts.gapUs !== keyOfParts(scene) ? { id: `${FAMILY}.whole-gap`, message: rich('That is the whole gap. The question asks for one of its three parts.') } : null
  },
  (item, value) => {
    const scene = partsOfItem(item)
    const parts = partOf(scene)
    const key = keyOfParts(scene)
    const other = PARTS.find((part) => part !== scene.ask && parts[part] === value && value !== key)
    return other === undefined ? null : { id: `${FAMILY}.other-part`, message: rich('That is a different part of the gap: ', PART_WORDS[other], '. Read which part the question asks for.') }
  },
  (item, value) => {
    const scene = partsOfItem(item)
    return scene.ask === 'call' && value === scene.callToUs - scene.callFromUs && value !== keyOfParts(scene)
      ? { id: `${FAMILY}.unclipped-call`, message: rich('That is the whole length of the call. Part of it ran while the first kernel was still running, and only what falls inside the gap counts.') }
      : null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function causeEntries(scene: CauseScene): Entry[] {
  const key = causeOf(scene)
  const lead = scene.callFromUs - scene.kEndUs
  const keySpan = scene.spans.find((span) => span.name === key)
  const entries = scene.spans.map((span): Entry => {
    const covered = coverUs(scene, span)
    if (span.name === key) {
      return { text: rich(code(span.name)), right: true, why: rich(code(span.name), ' covers ', usDerived(covered), ' of the ', usDerived(lead), ' lead-in, more than any other span, and the shorter where two cover the same stretch.') }
    }
    if (covered === 0) {
      return { text: rich(code(span.name)), miss: `${FAMILY}.before-the-gap`, why: rich(code(span.name), ' ended before the first kernel did, so it covers none of the lead-in and the GPU was busy while it ran.') }
    }
    if (keySpan !== undefined && covered === coverUs(scene, keySpan)) {
      return { text: rich(code(span.name)), miss: `${FAMILY}.outer-frame`, why: rich(code(span.name), ' covers the same stretch, but the call inside it is the shorter span: ', code(span.name), ' is only the frame around it, so the call inside is the cause.') }
    }
    return { text: rich(code(span.name)), miss: `${FAMILY}.covers-less`, why: rich(code(span.name), ' covers only ', usDerived(covered), ' of the ', usDerived(lead), ' lead-in. Another span covers more, so the main thread spent most of its wait in that one.') }
  })
  return entries
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const gen = { id: FAMILY, version: VERSION }
  if (variant === 'which-call') {
    const scene = drawCause(level, seed, 'scene')
    const key = causeOf(scene)
    const { options, correct } = placeEntries(FAMILY, variant, level, seed, causeEntries(scene))
    return finishItem(gen, {
      variant,
      level,
      seed,
      kcs: spec.kcs,
      params: { scene: `${scene.kEndUs}|${scene.callFromUs}|${scene.callToUs}|${scene.kStartUs}|${scene.spans.map((s) => `${s.name}:${s.lane}:${s.fromUs}:${s.toUs}`).join(';')}` },
      givens: causeGivens(scene),
      stem: causeStem,
      worked: workedPart(level, causeSteps(scene), (attempt) => {
        const s = drawCause(level, seed, `example-${attempt}`)
        return causeOf(s) === key ? null : causeSteps(s)
      }),
      answer: { kind: 'choice', label: 'the span that caused the gap', options, correct },
    })
  }
  const scene = drawParts(level, seed, 'scene')
  const key = keyOfParts(scene)
  return finishItem(gen, {
    variant,
    level,
    seed,
    kcs: spec.kcs,
    params: { scene: `${scene.kEndUs}|${scene.callFromUs}|${scene.callToUs}|${scene.kStartUs}`, ask: scene.ask },
    givens: partsGivens(scene, level),
    stem: partsStem(scene),
    worked: workedPart(level, partsSteps(scene), (attempt) => {
      const s = drawParts(level, seed, `example-${attempt}`)
      return keyOfParts(s) === key && s.ask === scene.ask ? null : partsSteps(s)
    }),
    answer: { kind: 'numeric', label: ASK_LABEL[scene.ask], unit: 'µs', truth: key, tolerance: EXACT },
  })
}

export const gapCause: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'What caused a gap between two kernels',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the cause's place, or the part asked about, is drawn first.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, DIAGNOSES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    return item.variant === 'which-call' ? causeSteps(drawCause(item.level, item.seed, 'scene')) : partsSteps(drawParts(item.level, item.seed, 'scene'))
  },
}
