import { useEffect, useRef, useState } from 'react'
import { drawInBand, levelOf } from '@es/play'
import type { GameMode } from '@es/play'
import type { Seed } from '@es/sim/core'
import { BROKEN_BENCH } from '@es/play/broken-bench/entry'
import { benchSession } from '@es/play/broken-bench/session'
import { TABS } from '@es/play/broken-bench/types'
import { Button } from '@/design/components/Button'
import { GameShell } from '@/games/kit/GameShell'
import type { GameProps } from '@/games/registry'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { Debrief } from './Debrief'
import { deskFor, NO_SETTINGS, type DeskSettings } from './desk'
import { Mirror } from './Mirror'
import { Production } from './Production'
import type { BenchRun } from './types'
import { View2D } from './View2D'
import './bench.css'

/*
 * The Inspection, a game of TR8 (`broken-bench`, D-049: "The Inspection", benchmark methodology). Its page is Play → Debrief → In
 * production, around the 2D view, the controls and the mirror (D-018: one session, drawn by every view). The shell owns the run and its
 * action log. This file wires the Inspection's parts into it, and keeps what the board alone knows: which level is open, whether the
 * attempt is practice or graded, and the desk (the stopwatch, the cut and the selected order), none of which is the session's.
 *
 * Practice plays a level's pinned seed, with undo and with the desk's readouts. A graded attempt draws its seed when it starts, from
 * `crypto.getRandomValues` and through the level's band, and is stamped unseen (ASSESSMENT §4.1; A§8.2): it has no undo, and the desk
 * does not say where the p99 sits. The seed is drawn on the page and never inside the pure package, which reads no entropy (I3).
 *
 * The keys are the game's own: `T` moves the stopwatch between the send and the due time, `J` and `K` select the next and the previous
 * order, and `[` and `]` turn to the previous and the next sheet. A key is left alone where the focused control uses it itself.
 */

const LEVELS = BROKEN_BENCH.levels
const known = (id: string | undefined) => LEVELS.find((entry) => entry.id === id)?.id ?? LEVELS[0].id

interface Attempt {
  mode: GameMode
  seed: Seed
}

/** A seed for a graded attempt, drawn now. */
function fresh(levelId: string): Seed {
  return drawInBand(benchSession, levelId, crypto.getRandomValues(new Uint32Array(1))[0])
}

function begin(levelId: string, mode: GameMode): Attempt {
  const entry = levelOf(BROKEN_BENCH, levelId) ?? LEVELS[0]
  return mode === 'graded' ? { mode, seed: fresh(entry.id) } : { mode, seed: entry.practiceSeed }
}

const ring = (run: BenchRun, step: 1 | -1): boolean => {
  if (run.view.done) return false
  const at = TABS.indexOf(run.view.tab)
  const to = TABS[(at + step + TABS.length) % TABS.length]
  run.dispatch({ t: 'view', v: to })
  run.announce(`${to[0].toUpperCase()}${to.slice(1)} sheet.`)
  return true
}

export default function Game({ level, mode = 'practice', placement = 'page', rev, onFinish }: GameProps) {
  const [asked, setAsked] = useState(level)
  const [levelId, setLevelId] = useState(() => known(level))
  const [attempt, setAttempt] = useState<Attempt>(() => begin(known(level), mode))
  const [bench, setBench] = useState<DeskSettings>(NO_SETTINGS)
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked) {
    setAsked(level)
    setLevelId(known(level))
    setAttempt(begin(known(level), attempt.mode))
  }
  // Moving on to the next level replaces the page's content, and the button that was pressed goes with it: focus goes back to the game.
  const advanced = useRef(false)
  useEffect(() => {
    if (!advanced.current) return
    advanced.current = false
    document.querySelector<HTMLElement>(`[data-game="${BROKEN_BENCH.id}"]`)?.focus({ preventScroll: true })
  }, [levelId, attempt])

  const entry = levelOf(BROKEN_BENCH, levelId) ?? LEVELS[0]
  const at = LEVELS.findIndex((candidate) => candidate.id === entry.id)
  const after = LEVELS[at + 1] ?? null
  const open = (id: string, as: GameMode) => {
    advanced.current = true
    setLevelId(id)
    setAttempt(begin(id, as))
  }
  const newNumbers = () => {
    advanced.current = true
    setAttempt({ mode: attempt.mode, seed: fresh(entry.id) })
  }

  return (
    <div className="flex flex-col gap-6" data-bench-page="">
      {placement === 'embed' ? null : (
        <div className="es-bench-docket" data-bench-docket="">
          <nav aria-label="Levels of the Inspection">
            <ul>
              {LEVELS.map((candidate) => (
                <li key={candidate.id}>
                  <Button size="sm" variant={candidate.id === entry.id ? 'ink' : 'quiet'} aria-current={candidate.id === entry.id ? 'true' : undefined} onClick={() => open(candidate.id, attempt.mode)}>
                    {candidate.title}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
          <div role="group" aria-label="Attempt" className="es-bench-docket__mode">
            <Button size="sm" variant={attempt.mode === 'practice' ? 'ink' : 'plate'} aria-pressed={attempt.mode === 'practice'} onClick={() => open(entry.id, 'practice')}>
              Practice
            </Button>
            <Button size="sm" variant={attempt.mode === 'graded' ? 'ink' : 'plate'} aria-pressed={attempt.mode === 'graded'} onClick={() => open(entry.id, 'graded')}>
              Graded attempt, fresh seed
            </Button>
          </div>
        </div>
      )}
      <GameShell
        game={BROKEN_BENCH}
        session={benchSession}
        level={entry.id}
        levelTitle={entry.title}
        seed={attempt.seed}
        mode={attempt.mode}
        rev={rev}
        headingLevel={placement === 'embed' ? 3 : 2}
        onFinish={onFinish}
        onCommand={(command, run) => {
          const desk = deskFor(bench, setBench, run)
          switch (command) {
            case 'stopwatch': {
              if (desk === null) return false
              const to = desk.clock === 'due' ? 'sent' : 'due'
              desk.setClock(to)
              run.announce(to === 'due' ? 'Stopwatch starts at the due time.' : 'Stopwatch starts at the send.')
              return true
            }
            case 'next-row':
            case 'prev-row':
              if (desk === null) return false
              desk.move(command === 'next-row' ? 'next' : 'previous')
              return true
            case 'stage-next':
              return ring(run, 1)
            case 'stage-prev':
              return ring(run, -1)
            default:
              return false
          }
        }}
        view2d={(run) => <View2D run={run} desk={deskFor(bench, setBench, run)} />}
        controls={(run) => <Controls run={run} desk={deskFor(bench, setBench, run)} />}
        mirror={(run) => <Mirror run={run} desk={deskFor(bench, setBench, run)} />}
        debrief={(run, outcome) => (
          <Debrief
            run={run}
            outcome={outcome}
            next={after === null ? null : { id: after.id, title: after.title }}
            onNext={() => after !== null && open(after.id, attempt.mode)}
            onNew={newNumbers}
          />
        )}
        production={() => <Production />}
        card={<WorldCard />}
      />
    </div>
  )
}
