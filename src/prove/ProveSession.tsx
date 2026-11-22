import { Suspense, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { GameEntry, GameMode, RunRecord, RunResult } from '@es/play'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { useEvidence } from '@/evidence/useEvidence'
import type { ProveStamp } from '@/games/kit/record'
import type { GameComponent } from '@/games/registry'
import { ProveContext, type ProveFrame } from './context'
import { PROVE_COPY } from './copy'
import { afterAttempt, openAt, openKey, opensWords, proveRef, stakeAt, stakeOf, type ProveStake } from './window'
import './prove.css'

/*
 * Prove mode on a game's page (ASSESSMENT §7.2): `/play/<game>?mode=prove` plays the game's Prove level as a graded run, after the learner
 * has closed their coding agent and said so. This chunk loads only with that address, so a game's page carries none of it otherwise.
 *
 *   1. The panel asks the learner to close the agent, says in two sentences why, lists what a Prove run changes, reads from the ledger
 *      whether an attempt made now counts (window.ts), and takes the attestation: a box to tick, then Start.
 *   2. Start mounts the game on its Prove level in graded mode, so its seed is drawn then and not before (each game draws a graded run's
 *      seed when the run starts). The frame reads the Prove run from ProveContext: the readouts are hidden until the result, and the foot
 *      strip says what the attempt is worth.
 *   3. An attempt that counts is written when Start is pressed (window.ts, `openKey`), so one left before its end, by a reload or by
 *      leaving, counts as a miss: no seed is drawn again on the same window.
 *   4. A run that ends is stamped when it ends: `proved` when it counts, passed or not, and `practice` inside the 24 hours after the last
 *      attempt that counted (src/games/kit/record.ts); the run that Start began counts as Start found it. Its open record is then taken
 *      out. The note under the result says which, and when the next attempt that counts opens.
 *
 * The attestation holds for the Prove runs of this visit to the page: a run played again from the result is a Prove run too. Leaving
 * Prove mode, or a run of another level or in practice, records as it would anywhere else.
 */

export interface ProveSessionProps {
  readonly entry: GameEntry
  /** The Prove level: the entry's `prove`. */
  readonly level: string
  readonly Game: GameComponent
  /** The page's recorder (src/games/kit/useRecorder.ts). */
  readonly record: (result: RunResult, mode: GameMode, prove?: ProveStamp) => void
}

/** The newest attempt of this visit: the run it was, when it ended, whether it passed, and whether it counted. */
interface Played {
  readonly record: RunRecord
  readonly at: number
  readonly ok: boolean
  readonly counted: boolean
}

const OPEN: ProveStake = { counts: true, last: null, opensAt: null }

/** The browser's clock, read when a run starts or ends: in a handler, never while the page draws. */
const clock = (): number => Date.now()

export default function ProveSession({ entry, level, Game, record }: ProveSessionProps) {
  const evidence = useEvidence()
  const ref = proveRef(entry.id, level)
  const levelTitle = entry.levels.find((candidate) => candidate.id === level)?.title ?? level
  const [now, setNow] = useState(() => clock())
  const [started, setStarted] = useState(false)
  const [attested, setAttested] = useState(false)
  const [played, setPlayed] = useState<Played | null>(null)
  // The attempt Start began and that has not ended, with whether it counts; and the open records this visit wrote, which are its own.
  const [attempt, setAttempt] = useState<{ readonly at: number; readonly counts: boolean } | null>(null)
  const [mine] = useState(() => new Set<number>())

  // What an attempt made now is worth: the ledger's window, with an attempt left before its end (another visit's open record), moved on by
  // this visit's own attempt until the ledger has read it back. While Start's run is on, it is worth what it was worth at Start.
  const open = openAt(evidence.working.get(openKey(ref))?.value)
  const left = open === null || mine.has(open) ? null : open
  const ledgerStake = evidence.ready ? stakeOf(evidence.events, ref, now, 'play', left) : null
  const stake = attempt !== null ? (attempt.counts ? OPEN : (ledgerStake ?? OPEN)) : played === null ? ledgerStake : afterAttempt(ledgerStake ?? OPEN, played)

  // The run's own `onFinish` (useRun.ts holds the latest, so this reads the stake as it stands when the run ends).
  const onFinish = (result: RunResult, mode: GameMode) => {
    if (mode !== 'graded' || result.record.level !== level) {
      record(result, mode)
      return
    }
    const at = clock()
    // Start's run counts as Start found it. A run played again from the result is judged when it ends, and one that ends before the ledger
    // is read on what is known: no attempt that counted.
    const counts = attempt !== null ? attempt.counts : stakeAt(stake ?? OPEN, at).counts
    record(result, mode, { counts })
    if (attempt?.counts === true) void evidence.deleteWorking(openKey(ref))
    setAttempt(null)
    setPlayed({
      record: result.record,
      at,
      ok: result.grade.ok,
      counted: counts,
    })
    setNow(at)
  }

  const back = `/play/${entry.id}?level=${level}`
  const when = stake?.opensAt === null || stake?.opensAt === undefined ? null : opensWords(stake.opensAt, now)

  const frame: ProveFrame = {
    level,
    hidden: (
      <p className="es-prove__hidden" data-prove-hidden="">
        {PROVE_COPY.hidden}
      </p>
    ),
    foot: (
      <span className="es-prove__foot" data-prove-foot="">
        <span>{stake === null || stake.counts || when === null ? PROVE_COPY.footCounts : PROVE_COPY.footPractice(when)}</span>
        <Link className="es-link" to={back}>
          {PROVE_COPY.leave}
        </Link>
      </span>
    ),
    after: (run: RunRecord) => {
      if (played === null || played.record !== run) return null
      const words = when ?? ''
      const line = played.counted
        ? played.ok
          ? PROVE_COPY.proved(words)
          : PROVE_COPY.missed(words)
        : when === null
          ? PROVE_COPY.practiceOpen
          : PROVE_COPY.practice(words)
      return (
        <p className="es-prove__after" role="status" data-prove-after={played.counted ? (played.ok ? 'proved' : 'missed') : 'practice'}>
          {line}
        </p>
      )
    },
  }

  // Start replaces the panel with the game, and the control that was pressed goes with it: focus goes to the game once it has loaded.
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!started || host.current === null) return
    const box = host.current
    const focus = () => {
      const game = box.querySelector<HTMLElement>('[data-game]')
      if (game === null) return false
      game.focus({ preventScroll: true })
      game.scrollIntoView({ block: 'start' })
      return true
    }
    if (focus()) return
    const watch = new MutationObserver(() => {
      if (focus()) watch.disconnect()
    })
    watch.observe(box, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [started])

  if (started)
    return (
      <div ref={host}>
        <ProveContext.Provider value={frame}>
          <Suspense fallback={<p role="status">Loading {entry.title}…</p>}>
            <Game level={level} mode="graded" onFinish={onFinish} />
          </Suspense>
        </ProveContext.Provider>
      </div>
    )

  return (
    <ProvePanel
      entry={entry}
      levelTitle={levelTitle}
      stake={stake}
      when={when}
      attested={attested}
      onAttest={setAttested}
      onStart={() => {
        const at = clock()
        // The attempt is written as it starts, when it counts: one left before its end is then a miss, not a fresh draw.
        const counts = stakeAt(stake ?? OPEN, at).counts
        if (counts) {
          mine.add(at)
          void evidence.setWorking(openKey(ref), { at: new Date(at).toISOString() })
        }
        setAttempt({ at, counts })
        setNow(at)
        setStarted(true)
      }}
      back={back}
    />
  )
}

