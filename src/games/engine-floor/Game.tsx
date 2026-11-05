import { useEffect, useRef, useState } from 'react'
import { drawInBand, levelOf } from '@es/play'
import type { GameMode } from '@es/play'
import { ENGINE_FLOOR } from '@es/play/engine-floor/entry'
import { floorSession } from '@es/play/engine-floor/session'
import type { Seed } from '@es/sim/core'
import { GameShell } from '@/games/kit/GameShell'
import type { GameProps } from '@/games/registry'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { Debrief } from './Debrief'
import { GradedBar, LevelList } from './LevelRail'
import { Mirror } from './Mirror'
import type { FloorRun } from './types'
import { View2D } from './View2D'

/*
 * Back of House (`engine-floor`, D-049: "Back of House", a request's lifecycle). Its page is Play → Debrief, around the 2D view, the
 * controls and the mirror (D-018: one session, drawn by every view). The shell owns the run and its action log; this file wires Back of
 * House's parts into it, and the keys that are its own: `R` runs the laid path and Backspace takes the last stage off it.
 *
 * The levels are the practice run of GAMES.md §5: one engine's one idea each, in the order of its difficulty. A level opens in practice on
 * its pinned seed, and a finished level offers the next. The last, `map`, can also be graded: a graded run draws a seed when it starts,
 * in band (GAMES.md §2.1), which is a fresh scenario of any of the five engines, with no undo and one run (W1-T19; ASSESSMENT §4.3).
 * Whether a page records the run is its own business: a lesson passes `onFinish` for a graded run (D-038), and the game's page passes
 * nothing. A game with a 3D scene joins its scene to this page with W1-T18. Until then the page is its 2D view, which is a first-class
 * path to the whole concept (A§6.2).
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
  const [asked, setAsked] = useState({ level, mode })
  const [attempt, setAttempt] = useState<Attempt>(() => startOf(known(level), mode))
  // A page that opens another level of the game, or the same one in another mode, gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked.level || mode !== asked.mode) {
    setAsked({ level, mode })
    setAttempt(startOf(known(level), mode))
  }
  // Moving to another level or another attempt replaces the page's content, and the button that was pressed goes with it: focus goes back to the game.
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    document.querySelector<HTMLElement>(`[data-game="${ENGINE_FLOOR.id}"]`)?.focus({ preventScroll: true })
  }, [attempt])
  const go = (next: Attempt) => {
    moved.current = true
    setAttempt(next)
  }

  const entry = levelOf(ENGINE_FLOOR, attempt.level) ?? ENGINE_FLOOR.levels[0]
  const at = ENGINE_FLOOR.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = ENGINE_FLOOR.levels[at + 1] ?? null

  return (
    <GameShell
      game={ENGINE_FLOOR}
      session={floorSession}
      level={entry.id}
      levelTitle={entry.title}
      seed={attempt.seed}
      mode={attempt.mode}
      rev={rev}
      headingLevel={placement === 'embed' ? 3 : 2}
      onFinish={onFinish}
      allow3d={false}
      onCommand={(command, r) => {
        if (command === 'run' || command === 'step') return run(r)
        if (command === 'unlay') {
          if (!r.view.canUnlay) return false
          r.dispatch({ t: 'unlay' })
          return true
        }
        return false
      }}
      view2d={(r) => <View2D run={r} />}
      controls={(r) => (
        <Controls
          run={r}
          top={<GradedBar entry={entry} mode={attempt.mode} done={r.done} onGraded={() => go(graded(entry.id))} onPractice={() => go(practice(entry.id))} />}
          rail={<LevelList levels={ENGINE_FLOOR.levels} current={entry.id} onLevel={(id) => go(practice(id))} />}
        />
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
  )
}
