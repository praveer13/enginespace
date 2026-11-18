import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { drawInBand, levelOf } from '@es/play'
import { POOL_COPY } from '@es/play/pool/copy'
import { POOL } from '@es/play/pool/entry'
import { poolSession } from '@es/play/pool/session'
import type { PoolLevelId, StationView } from '@es/play/pool/types'
import { ROSTER } from '@es/play/roster'
import { Button } from '@/design/components/Button'
import { LevelMenu } from '@/design/components/LevelMenu'
import { Frame } from '@/games/kit/Frame'
import type { GameView } from '@/games/kit/ViewSwitch'
import type { GameProps } from '@/games/registry'
import { CameraButtons } from '@/scene/CameraButtons'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { dumpOf, type Chosen, type Dump } from './dump'
import { groupNo } from './glyphs'
import { partRows, poolKit } from './kit'
import { Mirror } from './Mirror'
import { ReadoutStrip } from './ReadoutStrip'
import type { Scene3DProps } from './Scene3D'
import { DEFAULT_CAMERA, POOL_CAMERAS } from './scene-presets'
import type { PoolMode, PoolPick, PoolRun } from './types'
import { useWide } from './useWide'
import { PoolLegend, View2D } from './View2D'
import './pool.css'

// The result loads when a run ends, not before.
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))
// The 3D scene is its own chunk over three's (A§6.10): the Stage loads it only on a device whose tier draws 3D. The Stage itself loads
// only when the learner switches to 3D, since the diagram is the default view.
const Scene3D = lazy(() => import('./Scene3D'))
const PoolStage = lazy(() => import('./Stage3D'))
const Select3D = lazy(() => import('./Select3D'))

/** The scene as the Stage mounts it, inside the Stage's canvas box. */
function PoolScene(props: Scene3DProps) {
  return <Scene3D {...props} />
}

/*
 * KV page pool (`pool`, D-063): the learner is the KV allocator. The page is the instrument frame (src/games/kit/Frame.tsx) around the
 * pool's diagram, its dock, its readout and its table (D-018: one session, drawn by every view). The frame owns the run and its action
 * log; this file wires the pool's parts into it, and the keys that are the game's: `W` admits none (or loads no adapter) and `D` evicts the
 * pages chosen.
 *
 * The levels are GAMES.md §8's. Each is played in practice on its pinned seed, with undo and the cost of each eviction shown, and the
 * graded ones (`evict`, `adapters`, `manager`) can also be played as a graded run: a seed drawn when it starts, no undo, and no cost shown
 * (ASSESSMENT §4.3); a page that opens a level graded (a lesson's graded block) starts it on a seed drawn then. A run's result goes to the
 * page's `onFinish`. Inside a lesson the block names the level, so the level menu and the next level are left out.
 *
 * The diagram is the default view (REDESIGN §2.9). The 3D view is one switch away, unchanged: a Stage that paints the diagram first and
 * keeps it as the fallback (A§6.7). The session lives here, above both, so a swap keeps every decision.
 */

const ROLE = ROSTER.find((entry) => entry.id === POOL.id)?.role ?? ''

/** A fresh seed that this level's band accepts, from the browser's entropy: unseen, not secret (ASSESSMENT §4.1). */
function freshSeed(level: string): number {
  return drawInBand(poolSession, level, crypto.getRandomValues(new Uint32Array(1))[0])
}

/** The seed a graded run of a level starts on, drawn now; none for practice, or for a level that is not graded. */
function drawFor(level: string, mode: PoolMode): { level: string; seed: number } | null {
  return mode === 'graded' && levelOf(POOL, level)?.graded ? { level, seed: freshSeed(level) } : null
}

