import clsx from 'clsx'
import { useId, useState, type KeyboardEvent } from 'react'
import { MODES } from '@es/play/loop/full/levels'
import type { FullView, Prediction } from '@es/play/loop/full/types'
import { Bell } from '@/design/components/Bell'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { Toggle } from '@/design/components/Toggle'
import { formatReadout } from '@/design/format'
import { tagOf } from './tags'
import type { FullRun } from './types'
import { useFullControls, type AutoToggleRef } from './useFullControls'

export type { AutoToggleRef } from './useFullControls'

/*
 * The full service's controls (GAMES.md §3, "Controls"; §2.6, "TR2's levels in the kitchen"): HTML for every action, so a pointer, a
 * keyboard and a screen reader reach the same things. In order down the column, as a stage is played:
 *   - the stage's tabs (`[` and `]`), when the level has more than one;
 *   - the stage's prompt and its cost card;
 *   - the prediction, a ticket the expo calls before the first night: a number on a slip, or one of a few plates, torn off with its stub;
 *   - the stage's levers: switches (async scheduling, the runner, the allergy card's overlap), the mode's plates with the mode the
 *     backend lets run, and the rack's ladder of molds, which the arrows walk;
 *   - the bell (`.`), Auto (Space) and "Serve the rest", which rings the night to its end;
 *   - the nights served, each against the house's.
 */

const UNIT_WORD: Readonly<Record<Extract<Prediction, { kind: 'number' }>['unit'], string>> = { µs: 'µs', calls: 'calls', fires: 'fires' }

/** After the call the ticket prints it and its field goes, so focus moves on to the stage's first lever, or to the bell. */
function focusNext() {
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-full-levers] button:not(:disabled), [data-full-controls] .es-bell__button:not(:disabled)')?.focus())
}

/** The prediction's ticket: called before the first night, then shown beside the model's answer once a night is served. */
function PredictionTicket({ run }: { run: FullRun }) {
  const { view } = run
  const stage = view.stage
  const prediction = stage.prediction
  const [draft, setDraft] = useState('')
  const [choice, setChoice] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const groupId = useId()
  const call = () => {
    if (prediction.kind === 'number') {
      const value = Number(draft.replace(/[\s,]/g, ''))
      if (draft.trim() === '' || !Number.isFinite(value) || value < 0) {
        setError('Write a whole number of at least 0, then call it.')
        return
      }
      run.dispatch({ t: 'commit', prediction: Math.round(value) })
    } else {
      if (choice === null) {
        setError('Choose one, then call it.')
        return
      }
      run.dispatch({ t: 'commit', prediction: choice })
    }
    setError(null)
    focusNext()
  }
  const said = (value: number) => (prediction.kind === 'choice' ? prediction.options[value] : `${formatReadout(value)} ${UNIT_WORD[prediction.unit]}`)
  if (stage.predicted !== null) {
    const close = stage.answer === null ? null : prediction.kind === 'choice' ? stage.predicted === stage.answer : Math.abs(stage.predicted - stage.answer) <= Math.floor((stage.answer * prediction.tolerancePermille) / 1000) + (prediction.unit === 'µs' ? 10 : 0)
    return (
      <Ticket as="section" width="full" hole={false} compact head="Prediction" meta="called" data-full-prediction="called">
        <p>{prediction.question}</p>
        <TicketLine note={<span className="es-full-said">{said(stage.predicted)}</span>}>you called</TicketLine>
        {stage.answer === null ? (
          <TicketLine note={<span className="text-text-2">after the first night</span>}>the model</TicketLine>
        ) : (
          <TicketLine note={<span className="es-full-said">{said(stage.answer)}</span>} tone={close ? 'ink' : 'ink-2'}>
            {close ? 'the model: on the money' : 'the model says'}
          </TicketLine>
        )}
      </Ticket>
    )
  }
  return (
    <Ticket as="section" width="full" hole={false} compact head="Prediction" meta="call it first" lamp stub={<Stub onClick={call}>Call it</Stub>} data-full-prediction="open">
      {prediction.kind === 'number' ? (
        <Field
          label={prediction.question}
          numeric
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              call()
            }
          }}
          hint={`In ${UNIT_WORD[prediction.unit]}. It is called once, before the first night.`}
          error={error ?? undefined}
        />
      ) : (
        <div role="radiogroup" aria-labelledby={groupId} className="es-full-choices" data-native-keys="arrows">
          <p id={groupId}>{prediction.question}</p>
          {prediction.options.map((option, index) => (
            <Button key={option} size="sm" variant={choice === index ? 'ink' : 'plate'} role="radio" aria-checked={choice === index} onClick={() => setChoice(index)}>
              {option}
            </Button>
          ))}
          {error ? <p className="text-paper-ink-2">{error}</p> : null}
        </div>
      )}
    </Ticket>
  )
}

