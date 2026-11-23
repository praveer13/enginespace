import { lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { drawInBand, levelOf } from '@es/play'
import { copyOf, fewestPracticeGoal } from '@es/play/shape-shifter/copy'
import { SHAPE_SHIFTER } from '@es/play/shape-shifter/entry'
import { shiftLevel, shiftSession } from '@es/play/shape-shifter/session'
import type { ShiftLevelId } from '@es/play/shape-shifter/types'
import { ROSTER } from '@es/play/roster'
import { Button } from '@/design/components/Button'
import { LevelMenu } from '@/design/components/LevelMenu'
import { Frame } from '@/games/kit/Frame'
import type { GameProps } from '@/games/registry'
import { ProveContext } from '@/prove/context'
import { WorldCard } from './Card'
import { Words } from './CodeWords'
import { Controls } from './Controls'
import { keyAction } from './focus'
import { guardPresses, keepDock, seatDrawing, showGoalAtResult, showNamedParts } from './hand'
import { shiftKit, partRows } from './kit'
import { Mirror } from './Mirror'
import { ReadoutStrip } from './ReadoutStrip'
import type { ShiftMode, ShiftPick } from './types'
import { ShiftLegend, View2D } from './View2D'
import './shape-shifter.css'

// The result loads when a run ends, not before.
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))

/*
 * Tensor views (`shape-shifter`, GAMES.md §4): the learner plans the reshape. The page is the instrument frame (src/games/kit/Frame.tsx)
 * around the tensor's diagram, its dock, its readout and its table (D-018: one session, drawn by every view). The frame owns the run and
 * its action log; this file wires Tensor views' parts into it, and the keys that are the game's: `L` launches the grid and `U` undoes in
 * practice.
 *
 * The levels are GAMES.md §4.3's. Each is played in practice on its pinned seed, with undo; `fewest` and `grid` are graded, and a graded
 * run draws its seed when it starts and has no undo (ASSESSMENT §4.3). `fewest` is the module's Prove level: `?mode=prove` on the game's
 * page opens it in Prove mode (src/prove), and the frame's foot offers the way in. The game is 2D only (GAMES.md §4.2).
 */

const ROLE = ROSTER.find((entry) => entry.id === SHAPE_SHIFTER.id)?.role ?? ''

/** A fresh seed that this level's band accepts, from the browser's entropy: unseen, not secret (ASSESSMENT §4.1). */
function freshSeed(level: string): number {
  return drawInBand(shiftSession, level, crypto.getRandomValues(new Uint32Array(1))[0])
}

/** The seed a graded run of a level starts on, drawn now; none for practice, or for a level that is not graded. */
function drawFor(level: string, mode: ShiftMode): { level: string; seed: number } | null {
  return mode === 'graded' && levelOf(SHAPE_SHIFTER, level)?.graded ? { level, seed: freshSeed(level) } : null
}

export default function Game({ level, mode: asked = 'practice', placement = 'page', rev, onFinish }: GameProps) {
  const known = (id: string | undefined) => SHAPE_SHIFTER.levels.find((entry) => entry.id === id)?.id ?? SHAPE_SHIFTER.levels[0].id
  const [prop, setProp] = useState({ level, mode: asked })
  const [levelId, setLevelId] = useState(() => known(level))
  const [mode, setMode] = useState<ShiftMode>(asked)
  const [drawn, setDrawn] = useState<{ level: string; seed: number } | null>(() => drawFor(known(level), asked))
  if (prop.level !== level || prop.mode !== asked) {
    setProp({ level, mode: asked })
    setLevelId(known(level))
    setMode(asked)
    setDrawn(drawFor(known(level), asked))
  }
  const embedded = placement === 'embed'
  // In a Prove run (src/prove) the way on is Leave Prove mode: a Next level would play a level that is not the Prove level, outside the attestation.
  const proving = useContext(ProveContext) !== null
  const entry = levelOf(SHAPE_SHIFTER, levelId) ?? SHAPE_SHIFTER.levels[0]
  const at = SHAPE_SHIFTER.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = embedded || proving ? null : (SHAPE_SHIFTER.levels[at + 1] ?? null)
  const graded = mode === 'graded' && entry.graded
  const seed = graded ? (drawn !== null && drawn.level === entry.id ? drawn.seed : entry.practiceSeed) : entry.practiceSeed

  function choose(next: string, nextMode: ShiftMode) {
    const target = levelOf(SHAPE_SHIFTER, next) ?? SHAPE_SHIFTER.levels[0]
    setLevelId(target.id)
    setMode(nextMode)
    setDrawn(drawFor(target.id, nextMode))
  }

  // Moving on replaces the page's content, and the control that was pressed may go with it: focus goes back to the game.
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
      levels={SHAPE_SHIFTER.levels.map((candidate) => ({ id: candidate.id, title: candidate.title, mode: candidate.id === entry.id ? (graded ? 'graded' : 'practice') : candidate.graded ? 'graded' : 'practice' }))}
      onChange={(id) => {
        moved.current = true
        choose(id, 'practice')
      }}
    />
  )

  const modeSwitch = (
    <>
      <span className="es-shift__mode" data-shift-mode={graded ? 'graded' : 'practice'}>
        {graded ? 'Graded: fresh numbers, no undo.' : 'Practice: fixed numbers and undo.'}
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
      <ShiftLevel
        key={`${entry.id}|${graded ? 'graded' : 'practice'}`}
        levelId={entry.id as ShiftLevelId}
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
      />
    </div>
  )
}

