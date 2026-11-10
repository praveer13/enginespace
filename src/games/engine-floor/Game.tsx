import { lazy, useEffect, useMemo, useRef, useState } from 'react'
import { drawInBand, levelOf } from '@es/play'
import type { GameMode } from '@es/play'
import { ENGINE_FLOOR } from '@es/play/engine-floor/entry'
import { floorSession } from '@es/play/engine-floor/session'
import type { Seed } from '@es/sim/core'
import { GameShell } from '@/games/kit/GameShell'
import type { GameView } from '@/games/kit/ViewSwitch'
import type { GameProps } from '@/games/registry'
import { CameraButtons } from '@/scene/CameraButtons'
import { Stage } from '@/scene/Stage'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { Debrief } from './Debrief'
import { GradedBar, LevelList } from './LevelRail'
import { Mirror } from './Mirror'
import type { Scene3DProps } from './Scene3D'
import { sceneModelOf } from './scene-presets'
import { DEFAULT_STOP, floorsOf, nextStop, stopsOf, type CameraStop } from './scene-stops'
import type { FloorRun } from './types'
import { View2D } from './View2D'

// The 3D scene is its own chunk over three's (A§6.10): the Stage loads it only on a device whose tier draws 3D.
const Scene3D = lazy(() => import('./Scene3D'))

/** The scene as the Stage mounts it, inside the Stage's canvas box. */
function FloorScene(props: Scene3DProps) {
  return <Scene3D {...props} />
}

/*
 * Back of House (`engine-floor`, D-049: "Back of House", a request's lifecycle). Its page is Play → Debrief, around the 2D view, the
 * controls and the mirror (D-018: one session, drawn by every view). The shell owns the run and its action log; this file wires Back of
 * House's parts into it, and the keys that are its own: `R` runs the laid path and Backspace takes the last stage off it.
 *
 * The levels are the practice run of GAMES.md §5: one engine's one idea each, in the order of its difficulty. A level opens in practice on
 * its pinned seed, and a finished level offers the next. The last, `map`, can also be graded: a graded run draws a seed when it starts,
 * in band (GAMES.md §2.1), which is a fresh scenario of any of the five engines, with no undo and one run (W1-T19; ASSESSMENT §4.3).
 * Whether a page records the run is its own business: the game's page and a lesson's block each pass the recorder as `onFinish`
 * (src/games/kit/record.ts, W1b-T01). Inside a lesson the block names the level, so the rail of levels and the next level are left out.
 *
 * The 3D view (W1-T18) is the house in cutaway, in a Stage that paints the 2D house first and keeps it as the fallback (A§6.7). It opens on
 * its own on a device whose tier draws 3D, and leads the page with the controls beside it; `V` or the switch swaps the two views, and the
 * session lives here, above both, so a swap keeps the prediction, the path and the runs. The camera's stop lives here too: `C` and the
 * stop buttons move it, in 3D only, and a run sent from the cutaway takes the follow. On a wide screen the 3D view and its switches stay
 * in sight while the controls run on down the page (GameShell's sticky stage), so a run sent from the stub far down the column plays where
 * it is seen. The 2D view stays a first-class path to the whole concept (A§6.2).
 *
 * The debrief is imported with the game and not on demand. It draws with the same parts as the 2D view, so a chunk of its own would take
 * them out of the game's chunk, and `verify:bundle` finds a game by the chunk that Game.tsx opens: that chunk must hold the game whole.
 * (The trace viewer in a graded run's debrief is the exception, and it is a chunk of its own: it shares nothing with the game that the
 * game would then have to export.)
 */

interface Attempt {
  readonly level: string
  readonly mode: GameMode
  readonly seed: Seed
}

const known = (id: string | undefined): string => ENGINE_FLOOR.levels.find((entry) => entry.id === id)?.id ?? ENGINE_FLOOR.levels[0].id
const fresh = (): Seed => crypto.getRandomValues(new Uint32Array(1))[0]
const practice = (id: string): Attempt => ({ level: id, mode: 'practice', seed: levelOf(ENGINE_FLOOR, id)?.practiceSeed ?? 0 })
/** A graded run: a seed drawn at the start, in band, and stamped unseen by whoever records it (ARCHITECTURE §8.2). */
const graded = (id: string): Attempt => ({ level: id, mode: 'graded', seed: drawInBand(floorSession, id, fresh()) })

const startOf = (id: string, mode: GameMode | undefined): Attempt => (mode === 'graded' && levelOf(ENGINE_FLOOR, id)?.graded ? graded(id) : practice(id))

const run = (r: FloorRun): boolean => {
  if (!r.view.canRun) return false
  r.dispatch({ t: 'run' })
  return true
}

