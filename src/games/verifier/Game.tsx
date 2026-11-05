import { useEffect, useRef, useState } from 'react'
import { drawInBand, levelOf } from '@es/play'
import type { GameMode } from '@es/play'
import { VERIFIER } from '@es/play/verifier/entry'
import { verifierSession } from '@es/play/verifier/session'
import type { Seed } from '@es/sim/core'
import { GameShell } from '@/games/kit/GameShell'
import type { GameProps } from '@/games/registry'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { Debrief } from './Debrief'
import { LevelRail } from './LevelRail'
import { Mirror } from './Mirror'
import { showDraws } from './rules'
import type { VerifierRun } from './types'
import { View2D } from './View2D'
import './verifier.css'

/*
 * The Tasting, speculative decoding's verifier (`verifier`, D-049). Its page is Play → Debrief, around the 2D view, the controls and the
 * mirror (D-018: one session, drawn by every view). The shell owns the run and its action log; this file wires The Tasting's parts into it,
 * and the keys that are its own: `D` draws a batch of rounds, `.` draws one, and Enter submits the answer.
 *
 * A level opens in practice on its pinned seed. A level that can be graded also opens a graded run on a seed drawn when it starts, in
 * band (GAMES.md §2.1), with no undo and no live meter. Whether a page records the run is its own business: a lesson passes `onFinish`
 * for a graded run (D-038), and the game's page passes nothing.
 *
 * The game has no 3D scene yet (W1-T29), so the 2D view is the whole game: the first paint and the 3D-off path are the same drawing.
 *
 * The debrief is imported here and not behind React.lazy, as Service's is, because it prints fractions with the same `Fraction` as the 2D
 * view and the mirror. As a chunk of its own it would import that module from this game's chunk, which would then export a binding this
 * file does not, and Rollup gives such a chunk no entry module: the bundle manifest would have no `src/games/verifier/Game.tsx`, and
 * verify:bundle could not find the game. Whatever a lazy part of this game shares with its figure has the same cost.
 */

interface Attempt {
  readonly level: string
  readonly mode: GameMode
  readonly seed: Seed
}

const known = (id: string | undefined): string => VERIFIER.levels.find((entry) => entry.id === id)?.id ?? VERIFIER.levels[0].id
const fresh = (): Seed => crypto.getRandomValues(new Uint32Array(1))[0]
const practice = (id: string): Attempt => ({ level: id, mode: 'practice', seed: levelOf(VERIFIER, id)?.practiceSeed ?? 0 })
/** A practice run on a seed in band that the learner has not seen. */
const newNumbers = (id: string): Attempt => ({ level: id, mode: 'practice', seed: drawInBand(verifierSession, id, fresh()) })
/** A graded run: a seed drawn at the start, in band, and stamped unseen by whoever records it (ARCHITECTURE §8.2). */
const graded = (id: string): Attempt => ({ level: id, mode: 'graded', seed: drawInBand(verifierSession, id, fresh()) })

const startOf = (id: string, mode: GameMode | undefined): Attempt => (mode === 'graded' && levelOf(VERIFIER, id)?.graded ? graded(id) : practice(id))

/** What the shell's key commands do in this game. Returns whether the key was taken. */
function command(name: string, run: VerifierRun): boolean {
  const { view, dispatch } = run
  if (name === 'step' || name === 'draw') {
    if (!showDraws(run)) return false
    dispatch({ t: 'draw', n: Math.min(name === 'step' ? 1 : 20, view.drawsLeft) })
    return true
  }
  if (name === 'submit') {
    const kind = view.ask?.kind
    const ready =
      kind === 'finish' ||
      (kind === 'recipe' && view.weightTotal > 0) ||
      (kind === 'choose-gamma' && (view.gamma?.pick ?? 0) >= 1) ||
      (kind === 'audit' && (view.cards ?? []).every((card) => card.label !== null))
    if (!ready) return false
    dispatch({ t: 'submit' })
    return true
  }
  return false
}

export default function Game({ level, mode, placement = 'page', rev, onFinish }: GameProps) {
  const [asked, setAsked] = useState({ level, mode })
  const [attempt, setAttempt] = useState<Attempt>(() => startOf(known(level), mode))
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked.level || mode !== asked.mode) {
    setAsked({ level, mode })
    setAttempt(startOf(known(level), mode))
  }
  // Moving to another level replaces the page's content, and the button that was pressed goes with it: focus goes back to the game.
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    document.querySelector<HTMLElement>(`[data-game="${VERIFIER.id}"]`)?.focus({ preventScroll: true })
  }, [attempt])
  const go = (next: Attempt) => {
    moved.current = true
    setAttempt(next)
  }

  const entry = levelOf(VERIFIER, attempt.level) ?? VERIFIER.levels[0]
  const at = VERIFIER.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = VERIFIER.levels[at + 1] ?? null

  return (
    <GameShell
      game={VERIFIER}
      session={verifierSession}
      level={entry.id}
      levelTitle={entry.title}
      seed={attempt.seed}
      mode={attempt.mode}
      rev={rev}
      headingLevel={placement === 'embed' ? 3 : 2}
      onFinish={onFinish}
      onCommand={(name, run) => command(name, run)}
      view2d={(run) => <View2D run={run} />}
      controls={(run) => (
        <Controls
          run={run}
          rail={
            <LevelRail
              levels={VERIFIER.levels}
              current={entry.id}
              mode={attempt.mode}
              done={run.done}
              onLevel={(id) => go(practice(id))}
              onGraded={() => go(graded(entry.id))}
              onPractice={() => go(practice(entry.id))}
            />
          }
        />
      )}
      mirror={(run) => <Mirror run={run} />}
      debrief={(run, outcome) => (
        <Debrief
          run={run}
          outcome={outcome}
          next={after === null ? null : { id: after.id, title: after.title }}
          onNext={() => after !== null && go(practice(after.id))}
          onPracticeAgain={() => (attempt.mode === 'practice' ? run.restart() : go(practice(entry.id)))}
          onNewNumbers={() => go(newNumbers(entry.id))}
          onGraded={entry.graded ? () => go(graded(entry.id)) : null}
        />
      )}
      card={<WorldCard />}
    />
  )
}