export default function Game({ level, mode: asked = 'practice', placement = 'page', rev, onFinish }: GameProps) {
  const known = (id: string | undefined) => POOL.levels.find((entry) => entry.id === id)?.id ?? POOL.levels[0].id
  const [prop, setProp] = useState({ level, mode: asked })
  const [levelId, setLevelId] = useState(() => known(level))
  const [mode, setMode] = useState<PoolMode>(asked)
  // A graded run draws its seed when it starts: in the handler that starts it, or when a page opens the level graded.
  const [drawn, setDrawn] = useState<{ level: string; seed: number } | null>(() => drawFor(known(level), asked))
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (prop.level !== level || prop.mode !== asked) {
    setProp({ level, mode: asked })
    setLevelId(known(level))
    setMode(asked)
    setDrawn(drawFor(known(level), asked))
  }
  const embedded = placement === 'embed'
  const entry = levelOf(POOL, levelId) ?? POOL.levels[0]
  const at = POOL.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = embedded ? null : (POOL.levels[at + 1] ?? null)
  const graded = mode === 'graded' && entry.graded
  const seed = graded ? (drawn !== null && drawn.level === entry.id ? drawn.seed : entry.practiceSeed) : entry.practiceSeed

  // The diagram is the default view; the learner's own choice wins from then on. 3D is offered where the device draws it.
  const device = useDeviceTier()
  const draws3d = device.known && device.tier >= 1
  const [view, setView] = useState<GameView>('2d')
  const [preset, setPreset] = useState<string>(DEFAULT_CAMERA)

  function choose(next: string, nextMode: PoolMode) {
    const target = levelOf(POOL, next) ?? POOL.levels[0]
    setLevelId(target.id)
    setMode(nextMode)
    setDrawn(drawFor(target.id, nextMode))
  }

  // Moving on replaces the page's content, and the control that was pressed may go with it: focus goes back to the game, this game's own,
  // found from its box, since a lesson can hold two of it.
  const host = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    host.current?.querySelector<HTMLElement>('[data-game]')?.focus({ preventScroll: true })
  }, [levelId, mode])

  const menu = embedded ? undefined : (
    <LevelMenu
      label="Level"
      value={entry.id}
      levels={POOL.levels.map((candidate) => ({ id: candidate.id, title: candidate.title, mode: candidate.id === entry.id ? (graded ? 'graded' : 'practice') : candidate.graded ? 'graded' : 'practice' }))}
      onChange={(id) => {
        moved.current = true
        choose(id, 'practice')
      }}
    />
  )

  // Practice or a graded run, for a level that can be graded; a level that cannot says what practice is.
  const modeSwitch = (
    <>
      <span className="es-pool__mode" data-pool-mode={graded ? 'graded' : 'practice'}>
        {graded ? 'Graded: a fresh seed, no undo, and no costs shown.' : entry.graded ? 'Practice: fixed numbers, undo, and the cost of each eviction.' : 'Practice: fixed numbers and undo.'}
      </span>
      {entry.graded ? (
        <Button
          size="sm"
          variant="plate"
          onClick={() => {
            moved.current = true
            choose(entry.id, graded ? 'practice' : 'graded')
          }}
        >
          {graded ? 'Back to practice' : 'Start a graded run'}
        </Button>
      ) : null}
    </>
  )

  return (
    <div ref={host} className="flex flex-col gap-6">
      <PoolLevel
        key={`${entry.id}|${graded ? 'graded' : 'practice'}`}
        levelId={entry.id as PoolLevelId}
        levelTitle={entry.title}
        seed={seed}
        mode={graded ? 'graded' : 'practice'}
        embedded={embedded}
        rev={rev}
        onFinish={onFinish}
        ledger={onFinish !== undefined}
        menu={menu}
        modeSwitch={modeSwitch}
        next={after === null ? null : { id: after.id, title: after.title }}
        onNext={() => {
          if (after === null) return
          moved.current = true
          choose(after.id, 'practice')
        }}
        scene={{ view, onView: setView, allow3d: draws3d, unavailable3d: device.known && !draws3d ? unavailableReason(device.reason) : undefined, preset, onPreset: setPreset }}
      />
    </div>
  )
}

interface LevelProps {
  levelId: PoolLevelId
  levelTitle: string
  seed: number
  mode: PoolMode
  embedded: boolean
  rev: string | undefined
  onFinish: GameProps['onFinish']
  /** Whether the page records runs, and so has a ledger to read. */
  ledger: boolean
  menu: ReactNode
  modeSwitch: ReactNode
  next: { id: string; title: string } | null
  onNext: () => void
  /** The page's view and the camera's preset, which outlive a level. */
  scene: {
    view: GameView
    onView: (view: GameView) => void
    allow3d: boolean
    unavailable3d: string | undefined
    preset: string
    onPreset: (preset: string) => void
  }
}

