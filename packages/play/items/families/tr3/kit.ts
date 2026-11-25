/**
 * What TR3's item families share (W2b-T105): the tolerances and draws the other modules' families already use, the way a time in whole
 * microseconds is printed, and the small synthetic traces the keys are read from. Each family keeps its own world, its own words and its
 * own band in its own file.
 *
 * Every key of these families is read from a `trace@1` that `@es/sim/trace` holds: the scene is written with the trace builder, and the
 * key is what `attribute`, `stepWindows` or the trace's own columns say of it, never a sum written beside the scene. The scenes are the
 * course's own, drawn in whole microseconds and tagged synthetic; no number of a real engine is in them.
 *
 * Like the rest of packages/play it is pure (D-017): no DOM, no clock, no entropy.
 */
import { below, between, shuffle } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { attribute, traceBuilder } from '@es/sim/trace'
import type { Attribution, AttributionCategory, EsTrace } from '@es/sim/trace'
import { itemRng } from '../../draw'
import { drawOutcome } from '../tr6/kit'
import { num } from '../../rich'
import type { ChoiceOption, Level, NumPart, Rich } from '../../types'

export { EXACT, drawOutcome, oneOf, workedPart } from '../tr6/kit'
export { derived } from '../tr2/kit'

/** Nanoseconds in a microsecond: the scenes are drawn in whole µs, and the trace model counts in ns. */
export const NS = 1000

/** A time of a scene, in µs. */
export const us = (value: number): NumPart => num(value, { unit: 'µs', tag: 'synthetic' })

/** A time worked out from a scene's, in µs. */
export const usDerived = (value: number): NumPart => num(value, { unit: 'µs', tag: 'derived' })

/** A count of a scene, with its noun, so that a ticket never reads "1 steps". */
export const count = (value: number, one: string, many: string): NumPart => num(value, { unit: value === 1 ? one : many, tag: 'synthetic' })

/* ------------------------------------------------------------------------------------------------------------------ */
/* Choices                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One option as a family writes it, before the seed places it: its words, why it is right or wrong, and the misconception a lure encodes. */
export interface Entry {
  readonly text: Rich
  readonly why: Rich
  /** Set on a lure: `<family>.<slug>`. The right entry has none. */
  readonly miss?: string
  readonly right?: true
}

/**
 * The options of a choice, in the order this seed shows them. Their ids are their places (`opt-1`, `opt-2`, ...), so that "always the
 * same id" is "always the same place", and the right entry is at each place one time in `entries.length`: the entries are shuffled by
 * the seed's own stream, and a draw that picks which place is right is a draw of the shuffle itself.
 */
