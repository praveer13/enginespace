import { useId, type ReactNode } from 'react'
import type { SlotNight, SlotRow } from '@es/sim'
import { Readout } from '@/design/components/Readout'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import type { ForgeLab } from './labs'
import type { ReadoutState } from './readout'
import type { ForgeState } from './useForge'
import { readoutSentence, slotRow, slotWord } from './words'

/*
 * The slot readout of the `hybrid-kv` page (TR5a §5, D-042; readout.ts plays it): the learner's module and a model with fixed adapter slots, on
 * the same seeded night of adapter churn, with the requests each admitted and the adapter loads each made. It is a readout and not a check, so
 * it carries no lamp and no verdict, and it says that it earns nothing. The engine's term leads in the heads and the kitchen's word follows it
 * (GAMES.md §2.6, rule 2). Every count is a count of the synthetic world, and the cells say so.
 *
 * The table is the mirror kit's (src/games/kit/MirrorTable.tsx) in its markup and its print: a ticket, a region that a keyboard reaches, and
 * rows that print as blocks on a narrow sheet, from the same stylesheet. It is written out here and not imported, because the kit's file shares a
 * chunk with the game shell's view switch, and a forge page that imported it would split the two and put about 300 B on the front page's first
 * paint and on every game's route, which D-023's frozen gates leave little room for [measured 2026-11-09 at fe0d66c].
 */

const figure = (value: number) => <span className="es-forge-figure">{formatReadout(value)}</span>

/** The engine's term, and the kitchen's word under it. */
const term = (engine: string, kitchen: string) => (
  <>
    {engine} <span className="es-forge-sub">{kitchen}</span>
  </>
)

interface Column {
  key: 'manager' | 'admitted' | 'loads'
  head: ReactNode
  /** The column's name as plain words, printed beside each cell when a row prints as a block. */
  label: string
  numeric?: boolean
}

const COLUMNS: readonly Column[] = [
  { key: 'manager', head: 'Adapters kept', label: 'Adapters kept' },
  { key: 'admitted', head: term('Admitted requests', 'tickets hung'), label: 'Admitted requests, tickets hung', numeric: true },
  { key: 'loads', head: term('Adapter loads', 'kits brought in'), label: 'Adapter loads, kits brought in', numeric: true },
]

/** A row's head: who it is, and under it what it is. */
const who = (name: string, what: string) => (
  <>
    {name} <span className="es-forge-sub">{what}</span>
  </>
)

interface Row {
  id: string
  manager: ReactNode
  row: SlotRow
}

function rowsOf(night: SlotNight, yours: SlotRow): Row[] {
  return [
    { id: 'yours', manager: who('Your module', 'adapters as pages of the pool'), row: yours },
    ...night.slots.map((slots): Row => {
      const { name, what } = slotRow(slots.slots, night.adapters.length)
      return { id: `slots-${slots.slots}`, manager: who(name, what), row: slots.row }
    }),
  ]
}

