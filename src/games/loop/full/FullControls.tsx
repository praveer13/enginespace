import clsx from 'clsx'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { FULL_COPY } from '@es/play/loop/full/copy'
import { MODES } from '@es/play/loop/full/levels'
import type { FullView, LeverName, Prediction } from '@es/play/loop/full/types'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Marker } from '@/design/components/Marker'
import { Stub } from '@/design/components/Stub'
import { Toggle } from '@/design/components/Toggle'
import { formatReadout } from '@/design/format'
import { Us } from './FullView2D'
import { tagOf } from './tags'
import type { FullRun } from './types'
import { useFullControls, type AutoToggleRef } from './useFullControls'
import { NightVerdict } from './NightVerdict'

export type { AutoToggleRef } from './useFullControls'

/*
 * The full levels' dock (REDESIGN §2.6, §3.7): HTML for every action, so a pointer, a keyboard and a screen reader reach the same things.
 * In order down the dock, as a stage is played:
 *   - the stage's tabs (`[` and `]`), when the level has more than one, and what the stage asks;
 *   - the prediction, which the session needs before the stage's first run: a number, or one of a few choices, committed once;
 *   - once it is committed, the stage's levers, each a row: the async scheduling switch, the V2 runner, the grammar mask's switch, the graph
 *     mode as radios, and the capture sizes as a row of toggle buttons;
 *   - Step, Auto and "Run to the end" (a closed-book stage has one control, which runs the whole stage at once);
 *   - the runs the stage has served, each against the reference's.
 * Where the first run points at a lever or at Step, the marker's ring is on it, and Step's amber waits (One Marker Rule).
 */

const UNIT_WORD: Readonly<Record<Extract<Prediction, { kind: 'number' }>['unit'], string>> = { µs: 'µs', launches: 'launches', steps: 'steps', '%': 'per cent' }

/** Where focus goes once the prediction is committed: the stage's first lever, or Step. */
function focusNext() {
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-full-levers] :is(button, [role="switch"]):not(:disabled), [data-full-step] button:not(:disabled)')?.focus())
}

/** The control the first run points at, in the marker's ring; any other control as it is. */
function Ringed({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return children
  return (
    <Marker kind="ring" word="first move" className="es-loopdock__ring">
      {children}
    </Marker>
  )
}

const ringLever = (run: FullRun, name: string): boolean => run.intro.ring?.t === 'lever' && run.intro.ring.name === name

/** The stage's prediction: asked before the first run, then shown beside the model's answer once a run is served. */
function PredictionBlock({ run }: { run: FullRun }) {
  const { view } = run
  const stage = view.stage
  const prediction = stage.prediction
  const [draft, setDraft] = useState('')
  const [choice, setChoice] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const groupId = useId()
  const commit = () => {
    if (prediction.kind === 'number') {
      const value = Number(draft.replace(/[\s,]/g, ''))
      if (draft.trim() === '' || !Number.isFinite(value) || value < 0) {
        setError('Write a whole number of at least 0, then commit it.')
        return
      }
      run.dispatch({ t: 'commit', prediction: Math.round(value) })
    } else {
      if (choice === null) {
        setError('Choose one, then commit it.')
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
      <section className="es-fd__prediction" aria-label="Prediction" data-full-prediction="called">
        <p className="es-fd__question">{prediction.question}</p>
        <p className="es-fd__called">
          You committed <span className="es-full-said">{said(stage.predicted)}</span>.{' '}
          {stage.answer === null ? (
            'The model answers after the first run.'
          ) : (
            <>
              {close ? 'The model agrees: ' : 'The model says '}
              <span className="es-full-said">{said(stage.answer)}</span>.
            </>
          )}
        </p>
      </section>
    )
  }
  return (
    <section className="es-fd__prediction" aria-label="Prediction" data-full-prediction="open">
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
              commit()
            }
          }}
          hint={`In ${UNIT_WORD[prediction.unit]}. It is committed once, before the first run.`}
          error={error ?? undefined}
        />
      ) : (
        <div role="radiogroup" aria-labelledby={groupId} className="es-full-choices" data-native-keys="arrows">
          <p id={groupId} className="es-fd__question">
            {prediction.question}
          </p>
          {prediction.options.map((option, index) => (
            <Button key={option} size="sm" variant={choice === index ? 'ink' : 'plate'} role="radio" aria-checked={choice === index} onClick={() => setChoice(index)}>
              {option}
            </Button>
          ))}
          {error ? <p className="es-fd__error">{error}</p> : null}
        </div>
      )}
      <div>
        <Button variant="ink" onClick={commit} data-full-commit="">
          Commit prediction
        </Button>
      </div>
    </section>
  )
}

/**
 * The capture sizes: a toggle button for each size the stage offers, pressed for a size captured. The arrows walk them. A stage that caps the
 * captures shows vLLM's and SGLang's lists beside it; the ladder of `close` has no cap, because its budget is memory.
 */
