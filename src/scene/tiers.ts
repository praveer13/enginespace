/*
 * Device tiers (ARCHITECTURE §6.6, D-022): what a device may draw, chosen from local hints only. No detect-gpu: it fetches
 * benchmark data from a CDN, which breaks I1. Every value in the table is [estimated], starting from games-3d.md's proposals.
 *
 *   T0  2D only: no WebGL2, software rendering (a major performance caveat), the learner chose 2D, or two lost contexts.
 *   T1  a phone or a small machine: a coarse pointer, at most 4 GB or 4 cores, or textures below 8192 px.
 *   T2  everything else.
 *   T3  never a starting tier: only the governor reaches it.
 *
 * The anti-aliasing column departs from A§6.6 at T3, which names SMAA: three's SMAAPass alone is 35,631 bytes gzipped
 * [measured 2026-11-04, three 0.185.1, `gzip -9`], over the 25 KB the `postfx` chunk may weigh (A§11.1). T3 uses the same
 * FXAA as T2, folded into the final pass, until that budget is revisited.
 *
 * This file imports nothing from three, so a page can ask for the tier before the 3D chunks load.
 */
import { useSyncExternalStore } from 'react'
import { limitsFor } from '@/settings/rules'
import { useSettings } from '@/settings/useSettings'

export type Tier = 0 | 1 | 2 | 3
export const TIER_IDS: readonly Tier[] = [0, 1, 2, 3]

export interface TierLimits {
  readonly view: '2d' | '3d'
  /** The highest device pixel ratio the canvas renders at. */
  readonly dprCap: number
  readonly antialias: 'none' | 'fxaa'
  /** Full-screen effect passes beyond the scene render and the final output pass (A§6.5). */
  readonly postPasses: number
  /** Instances one scene may draw. A layout aggregates above it (GAMES.md §2.3, "Adaptive quality"). */
  readonly maxInstances: number
  /** The most frames per second the scene renders while it animates. */
  readonly fpsCap: number
  /** The frame time the governor holds the tier to, in ms: 1,000 ÷ the cap [derived]. */
  readonly frameBudgetMs: number
  /** Shadow-casting lights the tier allows (A§6.6: off at T1 and T2, at most one at T3). */
  readonly shadowLights: number
}

/** A§6.6's table, every value [estimated]. */
export const TIERS: Readonly<Record<Tier, TierLimits>> = {
  0: { view: '2d', dprCap: 1, antialias: 'none', postPasses: 0, maxInstances: 0, fpsCap: 0, frameBudgetMs: 0, shadowLights: 0 },
  1: { view: '3d', dprCap: 1, antialias: 'none', postPasses: 0, maxInstances: 10_000, fpsCap: 30, frameBudgetMs: 1000 / 30, shadowLights: 0 },
  2: { view: '3d', dprCap: 1.5, antialias: 'fxaa', postPasses: 1, maxInstances: 30_000, fpsCap: 60, frameBudgetMs: 1000 / 60, shadowLights: 0 },
  3: { view: '3d', dprCap: 2, antialias: 'fxaa', postPasses: 2, maxInstances: 50_000, fpsCap: 60, frameBudgetMs: 1000 / 60, shadowLights: 1 },
}

/** What the device says about itself. Each field is read once, from the browser, by `probeDevice`. */
export interface DeviceHints {
  readonly webgl2: boolean
  /** A WebGL2 context exists only without `failIfMajorPerformanceCaveat`: the browser is rendering in software. */
  readonly majorPerformanceCaveat: boolean
  readonly coarsePointer: boolean
  /** `navigator.deviceMemory` in GB, where the browser reports it. */
  readonly deviceMemory: number | null
  readonly hardwareConcurrency: number | null
  readonly maxTextureSize: number | null
  /** `navigator.connection.saveData`: the 3D is not loaded on its own, only when asked for (A§6.6). */
  readonly saveData: boolean
}

