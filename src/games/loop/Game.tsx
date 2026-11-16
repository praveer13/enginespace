import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { levelOf } from '@es/play'
import { LOOP_COPY } from '@es/play/loop/copy'
import { LOOP_MET } from '@es/play/loop/parts'
import { FIRST_SERVICE, FULL_SERVICE, FULL_SERVICE_KEYS, LOOP } from '@es/play/loop/entry'
import { loopSession } from '@es/play/loop/session'
import type { LoopAction, LoopLevelId, LoopView } from '@es/play/loop/types'
import { ROSTER } from '@es/play/roster'
import { Button } from '@/design/components/Button'
import { LevelMenu } from '@/design/components/LevelMenu'
import { Frame } from '@/games/kit/Frame'
import { useDeltas } from '@/games/kit/moments'
import type { GameView } from '@/games/kit/ViewSwitch'
import type { GameProps } from '@/games/registry'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import { WorldCard } from './Card'
import { Controls, type AutoToggleRef } from './Controls'
import { loopKit, partRows } from './kit'
import { Mirror } from './Mirror'
import type { Scene3DProps } from './Scene3D'
import { readoutItems } from './strip'
import { LoopReadout } from './Tape'
import type { LoopRunCore } from './types'
import { LoopLegend, View2D } from './View2D'

// The debrief is the stage after the run: its compare strips and the real engine's numbers load when a run ends, not before.
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))
// The 3D scene is the time track (REDESIGN §2.9), its own chunk over three's (A§6.10): the Stage loads it only on a device whose tier draws
// 3D. The kitchen's scene (Scene3D.tsx) stays in the tree until the look gate, and this page no longer loads it.
const Scene3D = lazy(() => import('./Scene3D'))
// The full levels (TR2's and TR6's mask lane) are a chunk of their own: their rules are the step loop v1 and the cost cards, which the
// demo levels and the front page never load. The `keys` level waits behind its card for the owner's dispatcher tables (Q-10).
const FullService = lazy(() => import('./FullService'))
const KeysWaiting = lazy(() => import('./KeysWaiting').then((module) => ({ default: module.KeysWaiting })))
// The 3D view's Stage and its cameras load when the learner switches to 3D: the diagram is the default view.
const LoopStage3D = lazy(() => import('./Stage3D'))
const LoopCameras = lazy(() => import('./Stage3D').then((module) => ({ default: module.LoopCameras })))

/** The step loop as the demo levels' frame shows it: its keys without the full levels' own, which do nothing on these levels. */
const FIRST_FACE = { ...LOOP, keys: LOOP.keys.filter((key) => !FULL_SERVICE_KEYS.includes(key.id)) }

const ROLE = ROSTER.find((entry) => entry.id === LOOP.id)?.role ?? ''


/** The level that waits for the owner's tables: on the full levels' docket, behind its card, and not a level of the session. */
const KEYS = { id: 'keys', title: 'Keys' } as const
const isFull = (id: string): boolean => FULL_SERVICE.some((level) => level.id === id)

