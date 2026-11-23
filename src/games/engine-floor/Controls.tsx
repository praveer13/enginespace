import { useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import { FLOOR_COPY, FLOOR_QUESTION, GRADED_LINE, NO_SKIP, PATH_HEAD, PREDICT_HINT, READOUT_WORDS } from '@es/play/engine-floor/copy'
import { ENGINE_NAMES } from '@es/play/engine-floor/engine'
import type { FloorView, TileView } from '@es/play/engine-floor/types'
import { placeName, stageName } from '@es/play/engine-floor/words'
import { RULES } from '@es/sim/lifecycle'
import { Button } from '@/design/components/Button'
import { DeltaChip } from '@/design/components/DeltaChip'
import { Icon } from '@/design/components/Glyph'
import { Marker } from '@/design/components/Marker'
import { Stamp } from '@/design/components/Stamp'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { LessonGuessContext } from '@/games/kit/lessonGuess'
import { useDeltas } from '@/games/kit/moments'
import { Cite } from './Cite'
import { Code } from './Code'
import { HandoffGlyph } from './HandoffGlyph'
import { handoffWords, plain, readoutOf } from './text'
import type { FloorRun } from './types'
import { useFloorControls, type FloorControls, type Point } from './useFloorControls'
import './floor.css'

/*
 * Request path's dock (REDESIGN §3.5, §3.6), top to bottom: the scenario card (the engine, the pin, what the request asks and, once it is
 * in, the prediction), the prediction while it is open, then the stage list (a field that filters by typed text, filter chips, one for
 * each process, and a box of 44 px tiles that scrolls on its own, each laid by a press), why a run stopped once one has, and the path's two
 * actions: Run the path, the amber control once there is a stage to run, and Remove last. The readout strip is under the dock
 * (ReadoutStrip, below).
 *
 * Where the dock stands beside the drawing, or pinned to a phone's foot, it holds still while the run is played (floor.css): nothing above
 * the list changes height while stages are laid or filtered, the list's box absorbs what room is left, and the actions stand at the dock's
 * foot. So a lay, a filter or a typed letter changes what is inside the list's box and nothing else.
 *
 * Every action is HTML, so a pointer, a keyboard and a screen reader reach the same things. The tiles are one tab stop and the arrows walk
 * them (roving tabindex); the field's Down arrow enters the list. Backspace takes the last stage off and R runs the path (Game.tsx).
 *
 * The graded map uses the same pieces with one difference in what they say: it allows one run, it has no undo and no live readout, and its
 * pass rule stands in the dock before the run.
 */

/** What the request is, in words: the scenario of the level, one short line for each thing GAMES.md §5 varies. */
function scenarioWords(view: FloorView): string[] {
  const { scenario } = view
  return [
    scenario.streaming ? 'streams its answer' : 'waits for the whole answer',
    scenario.tp === 1 ? 'one rank' : 'two ranks',
    scenario.n === 1 ? 'one sample' : 'two samples',
    scenario.prefixHit ? 'a prefix hit' : 'no prefix hit',
    scenario.abort ? 'the client leaves mid-stream' : 'the client stays to the end',
  ]
}

/**
 * The scenario card: the engine at its pin, and what this request asks. Once the prediction is in, the card is two short lines: the engine
 * and its pin, then a fold that holds the rest of the request (what it asks, the day the source was read, how the engine is built and, on
 * the graded map, the pass rule) beside the prediction. The fold opens over the stage list and not into it, so opening it moves nothing.
 */
function ScenarioCard({ view, graded }: { view: FloorView; graded: ReactNode }) {
  const pin = view.pin
  const folded = view.prediction !== null
  return (
    <section
      className="es-floor-card"
      aria-label="The request"
      data-floor-order=""
      data-engine={view.scenario.engine}
      data-streaming={view.scenario.streaming}
      data-tp={view.scenario.tp}
      data-abort={view.scenario.abort}
      data-prefix-hit={view.scenario.prefixHit}
      data-n={view.scenario.n}
    >
      <p className="es-floor-card__engine">
        <strong>{ENGINE_NAMES[view.scenario.engine]}</strong>{' '}
        <span className="es-floor-card__pin">
          <code>{pin.repo}</code> at <code>{pin.ref.slice(0, 7)}</code>
          {folded ? null : <>, read {pin.readOn}</>}
        </span>
      </p>
      {folded ? null : <p className="es-floor-card__asks">{scenarioWords(view).join(' · ')}</p>}
      {folded ? (
        <div className="es-floor-card__foot">
          <details className="es-floor-card__note" data-floor-prompt="">
            <summary>About this request</summary>
            <div className="es-floor-card__panel">
              <p className="es-floor-card__asks">{scenarioWords(view).join(' · ')}</p>
              <p className="es-floor-card__read">Source read {pin.readOn}.</p>
              <p>
                <Code>{view.prompt}</Code>
              </p>
              {graded}
            </div>
          </details>
          <p className="es-floor-said" data-prediction="">
            Your prediction: <span className="font-numeric">{view.prediction}</span> process {view.prediction === 1 ? 'boundary' : 'boundaries'}.
          </p>
        </div>
      ) : null}
    </section>
  )
}

/** The prediction: the session's first ask, required, with the line that says why it cannot be skipped. Once in, the card says it. */
function Prediction({ controls, shown }: { controls: FloorControls; shown: boolean }) {
  const { view, choices, pick, setPick, commit } = controls
  const question = useId()
  // In a lesson whose guess asks this question, the lesson's words stand in, and how sure the learner is goes with it.
  const lesson = useContext(LessonGuessContext)
  // At a desk the question, its six numbers and Commit come into view together in the dock, which may have to scroll to hold them under the
  // first run's coach strip and the scenario card (on a phone the pinned dock is read from the question down).
  const section = useRef<HTMLElement>(null)
  const open = view.prediction === null && shown
  useEffect(() => {
    if (open && window.matchMedia('(min-width: 64rem)').matches) section.current?.scrollIntoView({ block: 'nearest' })
  }, [open])
  if (view.prediction !== null) return null
  if (!shown) {
    return (
      <p className="es-floor-said" data-prediction="" data-waiting="">
        The prediction comes after the parts: name them first, then guess.
      </p>
    )
  }
  return (
    <section ref={section} className="es-floor-predict" aria-labelledby={question} data-prediction="">
      {lesson?.label === undefined ? null : <p className="es-floor-predict__label">{lesson.label}</p>}
      <h3 id={question} className="es-floor-predict__ask">
        {lesson?.ask ?? FLOOR_QUESTION}
      </h3>
      <p className="es-floor-predict__hint">{PREDICT_HINT}</p>
      <div role="group" aria-labelledby={question} className="es-floor-predict__choices">
        {choices.map((n) => (
          <Button key={n} variant={pick === n ? 'ink' : 'plate'} aria-pressed={pick === n} aria-label={`${n} ${n === 1 ? 'boundary' : 'boundaries'}`} onClick={() => setPick(n)}>
            {n}
          </Button>
        ))}
      </div>
      {lesson?.sure}
      <div className="es-floor-predict__commit">
        <PrimaryButton disabled={pick === null} onClick={(event) => commit(event)}>
          Commit the prediction
        </PrimaryButton>
      </div>
      <p className="es-floor-predict__why" data-floor-no-skip="">
        {NO_SKIP}
      </p>
    </section>
  )
}

/** Why the last run stopped: the row, the rule in the engine's terms with the places (or the pinned source), and the mechanism laid there. */
function StopNote({ controls }: { controls: FloorControls }) {
  const { view, takeBack } = controls
  const stop = view.stop
  const note = useRef<HTMLElement>(null)
  const head = useRef<HTMLParagraphElement>(null)
  // A run that stopped brings its reason into view in the dock, which may have to scroll to hold it under the list. A note taller than the
  // room (a phone's pinned dock) is read from its head, so the head comes into view last: the rest is a scroll down.
  const at = stop?.at ?? null
  const runs = view.runs
  useEffect(() => {
    if (at === null) return
    note.current?.scrollIntoView({ block: 'nearest' })
    head.current?.scrollIntoView({ block: 'nearest' })
  }, [at, runs])
  if (stop === null) return null
  return (
    <section ref={note} aria-label="Why the request stopped" className="es-floor-stop" data-stop={stop.failure} data-floor-stop="">
      <p ref={head} className="es-floor-stop__head">
        <Icon name="alert" className="es-floor-stop__icon" />
        <span>
          Stopped at stage <span className="font-numeric">{stop.at + 1}</span>. {stop.failure === 'path' ? PATH_HEAD : RULES[stop.failure]}
        </span>
      </p>
      <p className="es-floor-stop__why">
        <Code>{stop.sentence}</Code>
      </p>
      <p className="es-floor-stop__wrong" data-floor-wrong-mechanism={stop.laid.mechanism}>
        <HandoffGlyph mechanism={stop.laid.mechanism} className="es-floor-inline-glyph" /> The mechanism laid there: <strong>{handoffWords(stop.laid.mechanism)}</strong>
        {stop.expected === null ? '.' : stop.expected.mechanism === stop.laid.mechanism ? ', the same as the engine’s; the place is what is wrong.' : <>; the engine has {handoffWords(stop.expected.mechanism)} there.</>}
      </p>
      <details className="es-floor-stop__more">
        <summary>The two stages and their sources</summary>
        {stop.expected === null ? (
          <p>The request is already back where it began, so the path is complete without this stage.</p>
        ) : (
          <Cite title={`What ${ENGINE_NAMES[view.pin.engine]} does here`} note={stop.expected} />
        )}
        <Cite title="What was laid" note={stop.laid} />
      </details>
      {view.done ? null : (
        <Button size="sm" onClick={() => takeBack(stop.at)}>
          Take the path back to stage {stop.at + 1}
        </Button>
      )}
    </section>
  )
}

/**
 * A tile of the stage list: its mark and mechanism, its name as code, and where it runs. A press lays it. The second click of a double click
 * lays nothing: the first laid the tile it landed on, so the second lands on the tile that took its place, which nobody aimed at.
 */
function Tile({ tile, onLay, tabIndex }: { tile: TileView; onLay: (at: Point | null) => void; tabIndex: number }) {
  return (
    <button
      type="button"
      className="es-floor-tile"
      tabIndex={tabIndex}
      data-stage={tile.id}
      aria-label={`Lay ${handoffWords(tile.mechanism)}: ${plain(tile.label)}. From ${placeName(tile.from)} to ${placeName(tile.to)}.`}
      onClick={(event) => {
        if (event.detail > 1) return
        onLay(event.detail > 0 ? { x: event.clientX, y: event.clientY } : null)
      }}
    >
      <span className="es-floor-tile__line">
        <HandoffGlyph mechanism={tile.mechanism} className="es-floor-tile__glyph" />
        <span className="es-floor-tile__mech">{handoffWords(tile.mechanism)}</span>
        <code className="es-floor-tile__name">{stageName(tile.label)}</code>
      </span>
      <span className="es-floor-tile__where">
        {placeName(tile.from)}
        {placeName(tile.from) === placeName(tile.to) ? null : <> → {placeName(tile.to)}</>}
      </span>
    </button>
  )
}

/** The stage list (the session's tray): what can happen next, filtered by a process and by typed text. */
export function StageList({ controls, ring }: { controls: FloorControls; ring: string | null }) {
  const { view, platforms, filter, setFilter, query, setQuery, tiles, tabStop, tray, chips, onChipFocus, onTrayKey, lay } = controls
  const headId = useId()
  const fieldId = useId()
  // The stage the first run points at is brought into view where the list or the page has it out of sight: the ring is the move to make.
  const laying = view.step === 'lay'
  useEffect(() => {
    if (ring === null || !laying) return
    tray.current?.querySelector('.es-floor-ring')?.scrollIntoView({ block: 'nearest' })
  }, [ring, laying, tray])
  if (view.step !== 'lay') {
    return (
      <section aria-labelledby={headId} className="es-floor-stages" data-floor-stages="" data-floor-tray="" data-count={view.tray.length}>
        <h3 id={headId} className="es-floor-stages__head">
          Stages
        </h3>
        <p className="es-floor-stages__closed">
          {view.step === 'predict'
            ? 'The stage list opens when the prediction is in.'
            : view.served
              ? view.level === 'map'
                ? 'The request reached the client. The stages left are not on this request’s path.'
                : 'The request reached the client. The stages left belong to other engines.'
              : 'The run is over, and the stage list is closed.'}
        </p>
      </section>
    )
  }
  return (
    <section aria-labelledby={headId} className="es-floor-stages" data-floor-stages="" data-count={view.tray.length}>
      {/* The heading, the count, the field and the chips: at a desk the heading, the count and the field share the first line and the chips
          have a room of their own that a chip going does not change; on a phone the field and the chips are one row that scrolls sideways. */}
      <div className="es-floor-filters">
        <h3 id={headId} className="es-floor-stages__head">
          Stages
        </h3>
        <span className="es-floor-stages__count">
          <span className="font-numeric">{tiles.length}</span>
          {tiles.length === view.tray.length ? null : (
            <>
              {' '}
              of <span className="font-numeric">{view.tray.length}</span>
            </>
          )}{' '}
          shown
        </span>
        <label htmlFor={fieldId} className="sr-only">
          Filter the stages by words
        </label>
        <input
          id={fieldId}
          type="search"
          className="es-floor-filter"
          placeholder="Filter by words"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown') return
            event.preventDefault()
            tray.current?.querySelector<HTMLButtonElement>('button')?.focus()
          }}
          data-floor-filter=""
        />
        <div ref={chips} role="group" aria-label="Show the stages that start in" className="es-floor-chips" onFocus={onChipFocus}>
          <button type="button" className="es-floor-chip" aria-pressed={filter === null} onClick={() => setFilter(null)}>
            All
          </button>
          {platforms.map((platform) => (
            <button
              key={platform.key}
              type="button"
              className="es-floor-chip"
              aria-pressed={filter === platform.key}
              disabled={platform.count === 0}
              onClick={() => setFilter(filter === platform.key ? null : platform.key)}
            >
              {platform.key}
              {platform.here ? (
                <span className="es-floor-chip__here">
                  <span className="es-floor-chip__dot"> · </span>here
                </span>
              ) : null}
              <span className="es-floor-chip__count font-numeric" aria-hidden="true">
                {platform.count}
              </span>
            </button>
          ))}
        </div>
      </div>
      {/* The list's box: when the filters leave no tile, or every stage is laid, the line that says so stands in the empty box, so nothing
          under it moves. */}
      <div className="es-floor-list">
        {view.tray.length === 0 ? (
          <p className="es-floor-stages__none" role="status">
            Every stage is laid. {view.canUnlay ? 'Run the path, or Remove last.' : 'Run the path.'}
          </p>
        ) : tiles.length === 0 ? (
          <p className="es-floor-stages__none" role="status">
            No stage matches.{' '}
            <button
              type="button"
              className="es-floor-link"
              onClick={() => {
                setQuery('')
                setFilter(null)
              }}
            >
              Show every stage
            </button>
          </p>
        ) : null}
        <ul ref={tray} onKeyDown={onTrayKey} data-native-keys="arrows" className="es-floor-tiles" data-floor-tray="" aria-label="Stages you can lay">
          {tiles.map((tile, index) => (
            <li key={tile.id} className="es-floor-tiles__item">
              {ring === tile.id ? (
                <Marker kind="ring" word="first move" className="es-floor-ring">
                  <Tile tile={tile} tabIndex={index === tabStop ? 0 : -1} onLay={(at) => lay(tile.id, index, at)} />
                </Marker>
              ) : (
                <Tile tile={tile} tabIndex={index === tabStop ? 0 : -1} onLay={(at) => lay(tile.id, index, at)} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Run the path and Remove last, with what a run allows. */
function PathActions({ controls }: { controls: FloorControls }) {
  const { view, unlay, sendIt } = controls
  if (view.step !== 'lay') return null
  return (
    <div className="es-floor-actions" data-floor-path="">
      <div className="es-floor-actions__row">
        <PrimaryButton disabled={!view.canRun} onClick={sendIt}>
          Run the path
        </PrimaryButton>
        <Button size="sm" variant="plate" disabled={!view.canUnlay} aria-keyshortcuts="Backspace" onClick={unlay}>
          Remove last
        </Button>
      </div>
      {view.runsAllowed === 1 ? (
        <p className="es-floor-actions__once" data-floor-once="">
          One run: lay every stage you mean to before you run the path.
        </p>
      ) : null}
    </div>
  )
}

/** The graded map's line before its run: one run, no undo, no live readout, and the pass rule. */
function GradedNote({ view, mode }: { view: FloorView; mode: FloorRun['mode'] }) {
  if (view.level !== 'map' || view.done) return null
  return (
    <p className="es-floor-graded" data-floor-graded-note={mode}>
      {mode === 'graded' ? <>{GRADED_LINE} </> : null}
      <strong>Pass rule:</strong> {FLOOR_COPY.map.passRule}
    </p>
  )
}

/** The dock, in its order. `ring` is the stage the first run points at, if any. */
export function Controls({ run, ring = null }: { run: FloorRun; ring?: string | null }) {
  const controls = useFloorControls(run, ring)
  const { view } = controls
  return (
    <div className="es-floor-dock" data-floor-controls="" data-step={view.step}>
      {/* Where the stage list is open the pass rule is in the card's fold, so the list has the room. */}
      <ScenarioCard view={view} graded={view.step === 'lay' ? <GradedNote view={view} mode={run.mode} /> : null} />
      {view.step === 'lay' ? null : <GradedNote view={view} mode={run.mode} />}
      <Prediction controls={controls} shown={run.intro.askShown} />
      <StageList controls={controls} ring={ring} />
      <StopNote controls={controls} />
      <PathActions controls={controls} />
    </div>
  )
}

/**
 * The readout strip (REDESIGN §3.5): stages laid · boundaries crossed · copies · syncs, counts of the laid path in the numeric face, with one
 * stamp for the strip and each change beside its number for a second. A graded run has no live readout, and the strip says so.
 */
export function ReadoutStrip({ view, mode }: { view: FloorView; mode: FloorRun['mode'] }) {
  const items = readoutOf(view)
  const deltas = useDeltas(Object.fromEntries(items.map((item) => [item.id, item.value])))
  if (mode === 'graded' && !view.done) {
    return (
      <p className="es-floor-noreadout" data-floor-readout="" data-hidden="">
        No live readout in a graded run: the counts come with the result.
      </p>
    )
  }
  return (
    <div className="es-floor-strip" data-floor-readout="">
      <dl className="es-floor-strip__list">
        {items.map((item) => (
          <div key={item.id} className="es-floor-strip__item" data-readout-id={item.id}>
            <dt className="es-floor-strip__label">{READOUT_WORDS[item.id]}</dt>
            <dd className="es-floor-strip__value font-numeric">
              {item.value}
              {deltas[item.id] === undefined ? null : <DeltaChip key={deltas[item.id].key} value={deltas[item.id].value} className="es-floor-strip__delta" />}
            </dd>
          </div>
        ))}
      </dl>
      <Stamp word="derived" className="es-floor-strip__stamp" />
    </div>
  )
}

