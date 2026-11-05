import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { drawInBand, levelOf } from '@es/play'
import { POOL } from '@es/play/pool/entry'
import { poolSession } from '@es/play/pool/session'
import { Button } from '@/design/components/Button'
import { GameShell } from '@/games/kit/GameShell'
import type { GameProps } from '@/games/registry'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { Mirror } from './Mirror'
import type { PoolMode } from './types'
import { dumpOf, type Chosen } from './dump'
import { useWide } from './useWide'
import { View2D } from './View2D'
import './reach-in.css'

// The debrief is the stage after the run: its comparisons load when a run ends, not before.
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))

/*
 * The Reach-In, the KV pool game (`pool`, D-049: "The Reach-In", hybrid KV pages and adapters). Its page is Play → Debrief, around the 2D
 * view, the controls and the mirror (D-018: one session, drawn by every view). The shell owns the run and its action log; this file wires
 * the Reach-In's parts into it, and the keys that are the game's: `W` hangs none (or brings no kit in) and `D` dumps the pans chosen.
 *
 * The levels are GAMES.md §8's. Each is played in practice on its pinned seed, with undo and the price of a dump printed, and the graded
 * ones (`evict`, `adapters`, `manager`) can also be played as a graded run: a seed drawn when it starts, no undo, and no price printed
 * (ASSESSMENT §4.3). A graded run's result goes to a page that passes `onFinish`; this one records nothing itself. The 3D scene is
 * W1-T24's, and the 2D view is the whole game until then.
 */

const MODES: readonly { mode: PoolMode; label: string }[] = [
  { mode: 'practice', label: 'Practice' },
  { mode: 'graded', label: 'Graded' },
]

/** A fresh seed that this level's band accepts, from the browser's entropy: unseen, not secret (ASSESSMENT §4.1). */
function freshSeed(level: string): number {
  return drawInBand(poolSession, level, crypto.getRandomValues(new Uint32Array(1))[0])
}

export default function Game({ level, mode: asked = 'practice', placement = 'page', rev, onFinish }: GameProps) {
  const known = (id: string | undefined) => POOL.levels.find((entry) => entry.id === id)?.id ?? POOL.levels[0].id
  const [prop, setProp] = useState({ level, mode: asked })
  const [levelId, setLevelId] = useState(() => known(level))
  const [mode, setMode] = useState<PoolMode>(asked)
  // A graded run draws its seed when it starts; it is drawn in the handler that starts it, because a render reads no entropy.
  const [drawn, setDrawn] = useState<{ level: string; seed: number } | null>(null)
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (prop.level !== level || prop.mode !== asked) {
    setProp({ level, mode: asked })
    setLevelId(known(level))
    setMode(asked)
    setDrawn(null)
  }
  const entry = levelOf(POOL, levelId) ?? POOL.levels[0]
  const at = POOL.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = POOL.levels[at + 1] ?? null
  const graded = mode === 'graded' && entry.graded
  const wide = useWide()
  const seed = graded ? (drawn !== null && drawn.level === entry.id ? drawn.seed : entry.practiceSeed) : entry.practiceSeed

  function choose(next: string, nextMode: PoolMode) {
    const target = levelOf(POOL, next) ?? POOL.levels[0]
    setLevelId(target.id)
    setMode(nextMode)
    setDrawn(nextMode === 'graded' && target.graded ? { level: target.id, seed: freshSeed(target.id) } : null)
  }

  // Moving on replaces the page's content, and the button that was pressed goes with it: focus goes back to the game.
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    document.querySelector<HTMLElement>(`[data-game="${POOL.id}"]`)?.focus({ preventScroll: true })
  }, [levelId, mode])

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Levels of The Reach-In">
        <details open={wide || undefined} className="es-levels">
          <summary className="es-levels__summary cursor-pointer font-bold">
            Level: {entry.title} · {graded ? 'graded' : 'practice'}
          </summary>
          <div className="flex flex-col gap-3 pt-3">
            <ol className="flex flex-wrap gap-2">
              {POOL.levels.map((candidate) => (
                <li key={candidate.id}>
                  <Button
                    size="sm"
                    variant={candidate.id === entry.id ? 'ink' : 'quiet'}
                    aria-current={candidate.id === entry.id ? 'step' : undefined}
                    onClick={() => {
                      moved.current = true
                      choose(candidate.id, 'practice')
                    }}
                  >
                    {candidate.title}
                    {candidate.graded ? <span className="sr-only"> (graded level)</span> : null}
                  </Button>
                </li>
              ))}
            </ol>
            {entry.graded ? (
              <div role="group" aria-label="How to play this level" className="flex flex-wrap items-center gap-2">
                {MODES.map((candidate) => (
                  <Button
                    key={candidate.mode}
                    size="sm"
                    variant={candidate.mode === (graded ? 'graded' : 'practice') ? 'ink' : 'plate'}
                    aria-pressed={candidate.mode === (graded ? 'graded' : 'practice')}
                    onClick={() => {
                      moved.current = true
                      choose(entry.id, candidate.mode)
                    }}
                  >
                    {candidate.label}
                  </Button>
                ))}
                <span className="text-text-2">{graded ? 'A fresh seed, no undo, and no price printed for a dump.' : 'The pinned seed, with undo and the price of each dump.'}</span>
              </div>
            ) : null}
          </div>
        </details>
      </nav>
      <PoolShell
        key={`${entry.id}|${graded ? 'graded' : 'practice'}`}
        levelId={entry.id}
        levelTitle={entry.title}
        seed={seed}
        mode={graded ? 'graded' : 'practice'}
        headingLevel={placement === 'embed' ? 3 : 2}
        rev={rev}
        onFinish={onFinish}
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

