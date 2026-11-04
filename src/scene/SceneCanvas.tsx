import { addTail, createRoot, events, extend, useFrame, useThree, type ReconcilerRoot, type RootState, type RootStore } from '@react-three/fiber'
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import * as THREE from 'three'
import { useSceneTokens, type SceneTokens } from '@/design/scene-tokens'
import type { ColorRoleName } from '@/design/tokens'
import { easingFrom } from './camera-rig'
import { kitchenEnvironment } from './environment'
import { createGovernor, type Governor } from './governor'
import { KitContext, type Kit } from './kit'
import { LabelStore } from './label-store'
import { LabelLayer } from './LabelLayer'
import { LabelProjector } from './LabelProjector'
import type { LabelSpec } from './labels'
import { createMaterials, roleColor } from './materials'
import { planFromId, planId, postFxPlan } from './postfx/plan'
import type { PostFx } from './postfx/postfx'
import { useStageRuntime, type FrameStats, type StageRuntime } from './stage-runtime'
import { registerProbe, TEST_HOOKS } from './test-hook'
import { TIERS } from './tiers'

/*
 * SceneCanvas (ARCHITECTURE §6.4, `Stage`'s canvas half): the R3F root a scene draws into. A scene module renders it with
 * its primitives as children; the Stage around it decides whether it runs at all.
 *
 *   - WebGL2 only (D-020). The context is made here, so a failure to make it, a shader that does not compile, a render
 *     that throws and a lost context all reach the Stage as a failure, and the Stage shows the 2D view.
 *   - The pixel ratio is capped by the tier, and post-processing follows the tier's plan (postfx/plan.ts): at T2 and up the
 *     `postfx` chunk loads; below, it is never requested.
 *   - The loop draws on demand. While something animates it runs at the tier's frame-rate cap, and the governor samples
 *     those frames. It stops when the page is hidden or the canvas is scrolled away.
 *   - Each mount gets a fresh <canvas>, and an unmount disposes the root, the materials, the environment and the composer,
 *     so a remount (React's strict mode, a restore after a lost context) never shares a dying context.
 *   - Text is DOM: the labels ride over the canvas (LabelLayer), placed by a projector inside it.
 *
 * Every colour is a role, read through scene-tokens.ts.
 */

// The full catalogue of three's classes as JSX elements, as R3F's own <Canvas> registers it.
extend(THREE as unknown as Parameters<typeof extend>[0])

export interface SceneCanvasProps {
  children: ReactNode
  labels?: readonly LabelSpec[]
  /** The colour behind the scene, and the fog's: the world beyond the far end of the line. Default the ground, `surface-0`. */
  background?: ColorRoleName
  /**
   * Fog from `near` to `far` scene units beyond the camera's focus (its preset's target), so the night recedes into the
   * ground's colour at the far end of the line from every shot, near or far; null for none.
   */
  fog?: { near: number; far: number } | null
  /** Tone-mapping exposure [estimated]. */
  exposure?: number
  /** The kitchen the steel reflects (environment.ts). Default on. */
  environment?: boolean
  /** How strongly the environment lights the scene [estimated]. */
  environmentIntensity?: number
  className?: string
}

/** How often frame counts reach the Stage while the scene animates [estimated]: often enough for a readout, rarely enough not to re-render the page every frame. */
const STATS_EVERY_MS = 250

interface Bridge {
  stats: FrameStats | null
  waiters: ((stats: FrameStats) => void)[]
  invalidate: () => void
}

interface RootHandle {
  render(tree: ReactNode): void
  dispose(): void
}

/** Makes the WebGL2 renderer on a canvas, or throws: the configure call that runs it reports the failure. */
function makeRenderer(canvas: HTMLCanvasElement, onShaderError: () => void): THREE.WebGLRenderer {
  // A test build keeps the drawn frame, so e2e can sample its pixels (W0-T17's non-blank check); production never pays for it.
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: TEST_HOOKS,
  })
  if (!context) throw new Error('WebGL2 is not available')
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false })
  renderer.debug.onShaderError = () => onShaderError()
  return renderer
}

