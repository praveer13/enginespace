/*
 * The scene kit's test hook (TRACKER W0-T15; ARCHITECTURE §11.1): in a test build, `window.__esScene` exposes each live
 * scene's `renderer.info` counts and a way to lose its context, so e2e reads the draw-call and instance budgets off the page
 * instead of assuming them. A test build is one made with `VITE_ES_TEST_HOOKS=1`; in any other build `TEST_HOOKS` is the
 * constant false and the bundler drops every line that uses it.
 */
import type { FrameStats } from './stage-runtime'

export const TEST_HOOKS: boolean = import.meta.env.VITE_ES_TEST_HOOKS === '1'

export interface SceneProbe {
  readonly id: string
  /** The last frame's counts, or null before the first frame. */
  info(): FrameStats | null
  /** Draws one frame now and resolves with its counts. */
  frame(): Promise<FrameStats>
  /** Loses the WebGL context through `WEBGL_lose_context`, as a driver reset would. False when the extension is missing. */
  loseContext(): boolean
  /**
   * Where a scene point lands on the canvas, in CSS px from its top left: in the world, or in a named label frame (the
   * track). Null when it is behind the camera. A test clicks a mark there, or samples its pixels.
   */
  project(at: readonly [number, number, number], frame?: string): { x: number; y: number } | null
}

export interface SceneHook {
  readonly probes: Record<string, SceneProbe>
}

declare global {
  interface Window {
    __esScene?: SceneHook
  }
}

/** Puts a scene's probe on the page while it lives. A no-op outside test builds. */
export function registerProbe(probe: SceneProbe): () => void {
  if (!TEST_HOOKS || typeof window === 'undefined') return () => undefined
  window.__esScene ??= { probes: {} }
  window.__esScene.probes[probe.id] = probe
  return () => {
    if (window.__esScene?.probes[probe.id] === probe) delete window.__esScene.probes[probe.id]
  }
}
