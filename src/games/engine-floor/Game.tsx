import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { drawInBand, levelOf } from '@es/play'
import type { GameMode } from '@es/play'
import { FLOOR_COPY } from '@es/play/engine-floor/copy'
import { ENGINE_FLOOR } from '@es/play/engine-floor/entry'
import { floorSession } from '@es/play/engine-floor/session'
import type { FloorLevelId } from '@es/play/engine-floor/types'
import { ROSTER } from '@es/play/roster'
import type { Seed } from '@es/sim/core'
import { Button } from '@/design/components/Button'
import { LevelMenu } from '@/design/components/LevelMenu'
import { Frame } from '@/games/kit/Frame'
import type { GameProps } from '@/games/registry'
import { WorldCard } from './Card'
import { Controls, ReadoutStrip } from './Controls'
import { floorKit, partRows, ringOf } from './kit'
import { Mirror } from './Mirror'
import type { FloorRun } from './types'
import { FloorLegend, View2D, type RowTools } from './View2D'

// The result loads when a run ends, not before.
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))
/*
 * Request path (`engine-floor`, D-063): the learner traces one request. The page is the instrument frame (src/games/kit/Frame.tsx) around
 * the swimlane, the dock, the readout and the table (D-018: one session, drawn by every view). The frame owns the run and its action log;
 * this file wires Request path's parts into it, and the keys that are the game's: `R` runs the laid path and Backspace takes the last
 * stage off it.
 *
 * The levels are the practice run of GAMES.md §5: one engine's one idea each. A level opens in practice on its pinned seed, with undo. The
 * last, `map`, can also be graded: a graded run draws a seed when it starts, in band (GAMES.md §2.1), a fresh scenario of any of the five
 * engines, with no undo, no live readout and one run (ASSESSMENT §4.3). A page records the run through `onFinish`; inside a lesson the block
 * names the level, so the level menu and the next level are left out.
 */

const ROLE = ROSTER.find((entry) => entry.id === ENGINE_FLOOR.id)?.role ?? ''

const known = (id: string | undefined): string => ENGINE_FLOOR.levels.find((entry) => entry.id === id)?.id ?? ENGINE_FLOOR.levels[0].id

/** A fresh seed that this level's band accepts, from the browser's entropy: unseen, not secret (ASSESSMENT §4.1). */
const freshSeed = (level: string): Seed => drawInBand(floorSession, level, crypto.getRandomValues(new Uint32Array(1))[0])

/** The seed a graded run of a level starts on, drawn now; none for practice, or for a level that is not graded. */
function drawFor(level: string, mode: GameMode): { level: string; seed: Seed } | null {
  return mode === 'graded' && levelOf(ENGINE_FLOOR, level)?.graded ? { level, seed: freshSeed(level) } : null
}

export default function Game({ level, mode: asked = 'practice', placement = 'page', rev, onFinish }: GameProps) {
  const [prop, setProp] = useState({ level, mode: asked })
  const [levelId, setLevelId] = useState(() => known(level))
  const [mode, setMode] = useState<GameMode>(asked)
  const [drawn, setDrawn] = useState<{ level: string; seed: Seed } | null>(() => drawFor(known(level), asked))
  // A page that opens another level of the game, or the same one in another mode, gets it. (Adjusting state when a prop changes.)
  if (prop.level !== level || prop.mode !== asked) {
    setProp({ level, mode: asked })
    setLevelId(known(level))
    setMode(asked)
    setDrawn(drawFor(known(level), asked))
  }
  const embedded = placement === 'embed'
  const entry = levelOf(ENGINE_FLOOR, levelId) ?? ENGINE_FLOOR.levels[0]
  const at = ENGINE_FLOOR.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = embedded ? null : (ENGINE_FLOOR.levels[at + 1] ?? null)
  const graded = mode === 'graded' && entry.graded
  const seed = graded ? (drawn !== null && drawn.level === entry.id ? drawn.seed : entry.practiceSeed) : entry.practiceSeed

  function choose(next: string, nextMode: GameMode) {
    const target = levelOf(ENGINE_FLOOR, next) ?? ENGINE_FLOOR.levels[0]
    setLevelId(target.id)
    setMode(nextMode)
    setDrawn(drawFor(target.id, nextMode))
  }

  // Moving on replaces the page's content, and the control that was pressed goes with it: focus goes back to this game's own frame.
  const host = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    host.current?.querySelector<HTMLElement>('[data-game]')?.focus({ preventScroll: true })
  }, [levelId, mode, drawn])

  const menu = embedded ? undefined : (
    <LevelMenu
      label="Level"
      value={entry.id}
      levels={ENGINE_FLOOR.levels.map((candidate) => ({ id: candidate.id, title: candidate.title, mode: candidate.id === entry.id ? (graded ? 'graded' : 'practice') : candidate.graded ? 'graded' : 'practice' }))}
      onChange={(id) => {
        moved.current = true
        choose(id, 'practice')
      }}
    />
  )

  // Practice or a graded run, for the level that can be graded; a level that cannot says what practice is.
  const modeSwitch = (
    <>
      <span className="es-floor-mode" data-floor-mode={graded ? 'graded' : 'practice'}>
        {graded ? 'Graded: a fresh scenario, one run, no undo.' : entry.graded ? 'Practice: a pinned scenario, with undo. A graded run draws a fresh one.' : 'Practice: a pinned scenario, with undo.'}
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
      <FloorLevel
        key={`${entry.id}|${graded ? 'graded' : 'practice'}`}
        levelId={entry.id as FloorLevelId}
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
        onGraded={
          entry.graded
            ? () => {
                moved.current = true
                choose(entry.id, 'graded')
              }
            : null
        }
      />
    </div>
  )
}

