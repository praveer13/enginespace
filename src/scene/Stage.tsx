import clsx from 'clsx'
import { Component, Suspense, useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/design/components/Button'
import { Icon } from '@/design/components/Glyph'
import { useSceneTokens } from '@/design/scene-tokens'
import { limitsFor } from '@/settings/rules'
import { useSettings } from '@/settings/useSettings'
import { ClaimLease, useLease } from './lease'
import { StageContext, type FrameStats, type StageFailure, type StageRuntime } from './stage-runtime'
import { countLostContext, refreshDeviceTier, unavailableReason, useDeviceTier, type Tier } from './tiers'
import './scene.css'

/*
 * Stage (ARCHITECTURE §6.4, §6.7): the box a 3D scene lives in, and everything around the scene that is not 3D. It imports
 * no three, so a page or a game holds it in its first chunk; the scene itself is a lazy component whose chunk loads only
 * when the Stage decides to show it.
 *
 *   - The 2D view paints first, in the same box: on the server, in the first render, at T0, while the scene loads, and
 *     whenever the scene cannot run. The swap to 3D is a crossfade, or a cut under reduced motion.
 *   - It decides from the tier (tiers.ts): T0 never loads the scene; `saveData` waits until the learner asks.
 *   - One live canvas per page (lease.ts): a second Stage shows its 2D view until it is opened. Inside a `ClaimLease` (a lesson's game
 *     block the learner has just started) a Stage takes the lease the first time it wants it, and the one it took it from goes 2D.
 *   - When the scene fails (no context, a shader that does not compile, a render that throws, a chunk that does not load,
 *     a lost context) the Stage shows the 2D view and announces "3D view unavailable; showing the 2D view". The session
 *     lives outside the views, so nothing of it is lost. After a first lost context it tries once more to restore the
 *     scene; after a second, the session stays 2D (A§6.7).
 *   - The governor (in the scene) can move the tier, and at T1 offer the 2D view; the switch waits for the next pause.
 *
 * Announcements go to the game's live region when it passes `announce`, or to the Stage's own.
 */

export interface StageProps<P extends object> {
  /** The 2D view: the first paint, the view at T0, and the fallback, all in this box. */
  view2d: ReactNode
  /** The scene: `lazy(() => import('./Scene3D'))`, a component that renders `<SceneCanvas>` from the kit. */
  scene: ComponentType<P>
  sceneProps: P
  /** The game's live region. Without it, the Stage keeps its own. */
  announce?: (message: string) => void
  /** The Stage fell back to the 2D view: a game can switch its own view switch to 2D. */
  onFallback?: (reason: StageFailure | 'governor') => void
  /** The scene's frame counts, a few times a second, for a readout. */
  onStats?: (stats: FrameStats) => void
  /** The tier the scene runs at, whenever it changes. */
  onTier?: (tier: Tier) => void
  /**
   * Keep this Stage in its 2D view. The learner's own settings ("3D off", the tier cap; src/settings) apply to every Stage without
   * being passed, and these two props are what a game may ask on top of them: either side can hold the 3D view back, and neither
   * can raise what the other holds.
   */
  prefer2d?: boolean
  /** The highest tier this Stage may run at; the lower of this and the learner's cap holds. */
  tierCap?: Tier
  /** For the lease and the test hook. Default: a generated id. */
  id?: string
  /**
   * Open this Stage's scene when it scrolls well into view while the Stage holding the page's lease is out of view: on a page with
   * two scenes, the one being read is the live one. Off by default; the button in the Stage's note always opens it too.
   */
  openInView?: boolean
  className?: string
}

/** How much of a Stage must be in view before `openInView` takes the lease [estimated]. */
const IN_VIEW = 0.5

/** Whether any part of an element lies inside the viewport. */
function inViewport(element: Element | null): boolean {
  if (!element) return false
  const box = element.getBoundingClientRect()
  return box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth
}

/** A§6.7's words. */
export const UNAVAILABLE = '3D view unavailable; showing the 2D view.'
export const RESTORED = '3D view restored.'
/** How long the Stage waits before it tries to restore a lost context [estimated]. */
export const RESTORE_AFTER_MS = 1500

interface State {
  /** Bumped to mount a fresh scene: a restore, or a retry. */
  readonly attempt: number
  readonly failure: StageFailure | null
  /** The session stays 2D: a second lost context. */
  readonly permanent: boolean
  readonly restoring: boolean
  /** The scene's first frame is drawn. */
  readonly live: boolean
  /** The 2D view has faded out under the scene. */
  readonly twinGone: boolean
  readonly settled: boolean
  /** The learner asked for the 3D view (under `saveData`, after a failure). */
  readonly requested: boolean
  /** The learner took the governor's offer: 2D until they ask again. */
  readonly chose2d: boolean
  readonly offer2d: boolean
  /** The tier the governor moved to, over the starting one. */
  readonly tier: Tier | null
}

type Action =
  | { type: 'fail'; reason: StageFailure; permanent: boolean; restoring: boolean }
  | { type: 'restore' }
  | { type: 'ready' }
  | { type: 'twin-gone' }
  | { type: 'settled'; on: boolean }
  | { type: 'request' }
  | { type: 'offer-2d' }
  | { type: 'choose-2d' }
  | { type: 'tier'; tier: Tier }
  | { type: 'unmounted' }

const INITIAL: State = {
  attempt: 0,
  failure: null,
  permanent: false,
  restoring: false,
  live: false,
  twinGone: false,
  settled: false,
  requested: false,
  chose2d: false,
  offer2d: false,
  tier: null,
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'fail':
      if (state.permanent) return state
      return { ...state, failure: action.reason, permanent: action.permanent, restoring: action.restoring, live: false, twinGone: false, settled: false }
    case 'restore':
      return { ...state, attempt: state.attempt + 1, failure: null, restoring: false, live: false, twinGone: false, settled: false }
    case 'ready':
      return state.failure === null ? { ...state, live: true } : state
    case 'twin-gone':
      return state.live ? { ...state, twinGone: true } : state
    case 'settled':
      return state.settled === action.on ? state : { ...state, settled: action.on }
    case 'request':
      return { ...state, requested: true, chose2d: false, offer2d: false, failure: state.permanent ? state.failure : null, attempt: state.attempt + 1, live: false, twinGone: false }
    case 'offer-2d':
      return { ...state, offer2d: true }
    case 'choose-2d':
      return { ...state, chose2d: true, offer2d: false, live: false, twinGone: false, settled: false }
    case 'tier':
      return { ...state, tier: action.tier }
    case 'unmounted':
      // The scene is gone (3D turned off, a second Stage took the lease): the next one starts from nothing, and the 2D twin stays until
      // its first frame is drawn. Without this a scene that comes back would find itself "live" and take the twin away from under it.
      return state.live || state.twinGone || state.settled ? { ...state, live: false, twinGone: false, settled: false } : state
  }
}

