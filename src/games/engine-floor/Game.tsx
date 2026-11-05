import { useEffect, useRef, useState } from 'react'
import { levelOf } from '@es/play'
import { ENGINE_FLOOR } from '@es/play/engine-floor/entry'
import { floorSession } from '@es/play/engine-floor/session'
import { GameShell } from '@/games/kit/GameShell'
import type { GameProps } from '@/games/registry'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { Debrief } from './Debrief'
import { Mirror } from './Mirror'
import type { FloorRun } from './types'
import { View2D } from './View2D'

/*
 * Back of House (`engine-floor`, D-049: "Back of House", a request's lifecycle). Its page is Play → Debrief, around the 2D view, the
 * controls and the mirror (D-018: one session, drawn by every view). The shell owns the run and its action log; this file wires Back of
 * House's parts into it, and the keys that are its own: `R` runs the laid path and Backspace takes the last stage off it.
 *
 * The levels are the practice run of GAMES.md §5: one engine's one idea each, in the order of its difficulty. Each is practice on its
 * pinned seed, and a finished level offers the next. A game with a 3D scene joins its scene to this page with W1-T18, and the graded
 * `map` level with W1-T19. Until then the page is its 2D view, which is a first-class path to the whole concept (A§6.2).
 *
 * The debrief is imported with the game and not on demand. It draws with the same parts as the 2D view, so a chunk of its own would take
 * them out of the game's chunk, and `verify:bundle` finds a game by the chunk that Game.tsx opens: that chunk must hold the game whole.
 */

const run = (r: FloorRun): boolean => {
  if (!r.view.canRun) return false
  r.dispatch({ t: 'run' })
  return true
}

export default function Game({ level, placement = 'page', rev, onFinish }: GameProps) {
  const known = (id: string | undefined) => ENGINE_FLOOR.levels.find((entry) => entry.id === id)?.id ?? ENGINE_FLOOR.levels[0].id
  const [asked, setAsked] = useState(level)
  const [levelId, setLevelId] = useState(() => known(level))
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked) {
    setAsked(level)
    setLevelId(known(level))
  }
  // Moving on to the next level replaces the page's content, and the button that was pressed goes with it: focus goes back to the game.
  const advanced = useRef(false)
  useEffect(() => {
    if (!advanced.current) return
    advanced.current = false
    document.querySelector<HTMLElement>(`[data-game="${ENGINE_FLOOR.id}"]`)?.focus({ preventScroll: true })
  }, [levelId])

  const entry = levelOf(ENGINE_FLOOR, levelId) ?? ENGINE_FLOOR.levels[0]
  const at = ENGINE_FLOOR.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = ENGINE_FLOOR.levels[at + 1] ?? null
  const advance = () => {
    if (after === null) return
    advanced.current = true
    setLevelId(after.id)
  }

  return (
    <GameShell
      game={ENGINE_FLOOR}
      session={floorSession}
      level={entry.id}
      levelTitle={entry.title}
      seed={entry.practiceSeed}
      mode="practice"
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
      controls={(r) => <Controls run={r} />}
      mirror={(r) => <Mirror run={r} />}
      debrief={(r, outcome) => <Debrief run={r} outcome={outcome} next={after === null ? null : { id: after.id, title: after.title }} onNext={advance} />}
      card={<WorldCard />}
    />
  )
}
