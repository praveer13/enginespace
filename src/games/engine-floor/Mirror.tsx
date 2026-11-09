import { useId } from 'react'
import { MECHANISM_ORDER, MECHANISM_WORDS, placeName } from '@es/play/engine-floor/words'
import type { LaidView } from '@es/play/engine-floor/types'
import { Icon } from '@/design/components/Glyph'
import { TextLink } from '@/design/components/TextLink'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { HandoffGlyph } from './HandoffGlyph'
import { permalink } from './text'
import type { FloorRun } from './types'

/*
 * Back of House's mirror (GAMES.md §5 "2D path": "the mirror is the ordered stage table: mechanism, from, to and source"; A§6.9): a DOM
 * table of the whole path, so a screen reader, a zoomed page and a phone read what the drawing shows and nothing is only in the picture.
 * A row for every laid stage lists its hand-off, where it starts and ends, what the last run found of it, and its source once a run has
 * judged it: a citation names a repository, which would tell a stage of the engine from a stage of another before the run says so.
 * Column heads are the engine's terms (GAMES.md §2.6, rule 2), and the cells say them too.
 */

const WORD: Readonly<Record<LaidView['state'], string>> = { ran: 'held', struck: 'stopped the ticket', pending: 'not run yet' }

const COLUMNS: readonly MirrorColumn[] = [
  { key: 'step', head: 'Stage', label: 'Stage' },
  { key: 'mechanism', head: 'Mechanism' },
  { key: 'from', head: 'From' },
  { key: 'to', head: 'To' },
  { key: 'source', head: 'Source' },
]

function rowOf(stage: LaidView, lamp: boolean): MirrorRow {
  const { source } = stage
  return {
    id: `stage-${stage.index}`,
    lamp,
    cells: {
      step: (
        <span className="inline-flex items-center gap-x-2">
          <span className="font-numeric">{String(stage.index + 1).padStart(2, '0')}</span>
          {stage.state === 'ran' ? <Icon name="check" className="size-4 flex-none" /> : stage.state === 'struck' ? <Icon name="strike" className="size-4 flex-none text-paper-ink-2" /> : null}
          <span className={stage.state === 'struck' ? 'text-paper-ink-2' : 'text-text-2'}>{WORD[stage.state]}</span>
        </span>
      ),
      mechanism: (
        <span className="inline-flex items-center gap-1.5">
          <HandoffGlyph mechanism={stage.mechanism} className="size-4 flex-none" />
          {stage.mechanism}
        </span>
      ),
      from: <code className="es-type-mono [overflow-wrap:anywhere]">{placeName(stage.from)}</code>,
      to: <code className="es-type-mono [overflow-wrap:anywhere]">{placeName(stage.to)}</code>,
      source:
        source === null ? (
          <span className="text-text-2">shown once the run has judged it</span>
        ) : (
          <span className="es-type-mono [overflow-wrap:anywhere]">
            <TextLink href={permalink(source)}>{source.path}</TextLink> · {source.symbol} · line <span className="font-numeric">{source.line}</span>
          </span>
        ),
    },
  }
}

/** The key to the marks of the drawing: each hand-off's drawn mark with the kitchen's word and the engine's term. */
function Key() {
  const heading = useId()
  return (
    <details className="max-w-prose" data-floor-key="">
      <summary className="cursor-pointer font-bold" id={heading}>
        The marks on the drawing
      </summary>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2" aria-labelledby={heading}>
        {MECHANISM_ORDER.map((mechanism) => (
          <div key={mechanism} className="col-span-2 grid grid-cols-subgrid items-baseline">
            <dt className="flex items-center gap-2">
              <HandoffGlyph mechanism={mechanism} className="size-5 flex-none" />
              <span className="es-type-ticket text-size-caption">{MECHANISM_WORDS[mechanism].kitchen}</span>
            </dt>
            <dd className="text-text-2">
              <span className="font-bold text-text-1">{MECHANISM_WORDS[mechanism].engine}</span>: {MECHANISM_WORDS[mechanism].does}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

const num = (value: number) => <span className="font-numeric">{value}</span>

export function Mirror({ run }: { run: FloorRun }) {
  const { view } = run
  const laid = view.laid
  // The lamp falls on the present row: the last stage laid, or when a stage stopped the ticket, the last that held.
  const lamp = view.stop === null ? laid.length - 1 : view.reached - 1
  return (
    <div className="flex flex-col gap-6">
      <MirrorTable
        id={run.mirrorId}
        head="Mirror · the path so far"
        caption="Every stage on the path, in order"
        summary={
          <>
            {view.step === 'predict' ? 'The prediction is still to be written. ' : null}
            {num(laid.length)} {laid.length === 1 ? 'stage' : 'stages'} laid{view.sealed ? '' : <>, of the {num(view.stages)} in the engine&apos;s path</>}. {num(view.reached)} held in the last run
            {view.stop === null ? '' : <>, and stage {num(view.stop.at + 1)} stopped the ticket</>}. The ticket stands at{' '}
            <code className="es-type-mono">{placeName(view.capsule)}</code>. Every figure is a count of stages in the model.
          </>
        }
        columns={COLUMNS}
        rows={laid.map((stage) => rowOf(stage, view.step === 'lay' && stage.index === lamp))}
        empty="No stage is laid yet. Write the prediction, then lay the first stage from the tray."
      />
      <Key />
    </div>
  )
}
