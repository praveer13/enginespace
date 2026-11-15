import type { GameMode, LevelEntry } from '@es/play'
import { Button } from '@/design/components/Button'

/*
 * The levels of The Tasting, and the way into a graded run. A level opens in practice on its pinned seed, with undo and the live meter.
 * The levels that can be graded (`exact`, `chain` and `gamma`, ASSESSMENT §4.3) also offer a graded run: a seed drawn when it starts,
 * the decomposition and the live meter left out, one submission and no undo. Nothing locks (ARCHITECTURE I9): every level is open.
 * Inside a lesson (`showLevels` off) the block names the level, so only the way into a graded run and back is printed.
 */
export function LevelRail({
  levels,
  current,
  mode,
  done,
  onLevel,
  onGraded,
  onPractice,
  showLevels = true,
}: {
  levels: readonly LevelEntry[]
  current: string
  mode: GameMode
  done: boolean
  onLevel: (id: string) => void
  onGraded: () => void
  onPractice: () => void
  /** The row of levels. Off inside a lesson, whose block names the level. */
  showLevels?: boolean
}) {
  const entry = levels.find((level) => level.id === current)
  const modes = entry?.graded ? (
    <div className="es-vf-mode">
      {mode === 'graded' && !done ? (
        <>
          <p className="text-text-2">A graded run: fresh numbers, no undo, no live meter, one submission.</p>
          <Button size="sm" variant="quiet" onClick={onPractice}>
            Back to practice
          </Button>
        </>
      ) : (
        <>
          <p className="text-text-2">This level can be graded, on fresh numbers.</p>
          <Button size="sm" onClick={onGraded}>
            Start a graded run
          </Button>
        </>
      )}
    </div>
  ) : null
  if (!showLevels) return modes
  return (
    <nav aria-label="Levels of The Tasting" className="es-vf-rail">
      <ol className="es-vf-levels">
        {levels.map((level) => (
          <li key={level.id}>
            <Button size="sm" variant={level.id === current ? 'ink' : 'quiet'} aria-current={level.id === current ? 'step' : undefined} onClick={() => onLevel(level.id)}>
              {level.title}
              {level.graded ? <span className="sr-only"> (can be graded)</span> : null}
            </Button>
          </li>
        ))}
      </ol>
      {modes}
    </nav>
  )
}
