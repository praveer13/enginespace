import type { GameMode, LevelEntry } from '@es/play'
import { Button } from '@/design/components/Button'

/*
 * The levels of Back of House, and the way into the graded run (GAMES.md §5 "Levels"; ASSESSMENT §4.3). A level opens in practice on its
 * pinned seed, with undo. `map` can also be graded: a scenario drawn when the run starts, from any of the five engines, no undo and one
 * run, because its bar is the whole path right on its first. Nothing locks (ARCHITECTURE I9): every level is open.
 *
 * Two pieces, because they belong in two places on the page. `GradedBar` is the line at the top of the controls that says what mode the
 * learner is in and offers the other; it is there on the level that can be graded and on no other. `LevelList` is the row of levels at
 * the foot of the controls.
 */

/** What mode the level is in, and the way into the other. Nothing on a level that cannot be graded. */
export function GradedBar({ entry, mode, done, onGraded, onPractice }: { entry: LevelEntry; mode: GameMode; done: boolean; onGraded: () => void; onPractice: () => void }) {
  if (!entry.graded) return null
  return (
    <div className="es-floor-mode" data-floor-mode={mode}>
      {mode === 'graded' && !done ? (
        <>
          <p className="text-text-2">A graded run: a fresh scenario, no undo and one run. The whole path right on that run passes the scenario.</p>
          <Button size="sm" variant="quiet" onClick={onPractice}>
            Back to practice
          </Button>
        </>
      ) : (
        <>
          <p className="text-text-2">This level can be graded, on a fresh scenario of any of the five engines.</p>
          <Button size="sm" onClick={onGraded}>
            Start a graded run
          </Button>
        </>
      )}
    </div>
  )
}

/** The levels, one plate each, the current one marked and the one that can be graded said so. */
export function LevelList({ levels, current, onLevel }: { levels: readonly LevelEntry[]; current: string; onLevel: (id: string) => void }) {
  return (
    <nav aria-label="Levels of Back of House" className="es-floor-rail" data-floor-levels="">
      <ol className="es-floor-levels">
        {levels.map((level) => (
          <li key={level.id}>
            <Button size="sm" variant={level.id === current ? 'ink' : 'quiet'} aria-current={level.id === current ? 'step' : undefined} onClick={() => onLevel(level.id)}>
              {level.title}
              {level.graded ? <span className="sr-only"> (can be graded)</span> : null}
            </Button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
