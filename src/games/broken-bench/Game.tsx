import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { drawInBand, levelOf } from '@es/play'
import type { GameMode } from '@es/play'
import type { Seed } from '@es/sim/core'
import { BENCH_COPY, COORDINATED_OMISSION, HOW_TO } from '@es/play/broken-bench/copy'
import { readingOf } from '@es/play/broken-bench/desk'
import { BROKEN_BENCH } from '@es/play/broken-bench/entry'
import { NUMBER_TOLERANCE_PERMILLE } from '@es/play/broken-bench/judge'
import { benchSession } from '@es/play/broken-bench/session'
import { TABS, type BenchLevelId } from '@es/play/broken-bench/types'
import { ROSTER } from '@es/play/roster'
import { Button } from '@/design/components/Button'
import { LevelMenu } from '@/design/components/LevelMenu'
import { Marker } from '@/design/components/Marker'
import { formatReadout } from '@/design/format'
import { Frame } from '@/games/kit/Frame'
import type { GameProps } from '@/games/registry'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { layoutHistogram, layoutTimeline, longestWait, orderNo } from '@es/play/broken-bench/layout'
import { Plot } from './Plot'
import { useOrientation } from './useOrientation'
import { deskFor, NO_SETTINGS, type DeskApi, type DeskSettings } from './desk'
import { benchKit, partRows } from './kit'
import { DueMark, SentMark } from './Marks'
import { Mirror } from './Mirror'
import { ReadoutStrip } from './ReadoutStrip'
import type { BenchRun } from './types'
import { View2D } from './View2D'
import './bench.css'

// The result loads when a run ends, not before, and so do the exhibits it draws in the diagram. The exhibits are handed the sheets' drawing
// tools: a lazy chunk that imported them from the game's chunk would take the game's own entry from the manifest (verify:bundle).
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))
const Exhibits = lazy(() => import('./Exhibits'))
const TOOLS = { Plot, useOrientation, layoutHistogram, layoutTimeline, longestWait, orderNo }

/*
 * Broken benchmark, a game of TR8 (`broken-bench`, D-049): the learner audits a benchmark. The page is the instrument frame
 * (src/games/kit/Frame.tsx) around the latency chart, the report beside it, the report form in the dock, the readout and the table (D-018:
 * one session, drawn by every view). The frame owns the run and its action log; this file wires the game's parts into it, and keeps what
 * the page alone knows: which level is open, whether the attempt is practice or graded, and the desk (the clock switch, the cut and the
 * selected request), none of which is the session's.
 *
 * Practice plays a level's pinned seed, with undo and with the desk's readouts. A graded attempt draws its seed when it starts, from
 * `crypto.getRandomValues` and through the level's band, and is stamped unseen (ASSESSMENT §4.1; A§8.2): it has no undo, and the desk
 * does not say where the p99 sits. The seed is drawn on the page and never inside the pure package, which reads no entropy (I3).
 * A run's result goes to the page's `onFinish`, which the game's page and a lesson's block each give the recorder (src/games/kit/record.ts,
 * W1b-T01). Inside a lesson the block names the level and the attempt, so the level menu and the next level are left out.
 *
 * The keys are the game's own: `T` moves the clock between the send time and the due time, `J` and `K` select the next and the previous
 * request, and `[` and `]` turn to the previous and the next sheet. A key is left alone where the focused control uses it itself.
 */

const LEVELS = BROKEN_BENCH.levels
const known = (id: string | undefined) => LEVELS.find((entry) => entry.id === id)?.id ?? LEVELS[0].id
const ROLE = ROSTER.find((entry) => entry.id === BROKEN_BENCH.id)?.role ?? ''

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
  run.announce(`${to === 'rows' ? 'Log' : to[0].toUpperCase() + to.slice(1)} sheet.`)
  return true
}

