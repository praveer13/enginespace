import { Suspense, useEffect, useRef, useState, type RefObject } from 'react'
import { Button } from '@/design/components/Button'
import { useLatestRun, type LiveRun } from '@/games/kit/RunContext'
import './content.css'

/*
 * The lesson's dock (REDESIGN §2.5, §3.4): from 80rem wide and 44rem tall, the learner's most recent run in this lesson stays beside the
 * prose, sticky in the reading column's right margin. It is a second view of the same run state as the instrument (D-018; RunContext.tsx):
 * the game's compact 2D view, its readout, and in practice Step, Undo and Reset, which are the run's own, so an action taken in either shows
 * in both. Before any run it shows the opening level's start, as the instrument does; in a lesson with no run yet it says so.
 *
 * It knows no game. Each game gives its own compact view (its kit's `DockView`), which arrives with the game's chunk, and a game that gives
 * none is named with the way back to its run. The page loads this file only where the dock is drawn (Lesson.tsx), so a phone pays for none
 * of it.
 *
 * A run open in Read takes the column's whole width and passes over the dock's margin: while it does, the dock steps back (it is hidden, and
 * its controls with it), so the dock never covers a control and never stands beside the run it copies.
 */

export interface DockProps {
  /** The lesson whose runs the dock follows. */
  scope: string
}

/** Whether an open run in the dock's section crosses the dock's band of the viewport. */
function useCovered(dock: RefObject<HTMLElement | null>): boolean {
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const box = dock.current
      const section = box?.parentElement
      if (box === null || box === undefined || section === null || section === undefined) return
      const band = box.getBoundingClientRect()
      const runs = section.querySelectorAll<HTMLElement>(".es-run[data-phase='open'], .es-run[data-phase='failed']")
      let hit = false
      for (const run of runs) {
        const rect = run.getBoundingClientRect()
        if (rect.bottom > band.top && rect.top < band.bottom) hit = true
      }
      setCovered(hit)
    }
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const watch = new MutationObserver(schedule)
    if (dock.current?.parentElement) watch.observe(dock.current.parentElement, { subtree: true, attributes: true, attributeFilter: ['data-phase'] })
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      watch.disconnect()
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [dock])
  return covered
}

export default function Dock({ scope }: DockProps) {
  const run = useLatestRun(scope)
  const box = useRef<HTMLElement>(null)
  const covered = useCovered(box)
  return (
    <aside
      ref={box}
      className="es-ldock"
      aria-labelledby="dock-title"
      data-dock-lesson=""
      data-dock-state={run === null ? 'empty' : run.done ? 'done' : 'live'}
      data-covered={covered || undefined}
    >
      <h2 id="dock-title" className="es-ldock__title">
        Your run
      </h2>
      {run === null ? <EmptyDock /> : <LiveDock run={run} />}
    </aside>
  )
}

function EmptyDock() {
  return (
    <div className="es-ldock__empty">
      <p className="es-ldock__lead">Your run appears here.</p>
      <p className="es-ldock__note">Start a run in this lesson and it stays beside the text as you read: its diagram, its readout, and Step, Undo and Reset.</p>
    </div>
  )
}

function LiveDock({ run }: { run: LiveRun }) {
  const View = run.DockView
  const practice = run.mode === 'practice'
  return (
    <>
      <p className="es-ldock__what" data-dock-run={run.place.key}>
        <span className="es-ldock__game">{run.gameTitle}</span> <span className="es-ldock__level">{run.levelTitle}</span>
        <span className="es-ldock__mode"> · {practice ? 'practice' : 'graded'}</span>
      </p>
      <div className="es-ldock__view">
        {View === null ? (
          <p className="es-ldock__note">This game draws its run in the run itself.</p>
        ) : (
          <Suspense fallback={<p className="es-ldock__note">Drawing your run…</p>}>
            <View run={run} />
          </Suspense>
        )}
      </div>
      {run.done ? (
        <p className="es-ldock__note">The run is over. Its result is under the run.</p>
      ) : practice ? (
        <>
          <div className="es-ldock__controls" role="group" aria-label="Your run">
            <Button
              size="sm"
              variant="plate"
              disabled={run.step === null || run.askOpen}
              aria-describedby="dock-step-words"
              onClick={() => {
                if (run.step !== null) run.dispatch(run.step)
              }}
            >
              Step
            </Button>
            <Button size="sm" variant="quiet" disabled={!run.canUndo} onClick={run.undo}>
              Undo
            </Button>
            <Button size="sm" variant="quiet" disabled={run.turns === 0} onClick={run.restart}>
              Reset
            </Button>
          </div>
          <p className="es-ldock__note" id="dock-step-words">
            {run.askOpen ? 'Make your guess in the run, or skip it, before you step.' : run.stepWords}
          </p>
        </>
      ) : (
        <p className="es-ldock__note">A graded run is played in the run itself, with no undo.</p>
      )}
      <p className="es-ldock__back">
        <a href={`#${run.place.anchor}`}>Back to my run</a>
      </p>
    </>
  )
}