/** The row of the step loop's levels for the full levels' own page: the demo levels, then the full levels, and the keys behind their card. */
export function Docket({ current, onOpen }: { current: string; onOpen: (id: string) => void }) {
  const group = (name: string, levels: readonly { readonly id: string; readonly title: string }[], extra?: { id: string; title: string }) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-size-note text-text-2">{name}</span>
      <ul className="flex flex-wrap gap-1">
        {[...levels, ...(extra ? [extra] : [])].map((level) => (
          <li key={level.id}>
            <Button size="sm" variant={level.id === current ? 'ink' : 'quiet'} aria-current={level.id === current ? 'true' : undefined} onClick={() => onOpen(level.id)}>
              {level.title}
              {level.id === KEYS.id ? <span className={`font-body normal-case tracking-normal ${level.id === current ? '' : 'text-text-2'}`}> · waiting</span> : null}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <nav aria-label="Levels of the step loop" className="flex flex-wrap items-start gap-x-8 gap-y-3" data-loop-docket="">
      {group('Demo', FIRST_SERVICE)}
      {group('TR2 levels', FULL_SERVICE, KEYS)}
    </nav>
  )
}

/** The scene as the Stage mounts it, inside the Stage's canvas box. */
function LoopScene(props: Scene3DProps) {
  return <Scene3D {...props} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The page                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/*
 * The step loop (`loop`): the learner is the scheduler. The demo levels sit in the instrument frame (src/games/kit/Frame.tsx) around the
 * timing diagram, the dock and the readout, with the state as a table under them (D-018: one session, drawn by every view). The frame owns
 * the run and its action log; this file wires the loop's parts into it, and the keys that are the loop's: `.` steps, Space toggles Auto, `O`
 * flips async scheduling. The full levels (TR2's and TR6's) keep their own page, `FullService`, loaded when one is opened.
 *
 * Each demo level is practice on its pinned seed, and a finished level offers the next. A run records nothing unless the page passes an
 * `onFinish`: the game's page and a lesson's block each pass the recorder (src/games/kit/record.ts). Inside a lesson the block names the
 * level, so the level menu and the next level are left out.
 *
 * The diagram is the default view (REDESIGN §2.9: the picture is the engine's own diagram). The 3D view is one switch away where the
 * device draws it: a Stage that paints the diagram first and keeps it as the fallback (A§6.7). The session lives here, above both, so a swap
 * keeps every lever. The camera's preset lives here too: `C` and the preset buttons move it, in 3D only.
 */

export default function Game({ level, mode, placement = 'page', rev, onFinish }: GameProps) {
  const known = (id: string | undefined) => (id === KEYS.id ? KEYS.id : (LOOP.levels.find((entry) => entry.id === id)?.id ?? LOOP.levels[0].id))
  const [asked, setAsked] = useState(level)
  const [levelId, setLevelId] = useState(() => known(level))
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked) {
    setAsked(level)
    setLevelId(known(level))
  }
  // Moving on to the next level replaces the page's content, and the button that was pressed goes with it: focus goes back to the game.
  // This game's own, found from its box, since a lesson can hold two of it.
  const host = useRef<HTMLDivElement>(null)
  const advanced = useRef(false)
  useEffect(() => {
    if (!advanced.current) return
    advanced.current = false
    host.current?.querySelector<HTMLElement>('[data-game]')?.focus({ preventScroll: true })
  }, [levelId])

  // The diagram is the default view; the learner's own choice wins from then on. 3D is offered where the device draws it.
  const device = useDeviceTier()
  const draws3d = device.known && device.tier >= 1
  const [view, setView] = useState<GameView>('2d')
  const unavailable3d = device.known && !draws3d ? unavailableReason(device.reason) : undefined
  // The camera's preset: null for the scene's default, until the learner picks one.
  const [preset, setPreset] = useState<string | null>(null)

  const embedded = placement === 'embed'
  const entry = levelOf(LOOP, levelId) ?? LOOP.levels[0]
  // The demo walks its own four levels: its last one ends on the end card. A lesson names its level.
  const at = FIRST_SERVICE.findIndex((candidate) => candidate.id === entry.id)
  const after = embedded ? null : (FIRST_SERVICE[at + 1] ?? null)
  const open = (id: string) => {
    advanced.current = true
    setLevelId(id)
  }
  const docket = embedded ? undefined : <Docket current={levelId} onOpen={open} />

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
      <div ref={host} className="contents">
        <Suspense fallback={<p role="status">Setting up the level…</p>}>
          <FullService level={levelId} mode={mode} placement={placement} rev={rev} onFinish={onFinish} onLevel={open} />
        </Suspense>
      </div>
    )
  }

  const menu = embedded ? undefined : (
    <LevelMenu
      label="Level"
      value={entry.id}
      levels={LOOP.levels.map((candidate) => ({ id: candidate.id, title: candidate.title, mode: candidate.graded ? 'graded' : 'practice' }))}
      onChange={open}
    />
  )

  return (
    <div ref={host} className="contents">
      <DemoLevel
        key={entry.id}
        levelId={entry.id as LoopLevelId}
        levelTitle={entry.title}
        seed={entry.practiceSeed}
        embedded={embedded}
        rev={rev}
        onFinish={onFinish}
        menu={menu}
        next={after === null ? null : { id: after.id, title: after.title }}
        onNext={() => (after === null ? undefined : open(after.id))}
        scene={{ view, onView: setView, allow3d: draws3d, unavailable3d, preset, onPreset: setPreset }}
      />
    </div>
  )
}

interface DemoProps {
  levelId: LoopLevelId
  levelTitle: string
  seed: number
  embedded: boolean
  rev: string | undefined
  onFinish: GameProps['onFinish']
  menu: ReactNode
  next: { id: string; title: string } | null
  onNext: () => void
  scene: { view: GameView; onView: (view: GameView) => void; allow3d: boolean; unavailable3d: string | undefined; preset: string | null; onPreset: (preset: string) => void }
}

