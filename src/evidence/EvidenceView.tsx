import { useState, type ReactNode } from 'react'
import { KINDS } from '@es/ledger'
import { ContinueLink, type ContinueTarget } from '@/design/components/Header'
import { TextLink } from '@/design/components/TextLink'
import { LEGENDS, ATTEMPT_WORDS, SKILL_WORDS } from '@/progress/words'
import { Button } from '@/design/components/Button'
import { countWords, CONF_WORDS, rateWords, SOURCE_WORDS, SOURCES } from './calibration'
import type { CalibrationRow } from './calibration'
import { KIND_FACTS } from './counts'
import { Count } from './Count'
import type { EventCounts, Tally } from './counts'
import { dayWords } from './rows'
import type { ActivityRow, AttemptCounts, SkillCounts } from './rows'

/*
 * /evidence, drawn as Progress (REDESIGN 2.3, 2.4): what the learner did, as dated rows in words (the day, what they did, how it came out),
 * then the counts those rows add up to, in the words for a skill and for an attempt with a line each that says what the words mean, then the
 * means to keep a copy. A count of the learner's own events is no measurement, so it carries no tag and no stamp.
 *
 * The page derives nothing here: `EvidenceView` takes the rows and counts as props, as the module page's view does, so the server renderer
 * draws any state of it. The way on is `nextStep`'s answer, and "Last time" is `lastTime`'s sentence (src/progress/next.ts).
 */

export interface EvidenceViewProps {
  /** False until the ledger has opened. */
  ready: boolean
  counts: EventCounts
  /** The rows, newest first; null while the course map that names a lesson and a level has not loaded. */
  rows: readonly ActivityRow[] | null
  /** How the skills and the attempts stand; null while the map has not loaded. */
  skills: SkillCounts | null
  attempts: AttemptCounts
  /** How sure the learner said they were, and how often they were right; empty when no tap has been written. */
  calibration?: readonly CalibrationRow[]
  /** The course's modules in order, with their titles; null when the course index has not loaded. */
  modules: readonly { id: string; title: string }[] | null
  /** The way on: where Continue goes, with the sentence that tells the last time's work back. */
  step: (ContinueTarget & { minutes?: number }) | null
  last: string | null
  /** The storage line beside the page: where the evidence is kept. */
  side: ReactNode
  /** The export and import controls. */
  files: ReactNode
}

/** How many dated rows show before the rest are one button away [estimated]. A learner's recent work is what the rows are for. */
export const ROWS_SHOWN = 12

/** The dated rows: the day, what the learner did and, in the lesson where it sits, which, and how it came out. */
export function ActivityTable({ rows }: { rows: readonly ActivityRow[] }) {
  const [all, setAll] = useState(false)
  const shown = all || rows.length <= ROWS_SHOWN ? rows : rows.slice(0, ROWS_SHOWN)
  return (
    <>
      <table className="es-activity" data-table="activity">
        <caption className="sr-only">What you did, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">What you did</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id} data-result={row.result}>
              <td className="es-activity__day">
                <time dateTime={row.day}>{dayWords(row.day)}</time>
              </td>
              <th scope="row" className="es-activity__what">
                <span>{row.what}</span>
                {row.where === undefined && row.kind === undefined ? null : (
                  <span className="es-activity__where">{[row.where, row.kind].filter(Boolean).join(' · ')}</span>
                )}
              </th>
              <td className="es-activity__result">{row.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > ROWS_SHOWN ? (
        <Button variant="plate" size="sm" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? `Show the newest ${ROWS_SHOWN}` : `Show all ${rows.length} rows`}
        </Button>
      ) : null}
    </>
  )
}