interface LevelProps {
  levelId: FloorLevelId
  levelTitle: string
  seed: Seed
  mode: GameMode
  embedded: boolean
  rev: string | undefined
  onFinish: GameProps['onFinish']
  ledger: boolean
  menu: ReactNode
  modeSwitch: ReactNode
  next: { id: string; title: string } | null
  onNext: () => void
  onGraded: (() => void) | null
}

/** The tools a row's popover offers while the run is open: move a stage, or take the path back to it. */
const toolsOf = (run: FloorRun): RowTools | null =>
  run.done ? null : { move: (index, by) => run.dispatch({ t: 'move', from: index, by }), takeBack: (to) => run.dispatch({ t: 'unlay', to }) }

/** One level's frame. A new level starts it again. */
function FloorLevel({ levelId, levelTitle, seed, mode, embedded, rev, onFinish, ledger, menu, modeSwitch, next, onNext, onGraded }: LevelProps) {
  const copy = FLOOR_COPY[levelId]
  const kit = useCallback((at: number) => floorKit(levelId, at), [levelId])
  return (
    <Frame
      game={ENGINE_FLOOR}
      role={ROLE}
      session={floorSession}
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
      onCommand={(command, run) => {
        if (command === 'run' || command === 'step') {
          if (!run.view.canRun) return false
          run.dispatch({ t: 'run' })
          return true
        }
        if (command === 'unlay') {
          if (!run.view.canUnlay) return false
          run.dispatch({ t: 'unlay' })
          return true
        }
        return false
      }}
      goal={(run) => ({
        aim: copy.goal.aim,
        control: copy.goal.controls,
        target: copy.goal.beat,
        ends: copy.goal.ends,
        met: run.done ? (run.view.served ? 'The request reached the client.' : 'The run is over.') : undefined,
      })}
      diagram={(run) => <View2D run={run} tools={toolsOf(run)} />}
      legend={(run) => <FloorLegend view={run.view} />}
      dock={(run) => <Controls run={run} ring={ringOf(run.intro.ring)} />}
      readout={(run) => <ReadoutStrip view={run.view} mode={run.mode} />}
      result={(run, outcome) => (
        <Suspense fallback={<p role="status">Reading the run…</p>}>
          <Debrief run={run} outcome={outcome} next={next} onNext={onNext} onGraded={onGraded} embedded={embedded} />
        </Suspense>
      )}
      mirror={(run) => <Mirror run={run} />}
      parts={partRows(levelId)}
      howTo={<HowTo />}
      titleBlock={{ model: "Model of one request's path, after the pinned engines", clock: 'Clock: none; the model keeps the order of the stages only', leavesOut: <WorldCard /> }}
    />
  )
}

/** How to play: the round of one level. */
function HowTo() {
  return (
    <div className="flex flex-col gap-3" data-floor-howto="">
      <ol className="list-decimal pl-5">
        <li>Read the goal line: what to lay, and when the level ends.</li>
        <li>Predict first: how many process boundaries a sampled token crosses on its way to the client. The run answers it.</li>
        <li>Lay stages from the stage list, in order. Each one draws a row on the swimlane: a node where it lands and an arrow with its mechanism.</li>
        <li>Run the path. The request goes as far as each stage holds; the first that does not is marked stopped, and the dock says which rule it broke.</li>
        <li>Select a row&apos;s name to see its mechanism, its process and its source, or to move it. At the end, the dock shows your path beside another engine&apos;s.</li>
      </ol>
    </div>
  )
}