export function placeEntries(family: string, variant: string, level: Level, seed: number, entries: readonly Entry[]): { options: ChoiceOption[]; correct: string } {
  const order = shuffle(itemRng(family, variant, level, seed, 'options'), entries)
  let correct = ''
  const options = order.map((entry, at): ChoiceOption => {
    const id = `opt-${at + 1}`
    if (entry.right === true) correct = id
    return { id, text: entry.text, why: entry.why, ...(entry.miss === undefined ? {} : { miss: entry.miss }) }
  })
  if (correct === '') throw new RangeError(`${family}/${variant}: no entry is right`)
  return { options, correct }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A window of a step, as spans                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What a line of the ticket says: which lane, which kind of span, and where it runs. */
export interface SceneSpan {
  readonly lane: 'gpu' | 'cpu'
  /** The GPU stream, from 1. The CPU has one main thread: 1. */
  readonly stream: number
  readonly kind: 'kernel' | 'copy' | 'busy'
  readonly fromUs: number
  readonly toUs: number
}

export interface Phase {
  readonly category: AttributionCategory
  readonly fromUs: number
  readonly toUs: number
}

/** A window the learner reads as spans, and the phases it was drawn from. The key is never read from the phases: the trace's own `attribute` gives it. */
export interface WindowScene {
  readonly toUs: number
  readonly phases: readonly Phase[]
  readonly spans: readonly SceneSpan[]
}

export const CATEGORIES: readonly AttributionCategory[] = ['kernel', 'copy', 'cpu-gap', 'both-idle']

export interface WindowShape {
  /** Stretches in the window, each of one category and not the same as its neighbour. */
  readonly phases: number
  /** A kernel may run on two streams that overlap, so that the GPU is busy through their union. */
  readonly twoStreams: boolean
  /** The CPU's busy time may run on into GPU-busy time (hidden CPU work), the decoy of "all the CPU's busy time". */
  readonly hidden: boolean
  /** A category the window must hold at least once, so that a question about it has an answer. */
  readonly required: AttributionCategory
}

/** The categories of the stretches, each unlike its neighbour, with `required` among them. */
function sequence(rng: Rng, n: number, required: AttributionCategory): AttributionCategory[] {
  const out: AttributionCategory[] = []
  for (let at = 0; at < n; at += 1) {
    const choices = CATEGORIES.filter((category) => category !== out[at - 1])
    out.push(choices[below(rng, choices.length)])
  }
  if (!out.includes(required)) {
    // Put it where neither neighbour is the same, trying places from a drawn start.
    const start = below(rng, n)
    for (let step = 0; step < n; step += 1) {
      const at = (start + step) % n
      if (out[at - 1] !== required && out[at + 1] !== required) {
        out[at] = required
        break
      }
    }
  }
  return out
}

export function drawWindow(rng: Rng, shape: WindowShape): WindowScene {
  const categories = sequence(rng, shape.phases, shape.required)
  const phases: Phase[] = []
  let at = 0
  for (const category of categories) {
    const length = between(rng, 12, 48)
    phases.push({ category, fromUs: at, toUs: at + length })
    at += length
  }
  const spans: SceneSpan[] = []
  phases.forEach((phase, place) => {
    const length = phase.toUs - phase.fromUs
    if (phase.category === 'kernel') {
      if (shape.twoStreams && below(rng, 2) === 0) {
        const third = Math.floor(length / 3)
        spans.push({ lane: 'gpu', stream: 1, kind: 'kernel', fromUs: phase.fromUs, toUs: phase.toUs - third })
        spans.push({ lane: 'gpu', stream: 2, kind: 'kernel', fromUs: phase.fromUs + third, toUs: phase.toUs })
      } else spans.push({ lane: 'gpu', stream: 1, kind: 'kernel', fromUs: phase.fromUs, toUs: phase.toUs })
      if (shape.hidden && below(rng, 2) === 0) {
        const from = phase.fromUs + between(rng, 2, Math.floor(length / 2))
        spans.push({ lane: 'cpu', stream: 1, kind: 'busy', fromUs: from, toUs: between(rng, from + 3, phase.toUs - 1) })
      }
    } else if (phase.category === 'copy') {
      spans.push({ lane: 'gpu', stream: shape.twoStreams && below(rng, 2) === 0 ? 2 : 1, kind: 'copy', fromUs: phase.fromUs, toUs: phase.toUs })
    } else if (phase.category === 'cpu-gap') {
      // The main thread's work may begin while the GPU is still busy with the step before: hidden work that only the gap after it counts.
      const before = phases[place - 1]
      const reach = shape.hidden && before !== undefined && (before.category === 'kernel' || before.category === 'copy') && below(rng, 2) === 0 ? between(rng, 2, Math.floor((before.toUs - before.fromUs) / 2)) : 0
      spans.push({ lane: 'cpu', stream: 1, kind: 'busy', fromUs: phase.fromUs - reach, toUs: phase.toUs })
    }
  })
  return { toUs: at, phases, spans }
}

/** The scene as a `trace@1`: the CPU's main thread, one track for each GPU stream, and a step mark at each end of the window. */
export function windowTrace(scene: WindowScene): EsTrace {
  const b = traceBuilder()
  const cpu = b.track('cpu-thread', 'main thread')
  const streams = new Map<number, number>()
  for (const span of scene.spans) {
    if (span.lane === 'gpu' && !streams.has(span.stream)) streams.set(span.stream, b.track('gpu-stream', `stream ${span.stream}`))
  }
  for (const span of scene.spans) {
    const track = span.lane === 'cpu' ? cpu : (streams.get(span.stream) ?? 0)
    const cat = span.kind === 'busy' ? 'cpu' : span.kind
    b.span(track, span.fromUs * NS, (span.toUs - span.fromUs) * NS, span.kind, cat)
  }
  b.mark(0, 'step')
  b.mark(scene.toUs * NS, 'step')
  return b.build({ source: 'synthetic', synthetic: true })
}

/** What the trace model says of `[fromUs, toUs)` of the scene. */
export function attributeUs(trace: EsTrace, fromUs: number, toUs: number): Attribution {
  return attribute(trace, { fromNs: fromUs * NS, toNs: toUs * NS })
}

/** The ns of an attribution in one category, in whole µs (every scene is drawn in whole µs, so it divides exactly). */
export function categoryUs(a: Attribution, category: AttributionCategory): number {
  const ns = category === 'kernel' ? a.kernelNs : category === 'copy' ? a.copyOnlyNs : category === 'cpu-gap' ? a.cpuGapNs : a.bothIdleNs
  return ns / NS
}

/** The lines of a ticket for a window: the GPU's spans by stream, then the main thread's, each `kernel, 20 to 70`. */
export function spanLines(scene: WindowScene): { label: string; line: string }[] {
  const order = [...scene.spans].sort((a, b) => (a.lane === b.lane ? a.stream - b.stream || a.fromUs - b.fromUs : a.lane === 'gpu' ? -1 : 1))
  const seen = new Map<string, number>()
  return order.map((span) => {
    const lane = span.lane === 'gpu' ? `GPU stream ${span.stream}` : 'CPU main thread'
    const at = (seen.get(lane) ?? 0) + 1
    seen.set(lane, at)
    return { label: `${lane}, span ${at}`, line: `${span.kind}, ${span.fromUs} to ${span.toUs}` }
  })
}

/**
 * The word of TR3's one written form for the stretch in which the GPU idles while the CPU prepares the next step. It is `GAP_WORD` of
 * src/copy/terms.ts, which packages/play may not import: tests/play/items-tr3-test-level.test.ts holds the two equal, so a stem reads the
 * word of the form and an answer of the owner's to N2 changes one key and this line.
 */
export const CPU_GAP = 'CPU gap'

/**
 * Which of `n` outcomes a scene is about, drawn answer first. The scene of the item itself (`purpose` "scene") uses the item's own stream,
 * so that each outcome is the key one seed in `n`; the scenes of a level-0 worked example (`example-0`, `example-1`, ...) each have a
 * stream of their own, so that trying another example can reach another outcome, and the worked example is never the item's own answer.
 */
export function drawOutcomeOf(family: string, variant: string, level: Level, seed: number, purpose: string, n: number): number {
  return purpose === 'scene' ? drawOutcome(family, variant, level, seed, n) : below(itemRng(family, variant, level, seed, `outcome-${purpose}`), n)
}