/** A step through the run's own dispatch: false when nothing can run. */
const stepRun = (run: LoopRunCore): boolean => {
  if (!run.view.canFire) return false
  run.dispatch({ t: 'run', until: 'step' })
  return true
}

/** One demo level's frame. */
function DemoLevel({ levelId, levelTitle, seed, embedded, rev, onFinish, menu, next, onNext, scene }: DemoProps) {
  const { view, preset, onPreset } = scene
  const copy = LOOP_COPY[levelId]
  const toggleAuto: AutoToggleRef = useRef(null)
  const cycleCamera = useRef<(() => string) | null>(null)
  const kit = useCallback((at: number) => loopKit(levelId, at), [levelId])
  const ringReq = (ring: LoopAction | null): number | null => (ring?.t === 'admit' ? ring.req : null)
  return (
    <Frame
      game={FIRST_FACE}
      role={ROLE}
      session={loopSession}
      level={levelId}
      levelTitle={levelTitle}
      seed={seed}
      mode="practice"
      rev={rev}
      embedded={embedded}
      onFinish={onFinish}
      ledger={onFinish !== undefined}
      kit={kit}
      menu={menu}
      modeSwitch={<span className="text-text-2">Practice: fixed numbers, undo allowed. Ticks are the model&apos;s, synthetic.</span>}
      allow3d={scene.allow3d}
      unavailable3d={scene.unavailable3d}
      view={view}
      onViewChange={scene.onView}
      onCommand={(command, run) => {
        if (command === 'step') return stepRun(run)
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
          if (view !== '3d' || cycleCamera.current === null) return false
          run.announce(`Camera: ${cycleCamera.current()}.`)
          return true
        }
        return false
      }}
      goal={(run) => ({ aim: copy.goal.aim, control: copy.goal.controls, target: copy.goal.beat, ends: copy.goal.ends, met: run.done ? LOOP_MET[levelId] : undefined })}
      diagram={(run) => <View2D run={run} ring={ringReq(run.intro.ring)} />}
      scene3d={(run) => (
        <Suspense fallback={<View2D run={run} interactive={false} />}>
          <LoopStage3D run={run} preset={preset} scene={LoopScene} diagram={<View2D run={run} interactive={false} />} />
        </Suspense>
      )}
      legend={() =>
        view === '3d' ? (
          <Suspense fallback={null}>
            <LoopCameras preset={preset} onPreset={onPreset} cycle={cycleCamera} />
          </Suspense>
        ) : (
          <LoopLegend />
        )
      }
      dock={(run) => <Controls run={run} toggleAutoRef={toggleAuto} queue={view === '3d'} ring={run.intro.ring} opening={run.turns === 0} />}
      readout={(run) => <Readout view={run.view} />}
      result={(run, outcome) => (
        <Suspense fallback={<p role="status">Reading the run…</p>}>
          <Debrief run={run} outcome={outcome} next={next} onNext={onNext} />
        </Suspense>
      )}
      mirror={(run) => <Mirror run={run} />}
      parts={partRows(levelId)}
      howTo={<HowTo levelId={levelId} />}
      titleBlock={{ model: 'Model of the step loop, after vLLM v0.33.0', clock: 'Clock: synthetic ticks, not a measurement', leavesOut: <WorldCard /> }}
    />
  )
}

/** The readout strip, with the change of each number for a second after it moves. */
function Readout({ view }: { view: LoopView }) {
  const deltas = useDeltas(Object.fromEntries(readoutItems(view).map((item) => [item.id, item.value])))
  return <LoopReadout view={view} deltas={deltas} />
}

/** How to play: the level's own line, then the round of one step. */
function HowTo({ levelId }: { levelId: LoopLevelId }) {
  return (
    <div className="flex flex-col gap-3" data-loop-howto="">
      <p>{LOOP_COPY[levelId].prompt}</p>
      <ol className="list-decimal pl-5">
        <li>Read the goal line: it says what to beat and when the level ends.</li>
        <li>Tap a request in the waiting queue to admit it into a free batch slot. Its slot&apos;s label names it.</li>
        <li>Press Step. The CPU schedules, the GPU runs one forward across every slot, and the CPU syncs to read the tokens back.</li>
        <li>Where the GPU waits for the CPU, the diagram draws a dashed box with its width: a bubble. Async scheduling, on the later levels, plans the next step while this one runs.</li>
        <li>The readout under the dock counts the steps, the tokens out, and the ticks the GPU was busy and idle.</li>
      </ol>
    </div>
  )
}