function Ladder({ run, locked, ringed }: { run: FullRun; locked: boolean; ringed: boolean }) {
  const { view } = run
  const world = view.stage.sizes
  const ladder = view.stage.ladder
  const [stop, setStop] = useState(0)
  if (ladder === null) return null
  const sizes = view.levers.captureSizes
  const cap = world === null ? null : world.molds
  // A full set refuses another size and says so; no button is disabled, so the arrows walk every size.
  const toggle = (size: number) => {
    const next = sizes.includes(size) ? sizes.filter((s) => s !== size) : [...sizes, size].sort((a, b) => a - b)
    if (cap !== null && next.length > cap) {
      run.announce(`At most ${cap} capture sizes: take one off first.`)
      return
    }
    run.dispatch({ t: 'capture', sizes: next })
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    const next = Math.max(0, Math.min(ladder.length - 1, stop + step))
    setStop(next)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }
  return (
    <fieldset className="es-full-ladder" data-native-keys="arrows" disabled={locked} data-full-ladder="">
      <legend>
        Capture sizes <span className="es-fd__code">· cudagraph_capture_sizes</span>
        <span className="es-fd__sub">{cap === null ? 'Each size takes memory from the KV cache.' : `At most ${cap}: take one off to capture another.`}</span>
      </legend>
      <Ringed on={ringed}>
        <div role="group" aria-label="Capture sizes" onKeyDown={onKey} className="es-full-ladder__row">
          {ladder.map((size, index) => {
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
                data-vllm={world?.vllmLadder.includes(size) || undefined}
                data-sglang={world?.sglangLadder.includes(size) || undefined}
              >
                <span className="font-numeric">{size}</span>
              </Button>
            )
          })}
        </div>
      </Ringed>
      {world === null ? null : (
        <p className="es-fd__sub">
          vLLM’s own list starts <span className="font-numeric">{world.vllmLadder.join(', ')}</span>; SGLang’s decode buckets start <span className="font-numeric">{world.sglangLadder.join(', ')}</span>.
        </p>
      )}
    </fieldset>
  )
}

/** The graph mode as radios: what to ask for, and the mode the backend lets run (or the engine’s refusal). A closed-book stage tells neither until its run is served. */
function Modes({ run, locked }: { run: FullRun; locked: boolean }) {
  const { view } = run
  const groupId = useId()
  const { resolved } = view.stage
  const hidden = view.stage.sealed && !view.stage.closed
  const ring = run.intro.ring
  return (
    <div className="es-full-modes" data-native-keys="arrows" data-full-modes="">
      <p id={groupId} className="es-fd__label">
        CUDA graph mode <span className="es-fd__code">· compilation_config.cudagraph_mode</span>
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="es-full-modes__row">
        {MODES.map((mode) => (
          <Ringed key={mode} on={ring?.t === 'lever' && ring.name === 'graphMode' && ring.value === mode}>
            <Button size="sm" variant={view.levers.graphMode === mode ? 'ink' : 'plate'} role="radio" aria-checked={view.levers.graphMode === mode} aria-keyshortcuts="G" disabled={locked} onClick={() => run.dispatch({ t: 'lever', name: 'graphMode', value: mode })}>
              {mode === 'NONE' ? 'NONE: eager launches' : mode}
            </Button>
          </Ringed>
        ))}
      </div>
      {hidden ? null : (
        <p className={clsx('es-fd__sub', resolved.mode === null && 'es-fd__alert')} data-full-resolved={resolved.mode ?? 'refused'}>
          {resolved.mode === null
            ? `It does not serve: ${resolved.changes[resolved.changes.length - 1]}.`
            : resolved.mode === view.levers.graphMode
              ? `Runs as ${resolved.mode} on this backend (support level ${view.stage.support}).`
              : `Runs as ${resolved.mode}: ${resolved.changes[resolved.changes.length - 1]}.`}
        </p>
      )}
      {view.stage.memory === null ? null : (
        <p className={clsx('es-fd__sub', view.stage.memory.bytes > view.stage.memory.budget && 'es-fd__alert')} data-full-memory="">
          The graphs take <span className="font-numeric">{formatReadout(view.stage.memory.bytes / 1e6, 1)} MB</span>
          <span className="sr-only">, estimated</span> of the <span className="font-numeric">{formatReadout(view.stage.memory.budget / 1e6, 1)} MB</span>
          <span className="sr-only">, estimated</span> the GPU can spare for them.
        </p>
      )}
    </div>
  )
}