/** One level's frame. Its state (the pages chosen, the pointer) is the page's, and a new level starts it again. */
function PoolLevel({ levelId, levelTitle, seed, mode, embedded, rev, onFinish, ledger, menu, modeSwitch, next, onNext, scene }: LevelProps) {
  const [pointed, setPointed] = useState<readonly number[]>([])
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [station, setStation] = useState(0)
  // What the 3D view shows of the pool: a page's fan or a request's threads. The page holds it, so a swap of views keeps it.
  const [pick, setPick] = useState<PoolPick | null>(null)
  const wide = useWide()
  const { view, preset, onPreset } = scene
  const copy = POOL_COPY[levelId]
  const dumpFor = (run: PoolRun): Dump => dumpOf(run.view, chosen, setChosen)
  const kit = useCallback((at: number) => poolKit(levelId, at), [levelId])
  return (
    <Frame
      game={POOL}
      role={ROLE}
      session={poolSession}
      level={levelId}
      levelTitle={levelTitle}
      seed={seed}
      mode={mode}
      rev={rev}
      embedded={embedded}
      onFinish={onFinish}
      ledger={ledger}
      kit={kit}
      menu={menu}
      modeSwitch={modeSwitch}
      allow3d={scene.allow3d}
      unavailable3d={scene.unavailable3d}
      // On a phone the rack's 44 cells and its threads do not read at the box's size: the pool is drawn in 2D there.
      phone3d={false}
      view={view}
      onViewChange={scene.onView}
      onCommand={(command, run) => {
        const ask = run.view.ask
        if (command === 'wait') {
          if (ask?.kind === 'admit') run.dispatch({ t: 'admit', req: null })
          else if (ask?.kind === 'prefetch') run.dispatch({ t: 'prefetch', adapter: null })
          else return false
          return true
        }
        if (command === 'dump') {
          const dump = dumpFor(run)
          if (ask?.kind !== 'evict' || !dump.ready) return false
          run.dispatch({ t: 'evict', pages: [...dump.pages].sort((a, b) => a - b) })
          return true
        }
        if (command === 'camera') {
          if (view !== '3d') return false
          const at = POOL_CAMERAS.findIndex((camera) => camera.id === preset)
          const camera = POOL_CAMERAS[(at + 1) % POOL_CAMERAS.length]
          onPreset(camera.id)
          run.announce(`Camera: ${camera.label}.`)
          return true
        }
        return false
      }}
      goal={(run) => ({
        aim: copy.goal.aim,
        control: copy.goal.controls,
        target: copy.goal.beat,
        ends: copy.goal.ends,
        met: run.done ? (run.view.incomplete ? 'The run ended with requests unserved.' : 'Every request is served.') : undefined,
      })}
      diagram={(run) => <View2D run={run} dump={dumpFor(run)} pointed={pointed} pick={wide} />}
      scene3d={(run) => (
        <Suspense fallback={<View2D run={run} dump={dumpFor(run)} pointed={pointed} pick={wide} />}>
          <PoolStage
            run={run}
            dump={dumpFor(run)}
            preset={preset}
            station={Math.min(station, run.view.stations.length - 1)}
            pointed={pointed}
            pick={pick}
            onPick={(next) => setPick(next)}
            diagram={<View2D run={run} dump={dumpFor(run)} pointed={[]} pick={wide} />}
            scene={PoolScene}
          />
        </Suspense>
      )}
      legend={(run) =>
        view === '3d' ? (
          <div className="es-pool__cameras">
            <Cameras preset={preset} onPreset={onPreset} stations={run.view.stations} station={station} onStation={setStation} />
            <Suspense fallback={null}>
              <Select3D view={run.view} pick={pick} station={preset === 'station' ? Math.min(station, run.view.stations.length - 1) : null} onPick={setPick} />
            </Suspense>
            {/* One legend: the diagram's own, since the scene draws each page's glyph as the diagram does. */}
            <PoolLegend view={run.view} />
          </div>
        ) : (
          <PoolLegend view={run.view} />
        )
      }
      dock={(run) => <Controls run={run} dump={dumpFor(run)} mode={mode} onPoint={setPointed} />}
      readout={(run) => <ReadoutStrip view={run.view} />}
      result={(run, outcome) => (
        <Suspense fallback={<p role="status">Reading the run…</p>}>
          <Debrief run={run} outcome={outcome} next={next} onNext={onNext} embedded={embedded} />
        </Suspense>
      )}
      mirror={(run) => <Mirror run={run} />}
      parts={partRows(levelId)}
      howTo={<HowTo levelId={levelId} />}
      titleBlock={{ model: 'Model of a KV page pool, after vLLM v0.33.0', clock: 'Clock: engine steps, synthetic', leavesOut: <WorldCard /> }}
    />
  )
}

/** How to play: the level's own opening line, then the round of one step. */
function HowTo({ levelId }: { levelId: PoolLevelId }) {
  return (
    <div className="flex flex-col gap-3" data-pool-howto="">
      <p>{POOL_COPY[levelId].prompt}</p>
      <ol className="list-decimal pl-5">
        <li>Read the goal line: it says what to beat and when the level ends.</li>
        <li>Guess first, if you like: the run answers it. Or skip the guess.</li>
        <li>Each step, the dock asks for one decision: admit a waiting request, choose the cached pages to evict, preempt a request, or load an adapter.</li>
        <li>Point at a row in the dock to see its pages ringed on the diagram. The readout strip under the dock counts what each decision cost.</li>
        <li>At the end, the dock shows your result beside the reference run&apos;s.</li>
      </ol>
    </div>
  )
}

/** The camera's presets, and under One KV group the group it shows. */
function Cameras({ preset, onPreset, stations, station, onStation }: { preset: string; onPreset: (preset: string) => void; stations: readonly StationView[]; station: number; onStation: (station: number) => void }) {
  const shown = Math.min(station, stations.length - 1)
  return (
    <div className="flex flex-col gap-3">
      <CameraButtons presets={POOL_CAMERAS} value={preset} onChange={onPreset} label="Camera on the page pool" />
      {preset === 'station' ? (
        <div role="group" aria-label="The KV group shown" className="es-camera-buttons">
          {stations.map((candidate) => (
            <Button key={candidate.id} size="sm" variant={candidate.index === shown ? 'ink' : 'plate'} aria-pressed={candidate.index === shown} onClick={() => onStation(candidate.index)}>
              {groupNo(candidate)} {candidate.id}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