export default function Game({ level, mode = 'practice', placement = 'page', rev, onFinish }: GameProps) {
  const [asked, setAsked] = useState(level)
  const [levelId, setLevelId] = useState(() => known(level))
  const [attempt, setAttempt] = useState<Attempt>(() => begin(known(level), mode))
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked) {
    setAsked(level)
    setLevelId(known(level))
    setAttempt(begin(known(level), attempt.mode))
  }
  // Moving on to the next level replaces the page's content, and the button that was pressed goes with it: focus goes back to the game. This
  // game's own, found from its box, since a lesson can hold two of it.
  const host = useRef<HTMLDivElement>(null)
  const advanced = useRef(false)
  useEffect(() => {
    if (!advanced.current) return
    advanced.current = false
    host.current?.querySelector<HTMLElement>('[data-game]')?.focus({ preventScroll: true })
  }, [levelId, attempt])

  const embedded = placement === 'embed'
  const entry = levelOf(BROKEN_BENCH, levelId) ?? LEVELS[0]
  const at = LEVELS.findIndex((candidate) => candidate.id === entry.id)
  const after = embedded ? null : (LEVELS[at + 1] ?? null)
  const open = (id: string, as: GameMode) => {
    advanced.current = true
    setLevelId(id)
    setAttempt(begin(id, as))
  }
  const graded = attempt.mode === 'graded'

  // One control for the levels, in the title strip; the attempt's own switch stands in the foot. A lesson that embeds the game picks the
  // level itself, and the frame names it there.
  const menu = embedded ? undefined : (
    <LevelMenu
      label="Level"
      value={entry.id}
      levels={LEVELS.map((candidate) => ({ id: candidate.id, title: candidate.title, mode: candidate.id === entry.id ? attempt.mode : 'graded' }))}
      onChange={(id) => open(id, 'practice')}
    />
  )
  const modeSwitch = (
    <>
      <span className="es-bench__mode" data-bench-mode={attempt.mode}>
        {graded ? 'Graded: a fresh seed, no undo, and no p99 shown at the desk.' : 'Practice: fixed numbers, undo, and the p99 at the switch and the cut.'}
      </span>
      <Button size="sm" variant="plate" onClick={() => open(entry.id, graded ? 'practice' : 'graded')}>
        {graded ? 'Back to practice' : 'Start a graded attempt'}
      </Button>
    </>
  )

  return (
    <div ref={host} className="flex flex-col gap-6" data-bench-page="">
      <BenchLevel
        key={`${entry.id}|${attempt.mode}`}
        levelId={entry.id as BenchLevelId}
        levelTitle={entry.title}
        seed={attempt.seed}
        mode={attempt.mode}
        embedded={embedded}
        rev={rev}
        onFinish={onFinish}
        ledger={onFinish !== undefined}
        menu={menu}
        modeSwitch={modeSwitch}
        next={after === null ? null : { id: after.id, title: after.title }}
        onNext={() => after !== null && open(after.id, attempt.mode)}
      />
    </div>
  )
}

interface LevelProps {
  levelId: BenchLevelId
  levelTitle: string
  seed: Seed
  mode: GameMode
  embedded: boolean
  rev: string | undefined
  onFinish: GameProps['onFinish']
  ledger: boolean
  menu: ReactNode
  modeSwitch: ReactNode
  next: { id: string; title: string } | null
  onNext: () => void
}