/** Creates a canvas inside `host`, an R3F root on it, and everything that watches it; returns the handle that renders and disposes. */
function mountRoot(host: HTMLElement, latest: { current: { runtime: StageRuntime } }, store: LabelStore, onPause: (paused: boolean) => void, bridge: { current: Bridge }): RootHandle {
  const canvas = document.createElement('canvas')
  canvas.className = 'es-scene__canvas'
  host.prepend(canvas)
  const root: ReconcilerRoot<HTMLCanvasElement> = createRoot(canvas)
  let disposed = false
  let rootStore: RootStore | null = null
  let pending: ReactNode = null
  const fail = (reason: Parameters<StageRuntime['fail']>[0]) => {
    if (!disposed) latest.current.runtime.fail(reason)
  }

  const onLost = (event: Event) => {
    event.preventDefault()
    fail('lost')
  }
  canvas.addEventListener('webglcontextlost', onLost)

  const rect = host.getBoundingClientRect()
  const tier = latest.current.runtime.tier
  const ready = root
    .configure({
      gl: () => makeRenderer(canvas, () => fail('shader')),
      size: { width: Math.max(1, rect.width), height: Math.max(1, rect.height), top: 0, left: 0 },
      dpr: [1, TIERS[tier].dprCap],
      frameloop: 'demand',
      flat: true,
      events,
      camera: { fov: 30, near: 0.05, far: 200, position: [0, 3, 9] },
      onCreated: (state: RootState) => state.events.connect?.(host),
    })
    .then(() => {
      if (disposed) return
      rootStore = root.render(pending)
    })
  ready.catch(() => fail('create'))

  // The canvas follows its box.
  const resize = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    if (width > 0 && height > 0) rootStore?.getState().setSize(width, height, 0, 0)
  })
  resize.observe(host)

  // No frames while the page is hidden or the canvas is out of view.
  let hidden = document.visibilityState === 'hidden'
  let away = false
  const update = () => onPause(hidden || away)
  const onVisibility = () => {
    hidden = document.visibilityState === 'hidden'
    update()
  }
  document.addEventListener('visibilitychange', onVisibility)
  const sight = new IntersectionObserver(([entry]) => {
    away = !entry.isIntersecting
    update()
  })
  sight.observe(host)

  const unregister = registerProbe({
    id: latest.current.runtime.id,
    info: () => bridge.current.stats,
    frame: () =>
      new Promise((resolve) => {
        bridge.current.waiters.push(resolve)
        bridge.current.invalidate()
      }),
    loseContext: () => {
      const extension = rootStore?.getState().gl.getContext().getExtension('WEBGL_lose_context')
      if (!extension) return false
      extension.loseContext()
      return true
    },
    project: (at, frame) => {
      const state = rootStore?.getState()
      if (!state) return null
      const point = new THREE.Vector3(at[0], at[1], at[2])
      const space = frame ? store.frames.get(frame) : undefined
      if (space) point.applyMatrix4(space.matrixWorld)
      point.project(state.camera)
      if (point.z <= -1 || point.z >= 1) return null
      return { x: ((point.x + 1) / 2) * state.size.width, y: ((1 - point.y) / 2) * state.size.height }
    },
  })

  return {
    render(tree) {
      pending = tree
      if (rootStore && !disposed) root.render(tree)
    },
    dispose() {
      disposed = true
      unregister()
      canvas.removeEventListener('webglcontextlost', onLost)
      document.removeEventListener('visibilitychange', onVisibility)
      resize.disconnect()
      sight.disconnect()
      root.unmount()
      // R3F lets go of the context half a second after an unmount; the canvas leaves the page now.
      canvas.remove()
    },
  }
}

