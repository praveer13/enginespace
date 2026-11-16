import { lazy, Suspense, type ReactNode } from 'react'
import { requestName } from '@es/play/loop/copy'
import { busyGuess, openingLine } from '@es/play/loop/parts'
import type { LoopAction, LoopView } from '@es/play/loop/types'
import { Button } from '@/design/components/Button'
import { Marker } from '@/design/components/Marker'
import { Stub } from '@/design/components/Stub'
import { LoopOverlap } from './LoopOverlap'
import type { LoopRunCore } from './types'
import { useLoopControls, type AutoToggleRef } from './useLoopControls'
import './loop.css'

export type { AutoToggleRef, LoopControls } from './useLoopControls'

// Demo level 3's guess form loads with that level: the question is in the dock at once, and its field arrives with its chunk.
const GuessForm = lazy(() => import('./GuessForm'))

/*
 * The step loop's dock on the demo levels (REDESIGN §2.6, §3.1, §3.5): the line the level opens on, what to do now, the view-only guess on
 * demo level 3, and the controls (Step, Auto, and from level 3 the async scheduling switch). The waiting requests are the chips on the
 * diagram's queue, where the batch they join is drawn; in the 3D view, which draws no chips, the dock lists them as buttons instead.
 *
 * Step is the amber primary button once a slot holds a request, the one control to act on now (the One Marker Rule); until then it is an
 * outline that says why it waits. Where the intro points at Step, the marker's ring carries it instead of the amber fill.
 *
 * `useLoopControls` holds Auto, the announcements and the focus rules, as on the front page; the pieces here draw them.
 */

/** The prompt for the moment: what to do now, in the engine's words. */
function nowLine(view: LoopView): string {
  if (view.done) return 'The level is over: the result is in the dock.'
  const free = view.rail.findIndex((slot) => slot.req === null)
  if (view.canHang && free >= 0 && view.waiting.length > 0) {
    const anyHeld = view.rail.some((slot) => slot.req !== null)
    if (!anyHeld) return `Tap ${requestName(view.waiting[0])} to admit it into slot ${free + 1}.`
    return `Slot ${free + 1} is free: tap a waiting request to admit it, or press Step to leave it empty.`
  }
  if (view.canFire) return 'Press Step to run the next step.'
  return 'Nothing can run now.'
}

export interface ControlsProps {
  run: LoopRunCore
  toggleAutoRef?: AutoToggleRef
  /** List the waiting requests as buttons: for the 3D view, which has no chips to tap. */
  queue?: boolean
  /** The control the intro's ring is on: the first move. */
  ring?: LoopAction | null
  /** Say the line the level opens on: before the first action of a level that opens mid-run. */
  opening?: boolean
}

/** The dock's controls. */
export function Controls({ run, toggleAutoRef, queue = false, ring = null, opening = false }: ControlsProps) {
  const controls = useLoopControls(run, toggleAutoRef)
  const { view } = controls
  const first = opening ? openingLine(view) : null
  const stepRinged = ring?.t === 'run'
  const asyncRinged = ring?.t === 'lever'
  return (
    <div className="es-loopdock" data-loop-controls="">
      {first === null ? null : (
        <p className="es-loopdock__opening" data-loop-opening="">
          {first}
        </p>
      )}
      <p className="es-loopdock__prompt" data-loop-prompt="">
        {nowLine(view)}
      </p>
      <BusyGuess view={view} />
      {queue ? <Waiting view={view} onAdmit={(req) => run.dispatch({ t: 'admit', req })} /> : null}
      <div className="es-loopdock__row">
        <span className="es-loopdock__step" data-loop-step="">
          <Ringed on={stepRinged}>
            <StepControl view={view} primary={!stepRinged} onStep={controls.ring} />
          </Ringed>
        </span>
        {/* Auto: runs steps until the loop needs a decision. A switch that turns itself off; Space works it. */}
        <Button variant="plate" aria-pressed={controls.auto} aria-keyshortcuts="Space" disabled={!view.canFire && !controls.auto} onClick={controls.toggleAuto}>
          Auto
        </Button>
      </div>
      {view.overlapAvailable ? (
        <div className="es-loopdock__row" data-loop-async="">
          <Ringed on={asyncRinged}>
            <LoopOverlap controls={controls} />
          </Ringed>
        </div>
      ) : null}
    </div>
  )
}

/** The waiting requests as buttons, for the 3D view, which draws no chips: each admits its request into the first free slot. */
function Waiting({ view, onAdmit }: { view: LoopView; onAdmit: (req: number) => void }) {
  if (view.waiting.length === 0) return null
  return (
    <ul className="es-loopdock__row" aria-label="Waiting requests" data-loop-waiting="">
      {view.waiting.map((req) => (
        <li key={req}>
          <Button size="sm" variant="plate" disabled={!view.canHang} aria-label={`Admit request ${requestName(req)} into a batch slot`} onClick={() => onAdmit(req)}>
            {requestName(req)}
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** The control the intro points at, in the marker's ring; any other as it is. */
function Ringed({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return children
  return (
    <Marker kind="ring" word="first move" className="es-loopdock__ring">
      {children}
    </Marker>
  )
}

/** Step: the amber primary button once a slot holds a request; before that an outline that says why it waits, and at the end, done. */
function StepControl({ view, primary, onStep }: { view: LoopView; primary: boolean; onStep: () => void }) {
  if (!view.canFire)
    return (
      <Button variant="plate" size="lg" disabled>
        {view.done ? 'Step: the level is over' : 'Step: fill a slot first'}
      </Button>
    )
  if (!primary)
    return (
      <Button variant="ink" size="lg" aria-keyshortcuts="." onClick={onStep}>
        Step
      </Button>
    )
  return (
    <Stub standalone onClick={onStep}>
      Step
    </Stub>
  )
}

/**
 * Demo level 3's guess (REDESIGN §3.1): with async scheduling off, how many of the next step's ticks the GPU is busy for. It is the
 * learner's own, in the view only: nothing dispatches, nothing is stored, and it goes with the level. Its reveal is the model's count.
 */
function BusyGuess({ view }: { view: LoopView }) {
  const guess = busyGuess(view)
  if (guess === null) return null
  return (
    <section className="es-loopdock__guess" aria-label="A guess first" data-loop-guess="">
      <p className="es-loopdock__guess-title">{guess.question}</p>
      <Suspense fallback={null}>
        <GuessForm window={guess.window} reveal={guess.reveal} />
      </Suspense>
      <p className="es-loopdock__note">Your guess stays on this page: nothing records it.</p>
    </section>
  )
}
