import { Suspense, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { GameEntry, GameMode, RunRecord, RunResult } from '@es/play'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { useEvidence } from '@/evidence/useEvidence'
import { leftDraft, recordLeft } from '@/games/kit/left'
import type { ProveStamp } from '@/games/kit/record'
import type { GameComponent } from '@/games/registry'
import { ProveContext, type ProveFrame } from './context'
import { PROVE_COPY } from './copy'
import { afterAttempt, aliveAt, BEAT_MS, LAPSE_MS, leftNoteKey, openKey, openRecord, opensWords, proveRef, stakeAt, stakeOf, type OpenRecord, type ProveStake } from './window'
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
 *   3. An attempt that counts is written when Start is pressed (window.ts, `openKey`), and the tab that plays it writes that it is alive
 *      about every 30 seconds. One left before its end, by a reload or by leaving, is written by the page that leaves it as a `play` event
 *      marked left, a miss that the export shows: no seed is drawn again on the same window. Where the page cannot write it (a tab that
 *      was killed), the next page that finds the record lapsed writes it; until the record lapses, a second tab says an attempt is open in
 *      another tab.
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

/** The browser's storage, which a page that is closing can write and a page that is private or locked down may refuse: nothing here depends on it. */
const note = {
  read(ref: string): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(leftNoteKey(ref))
    } catch {
      return null
    }
  },
  write(ref: string, began: string): void {
    try {
      localStorage.setItem(leftNoteKey(ref), began)
    } catch {
      // The record lapses instead.
    }
  },
  clear(ref: string): void {
    try {
      localStorage.removeItem(leftNoteKey(ref))
    } catch {
      // Nothing to take out.
    }
  },
}

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
  // What the page that came before this one wrote as it left: the start of the attempt it left, if it was one (window.ts, `leftNoteKey`).
  const [leftNote, setLeftNote] = useState(() => note.read(ref))
  // The attempt this page has open and not ended or left, and whether it was left already (a page that comes back from the back/forward cache
  // after it was written as left plays on as practice: its attempt was spent). Refs, so that a handler on the page's leaving reads them as they stand.
  const live = useRef<{ at: number; began: string } | null>(null)
  const spent = useRef(false)
  const latest = useRef(evidence)
  useEffect(() => {
    latest.current = evidence
  })

  // What an attempt made now is worth: the ledger's window, with an attempt left before its end (another visit's open record), moved on by
  // this visit's own attempt until the ledger has read it back. While Start's run is on, it is worth what it was worth at Start. A record that
  // another tab wrote, and that is alive, is an attempt open in that tab.
  const stored = openRecord(evidence.working.get(openKey(ref))?.value)
  const foreign: OpenRecord | null = stored === null || mine.has(stored.at) ? null : stored
  const noted = foreign !== null && leftNote === foreign.began
  const elsewhere = foreign !== null && !noted && aliveAt(foreign, now)
  const ledgerStake = evidence.ready ? stakeOf(evidence.events, ref, now, 'play', foreign === null ? null : foreign.at, elsewhere) : null
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
    const counts = attempt !== null ? attempt.counts && !spent.current : stakeAt(stake ?? OPEN, at).counts
    record(result, mode, { counts })
    if (live.current !== null) void evidence.deleteWorking(openKey(ref))
    live.current = null
    setAttempt(null)
    setPlayed({
      record: result.record,
      at,
      ok: result.grade.ok,
      counted: counts,
    })
    setNow(at)
  }

  // The tab that plays an attempt that counts writes that it is alive, so that a second tab can tell an attempt that is open from one that was left.
  useEffect(() => {
    if (attempt === null || !attempt.counts) return
    const beat = () => {
      const open = live.current
      if (open === null) return
      void latest.current.setWorking(openKey(ref), { at: open.began, beat: new Date(clock()).toISOString() })
    }
    const timer = window.setInterval(beat, BEAT_MS)
    document.addEventListener('visibilitychange', beat)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [attempt, ref])

  // An attempt left before its end is written as a play event marked left, and its open record taken out. This page does it when it is left
  // (Leave Prove mode, Back, a reload, the page closed); a record that a tab left behind is settled by the next page that finds it lapsed.
  useEffect(() => {
    const leave = () => {
      const open = live.current
      if (open === null) return
      live.current = null
      spent.current = true
      note.write(ref, open.began)
      void recordLeft({ game: entry.id, level, began: open.began, prove: { counts: true } }).then((written) => {
        if (written.ok) {
          void latest.current.deleteWorking(openKey(ref))
          note.clear(ref)
        }
      })
    }
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [entry.id, level, ref])

  // Another tab's record, once it lapses: written as left here. The page that finds it asks again at the moment it lapses.
  const lapsesIn = foreign === null || !evidence.ready ? null : noted ? 0 : foreign.beat + LAPSE_MS - now
  const foreignBegan = foreign === null ? null : foreign.began
  const settling = useRef<string | null>(null)
  useEffect(() => {
    if (lapsesIn === null || !evidence.ready || foreignBegan === null) return
    if (lapsesIn > 0) {
      const timer = window.setTimeout(() => setNow(clock()), lapsesIn + 50)
      return () => window.clearTimeout(timer)
    }
    // The record is settled once by this page, and by a second tab that settles it too only if it has not yet seen the event.
    const began = foreignBegan
    if (settling.current === began) return
    settling.current = began
    const written = evidence.events.some((event) => event.kind === 'play' && event.ref === ref && event.data.left === began)
    void (async () => {
      if (!written) {
        const added = await latest.current.append(await leftDraft({ game: entry.id, level, began, prove: { counts: true } }))
        if (!added.ok) {
          settling.current = null
          return
        }
      }
      await latest.current.deleteWorking(openKey(ref))
      note.clear(ref)
      setLeftNote(null)
    })()
  }, [lapsesIn, evidence.ready, evidence.events, foreignBegan, entry.id, level, ref])

  const back = `/play/${entry.id}?level=${level}`
  const when = stake?.opensAt === null || stake?.opensAt === undefined ? null : opensWords(stake.opensAt, now)

  /** What the run that ended was worth, and when the next attempt that counts opens. */
  const resultLine = (done: Played): string => {
    const words = when ?? ''
    if (done.counted) return done.ok ? PROVE_COPY.proved(words) : PROVE_COPY.missed(words)
    return when === null ? PROVE_COPY.practiceOpen : PROVE_COPY.practice(words)
  }

  const frame: ProveFrame = {
    level,
    hidden: (
      <p className="es-prove__hidden" data-prove-hidden="">
        {PROVE_COPY.hidden}
      </p>
    ),
    // The foot strip says what the run on is worth while it is on; at its result it speaks of the run that ended and of the next one, in the
    // result's own words, and never of the run that ended as if it were the next.
    foot: (run: RunRecord | null) => (
      <span className="es-prove__foot" data-prove-foot="">
        <span>
          {run !== null && played !== null && played.record === run
            ? resultLine(played)
            : stake === null || stake.counts || when === null
              ? PROVE_COPY.footCounts
              : PROVE_COPY.footPractice(when)}
        </span>
        <Link className="es-link" to={back}>
          {PROVE_COPY.leave}
        </Link>
      </span>
    ),
    after: (run: RunRecord) => {
      if (played === null || played.record !== run) return null
      return (
        <p className="es-prove__after" role="status" data-prove-after={played.counted ? (played.ok ? 'proved' : 'missed') : 'practice'}>
          {resultLine(played)}
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
        // Start waits for the ledger: an attempt begun before the record of past ones is read would count on a guess.
        if (stake === null) return
        const at = clock()
        // The attempt is written as it starts, when it counts: one left before its end is then a miss, not a fresh draw.
        const counts = stakeAt(stake, at).counts
        if (counts) {
          mine.add(at)
          const began = new Date(at).toISOString()
          live.current = { at, began }
          spent.current = false
          void evidence.setWorking(openKey(ref), { at: began, beat: began })
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
        : stake.last?.elsewhere === true
          ? PROVE_COPY.waitElsewhere(when)
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
          <PrimaryButton disabled={!attested || stake === null} onClick={onStart}>
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
