import { useEffect, useRef, useState } from 'react'
import { Button } from '@/design/components/Button'
import { nextTouch, publishRun, retireRun, useLatestRun, type RunPlace } from '@/games/kit/RunContext'
import { loadReplayDock, type ReplayRequest } from '@/games/replay-dock'

/*
 * "Show on the machine" (R-T45, REDESIGN §3.3): a figure with a `replay` can load the state it draws into the lesson's dock. The game's own pure session
 * replays the figure's actions (the compiler has replayed them too), and the dock draws the game's compact view of where they lead, in place of the
 * learner's run, with "Back to my run". Nothing here touches the learner's run: it is not moved, restarted or read, and when the figure's state is put
 * away the dock goes back to the run touched last, as it was.
 *
 * The button is drawn only where the dock is (80rem wide and 44rem tall, Lesson.tsx), so below it the figure is the static picture it always was. This
 * file loads with the figure that has a replay, and the game's code loads when the learner asks.
 */

const DOCKED = '(min-width: 80rem) and (min-height: 44rem)'

/** True where the lesson draws its dock. False on a server and before the first look, so the button is never there for a phone to see. */
function useDocked(): boolean {
  const [docked, setDocked] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(DOCKED)
    const change = () => setDocked(list.matches)
    change()
    list.addEventListener('change', change)
    return () => list.removeEventListener('change', change)
  }, [])
  return docked
}

export interface ShowOnMachineProps {
  game: string
  replay: ReplayRequest
  /** The lesson whose dock shows it. */
  scope: string
  /** The figure's place among the page's blocks: its key in the dock's store. */
  at: number
  /** What the figure draws, in a sentence: the dock names it under the state. */
  caption: string
}

export default function ShowOnMachine({ game, replay, scope, at, caption }: ShowOnMachineProps) {
  const docked = useDocked()
  const key = `${scope}#figure-${at}`
  const latest = useLatestRun(scope)
  const showing = latest?.place.key === key
  const [phase, setPhase] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [said, setSaid] = useState('')
  const box = useRef<HTMLParagraphElement>(null)
  const wantFocus = useRef(false)

  // The figure's state leaves the dock when the lesson does.
  useEffect(() => () => retireRun(key), [key])
  // After "Back to my run", whichever one was pressed, the keyboard lands where the learner was reading.
  useEffect(() => {
    if (!showing && wantFocus.current) {
      wantFocus.current = false
      box.current?.querySelector('button')?.focus()
    }
  }, [showing])

  if (!docked) return null

  const back = () => {
    wantFocus.current = true
    setSaid('Back to your run.')
    retireRun(key)
  }
  const show = async () => {
    setPhase('loading')
    try {
      const dock = await loadReplayDock(game, replay)
      const place: RunPlace = { scope, key, anchor: key }
      publishRun({
        place,
        game,
        gameTitle: dock.gameTitle,
        levelTitle: dock.levelTitle,
        mode: 'practice',
        view: dock.view,
        done: dock.done,
        turns: dock.turns,
        canUndo: false,
        askOpen: false,
        step: null,
        stepWords: '',
        dispatch: () => undefined,
        undo: () => undefined,
        restart: () => undefined,
        DockView: dock.DockView,
        touched: nextTouch(),
        figure: { caption, back },
      })
      setPhase('idle')
      setSaid('Loaded into the dock beside the text.')
    } catch {
      setPhase('failed')
      setSaid('')
    }
  }

  return (
    <p ref={box} className="es-c-figure__machine" data-show-on-machine="">
      {showing ? (
        <>
          <span className="es-c-figure__machine-note">In the dock beside the text.</span>
          <Button size="sm" variant="quiet" onClick={back}>
            Back to my run
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="plate" loading={phase === 'loading'} error={phase === 'failed' ? 'The machine could not load this state. Try again.' : undefined} onClick={show}>
            Show on the machine
          </Button>
        </>
      )}
      <span className="sr-only" role="status">
        {said}
      </span>
    </p>
  )
}