/** The rack's ladder: a plate for each size from 1 to the rail's clips, pressed for a mold on the rack. The arrows walk it. */
function Ladder({ run }: { run: FullRun }) {
  const { view } = run
  const world = view.stage.sizes
  const [stop, setStop] = useState(0)
  if (world === null) return null
  const sizes = view.levers.captureSizes
  // A full rack refuses another mold and says so; no plate is disabled, so the arrows walk every size.
  const toggle = (size: number) => {
    const next = sizes.includes(size) ? sizes.filter((s) => s !== size) : [...sizes, size].sort((a, b) => a - b)
    if (next.length > world.molds) {
      run.announce(`The rack holds ${world.molds} molds: take one off first.`)
      return
    }
    run.dispatch({ t: 'capture', sizes: next })
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    const next = Math.max(0, Math.min(world.ladder.length - 1, stop + step))
    setStop(next)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }
  return (
    <fieldset className="es-full-ladder" data-native-keys="arrows">
      <legend>
        The molds on the rack <span className="text-text-2">· capture sizes, at most {world.molds}: take one off to drill another</span>
      </legend>
      <div role="group" aria-label="Capture sizes" onKeyDown={onKey} className="es-full-ladder__row">
        {world.ladder.map((size, index) => {
          const on = sizes.includes(size)
          return (
            <Button
              key={size}
              size="sm"
              variant={on ? 'ink' : 'plate'}
              aria-pressed={on}
              tabIndex={index === stop ? 0 : -1}
              onClick={() => toggle(size)}
              className="es-full-ladder__size"
              data-vllm={world.vllmLadder.includes(size) || undefined}
              data-sglang={world.sglangLadder.includes(size) || undefined}
            >
              <span className="font-numeric">{size}</span>
            </Button>
          )
        })}
      </div>
      <p className="text-text-2">
        vLLM's own list starts <span className="font-numeric">{world.vllmLadder.join(', ')}</span>; SGLang's decode buckets start <span className="font-numeric">{world.sglangLadder.join(', ')}</span>.
      </p>
    </fieldset>
  )
}

/** The mode's plates: what to ask for, and the mode the backend lets run (or the engine's refusal). */
function Modes({ run }: { run: FullRun }) {
  const { view } = run
  const groupId = useId()
  const { resolved } = view.stage
  return (
    <div className="es-full-modes" data-native-keys="arrows">
      <p id={groupId}>
        The graph mode to ask for <span className="text-text-2">· compilation_config.cudagraph_mode</span>
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="es-full-modes__row">
        {MODES.map((mode) => (
          <Button key={mode} size="sm" variant={view.levers.graphMode === mode ? 'ink' : 'plate'} role="radio" aria-checked={view.levers.graphMode === mode} aria-keyshortcuts="G" onClick={() => run.dispatch({ t: 'lever', name: 'graphMode', value: mode })}>
            {mode === 'NONE' ? 'NONE · call each dish' : mode}
          </Button>
        ))}
      </div>
      <p className={clsx(resolved.mode === null ? 'text-paper-ink-2' : 'text-text-2')} data-full-resolved={resolved.mode ?? 'refused'}>
        {resolved.mode === null
          ? `It does not serve: ${resolved.changes[resolved.changes.length - 1]}.`
          : resolved.mode === view.levers.graphMode
            ? `Runs as ${resolved.mode} on this backend (support ${view.stage.support}).`
            : `Runs as ${resolved.mode}: ${resolved.changes[resolved.changes.length - 1]}.`}
      </p>
      {view.stage.memory === null ? null : (
        <p className="flex flex-wrap items-baseline gap-x-2" data-full-memory="">
          <span>The routines take</span>
          <Readout value={view.stage.memory.bytes / 1e6} digits={1} unit="MB" tag="estimated" size="sm" tone={view.stage.memory.bytes > view.stage.memory.budget ? 'ink-2' : 'ink'} />
          <span>of the</span>
          <Readout value={view.stage.memory.budget / 1e6} digits={1} unit="MB" tag="estimated" size="sm" />
          <span>the reach-in can spare</span>
        </p>
      )}
    </div>
  )
}

