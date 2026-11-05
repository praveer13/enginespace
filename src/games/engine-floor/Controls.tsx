import { useId, type ReactNode } from 'react'
import { ENGINE_NAMES } from '@es/play/engine-floor/engine'
import type { FloorView, LaidView, TileView } from '@es/play/engine-floor/types'
import { placeName } from '@es/play/engine-floor/words'
import { Button } from '@/design/components/Button'
import { Icon } from '@/design/components/Glyph'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { Cite } from './Cite'
import { Code } from './Code'
import { HandoffGlyph } from './HandoffGlyph'
import { handoffWords, plain } from './text'
import type { FloorRun } from './types'
import { useFloorControls, type FloorControls } from './useFloorControls'
import './floor.css'

/*
 * Back of House's controls (GAMES.md §5 "Controls", §2.6 "Back of House"): HTML for every action, so a pointer, a keyboard and a screen
 * reader all reach the same things. Three tickets, in the order the learner uses them:
 *   - the order: the scenario the request is, and the prediction ("how many process boundaries does a sampled token cross?"), committed
 *     before anything is laid;
 *   - the tray: the hand-off cards, which a platform's chip narrows to the stages that start there. The cards are one tab stop and the
 *     arrows walk them (roving tabindex); Enter lays the one in hand, and focus goes to the next;
 *   - the path: the laid stages in order, an ordered list whose selected row can move up or down or take the path back, and the stub that
 *     runs it (R). When a run stopped, the ticket says where and why, from the stage's source, and offers to take the path back to it.
 * Backspace takes the last stage off. Nothing here is timed, and nothing locks: the tray waits behind the prediction and nowhere else.
 *
 * The graded `map` (W1-T19) uses the same pieces with one difference in what they say: it allows one run, so the order names the engine
 * (its title is the level's, not an engine's), the path says that the stub is final, and once the run has been judged the path can no
 * longer be edited.
 *
 * `useFloorControls` (useFloorControls.ts) holds the focus rules, and the pieces here draw it.
 */

/** What the request is, in words: the scenario of the level, one line for each thing GAMES.md §5 varies. */
function scenarioLines(view: FloorView): { term: string; value: string }[] {
  const { scenario } = view
  return [
    // A practice level is titled for its engine. The graded level is not, because its engine is drawn: the order says which.
    ...(view.level === 'map' ? [{ term: 'engine', value: ENGINE_NAMES[scenario.engine] }] : []),
    { term: 'request', value: scenario.streaming ? 'streams its answer' : 'waits for the whole answer' },
    { term: 'ranks', value: scenario.tp === 1 ? 'one rank' : 'two ranks' },
    { term: 'samples', value: scenario.n === 1 ? 'one sample' : 'two samples' },
    { term: 'prefix', value: scenario.prefixHit ? 'a prefix hit' : 'no prefix hit' },
    { term: 'client', value: scenario.abort ? 'leaves mid-stream' : 'stays to the end' },
  ]
}