/** The stage's levers. A closed-book stage's levers lock once its run is served. */
function Levers({ run }: { run: FullRun }) {
  const { view } = run
  const locked = view.stage.sealed && view.stage.closed
  const set = (name: 'async' | 'runner' | 'maskOverlap' | 'inputIds', value: boolean | string) => run.dispatch({ t: 'lever', name, value })
  const has = (name: LeverName) => view.stage.levers.includes(name)
  return (
    <div className="es-fd__levers" data-full-levers="">
      {has('async') ? (
        <div data-full-async="">
          <Ringed on={ringLever(run, 'async')}>
            <Toggle label="Async scheduling" hint="The CPU schedules the next step while this one runs." checked={view.levers.async} onCheckedChange={(on) => set('async', on)} disabled={locked} />
          </Ringed>
        </div>
      ) : null}
      {has('inputIds') ? (
        <Toggle
          label="Input ids filled on the GPU"
          hint="MRV2 prepares them there. Off, the CPU reads each token back first, which breaks the dependency under async scheduling."
          checked={view.levers.inputIds === 'device'}
          onCheckedChange={(on) => set('inputIds', on ? 'device' : 'host')}
          disabled={locked}
        />
      ) : null}
      {has('runner') ? (
        <div data-full-runner="">
          <Ringed on={ringLever(run, 'runner')}>
            <Toggle label="V2 model runner" hint="MRV2. Off, the legacy V1 runner, whose CPU calls are longer." checked={view.levers.runner === 'mrv2'} onCheckedChange={(on) => set('runner', on ? 'mrv2' : 'v1')} disabled={locked} />
          </Ringed>
        </div>
      ) : null}
      {has('maskOverlap') ? (
        <div data-full-mask="">
          <Ringed on={ringLever(run, 'maskOverlap')}>
            <Toggle label="Build the grammar mask during the forward" hint="Off, it is built after the forward." checked={view.levers.maskOverlap} onCheckedChange={(on) => set('maskOverlap', on)} />
          </Ringed>
        </div>
      ) : null}
      {has('graphMode') ? <Modes run={run} locked={locked} /> : null}
      {has('capture') ? <Ladder run={run} locked={locked} ringed={run.intro.ring?.t === 'capture'} /> : null}
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

/** The runs the stage has served, each against the reference's. */
function Runs({ view }: { view: FullView }) {
  const served = view.stage.served
  if (served.length === 0) return null
  const unit = view.stage.metric === 'capture' ? 'capture cost' : 'clock'
  return (
    <ol className="es-full-nights" aria-label="Runs served" data-full-runs="">
      {served.map((run, i) => (
        <li key={i} data-ok={run.ok || undefined}>
          <span className="es-fd__run-no">Run {i + 1}</span>
          <span>
            {unit} <Us value={run.metric} tag={tagOf(view, 'host')} />
          </span>
          <span className="es-fd__run-word">{run.ok ? 'at the bar' : 'misses the bar'}</span>
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
  const stepRinged = run.intro.ring?.t === 'run'
  return (
    <div className="es-fd" data-full-controls="">
      <Stages run={run} />
      {stage.sealed && !stage.closed ? (
        <p className="es-fd__rule" data-full-rule="">
          <strong>Pass rule:</strong> {FULL_COPY[view.level].passRule} The run is served once, whole, and the live readout waits for it.
        </p>
      ) : null}
      <PredictionBlock run={run} />
      {awaiting ? null : <Levers run={run} />}
      {stage.sealed ? (
        <div className="es-fd__row" data-full-step="">
          <Ringed on={stepRinged}>
            {awaiting ? (
              <Button size="lg" variant="plate" disabled>
                Run it: commit the prediction first
              </Button>
            ) : stage.closed ? (
              <Button size="lg" variant="plate" disabled>
                Run it: the stage is closed
              </Button>
            ) : stepRinged ? (
              <Button size="lg" variant="ink" aria-keyshortcuts="." disabled={!view.canFire} onClick={controls.serve} data-full-serve="">
                Run it
              </Button>
            ) : (
              <Stub standalone onClick={controls.serve} disabled={!view.canFire}>
                Run it
              </Stub>
            )}
          </Ringed>
        </div>
      ) : (
        <div className="es-fd__row" data-full-step="">
          <span className="es-loopdock__step" data-loop-step="">
            <Ringed on={stepRinged}>
              {awaiting ? (
                <Button size="lg" variant="plate" disabled>
                  Step: commit the prediction first
                </Button>
              ) : !view.canFire ? (
                <Button size="lg" variant="plate" disabled>
                  {stage.closed ? 'Step: the stage is closed' : 'Step'}
                </Button>
              ) : stepRinged ? (
                <Button size="lg" variant="ink" aria-keyshortcuts="." onClick={controls.ring}>
                  Step
                </Button>
              ) : (
                <Stub standalone onClick={controls.ring}>
                  Step
                </Stub>
              )}
            </Ringed>
          </span>
          <Button variant="plate" aria-pressed={controls.auto} aria-keyshortcuts="Space" disabled={!view.canFire && !controls.auto} onClick={controls.toggleAuto}>
            Auto
          </Button>
          <Button variant="plate" disabled={!view.canFire} onClick={controls.serve}>
            Run to the end
          </Button>
        </div>
      )}
      {stage.sealed && !stage.closed && !awaiting ? <p className="es-fd__sub">One run, served once, whole. Set the levers from the cards, then run it.</p> : null}
      {stage.closed && !view.done && view.stages.some((s) => !s.closed) ? <p className="es-fd__sub">This stage is closed. Go on to the next stage.</p> : null}
      {stage.sealed ? <NightVerdict view={view} /> : <Runs view={view} />}
    </div>
  )
}