/** What the learner and the session decided. */
export interface TierChoice {
  /** Settings: "3D off" (W0-T22). */
  readonly prefer2d: boolean
  /** Settings: the tier cap. The governor never goes above it. */
  readonly cap: Tier
  /** Contexts lost in this session: after the second, the session stays 2D (A§6.7). */
  readonly lostContexts: number
}

export type TierReason = 'no-webgl2' | 'software' | 'chosen-2d' | 'lost-twice' | 'small-device' | 'capped' | 'default' | 'forced'

export interface TierDecision {
  readonly tier: Tier
  readonly reason: TierReason
}

/** A§6.6's T1 thresholds [estimated]. */
export const SMALL_DEVICE = { deviceMemoryGb: 4, cores: 4, textureSize: 8192 } as const

export const DEFAULT_CHOICE: TierChoice = { prefer2d: false, cap: 3, lostContexts: 0 }

/** The tier a session starts at. T3 is never one: the governor alone reaches it. */
export function startingTier(hints: DeviceHints, choice: TierChoice = DEFAULT_CHOICE): TierDecision {
  if (!hints.webgl2) return { tier: 0, reason: 'no-webgl2' }
  if (hints.majorPerformanceCaveat) return { tier: 0, reason: 'software' }
  if (choice.prefer2d) return { tier: 0, reason: 'chosen-2d' }
  if (choice.lostContexts >= 2) return { tier: 0, reason: 'lost-twice' }
  if (choice.cap === 0) return { tier: 0, reason: 'capped' }
  const small =
    hints.coarsePointer ||
    (hints.deviceMemory !== null && hints.deviceMemory <= SMALL_DEVICE.deviceMemoryGb) ||
    (hints.hardwareConcurrency !== null && hints.hardwareConcurrency <= SMALL_DEVICE.cores) ||
    (hints.maxTextureSize !== null && hints.maxTextureSize < SMALL_DEVICE.textureSize)
  const tier: Tier = small ? 1 : 2
  if (choice.cap < tier) return { tier: choice.cap, reason: 'capped' }
  return { tier, reason: small ? 'small-device' : 'default' }
}

/** Why there is no 3D view, in the words the 2D/3D switch prints beside its disabled button. */
export function unavailableReason(reason: TierReason): string | undefined {
  switch (reason) {
    case 'no-webgl2':
      return 'This browser has no WebGL2'
    case 'software':
      return 'This browser draws 3D in software'
    case 'chosen-2d':
      return '3D is off in Settings'
    case 'lost-twice':
      return 'The 3D view stopped twice in this session'
    case 'capped':
      return 'The tier cap in Settings is 2D'
    default:
      return undefined
  }
}

// ------------------------------------------------------------------------------------------------ the browser's answers

/** Asks the browser once. Two throwaway contexts at most, each released at once so they do not count against the page's limit. */
export function probeDevice(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  const context = (attributes: WebGLContextAttributes) => {
    try {
      return document.createElement('canvas').getContext('webgl2', attributes)
    } catch {
      return null
    }
  }
  const release = (gl: WebGL2RenderingContext | null) => gl?.getExtension('WEBGL_lose_context')?.loseContext()
  const fast = context({ failIfMajorPerformanceCaveat: true })
  const any = fast ?? context({})
  const maxTextureSize = any ? Number(any.getParameter(any.MAX_TEXTURE_SIZE)) : null
  release(fast)
  if (any !== fast) release(any)
  return {
    webgl2: any !== null,
    majorPerformanceCaveat: any !== null && fast === null,
    coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    maxTextureSize,
    saveData: nav.connection?.saveData === true,
  }
}

const LOST_KEY = 'es:scene:lost-contexts'
/** The count when session storage is unavailable: it then lives as long as the page does. */
let memoryLost = 0