interface ProvePanelProps {
  readonly entry: GameEntry
  readonly levelTitle: string
  /** Null while the ledger is read. */
  readonly stake: ProveStake | null
  readonly when: string | null
  readonly attested: boolean
  onAttest(attested: boolean): void
  onStart(): void
  readonly back: string
}

/** The request to close the agent, why, what a Prove run changes, what an attempt now is worth, and the attestation. */
export function ProvePanel({ entry, levelTitle, stake, when, attested, onAttest, onStart, back }: ProvePanelProps) {
  const headingId = useId()
  const boxId = useId()
  const stakeLine =
    stake === null
      ? PROVE_COPY.reading
      : stake.counts || when === null
        ? PROVE_COPY.counts
        : stake.last?.left === true
          ? PROVE_COPY.waitLeft(when)
          : stake.last?.ok === false
            ? PROVE_COPY.waitMissed(when)
            : PROVE_COPY.waitPassed(when)
  return (
    <section
      className="es-prove"
      aria-labelledby={headingId}
      data-prove-panel=""
      data-stake={stake === null ? 'reading' : stake.counts ? 'counts' : 'practice'}
    >
      <nav aria-label="Breadcrumb" className="es-prove__crumb">
        <Link to="/play">Games</Link>
        <span aria-hidden="true"> / </span>
        <Link to={back}>{entry.title}</Link>
      </nav>
      <h2 id={headingId} className="es-prove__title">
        {PROVE_COPY.title(levelTitle)}
      </h2>
      <p className="es-prove__lead">{PROVE_COPY.lead}</p>
      <div className="es-prove__sheet">
        <p className="es-prove__why">{PROVE_COPY.why}</p>
        <h3 className="es-prove__head">{PROVE_COPY.listHead}</h3>
        <ul className="es-prove__list">
          {PROVE_COPY.list.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="es-prove__stake" role="status" data-prove-stake="">
          {stakeLine}
        </p>
        <div className="es-prove__attest">
          <input id={boxId} type="checkbox" className="es-prove__box" checked={attested} onChange={(event) => onAttest(event.target.checked)} />
          <label htmlFor={boxId}>{PROVE_COPY.attest}</label>
        </div>
        <div className="es-prove__actions">
          <PrimaryButton disabled={!attested} onClick={onStart}>
            {PROVE_COPY.start}
          </PrimaryButton>
          <Link className="es-prove__back" to={back}>
            {PROVE_COPY.back}
          </Link>
        </div>
      </div>
    </section>
  )
}
