/*
 * `useForge(lab, record)`: a forge lab's page as a state machine (ARCHITECTURE §8.3). The learner chooses a file; the hook reads it, loads
 * it into forge.worker, and runs the lab's checks on fresh seeds; a run that counts is written to the ledger through `record`. It owns
 * the host and the worker for as long as the page is open, and stops the worker when the page goes.
 *
 *   idle      nothing chosen yet
 *   reading   a file is being read, hashed and loaded
 *   refused   the file is not a lab module, or is another lab's: nothing ran
 *   running   the checks run one at a time; `results` fills as each finishes
 *   done      the run is over; `recorded` says what became of it, and `readout` is the lab's readout, if it has one and the run earned it
 *
 * The state is a plain value, and ForgeView draws it, so a test draws any state without a worker.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Draft } from '@es/ledger'
import { createHost, type ForgeHost, type LoadedModule } from './host'
import { moduleProblem, RunAborted, runLab, seedsOf, type CheckResult, type LabRun, type SeedMode } from './invoke'
import type { ForgeLab } from './labs'
import { MAX_MODULE_BYTES } from './protocol'
import { runSlotReadout, type ReadoutState } from './readout'
import { labCheckDraft } from './record'
import { browserPool } from './worker-pool'

/** What became of a finished run in the ledger. */
export type Recorded =
  /** Not written, and why: the module is a reference build, or the run told old seeds again. */
  | { kind: 'none'; why: 'reference' | 'replay' | 'partial' }
  /** On its way to the ledger. */
  | { kind: 'pending' }
  /** Written. `durable` is false when the store did not confirm it yet. */
  | { kind: 'saved'; durable: boolean }
  /** The ledger refused or could not be opened. The run is shown all the same, and nothing is lost but the record. */
  | { kind: 'failed'; detail: string }

export interface FileFacts {
  name: string
  bytes: number
}

export type ForgeState =
  | { step: 'idle' }
  | { step: 'reading'; file: FileFacts }
  | { step: 'refused'; file: FileFacts; message: string; sha256?: string }
  | { step: 'running'; file: FileFacts; module: LoadedModule; seeds: SeedMode; results: CheckResult[]; current: { index: number; id: string; seed?: number } | null }
  | { step: 'done'; file: FileFacts; module: LoadedModule; run: LabRun; recorded: Recorded; readout?: ReadoutState }

/** What the hook needs of the ledger: `useEvidence().append`, narrowed to the one event it writes. */
export type RecordRun = (draft: Draft<'lab-check'>) => Promise<{ ok: true; durable: boolean } | { ok: false; detail: string }>