/** Contexts lost in this tab's session. Storage can throw (a private window, blocked site data): then the page's own count. */
export function lostContexts(): number {
  try {
    const value = Number(sessionStorage.getItem(LOST_KEY) ?? '0')
    return Math.max(memoryLost, Number.isInteger(value) && value >= 0 ? value : 0)
  } catch {
    return memoryLost
  }
}

/** Counts one more lost context, and returns the count. */
export function countLostContext(): number {
  const next = lostContexts() + 1
  memoryLost = next
  try {
    sessionStorage.setItem(LOST_KEY, String(next))
  } catch {
    // The page's own count stands in.
  }
  return next
}

/**
 * Test builds only (`VITE_ES_TEST_HOOKS=1`): `?es-tier=<0-3>` forces the starting tier, so an e2e run on a software
 * renderer can choose T1 or T2 (TRACKER W0-T15, check 5). A production build compiles this to `null`.
 */
export function forcedTier(): Tier | null {
  if (import.meta.env.VITE_ES_TEST_HOOKS !== '1') return null
  try {
    const value = new URLSearchParams(location.search).get('es-tier')
    if (value === null || !/^[0-3]$/.test(value)) return null
    return Number(value) as Tier
  } catch {
    return null
  }
}

// ------------------------------------------------------------------------------------------------ the hook

export interface DeviceTier extends TierDecision {
  /** False until the browser has been asked: on the server and in the first client render, which show the 2D view. */
  readonly known: boolean
  readonly hints: DeviceHints | null
}

const UNKNOWN: DeviceTier = { tier: 0, reason: 'default', known: false, hints: null }
let probed: DeviceHints | null = null
let probing = false
const tierListeners = new Set<() => void>()
let snapshots = new Map<string, DeviceTier>()

function notifyTier() {
  for (const listener of tierListeners) listener()
}

/** Forgets the cached answers, so the next read decides again: after a lost context, or a change in Settings. */
export function refreshDeviceTier(): void {
  snapshots = new Map()
  notifyTier()
}

function decide(hints: DeviceHints, choice: TierChoice): DeviceTier {
  const forced = forcedTier()
  if (forced !== null && hints.webgl2) return { tier: forced, reason: 'forced', known: true, hints }
  const lost = Math.max(choice.lostContexts, lostContexts())
  return { ...startingTier(hints, { ...choice, lostContexts: lost }), known: true, hints }
}

function subscribeTier(listener: () => void) {
  tierListeners.add(listener)
  // The probe makes contexts, so it never runs inside a render: the first subscriber schedules it, and the views
  // paint their 2D first (A§6.10).
  if (probed === null && !probing) {
    probing = true
    setTimeout(() => {
      probed = probeDevice()
      probing = false
      notifyTier()
    }, 0)
  }
  return () => {
    tierListeners.delete(listener)
  }
}

/**
 * The tier this device starts at, and why. Until the browser has been asked (on the server, and in the first renders
 * on the client) it says `known: false` and tier 0, so every view paints its 2D first. It asks once per page, and
 * decides again on `refreshDeviceTier()`.
 *
 * The learner's settings ("3D off" and the tier cap, src/settings) apply to every caller, so no view passes them on and none
 * can forget to: a caller's own `choice` can only lower what they allow, and a change in Settings is decided again at once.
 */
export function useDeviceTier(choice: Partial<TierChoice> = {}): DeviceTier {
  const limits = limitsFor(useSettings(), { prefer2d: choice.prefer2d, tierCap: choice.cap })
  const full: TierChoice = { ...DEFAULT_CHOICE, ...choice, prefer2d: limits.prefer2d, cap: limits.cap }
  const key = `${full.prefer2d}|${full.cap}|${full.lostContexts}`
  return useSyncExternalStore(
    subscribeTier,
    () => {
      if (probed === null) return UNKNOWN
      let snapshot = snapshots.get(key)
      if (!snapshot) {
        snapshot = decide(probed, full)
        snapshots.set(key, snapshot)
      }
      return snapshot
    },
    () => UNKNOWN,
  )
}