/** The night's table, on its own ticket: your module's row and a row for each count of slots, with the figures tagged. */
function NightTable({ night, yours }: { night: SlotNight; yours: SlotRow }) {
  const captionId = useId()
  return (
    <Ticket as="section" width="full" hole={false} foot={['Slot night']} className="es-mirror">
      <div role="region" aria-labelledby={captionId} tabIndex={0} className="es-mirror__region mt-2">
        <table role="table" className="es-mirror__table w-full border-collapse text-left">
          <caption id={captionId} className="es-mirror__caption pb-2 text-left font-bold">
            {`The same night, on your module and on ${slotWord(night.slots.length)} slot models`}
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" role="columnheader" className={`border-b border-edge py-2 pr-4 font-bold${column.numeric ? ' text-right' : ''}`}>
                  {column.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rowsOf(night, yours).map(({ id, manager, row }) => (
              <tr key={id} role="row" className="border-b border-paper-rule">
                <th scope="row" role="rowheader" className="py-2 pr-4 text-left font-normal">
                  {manager}
                </th>
                <td data-label={COLUMNS[1].label} role="cell" className="py-2 pr-4 text-right">
                  <Readout value={row.admitted} tag="synthetic" />
                </td>
                <td data-label={COLUMNS[2].label} role="cell" className="py-2 pr-4 text-right">
                  <Readout value={row.loads} tag="synthetic" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Ticket>
  )
}

function Table({ night, yours, differs }: { night: SlotNight; yours: SlotRow; differs: string | null }) {
  // What the free slots hide: a real slot is as wide as the widest adapter that the engine will accept, and is paid for before the first request.
  const widest = Math.max(...night.adapters.map((adapter) => adapter.pages))
  const biggest = night.slots[night.slots.length - 1]
  const reserved = biggest.slots * widest
  return (
    <>
      <NightTable night={night} yours={yours} />
      <p>
        The night: {figure(night.arrivals)} tickets over {figure(night.steps)} steps, on a pool of {figure(night.spec.poolPages)} pans. Each row is the same engine playing it: it hangs the tickets in the
        order they came, brings in the kit a ticket needs, and when a kit does not fit sends back the kit that no ticket is using. Every figure is a count of the synthetic world.
      </p>
      <p>
        A slot costs no pans here. A real slot is as wide as the widest adapter the engine will accept, and is paid for before the first request: {slotWord(biggest.slots)} slots as wide as the widest kit
        here would take <Readout value={reserved} unit="pages" tag="derived" size="sm" /> of the pool&apos;s {figure(night.spec.poolPages)}. Lesson 4 of TR5a weighs that cost.
      </p>
      {differs === null ? null : (
        <p className="es-forge-hint" data-readout-differs="">
          Your module parts from the model at {differs}. The row counts what your module answered.
        </p>
      )}
    </>
  )
}

export function SlotReadoutSection({ lab, state }: { lab: ForgeLab; state: ForgeState }) {
  const after = lab.readout?.after
  const checkAt = lab.checks.findIndex((check) => check.id === after)
  const done = state.step === 'done' ? state : null
  const readout: ReadoutState | undefined = done?.readout
  const passed = done?.run.checks.some((check) => check.id === after && check.status === 'pass') ?? false

  let body = null
  if (readout?.status === 'running') {
    body = <Ticket as="section" width="full" hole={false} head="Slot night" state="loading" loadingLabel="Playing the night on your module" aria-label="The slot night" />
  } else if (readout?.status === 'ready') {
    body = <Table night={readout.night} yours={readout.yours} differs={readout.yours.differs} />
  } else if (readout?.status === 'failed') {
    body = (
      <Ticket as="section" width="full" hole={false} head="Slot night" state="error" error={`The night could not be played on your module: ${readout.message}`} aria-label="The slot night">
        <p>The checks above stand as they are. Your row is missing, and the slots&apos; rows need no module.</p>
      </Ticket>
    )
  } else if (done !== null && !passed) {
    body = <p className="es-forge-hint">This run did not pass check {checkAt + 1}, so there is no night to play yet.</p>
  }

  return (
    <section aria-labelledby="forge-readout" className="es-panel es-forge-readout" data-readout={readout?.status}>
      <h2 id="forge-readout" className="es-panel__title">
        Measured against the slots
      </h2>
      <p className="es-panel__lead">
        Once check {checkAt + 1} ({lab.checks[checkAt]?.label}) passes, the page plays one night of adapter churn on your module and the same night on a model that keeps adapters in fixed slots, as vLLM and SGLang do at their pins. It counts the
        tickets each admitted and the kits each brought in. It is a readout and not a check: it earns nothing, and it is not written to your ledger.
      </p>
      {body}
      <p className="sr-only" role="status" aria-live="polite">
        {readout?.status === 'ready' ? readoutSentence(readout.night, readout.yours) : ''}
      </p>
    </section>
  )
}