/** The stage's levers. */
function Levers({ run }: { run: FullRun }) {
  const { view } = run
  const set = (name: 'async' | 'runner' | 'maskOverlap', value: boolean | string) => run.dispatch({ t: 'lever', name, value })
  return (
    <div className="flex flex-col gap-4" data-full-levers="">
      {view.stage.levers.includes('async') ? (
        <Toggle label="Write the next call during this fire" hint="async scheduling" checked={view.levers.async} onCheckedChange={(on) => set('async', on)} id="full-async" />
      ) : null}
      {view.stage.levers.includes('runner') ? (
        <Toggle label="The V2 runner" hint="MRV2 when on; the legacy V1 runner when off" checked={view.levers.runner === 'mrv2'} onCheckedChange={(on) => set('runner', on ? 'mrv2' : 'v1')} id="full-runner" />
      ) : null}
      {view.stage.levers.includes('maskOverlap') ? (
        <Toggle label="Write the allergy card during the fire" hint="the mask's overlap with the forward" checked={view.levers.maskOverlap} onCheckedChange={(on) => set('maskOverlap', on)} id="full-mask" />
      ) : null}
      {view.stage.levers.includes('graphMode') ? <Modes run={run} /> : null}
      {view.stage.levers.includes('capture') ? <Ladder run={run} /> : null}
    </div>
  )
}

/** The stages of the level, which `[` and `]` move between. */
function Stages({ run }: { run: FullRun }) {
  const { view } = run
  if (view.stages.length < 2) return null
  return (
    <nav aria-label="Stages of the level" className="es-full-stages">
      <ol>
        {view.stages.map((stage, index) => (
          <li key={stage.id}>
            <Button
              size="sm"
              variant={index === view.at ? 'ink' : 'quiet'}
              aria-current={index === view.at ? 'step' : undefined}
              aria-keyshortcuts={index === view.at - 1 ? '[' : index === view.at + 1 ? ']' : undefined}
              data-stage-tab={stage.id}
              onClick={() => run.dispatch({ t: 'stage', to: stage.id })}
            >
              {stage.title}
              <span className="sr-only">{stage.passed ? ', served at the bar' : stage.closed ? ', closed' : ''}</span>
              {stage.passed ? <span aria-hidden="true" className="es-full-stages__done" /> : null}
            </Button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** The nights the stage has served, each against the house's. */
function Nights({ view }: { view: FullView }) {
  const served = view.stage.served
  if (served.length === 0) return null
  const unit = view.stage.metric === 'capture' ? 'capture cost' : 'the night'
  return (
    <ol className="es-full-nights" aria-label="Nights served">
      {served.map((night, i) => (
        <li key={i}>
          <TicketLine
            qty={<span className="font-numeric">{String(i + 1).padStart(2, '0')}</span>}
            note={<Readout value={night.metric} unit="µs" tag={tagOf(view, 'expo')} size="sm" tone={night.ok ? 'ink' : 'ink-2'} />}
            tone={night.ok ? 'ink' : 'ink-2'}
          >
            {night.ok ? `${unit}: at the bar` : `${unit}: misses the bar`}
          </TicketLine>
        </li>
      ))}
    </ol>
  )
}

export function FullControls({ run, toggleAutoRef }: { run: FullRun; toggleAutoRef?: AutoToggleRef }) {
  const controls = useFullControls(run, toggleAutoRef)
  const { view } = run
  const stage = view.stage
  const awaiting = stage.predicted === null
  return (
    <div className="flex flex-col gap-4" data-full-controls="">
      <Stages run={run} />
      <p className="es-type-body max-w-prose" data-full-prompt="">
        {stage.prompt}
      </p>
      <p className="es-full-card">
        <span>{view.synthetic ? 'Small model, a synthetic napkin' : '70B on H100, S5\'s fit at TP 4'}</span>
        <span className="text-text-2"> · the expo's µs estimated</span>
      </p>
      <PredictionTicket run={run} />
      <Levers run={run} />
      <div className="flex flex-wrap items-center gap-4">
        <Bell step={view.step} onRing={controls.ring} disabled={!view.canFire} size="lg" caption="fire" tag={tagOf(view, 'count')} />
        <Button size="lg" variant="plate" aria-pressed={controls.auto} aria-keyshortcuts="Space" disabled={!view.canFire && !controls.auto} onClick={controls.toggleAuto}>
          Auto
        </Button>
        <Button size="lg" variant="plate" disabled={!view.canFire} onClick={controls.serve}>
          Serve the rest
        </Button>
      </div>
      {awaiting ? <p className="text-text-2">Call the prediction first: the bell rings once it is called.</p> : null}
      {stage.closed && !view.done ? <p>This stage is closed. {view.stages.some((s) => !s.closed) ? 'Go on to the next stage.' : ''}</p> : null}
      <Nights view={view} />
    </div>
  )
}
