/*
 * What a Stage hands the scene it loads, and what the scene reports back (ARCHITECTURE §6.4, §6.7). The Stage lives in the
 * page's first chunk and imports no three; the scene lives in a lazy chunk and does. This context is the seam between them:
 * the tier and the preferences go down, and failures, the first frame, stillness and the governor's verdicts come up.
 */
import { createContext, useContext } from 'react'
import type { Tier } from './tiers'

/** Why a scene stopped: its context could not be made, a shader did not compile, the context was lost, a render threw, or its chunk did not load. */
export type StageFailure = 'create' | 'shader' | 'lost' | 'render' | 'load'

/** One frame's counts, read from three's `renderer.info` after the frame (A§11.1's draw-call and instance budgets). */
export interface FrameStats {
  /** Draw calls of the scene render alone. */
  readonly sceneCalls: number
  /** Draw calls of the whole frame, post-processing included. */
  readonly calls: number
  readonly triangles: number
  /** Instances the frame's instanced meshes drew. */
  readonly instances: number
  /** Lights that cast a shadow map this frame (none where the tier or the scene has none). */
  readonly shadows?: number
  readonly geometries: number
  readonly textures: number
  readonly programs: number
  /** The pixel ratio the canvas rendered at. */
  readonly dpr: number
  /** The passes the frame ran, the scene render first. */
  readonly passes: readonly string[]
  /** The frame-time p95 the governor holds, in ms, while animating; null when there is no full window. */
  readonly p95: number | null
  /** Frames drawn since the scene mounted. */
  readonly frames: number
}

export interface StageRuntime {
  readonly id: string
  readonly tier: Tier
  /** The learner's cap (Settings): the governor never goes above it. */
  readonly cap: Tier
  /** Whether the governor may move the tier. A tier forced in a test build stays where it was put. */
  readonly governed: boolean
  readonly reducedMotion: boolean
  readonly contrastMore: boolean
  readonly forcedColors: boolean
  /** The scene cannot run. The Stage shows the 2D view in its box and says so. */
  fail(reason: StageFailure, detail?: unknown): void
  /** The scene's first frame is drawn: the Stage swaps its 2D view out. */
  ready(): void
  /** No frame is pending: the scene is still until something changes. */
  settled(): void
  /** The scene started or stopped animating. */
  animating(on: boolean): void
  /** The governor moved the tier. */
  tierChange(to: Tier): void
  /** The governor offers the 2D view (T1, p95 above 50 ms for 5 s). */
  offer2d(): void
  /** The frame's counts, at most a few times a second. */
  frameStats(stats: FrameStats): void
}

export const StageContext = createContext<StageRuntime | null>(null)

/** The runtime of the Stage that loaded this scene. A scene rendered outside a Stage is a programming error. */
export function useStageRuntime(): StageRuntime {
  const runtime = useContext(StageContext)
  if (runtime === null) throw new Error('a scene renders inside a Stage: <Stage scene={...}> loads it')
  return runtime
}
