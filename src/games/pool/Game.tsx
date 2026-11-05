import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { drawInBand, levelOf } from '@es/play'
import { POOL } from '@es/play/pool/entry'
import { poolSession } from '@es/play/pool/session'
import type { StationView } from '@es/play/pool/types'
import { Button } from '@/design/components/Button'
import { Glyph } from '@/design/components/Glyph'
import { GameShell } from '@/games/kit/GameShell'
import type { GameView } from '@/games/kit/ViewSwitch'
import type { GameProps } from '@/games/registry'
import { CameraButtons } from '@/scene/CameraButtons'
import { Stage } from '@/scene/Stage'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { Mirror } from './Mirror'
import type { Scene3DProps } from './Scene3D'
import { DEFAULT_CAMERA, POOL_CAMERAS } from './scene-presets'
import type { PoolMode, PoolRun } from './types'
import { dumpOf, type Chosen, type Dump } from './dump'
import { stationGlyph } from './glyphs'
import { useWide } from './useWide'
import { View2D } from './View2D'
import './reach-in.css'

// The debrief is the stage after the run: its comparisons load when a run ends, not before.
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))
// The 3D scene is its own chunk over three's (A§6.10): the Stage loads it only on a device whose tier draws 3D.
const Scene3D = lazy(() => import('./Scene3D'))

/** The scene as the Stage mounts it, inside the Stage's canvas box. */
function PoolScene(props: Scene3DProps) {
  return <Scene3D {...props} />
}

/*
 * The Reach-In, the KV pool game (`pool`, D-049: "The Reach-In", hybrid KV pages and adapters). Its page is Play → Debrief, around the 2D
 * view, the controls and the mirror (D-018: one session, drawn by every view). The shell owns the run and its action log; this file wires
 * the Reach-In's parts into it, and the keys that are the game's: `W` hangs none (or brings no kit in) and `D` dumps the pans chosen.
 *
 * The levels are GAMES.md §8's. Each is played in practice on its pinned seed, with undo and the price of a dump printed, and the graded
 * ones (`evict`, `adapters`, `manager`) can also be played as a graded run: a seed drawn when it starts, no undo, and no price printed
 * (ASSESSMENT §4.3). A graded run's result goes to a page that passes `onFinish`; this one records nothing itself.
 *
 * The 3D view (W1-T24) is the reach-in in the middle of service, in a Stage that paints the 2D view first and keeps it as the fallback
 * (A§6.7), and it leads the page: the shell's `stage` layout sets the controls beside it. It opens on its own on a device whose tier draws
 * 3D, and `V` or the switch swaps the two views; the session lives here, above both, so a swap keeps every decision. The camera's preset
 * lives here too: `C` and the plates move it, in 3D only, and One station shows the station the page's own buttons pick.
 */

const MODES: readonly { mode: PoolMode; label: string }[] = [
  { mode: 'practice', label: 'Practice' },
  { mode: 'graded', label: 'Graded' },
]

/** A fresh seed that this level's band accepts, from the browser's entropy: unseen, not secret (ASSESSMENT §4.1). */
function freshSeed(level: string): number {
  return drawInBand(poolSession, level, crypto.getRandomValues(new Uint32Array(1))[0])
}

