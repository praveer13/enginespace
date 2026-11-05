import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import type { EsTrace } from '@es/sim/trace'
import { Readout } from '@/design/components/Readout'
import { formatReadout } from '@/design/format'
import { DEFAULT_SETTINGS } from '@/settings/model'
import { settingsStore } from '@/settings/store'
import { CursorTape } from './CursorTape'
import { KeysSheet } from './KeysSheet'
import { MarksTicket } from './MarksTicket'
import { SpanMirror } from './SpanMirror'
import { Tape } from './Tape'
import { Toolbar } from './Toolbar'
import { TRACE_KEYS } from './keys'
import type { Annotations } from './marks'
import { buildIndex, windowAt } from './model'
import type { Win } from './model'
import { provenanceOf } from './provenance'
import { commandOfKey, initialState, reduce } from './state'
import type { Command, TapeState } from './state'
import { registerTraceProbe } from './test-hook'
import { useSpoken } from './useSpoken'
import { useViewerKeys } from './useViewerKeys'
import './trace.css'

/*
 * The trace viewer (TRACKER W1-T09; GAMES.md §2.6 "The Tape"; ARCHITECTURE §6.1, §6.9): a `trace@1` drawn as the night's tape, with
 * Canvas2D lanes that zoom and pan by keys and buttons, spans that are selected, marked and labelled, a DOM mirror of the spans in
 * the window, keyboard movement from edge to edge, and marks that leave in the shape of a `trace-mark` event's data.
 *
 * It is an instrument and not a game. It holds no session and writes nothing to the ledger: the marks stay in the component and
 * leave through `onNotesChange`, and a host that grades them (Gap Hunt, the Engine Floor's map) turns them into an event with
 * `traceMarkData` (marks.ts). It never computes the true partition of a step, so it cannot give an answer away.
 *
 * The component is keyed by `traceId`: give a different trace a different id, and the viewer starts afresh on it.
 */

export interface TraceViewProps {
  trace: EsTrace
  /** The trace's id, the `<trace>` of a `trace:<trace>/<task>` ref. It is also the component's key. */
  traceId: string
  /** The heading. Default: what the trace is, from its provenance. */
  title?: string
  /** The heading's level: 2 on its own page, 3 inside a section. */
  headingLevel?: 2 | 3
  /** The window to open on. Default: the first step, with a margin. */
  initialWindow?: Win
  /** Marks and a cause to open with. */
  defaultNotes?: Annotations
  /** Called when the marks or the cause change. */
  onNotesChange?: (notes: Annotations) => void
  /** A tape to read: no marking, no tag plates, no label. */
  readOnly?: boolean
  /**
   * The line under the heading, in place of the one that the tape's provenance gives. For a synthetic tape that one names the step-loop
   * model, so a host whose tape is another model's (Back of House's lifecycle tape) says what it is here. It must still say that the
   * tape is synthetic and no measurement; the viewer cannot check it.
   */
  about?: string
  /** Whether the marks ticket is on the page (default yes). A host with nothing to mark and no unaccounted counter to keep leaves it out. */
  marks?: boolean
  /** Whether the keys are bound. The learner's setting ("Game keys", WCAG 2.1.4) turns them off as well. */
  shortcuts?: boolean
}

/** How long after the last continuous move the span table lists the window the tape shows [estimated]. */
const MIRROR_SETTLE_MS = 150

export function TraceView(props: TraceViewProps) {
  return <Viewer key={props.traceId} {...props} />
}

