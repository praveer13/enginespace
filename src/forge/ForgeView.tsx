import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Button } from '@/design/components/Button'
import { Icon, type IconName } from '@/design/components/Glyph'
import { PrintingDots } from '@/design/components/PrintingDots'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket } from '@/design/components/Ticket'
import { CHECK_BUDGET_MS } from './protocol'
import type { CheckResult, CheckStatus } from './invoke'
import type { ForgeLab } from './labs'
import type { FileFacts, ForgeState } from './useForge'
import { recordedSentence } from './words'

/*
 * A forge lab's page (ARCHITECTURE §3.1, §8.3). It draws the state that useForge.ts keeps: the module slip, which is the drop target and
 * the file chooser; the printer's tape, which says what the run found; and the checks, as the lines of one ticket. The heat lamp marks
 * where the next decision acts: the slip while there is no module (and after a refusal), and the first check that did not pass.
 *
 * It starts nothing itself, so a test draws any state without a worker.
 */

export interface ForgeViewProps {
  lab: ForgeLab
  state: ForgeState
  onChoose(file: File): void
  onRunAgain(): void
  onReplay(): void
}

const BUILD = 'cargo build --release --target wasm32-unknown-unknown'

/** The word, mark and icon of each status. A status is never a colour alone: it is a word, a drawn mark and, for a red one, the ribbon's red. */
const STATUS: Record<CheckStatus, { word: string; icon: IconName; bad: boolean }> = {
  pass: { word: 'pass', icon: 'check', bad: false },
  fail: { word: 'fail', icon: 'alert', bad: true },
  trap: { word: 'trap', icon: 'strike', bad: true },
  timeout: { word: 'timeout', icon: 'alert', bad: true },
}

type Row =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'running'; seed?: number }
  | { kind: 'result'; result: CheckResult }

function rowsOf(lab: ForgeLab, state: ForgeState): Row[] {
  return lab.checks.map((_, index): Row => {
    if (state.step === 'done') {
      const result = state.run.checks[index]
      return result === undefined ? { kind: 'idle' } : { kind: 'result', result }
    }
    if (state.step === 'running') {
      const result = state.results[index]
      if (result !== undefined) return { kind: 'result', result }
      if (state.current?.index === index) return { kind: 'running', ...(state.current.seed === undefined ? {} : { seed: state.current.seed }) }
      return { kind: 'waiting' }
    }
    return { kind: 'idle' }
  })
}

/** The file's name and size, as the slip prints them. */
function FileLine({ file }: { file: FileFacts }) {
  return (
    <p className="es-forge-file">
      <span className="es-forge-file__name">{file.name}</span>
      <Readout value={file.bytes} unit="B" tag="measured" size="sm" />
    </p>
  )
}

/** The module's SHA-256, on masking tape: the name the ledger knows it by. */
function Hash({ sha256 }: { sha256: string }) {
  return (
    <div className="es-forge-hash">
      <TapeLabel size="sm" tilt="left">
        sha-256
      </TapeLabel>
      <code className="es-forge-hash__digits">{sha256}</code>
    </div>
  )
}

/**
 * One check, printed as a line of the ticket: its number, what it is, how it came out, and under that what the run found. Several
 * checks of an unfinished module trap in the same place, so a trap that says what the check above said says so, and prints it once.
 */
function CheckLine({ lab, index, row, lamp, same }: { lab: ForgeLab; index: number; row: Row; lamp: boolean; same: boolean }) {
  const check = lab.checks[index]
  const result = row.kind === 'result' ? row.result : null
  const status = result === null ? null : STATUS[result.status]
  return (
    <li className="es-forge-check" data-state={row.kind} data-status={result?.status} data-lamp={lamp || undefined}>
      <span className="es-forge-check__n" aria-hidden="true">
        {index + 1}
      </span>
      <p className="es-forge-check__label">{check.label}</p>
      <span className="es-forge-check__result" data-status={result?.status ?? row.kind}>
        {status !== null && result !== null ? (
          <>
            <Icon name={status.icon} className="es-forge-check__mark" />
            <span>{status.word}</span>
          </>
        ) : row.kind === 'running' ? (
          <>
            <PrintingDots />
            <span className="sr-only">running</span>
          </>
        ) : (
          <span className="es-forge-check__quiet">{row.kind === 'waiting' ? 'waiting' : 'not run'}</span>
        )}
      </span>
      <div className="es-forge-check__detail">
        {result === null ? (
          <p className="es-forge-check__note">{row.kind === 'running' ? 'running' : check.catches}</p>
        ) : (
          <>
            <p className="es-forge-check__msg">{same ? 'the same trap as the check above' : result.msg}</p>
            {result.status === 'fail' ? <p className="es-forge-check__note">Catches: {check.catches}</p> : null}
            {result.seed !== undefined ? (
              <p className="es-forge-check__seed">
                seed <span className="es-forge-seed">{result.seed}</span> {result.fresh ? 'drawn when the run began' : 'told again'}
              </p>
            ) : null}
            {result.trace !== undefined ? (
              <details className="es-forge-trace">
                <summary>What the module traced</summary>
                <pre tabIndex={0} aria-label={`The trace of ${check.label}`}>
                  {result.trace}
                </pre>
              </details>
            ) : null}
          </>
        )}
        {row.kind === 'running' && row.seed !== undefined ? (
          <p className="es-forge-check__seed">
            seed <span className="es-forge-seed">{row.seed}</span>
          </p>
        ) : null}
      </div>
    </li>
  )
}

