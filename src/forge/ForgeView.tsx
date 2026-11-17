import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Button } from '@/design/components/Button'
import { Icon, type IconName } from '@/design/components/Glyph'
import { PrintingDots } from '@/design/components/PrintingDots'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { Sheet } from '@/design/components/Sheet'
import { Crate, CopyLine } from './Crate'
import { CHECK_BUDGET_MS } from './protocol'
import type { CheckResult, CheckStatus } from './invoke'
import type { KitState } from './kits'
import { HARNESS, TOOLCHAIN, type ForgeLab } from './labs'
import { SlotReadoutSection } from './SlotReadout'
import type { FileFacts, ForgeState } from './useForge'
import { recordedSentence } from './words'

/*
 * A forge lab's page (ARCHITECTURE §3.1, §8.3, REDESIGN §3.9): an ordered list of five steps, in the order the work goes. Download the crate
 * (Crate.tsx), edit its one file, build it, drop the .wasm, and read the checks. The facts of steps 2 and 3 come from the lab's entry
 * (labs.ts), which tests/forge/labs.test.ts holds to the crate's header and to rust-toolchain.toml.
 *
 * It draws the state that useForge.ts keeps: the sheet in step 4 is the drop target and the file chooser, and the run's readout and the
 * checks are step 5. The ink rule marks where the next decision acts: the sheet while there is no module (and after a refusal), and the
 * first check that did not pass. A lab with a readout, `hybrid-kv`'s slot readout, has a section of its own after the steps.
 *
 * It starts nothing itself, so a test draws any state without a worker.
 */

export interface ForgeViewProps {
  lab: ForgeLab
  state: ForgeState
  /** What the manifest says of the lab's zip. Without it the crate waits for the manifest, as it does when the page has just opened. */
  kit?: KitState
  onChoose(file: File): void
  onRunAgain(): void
  onReplay(): void
}

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

/** The module's SHA-256: the name the ledger knows it by. */
function Hash({ sha256 }: { sha256: string }) {
  return (
    <div className="es-forge-hash">
      <span className="es-forge-hash__name">SHA-256</span>
      <code className="es-forge-hash__digits">{sha256}</code>
    </div>
  )
}

