import { useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { Button } from '@/design/components/Button'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { Sheet } from '@/design/components/Sheet'
import { MAX_COMPRESSED_BYTES, MAX_DECOMPRESSED_BYTES } from '@es/verify'
import type { RuleResult } from '@es/verify'
import { IMPORT, VERDICT_WORDS } from './copy'
import type { FileFacts } from './importer'
import { detailAddress, shortHash } from './records'
import { RuleList, VerdictLine } from './Rules'
import type { ImportState } from './useImport'

/*
 * "Bring a receipt back" (ARCHITECTURE §8.4, §8.5; W2-T07): the slip on which the learner drops the file that the grader wrote, or chooses it.
 * The slip is a ticket on the pass, and what comes of the file is printed on it: a file that is not a receipt this browser can read says which
 * rule stopped it, in the ribbon's red, and keeps nothing; a receipt that was read whole is kept, and the rules it passed and failed are
 * listed under what it is worth now (src/receipts/Rules.tsx).
 *
 * The panel draws the state that useImport.ts keeps, and starts nothing itself, so the server renderer draws any state of it. The file is read
 * in a worker on this tab and goes nowhere else (I1). A page that has just checked a file takes focus to the result, since the slip that held
 * the focused control has changed under the learner's keys, and a reader hears the outcome in the status line that is on the page from the start.
 */

export interface ImportPanelProps {
  /** The ledger is open. Until it is, the slip waits. */
  ready: boolean
  /** The ledger will take no write (a newer version of the site has it). */
  readOnly: boolean
  /** The ledger is in memory only: a receipt kept now is gone with the tab. */
  memoryOnly: boolean
  state: ImportState
  onChoose(file: File): void
  onClear(): void
}

/** The file's name and size, as the slip prints them. */
function FileLine({ file }: { file: FileFacts }) {
  return (
    <p className="es-import__file">
      <span className="es-import__name">{file.name}</span>
      <Readout value={file.bytes} unit="B" tag="measured" size="sm" />
    </p>
  )
}

/** The two caps of rule 1, on the slip's foot: they are the site's, and they are estimates. */
function Caps() {
  return (
    <span className="es-import__caps">
      {IMPORT.capsLabel} <Readout value={MAX_COMPRESSED_BYTES / (1024 * 1024)} unit="MB" tag="estimated" size="sm" /> {IMPORT.capsFile} and{' '}
      <Readout value={MAX_DECOMPRESSED_BYTES / (1024 * 1024)} unit="MB" tag="estimated" size="sm" /> {IMPORT.capsInside}
    </span>
  )
}

/** The first rule that failed: what the red line on a refused slip says. */
const firstFailure = (rules: readonly RuleResult[]): string => rules.find((rule) => rule.status === 'fail')?.summary ?? IMPORT.refusedTitle

/** The words a screen reader hears as the slip changes. */
function announcement(state: ImportState): string {
  switch (state.step) {
    case 'idle':
      return ''
    case 'checking':
      return `${IMPORT.checking}: ${state.file.name}.`
    case 'refused':
      return `${IMPORT.refusedTitle}. ${firstFailure(state.rules)} ${IMPORT.refusedNote}`
    case 'failed':
      return `${IMPORT.failedTitle}. ${state.message}`
    case 'kept': {
      const worth = VERDICT_WORDS[state.verdict.provenance]
      return `${state.recheck ? IMPORT.recheckTitle : IMPORT.keptTitle}. ${worth.charAt(0).toUpperCase()}${worth.slice(1)}.`
    }
  }
}

export function ImportPanel({ ready, readOnly, memoryOnly, state, onChoose, onClear }: ImportPanelProps) {
  const input = useRef<HTMLInputElement>(null)
  const result = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)
  const busy = state.step === 'checking'
  const blocked = !ready || readOnly || busy

  const pick = () => input.current?.click()
  const take = (file: File | undefined) => {
    if (file && !blocked) onChoose(file)
    // The same file can be chosen again after it has been mended.
    if (input.current) input.current.value = ''
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    take(event.dataTransfer.files[0])
  }
  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
    if (!blocked) setOver(true)
  }

  // When a check ends, the slip has become another ticket and the control that had focus may be gone: the result takes focus, and a keyboard is
  // where the outcome is. What the panel opened on is a load, and the document's own place is right.
  const was = useRef(state.step)
  useEffect(() => {
    if (was.current === 'checking' && state.step !== 'checking' && state.step !== 'idle') result.current?.focus()
    was.current = state.step
  }, [state.step])

  let slip: ReactNode
  if (state.step === 'idle') {
    slip = (
      <Sheet
        as="div"
        width="full"
        hole={false}
        head={IMPORT.head}
        meta={IMPORT.meta}
        title={IMPORT.drop}
        titleAs="h3"
        foot={[<Caps key="caps" />]}
        stub={
          <Stub onClick={pick} disabled={blocked}>
            {IMPORT.choose}
          </Stub>
        }
      >
        <p>{IMPORT.dropNote}</p>
        {readOnly ? (
          <p className="es-import__warn">
            <Icon name="alert" className="es-import__mark" />
            <span>{IMPORT.readOnly}</span>
          </p>
        ) : !ready ? (
          <p className="es-import__quiet">{IMPORT.waiting}</p>
        ) : memoryOnly ? (
          <p className="es-import__warn">
            <Icon name="alert" className="es-import__mark" />
            <span>{IMPORT.memoryOnly}</span>
          </p>
        ) : null}
      </Sheet>
    )
  } else if (state.step === 'checking') {
    slip = (
      <Sheet as="div" width="full" hole={false} head={IMPORT.head} state="loading" loadingLabel={IMPORT.checking}>
        <FileLine file={state.file} />
      </Sheet>
    )
  } else if (state.step === 'refused') {
    slip = (
      <Sheet
        as="div"
        width="full"
        hole={false}
        head={IMPORT.refusedHead}
        title={IMPORT.refusedTitle}
        titleAs="h3"
        state="error"
        error={firstFailure(state.rules)}
        stub={<Stub onClick={pick}>{IMPORT.chooseAnother}</Stub>}
      >
        <FileLine file={state.file} />
        <p>{IMPORT.refusedNote}</p>
        <RuleList rules={state.rules} label={IMPORT.rulesLabel} />
      </Sheet>
    )
  } else if (state.step === 'failed') {
    slip = (
      <Sheet
        as="div"
        width="full"
        hole={false}
        head={IMPORT.refusedHead}
        title={IMPORT.failedTitle}
        titleAs="h3"
        state="error"
        error={state.message}
        stub={<Stub onClick={pick}>{IMPORT.chooseAnother}</Stub>}
      >
        <FileLine file={state.file} />
        <p>{IMPORT.failedNote}</p>
        {state.rules === undefined ? null : <RuleList rules={state.rules} label={IMPORT.rulesLabel} />}
      </Sheet>
    )
  } else {
    slip = (
      <Sheet
        as="div"
        width="full"
        hole={false}
        head={IMPORT.keptHead}
        title={state.recheck ? IMPORT.recheckTitle : IMPORT.keptTitle}
        titleAs="h3"
        foot={[`Result ${shortHash(state.sha256)}`]}
        stub={<Stub to={detailAddress(state.sha256)}>{IMPORT.open}</Stub>}
      >
        <FileLine file={state.file} />
        <p>{state.recheck ? IMPORT.recheckNote : IMPORT.keptNote}</p>
        <RuleList rules={state.rules} label={IMPORT.rulesLabel} checks={false} />
        <VerdictLine verdict={state.verdict} grader={state.grader} />
      </Sheet>
    )
  }

  return (
    <section aria-labelledby="rc-import" className="es-panel es-import" data-step={state.step}>
      <h2 id="rc-import" className="es-panel__title">
        {IMPORT.title}
      </h2>
      <p className="es-panel__lead">{IMPORT.lead}</p>
      <div className="es-drop" data-over={over || undefined} onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <input
          ref={input}
          type="file"
          accept=".gz,application/gzip,application/x-gzip"
          hidden
          aria-label={IMPORT.inputLabel}
          onChange={(event) => take(event.target.files?.[0])}
        />
        <div ref={result} className="es-import__slip" tabIndex={-1} data-slip={state.step}>
          {slip}
        </div>
      </div>
      {state.step === 'kept' || state.step === 'refused' || state.step === 'failed' ? (
        <div className="es-import__after">
          {state.step === 'kept' ? (
            <Button variant="plate" onClick={pick} disabled={blocked}>
              {IMPORT.chooseAnother}
            </Button>
          ) : null}
          <Button variant="quiet" onClick={onClear}>
            {IMPORT.clear}
          </Button>
        </div>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement(state)}
      </p>
    </section>
  )
}