interface ShellProps {
  levelId: string
  levelTitle: string
  seed: number
  mode: PoolMode
  headingLevel: 2 | 3
  rev: string | undefined
  onFinish: GameProps['onFinish']
  next: { id: string; title: string } | null
  onNext: () => void
}

/** One level's page. Its state (the pans chosen, the pointer) is the page's, and a new level starts it again. */
function PoolShell({ levelId, levelTitle, seed, mode, headingLevel, rev, onFinish, next, onNext }: ShellProps) {
  const [pointed, setPointed] = useState<readonly number[]>([])
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const wide = useWide()
  return (
    <GameShell
      game={POOL}
      session={poolSession}
      level={levelId}
      levelTitle={levelTitle}
      seed={seed}
      mode={mode}
      rev={rev}
      headingLevel={headingLevel}
      onFinish={onFinish}
      onCommand={(command, run) => {
        const ask = run.view.ask
        if (command === 'wait') {
          if (ask?.kind === 'admit') run.dispatch({ t: 'admit', req: null })
          else if (ask?.kind === 'prefetch') run.dispatch({ t: 'prefetch', adapter: null })
          else return false
          return true
        }
        if (command === 'dump') {
          const dump = dumpOf(run.view, chosen, setChosen)
          if (ask?.kind !== 'evict' || !dump.ready) return false
          run.dispatch({ t: 'evict', pages: [...dump.pages].sort((a, b) => a - b) })
          return true
        }
        return false
      }}
      view2d={(run) => <View2D run={run} dump={dumpOf(run.view, chosen, setChosen)} pointed={pointed} pick={wide} />}
      controls={(run) => <Controls run={run} dump={dumpOf(run.view, chosen, setChosen)} mode={mode} onPoint={setPointed} />}
      mirror={(run) => <Mirror run={run} />}
      debrief={(run, outcome) => (
        <Suspense fallback={<p role="status">Printing the debrief…</p>}>
          <Debrief run={run} outcome={outcome} next={next} onNext={onNext} />
        </Suspense>
      )}
      card={<WorldCard />}
    />
  )
}