export default function Game({ level, mode, placement = 'page', rev, onFinish }: GameProps) {
  // 3D opens by itself where the device draws it, and a learner's own choice of view wins from then on. Under `saveData` the Stage waits
  // to be asked, so the page opens on the 2D view there.
  const device = useDeviceTier()
  const draws3d = device.known && device.tier >= 1
  const [chosenView, setChosenView] = useState<GameView | null>(null)
  const view: GameView = chosenView ?? (draws3d && device.hints?.saveData !== true ? '3d' : '2d')
  const unavailable3d = device.known && !draws3d ? unavailableReason(device.reason) : undefined
  const [stop, setStop] = useState<CameraStop>(DEFAULT_STOP)

  const [asked, setAsked] = useState({ level, mode })
  const [attempt, setAttempt] = useState<Attempt>(() => startOf(known(level), mode))
  // A page that opens another level of the game, or the same one in another mode, gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked.level || mode !== asked.mode) {
    setAsked({ level, mode })
    setAttempt(startOf(known(level), mode))
  }
  // Moving to another level or another attempt replaces the page's content, and the button that was pressed goes with it: focus goes back to
  // the game. This game's own, found from its box, since a lesson can hold two of it.
  const host = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    host.current?.querySelector<HTMLElement>('[data-game]')?.focus({ preventScroll: true })
  }, [attempt])
  const go = (next: Attempt) => {
    moved.current = true
    setAttempt(next)
  }

  const embedded = placement === 'embed'
  const entry = levelOf(ENGINE_FLOOR, attempt.level) ?? ENGINE_FLOOR.levels[0]
  const at = ENGINE_FLOOR.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = embedded ? null : (ENGINE_FLOOR.levels[at + 1] ?? null)

  return (
    <div ref={host} className="contents">
      <GameShell
        game={ENGINE_FLOOR}
        session={floorSession}
        level={entry.id}
        levelTitle={entry.title}
        seed={attempt.seed}
        mode={attempt.mode}
        rev={rev}
        headingLevel={embedded ? 3 : 2}
        embedded={embedded}
        onFinish={onFinish}
        allow3d={draws3d}
        unavailable3d={unavailable3d}
        view={view}
        onViewChange={setChosenView}
        stage="sticky"
        onCommand={(command, r) => {
          if (command === 'run' || command === 'step') return run(r)
          if (command === 'unlay') {
            if (!r.view.canUnlay) return false
            r.dispatch({ t: 'unlay' })
            return true
          }
          if (command === 'camera') {
            if (view !== '3d') return false
            const stops = stopsOf(floorsOf(r.view))
            const next = nextStop(stops, stop)
            setStop(next)
            r.announce(`Camera: ${stops.find((candidate) => candidate.id === next)?.label ?? 'Cutaway'}.`)
            return true
          }
          return false
        }}
        view2d={(r) => <View2D run={r} />}
        scene3d={(r) => <FloorStage run={r} stop={stop} onStop={setStop} />}
        controls={(r) => (
          <>
            {view === '3d' ? <Stops run={r} stop={stop} onStop={setStop} /> : null}
            <Controls
              run={r}
              top={<GradedBar entry={entry} mode={attempt.mode} done={r.done} onGraded={() => go(graded(entry.id))} onPractice={() => go(practice(entry.id))} />}
              rail={embedded ? undefined : <LevelList levels={ENGINE_FLOOR.levels} current={entry.id} onLevel={(id) => go(practice(id))} />}
            />
          </>
        )}
        mirror={(r) => <Mirror run={r} />}
        debrief={(r, outcome) => (
          <Debrief
            run={r}
            outcome={outcome}
            next={after === null ? null : { id: after.id, title: after.title }}
            onNext={() => after !== null && go(practice(after.id))}
            onGraded={entry.graded ? () => go(graded(entry.id)) : null}
            onPractice={() => go(practice(entry.id))}
          />
        )}
        card={<WorldCard />}
      />
    </div>
  )
}

/** The camera's stops for the house the view stands in: the cutaway, one for each storey, and the ticket followed. */
function Stops({ run, stop, onStop }: { run: FloorRun; stop: CameraStop; onStop: (stop: CameraStop) => void }) {
  const stops = useMemo(() => stopsOf(floorsOf(run.view)), [run.view])
  return <CameraButtons presets={stops} value={stops.some((candidate) => candidate.id === stop) ? stop : 'cutaway'} onChange={(id) => onStop(id as CameraStop)} label="Camera on the house" />
}

/**
 * The 3D view's box: the Stage, with the 2D house as its first paint and its fallback (scrolling in the box where it runs longer than the
 * box), and the scene behind it. The house is taller than it is wide, so the box is too, about the first screen's height: 70% of it at a
 * laptop's width and 58% on a phone, at least 20rem [estimated].
 */
const STAGE_BOX = 'h-[clamp(20rem,min(70svh,52vw),48rem)] max-[479px]:h-[max(20rem,58svh)]'

function FloorStage({ run, stop, onStop }: { run: FloorRun; stop: CameraStop; onStop: (stop: CameraStop) => void }) {
  // The scene's model is laid out here, from the view, and its house is kept while the plan stays the same (scene-presets.ts).
  const [model, setModel] = useState(() => sceneModelOf(run.view))
  const [seen, setSeen] = useState(run.view)
  if (seen !== run.view) {
    setSeen(run.view)
    setModel(sceneModelOf(run.view, model))
  }
  // A run sent from the cutaway takes the follow, close on the ticket, so its way and where it stops are seen (cut to, under reduced motion).
  const runs = run.view.runs
  const ran = useRef(runs)
  useEffect(() => {
    if (runs > ran.current && stop === 'cutaway') onStop('follow')
    ran.current = runs
  }, [runs, stop, onStop])
  return (
    <Stage
      id="engine-floor"
      className={`${STAGE_BOX} border border-edge shadow-shelf`}
      view2d={
        <div className="h-full overflow-y-auto p-3">
          <View2D run={run} />
        </div>
      }
      scene={FloorScene}
      sceneProps={{ view: run.view, model, stop }}
      announce={run.announce}
    />
  )
}
