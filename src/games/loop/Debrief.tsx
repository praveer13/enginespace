import { useMemo, type ReactNode } from 'react'
import { drawInBand } from '@es/play'
import { compareServices, firesOfRun } from '@es/play/loop/compare'
import { frameSvg, layoutStrip } from '@es/play/loop/layout'
import { loopSession } from '@es/play/loop/session'
import type { FireView, LoopCounters } from '@es/play/loop/types'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TextLink } from '@/design/components/TextLink'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { svgToReact } from './svg'
import type { LoopOutcome, LoopRun } from './types'

/*
 * Service's debrief and, on the front page, its end card (GAMES.md §3, §3.1): one sentence that says what the run did and the
 * lever worth the most; the counters against the house's (the hidden reference, read only here); on the last level the night served
 * three ways from the same seed (Compare); the one true thing; and the real engine's numbers beside it, each with its tag.
 *
 * The house is the ghost: its run plays the same night, and its clock is par. Every tick count is synthetic and every row says so
 * (D-048). The real anchor is the one place the page speaks about a real engine, and its numbers are measured and tagged with
 * their source and date (D-012), or derived from those.
 */

export interface DebriefProps {
  run: LoopRun
  outcome: LoopOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
}

/** The engine's term leads in the debrief, and the kitchen's words follow (GAMES.md §2.6, rule 2). */
const LEVER_NAME: Readonly<Record<string, string>> = {
  async: 'Overlap (async scheduling): writing the next call during the fire',
  batching: 'Continuous batching: refilling a clip the moment it opens',
}

/** The one true thing, in a sentence (GAMES.md §3, "Module and concept"). */
const ONE_TRUE_THING =
  'A decode step costs the GPU about the same with one request or four, so the loop earns tokens by keeping every slot live (continuous batching) and by planning the next step while this one runs (overlap, which vLLM calls async scheduling).'

const figure = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>

function CountersTable({ mine, house, par }: { mine: LoopCounters; house: LoopCounters; par: number | null }) {
  const rows: [string, number, number][] = [
    ['Clock (ticks, synthetic)', mine.clockUs, house.clockUs],
    ['Useful tokens (plates, synthetic)', mine.usefulTokens, house.usefulTokens],
    ['Ghost tokens (binned plates, synthetic)', mine.ghostTokens, house.ghostTokens],
    ['Bubble (dark stretches, ticks, synthetic)', mine.bubbleUs, house.bubbleUs],
    ['Empty slots (clips paid for, empty, synthetic)', mine.emptyClipSteps, house.emptyClipSteps],
  ]
  return (
    <div role="region" aria-label="Counters" tabIndex={0} className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="pb-2 text-left font-bold">{par === null ? "Your service against the house's" : "Your service against par, the house's run"}</caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
              Counter
            </th>
            <th scope="col" className="border-b border-edge py-2 pr-4 text-right font-bold">
              Yours
            </th>
            <th scope="col" className="border-b border-edge py-2 text-right font-bold">
              The house
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

/** The night served three ways from the same seed, and yours: the lines side by side on one scale (GAMES.md §2.6, "Compare"). */
function Compare({ seed, mine, clockUs, slots }: { seed: number; mine: readonly FireView[]; clockUs: number; slots: number }) {
  const lanes = useMemo(() => {
    const services = compareServices(seed)
    const scaleTicks = Math.max(clockUs, ...services.map((service) => service.run.summary.clockUs))
    const strip = (fires: readonly FireView[], label: string) => svgToReact(frameSvg(layoutStrip(fires, { slots, scaleTicks, label })))
    return [
      { id: 'mine', heading: 'Your service', gloss: 'the run you just played', clock: clockUs, dark: null as number | null, binned: null as number | null, drawing: strip(mine, 'Your service: the line, with dark stretches between the fires') },
      ...services.map((service) => ({
        id: service.id,
        // The engine's term leads, and the kitchen's name follows it.
        heading: service.term,
        gloss: service.name,
        clock: service.run.summary.clockUs,
        dark: service.run.summary.bubbleUs as number | null,
        binned: service.run.summary.ghostTokens as number | null,
        drawing: strip(firesOfRun(service.run, slots), `${service.term}: the line, with dark stretches between the fires`),
      })),
    ]
  }, [seed, mine, clockUs, slots])
  return (
    <section aria-label="Compare: the same night, three services" className="flex flex-col gap-3">
      <h3>The same night, served three ways</h3>
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
                  dark <span className="font-numeric">{formatReadout(lane.dark)}</span> ticks
                </span>
              )}
              {lane.binned === null ? null : (
                <span>
                  binned plates <span className="font-numeric">{formatReadout(lane.binned)}</span>
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
    <Ticket as="section" width="full" hole={false} head="The real engine" meta="not this world" titleAs="h3" title="What a real engine does with more tickets">
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
      <TicketLine note={<Readout value={1.66} digits={2} unit="x" tag="derived" size="sm" />}>each token took this much longer</TicketLine>
      <TicketLine note={<Readout value={9.7} digits={1} unit="x" tag="derived" size="sm" />}>tokens per second, estimated as concurrency over each token's time</TicketLine>
      <p className="text-text-2">
        Source: InferenceX official results for Llama-3.3-70B-Instruct-FP8 under vLLM, rows 41187 and 41821. The claims loop.anchor.tpot-conc-4 and loop.anchor.tpot-conc-64 hold the setup and the source's own words, and the two ratios are derived from them.
      </p>
    </Ticket>
  )
}

export function Debrief({ run, outcome, next, onNext }: DebriefProps) {
  const { view } = run
  const { debrief, grade } = outcome
  const mine = view.counters
  const house = outcome.ghostView.counters
  const lever = debrief.names !== null && 'lever' in debrief.names ? LEVER_NAME[debrief.names.lever] : null
  const last = next === null

  function newNumbers() {
    const entropy = crypto.getRandomValues(new Uint32Array(1))[0]
    run.restart(drawInBand(loopSession, 'first-4-par', entropy))
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6" data-loop-debrief="">
      <Ticket
        as="section"
        width="full"
        hole={false}
        head="Debrief"
        meta={view.title}
        titleAs="h3"
        title={grade.ok ? 'Well fired.' : 'Fire it again.'}
        stub={
          last ? (
            <Stub to="/map">Open the course map</Stub>
          ) : (
            <Stub onClick={onNext}>{`Next: ${next.title}`}</Stub>
          )
        }
      >
        <p className="es-type-body">{debrief.sentence}</p>
        {lever ? (
          <p>
            <strong>The lever worth the most:</strong> {lever}.
          </p>
        ) : null}
        <CountersTable mine={mine} house={house} par={view.par} />
      </Ticket>

      {view.level === 'first-4-par' ? <Compare seed={run.seed} mine={view.fires} clockUs={mine.clockUs} slots={view.slots} /> : null}

      <section aria-label="What to take away" className="flex flex-col gap-2">
        <p className="es-type-body max-w-prose">{ONE_TRUE_THING}</p>
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
        {last ? <TextLink to="/m/tr2">Play the full loop (TR2)</TextLink> : null}
      </div>
    </div>
  )
}
