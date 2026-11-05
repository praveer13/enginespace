import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { levelOf } from '@es/play'
import { FIRST_SERVICE, FULL_SERVICE, FULL_SERVICE_KEYS, LOOP } from '@es/play/loop/entry'
import { loopSession } from '@es/play/loop/session'
import { Button } from '@/design/components/Button'
import type { GameView } from '@/games/kit/ViewSwitch'
import { GameShell } from '@/games/kit/GameShell'
import type { GameProps } from '@/games/registry'
import { nextPreset, presetById } from '@/scene/camera-rig'
import { CameraButtons } from '@/scene/CameraButtons'
import { Stage } from '@/scene/Stage'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import { WorldCard } from './Card'
import { Controls, type AutoToggleRef } from './Controls'
import { Mirror } from './Mirror'
import type { Scene3DProps } from './Scene3D'
import { DEFAULT_PRESET, LOOP_PRESETS } from './scene-presets'
import type { LoopRun } from './types'
import { View2D } from './View2D'

// The debrief is the stage after the run: its compare strips and the real engine's numbers load when a run ends, not before.
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))
// The 3D scene is its own chunk over three's (A§6.10): the Stage loads it only on a device whose tier draws 3D.
const Scene3D = lazy(() => import('./Scene3D'))
// The full service (TR2's levels and TR6's mask lane) is a chunk of its own: its rules are the step loop v1 and the cost cards, which the
// first service and the front page never load. The `keys` level waits behind its card for the owner's dispatcher tables (Q-10).
const FullService = lazy(() => import('./FullService'))
const KeysWaiting = lazy(() => import('./KeysWaiting').then((module) => ({ default: module.KeysWaiting })))

/** Service as the first service's shell shows it: its keys without the full service's own, which do nothing on these levels. */
const FIRST_FACE = { ...LOOP, keys: LOOP.keys.filter((key) => !FULL_SERVICE_KEYS.includes(key.id)) }

/** The level that waits for the owner's tables: on the docket, behind its card, and not a level of the session. */
const KEYS = { id: 'keys', title: 'Keys' } as const
const isFull = (id: string): boolean => FULL_SERVICE.some((level) => level.id === id)

