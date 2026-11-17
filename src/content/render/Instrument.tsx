import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import type { CompiledBlock } from '@es/schema'
import { rosterEntry } from '@es/play/roster'
import { Button } from '@/design/components/Button'
import { PrintingDots } from '@/design/components/PrintingDots'
import { TextLink } from '@/design/components/TextLink'
import { LessonGuessContext } from '@/games/kit/lessonGuess'
import { LessonRunContext, type LessonOnward, type LessonRun } from '@/games/kit/lessonRun'
import type { Of } from './BlockFrame'
import { useLevelNames } from './levelNames'
import { pendingGame } from './model'
import { usePairedGuess } from './paired'
import { useBlockRun } from './runs'
import { runAnchor, type Slotted } from './sections'

/*
 * A run in a lesson (REDESIGN §2.5 and §2.6): the instrument frame of a game block, at the block's level and in its mode, with the guesses
 * that the run answers in its slot. It is one of three things:
 *
 *   - an opening run, in Run: the instrument is on the page as the lesson loads (its code is a lazy chunk, loaded after the first paint), and
 *     a second opening level follows the first once the first run ends, or when the learner starts it;
 *   - an inline run in Read, "Run: <level title>", which starts when the learner asks;
 *   - a graded level in Test, "Graded level", which states that new numbers are drawn and that the level gives its pass rule before the run.
 *
 * A guess paired with the level's own opening guess (same.ts) is asked once, in the instrument's slot, in the lesson's words; its reveal sits
 * under the instrument. A guess that is not paired sits just above the instrument, as the run's guess. One live 3D scene per page, as before:
 * a level the learner starts takes it (GameEmbed.tsx).
 */

const GameEmbed = lazy(() => import('./GameEmbed'))
const PredictTicket = lazy(() => import('./Predict').then((module) => ({ default: module.PredictTicket })))

export type InstrumentKind = 'opening' | 'inline' | 'graded'

export interface InstrumentProps {
  block: Of<'game'>
  at: number
  blocks: readonly CompiledBlock[]
  scope: string
  rev?: string
  kind: InstrumentKind
  /** The guesses in this run's slot. */
  guesses?: readonly Slotted[]
  /** An opening run that starts as the page loads. */
  autoStart?: boolean
  /**
   * A second opening level: the block of the level before it. It waits under "Next level: <title>", an outline: once that run has ended,
   * the amber "Next level" is the one its result leads with, beside the drawing, so the viewport holds one amber control.
   */
  after?: number
  /** Called when the learner starts this level, so the run before it can fold away. */
  onStart?: () => void
  /** The next opening level has started: this one folds to one line, so the Run holds one live instrument. */
  folded?: boolean
  /** The lesson's way on from this run's result, which its debrief leads with: the next opening level, or "Read why". */
  onward?: LessonOnward | null
  /** The learner chose this level from the result of the one before it: it starts, and takes focus, as its own button would. */
  requested?: boolean
}