/** One level's frame. The desk, the report drawn at a result and the named moment are the page's, and a new level starts them again. */
function BenchLevel({ levelId, levelTitle, seed, mode, embedded, rev, onFinish, ledger, menu, modeSwitch, next, onNext }: LevelProps) {
  const [bench, setBench] = useState<DeskSettings>(NO_SETTINGS)
  const [shown, setShown] = useState(0)
  const copy = BENCH_COPY[levelId]
  const kit = useCallback(() => benchKit(levelId), [levelId])
  // The named moment is said once in a level, and it stays on while the switch stays on the due time.
  const [said] = useState(() => new Set<string>())
  return (
    <Frame
      game={BROKEN_BENCH}
      role={ROLE}
      session={benchSession}
      level={levelId}
      levelTitle={levelTitle}
      seed={seed}
      mode={mode}
      rev={rev}
      embedded={embedded}
      onFinish={onFinish}
      ledger={ledger}
      kit={kit}
      menu={menu}
      modeSwitch={modeSwitch}
      onCommand={(command, run) => {
        const desk = deskFor(bench, setBench, run)
        switch (command) {
          case 'stopwatch': {
            if (desk === null) return false
            const to = desk.clock === 'due' ? 'sent' : 'due'
            desk.setClock(to)
            run.announce(to === 'due' ? 'Latency counts from the due time.' : 'Latency counts from the send time.')
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
      goal={(run) => ({
        aim: copy.goal.aim,
        control: copy.goal.controls,
        target: mode === 'graded' ? copy.passRule : copy.practiceBeat,
        ends: copy.goal.ends,
        met: run.done ? 'Every report is filed.' : undefined,
      })}
      diagram={(run) => <Board run={run} desk={deskFor(bench, setBench, run)} said={said} shown={shown} />}
      legend={() => <BenchLegend />}
      dock={(run) => <Controls run={run} />}
      readout={(run) => <ReadoutStrip run={run} desk={deskFor(bench, setBench, run)} />}
      result={(run, outcome) => (
        <Suspense fallback={<p role="status">Reading the run…</p>}>
          <Debrief run={run} outcome={outcome} next={next} onNext={onNext} shown={shown} onShow={setShown} embedded={embedded} />
        </Suspense>
      )}
      mirror={(run) => <Mirror run={run} desk={deskFor(bench, setBench, run)} />}
      parts={partRows(levelId)}
      howTo={<HowTo prompt={copy.prompt} />}
      titleBlock={{ model: 'Model of a benchmark client and a coarse server, after vllm bench serve', clock: 'Clock: microseconds of one run, synthetic', leavesOut: <WorldCard /> }}
    />
  )
}

/** The chart, with the one named moment of the game: the p99 moving once latency counts from the due time (REDESIGN §3.5). */
function Board({ run, desk, said, shown }: { run: BenchRun; desk: DeskApi | null; said: Set<string>; shown: number }) {
  const scene = run.view.scene
  const clock = desk?.clock
  const cut = desk?.cut
  const rows = scene?.rows
  const from = scene?.claim.timerStartsAt === 'send' ? 'sent' : 'due'
  // The p99 as the report counted it, and as the log gives it from the due time: the moment is a move of 15% or more.
  const moved = (() => {
    if (run.mode !== 'practice' || desk === null || rows === undefined || cut === undefined || clock !== 'due' || from !== 'sent') return null
    const before = readingOf(rows, { clock: 'sent', cut }).p99Us
    const after = desk.reading.p99Us
    return Math.abs(after - before) * 1000 >= NUMBER_TOLERANCE_PERMILLE * before ? { before, after } : null
  })()
  const [named, setNamed] = useState<{ key: string; over: boolean } | null>(null)
  const key = `${run.seed}|${run.view.caseNo}`
  // Said once in a level (the set outlives a restart): the first time it occurs, here, and the level's record after the commit.
  if (moved !== null && named === null && !said.has(COORDINATED_OMISSION.id)) setNamed({ key, over: false })
  // It stays while the switch stays on the due time, and is over once it is turned back.
  if (named !== null && !named.over && moved === null) setNamed({ ...named, over: true })
  useEffect(() => {
    if (named !== null) said.add(COORDINATED_OMISSION.id)
  }, [named, said])
  const line = moved !== null && named?.key === key && !named.over ? COORDINATED_OMISSION.line(formatReadout(moved.before / 1000, 1), formatReadout(moved.after / 1000, 1)) : null
  const ruling = run.view.rulings?.[Math.min(shown, (run.view.rulings?.length ?? 1) - 1)]
  return (
    <View2D
      run={run}
      desk={desk}
      moment={line}
      exhibits={
        ruling === undefined ? null : (
          <Suspense fallback={<p role="status">Drawing the corrected run…</p>}>
            <Exhibits ruling={ruling} tools={TOOLS} />
          </Suspense>
        )
      }
    />
  )
}

/** The marks of the drawings, in words: the due tick, the sent tick, the wait a timer from the send never counts, and the selected request. */
function BenchLegend() {
  return (
    <ul className="es-legend es-bench-legend" aria-label="Legend: Broken benchmark" data-bench-legend="">
      <li className="es-legend__entry">
        <DueMark className="es-bench-glyph" />
        <span>
          due<span className="es-bench-legend__more">: when the request was due</span>
        </span>
      </li>
      <li className="es-legend__entry">
        <SentMark className="es-bench-glyph" />
        <span>
          sent<span className="es-bench-legend__more">: when it was sent</span>
        </span>
      </li>
      <li className="es-legend__entry">
        <span className="es-bench-dash" aria-hidden="true" />
        <span>
          wait<span className="es-bench-legend__more"> between due and sent</span>
        </span>
      </li>
      <li className="es-legend__entry">
        <Marker />
        <span>selected request</span>
      </li>
    </ul>
  )
}

/** How to play: the level's own opening line, then the round of one report. */
function HowTo({ prompt }: { prompt: string }) {
  return (
    <div className="flex flex-col gap-3" data-bench-howto="">
      <p>{prompt}</p>
      <ol className="list-decimal pl-5">
        {HOW_TO.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </div>
  )
}