/** The row of Service's levels under its name: the first service's four, then the full service's, and the keys behind their card. */
function Docket({ current, onOpen }: { current: string; onOpen: (id: string) => void }) {
  const group = (name: string, levels: readonly { readonly id: string; readonly title: string }[], extra?: { id: string; title: string }) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-size-note uppercase tracking-[0.08em] text-text-2">{name}</span>
      <ul className="flex flex-wrap gap-1">
        {[...levels, ...(extra ? [extra] : [])].map((level) => (
          <li key={level.id}>
            <Button
              size="sm"
              variant={level.id === current ? 'ink' : 'quiet'}
              aria-current={level.id === current ? 'true' : undefined}
              onClick={() => onOpen(level.id)}
            >
              {level.title}
              {level.id === KEYS.id ? (
                // Quieter than the name on the docket's plate; on the lit plate it takes the plate's own ink, as the name does.
                <span className={`font-body normal-case tracking-normal ${level.id === current ? '' : 'text-text-2'}`}> · waiting</span>
              ) : null}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <nav aria-label="Levels of Service" className="flex flex-wrap items-start gap-x-8 gap-y-3" data-loop-docket="">
      {group('First service', FIRST_SERVICE)}
      {group('The full service', FULL_SERVICE, KEYS)}
    </nav>
  )
}

/** The scene as the Stage mounts it, inside the Stage's canvas box. */
function LoopScene(props: Scene3DProps) {
  return <Scene3D {...props} />
}

/*
 * Service, the front page's game (`loop`, D-049: "Service", the step loop). Its page is Play → Debrief, around the 2D view, the
 * controls and the mirror (D-018: one session, drawn by every view). The shell owns the run and its action log; this file wires
 * Service's parts into it, and the keys that are Service's: `.` rings the bell, Space toggles Auto, `O` flips the overlap switch.
 *
 * The four levels are the front-page run, "First service" (GAMES.md §3.1). Each is practice on its pinned seed, and a finished level
 * offers the next. A front-page run records nothing (D-038), so `onFinish` is only forwarded when a page passes one. TR2's levels
 * join this game with W1-T13.
 *
 * The 3D view (W0-T17) is the pass seen over the expediter's shoulder, in a Stage that paints the 2D view first and keeps it as the
 * fallback (A§6.7). It opens on its own on a device whose tier draws 3D, and `V` or the switch swaps the two views; the session lives
 * here, above both, so a swap keeps every lever. The camera's preset lives here too: `C` and the preset buttons move it, in 3D only.
 */

const ring = (run: LoopRun): boolean => {
  if (!run.view.canFire) return false
  run.dispatch({ t: 'run', until: 'step' })
  return true
}

export default function Game({ level, placement = 'page', rev, onFinish }: GameProps) {
  const known = (id: string | undefined) => (id === KEYS.id ? KEYS.id : (LOOP.levels.find((entry) => entry.id === id)?.id ?? LOOP.levels[0].id))
  const [asked, setAsked] = useState(level)
  const [levelId, setLevelId] = useState(() => known(level))
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked) {
    setAsked(level)
    setLevelId(known(level))
  }
  const toggleAuto: AutoToggleRef = useRef(null)
  // Moving on to the next level replaces the page's content, and the button that was pressed goes with it: focus goes back to the game.
  const advanced = useRef(false)
  useEffect(() => {
    if (!advanced.current) return
    advanced.current = false
    document.querySelector<HTMLElement>(`[data-game="${LOOP.id}"]`)?.focus({ preventScroll: true })
  }, [levelId])

  // 3D opens by itself where the device draws it, and a learner's own choice of view wins from then on. Under `saveData` the Stage
  // waits to be asked, so the page opens on the 2D view there.
  const device = useDeviceTier()
  const draws3d = device.known && device.tier >= 1
  const [chosenView, setChosenView] = useState<GameView | null>(null)
  const view: GameView = chosenView ?? (draws3d && device.hints?.saveData !== true ? '3d' : '2d')
  const unavailable3d = device.known && !draws3d ? unavailableReason(device.reason) : undefined
  const [preset, setPreset] = useState(DEFAULT_PRESET)

  const entry = levelOf(LOOP, levelId) ?? LOOP.levels[0]
  // The first service walks its own four levels: its last one ends on the end card, as on the front page.
  const at = FIRST_SERVICE.findIndex((candidate) => candidate.id === entry.id)
  const after = FIRST_SERVICE[at + 1] ?? null
  const advance = () => {
    if (after === null) return
    advanced.current = true
    setLevelId(after.id)
  }
  const open = (id: string) => {
    advanced.current = true
    setLevelId(id)
  }
  // A lesson that embeds the game names its level; the page offers them all.
  const docket = placement === 'embed' ? undefined : <Docket current={levelId} onOpen={open} />

  if (levelId === KEYS.id) {
    return (
      <section data-game={LOOP.id} tabIndex={-1} aria-label={`${LOOP.title}: ${KEYS.title}`} className="flex flex-col gap-6 outline-none">
        <header className="flex flex-col gap-3">
          <div>
            <h2 className="es-type-heading">{LOOP.title}</h2>
            <p className="es-type-body text-text-2">{LOOP.subtitle}</p>
          </div>
          {docket}
        </header>
        <Suspense fallback={<p role="status">Fetching the card…</p>}>
          <KeysWaiting />
        </Suspense>
      </section>
    )
  }
  if (isFull(levelId)) {
    return (
      <Suspense fallback={<p role="status">Setting up the full service…</p>}>
        <FullService level={levelId} placement={placement} rev={rev} onFinish={onFinish} docket={docket} onLevel={open} />
      </Suspense>
    )
  }

  return (
    <GameShell
      game={FIRST_FACE}
      session={loopSession}
      level={entry.id}
      levelTitle={entry.title}
      seed={entry.practiceSeed}
      mode="practice"
      rev={rev}
      headingLevel={placement === 'embed' ? 3 : 2}
      onFinish={onFinish}
      docket={docket}
      onCommand={(command, run) => {
        if (command === 'step') return ring(run)
        if (command === 'overlap') {
          if (!run.view.overlapAvailable || run.view.done) return false
          run.dispatch({ t: 'lever', name: 'async', value: !run.view.overlap })
          return true
        }
        if (command === 'play-pause') {
          toggleAuto.current?.()
          return toggleAuto.current !== null
        }
        if (command === 'camera') {
          if (view !== '3d') return false
          const next = nextPreset(LOOP_PRESETS, preset)
          setPreset(next)
          run.announce(`Camera: ${presetById(LOOP_PRESETS, next).label}.`)
          return true
        }
        return false
      }}
      allow3d={draws3d}
      unavailable3d={unavailable3d}
      view={view}
      onViewChange={setChosenView}
      view2d={(run) => (
        // The 2D view in the box the scene would take, so it draws the kitchen at the scene's scale.
        <div className={`${STAGE_BOX} overflow-hidden rounded-plate border border-edge bg-surface-0`}>
          <View2D run={run} />
        </div>
      )}
      scene3d={(run) => <LoopStage run={run} preset={preset} />}
      controls={(run) => (
        <>
          {view === '3d' ? <CameraButtons presets={LOOP_PRESETS} value={preset} onChange={setPreset} label="Camera on the pass" /> : null}
          <Controls run={run} toggleAutoRef={toggleAuto} />
        </>
      )}
      mirror={(run) => <Mirror run={run} />}
      stage
      debrief={(run, outcome) => (
        <Suspense fallback={<p role="status">Printing the debrief…</p>}>
          <Debrief run={run} outcome={outcome} next={after === null ? null : { id: after.id, title: after.title }} onNext={advance} />
        </Suspense>
      )}
      card={<WorldCard />}
    />
  )
}

/**
 * The 3D view's box: the Stage, with the 2D view as its first paint and its fallback, and the scene behind it. A waiting ticket picked in
 * the scene is hung, as a tap on it in the controls hangs it. The scene leads the page, the controls beside it: the box is about a pass's
 * 16:10 in the first screen, and on a phone 55% of the screen's height, at least 300 px (GAMES.md §3, "Controls", all [estimated]).
 */
/** The scene's box: about a pass's 16:10 in the first screen, and on a phone 55% of the screen's height, at least 300 px [estimated]. */
const STAGE_BOX = 'h-[clamp(20rem,min(62svh,46vw),46rem)] max-[479px]:h-[max(18.75rem,55svh)]'

function LoopStage({ run, preset }: { run: LoopRun; preset: string }) {
  const { dispatch, view } = run
  const onHang = useCallback(
    (req: number) => {
      if (view.canHang && view.waiting.includes(req)) dispatch({ t: 'admit', req })
    },
    [dispatch, view.canHang, view.waiting],
  )
  return (
    <Stage
      id="loop"
      className={`${STAGE_BOX} border border-edge shadow-shelf`}
      view2d={<View2D run={run} />}
      scene={LoopScene}
      sceneProps={{ view, preset, onHang }}
      announce={run.announce}
    />
  )
}