export default function Game({ level, mode: asked = 'practice', placement = 'page', rev, onFinish }: GameProps) {
  const known = (id: string | undefined) => POOL.levels.find((entry) => entry.id === id)?.id ?? POOL.levels[0].id
  const [prop, setProp] = useState({ level, mode: asked })
  const [levelId, setLevelId] = useState(() => known(level))
  const [mode, setMode] = useState<PoolMode>(asked)
  // A graded run draws its seed when it starts; it is drawn in the handler that starts it, because a render reads no entropy.
  const [drawn, setDrawn] = useState<{ level: string; seed: number } | null>(null)
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (prop.level !== level || prop.mode !== asked) {
    setProp({ level, mode: asked })
    setLevelId(known(level))
    setMode(asked)
    setDrawn(null)
  }
  const entry = levelOf(POOL, levelId) ?? POOL.levels[0]
  const at = POOL.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = POOL.levels[at + 1] ?? null
  const graded = mode === 'graded' && entry.graded
  const wide = useWide()
  const seed = graded ? (drawn !== null && drawn.level === entry.id ? drawn.seed : entry.practiceSeed) : entry.practiceSeed

  // 3D opens by itself where the device draws it, and a learner's own choice of view wins from then on. Under `saveData` the Stage
  // waits to be asked, so the page opens on the 2D view there.
  const device = useDeviceTier()
  const draws3d = device.known && device.tier >= 1
  const [chosenView, setChosenView] = useState<GameView | null>(null)
  const view: GameView = chosenView ?? (draws3d && device.hints?.saveData !== true ? '3d' : '2d')
  const [preset, setPreset] = useState<string>(DEFAULT_CAMERA)

  function choose(next: string, nextMode: PoolMode) {
    const target = levelOf(POOL, next) ?? POOL.levels[0]
    setLevelId(target.id)
    setMode(nextMode)
    setDrawn(nextMode === 'graded' && target.graded ? { level: target.id, seed: freshSeed(target.id) } : null)
  }

  // Moving on replaces the page's content, and the button that was pressed goes with it: focus goes back to the game.
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    document.querySelector<HTMLElement>(`[data-game="${POOL.id}"]`)?.focus({ preventScroll: true })
  }, [levelId, mode])

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Levels of The Reach-In">
        <details open={wide || undefined} className="es-levels">
          <summary className="es-levels__summary cursor-pointer font-bold">
            Level: {entry.title} · {graded ? 'graded' : 'practice'}
          </summary>
          <div className="flex flex-col gap-3 pt-3">
            <ol className="flex flex-wrap gap-2">
              {POOL.levels.map((candidate) => (
                <li key={candidate.id}>
                  <Button
                    size="sm"
                    variant={candidate.id === entry.id ? 'ink' : 'quiet'}
                    aria-current={candidate.id === entry.id ? 'step' : undefined}
                    onClick={() => {
                      moved.current = true
                      choose(candidate.id, 'practice')
                    }}
                  >
                    {candidate.title}
                    {candidate.graded ? <span className="sr-only"> (graded level)</span> : null}
                  </Button>
                </li>
              ))}
            </ol>
            {entry.graded ? (
              <div role="group" aria-label="How to play this level" className="flex flex-wrap items-center gap-2">
                {MODES.map((candidate) => (
                  <Button
                    key={candidate.mode}
                    size="sm"
                    variant={candidate.mode === (graded ? 'graded' : 'practice') ? 'ink' : 'plate'}
                    aria-pressed={candidate.mode === (graded ? 'graded' : 'practice')}
                    onClick={() => {
                      moved.current = true
                      choose(entry.id, candidate.mode)
                    }}
                  >
                    {candidate.label}
                  </Button>
                ))}
                <span className="text-text-2">{graded ? 'A fresh seed, no undo, and no price printed for a dump.' : 'The pinned seed, with undo and the price of each dump.'}</span>
              </div>
            ) : null}
          </div>
        </details>
      </nav>
      <PoolShell
        key={`${entry.id}|${graded ? 'graded' : 'practice'}`}
        levelId={entry.id}
        levelTitle={entry.title}
        seed={seed}
        mode={graded ? 'graded' : 'practice'}
        headingLevel={placement === 'embed' ? 3 : 2}
        rev={rev}
        onFinish={onFinish}
        next={after === null ? null : { id: after.id, title: after.title }}
        onNext={() => {
          if (after === null) return
          moved.current = true
          choose(after.id, 'practice')
        }}
        scene={{ view, onView: setChosenView, allow3d: draws3d, unavailable3d: device.known && !draws3d ? unavailableReason(device.reason) : undefined, preset, onPreset: setPreset }}
      />
    </div>
  )
}

