import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { FullAction, FullView } from '@es/play/loop/full/types'
import { formatReadout } from '@/design/format'
import { verdictWords } from './tags'
import type { FullRun } from './types'

/*
 * The state behind the full levels' controls (FullControls.tsx): Auto, Step, running the rest of a run, and the line the live region says
 * for each change. A run needs no decision between its steps, so Auto runs it to its end, a step at a time, and Step runs one.
 */

/** The time between two steps in Auto, in ms [estimated]: long enough to read a step go by, short enough that a run of fifty is a minute. */
const AUTO_MS = 650

const RING: FullAction = { t: 'run', until: 'step' }
const SERVE: FullAction = { t: 'run', until: 'decision' }

export type AutoToggleRef = MutableRefObject<(() => void) | null>

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

/** What the live region says for a change of the view: one sentence a turn (A§6.9); the mirror carries every number. */
export function fullChangeLine(before: FullView, after: FullView): string {
  if (before.level !== after.level) return ''
  if (before.at !== after.at) return `${after.stage.title}.`
  const said: string[] = []
  if (before.stage.predicted === null && after.stage.predicted !== null) said.push('Prediction committed.')
  if (after.step !== before.step && after.step > 0) {
    const fire = after.fires[after.fires.length - 1]
    if (fire !== undefined) {
      const tokens = fire.places.filter((place) => place.state === 'plate').length
      said.push(`Step ${after.step}: ${plural(tokens, 'token', 'tokens')}${fire.padded > 0 ? `, ${plural(fire.padded, 'padded place', 'padded places')}` : ''}, ${plural(fire.calls, 'launch', 'launches')}${fire.bubbleUs > 0 ? ', the GPU waited first' : ''}.`)
    }
  }
  if (after.stage.served.length > before.stage.served.length) {
    const night = after.stage.served[after.stage.served.length - 1]
    if (after.stage.verdict !== null) said.push(`The run is served. ${verdictWords(after.stage.verdict)}`)
    else said.push(`The run is served in ${formatReadout(night.metric)} µs against the reference run’s ${formatReadout(after.stage.houseMetric)}: ${night.ok ? 'it meets the bar' : 'it misses the bar'}.`)
  }
  if (!before.done && after.done) said.push('Every stage is closed: the result is ready.')
  return said.join(' ')
}

export interface FullControls {
  readonly run: FullRun
  readonly view: FullView
  readonly auto: boolean
  readonly ring: () => void
  readonly serve: () => void
  readonly toggleAuto: () => void
}

export function useFullControls(run: FullRun, toggleAutoRef?: AutoToggleRef): FullControls {
  const { view, dispatch, announce } = run
  const [auto, setAuto] = useState(false)

  // The live region: a line for every change of the view, once the first has been seen.
  const seen = useRef<FullView | null>(null)
  useEffect(() => {
    const before = seen.current
    seen.current = view
    if (before === null) return
    const line = fullChangeLine(before, view)
    if (line !== '') announce(line)
  }, [view, announce])

  // A stage that closes takes its bell and its levers with it: focus moves on to the next stage still open, or to the debrief's button.
  const closed = view.stage.closed
  const nextOpen = view.stages.find((stage) => !stage.closed)?.id ?? null
  useEffect(() => {
    if (!closed) return
    window.requestAnimationFrame(() => {
      const active = document.activeElement
      if (active !== null && active !== document.body && !(active as HTMLButtonElement).disabled) return
      const target = nextOpen === null ? document.querySelector<HTMLElement>('[data-result-heading]') : document.querySelector<HTMLElement>(`[data-stage-tab="${nextOpen}"]`)
      ;(target ?? document.querySelector<HTMLElement>('[data-game="loop"]'))?.focus({ preventScroll: true })
    })
  }, [closed, nextOpen])

  // Auto rings until the night is over, and turns itself off there (WCAG 2.2.2: it is never on to begin with).
  const running = auto && view.canFire && !view.nightOver && view.nightLevers !== null
  if (auto && !running && view.nightLevers !== null) setAuto(false)
  const { setAutoplay } = run
  useEffect(() => {
    setAutoplay(running)
    if (!running) return undefined
    const timer = window.setTimeout(() => dispatch(RING), AUTO_MS)
    return () => window.clearTimeout(timer)
  }, [running, view, dispatch, setAutoplay])

  const ring = useCallback(() => {
    if (view.canFire) dispatch(RING)
  }, [view.canFire, dispatch])
  const serve = useCallback(() => {
    if (view.canFire) dispatch(SERVE)
  }, [view.canFire, dispatch])
  const toggleAuto = useCallback(() => {
    if (auto) setAuto(false)
    else if (view.canFire) {
      setAuto(true)
      dispatch(RING)
    }
  }, [auto, view.canFire, dispatch])
  useEffect(() => {
    if (toggleAutoRef) toggleAutoRef.current = toggleAuto
    return () => {
      if (toggleAutoRef) toggleAutoRef.current = null
    }
  }, [toggleAutoRef, toggleAuto])

  return { run, view, auto, ring, serve, toggleAuto }
}