export function Instrument({ block, at, blocks, scope, rev, kind, guesses = [], autoStart = false, after, onStart, folded = false, onward = null, requested = false }: InstrumentProps) {
  const entry = rosterEntry(block.id)
  const title = useLevelNames()(block.id, block.level) ?? entry?.title ?? 'This level'
  const [started, setStarted] = useState(autoStart)
  const [failed, setFailed] = useState(false)
  const [focus, setFocus] = useState(false)
  // Started from the result of the level before it (`requested`): the same as its own button. (Adjusting state to a prop, during render.)
  const [asked, setAsked] = useState(requested)
  if (requested && !asked) {
    setAsked(true)
    setStarted(true)
    setFocus(true)
  }
  // The debrief draws the paired guess's reveal beside the run's result while it is up; the ticket under the instrument steps aside then.
  const [revealShown, setRevealShown] = useState(false)
  const before = useBlockRun(scope, after ?? -1)
  const own = useBlockRun(scope, at)
  const paired = guesses.find((guess) => guess.paired)
  const pairedBlock = paired === undefined ? undefined : (blocks[paired.at] as Of<'predict'>)
  // A run that asks two guesses numbers them, the ones above it first and the level's own slot last: two boxes with one title read as one.
  const many = guesses.length > 1
  const lessonGuess = usePairedGuess(pairedBlock, scope, many ? `Guess ${guesses.length} of ${guesses.length}, in the level` : undefined)
  const above = guesses.filter((guess) => !guess.paired)
  const loading = useRef<HTMLParagraphElement>(null)
  const pairedTicket =
    pairedBlock === undefined ? null : (
      <Suspense fallback={null}>
        <PredictTicket block={pairedBlock} scope={scope} at={paired?.at ?? 0} blocks={blocks} rev={rev} slot="paired" {...(many ? { label: `Guess ${guesses.length} of ${guesses.length}` } : {})} />
      </Suspense>
    )
  const lessonRun: LessonRun = { onward, reveal: pairedTicket, showsReveal: setRevealShown }
  useEffect(() => {
    if (focus) loading.current?.focus()
  }, [focus])

  const label = kind === 'graded' ? 'Graded level' : kind === 'inline' ? 'Run' : 'Level'
  const head = (
    <p className="es-run__head">
      <span className="es-run__kind">{label}</span>
      <span className="es-run__title">{title}</span>
      <span className="es-run__game">{entry?.title ?? block.id}</span>
    </p>
  )
  const unbuilt = entry === undefined || pendingGame(block.id) !== null
  const start = () => {
    setFocus(true)
    setStarted(true)
    onStart?.()
  }

  if (folded) {
    return (
      <div className="es-run" id={runAnchor(at)} data-block="game" data-play={`${block.id}/${block.level}`} data-mode={block.mode} data-kind={kind} data-phase="folded">
        {head}
        <p className="es-run__note es-run__note--folded">
          {own === null ? 'You moved on to the next level before this run ended.' : 'You ran this level. Its result is in your record under Keep.'}{' '}
          <TextLink to={`/play/${block.id}?level=${block.level}`}>Play it again on its own page</TextLink>
        </p>
      </div>
    )
  }

  return (
    <div className="es-run" id={runAnchor(at)} data-block="game" data-play={`${block.id}/${block.level}`} data-mode={block.mode} data-kind={kind} data-phase={unbuilt ? 'unbuilt' : failed ? 'failed' : started ? 'open' : 'waiting'}>
      {/* Once a level is open the frame names it, its game and its mode: the head stands only for one that waits, and for a graded level. */}
      {started && kind !== 'graded' && !unbuilt && !failed ? null : head}
      {kind === 'graded' ? <p className="es-run__rule">New numbers are drawn when you start, and there is no undo. The level states its pass rule before the run.</p> : null}
      {above.length === 0 ? null : (
        <Suspense fallback={null}>
          {above.map((guess, nth) => (
            <PredictTicket key={guess.at} block={blocks[guess.at] as Of<'predict'>} scope={scope} at={guess.at} blocks={blocks} rev={rev} slot="above" {...(many ? { label: `Guess ${nth + 1} of ${guesses.length}, before this run` } : {})} />
          ))}
        </Suspense>
      )}
      {unbuilt ? (
        <p className="es-run__note">This game is not published yet.</p>
      ) : failed ? (
        <p className="es-run__note" role="alert">
          The game stopped. Your runs and answers so far are saved in this browser: reload the page to start it again.{' '}
          <Button variant="quiet" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </p>
      ) : started ? (
        <div className="es-run__play">
          <EmbedBoundary onError={() => setFailed(true)}>
            <Suspense fallback={<Loading title={entry.title} ref={loading} />}>
              <LessonGuessContext.Provider value={lessonGuess}>
                <LessonRunContext.Provider value={lessonRun}>
                  <GameEmbed block={block} scope={scope} at={at} rev={rev} title={entry.title} autoFocus={focus} />
                </LessonRunContext.Provider>
              </LessonGuessContext.Provider>
            </Suspense>
          </EmbedBoundary>
        </div>
      ) : after !== undefined ? (
        <div className="es-next es-run__next">
          <button type="button" className="es-next__action" data-emphasis="outline" onClick={start}>
            <span className="es-next__text">
              <span className="es-next__label">Next level: {title}</span>
              <span className="es-next__minutes">{before !== null ? 'The run above has ended.' : 'Play it after the level above, or now.'}</span>
            </span>
          </button>
        </div>
      ) : (
        <p className="es-run__start">
          <Button variant="ink" onClick={start}>
            {kind === 'graded' ? `Play the graded run: ${title}` : `Play: ${title}`}
          </Button>
          <span className="es-run__mode">{block.mode === 'graded' ? 'Graded, on new numbers.' : 'Practice, on the level’s own numbers, with undo.'}</span>
        </p>
      )}
      {revealShown ? null : pairedTicket}
      <p className="es-run__elsewhere">
        <TextLink to={`/play/${block.id}?level=${block.level}`}>Every level of {entry?.title ?? block.id}</TextLink>
      </p>
    </div>
  )
}

/** The line that stands where the game will be while its code loads. It takes focus when the learner started the level. */
function Loading({ title, ref }: { title: string; ref?: Ref<HTMLParagraphElement> }) {
  return (
    <p className="es-run__loading" role="status" tabIndex={-1} ref={ref}>
      <PrintingDots />
      <span>Setting up {title}…</span>
    </p>
  )
}

/** Catches a game whose code did not load, or that threw, so the lesson reads on and the run says what happened. */
class EmbedBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
