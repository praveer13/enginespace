import { Stamp } from '@/design/components/Stamp'
import { TextLink } from '@/design/components/TextLink'
import type { LockFile } from '@es/schema/lock'
import lock from '../../course.lock.json'
import './panels.css'

/*
 * `/changes`, "Sources and changes" (REDESIGN 2.3): the sources the course pins and when each was last read, and what moved. The pins are the rows of
 * `course.lock.json`, the one file the site build and the grader kit share, read as it is; a pin that moves changes its row here, and nothing else on
 * this page has to. The change cards that say what a moved pin or claim means for what you hold are not published yet, and the page says so.
 * The page's lead is its meta description's sentence (scripts/pages/plan.ts).
 */
const LEAD = 'The sources the course pins, when each was last read, and what has moved.'

const entries = (lock as LockFile).entries

/** What the pin is, in a word the learner uses. */
const KIND_WORDS: Readonly<Record<string, string>> = {
  pypi: 'release',
  git: 'repository',
  blog: 'article',
  tool: 'tool',
}

const kindWord = (kind: string): string => KIND_WORDS[kind] ?? kind

/** A commit as the engines print it: its first seven digits. */
const shortCommit = (commit: string): string => commit.slice(0, 7)

export function Component() {
  return (
    <div className="es-page" data-page="changes">
      <header className="es-page__header">
        <h1 className="es-page__title">Sources and changes</h1>
        <p className="es-page__lead">{LEAD}</p>
      </header>
      <div className="es-page__body">
        <section aria-labelledby="ch-pins" className="es-panel">
          <h2 id="ch-pins" className="es-panel__title">
            What the course pins
          </h2>
          <p className="es-panel__lead">
            Every engine, article and tool a lesson reads is pinned to one version or commit, so a claim means the same thing tomorrow. A pin is checked again when its time is up.
          </p>
          <div className="es-pins">
            <table className="es-ledger" data-table="pins">
              <caption className="sr-only">The pinned sources</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col" className="es-pins__kindcol">
                    Kind
                  </th>
                  <th scope="col">Pinned to</th>
                  <th scope="col">Last read</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.key}>
                    <th scope="row">
                      <TextLink href={entry.url}>{entry.name}</TextLink>
                      {/* A phone has no room for a column of its own: the kind sits under the name. */}
                      <span className="es-pins__kind">{kindWord(entry.kind)}</span>
                    </th>
                    <td className="es-pins__kindcol">{kindWord(entry.kind)}</td>
                    <td>
                      <div className="es-pins__pin">
                        {entry.version === undefined ? null : <span>{entry.version}</span>}
                        {entry.commit === undefined ? null : <code>{shortCommit(entry.commit)}</code>}
                      </div>
                    </td>
                    <td className="es-pins__read">
                      <time dateTime={entry.checkedAt}>{entry.checkedAt}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="es-pins__stamp">
              <Stamp word="measured" source="Each pin was read from its source on the date in its row." />
            </p>
          </div>
        </section>
        <section aria-labelledby="ch-moved" className="es-panel">
          <h2 id="ch-moved" className="es-panel__title">
            What has moved
          </h2>
          <p className="es-panel__lead">
            Change cards, which say what a moved pin or claim means for what you hold, are not published yet. Until they are, every claim in a lesson names its source under the lesson&apos;s
            Sources, with the date it was checked.
          </p>
          <p className="es-panel__lead">
            <TextLink to="/map">Open the course</TextLink>
          </p>
        </section>
      </div>
    </div>
  )
}