function Viewer({ trace, traceId, title, headingLevel = 2, initialWindow, defaultNotes, onNotesChange, readOnly = false, about, marks = true, shortcuts = true }: TraceViewProps) {
  const index = useMemo(() => buildIndex(trace), [trace])
  const provenance = useMemo(() => provenanceOf(trace.meta), [trace])
  const [state, dispatch] = useReducer(
    (current: TapeState, command: Command) => reduce(current, command, index, { readOnly }),
    undefined,
    () => initialState(index, { window: initialWindow, notes: defaultNotes, readOnly }),
  )
  const headingId = useId()
  const labelId = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  const [keysOpen, setKeysOpen] = useState(false)
  // What the reducer says goes to the live region, a sentence at a time.
  const spoken = useSpoken(state.say)

  // The marks leave through the host's callback, and not on the first render.
  const reported = useRef(state.notes)
  useEffect(() => {
    if (reported.current === state.notes) return
    reported.current = state.notes
    onNotesChange?.(state.notes)
  }, [state.notes, onNotesChange])

  // The learner's "Game keys" setting (WCAG 2.1.4). It is read from the store that the entry holds, as `useSettings` does, so that
  // this page does not share a module with the game kit that the front page's first paint would then have to load apart (A§11.1).
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, () => DEFAULT_SETTINGS)
  const keysOn = shortcuts && settings.gameKeys

  // A key and a plate are the same command. Help and the label field are the component's; the rest go to the reducer.
  const latest = useRef({ state })
  useEffect(() => {
    latest.current = { state }
  })
  const run = useCallback(
    (id: string): boolean => {
      if (id === 'help') {
        setKeysOpen(true)
        return true
      }
      if (id === 'label') {
        const input = document.getElementById(labelId)
        // With no mark to write on, the reducer says so aloud (and on a tape for reading, that it takes no marks).
        if (input instanceof HTMLInputElement && !input.disabled) input.focus()
        else dispatch({ t: 'label', text: '' })
        return true
      }
      // Escape is the browser's and the dialogs' unless there is a mark to let go of.
      if (id === 'cancel' && latest.current.state.pending === null && latest.current.state.active === null) return false
      const command = commandOfKey(id)
      if (command === null) return false
      dispatch(command)
      return true
    },
    [labelId],
  )
  const container = useViewerKeys({ enabled: keysOn, onCommand: run })

  // The cursor moved by a key or a click: focus goes with it to its row in the table, once the row is there to take it.
  const focused = useRef(state.focusSeq)
  useEffect(() => {
    if (focused.current === state.focusSeq) return
    const button = container.current?.querySelector<HTMLButtonElement>('[data-cursor-row] button[data-row-button]')
    if (button === null || button === undefined) return
    focused.current = state.focusSeq
    button.focus({ preventScroll: true })
  })

  // The test hook: the probe takes the same commands the keys do.
  useEffect(() => {
    return registerTraceProbe({ spans: trace.spans.track.length, window: () => latest.current.state.win, dispatch })
  }, [trace])

  // The table lags the tape while the tape is being panned or zoomed continuously, and takes up the window a moment after it rests.
  useEffect(() => {
    if (state.mirrorWin === state.win) return undefined
    const timer = setTimeout(() => dispatch({ t: 'settle' }), MIRROR_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [state.win, state.mirrorWin])

  const step = windowAt(index, Math.round((state.win.fromNs + state.win.toNs) / 2))
  const heading = title ?? (trace.meta.synthetic ? 'The night’s tape' : 'A captured tape')

  return (
    <section ref={container} tabIndex={-1} aria-labelledby={headingId} className="es-trace" data-trace-view="" data-trace={traceId} data-readonly={readOnly || undefined}>
      <header className="es-trace__head">
        <div>
          <Heading id={headingId} className="es-type-heading">
            {heading}
          </Heading>
          <p className="es-type-body text-text-2">{about ?? provenance.line}</p>
        </div>
        <p className="es-trace__window" data-trace-window="">
          <span>In view</span>
          <Readout value={state.win.toNs - state.win.fromNs} unit="ns" tag={provenance.tag} source={provenance.source} size="sm" />
          {step < 0 ? null : (
            <span>
              Step <span className="font-numeric">{formatReadout(step + 1)}</span> of <span className="font-numeric">{formatReadout(index.steps.length)}</span>
            </span>
          )}
        </p>
      </header>
      <Toolbar state={state} readOnly={readOnly} onCommand={run} />
      <Tape index={index} state={state} dispatch={dispatch} rail={!readOnly} />
      <div className="es-trace__panels">
        <CursorTape index={index} cursor={state.cursor} tag={provenance.tag} source={provenance.source} />
        {marks ? (
          <MarksTicket
            index={index}
            state={state}
            readOnly={readOnly}
            tag={provenance.tag}
            source={provenance.source}
            labelId={labelId}
            dispatch={dispatch}
            onLabelDone={() => container.current?.focus({ preventScroll: true })}
          />
        ) : null}
      </div>
      <SpanMirror index={index} win={state.mirrorWin} cursor={state.cursor} provenance={provenance.word} dispatch={dispatch} />
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-live="line">
        {spoken === null ? null : <span key={spoken.id}>{spoken.text}</span>}
      </div>
      <KeysSheet keys={TRACE_KEYS} open={keysOpen} onOpenChange={setKeysOpen} />
    </section>
  )
}