interface ShellProps {
  levelId: string
  levelTitle: string
  seed: number
  mode: PoolMode
  headingLevel: 2 | 3
  rev: string | undefined
  onFinish: GameProps['onFinish']
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

/** One level's page. Its state (the pans chosen, the pointer) is the page's, and a new level starts it again. */
function PoolShell({ levelId, levelTitle, seed, mode, headingLevel, rev, onFinish, next, onNext, scene }: ShellProps) {
  const [pointed, setPointed] = useState<readonly number[]>([])
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [station, setStation] = useState(0)
  const wide = useWide()
  const { view, preset, onPreset } = scene
  return (
    <GameShell
      game={POOL}
      session={poolSession}
      level={levelId}
      levelTitle={levelTitle}
      seed={seed}
      mode={mode}
      rev={rev}
      headingLevel={headingLevel}
      onFinish={onFinish}
      onCommand={(command, run) => {
        const ask = run.view.ask
        if (command === 'wait') {
          if (ask?.kind === 'admit') run.dispatch({ t: 'admit', req: null })
          else if (ask?.kind === 'prefetch') run.dispatch({ t: 'prefetch', adapter: null })
          else return false
          return true
        }
        if (command === 'dump') {
          const dump = dumpOf(run.view, chosen, setChosen)
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
      stage
      allow3d={scene.allow3d}
      unavailable3d={scene.unavailable3d}
      view={view}
      onViewChange={scene.onView}
      view2d={(run) => <View2D run={run} dump={dumpOf(run.view, chosen, setChosen)} pointed={pointed} pick={wide} />}
      scene3d={(run) => <PoolStage run={run} dump={dumpOf(run.view, chosen, setChosen)} preset={preset} station={Math.min(station, run.view.stations.length - 1)} pick={wide} />}
      controls={(run) => (
        <>
          {view === '3d' ? <Cameras preset={preset} onPreset={onPreset} stations={run.view.stations} station={station} onStation={setStation} /> : null}
          <Controls run={run} dump={dumpOf(run.view, chosen, setChosen)} mode={mode} onPoint={setPointed} />
        </>
      )}
      mirror={(run) => <Mirror run={run} />}
      debrief={(run, outcome) => (
        <Suspense fallback={<p role="status">Printing the debrief…</p>}>
          <Debrief run={run} outcome={outcome} next={next} onNext={onNext} />
        </Suspense>
      )}
      card={<WorldCard />}
    />
  )
}

/** The camera's plates, and under One station the station it shows: each station's glyph and name, as the 2D key draws them. */
function Cameras({ preset, onPreset, stations, station, onStation }: { preset: string; onPreset: (preset: string) => void; stations: readonly StationView[]; station: number; onStation: (station: number) => void }) {
  const shown = Math.min(station, stations.length - 1)
  return (
    <div className="flex flex-col gap-3">
      <CameraButtons presets={POOL_CAMERAS} value={preset} onChange={onPreset} label="Camera on the reach-in" />
      {preset === 'station' ? (
        <div role="group" aria-label="The station shown" className="es-camera-buttons">
          {stations.map((candidate) => (
            <Button key={candidate.id} size="sm" variant={candidate.index === shown ? 'ink' : 'plate'} aria-pressed={candidate.index === shown} onClick={() => onStation(candidate.index)}>
              <Glyph shape={stationGlyph(candidate)} />
              {candidate.id}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The scene's box, as Service's: about the pass's 16:10 in the first screen, and on a phone 55% of the screen's height, at least 300 px
 * [estimated]. The 2D view is its first paint and its fallback, and scrolls inside the box, because the cabinet drawn flat is taller: a
 * region that the keyboard can reach and scroll.
 */
const STAGE_BOX = 'h-[clamp(20rem,min(62svh,46vw),46rem)] max-[479px]:h-[max(18.75rem,55svh)]'

/** The 3D view's box: the Stage, with the 2D view as its first paint and its fallback, and the reach-in behind it. */
function PoolStage({ run, dump, preset, station, pick }: { run: PoolRun; dump: Dump; preset: string; station: number; pick: boolean }) {
  return (
    <Stage
      id="pool"
      className={`${STAGE_BOX} border border-edge shadow-shelf`}
      view2d={
        <div role="region" aria-label="The reach-in, drawn flat" tabIndex={0} className="h-full overflow-y-auto p-3">
          <View2D run={run} dump={dump} pointed={[]} pick={pick} />
        </div>
      }
      scene={PoolScene}
      sceneProps={{ view: run.view, preset, station, chosen: dump.pages }}
      announce={run.announce}
    />
  )
}