/** What the tape says of a run: which module, how many checks passed, which seeds were drawn, and what became of it in the ledger. */
function tapeOf(lab: ForgeLab, state: ForgeState): PrinterTapeLine[] {
  if (state.step !== 'running' && state.step !== 'done') return []
  const { module } = state
  const results = state.step === 'done' ? state.run.checks : state.results
  const passed = results.filter((result) => result.status === 'pass').length
  const lines: PrinterTapeLine[] = [
    { id: 'lab', label: 'lab', value: module.list.lab, ...(module.reference ? { tone: 'ink-2' as const } : {}) },
    { id: 'module', label: 'module', value: `${module.sha256.slice(0, 12)}…` },
    {
      id: 'checks',
      label: 'passed',
      value: (
        <>
          <Readout value={passed} tag="measured" size="sm" /> of {lab.checks.length}
        </>
      ),
    },
  ]
  for (const result of results) {
    if (result.seed !== undefined) lines.push({ id: `seed-${result.id}`, label: `seed · ${result.id}`, value: <span className="es-forge-seed">{result.seed}</span> })
  }
  if (state.step === 'done') {
    const { recorded } = state
    const written = recorded.kind === 'saved' || recorded.kind === 'pending'
    lines.push({
      id: 'ledger',
      label: 'ledger',
      value: state.run.reference ? 'no credit' : written ? 'written, unseen' : 'not written',
      ...(state.run.reference || recorded.kind === 'failed' ? { tone: 'ink-2' as const } : {}),
    })
  }
  return lines
}

/** The words a screen reader hears as the page changes. */
function announcement(lab: ForgeLab, state: ForgeState): string {
  switch (state.step) {
    case 'idle':
      return ''
    case 'reading':
      return `Reading ${state.file.name}.`
    case 'refused':
      return `Not graded. ${state.message}`
    case 'running':
      return state.current === null ? `Running ${lab.title}.` : `Running check ${state.current.index + 1} of ${lab.checks.length}.`
    case 'done': {
      const failed = state.run.checks.filter((check) => check.status !== 'pass')
      const head = `${state.run.checks.length - failed.length} of ${state.run.checks.length} checks passed.`
      const first = failed[0]
      return `${head}${first === undefined ? '' : ` First to fix: ${first.label}, ${STATUS[first.status].word}.`} ${recordedSentence(state.recorded, state.run.lab, failed.length === 0)}`
    }
  }
}