/** One small table of counts under the words for a state, and the one line that says what the words mean. */
function WordsTable({ title, legend, rows, total }: { title: string; legend: string; rows: readonly (readonly [word: string, count: number])[]; total?: [string, number] }) {
  return (
    <div className="es-words">
      <table className="es-ledger" data-table={title.toLowerCase()}>
        <caption className="es-words__caption">{title}</caption>
        <tbody>
          {rows.map(([word, count]) => (
            <tr key={word}>
              <th scope="row">{word}</th>
              <td className="es-ledger__n">
                <Count value={count} />
              </td>
            </tr>
          ))}
        </tbody>
        {total === undefined ? null : (
          <tfoot>
            <tr>
              <th scope="row">{total[0]}</th>
              <td className="es-ledger__n">
                <Count value={total[1]} />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      <p className="es-words__legend">{legend}</p>
    </div>
  )
}

export function SkillsTable({ skills }: { skills: SkillCounts }) {
  return (
    <WordsTable
      title="Skills"
      legend={LEGENDS.skill}
      rows={[
        [SKILL_WORDS.none, skills.notStarted],
        [SKILL_WORDS.practised, skills.tried],
        [SKILL_WORDS.earned, skills.passed],
        [SKILL_WORDS.kept, skills.kept],
      ]}
      total={['All skills', skills.total]}
    />
  )
}

export function AttemptsTable({ attempts }: { attempts: AttemptCounts }) {
  return (
    <WordsTable
      title="Attempts"
      legend={LEGENDS.attempt}
      rows={[
        [ATTEMPT_WORDS.no, attempts.notYet],
        [ATTEMPT_WORDS.practice, attempts.practice],
        [ATTEMPT_WORDS.yes, attempts.passed],
      ]}
      total={['All attempts', attempts.notYet + attempts.practice + attempts.passed]}
    />
  )
}

/**
 * Calibration: for each tap (guess, think so, sure) on a question or a prediction, how often it was right, in words, and then the count it
 * rests on. A prediction's two reveals are two groups. It is read from the events and moves nothing: a guess earns no credit.
 */
export function CalibrationTable({ rows }: { rows: readonly CalibrationRow[] }) {
  return (
    <table className="es-ledger es-calibration" data-table="calibration">
      <caption className="sr-only">How often each of your confidence taps was right</caption>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">How it went</th>
          <th scope="col" className="es-ledger__n">
            Count
          </th>
        </tr>
      </thead>
      {SOURCES.map((source) => {
        const group = rows.filter((row) => row.source === source)
        if (group.length === 0) return null
        return (
          <tbody key={source} data-source={source}>
            <tr>
              <th scope="colgroup" colSpan={3} className="es-calibration__group">
                {SOURCE_WORDS[source]}
              </th>
            </tr>
            {group.map((row) => (
              <tr key={row.conf} data-conf={row.conf}>
                <th scope="row">{CONF_WORDS[row.conf]}</th>
                <td>{rateWords(row)}</td>
                <td className="es-ledger__n">{countWords(row)}</td>
              </tr>
            ))}
          </tbody>
        )
      })}
    </table>
  )
}

/** The kinds of event, each with its name, what it is, and how many there are. */
export function KindTable({ all }: { all: Tally }) {
  return (
    <table className="es-ledger" data-table="kind">
      <caption className="sr-only">Events in your record, by kind</caption>
      <thead>
        <tr>
          <th scope="col">Kind</th>
          <th scope="col" className="es-ledger__n">
            Events
          </th>
        </tr>
      </thead>
      <tbody>
        {KINDS.map((kind) => (
          <tr key={kind} data-kind={kind} data-empty={all.kinds[kind] === 0 || undefined}>
            <th scope="row">
              <span className="es-ledger__name">{KIND_FACTS[kind].name}</span>
              <span className="es-ledger__what">{KIND_FACTS[kind].what}</span>
            </th>
            <td className="es-ledger__n">
              <Count value={all.kinds[kind]} />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">All events</th>
          <td className="es-ledger__n">
            <Count value={all.total} />
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

/** The modules in the course's order, with the events under each, and the events that name no module. */
export function ModuleTable({ counts, modules }: { counts: EventCounts; modules: EvidenceViewProps['modules'] }) {
  // Without the index, the modules that have events, in the order the ids sort.
  const rows = modules ?? [...counts.byModule.keys()].sort().map((id) => ({ id, title: '' }))
  return (
    <table className="es-ledger" data-table="module">
      <caption className="sr-only">Events in your record, by module</caption>
      <thead>
        <tr>
          <th scope="col">Module</th>
          <th scope="col" className="es-ledger__n">
            Events
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ id, title }) => {
          const total = counts.byModule.get(id)?.total ?? 0
          return (
            <tr key={id} data-module={id} data-empty={total === 0 || undefined}>
              <th scope="row">
                <span className="es-ledger__name">
                  <TextLink to={`/m/${id}`}>{id}</TextLink>
                </span>
                {title === '' ? null : <span className="es-ledger__what">{title}</span>}
              </th>
              <td className="es-ledger__n">
                <Count value={total} />
              </td>
            </tr>
          )
        })}
        {counts.unplaced.total > 0 ? (
          <tr data-module="none">
            <th scope="row">
              <span className="es-ledger__name">No module</span>
              <span className="es-ledger__what">Traces, GPU labs and acknowledgements belong to no one module.</span>
            </th>
            <td className="es-ledger__n">
              <Count value={counts.unplaced.total} />
            </td>
          </tr>
        ) : null}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">All events</th>
          <td className="es-ledger__n">
            <Count value={counts.all.total} />
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

export function EvidenceView({ ready, counts, rows, skills, attempts, calibration = [], modules, step, last, side, files }: EvidenceViewProps) {
  const empty = ready && counts.all.total === 0
  return (
    <div className="es-page" data-page="evidence">
      <header className="es-page__header">
        <h1 className="es-page__title">Progress</h1>
        <p className="es-page__lead">
          What you have done, in the order you did it, and how each came out. It stays on this device: nothing here is sent anywhere, and nothing is collected.
        </p>
        {step === null ? null : (
          <div className="es-page__way">
            {last === null ? null : <p className="es-page__last">{last}</p>}
            <ContinueLink target={step} emphasis="primary" minutes={step.minutes} />
          </div>
        )}
      </header>
      <div className="es-page__columns">
        <div className="es-page__main">
          <section aria-labelledby="ev-did" className="es-panel">
            <h2 id="ev-did" className="es-panel__title">
              What you did
            </h2>
            {!ready || rows === null ? (
              <p role="status" className="es-panel__lead">
                Reading your record.
              </p>
            ) : empty || rows.length === 0 ? (
              <p className="es-panel__lead">
                Nothing yet. Play a level, answer a question or commit a guess, and it is listed here with its date. Reading and looking write nothing.
              </p>
            ) : (
              <ActivityTable rows={rows} />
            )}
          </section>
          {ready && !empty ? (
            <section aria-labelledby="ev-counts" className="es-panel">
              <h2 id="ev-counts" className="es-panel__title">
                Where that leaves you
              </h2>
              <div className="es-wordsets">
                {skills === null ? null : <SkillsTable skills={skills} />}
                <AttemptsTable attempts={attempts} />
              </div>
            </section>
          ) : null}
          {ready && calibration.length > 0 ? (
            <section aria-labelledby="ev-calibration" className="es-panel">
              <h2 id="ev-calibration" className="es-panel__title">
                How sure you were
              </h2>
              <p className="es-panel__lead">
                Each time you tapped guess, think so or sure, was the answer right? Sure should be right more often than guess. Guesses earn no credit, so this changes no skill; it is only for you.
              </p>
              <CalibrationTable rows={calibration} />
            </section>
          ) : null}
          {ready && !empty ? (
            <section aria-labelledby="ev-kind" className="es-panel">
              <h2 id="ev-kind" className="es-panel__title">
                Everything counted
              </h2>
              <p className="es-panel__lead">What you did, counted. This is not credit: what each counts for depends on how it was made. A game run counts under the module the game belongs to.</p>
              <div className="es-wordsets">
                <KindTable all={counts.all} />
                <ModuleTable counts={counts} modules={modules} />
              </div>
            </section>
          ) : null}
          <section aria-labelledby="ev-gpu" className="es-panel">
            <h2 id="ev-gpu" className="es-panel__title">
              GPU lab results
            </h2>
            <p className="es-panel__lead">
              A lab that runs on your own GPU hands back a result file. <TextLink to="/receipts">Open GPU lab results</TextLink> to get a challenge, bring that file back and see how this browser checked it.
            </p>
          </section>
          <section aria-labelledby="ev-files" className="es-panel">
            <h2 id="ev-files" className="es-panel__title">
              Keep a copy
            </h2>
            <p className="es-panel__lead">Export, import and undo. A file is the only way your progress leaves this browser, and only if you send it somewhere.</p>
            {files}
          </section>
        </div>
        <aside className="es-page__side" aria-label="Where your progress is kept">
          {side}
        </aside>
      </div>
    </div>
  )
}