function Prediction({ controls }: { controls: FloorControls }) {
  const { view, choices, pick, setPick } = controls
  const question = useId()
  if (view.prediction !== null) {
    return (
      <p className="flex flex-wrap items-baseline gap-x-2" data-prediction="">
        <TapeLabel size="sm">your prediction</TapeLabel>
        <span className="font-numeric text-size-plate">{view.prediction}</span>
        <span>process {view.prediction === 1 ? 'boundary' : 'boundaries'} on a sampled token&apos;s way to the client</span>
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2" data-prediction="">
      <p id={question} className="font-bold">
        How many process boundaries does a sampled token cross on its way to the client?
      </p>
      <p className="text-text-2">Count each hop from one process to another, the last one into the client included. A hop between threads of one process does not count.</p>
      <div role="group" aria-labelledby={question} className="flex flex-wrap gap-2">
        {choices.map((n) => (
          <Button key={n} variant={pick === n ? 'ink' : 'plate'} aria-pressed={pick === n} aria-label={`${n} ${n === 1 ? 'boundary' : 'boundaries'}`} onClick={() => setPick(n)}>
            {n}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * The order: the scenario, the pin it is read at, and the prediction. Its stamped headline leads the paper, with no head line over it
 * (DESIGN.md, Tickets): the pin prints on the foot line.
 */
export function OrderTicket({ controls }: { controls: FloorControls }) {
  const { view, commit, pick } = controls
  const pin = view.pin
  return (
    <Ticket
      as="section"
      width="full"
      hole={false}
      titleAs="h3"
      title={view.title}
      foot={[`${pin.title} · ${pin.repo} at ${pin.ref.slice(0, 7)}`, `read ${pin.readOn}`]}
      stub={view.step === 'predict' ? <Stub disabled={pick === null} onClick={commit}>Commit the prediction</Stub> : undefined}
      data-floor-order=""
      // The request, as the card says it: the engine and the five things about it, for a test or a script that reads the page.
      data-engine={view.scenario.engine}
      data-streaming={view.scenario.streaming}
      data-tp={view.scenario.tp}
      data-abort={view.scenario.abort}
      data-prefix-hit={view.scenario.prefixHit}
      data-n={view.scenario.n}
    >
      {view.prediction === null ? null : (
        <p className="max-w-prose" data-floor-prompt="">
          <Code>{view.prompt}</Code>
        </p>
      )}
      <div className="flex flex-col" aria-label="The request" role="group">
        {scenarioLines(view).map((line) => (
          <TicketLine key={line.term} note={line.value}>
            {line.term}
          </TicketLine>
        ))}
      </div>
      <Prediction controls={controls} />
    </Ticket>
  )
}

/** A hand-off card: its mark and words on the head line, the engine's label, and where it starts and where it ends. */
function Tile({ tile, onLay, tabIndex }: { tile: TileView; onLay: () => void; tabIndex: number }) {
  return (
    <Ticket
      as="button"
      compact
      hole={false}
      width="full"
      className="es-floor-tile"
      tabIndex={tabIndex}
      data-stage={tile.id}
      aria-label={`Lay ${handoffWords(tile.mechanism)}: ${plain(tile.label)}. From ${placeName(tile.from)} to ${placeName(tile.to)}.`}
      onClick={onLay}
      head={
        <span className="flex items-center gap-1.5">
          <HandoffGlyph mechanism={tile.mechanism} className="size-4 flex-none" />
          {handoffWords(tile.mechanism)}
        </span>
      }
      foot={[placeName(tile.from), `to ${placeName(tile.to)}`]}
    >
      <span className="block">
        <Code>{tile.label}</Code>
      </span>
    </Ticket>
  )
}

/** The tray: the stages left to lay, narrowed by a platform. */
export function Tray({ controls }: { controls: FloorControls }) {
  const { view, platforms, filter, setFilter, tiles, tabStop, tray, chips, onTrayKey, lay } = controls
  // Until the prediction is written the tray is closed, and its cards are not shown: their places would answer it. Once the ticket is
  // home it is closed again: the cards left in it are stages of other engines, which the debrief sets beside this one's.
  if (view.step !== 'lay') {
    return (
      <section aria-label="The tray: stages to lay" className="es-floor-tray flex flex-col gap-3" data-floor-tray="" data-count={view.tray.length}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <TapeLabel>The tray</TapeLabel>
          <span className="text-text-2">
            {view.step === 'predict'
              ? 'The tray opens when the prediction is written down.'
              : view.served
                ? view.level === 'map'
                  ? 'The ticket is home. The stages left in the tray are not on this request’s path.'
                  : 'The ticket is home. The stages left in the tray belong to other engines.'
                : 'The run is over, and the tray is closed.'}
          </span>
        </div>
      </section>
    )
  }
  return (
    <section aria-label="The tray: stages to lay" className="es-floor-tray flex flex-col gap-3" data-floor-tray="" data-count={view.tray.length}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TapeLabel>The tray</TapeLabel>
        <span className="text-text-2">
          <span className="font-numeric">{view.tray.length}</span> {view.tray.length === 1 ? 'stage' : 'stages'} left
        </span>
      </div>
      <div ref={chips} role="group" aria-label="Show the stages that start on" className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === null ? 'ink' : 'plate'} aria-pressed={filter === null} onClick={() => setFilter(null)}>
          All
        </Button>
        {platforms.map((platform) => (
          <Button
            key={platform.key}
            size="sm"
            variant={filter === platform.key ? 'ink' : 'plate'}
            aria-pressed={filter === platform.key}
            onClick={() => setFilter(platform.key)}
          >
            {platform.key === 'GPU' ? 'the line · GPU' : platform.key}
            {platform.here ? <span className="text-size-caption"> · here</span> : null}
            <span className="font-numeric text-size-caption" aria-hidden="true">
              {' '}
              {platform.count}
            </span>
          </Button>
        ))}
      </div>
      <ul ref={tray} onKeyDown={onTrayKey} data-native-keys="arrows" className="es-floor-tiles">
        {tiles.map((tile, index) => (
          <li key={tile.id} className="min-w-0">
            <Tile tile={tile} tabIndex={index === tabStop ? 0 : -1} onLay={() => lay(tile.id, index)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

const STATE_WORDS: Readonly<Record<LaidView['state'], string>> = { ran: 'held', struck: 'stopped the ticket', pending: 'not run yet' }

/** One laid stage: its number, its mark and words, and what the last run found of it. The selected row offers to move. */
function PathRow({ stage, selected, controls }: { stage: LaidView; selected: boolean; controls: FloorControls }) {
  const { view, select, move, takeBack, rowStop } = controls
  const last = view.laid.length - 1
  return (
    <li className="es-floor-row" data-state={stage.state} data-selected={selected || undefined}>
      <button
        type="button"
        className="es-floor-row__main"
        aria-pressed={selected}
        tabIndex={stage.index === rowStop ? 0 : -1}
        aria-label={`Stage ${stage.index + 1}, ${STATE_WORDS[stage.state]}: ${handoffWords(stage.mechanism)}, ${plain(stage.label)}. From ${placeName(stage.from)} to ${placeName(stage.to)}.`}
        onClick={() => select(stage.index)}
      >
        <span className="es-floor-row__no font-numeric" aria-hidden="true">
          {String(stage.index + 1).padStart(2, '0')}
        </span>
        <HandoffGlyph mechanism={stage.mechanism} className="es-floor-row__glyph" />
        <span className="es-floor-row__text">
          <span className="es-type-ticket text-size-caption">{handoffWords(stage.mechanism)}</span>
          <span>
            <Code>{stage.label}</Code>
          </span>
          <span className="text-text-2 text-size-caption">
            {placeName(stage.from)} to {placeName(stage.to)}
          </span>
        </span>
        <span className="es-floor-row__mark" aria-hidden="true">
          {stage.state === 'ran' ? <Icon name="check" className="size-5" /> : stage.state === 'struck' ? <Icon name="strike" className="size-5" /> : null}
        </span>
      </button>
      {selected && !view.done ? (
        <div className="es-floor-row__tools" role="group" aria-label={`Stage ${stage.index + 1}`}>
          <Button size="sm" disabled={stage.index === 0} onClick={() => move(stage.index, -1)}>
            Move up
          </Button>
          <Button size="sm" disabled={stage.index === last} onClick={() => move(stage.index, 1)}>
            Move down
          </Button>
          <Button size="sm" onClick={() => takeBack(stage.index)}>
            Take the path back to here
          </Button>
        </div>
      ) : null}
    </li>
  )
}

/** Why the last run stopped, from the stage's source, with the way back. */
function StopNote({ controls }: { controls: FloorControls }) {
  const { view, takeBack } = controls
  const stop = view.stop
  if (stop === null) return null
  return (
    <section aria-label="Why the ticket stopped" className="es-floor-stop" data-stop={stop.failure} data-floor-stop="">
      <p className="es-type-ticket es-floor-stop__head">
        <Icon name="alert" className="size-5 flex-none" />
        <span>
          The ticket stopped at stage <span className="font-numeric">{stop.at + 1}</span>
          {stop.failure === 'path' ? ': not the engine’s next.' : `: the ${stop.failure} rule.`}
        </span>
      </p>
      <p className="max-w-prose">
        <Code>{stop.sentence}</Code>
      </p>
      {stop.expected === null ? (
        <p>The request is already back where it began, so the path is complete without this stage.</p>
      ) : (
        <Cite title={`What ${ENGINE_NAMES[view.pin.engine]} does here`} note={stop.expected} />
      )}
      <Cite title="What was laid" note={stop.laid} />
      {view.done ? null : (
        <div>
          <Button size="sm" onClick={() => takeBack(stop.at)}>
            Take the path back to where it stopped
          </Button>
        </div>
      )}
    </section>
  )
}

/** The path: the laid stages in order, the stub that runs them, and what a run found. */
export function PathTicket({ controls }: { controls: FloorControls }) {
  const { view, selected, sendIt, unlay, send, rows, onRowKey } = controls
  const word = view.laid.length === 1 ? 'stage' : 'stages'
  return (
    <Ticket
      as="section"
      width="full"
      hole={false}
      head="Path"
      meta={`${view.laid.length} ${word} laid`}
      foot={[view.runs === 0 ? 'not run yet' : `${view.runs} ${view.runs === 1 ? 'run' : 'runs'}`, `${view.reached} held`]}
      stub={
        <div ref={send}>
          <Stub disabled={!view.canRun} onClick={sendIt}>
            Run the path
          </Stub>
        </div>
      }
      data-floor-path=""
    >
      {view.laid.length === 0 ? (
        <p className="text-text-2" data-empty="">
          Nothing is laid. The first stage starts where the request begins, at <code className="es-type-mono">{placeName(view.entry)}</code>.
        </p>
      ) : (
        <ol ref={rows} onKeyDown={onRowKey} data-native-keys="ArrowUp ArrowDown Home End" className="es-floor-rows" aria-label="The laid path, in order">
          {view.laid.map((stage) => (
            <PathRow key={stage.id} stage={stage} selected={selected === stage.index} controls={controls} />
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!view.canUnlay} aria-keyshortcuts="Backspace" onClick={unlay}>
          Take the last stage off
        </Button>
      </div>
      {view.runsAllowed === 1 && !view.done ? (
        <p className="text-text-2" data-floor-once="">
          One run. The ticket goes once, and the level is over when it does, so lay every stage you mean to before you pull the stub.
        </p>
      ) : null}
      <StopNote controls={controls} />
    </Ticket>
  )
}

/**
 * The controls of the page. `top` is a line above the order, where the level says what mode it is in, and `rail` is what the page puts at
 * the foot of them: the levels (LevelRail.tsx). Both are the page's, so the controls do not know the game's levels or its modes.
 */
export function Controls({ run, top, rail }: { run: FloorRun; top?: ReactNode; rail?: ReactNode }) {
  const controls = useFloorControls(run)
  return (
    <div className="flex flex-col gap-4" data-floor-controls="">
      {top}
      <OrderTicket controls={controls} />
      <Tray controls={controls} />
      <PathTicket controls={controls} />
      {rail}
    </div>
  )
}

