import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { levelOf } from '@es/play'
import { LOOP } from '@es/play/loop/entry'
import { loopSession } from '@es/play/loop/session'
import { GameShell } from '@/games/kit/GameShell'
import type { GameProps } from '@/games/registry'
import { WorldCard } from './Card'
import { Controls, type AutoToggleRef } from './Controls'
import { Mirror } from './Mirror'
import type { LoopRun } from './types'
import { View2D } from './View2D'

// The debrief is the stage after the run: its compare strips and the real engine's numbers load when a run ends, not before.
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))

/*
 * Service, the front page's game (`loop`, D-049: "Service", the step loop). Its page is Play → Debrief, around the 2D view, the
 * controls and the mirror (D-018: one session, drawn by every view). The shell owns the run and its action log; this file wires
 * Service's parts into it, and the keys that are Service's: `.` rings the bell, Space toggles Auto, `O` flips the overlap switch.
 *
 * The four levels are the front-page run, "First service" (GAMES.md §3.1). Each is practice on its pinned seed, and a finished level
 * offers the next. A front-page run records nothing (D-038), so `onFinish` is only forwarded when a page passes one. TR2's levels
 * join this game with W1-T13, and the 3D scene with W0-T17.
 */

const ring = (run: LoopRun): boolean => {
  if (!run.view.canFire) return false
  run.dispatch({ t: 'run', until: 'step' })
  return true
}

export default function Game({ level, placement = 'page', rev, onFinish }: GameProps) {
  const known = (id: string | undefined) => LOOP.levels.find((entry) => entry.id === id)?.id ?? LOOP.levels[0].id
  const [asked, setAsked] = useState(level)
  const [levelId, setLevelId] = useState(() => known(level))
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked) {
    setAsked(level)
    setLevelId(known(level))
  }
  const toggleAuto: AutoToggleRef = useRef(null)
  // Moving on to the next level replaces the page's content, and the button that was pressed goes with it: focus goes back to the game.
  const advanced = useRef(false)
  useEffect(() => {
    if (!advanced.current) return
    advanced.current = false
    document.querySelector<HTMLElement>(`[data-game="${LOOP.id}"]`)?.focus({ preventScroll: true })
  }, [levelId])

  const entry = levelOf(LOOP, levelId) ?? LOOP.levels[0]
  const at = LOOP.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = LOOP.levels[at + 1] ?? null
  const advance = () => {
    if (after === null) return
    advanced.current = true
    setLevelId(after.id)
  }

  return (
    <GameShell
      game={LOOP}
      session={loopSession}
      level={entry.id}
      levelTitle={entry.title}
      seed={entry.practiceSeed}
      mode="practice"
      rev={rev}
      headingLevel={placement === 'embed' ? 3 : 2}
      onFinish={onFinish}
      onCommand={(command, run) => {
        if (command === 'step') return ring(run)
        if (command === 'overlap') {
          if (!run.view.overlapAvailable || run.view.done) return false
          run.dispatch({ t: 'lever', name: 'async', value: !run.view.overlap })
          return true
        }
        if (command === 'play-pause') {
          toggleAuto.current?.()
          return toggleAuto.current !== null
        }
        return false
      }}
      view2d={(run) => <View2D run={run} />}
      controls={(run) => <Controls run={run} toggleAutoRef={toggleAuto} />}
      mirror={(run) => <Mirror run={run} />}
      debrief={(run, outcome) => (
        <Suspense fallback={<p role="status">Printing the debrief…</p>}>
          <Debrief run={run} outcome={outcome} next={after === null ? null : { id: after.id, title: after.title }} onNext={advance} />
        </Suspense>
      )}
      card={<WorldCard />}
    />
  )
}