export interface Forge {
  state: ForgeState
  /** Reads, hashes and loads a file, and runs the lab on it. */
  choose(file: File): Promise<void>
  /** Runs the loaded module again, on seeds drawn now. */
  runAgain(): Promise<void>
  /** Runs the loaded module again on the seeds of the last run, to see a failure again. Never recorded. */
  replay(): Promise<void>
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function useForge(lab: ForgeLab, record: RecordRun): Forge {
  const [state, setState] = useState<ForgeState>({ step: 'idle' })
  const host = useRef<ForgeHost | null>(null)
  /** Ends the work of this page when it goes: a run that is still in a worker is abandoned, and writes nothing. */
  const leaving = useRef<AbortController | null>(null)
  const busy = useRef(false)
  // What the click handlers read is the state and the writer of the last commit, kept in refs that an effect updates after each render.
  const latest = useRef(state)
  const recorder = useRef(record)
  useEffect(() => {
    latest.current = state
    recorder.current = record
  })

  useEffect(
    () => () => {
      leaving.current?.abort()
      leaving.current = null
      host.current?.dispose()
      host.current = null
    },
    [],
  )

  const hostOf = (): ForgeHost => (host.current ??= createHost({ pool: browserPool() }))
  const signalOf = (): AbortSignal => {
    if (leaving.current === null || leaving.current.signal.aborted) leaving.current = new AbortController()
    return leaving.current.signal
  }

  /** Runs the loaded module as `mode` says and shows the result; a run that counts is written to the ledger. */
  const run = useCallback(
    async (file: FileFacts, module: LoadedModule, mode: SeedMode, replay?: Record<string, number>) => {
      const results: CheckResult[] = []
      const signal = signalOf()
      setState({ step: 'running', file, module, seeds: mode, results, current: null })
      let finished: LabRun
      try {
        finished = await runLab(hostOf(), lab, module, {
          signal,
          seeds: mode,
          ...(replay === undefined ? {} : { replay }),
          onProgress: (event) => {
            if (event.type === 'check-start') setState({ step: 'running', file, module, seeds: mode, results: [...results], current: { index: event.index, id: event.id, ...(event.seed === undefined ? {} : { seed: event.seed }) } })
            else {
              results.push(event.result)
              setState({ step: 'running', file, module, seeds: mode, results: [...results], current: null })
            }
          },
        })
      } catch (e) {
        // The page went away: there is nothing to show, and nothing to write.
        if (e instanceof RunAborted) return
        setState({ step: 'refused', file, message: messageOf(e), sha256: module.sha256 })
        return
      }
      const draft = labCheckDraft(finished)
      let recorded: Recorded
      if (draft === null) {
        const why = finished.reference ? 'reference' : finished.seeds === 'replay' ? 'replay' : 'partial'
        recorded = { kind: 'none', why }
        setState({ step: 'done', file, module, run: finished, recorded })
      } else {
        setState({ step: 'done', file, module, run: finished, recorded: { kind: 'pending' } })
        try {
          const written = await recorder.current(draft)
          recorded = written.ok ? { kind: 'saved', durable: written.durable } : { kind: 'failed', detail: written.detail }
        } catch (e) {
          recorded = { kind: 'failed', detail: messageOf(e) }
        }
        setState({ step: 'done', file, module, run: finished, recorded })
      }
      // The lab's readout, once the run has earned it. It comes after the record is written, so that a learner who leaves loses nothing, and
      // it holds the page as the run does (`busy`), so that a file chosen in the meantime is not lost to it.
      const wanted = lab.readout
      if (signal.aborted || wanted === undefined || !finished.checks.some((check) => check.id === wanted.after && check.status === 'pass')) return
      setState({ step: 'done', file, module, run: finished, recorded, readout: { status: 'running' } })
      const readout = await runSlotReadout(hostOf())
      // The page went away while the night was being played: its worker was stopped under it, and what it says is not the module's.
      if (signal.aborted) return
      setState({ step: 'done', file, module, run: finished, recorded, readout })
    },
    [lab],
  )

  const choose = useCallback(
    async (file: File) => {
      if (busy.current) return
      busy.current = true
      const facts: FileFacts = { name: file.name, bytes: file.size }
      try {
        if (file.size > MAX_MODULE_BYTES) {
          setState({ step: 'refused', file: facts, message: `This file is larger than the page reads (${MAX_MODULE_BYTES} bytes). A lab module is a few dozen KB: drop the .wasm that the lab's crate builds.` })
          return
        }
        setState({ step: 'reading', file: facts })
        let module: LoadedModule
        const signal = signalOf()
        try {
          module = await hostOf().load(await file.arrayBuffer())
        } catch (e) {
          if (!signal.aborted) setState({ step: 'refused', file: facts, message: messageOf(e) })
          return
        }
        if (signal.aborted) return
        const problem = moduleProblem(lab, module)
        if (problem !== null) {
          setState({ step: 'refused', file: facts, message: problem, sha256: module.sha256 })
          return
        }
        await run(facts, module, 'fresh')
      } finally {
        busy.current = false
      }
    },
    [lab, run],
  )

  const again = useCallback(
    async (mode: SeedMode) => {
      const now = latest.current
      if (busy.current || now.step !== 'done') return
      busy.current = true
      try {
        await run(now.file, now.module, mode, mode === 'replay' ? seedsOf(now.run) : undefined)
      } finally {
        busy.current = false
      }
    },
    [run],
  )

  return {
    state,
    choose,
    runAgain: useCallback(() => again('fresh'), [again]),
    replay: useCallback(() => again('replay'), [again]),
  }
}