/** Catches a render error inside the canvas and reports it, once. */
class RootBoundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    void info
    this.props.onError(error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function SceneCanvas({ children, labels = [], background = 'surface-0', fog = null, exposure = 1, environment = true, environmentIntensity = 0.9, className }: SceneCanvasProps) {
  const runtime = useStageRuntime()
  const tokens = useSceneTokens()
  const host = useRef<HTMLDivElement>(null)
  const [store] = useState(() => new LabelStore())
  const [paused, setPaused] = useState(false)
  const latest = useRef({ runtime })
  const bridge = useRef<Bridge>({ stats: null, waiters: [], invalidate: () => undefined })
  const handle = useRef<RootHandle | null>(null)

  useLayoutEffect(() => {
    latest.current = { runtime }
  })

  useLayoutEffect(() => {
    if (!host.current) return
    const mounted = mountRoot(host.current, latest, store, setPaused, bridge)
    handle.current = mounted
    return () => {
      mounted.dispose()
      handle.current = null
    }
  }, [store])

  // Every render of this component re-renders the canvas's tree: the children are the scene's marks.
  useLayoutEffect(() => {
    handle.current?.render(
      <RootBoundary onError={() => runtime.fail('render')}>
        <KitRoot
          runtime={runtime}
          tokens={tokens}
          paused={paused}
          store={store}
          bridge={bridge}
          background={background}
          fog={fog}
          exposure={exposure}
          environment={environment}
          environmentIntensity={environmentIntensity}
        >
          {children}
        </KitRoot>
      </RootBoundary>,
    )
  })

  return (
    <div ref={host} className={className ? `es-scene ${className}` : 'es-scene'}>
      <LabelLayer store={store} labels={labels} />
    </div>
  )
}

interface KitRootProps {
  runtime: StageRuntime
  tokens: SceneTokens
  paused: boolean
  store: LabelStore
  bridge: { current: Bridge }
  background: ColorRoleName
  fog: { near: number; far: number } | null
  exposure: number
  environment: boolean
  environmentIntensity: number
  children: ReactNode
}

/** Counts the instances the scene's visible instanced meshes draw. */
function countInstances(scene: THREE.Scene): number {
  let total = 0
  scene.traverseVisible((object) => {
    if ((object as THREE.InstancedMesh).isInstancedMesh) total += (object as THREE.InstancedMesh).count
  })
  return total
}

/** Everything inside the root: renderer settings, materials, light from the environment, post-processing and the loop. */
function KitRoot({ runtime, tokens, paused, store, bridge, background, fog, exposure, environment, environmentIntensity, children }: KitRootProps) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)
  const viewport = useThree((state) => state.viewport)
  const setFrameloop = useThree((state) => state.setFrameloop)
  const invalidate = useThree((state) => state.invalidate)
  const setDpr = useThree((state) => state.setDpr)
  const tier = runtime.tier

  // The renderer: Khronos PBR Neutral tone mapping keeps the roles' colours true below the highlights, and the frame's
  // counts accumulate across passes until the loop resets them.
  useLayoutEffect(() => {
    gl.toneMapping = THREE.NeutralToneMapping
    gl.toneMappingExposure = exposure
    gl.info.autoReset = false
    gl.shadowMap.enabled = false
    invalidate()
  }, [gl, exposure, invalidate])

  useEffect(() => {
    setDpr([1, TIERS[tier].dprCap])
  }, [tier, setDpr])

  // The materials: made per tier class (T1 drops the steel's clearcoat) and again when a preference changes their colours.
  const materialTier = tier >= 2 ? 2 : 1
  const materials = useMemo(() => createMaterials(tokens, materialTier, gl.capabilities.getMaxAnisotropy()), [gl, materialTier, tokens])
  useEffect(() => {
    invalidate()
    return () => materials.dispose()
  }, [materials, invalidate])

  // The kitchen the steel reflects, the ground behind the line, and the fog the night recedes into.
  useEffect(() => {
    if (!environment) return
    const kitchen = kitchenEnvironment(gl, tokens)
    scene.environment = kitchen.target.texture
    scene.environmentIntensity = environmentIntensity
    invalidate()
    return () => {
      scene.environment = null
      kitchen.dispose()
    }
  }, [gl, scene, tokens, environment, environmentIntensity, invalidate])
  const fogNear = fog?.near ?? null
  const fogFar = fog?.far ?? null
  const focusDistance = useRef(0)
  useEffect(() => {
    const ground = roleColor(tokens, background)
    scene.background = ground
    scene.fog = fogNear !== null && fogFar !== null ? new THREE.Fog(ground.clone(), focusDistance.current + fogNear, focusDistance.current + fogFar) : null
    invalidate()
  }, [scene, tokens, background, fogNear, fogFar, invalidate])

  // Post-processing at T2 and up: the `postfx` chunk is imported here, and only here.
  const plan = postFxPlan(tier, { contrastMore: runtime.contrastMore, forcedColors: runtime.forcedColors })
  const planKey = planId(plan)
  const get = useThree((state) => state.get)
  const postfx = useRef<PostFx | null>(null)
  const sizeNow = useRef({ width: size.width, height: size.height, dpr: viewport.dpr })
  useEffect(() => {
    sizeNow.current = { width: size.width, height: size.height, dpr: viewport.dpr }
    postfx.current?.setSize(size.width, size.height, viewport.dpr)
    invalidate()
  }, [size.width, size.height, viewport.dpr, invalidate])
  // While the chunk loads the scene is not yet as it will be, so it is not yet still.
  const loading = useRef(0)
  useEffect(() => {
    const wanted = planFromId(planKey)
    if (!wanted.composer) return
    let alive = true
    let made: PostFx | null = null
    loading.current += 1
    import('./postfx/postfx')
      .then(({ createPostFx }) => {
        if (!alive) return
        made = createPostFx(gl, scene, get().camera, wanted, sizeNow.current)
        postfx.current = made
      })
      .catch(() => {
        // Without the chunk the scene renders straight to the canvas, as it does at T1.
      })
      .finally(() => {
        loading.current -= 1
        invalidate()
      })
    return () => {
      alive = false
      made?.dispose()
      postfx.current = null
      invalidate()
    }
  }, [planKey, gl, scene, get, invalidate])

  // The loop: holds keep frames coming while something animates; nothing held, frames come only on demand.
  const holds = useRef(0)
  const freshHold = useRef(false)
  const pausedNow = useRef(paused)
  const [governor] = useState<Governor>(() => createGovernor(runtime.tier, runtime.cap))
  const runtimeNow = useRef(runtime)
  useEffect(() => {
    runtimeNow.current = runtime
  })
  // A lower cap from Settings drops the tier at once.
  useEffect(() => {
    const verdict = governor.setCap(runtime.cap, performance.now())
    if (verdict?.kind === 'tier') runtimeNow.current.tierChange(verdict.to)
  }, [governor, runtime.cap])
  useEffect(() => {
    pausedNow.current = paused
    setFrameloop(paused ? 'never' : holds.current > 0 ? 'always' : 'demand')
    if (!paused) invalidate()
  }, [paused, setFrameloop, invalidate])

  // When the loop stops, the scene is still: the Stage marks it settled (A§11.2's reduced-motion check reads that).
  useEffect(
    () =>
      addTail(() => {
        if (holds.current === 0 && loading.current === 0) runtimeNow.current.settled()
      }),
    [],
  )

  const kit = useMemo<Kit>(
    () => ({
      tokens,
      materials,
      tier,
      reducedMotion: runtime.reducedMotion,
      ease: easingFrom(tokens.roles['ease-settle']),
      hold() {
        holds.current += 1
        if (holds.current === 1) {
          freshHold.current = true
          if (!pausedNow.current) setFrameloop('always')
          runtimeNow.current.animating(true)
        }
        let released = false
        return () => {
          if (released) return
          released = true
          holds.current -= 1
          if (holds.current === 0) {
            setFrameloop(pausedNow.current ? 'never' : 'demand')
            governor.pause()
            runtimeNow.current.animating(false)
            invalidate()
          }
        }
      },
      invalidate: () => invalidate(),
      registerFrame: (name, object) => store.registerFrame(name, object),
      focus(distance) {
        focusDistance.current = distance
        if (scene.fog instanceof THREE.Fog && fogNear !== null && fogFar !== null) {
          scene.fog.near = distance + fogNear
          scene.fog.far = distance + fogFar
        }
      },
    }),
    [tokens, materials, tier, runtime.reducedMotion, setFrameloop, invalidate, store, governor, scene, fogNear, fogFar],
  )

  useEffect(() => {
    store.setInvalidate(() => invalidate())
    bridge.current.invalidate = () => invalidate()
  }, [store, bridge, invalidate])

  const frames = useRef(0)
  const lastDraw = useRef(Number.NEGATIVE_INFINITY)
  const lastStats = useRef(Number.NEGATIVE_INFINITY)

  useFrame((state, delta) => {
    const now = performance.now()
    const animating = holds.current > 0
    if (animating) {
      // The governor sees every frame of an animation but the first, whose delta spans the idle time before it.
      if (freshHold.current) freshHold.current = false
      else if (runtimeNow.current.governed) {
        const verdict = governor.sample(delta * 1000, now)
        if (verdict?.kind === 'tier') runtimeNow.current.tierChange(verdict.to)
        if (verdict?.kind === 'offer-2d') runtimeNow.current.offer2d()
      }
      // The tier's frame-rate cap: skip the frame if the last one was drawn too recently.
      const interval = 1000 / Math.max(1, TIERS[runtimeNow.current.tier].fpsCap)
      if (now - lastDraw.current < interval - 2) return
    }

    gl.info.reset()
    let sceneCounts: { calls: number; triangles: number }
    const fx = postfx.current
    if (fx) {
      fx.setCamera(state.camera)
      sceneCounts = fx.render(delta)
    } else {
      gl.render(state.scene, state.camera)
      sceneCounts = { calls: gl.info.render.calls, triangles: gl.info.render.triangles }
    }
    frames.current += 1
    lastDraw.current = now
    if (frames.current === 1) runtimeNow.current.ready()

    const waiting = bridge.current.waiters.length > 0
    if (!animating || waiting || now - lastStats.current >= STATS_EVERY_MS) {
      lastStats.current = now
      const stats: FrameStats = {
        sceneCalls: sceneCounts.calls,
        calls: gl.info.render.calls,
        triangles: sceneCounts.triangles,
        instances: countInstances(state.scene),
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
        dpr: state.viewport.dpr,
        passes: fx ? fx.plan.passes : ['scene'],
        p95: governor.state.p95,
        frames: frames.current,
      }
      bridge.current.stats = stats
      runtimeNow.current.frameStats(stats)
      const waiters = bridge.current.waiters.splice(0)
      for (const resolve of waiters) resolve(stats)
    }
  }, 1)

  return (
    <KitContext.Provider value={kit}>
      <LabelProjector store={store} />
      {children}
    </KitContext.Provider>
  )
}