interface Voice {
  say(text: string): void
  get(): { id: number; text: string } | null
  subscribe(listener: () => void): () => void
}

/** The Stage's own announcements, as a store outside React's state, so an effect may speak without a cascade of renders. */
function createVoice(): Voice {
  let message: { id: number; text: string } | null = null
  const listeners = new Set<() => void>()
  return {
    say(text) {
      message = { id: (message?.id ?? 0) + 1, text }
      for (const listener of listeners) listener()
    },
    get: () => message,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The Stage's polite live region, present from the first render so a screen reader hears what lands in it. */
function StageVoice({ voice }: { voice: Voice }) {
  const message = useSyncExternalStore(voice.subscribe, voice.get, () => null)
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-live="stage">
      {message ? <span key={message.id}>{message.text}</span> : null}
    </div>
  )
}

/** Catches a scene that throws or whose chunk does not load, and reports it once. */
class SceneBoundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
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

export function Stage<P extends object>({ view2d, scene: Scene, sceneProps, announce, onFallback, onStats, onTier, prefer2d = false, tierCap = 3, id, openInView = false, className }: StageProps<P>) {
  const generated = useId()
  const stageId = id ?? `stage-${generated.replace(/[^a-zA-Z0-9]/g, '')}`
  const tokens = useSceneTokens()
  // The learner's settings join the game's own asks, and a change applies live: the tier is decided again at once. The device
  // tier applies them itself (tiers.ts), and the governor's ceiling is the same rule's answer.
  const { cap } = limitsFor(useSettings(), { prefer2d, tierCap })
  const device = useDeviceTier({ prefer2d, cap: tierCap })
  const [state, dispatch] = useReducer(reduce, INITIAL)
  const [voice] = useState(createVoice)

  const tier: Tier = (state.tier ?? device.tier) as Tier
  const saveData = device.hints?.saveData === true
  const wants = device.known && device.tier >= 1 && !state.permanent && !state.chose2d && (!saveData || state.requested)
  // The lease is held under this Stage's own key: two Stages with one id (a lesson's two blocks of a game) are still two holders.
  const leaseKey = `${stageId}~${generated.replace(/[^a-zA-Z0-9]/g, '')}`
  const lease = useLease(leaseKey, wants)
  const mounted = wants && lease.held && state.failure === null
  const box = useRef<HTMLDivElement>(null)
  const { holder, take } = lease
  useEffect(() => {
    const element = box.current
    if (!openInView || !wants || !element || typeof IntersectionObserver !== 'function' || holder === leaseKey) return
    const sight = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < IN_VIEW || holder === null) return
        if (!inViewport(document.querySelector(`[data-lease="${CSS.escape(holder)}"]`))) take()
      },
      { threshold: [IN_VIEW] },
    )
    sight.observe(element)
    return () => sight.disconnect()
  }, [openInView, wants, holder, leaseKey, take])
  // A Stage that the learner has just opened (ClaimLease: a lesson's game block) takes the lease the first time it wants it.
  const claim = useContext(ClaimLease)
  const claimed = useRef(false)
  useEffect(() => {
    if (!claim || !wants || claimed.current) return
    claimed.current = true
    take()
  }, [claim, wants, take])
  // A scene that leaves takes what it had drawn with it. This adjusts state while rendering, the pattern for state that follows a value.
  const [wasMounted, setWasMounted] = useState(mounted)
  if (wasMounted !== mounted) {
    setWasMounted(mounted)
    if (!mounted) dispatch({ type: 'unmounted' })
  }

  // The callbacks a scene reaches through the runtime, kept current without re-creating the runtime.
  const props = useRef({ announce, onFallback, onStats, onTier })
  useEffect(() => {
    props.current = { announce, onFallback, onStats, onTier }
  })
  const say = useCallback(
    (text: string) => {
      const external = props.current.announce
      if (external) external(text)
      else voice.say(text)
    },
    [voice],
  )

  // Announce, once, that 3D was wanted and cannot be had on this device. A learner who chose 2D hears nothing, and a failure
  // that was already announced is not announced twice.
  const announced = useRef(false)
  useEffect(() => {
    if (!device.known || device.tier >= 1 || announced.current) return
    announced.current = true
    if (device.reason === 'chosen-2d' || device.reason === 'capped') return
    say(UNAVAILABLE)
    props.current.onFallback?.(device.reason === 'lost-twice' ? 'lost' : 'create')
  }, [device.known, device.tier, device.reason, say])

  const animating = useRef(false)
  const pending2d = useRef(false)
  const runtime = useMemo<StageRuntime>(
    () => ({
      id: stageId,
      tier,
      cap,
      governed: device.reason !== 'forced',
      reducedMotion: tokens.motion.reduced,
      contrastMore: tokens.contrastMore,
      forcedColors: tokens.forcedColors,
      fail(reason) {
        const lost = reason === 'lost' ? countLostContext() : 0
        const permanent = reason === 'lost' && lost >= 2
        dispatch({ type: 'fail', reason, permanent, restoring: reason === 'lost' && !permanent })
        announced.current = true
        if (permanent) refreshDeviceTier()
        say(UNAVAILABLE)
        props.current.onFallback?.(reason)
      },
      ready: () => dispatch({ type: 'ready' }),
      settled: () => dispatch({ type: 'settled', on: true }),
      animating(on) {
        animating.current = on
        if (on) dispatch({ type: 'settled', on: false })
        if (!on && pending2d.current) {
          pending2d.current = false
          dispatch({ type: 'choose-2d' })
          props.current.onFallback?.('governor')
        }
      },
      tierChange(to) {
        dispatch({ type: 'tier', tier: to })
        props.current.onTier?.(to)
      },
      offer2d: () => dispatch({ type: 'offer-2d' }),
      frameStats: (stats) => props.current.onStats?.(stats),
    }),
    [stageId, tier, cap, device.reason, tokens.motion.reduced, tokens.contrastMore, tokens.forcedColors, say],
  )

  useEffect(() => {
    if (device.known) props.current.onTier?.(device.tier)
  }, [device.known, device.tier])

  // After a first lost context, one more try.
  useEffect(() => {
    if (!state.restoring) return
    const timer = setTimeout(() => dispatch({ type: 'restore' }), RESTORE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [state.restoring])
  const restoredOnce = useRef(false)
  useEffect(() => {
    if (state.live && state.attempt > 0 && !restoredOnce.current) {
      restoredOnce.current = true
      say(RESTORED)
    }
  }, [state.live, state.attempt, say])

  // The 2D view fades out under the first frame, then leaves the page.
  useEffect(() => {
    if (!state.live || state.twinGone) return
    const timer = setTimeout(() => dispatch({ type: 'twin-gone' }), tokens.motion.settleMs + 30)
    return () => clearTimeout(timer)
  }, [state.live, state.twinGone, tokens.motion.settleMs])

  const choose2d = () => {
    if (animating.current) pending2d.current = true
    else {
      dispatch({ type: 'choose-2d' })
      props.current.onFallback?.('governor')
    }
  }

  const phase = !device.known ? 'twin' : mounted ? (state.live ? 'live' : 'loading') : state.failure ? 'fallback' : wants ? 'waiting' : 'twin'
  const showTwin = !(state.live && state.twinGone) || !mounted
  const reason = unavailableReason(device.reason)
  const unavailable =
    phase === 'fallback'
      ? state.restoring
        ? 'The 3D view was lost. Trying it again.'
        : state.permanent
          ? 'The 3D view stopped twice, so this session stays 2D.'
          : 'The 3D view did not start. Showing the 2D view.'
      : device.known && device.tier === 0 && reason
        ? `${reason}. Showing the 2D view.`
        : null

  return (
    <div
      ref={box}
      className={clsx('es-stage', className)}
      data-stage={stageId}
      data-lease={leaseKey}
      data-stage-phase={phase}
      data-tier={device.known ? tier : undefined}
      data-failure={state.failure ?? undefined}
      data-settled={phase === 'live' && state.settled ? 'true' : undefined}
    >
      {showTwin ? (
        <div className="es-stage__twin" data-leaving={state.live && mounted ? '' : undefined}>
          {view2d}
        </div>
      ) : null}
      {mounted ? (
        <div className="es-stage__scene" aria-hidden="true" key={state.attempt}>
          <StageContext.Provider value={runtime}>
            <SceneBoundary onError={() => runtime.fail('load')}>
              <Suspense fallback={null}>
                <Scene {...sceneProps} />
              </Suspense>
            </SceneBoundary>
          </StageContext.Provider>
        </div>
      ) : null}

      {unavailable ? (
        <p className="es-stage__note" data-note="unavailable">
          <Icon name="alert" className="es-stage__note-mark" />
          <span>{unavailable}</span>
          {phase === 'fallback' && !state.permanent && !state.restoring ? (
            <Button size="sm" variant="quiet" onClick={() => dispatch({ type: 'request' })}>
              Try 3D again
            </Button>
          ) : null}
        </p>
      ) : null}
      {phase === 'waiting' && !lease.held && wants ? (
        <p className="es-stage__note" data-note="held">
          <span>Another 3D view is open on this page.</span>
          <Button size="sm" variant="quiet" onClick={lease.take}>
            Open this one in 3D
          </Button>
        </p>
      ) : null}
      {device.known && device.tier >= 1 && saveData && !state.requested ? (
        <p className="es-stage__note" data-note="save-data">
          <span>Data saver is on, so the 3D view waits.</span>
          <Button size="sm" variant="quiet" onClick={() => dispatch({ type: 'request' })}>
            Load the 3D view
          </Button>
        </p>
      ) : null}
      {state.offer2d && phase === 'live' ? (
        <p className="es-stage__note" data-note="offer-2d">
          <span>The 3D view is running slowly here.</span>
          <Button size="sm" variant="quiet" onClick={choose2d}>
            Show the 2D view
          </Button>
        </p>
      ) : null}
      {state.chose2d ? (
        <p className="es-stage__note" data-note="chose-2d">
          <Button size="sm" variant="quiet" onClick={() => dispatch({ type: 'request' })}>
            Back to 3D
          </Button>
        </p>
      ) : null}

      {announce ? null : <StageVoice voice={voice} />}
    </div>
  )
}