/** One step of the list: its number is the list's own, drawn by the sheet, and its heading is the h2 that names the work. */
function Step({ id, title, className, children }: { id: string; title: string; className?: string; children: ReactNode }) {
  const heading = `forge-step-${id}`
  return (
    <li className={className === undefined ? 'es-forge-step' : `es-forge-step ${className}`} aria-labelledby={heading} data-step-id={id}>
      <h2 id={heading} className="es-forge-step__title">
        {title}
      </h2>
      <div className="es-forge-step__body">{children}</div>
    </li>
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
      <p className="es-forge-check__label">
        {check.label} <code className="es-forge-check__id">{check.id}</code>
      </p>
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
        {result === null ? null : <p className="es-forge-check__msg">{same ? 'the same trap as the check above' : result.msg}</p>}
        <p className="es-forge-check__note">
          <span className="es-forge-check__catches">Catches</span> {check.catches}
        </p>
        {result?.seed !== undefined ? (
          <p className="es-forge-check__seed">
            seed <span className="es-forge-seed">{result.seed}</span> {result.fresh ? 'drawn when the run began' : 'told again'}
          </p>
        ) : null}
        {result?.trace !== undefined ? (
          <details className="es-forge-trace">
            <summary>What the module traced</summary>
            <pre tabIndex={0} aria-label={`The trace of ${check.label}`}>
              {result.trace}
            </pre>
          </details>
        ) : null}
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

export function ForgeView({ lab, state, kit = { status: 'loading' }, onChoose, onRunAgain, onReplay }: ForgeViewProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  // The readout holds the page as a run does: a file chosen or a run pulled while the night is being played would be lost to it.
  const night = state.step === 'done' && state.readout?.status === 'running'
  const busy = state.step === 'reading' || state.step === 'running' || night
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
      <Sheet as="section" width="wide" lamp head="Your module" meta={lab.wasm} stub={<PrimaryButton onClick={pick}>Choose a file</PrimaryButton>}>
        <p>Drop the file on this sheet, or choose it. It is read in this tab and never sent anywhere.</p>
      </Sheet>
    )
  } else if (state.step === 'reading') {
    slip = (
      <Sheet as="section" width="wide" head="Your module" meta={state.file.name} state="loading" loadingLabel="Reading the module">
        <FileLine file={state.file} />
      </Sheet>
    )
  } else if (state.step === 'refused') {
    slip = (
      <Sheet
        as="section"
        width="wide"
        lamp
        head="Your module"
        meta={state.file.name}
        title="Not graded"
        titleAs="h3"
        state="error"
        error={state.message}
        stub={<PrimaryButton onClick={pick}>Choose another file</PrimaryButton>}
      >
        <FileLine file={state.file} />
        {state.sha256 === undefined ? null : <Hash sha256={state.sha256} />}
      </Sheet>
    )
  } else {
    slip = (
      <Sheet
        as="section"
        width="wide"
        head="Your module"
        meta={state.module.list.lab}
        title="This module"
        titleAs="h3"
        state={reference ? 'error' : 'default'}
        error={reference ? recorded : undefined}
        stub={
          <PrimaryButton onClick={pick} disabled={busy}>
            Choose another file
          </PrimaryButton>
        }
      >
        <FileLine file={state.file} />
        <Hash sha256={state.module.sha256} />
      </Sheet>
    )
  }

  const crateFolder = `${lab.crate}/`
  return (
    <div className="es-page" data-page="forge" data-lab={lab.id}>
      <header className="es-page__header">
        <h1 className="es-page__title">{lab.title}</h1>
        <p className="es-page__lead">{lab.lead}</p>
      </header>
      <div className="es-forge-layout" data-step={state.step} data-readout={lab.readout === undefined ? undefined : ''}>
        <ol className="es-forge-steps" role="list">
          <Step id="crate" title="Download the crate">
            <Crate lab={lab} kit={kit} />
          </Step>

          <Step id="edit" title="Edit one file">
            <p>
              In <code>{crateFolder}</code>, <code>{lab.edit}</code> is the only file with <code>TODO(you)</code>. Do not edit <code>{HARNESS}</code>: it is the test harness.
            </p>
            {lab.editNote === undefined ? null : <p className="es-forge-hint">{lab.editNote}</p>}
            <p className="es-forge-hint">
              The header of <code>{HARNESS}</code> says which check catches which mistake. <code>cargo test</code> runs the crate&apos;s own checks on your machine, and green there is the time to
              build. Only the run on this page is graded.
            </p>
          </Step>

          <Step id="build" title="Build">
            <p>
              Run this in the folder you unzipped. Rust {TOOLCHAIN.rust} with the <code>{TOOLCHAIN.target}</code> target. <code>rustup</code> installs both from <code>rust-toolchain.toml</code>.
            </p>
            <CopyLine line={lab.build} label="Copy the command" mark="data-build-line" className="es-forge-build" />
            <p className="es-forge-hint">
              The module is <code>target/{TOOLCHAIN.target}/release/{lab.wasm}</code>.
            </p>
          </Step>

          <Step id="drop" title="Drop the .wasm here" className="es-forge-slip">
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
          </Step>

          <Step id="checks" title="The checks" className="es-forge-run">
            <p className="es-forge-step__lead">
              The site sends your module seeded commands, each check to a fresh copy of it, and compares every reply with its own model. What
              <code> cargo test </code>
              says in your terminal is not what is graded here.
            </p>
            <div className="es-forge-checks-row">
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
              <Sheet
                as="section"
                width="full"
                hole={false}
                head="Check run"
                meta={lab.id}
                aria-label="The checks"
                id="forge-checks"
                foot={[
                  'each check: a new copy, and a new seed if it draws one',
                  <span key="limit">
                    limit per check <Readout value={CHECK_BUDGET_MS / 1000} unit="s" tag="estimated" size="sm" />
                  </span>,
                ]}
                stub={
                  state.step === 'done' ? (
                    <PrimaryButton onClick={onRunAgain} disabled={night}>
                      Run on new seeds
                    </PrimaryButton>
                  ) : undefined
                }
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
                    <Button variant="quiet" onClick={onReplay} disabled={night}>
                      Tell these seeds again
                    </Button>
                    <span className="es-forge-hint">A replay of seeds you have seen is never recorded.</span>
                  </div>
                ) : null}
              </Sheet>
            </div>
          </Step>
        </ol>

        {lab.readout === undefined ? null : <SlotReadoutSection lab={lab} state={state} />}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement(lab, state)}
      </p>
    </div>
  )
}
