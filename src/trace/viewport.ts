/*
 * The window the tape shows (GAMES.md §6 "Controls": zoom with `+` and `−`, pan with the arrow keys), as arithmetic on integer ns.
 *
 * The window is [fromNs, toNs) of the trace's clock. Zoom halves or doubles its length about an anchor and keeps the anchor where
 * it was on the paper; pan moves it by a share of its length. Every result is a whole number of ns, at least `MIN_WINDOW_NS` long
 * and at most the whole tape with a margin, and it stays on the tape: the margin is where the paper runs out. The ruler's ticks come
 * from the same window, so the holes along the tape's edge move with the paper.
 */
import { niceStep } from '@/scene/time-axis'
import type { Win } from './model'

/** The shortest window: a few hundred ns across the paper, where one ns is more than a pixel. */
export const MIN_WINDOW_NS = 256

/** How much of the window one pan key moves it. */
export const PAN_SHARE = 0.25

/** The paper that runs past either end of the trace: a twentieth of it, and at least a µs. */
export function marginNs(extent: Win): number {
  return Math.max(1_000, Math.round((extent.toNs - extent.fromNs) * 0.05))
}

/** The widest the window may be: the whole tape and its margins. */
export function maxWindowNs(extent: Win): number {
  return extent.toNs - extent.fromNs + 2 * marginNs(extent)
}

/** Keeps a window a legal size and on the tape. */
export function clampWindow(win: Win, extent: Win): Win {
  const margin = marginNs(extent)
  const widest = maxWindowNs(extent)
  const length = Math.min(widest, Math.max(MIN_WINDOW_NS, Math.round(win.toNs - win.fromNs)))
  const lowest = extent.fromNs - margin
  const highest = extent.toNs + margin - length
  const fromNs = Math.round(Math.min(Math.max(win.fromNs, lowest), Math.max(lowest, highest)))
  return { fromNs, toNs: fromNs + length }
}

/** Zooms by `factor` (2 shows twice as much, 1/2 half as much) about `anchorNs`, which keeps its place on the paper. */
export function zoomWindow(win: Win, factor: number, anchorNs: number, extent: Win): Win {
  const length = win.toNs - win.fromNs
  const next = Math.min(maxWindowNs(extent), Math.max(MIN_WINDOW_NS, Math.round(length * factor)))
  const share = length > 0 ? Math.min(1, Math.max(0, (anchorNs - win.fromNs) / length)) : 0.5
  const fromNs = Math.round(anchorNs - share * next)
  return clampWindow({ fromNs, toNs: fromNs + next }, extent)
}

/** Moves the window by `deltaNs`. */
export function panWindow(win: Win, deltaNs: number, extent: Win): Win {
  return clampWindow({ fromNs: win.fromNs + Math.round(deltaNs), toNs: win.toNs + Math.round(deltaNs) }, extent)
}

/** A window that shows `target` with a margin of a twentieth of it on each side: what "this step" and "the whole tape" fit to. */
export function fitWindow(target: Win, extent: Win): Win {
  const length = Math.max(1, target.toNs - target.fromNs)
  const pad = Math.round(length * 0.04)
  return clampWindow({ fromNs: target.fromNs - pad, toNs: target.toNs + pad }, extent)
}

/** The window moved the least that shows `ns` with `edgeShare` of the window's length to spare at either side (the cursor walked off the paper). */
export function revealNs(win: Win, ns: number, extent: Win, edgeShare = 0.1): Win {
  const length = win.toNs - win.fromNs
  const spare = Math.round(length * edgeShare)
  if (ns >= win.fromNs + spare && ns <= win.toNs - spare) return win
  const fromNs = ns < win.fromNs + spare ? ns - spare : ns + spare - length
  return clampWindow({ fromNs, toNs: fromNs + length }, extent)
}

/** The same two windows. */
export const sameWindow = (a: Win, b: Win): boolean => a.fromNs === b.fromNs && a.toNs === b.toNs

// ---------------------------------------------------------------------------------------------------------------------------
// The ruler

export interface RulerTick {
  readonly ns: number
  /** A major tick has a number printed beside it, and a larger hole. */
  readonly major: boolean
}

export interface RulerFormat {
  /** ns per unit. */
  readonly divisor: number
  readonly unit: 'ms' | 'µs' | 'ns'
  /** Digits after the point: as many as the step between numbered ticks needs. */
  readonly decimals: number
}

export interface Ruler {
  /** The distance between numbered ticks, in ns. */
  readonly majorNs: number
  readonly minorNs: number
  readonly ticks: readonly RulerTick[]
  readonly format: RulerFormat
}

const UNITS: readonly (readonly [divisor: number, unit: RulerFormat['unit']])[] = [
  [1_000_000, 'ms'],
  [1_000, 'µs'],
  [1, 'ns'],
]

/**
 * The unit every number of one ruler is printed in: the largest unit that the window's times reach, so a window at 15 ms reads in
 * ms, and one that needs no more than three decimals in it. Zoomed in until a step is a few ns, ms would need six digits after the
 * point, so the ruler drops to µs, and then to ns.
 */
export function rulerFormat(win: Win, majorNs: number): RulerFormat {
  const top = Math.max(Math.abs(win.fromNs), Math.abs(win.toNs))
  let zeros = 0
  for (let step = majorNs; step > 0 && step % 10 === 0; step /= 10) zeros++
  for (const [divisor, unit] of UNITS) {
    const decimals = Math.max(0, Math.round(Math.log10(divisor)) - zeros)
    if (top >= divisor && decimals <= 3) return { divisor, unit, decimals }
  }
  return { divisor: 1, unit: 'ns', decimals: 0 }
}

/** The ruler of a window across `widthPx`, with a numbered tick about every `majorPx` (at least). */
export function ruler(win: Win, widthPx: number, majorPx = 96): Ruler {
  const length = win.toNs - win.fromNs
  const majorNs = niceStep(length, Math.max(1, widthPx / majorPx))
  // 1 and 5 split in five and 2 in four, so a minor tick is a round number as well.
  const lead = majorNs / 10 ** Math.floor(Math.log10(majorNs))
  const minorNs = Math.max(1, Math.round(majorNs / (lead === 2 ? 4 : 5)))
  const ticks: RulerTick[] = []
  for (let ns = Math.ceil(win.fromNs / minorNs) * minorNs; ns <= win.toNs && ticks.length < 400; ns += minorNs) {
    ticks.push({ ns, major: ns % majorNs === 0 })
  }
  return { majorNs, minorNs, ticks, format: rulerFormat(win, majorNs) }
}

/** A tick's number in the ruler's unit, with the printer's grouping and as many decimals as the step needs: 15.5 ms, 1,234 µs. */
export function rulerLabel(ns: number, format: RulerFormat): string {
  const digits = Math.round(Math.log10(format.divisor))
  const magnitude = Math.abs(ns)
  const whole = Math.trunc(magnitude / format.divisor)
  const fraction = String(magnitude - whole * format.divisor).padStart(digits, '0').slice(0, format.decimals)
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${ns < 0 ? '−' : ''}${grouped}${format.decimals > 0 ? `.${fraction}` : ''} ${format.unit}`
}
