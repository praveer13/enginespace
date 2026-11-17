import { useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { drawInBand } from '@es/play'
import { compareServices, firesOfRun } from '@es/play/loop/compare'
import { layoutStrip, stripSvg } from '@es/play/loop/strip'
import { loopSession } from '@es/play/loop/session'
import type { FireView, LoopCounters } from '@es/play/loop/types'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { TextLink } from '@/design/components/TextLink'
import { Sheet, SheetLine } from '@/design/components/Sheet'
import { formatReadout } from '@/design/format'
import { LessonRunContext } from '@/games/kit/lessonRun'
import { svgToReact } from './svg'
import type { LoopOutcome, LoopRunCore } from './types'

/*
 * The step loop's debrief and, on the front page, its end card (GAMES.md §3, §3.1): one sentence that says what the run did and the
 * lever worth the most; the counters against the reference run's (the hidden reference, read only here); on the last level the same
 * requests served three ways from the same seed (Compare); the one true thing; and the real engine's numbers beside it, each with its tag.
 *
 * The reference run is the ghost: it plays the same requests, and its clock is the number to beat. Every tick count is synthetic and every row says so
 * (D-048). The real anchor is the one place the page speaks about a real engine, and its numbers are measured and tagged with
 * their source and date (D-012), or derived from those.
 */

export interface DebriefProps {
  run: LoopRunCore
  outcome: LoopOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
}

/** The levers the debrief can name, in the engine's words. */
const LEVER_NAME: Readonly<Record<string, string>> = {
  async: 'Async scheduling: planning the next step while this one runs',
  batching: 'Continuous batching: refilling a slot the moment it frees',
}

/** The one true thing, in a sentence (GAMES.md §3, "Module and concept"). */
const ONE_TRUE_THING =
  'A decode step costs the GPU about the same with one request or four, so the loop earns tokens by keeping every slot live (continuous batching) and by planning the next step while this one runs (overlap, which vLLM calls async scheduling).'

const figure = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>

function CountersTable({ mine, house, par }: { mine: LoopCounters; house: LoopCounters; par: number | null }) {
  const all: [string, number, number][] = [
    ['Clock (ticks, synthetic)', mine.clockUs, house.clockUs],
    ['Output tokens (synthetic)', mine.usefulTokens, house.usefulTokens],
    ['Ghost tokens (synthetic)', mine.ghostTokens, house.ghostTokens],
    ['Bubble (ticks, synthetic)', mine.bubbleUs, house.bubbleUs],
    ['Empty slots, paid for (synthetic)', mine.emptyClipSteps, house.emptyClipSteps],
  ]
  // A counter that is nothing in both runs names a thing the level has not drawn yet (a ghost token, a bubble): it is left out.
  const rows = all.filter(([, a, b], at) => at < 2 || a !== 0 || b !== 0)
  return (
    <div role="region" aria-label="Counters" tabIndex={0} className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="pb-2 text-left font-bold">{par === null ? "Your run against the reference run's" : 'Your run against the reference run, whose clock is the number to beat'}</caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
              Counter
            </th>
            <th scope="col" className="border-b border-edge py-2 pr-4 text-right font-bold">
              Yours
            </th>
            <th scope="col" className="border-b border-edge py-2 text-right font-bold">
              Reference run
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, a, b]) => (
            <tr key={name} className="border-b border-paper-rule">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                {name}
              </th>
              <td className="py-2 pr-4 text-right">{figure(a)}</td>
              <td className="py-2 text-right">{figure(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The same requests served three ways from the same seed, and your run: the lanes side by side on one scale (GAMES.md §2.6, "Compare"). */
function Compare({ seed, mine, clockUs, slots }: { seed: number; mine: readonly FireView[]; clockUs: number; slots: number }) {
  const lanes = useMemo(() => {
    const services = compareServices(seed)
    const scaleTicks = Math.max(clockUs, ...services.map((service) => service.run.summary.clockUs))
    const strip = (fires: readonly FireView[], label: string) => svgToReact(stripSvg(layoutStrip(fires, { slots, scaleTicks, label })))
    return [
      { id: 'mine', heading: 'Your run', gloss: 'the run you just played', clock: clockUs, dark: null as number | null, binned: null as number | null, drawing: strip(mine, 'Your run: the GPU lane, with bubbles between the steps') },
      ...services.map((service) => ({
        id: service.id,
        heading: service.term,
        gloss: service.name,
        clock: service.run.summary.clockUs,
        dark: service.run.summary.bubbleUs as number | null,
        binned: service.run.summary.ghostTokens as number | null,
        drawing: strip(firesOfRun(service.run, slots), `${service.term}: the GPU lane, with bubbles between the steps`),
      })),
    ]
  }, [seed, mine, clockUs, slots])
  return (
    <section aria-label="Compare: the same requests, three schedulers" className="flex flex-col gap-3">
      <h3>The same requests, served three ways</h3>
      <ol className="flex flex-col gap-4">
        {lanes.map((lane) => (
          <li key={lane.id} className="flex flex-col gap-1" data-service={lane.id}>
            <p>
              <strong>{lane.heading}</strong> <span className="text-text-2">· {lane.gloss}</span>
            </p>
            <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full">{lane.drawing}</div>
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <Readout value={lane.clock} unit="ticks" tag="synthetic" size="sm" />
              {lane.dark === null ? null : (
                <span>
                  bubble <span className="font-numeric">{formatReadout(lane.dark)}</span> ticks
                </span>
              )}
              {lane.binned === null ? null : (
                <span>
                  ghost tokens <span className="font-numeric">{formatReadout(lane.binned)}</span>
                </span>
              )}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * The real engine, beside the synthetic world: two measured rows and what follows from them (GAMES.md §3, "The real anchor"). The
 * claims `loop.anchor.*` hold the full setup and the source's own words. A number is a Readout, so each carries its tag.
 */
function RealAnchor(): ReactNode {
  return (
    <Sheet as="section" width="full" hole={false} head="The real engine" meta="not this world" titleAs="h3" title="What a real engine does with more requests">
      <p>
        On H100 GPUs running Llama-3.3-70B in FP8 under vLLM, a heavier load made each token slower, and tokens per second still rose a great deal.
      </p>
      <div role="region" aria-label="Measured rows" tabIndex={0} className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="pb-2 text-left font-bold">Two published rows of the same benchmark</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                Concurrency
                <span className="block text-sm font-normal text-text-2">measured</span>
              </th>
              <th scope="col" className="border-b border-edge py-2 text-right font-bold">
                Time per token
                <span className="block text-sm font-normal text-text-2">ms, measured, InferenceX, published 2025-10-29</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              [4, 11.8],
              [64, 19.5],
            ].map(([concurrency, tpot]) => (
              <tr key={concurrency} className="border-b border-paper-rule">
                <td className="py-2 pr-4">
                  <span className="font-numeric">{concurrency}</span>
                </td>
                <td className="py-2 text-right">
                  <span className="font-numeric">{formatReadout(tpot, 1)}</span> ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SheetLine note={<Readout value={1.66} digits={2} unit="x" tag="derived" size="sm" />}>each token took this much longer</SheetLine>
      <SheetLine note={<Readout value={9.7} digits={1} unit="x" tag="derived" size="sm" />}>tokens per second, estimated as concurrency over each token's time</SheetLine>
      <p className="text-text-2">
        Source: InferenceX official results for Llama-3.3-70B-Instruct-FP8 under vLLM, rows 41187 and 41821. The claims loop.anchor.tpot-conc-4 and loop.anchor.tpot-conc-64 hold the setup and the source's own words, and the two ratios are derived from them.
      </p>
    </Sheet>
  )
}

export function Debrief({ run, outcome, next, onNext }: DebriefProps) {
  const { view } = run
  const { debrief, grade } = outcome
  const mine = view.counters
  const house = outcome.ghostView.counters
  const lever = debrief.names !== null && 'lever' in debrief.names ? LEVER_NAME[debrief.names.lever] : null
  const last = next === null
  // In a lesson the run's way on is the lesson's ("Read why", or its next level), and a run there never offers to leave the lesson.
  const lesson = useContext(LessonRunContext)
  const onward = lesson?.onward ?? null
  // The frame moves focus to the result when the run ends; this chunk loads after that, so it takes focus on to its verdict, unless the
  // learner's focus is already elsewhere.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const here = document.activeElement
    const holder = heading.current?.closest('[data-result]') ?? null
    if (here === null || here === document.body || here === holder) heading.current?.focus({ preventScroll: true })
  }, [])

  function newNumbers() {
    const entropy = crypto.getRandomValues(new Uint32Array(1))[0]
    run.restart(drawInBand(loopSession, 'first-4-par', entropy))
  }

  // The verdict, the one amber control and the sentence head the dock, in that order, flat on its paper and never in a card of their own;
  // the counters and the rest come under them (P5: the result and the way on on one screen).
  return (
    <div className="es-loopdebrief" data-loop-debrief="">
      <div className="es-loopdebrief__head">
        <h3 ref={heading} className="es-loopdebrief__verdict" tabIndex={-1} data-result-heading="" data-verdict={grade.ok ? 'passed' : 'not-yet'}>
          {grade.ok ? 'Passed.' : 'Not yet.'}
        </h3>
        <div className="es-loopdebrief__ways">
          {onward !== null ? (
            <PrimaryButton onClick={() => onward.select()}>{onward.label}</PrimaryButton>
          ) : last ? (
            lesson === null ? (
              <PrimaryButton to="/map">Open the course</PrimaryButton>
            ) : null
          ) : (
            <PrimaryButton onClick={onNext}>{`Next: ${next.title}`}</PrimaryButton>
          )}
        </div>
        <p className="es-loopdebrief__sentence">{debrief.sentence}</p>
      </div>

      <div className="es-loopdebrief__body">
        {lever ? (
          <p>
            <strong>The lever worth the most:</strong> {lever}.
          </p>
        ) : null}
        <CountersTable mine={mine} house={house} par={view.par} />

        {view.level === 'first-4-par' ? <Compare seed={run.seed} mine={view.fires} clockUs={mine.clockUs} slots={view.slots} /> : null}

        <section aria-label="What to take away" className="flex flex-col gap-2">
          <p>{ONE_TRUE_THING}</p>
        </section>

        {last ? <RealAnchor /> : null}

        <div className="flex flex-wrap items-center gap-4">
          <Button variant="plate" onClick={() => run.restart()}>
            Play this level again
          </Button>
          {view.level === 'first-4-par' ? (
            <Button variant="ink" onClick={newNumbers}>
              New numbers
            </Button>
          ) : null}
          {last && lesson === null ? <TextLink to="/m/tr2">Play the full loop (TR2)</TextLink> : null}
        </div>
      </div>
    </div>
  )
}
