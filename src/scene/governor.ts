/*
 * The governor (ARCHITECTURE §6.6): adaptive quality with hysteresis. It is fed frame times only while a scene animates,
 * so an idle scene, whose `demand` loop draws nothing, never looks slow. Every threshold here is [estimated], from A§6.6.
 *
 *   down  a tier when the p95 over the last 2 s of animation exceeds the tier's budget × 1.2;
 *   up    a tier when the p95 stays under the budget × 0.6 for 10 s of animation;
 *         at most one change per 5 s, never above the learner's cap, never below T1, never above T3;
 *   2D    from T1, an offer of the 2D view when the p95 stays above 50 ms for 5 s. The view switches only when the learner
 *         accepts it, and only at the next pause (Stage), never by itself.
 *
 * A frame time is the interval between two frames of one animation, as the learner sees it. Plain code over the numbers it
 * is given, so a test drives it with any clock.
 */
import { TIERS, type Tier } from './tiers'

export const GOVERNOR = {
  windowMs: 2000,
  /** A window this short in frames is a hitch, not a trend: a single long frame after a stall decides nothing. */
  minFrames: 8,
  downAbove: 1.2,
  upBelow: 0.6,
  upAfterMs: 10_000,
  minGapMs: 5000,
  offer2dAboveMs: 50,
  offer2dAfterMs: 5000,
} as const

export type GovernorEvent = { kind: 'tier'; from: Tier; to: Tier; p95: number } | { kind: 'offer-2d'; p95: number }

export interface GovernorState {
  readonly tier: Tier
  readonly cap: Tier
  /** The p95 of the window in ms, or null until the window holds 2 s of frames. */
  readonly p95: number | null
  readonly offered2d: boolean
}

export interface Governor {
  /** One frame of an animation: how long it took, and when it ended (ms on any monotonic clock). */
  sample(frameMs: number, atMs: number): GovernorEvent | null
  /** The animation stopped: the next frames start a new window, and an idle gap never counts as a frame. */
  pause(): void
  /** The learner's cap moved (Settings): above it, the tier drops at once. */
  setCap(cap: Tier, atMs: number): GovernorEvent | null
  readonly state: GovernorState
}

/** The 95th percentile of the values, by the nearest-rank method. */
export function p95Of(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]
}

export function createGovernor(start: Tier, cap: Tier = 3): Governor {
  let tier: Tier = start === 0 ? 0 : (Math.min(start, cap, 3) as Tier)
  let currentCap = cap
  let window: number[] = []
  let windowMs = 0
  let calmMs = 0
  let slowMs = 0
  let offered = false
  let lastChangeAt = Number.NEGATIVE_INFINITY

  const reset = () => {
    window = []
    windowMs = 0
    calmMs = 0
    slowMs = 0
  }
  const change = (to: Tier, atMs: number, p95: number): GovernorEvent => {
    const from = tier
    tier = to
    lastChangeAt = atMs
    reset()
    return { kind: 'tier', from, to, p95 }
  }

  return {
    sample(frameMs, atMs) {
      if (tier === 0 || !Number.isFinite(frameMs) || frameMs <= 0) return null
      window.push(frameMs)
      windowMs += frameMs
      while (window.length > 1 && windowMs - window[0] >= GOVERNOR.windowMs) windowMs -= window.shift() as number
      if (windowMs < GOVERNOR.windowMs || window.length < GOVERNOR.minFrames) return null
      const p95 = p95Of(window) as number
      const budget = TIERS[tier].frameBudgetMs
      calmMs = p95 < budget * GOVERNOR.upBelow ? calmMs + frameMs : 0
      slowMs = p95 > GOVERNOR.offer2dAboveMs ? slowMs + frameMs : 0
      const settled = atMs - lastChangeAt >= GOVERNOR.minGapMs
      if (settled && tier > 1 && p95 > budget * GOVERNOR.downAbove) return change((tier - 1) as Tier, atMs, p95)
      if (settled && tier < 3 && tier < currentCap && calmMs >= GOVERNOR.upAfterMs) return change((tier + 1) as Tier, atMs, p95)
      if (tier === 1 && !offered && slowMs >= GOVERNOR.offer2dAfterMs) {
        offered = true
        return { kind: 'offer-2d', p95 }
      }
      return null
    },
    pause: reset,
    setCap(cap, atMs) {
      currentCap = cap
      if (tier > cap && cap >= 1) return change(cap, atMs, p95Of(window) ?? 0)
      return null
    },
    get state() {
      const full = windowMs >= GOVERNOR.windowMs && window.length >= GOVERNOR.minFrames
      return { tier, cap: currentCap, p95: full ? p95Of(window) : null, offered2d: offered }
    },
  }
}