interface LevelProps {
  levelId: ShiftLevelId
  levelTitle: string
  seed: number
  mode: ShiftMode
  embedded: boolean
  rev: string | undefined
  onFinish: GameProps['onFinish']
  ledger: boolean
  menu: ReactNode
  modeSwitch: ReactNode
  next: { id: string; title: string } | null
  onNext: () => void
}

/** One level's frame. What the learner selected on the drawing is the page's, and a new level starts it again. */
function ShiftLevel({ levelId, levelTitle, seed, mode, embedded, rev, onFinish, ledger, menu, modeSwitch, next, onNext }: LevelProps) {
  const [pick, setPick] = useState<ShiftPick | null>(null)
  const kit = useCallback((at: number) => shiftKit(levelId, at), [levelId])
  // What stays under the hand (hand.ts): a second press on a control that came up under the pointer is ignored; on a phone the dock stays
  // where it is while the drawing over it changes, the part the first run names comes into view over the pinned dock, the first reach into
  // the dock seats the drawing over it, and the goal line comes into view with the result where it fits.
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = wrap.current
    const frame = root?.querySelector<HTMLElement>('section[data-game]') ?? null
    if (root === null || frame === null) return
    const seat = seatDrawing(frame)
    const undo = [guardPresses(root), seat.undo, keepDock(frame, seat.again), showNamedParts(frame, partRows(levelId).map((part) => part.id), embedded), showGoalAtResult(frame)]
    return () => undo.forEach((step) => step())
  }, [levelId, embedded])
  return (
    <div ref={wrap} className="contents">
      <Frame
        game={SHAPE_SHIFTER}
        role={ROLE}
        session={shiftSession}
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
        level3d={false}
        onCommand={(command, run) => {
          if (command === 'undo') {
            if (!run.canUndo) return false
            run.undo()
            return true
          }
          const action = keyAction(command, run.view, run.done)
          if (action === null) return false
          run.dispatch(action)
          return true
        }}
        goal={(run) => {
          // `fewest` in practice has undo and the same targets each time, which its graded line says it has not.
          const goal = run.view.level === 'fewest' && run.mode === 'practice' ? fewestPracticeGoal(run.view.offered, run.view.task.of) : run.view.goal
          return {
            aim: <Words line={goal.aim} />,
            control: <Words line={goal.controls} />,
            target: <Words line={goal.beat} />,
            ends: <Words line={goal.ends} />,
            met: run.done ? (run.score.passed === run.score.of ? 'Every target is reached.' : `${run.score.passed} of ${run.score.of} passed.`) : undefined,
          }
        }}
        diagram={(run) => <View2D run={run} pick={pick} onPick={setPick} />}
        legend={(run) => <ShiftLegend view={run.view} />}
        dock={(run) => <Controls run={run} mode={mode} />}
        // A new target's counts start again: the strip is drawn afresh for it, so no delta runs from one target's counts to the next's.
        readout={(run) => <ReadoutStrip key={run.view.task.at} view={run.view} />}
        result={(run, outcome) => (
          <Suspense fallback={<p role="status">Reading the run…</p>}>
            <Debrief run={run} outcome={outcome} next={next} onNext={onNext} embedded={embedded} />
          </Suspense>
        )}
        mirror={(run) => <Mirror run={run} pick={pick} onPick={setPick} />}
        parts={partRows(levelId)}
        howTo={<HowTo levelId={levelId} />}
        titleBlock={{ model: 'Model of a tensor, after PyTorch 2.14 and Triton 3.8', clock: 'Clock: operations, synthetic', leavesOut: <WorldCard /> }}
      />
    </div>
  )
}

/** How to play: the level's own opening line, then the round of one operation. */
function HowTo({ levelId }: { levelId: ShiftLevelId }) {
  const words = copyOf(shiftLevel(levelId, SHAPE_SHIFTER.levels.find((entry) => entry.id === levelId)?.practiceSeed ?? 0))
  const grid = levelId === 'grid'
  return (
    <div className="flex flex-col gap-3" data-shift-howto="">
      <p>
        <Words line={words.prompt} />
      </p>
      <ol className="list-decimal pl-5">
        <li>Read the goal line: it says what to reach, the number to match and when the level ends.</li>
        <li>Guess first, if you like: the run answers it. Or skip the guess.</li>
        {grid ? (
          <li>Set BLOCK along each dimension with its stepper; the grid follows as cdiv of the size by BLOCK, and you can change it. Then Launch, or press L.</li>
        ) : (
          <li>Press an operation in the dock. Most open a picker of shapes, orders or dimensions under the bar; a choice applies it. The arrow keys move along the bar and the picker.</li>
        )}
        <li>Watch the table, the cells and the buffer: a view changes the table and moves the numbers among the cells, a copy writes a new buffer. Press a cell to see its address.</li>
        <li>At the end, the dock shows your result beside the reference&apos;s.</li>
      </ol>
    </div>
  )
}
