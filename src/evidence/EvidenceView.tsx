import type { ReactNode } from 'react'
import { KINDS } from '@es/ledger'
import { MenuLink } from '@/design/components/Board'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { isGradedKind, KIND_FACTS } from './counts'
import type { EventCounts, Tally } from './counts'

/*
 * /evidence, version 0 (ARCHITECTURE §3.1: "the learner's evidence (the Mirror): progress derived from the ledger; export, import
 * and undo"). This first version says what the ledger holds: how many events of each kind, and how many under each module, then
 * the means to keep a copy. It derives nothing about credit. What an event is worth comes from its provenance, and the map and
 * the module pages show those states (W1-T06), so a count here is a count of events written and never a score.
 *
 * `EvidenceView` is the page once it has what it shows, and takes all of it as props, as the module page's view does.
 */

export interface EvidenceViewProps {
  /** False until the ledger has opened. */
  ready: boolean
  counts: EventCounts
  /** The course's modules in order, with their titles; null when the course index has not loaded. */
  modules: readonly { id: string; title: string }[] | null
  /** The printer's tape beside the page: where the evidence is kept. */
  side: ReactNode
  /** The export and import controls. */
  files: ReactNode
}

/** A count: printed through the readout, or a dash where there is none. A total says where it was counted. */
function Count({ value, source }: { value: number; source?: string }) {
  if (value === 0) {
    return (
      <span className="es-ledger__none">
        <span aria-hidden="true">—</span>
        <span className="sr-only">none</span>
      </span>
    )
  }
  return <Readout value={value} tag="measured" source={source} size="sm" />
}

/** The kinds of event, each with its name, what it is, and how many there are. */
export function KindTable({ all }: { all: Tally }) {
  return (
    <table className="es-ledger" data-table="kind">
      <caption className="sr-only">Events in the ledger, by kind</caption>
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
              <span className="es-ledger__name">
                {KIND_FACTS[kind].name} <code className="es-ledger__id">{kind}</code>
                {isGradedKind(kind) ? null : (
                  <TapeLabel size="sm" tilt="none" className="es-ledger__tape">
                    not graded
                  </TapeLabel>
                )}
              </span>
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
            <Count value={all.total} source="in this browser" />
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
      <caption className="sr-only">Events in the ledger, by module</caption>
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
              <span className="es-ledger__what">Traces, forge labs and acknowledgements belong to no one module.</span>
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
            <Count value={counts.all.total} source="in this browser" />
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

export function EvidenceView({ ready, counts, modules, side, files }: EvidenceViewProps) {
  const empty = ready && counts.all.total === 0
  return (
    <div className="es-page" data-page="evidence">
      <header className="es-page__header">
        <h1 className="es-page__title">Evidence</h1>
        <p className="es-page__lead">
          What this browser holds of your graded work. It stays on this device: nothing here is sent anywhere, and nothing is collected.
        </p>
      </header>
      <div className="es-page__columns">
        <div className="es-page__main">
          {!ready ? (
            <Ticket as="section" width="wide" head="The ledger" state="loading" loadingLabel="Printing your evidence" />
          ) : empty ? (
            <Ticket as="section" width="wide" head="The ledger" meta="this browser" title="Nothing in the ledger yet" titleAs="h2">
              <p>Play a level, answer an item or make a prediction, and each graded result lands in this ledger. Reading and looking write nothing.</p>
              <MenuLink />
            </Ticket>
          ) : (
            <>
              <section aria-labelledby="ev-kind" className="es-panel">
                <h2 id="ev-kind" className="es-panel__title">
                  By kind
                </h2>
                <p className="es-panel__lead">Events written, not credit: what an event is worth depends on how it was earned.</p>
                <Ticket as="div" width="full" hole={false} className="es-ledger-ticket">
                  <KindTable all={counts.all} />
                </Ticket>
              </section>
              <section aria-labelledby="ev-module" className="es-panel">
                <h2 id="ev-module" className="es-panel__title">
                  By module
                </h2>
                <p className="es-panel__lead">An event names its module through its ref. A game run counts under the game&apos;s home module.</p>
                <Ticket as="div" width="full" hole={false} className="es-ledger-ticket">
                  <ModuleTable counts={counts} modules={modules} />
                </Ticket>
              </section>
            </>
          )}
          <section aria-labelledby="ev-files" className="es-panel">
            <h2 id="ev-files" className="es-panel__title">
              Keep a copy
            </h2>
            <p className="es-panel__lead">Export, import and undo. A file is the only way evidence leaves this browser, and only if you send it somewhere.</p>
            {files}
          </section>
        </div>
        <aside className="es-page__side" aria-label="The ledger">
          {side}
        </aside>
      </div>
    </div>
  )
}