export function ForgeView({ lab, state, onChoose, onRunAgain, onReplay }: ForgeViewProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const busy = state.step === 'reading' || state.step === 'running'
  const rows = rowsOf(lab, state)
  const firstRed = state.step === 'done' ? state.run.checks.findIndex((check) => check.status !== 'pass') : -1
  const seeded = state.step === 'done' && state.run.checks.some((check) => check.seed !== undefined)

  const pick = () => input.current?.click()
  const take = (file: File | undefined) => {
    if (file && !busy) onChoose(file)
    // The same file can be chosen again after a rebuild.
    if (input.current) input.current.value = ''
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    take(event.dataTransfer.files[0])
  }
  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
    if (!busy) setOver(true)
  }

  const reference = state.step === 'done' && state.run.reference
  const recorded = state.step === 'done' ? recordedSentence(state.recorded, state.run.lab, state.run.checks.every((check) => check.status === 'pass')) : ''

  let slip: ReactNode
  if (state.step === 'idle') {
    slip = (
      <Ticket as="section" width="wide" lamp head="Module slip" meta={lab.wasm} title="Drop a .wasm" titleAs="h2" stub={<Stub onClick={pick}>Choose a file</Stub>}>
        <p>Build the lab&apos;s crate, then drop the file on this slip. It is read in this tab and never sent anywhere.</p>
        <pre className="es-forge-cmd">
          <code>{BUILD}</code>
        </pre>
        <p className="es-forge-hint">
          The file is <code>target/wasm32-unknown-unknown/release/{lab.wasm}</code>.
        </p>
      </Ticket>
    )
  } else if (state.step === 'reading') {
    slip = (
      <Ticket as="section" width="wide" head="Module slip" meta={state.file.name} state="loading" loadingLabel="Reading the module">
        <FileLine file={state.file} />
      </Ticket>
    )
  } else if (state.step === 'refused') {
    slip = (
      <Ticket
        as="section"
        width="wide"
        lamp
        head="Module slip"
        meta={state.file.name}
        title="Not graded"
        titleAs="h2"
        state="error"
        error={state.message}
        stub={<Stub onClick={pick}>Choose another file</Stub>}
      >
        <FileLine file={state.file} />
        {state.sha256 === undefined ? null : <Hash sha256={state.sha256} />}
      </Ticket>
    )
  } else {
    slip = (
      <Ticket
        as="section"
        width="wide"
        head="Module slip"
        meta={state.module.list.lab}
        title="This module"
        titleAs="h2"
        state={reference ? 'error' : 'default'}
        error={reference ? recorded : undefined}
        stub={
          <Stub onClick={pick} disabled={busy}>
            Choose another file
          </Stub>
        }
      >
        <FileLine file={state.file} />
        <Hash sha256={state.module.sha256} />
      </Ticket>
    )
  }

  return (
    <div className="es-page" data-page="forge" data-lab={lab.id}>
      <header className="es-page__header">
        <h1 className="es-page__title">{lab.title}</h1>
        <p className="es-page__lead">
          {lab.lead} In the engine: {lab.engineTerm}.
        </p>
      </header>
      <div className="es-forge-layout" data-step={state.step}>
        <section aria-label="Your module" className="es-panel es-forge-slip">
          <div className="es-forge-drop" data-over={over || undefined} onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <input
              ref={input}
              type="file"
              accept=".wasm,application/wasm"
              hidden
              aria-label={`The ${lab.wasm} module`}
              onChange={(event) => take(event.target.files?.[0])}
            />
            {slip}
          </div>
        </section>

        <aside className="es-forge-tape" aria-label="The run">
          <PrinterTape
            label="The run, printed"
            lines={tapeOf(lab, state)}
            state={state.step === 'reading' ? 'loading' : state.step === 'refused' ? 'error' : 'default'}
            error={state.step === 'refused' ? 'Nothing ran.' : undefined}
            empty="Nothing printed yet. Drop a module."
            feed={state.step === 'done' ? state.run.checks.length : state.step === 'running' ? state.results.length : undefined}
          />
          <p className="es-forge-recorded" data-kind={state.step === 'done' ? state.recorded.kind : undefined}>
            {reference ? '' : recorded}
          </p>
        </aside>

        <section aria-labelledby="forge-checks" className="es-panel es-forge-run">
          <h2 id="forge-checks" className="es-panel__title">
            Checks
          </h2>
          <p className="es-panel__lead">
            The site sends your module seeded commands, each check to a fresh copy of it, and compares every reply with its own model. What
            <code> cargo test </code>
            says in your terminal is not what is graded here.
          </p>
          <Ticket
            as="section"
            width="full"
            hole={false}
            head="Check run"
            meta={lab.id}
            aria-label="The checks"
            foot={[
              'each check: a new copy, and a new seed if it draws one',
              <span key="limit">
                limit per check <Readout value={CHECK_BUDGET_MS / 1000} unit="s" tag="estimated" size="sm" />
              </span>,
            ]}
            stub={state.step === 'done' ? <Stub onClick={onRunAgain}>Run on new seeds</Stub> : undefined}
          >
            <ol className="es-forge-checks">
              {lab.checks.map((check, index) => {
                const row = rows[index]
                const above = index === 0 ? undefined : rows[index - 1]
                const same =
                  row.kind === 'result' &&
                  row.result.status === 'trap' &&
                  above?.kind === 'result' &&
                  above.result.status === 'trap' &&
                  above.result.msg === row.result.msg
                return <CheckLine key={check.id} lab={lab} index={index} row={row} lamp={index === firstRed} same={same} />
              })}
            </ol>
            {seeded ? (
              <div className="es-forge-again">
                <Button variant="quiet" onClick={onReplay}>
                  Tell these seeds again
                </Button>
                <span className="es-forge-hint">A replay of seeds you have seen is never recorded.</span>
              </div>
            ) : null}
          </Ticket>
        </section>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement(lab, state)}
      </p>
    </div>
  )
}
