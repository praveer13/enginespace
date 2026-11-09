import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { rosterEntry, type RosterEntry } from '@es/play/roster'
import { PrintingDots } from '@/design/components/PrintingDots'
import { Stub } from '@/design/components/Stub'
import { TextLink } from '@/design/components/TextLink'
import { Frame, PendingLine, Tapes, type Of } from './BlockFrame'
import { pendingGame } from './model'

/*
 * A lesson's `game` block (ARCHITECTURE §4.3: "It embeds `src/games/<id>`"; W1b-T01): the ticket that names the game, its level and its
 * mode, and once the learner pulls its stub, the game itself under it, at that level and in that mode, as on the game's own page.
 *
 *   - The game's code loads when the learner starts the level, and not before (GameEmbed.tsx is a chunk of its own, and the game's follows
 *     it): the ticket that waits is drawn from the roster's names (`@es/play/roster`) and from GAME_TASKS, which says which games are not
 *     built yet, so the lesson's first paint holds no game, no scene and no three.
 *   - A page keeps one live 3D canvas (A§6.4, src/scene/lease.ts). A level the learner starts takes it, and a game opened before shows its
 *     2D view, with the Stage's button that takes the 3D view back.
 *   - A graded block draws its seed when the level starts, in the game, as the game's own page does, and every run that ends is written to
 *     the ledger as the same `play` event the game's page writes (src/games/kit/record.ts). It is also put where the block that reads it
 *     finds it: the prediction box reveals after the game (runs.ts).
 *   - A game that no task has built yet keeps its ticket, which names the open task that builds it.
 *
 * Once open, the block runs wider than a ticket: it takes the lesson's column, which the stylesheet widens on a wide screen while a game is
 * open (content.css), and the game lays its parts out for that column (GameShell's `embedded`).
 */

const GameEmbed = lazy(() => import('./GameEmbed'))

/** What a run of each mode is, in the learner's words. */
const MODE_LINES = {
  practice: 'Practice, on the level’s own numbers, with undo. Nothing is timed.',
  graded: 'Graded: new numbers drawn when you start, and no undo. Nothing is timed.',
} as const

export interface GameBlockProps {
  block: Of<'game'>
  /** The lesson or module the block belongs to, for the head line, and for its runs (runs.ts). */
  scope: string
  /** The block's place among the page's blocks, which its runs are found by (runs.ts). */
  at: number
  /** The page's content revision, which a run's record carries (A§4.2). */
  rev?: string
}

export function GameBlock({ block, scope, at, rev }: GameBlockProps) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  // The stub the learner pulled goes with the ticket that waits: focus goes to the line that says the game is coming, then to the game.
  const loading = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (open) loading.current?.focus()
  }, [open])

  const entry = rosterEntry(block.id)
  const meta = `${block.id} · ${block.level}`
  const facts = [`level · ${block.level}`, block.mode]
  const data = (phase: string) => ({ play: `${block.id}/${block.level}`, mode: block.mode, phase })

  if (entry === undefined) {
    return <Frame block="game" scope={scope} meta={meta} title="Play" state="empty" empty={`No game is called ${block.id}.`} />
  }
  const pending = pendingGame(block.id)
  if (pending !== null) {
    return (
      <Frame block="game" scope={scope} meta={meta} title="Play" pending={pending.task} data={data('unbuilt')} stub={<Stub disabled>Start level</Stub>}>
        <GameName entry={entry} />
        <Tapes label="About this game" items={facts} />
        <PendingLine {...pending} />
      </Frame>
    )
  }
  if (failed) {
    return (
      <Frame
        block="game"
        scope={scope}
        meta={meta}
        title="Play"
        data={data('failed')}
        state="error"
        error="The game would not load, or stopped. Check your connection and reload the page."
        stub={<Stub onClick={() => window.location.reload()}>Reload page</Stub>}
      >
        <GameName entry={entry} />
      </Frame>
    )
  }
  // Once the stub is pulled, the ticket keeps its head, its title and the way to the game's own page: the game under it names itself, its
  // level and its mode.
  return (
    <div className="es-c-game" data-open={open ? '' : undefined}>
      <Frame block="game" scope={scope} meta={meta} title="Play" data={data(open ? 'open' : 'waiting')} stub={open ? undefined : <Stub onClick={() => setOpen(true)}>Start level</Stub>}>
        {open ? null : (
          <>
            <GameName entry={entry} />
            <Tapes label="About this game" items={facts} />
            <p>{MODE_LINES[block.mode]}</p>
          </>
        )}
        <p className="es-c-game__elsewhere">
          <TextLink to={`/play/${block.id}?level=${block.level}`}>Every level of {entry.title}, on its own page</TextLink>
        </p>
      </Frame>
      {open ? (
        <div className="es-c-game__play">
          <EmbedBoundary onError={() => setFailed(true)}>
            <Suspense fallback={<GameLoading title={entry.title} ref={loading} />}>
              <GameEmbed block={block} scope={scope} at={at} rev={rev} title={entry.title} />
            </Suspense>
          </EmbedBoundary>
        </div>
      ) : null}
    </div>
  )
}

/** The game's display name over its engine concept, as the learner meets it (D-049). */
function GameName({ entry }: { entry: RosterEntry }) {
  return (
    <p className="es-c-game__name">
      <strong>{entry.title}</strong> · {entry.subtitle}
    </p>
  )
}

/** The line that stands where the game will be while its code loads: the printer's dots, and what is coming. It takes focus while it waits. */
export function GameLoading({ title, ref }: { title: string; ref?: Ref<HTMLParagraphElement> }) {
  return (
    <p className="es-c-game__loading" role="status" tabIndex={-1} ref={ref}>
      <PrintingDots />
      <span>Setting up {title}…</span>
    </p>
  )
}

/** Catches a game whose code did not load, or that threw, so the lesson reads on and the block says what happened. */
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
