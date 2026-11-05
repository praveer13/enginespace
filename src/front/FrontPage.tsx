import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { useLoaderData } from 'react-router'
import { keymapOf, levelOf } from '@es/play'
import type { KeyBinding } from '@es/play'
import { LOOP } from '@es/play/loop/entry'
import { stationsOf, type Orientation } from '@es/play/loop/layout'
import { loopSession } from '@es/play/loop/session'
import type { LoopAction, LoopView } from '@es/play/loop/types'
import type { ContentIndex } from '@es/schema'
import type { Seed } from '@es/sim/core'
import { MenuLink } from '@/design/components/Board'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import type { KeysDialogProps } from '@/games/kit/KeysDialog'
import { focusIsLost } from '@/games/kit/focus'
import { LiveRegion } from '@/games/kit/LiveRegion'
import { useGameInput } from '@/games/kit/useGameInput'
import { useRun } from '@/games/kit/useRun'
import { ViewSwitch, type GameView } from '@/games/kit/ViewSwitch'
import { WorldCard } from '@/games/loop/Card'
import { LoopAuto, LoopBell, LoopPrompt, LoopTickets } from '@/games/loop/ControlPieces'
import { useLoopControls, type AutoToggleRef } from '@/games/loop/useLoopControls'
import { Mirror } from '@/games/loop/Mirror'
import { stepClockOf } from '@/games/loop/readout'
import type { Scene3DProps } from '@/games/loop/Scene3D'
import { FRONT_PRESET } from '@/games/loop/scene-presets'
import { svgToReact } from '@/games/loop/svg'
import type { LoopRun } from '@/games/loop/types'
import { useOrientation } from '@/games/loop/useOrientation'
import { PORTRAIT_WIDTH } from '@/scene/camera-rig'
import type { StageProps } from '@/scene/Stage'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import { anchorProperties, PASS_ANCHORS } from './anchors'
import { DECK, HERO, MENU, NEXT, NIGHT, ORDER, TAPE } from './copy'
import { decimalsOf, lanesOf, menuId, type FrontData } from './menu'
import { ORIENTATIONS, passDrawing } from './poster'
import { readConnection, upgradeOf, useSettled } from './upgrade'

/*
 * The front page (`/`; ARCHITECTURE §6.11, TRACKER W0-T18): the pass, seen over the expediter's shoulder, in the middle of service.
 *
 * The first viewport is the pass. The scene fills it: the poster in the static HTML, the 2D game once the page has run, and the 3D pass
 * after the largest paint on a device that draws it (upgrade.ts). In front of the scene stand the page's own objects, where the pass
 * puts them:
 *   - the order ticket, hung from the rail, with the heading, the promise and, on its stub, the primary action;
 *   - the printer at the rail's left end, with the menu link on its housing; out of its mouth comes its tape, the live readout of the
 *     step loop (the last fire as it was cooked, and the next one as the rail stands, before the bell), and then its strip of waiting
 *     tickets, which the expediter tears off and hangs; the scene draws no printer of its own here, so the pass has one;
 *   - the bell, which fires the next step.
 * Under the pass runs its front edge, the deck, with the level's prompt and the switches. anchors.ts says where the scene's landmarks
 * fall, and front.css places the objects on them, so they stand where they belong before any script runs. On a phone the objects stack:
 * the order ticket, then the printer with its strip and the bell, then the pass, so the scene, a ticket to hang and the bell share the
 * first screen.
 *
 * The game is Service's front-page run, "First service" (GAMES.md §3.1, D-043): the same session, levels and parts as `/play/loop`, in
 * the page's own frame, built on `useRun` as GameShell is (A§6.3). A run here is practice and records nothing (D-038).
 *
 * Below the pass: the night so far (the DOM mirror and, when a level ends, its debrief), the order (PRODUCT.md's four outcomes), the
 * menu (the course map) and the next ticket (Start TR1). The words are copy.ts.
 *
 * The static HTML is this page, rendered once by the build at `/` (shell.ts, scripts/pages/front-shell.ts). On the server the page
 * draws both orientations of the poster, and front.css shows the one that fits, so the first paint and the first client render agree
 * on every screen and the swap from one to the other moves nothing.
 */

/** The 3D scene, its own chunk over three's (A§6.10): loaded only when the pass turns 3D. */
const Scene3D = lazy(() => import('@/games/loop/Scene3D'))
/**
 * The Stage that swaps the scene in, and the Keys dialog: neither is needed for the first paint, so each loads when it is first
 * wanted, and the first-paint closure stays inside its budget (A§6.10). Until then the pass shows the same drawing the Stage would,
 * and the Keys button is the same button.
 */
const Stage = lazy(() => import('@/scene/Stage').then((module) => ({ default: module.Stage as ComponentType<StageProps<Scene3DProps>> })))
const KeysDialog = lazy(() => import('@/games/kit/KeysDialog').then((module) => ({ default: module.KeysDialog as ComponentType<KeysDialogProps> })))
/** The debrief and its compare strips load when a level ends, not before. */
const Debrief = lazy(() => import('@/games/loop/Debrief').then((module) => ({ default: module.Debrief })))
/** The overlap switch: only the run's later levels have it, so it loads when the page has settled, before a level can ask for it. */
const LoopOverlap = lazy(() => import('@/games/loop/LoopOverlap'))

/** The page holds the printer and its tickets, so the scene leaves its own out, and frames the pass for the page (`FRONT_PRESET`). */
function FrontScene(props: Scene3DProps) {
  return <Scene3D {...props} printer={false} />
}

const RING: LoopAction = { t: 'run', until: 'step' }
const noSubscribe = () => () => undefined

/** How many waiting tickets the printer's strip shows: the rest are still in the printer, and it feeds the next as one is torn off. */
const STRIP_TICKETS = 3

/** True while the page renders on the server: the static HTML. */
function useIsServer(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => false,
    () => true,
  )
}

/** Where the scene's landmarks fall, once per page: the front page's shot over its rail of four. */
let anchorStyle: CSSProperties | null = null
function passStyle(): CSSProperties {
  anchorStyle ??= anchorProperties(PASS_ANCHORS) as CSSProperties
  return anchorStyle
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The keys                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** `1` to `9` hang the waiting ticket at that place in the line (the signature interaction's keys). */
const HANG_KEYS: readonly KeyBinding[] = Array.from({ length: 9 }, (_, i) => [
  { id: `hang-${i + 1}`, code: `Digit${i + 1}`, label: String(i + 1), description: 'Hang that waiting ticket' },
  { id: `hang-${i + 1}`, code: `Numpad${i + 1}`, label: String(i + 1), description: 'Hang that waiting ticket' },
]).flat()
const KEYS: readonly KeyBinding[] = [...keymapOf(LOOP).filter((key) => key.id !== 'camera' && !key.id.startsWith('stage-')), ...HANG_KEYS]
/** What the Keys dialog lists: the keys above, with the nine hanging keys on one line. */
const SHOWN_KEYS: readonly KeyBinding[] = [
  ...keymapOf(LOOP).filter((key) => key.id !== 'camera' && !key.id.startsWith('stage-')),
  { id: 'hang', code: 'Digit1', label: '1 to 9', description: 'Hang the waiting ticket at that place in the line' },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The page                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export function FrontPage() {
  const data = useLoaderData() as FrontData | undefined
  const index = data?.index ?? null
  return (
    <div className="es-front">
      <Service />
      <Order />
      <Menu index={index} />
      <NextTicket index={index} />
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Service                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

interface At {
  readonly level: string
  readonly seed: Seed
  /** Bumped by a restart: a fresh run of the same level. */
  readonly count: number
  /** The run before this one ended with a move of the learner's: put focus back on the game when this one mounts. */
  readonly refocus: boolean
}

/**
 * The run of "First service". A new level, a new seed or a restart is a new run, so the run below is keyed by them; what the learner
 * chose about the view lives here, above it, and carries over from level to level.
 */
function Service() {
  const first = LOOP.levels[0]
  const [at, setAt] = useState<At>({ level: first.id, seed: first.practiceSeed, count: 0, refocus: false })
  const after = LOOP.levels[LOOP.levels.findIndex((level) => level.id === at.level) + 1] ?? null

  // The view: 3D on its own once the page has settled on a device that draws it (upgrade.ts), and the learner's choice from then on.
  const device = useDeviceTier()
  const settled = useSettled()
  const upgrade = upgradeOf(device, readConnection())
  const can3d = device.known && device.tier >= 1
  const [chosen, setChosen] = useState<GameView | null>(null)
  const view: GameView = chosen ?? (settled && (upgrade === 'load' || upgrade === 'offer') ? '3d' : '2d')
  // Service starts at the stub, or at the learner's first move: the order ticket's stub is then torn off.
  const [started, setStarted] = useState(false)
  const start = useCallback(() => setStarted(true), [])

  return (
    <ServiceRun
      key={`${at.level}|${at.seed}|${at.count}`}
      level={at.level}
      seed={at.seed}
      refocus={at.refocus}
      next={after === null ? null : { id: after.id, title: after.title }}
      onNext={() => {
        if (after !== null) setAt({ level: after.id, seed: after.practiceSeed, count: 0, refocus: true })
      }}
      onRestart={(seed) => setAt({ ...at, seed: seed ?? at.seed, count: at.count + 1, refocus: true })}
      view={can3d ? view : '2d'}
      onViewChange={setChosen}
      started={started}
      onStart={start}
      can3d={can3d}
      unavailable3d={device.known && !can3d ? unavailableReason(device.reason) : undefined}
    />
  )
}

interface ServiceRunProps {
  level: string
  seed: Seed
  refocus: boolean
  next: { id: string; title: string } | null
  onNext: () => void
  onRestart: (seed?: Seed) => void
  view: GameView
  onViewChange: (view: GameView) => void
  started: boolean
  onStart: () => void
  can3d: boolean
  unavailable3d?: string
}

function ServiceRun({ level, seed, refocus, next, onNext, onRestart, view: shown, onViewChange, started, onStart, can3d, unavailable3d }: ServiceRunProps) {
  const entry = levelOf(LOOP, level) ?? LOOP.levels[0]
  const run = useRun({ session: loopSession, game: LOOP.id, level: entry.id, seed, mode: 'practice' })
  const { view, outcome, dispatch, announce } = run
  const isServer = useIsServer()
  const titleId = useId()
  const nightId = useId()
  const mirrorId = useId()
  const [keysOpen, setKeysOpen] = useState(false)
  // The dialog's code loads the first time it is asked for, or once the page has settled, whichever comes first.
  const [keysWanted, setKeysWanted] = useState(false)
  const settled = useSettled()
  const openKeys = () => {
    setKeysWanted(true)
    setKeysOpen(true)
  }
  const toggleAuto: AutoToggleRef = useRef(null)
  const expo = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const debrief = useRef<HTMLDivElement>(null)

  const undo = useCallback(() => run.undo(), [run])
  const api: LoopRun = {
    game: run.game,
    level: run.level,
    mode: run.mode,
    seed: run.seed,
    view,
    score: run.score,
    ask: run.ask,
    done: run.done,
    turns: run.turns,
    canUndo: run.canUndo,
    dispatch,
    undo,
    announce,
    setAutoplay: run.setAutoplay,
    mirrorId,
    phase: outcome === null ? 'play' : 'debrief',
    restart: onRestart,
    goTo: () => undefined,
  }
  const controls = useLoopControls(api, toggleAuto)
  // The next fire, before the bell: the session's own reducer on the night as it stands, so the tape says what the bell will do.
  const { preview } = run
  const nextFire = useMemo(() => (view.canFire ? preview(RING) : null), [view.canFire, preview])

  const switchView = (next: GameView) => {
    onViewChange(next)
    announce(next === '3d' ? '3D view.' : '2D view.')
  }

  const container = useGameInput({
    keys: KEYS,
    onCommand: (binding) => {
      switch (binding.id) {
        case 'view':
          if (!can3d) return false
          switchView(shown === '2d' ? '3d' : '2d')
          return true
        case 'help':
          openKeys()
          return true
        case 'step':
          if (!view.canFire) return false
          dispatch(RING)
          return true
        case 'overlap':
          if (!view.overlapAvailable || view.done) return false
          dispatch({ t: 'lever', name: 'async', value: !view.overlap })
          return true
        case 'play-pause':
          toggleAuto.current?.()
          return toggleAuto.current !== null
        case 'step-back':
          if (!run.canUndo) return false
          undo()
          return true
        default: {
          const place = /^hang-(\d)$/.exec(binding.id)
          const req = place === null ? undefined : view.waiting[Number(place[1]) - 1]
          if (req === undefined || !view.canHang) return false
          dispatch({ t: 'admit', req })
          return true
        }
      }
    },
  })

  // Once the page has settled, fetch the overlap switch's code, so a later level that has the switch shows it at once.
  useEffect(() => {
    if (settled) void import('@/games/loop/LoopOverlap')
  }, [settled])

  // The learner's first move starts service, as the stub does.
  useEffect(() => {
    if (run.turns > 0 && !started) onStart()
  }, [run.turns, started, onStart])

  // A ticket hung by its key takes its button with it: put focus back on the game, so its keys still work.
  useEffect(() => {
    if (focusIsLost() && run.turns > 0) container.current?.focus({ preventScroll: true })
  }, [view, run.turns, container])

  // A new level or a fresh run, after a move of the learner's: back to the pass, with focus on the first ticket that waits.
  useEffect(() => {
    if (!refocus) return
    container.current?.scrollIntoView({ block: 'start' })
    const first = expo.current?.querySelector<HTMLButtonElement>('[data-loop-controls] ul button:not(:disabled)')
    ;(first ?? container.current)?.focus({ preventScroll: true })
  }, [refocus, container])

  /**
   * The stub: start service. The stub tears off; focus goes to the first ticket that waits on the printer's strip, or to the bell,
   * and the level's prompt is read out.
   */
  const start = () => {
    const ticket = expo.current?.querySelector<HTMLButtonElement>('[data-loop-controls] ul button:not(:disabled)')
    const bell = expo.current?.querySelector<HTMLButtonElement>('.es-bell__button:not(:disabled)')
    onStart()
    // Focus scrolls only when what it lands on is out of view: the strip and the bell stand by the order ticket on every screen.
    ;(ticket ?? bell ?? container.current)?.focus()
    announce(view.prompt)
  }

  const seeDebrief = () => {
    debrief.current?.scrollIntoView({ block: 'start' })
    debrief.current?.focus({ preventScroll: true })
  }

  const mount3d = shown === '3d' && can3d && !isServer
  const drag = useTicketDrag({ strip: expo, stage, view, dispatch, announce, flat: !mount3d })
  // A waiting ticket picked in the 3D scene is hung, as a tap on it on the strip hangs it.
  const onHang = useCallback(
    (req: number) => {
      if (view.canHang && view.waiting.includes(req)) dispatch({ t: 'admit', req })
    },
    [view.canHang, view.waiting, dispatch],
  )
  const fill = view.canHang && view.waiting.length > 0 && view.rail.some((clip) => clip.req === null) ? () => dispatch({ t: 'admit', req: view.waiting[0] }) : null
  const drawing = <PassDrawing view={view} both={isServer} />

  return (
    <>
      <section
        ref={container}
        tabIndex={-1}
        aria-labelledby={titleId}
        className="es-front-service"
        data-game={LOOP.id}
        data-level={entry.id}
        data-view={mount3d ? '3d' : '2d'}
        data-started={started ? '' : undefined}
        data-dragging={drag.ghost === null ? undefined : ''}
      >
        <div className="es-front-pass" style={passStyle()}>
          <div className="es-front-order">
            <span className="es-front-rail" aria-hidden="true" />
            <Ticket
              as="div"
              className="es-front-ticket"
              width="full"
              titleAs="h1"
              title={<span id={titleId}>{HERO.headline}</span>}
              stub={!started ? <Stub onClick={start}>{HERO.start}</Stub> : outcome ? <Stub onClick={seeDebrief}>{DECK.debrief}</Stub> : undefined}
            >
              {HERO.promise.map((line) => (
                <p key={line} className="es-front-promise">
                  {line}
                </p>
              ))}
              {started && !outcome ? <span className="es-front-ticket__tear" aria-hidden="true" /> : null}
            </Ticket>
            <span className="es-front-grip" aria-hidden="true" />
          </div>

          <div ref={expo} className="es-front-expo" {...drag.stripProps}>
            <div className="es-front-printer">
              <PrinterBody />
              <MenuLink className="es-front-printer__menu" />
              {view.waiting.length > STRIP_TICKETS ? <span className="es-front-printer__more">{DECK.more}</span> : null}
            </div>
            <PassTape view={view} next={nextFire} onFill={fill} />
            <LoopTickets controls={controls} limit={STRIP_TICKETS} className="es-front-strip" listClassName="es-front-strip__list" />
            <div className="es-front-bell">
              <LoopBell controls={controls} size="lg" caption="fire" />
            </div>
          </div>

          <div ref={stage} className="es-front-pass__stage" data-drop-target={drag.ghost === null ? undefined : ''}>
            {mount3d ? (
              <Suspense fallback={<div className="es-front-stage es-front-stage--flat">{drawing}</div>}>
                <Stage id="front" className="es-front-stage" view2d={drawing} scene={FrontScene} sceneProps={{ view, preset: FRONT_PRESET, onHang }} announce={announce} />
              </Suspense>
            ) : (
              <div className="es-front-stage es-front-stage--flat">{drawing}</div>
            )}
          </div>
        </div>

        <div className="es-front-deck">
          <TapeLabel className="es-front-deck__level" tilt="right">
            {DECK.run} · {entry.title}
          </TapeLabel>
          <LoopPrompt controls={controls} className="es-front-deck__prompt" />
          <div className="es-front-deck__switches">
            <LoopAuto controls={controls} size="md" />
            {view.overlapAvailable ? (
              <Suspense fallback={null}>
                <LoopOverlap controls={controls} />
              </Suspense>
            ) : null}
          </div>
          <div className="es-front-deck__tools">
            <ViewSwitch view={mount3d ? '3d' : '2d'} onViewChange={switchView} available3d={can3d} unavailableReason={unavailable3d} />
            {/* One button from the first paint, so the one the learner pressed is the one focus comes back to. The dialog's code
                loads beside it, the first time it is asked for or once the page has settled. */}
            <KeysButton onClick={openKeys} />
            {keysWanted || settled ? (
              <Suspense fallback={null}>
                <KeysDialog keys={SHOWN_KEYS} open={keysOpen} onOpenChange={setKeysOpen} />
              </Suspense>
            ) : null}
            <Button size="sm" variant="quiet" disabled={!run.canUndo} aria-keyshortcuts="," onClick={undo}>
              {DECK.undo}
            </Button>
          </div>
          {outcome ? (
            <div className="es-front-deck__over" data-end="">
              <p>{DECK.over}</p>
              <Button variant="ink" onClick={seeDebrief}>
                {DECK.debrief}
              </Button>
            </div>
          ) : null}
          <noscript>
            <p className="es-front-deck__noscript">{DECK.noScript}</p>
          </noscript>
        </div>

        {drag.ghost === null ? null : (
          <span className="es-front-ghost" aria-hidden="true" style={{ transform: `translate(${drag.ghost.x}px, ${drag.ghost.y}px)` }}>
            {drag.ghost.label}
          </span>
        )}
        <LiveRegion announcement={run.announcement} outcome={outcome ? `${DECK.over} The debrief is ready.` : ''} />
      </section>

      <section aria-labelledby={nightId} className="es-front-night">
        <div className="es-front-night__head">
          <h2 id={nightId} className="es-type-heading">
            {NIGHT.title}
          </h2>
          <p className="es-front-lede">{NIGHT.lede}</p>
        </div>
        {outcome ? (
          <div ref={debrief} tabIndex={-1} className="es-front-night__debrief" aria-label="Debrief">
            <Suspense fallback={<p role="status">Printing the debrief…</p>}>
              <Debrief run={api} outcome={outcome} next={next} onNext={onNext} />
            </Suspense>
          </div>
        ) : null}
        <div className="es-front-night__mirror">
          <Mirror run={api} />
        </div>
        <details className="es-front-night__card">
          <summary>{NIGHT.card}</summary>
          <WorldCard />
        </details>
      </section>
    </>
  )
}

/** The Keys button: the dialog's trigger once its code is in, and a button that asks for it until then. */
function KeysButton({ onClick, ...rest }: { onClick?: () => void }) {
  return (
    <Button size="sm" variant="quiet" aria-keyshortcuts="Shift+/" onClick={onClick} {...rest}>
      {DECK.keys}
    </Button>
  )
}

/** The kitchen's word, then the engine's term (GAMES.md §2.6, rule 2). */
function Pair({ words }: { words: { kitchen: string; engine: string | null } }) {
  return (
    <>
      {words.kitchen}
      {words.engine === null ? null : <span className="es-front-term"> · {words.engine}</span>}
    </>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The printer                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The kitchen printer's body, drawn as the object it is, behind the menu link printed on its face: a powder-coated housing on two
 * feet, its lid over the roll with a seam and a lit top edge, the roll seen through the lid's smoked window, the feed button and its
 * lamp, and at its foot the mouth with the tear bar's teeth, where the tape comes out. It scales to the box the layout gives it; its
 * colours are classes of front.css, every one a token role.
 */
function PrinterBody() {
  const teeth = useId()
  return (
    <svg className="es-front-printer__body" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={teeth} width="7" height="6" patternUnits="userSpaceOnUse">
          <path className="es-front-printer__tooth" d="M0 0 L3.5 6 L7 0 Z" />
        </pattern>
      </defs>
      <rect className="es-front-printer__foot" x="7%" y="94%" width="11%" height="6%" rx="2" />
      <rect className="es-front-printer__foot" x="82%" y="94%" width="11%" height="6%" rx="2" />
      <rect className="es-front-printer__shell" x="0.5" y="0.5" width="99%" height="94%" rx="10" />
      <rect className="es-front-printer__lid" x="1.5%" y="2%" width="97%" height="40%" rx="8" />
      <line className="es-front-printer__glint" x1="4%" y1="3.4%" x2="96%" y2="3.4%" />
      <line className="es-front-printer__seam" x1="1.5%" y1="42%" x2="98.5%" y2="42%" />
      <rect className="es-front-printer__window" x="60%" y="48%" width="22%" height="22%" rx="4" />
      <rect className="es-front-printer__roll" x="62.5%" y="51%" width="17%" height="16%" rx="6" />
      <line className="es-front-printer__core" x1="65%" y1="59%" x2="77%" y2="59%" />
      <circle className="es-front-printer__led" cx="89%" cy="51%" r="2.5" />
      <circle className="es-front-printer__button" cx="89%" cy="63%" r="7" />
      <rect className="es-front-printer__mouth" x="5%" y="82%" width="90%" height="7%" rx="2" />
      <rect fill={`url(#${teeth})`} x="5%" y="78%" width="90%" height="6" />
    </svg>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The printer's tape                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One printed line of the tape: the kitchen word and the engine term, then its value at the right. */
function TapeLine({ words, children, tone = 'ink', id }: { words: { kitchen: string; engine: string | null }; children: ReactNode; tone?: 'ink' | 'ink-2'; id: string }) {
  return (
    <div className="es-front-tape__line" data-tone={tone} data-line={id}>
      <dt>
        <Pair words={words} />
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

/** The stations as the tape prints them: a pip for each clip, lit or an open ring, so the count is never the only carrier. */
function Pips({ lit }: { lit: readonly boolean[] }) {
  return (
    <span className="es-front-pips" aria-hidden="true">
      {lit.map((on, slot) => (
        <span key={slot} className="es-front-pips__pip" data-lit={on || undefined} />
      ))}
    </span>
  )
}

/**
 * The printer's tape (D-048), the live readout, printed from the first paint. Its first part is the last fire as the line cooked
 * it: the fire's number, the ticks per step, the stations it lit and the ones it left dark (an empty clip is a course the line paid
 * for and nobody ate); from the level that hands over the overlap switch, the dark stretches between fires (the bubble); and on the
 * run's last level, the clock against par. The tape prints what the beat is about; the mirror below prints every counter. Under the
 * perforation is the next fire as the rail stands: the stations it will light and the ticks per step the tape will print once it is
 * rung, so a fire is read before it is committed. Those stations are also the control that fills them: pressing them hangs the next
 * ticket on the first free clip. Once the level is over there is no next fire on this rail, and the tape says so rather than
 * previewing one the bell will not ring. Every figure is the synthetic world's, and the tape is stamped so.
 */
function PassTape({ view, next, onFill }: { view: LoopView; next: LoopView | null; onFill: (() => void) | null }) {
  const c = view.counters
  const lastLit = stationsOf(view)
  const fired = view.fires.length > 0
  const lit = lastLit.filter(Boolean).length
  const dark = view.slots - lit
  const clock = stepClockOf(view)
  const hung = view.rail.map((clip) => clip.req !== null)
  const hungCount = hung.filter(Boolean).length
  const nextClock = next === null ? null : stepClockOf(next)
  const ticks = (value: number, tone: 'ink' | 'ink-2' = 'ink') => <Readout value={value} unit="ticks" tag="synthetic" size="sm" tone={tone} />
  const count = (value: number, tone: 'ink' | 'ink-2' = 'ink') => <Readout value={value} tag="synthetic" size="sm" tone={tone} />
  const stations = (
    <>
      <Pips lit={hung} />
      <span className="es-front-tape__of">
        {count(hungCount)} {TAPE.of} {count(view.slots)}
      </span>
    </>
  )
  return (
    <div className="es-front-tape" role="group" aria-label={TAPE.name}>
      <p className="es-front-tape__stamp">{TAPE.stamp}</p>
      <dl className="es-front-tape__lines" data-part="last">
        <TapeLine id="fire" words={TAPE.fire}>
          <Readout value={view.step} pad={4} tag="synthetic" size="sm" />
        </TapeLine>
        <TapeLine id="ticks" words={TAPE.ticksPerStep}>
          {clock === null ? TAPE.notYet : ticks(clock)}
        </TapeLine>
        <TapeLine id="busy" words={TAPE.busy}>
          {fired ? (
            <>
              <Pips lit={lastLit} />
              <span className="es-front-tape__of">
                {count(lit)} {TAPE.of} {count(view.slots)}
              </span>
            </>
          ) : (
            TAPE.notYet
          )}
        </TapeLine>
        <TapeLine id="dark" words={TAPE.dark} tone={fired && dark > 0 ? 'ink-2' : 'ink'}>
          {fired ? count(dark, dark > 0 ? 'ink-2' : 'ink') : TAPE.notYet}
        </TapeLine>
        {view.overlapAvailable ? (
          <TapeLine id="bubble" words={TAPE.bubble} tone={c.bubbleUs > 0 ? 'ink-2' : 'ink'}>
            {ticks(c.bubbleUs, c.bubbleUs > 0 ? 'ink-2' : 'ink')}
          </TapeLine>
        ) : null}
        {view.par === null ? null : (
          <TapeLine id="clock" words={TAPE.clock}>
            {ticks(c.clockUs)} <span className="es-front-term">{TAPE.againstPar}</span> {ticks(view.par)}
          </TapeLine>
        )}
      </dl>
      <div className="es-front-tape__next" data-part="next">
        <p className="es-front-tape__head">{TAPE.next}</p>
        {view.done ? (
          <p className="es-front-tape__preview es-front-tape__closed" data-state="over">
            {TAPE.levelOver}
          </p>
        ) : (
          <div className="es-front-tape__preview">
            {onFill ? (
              <button type="button" className="es-front-tape__fill" onClick={onFill} aria-label={`${TAPE.fill}: ${hungCount} ${TAPE.of} ${view.slots} ${TAPE.hung}`}>
                {stations}
              </button>
            ) : (
              <span className="es-front-tape__stations">{stations}</span>
            )}
            <span className="es-front-tape__ticks">{nextClock === null ? (hungCount === 0 ? TAPE.nothingHung : TAPE.notYet) : ticks(nextClock)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The 2D drawing                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The 2D drawing of the pass: the poster, and then the 2D view of the run, written by the same pure layout (poster.ts). The server
 * cannot know the screen, so it draws both orientations and front.css shows the one that fits; the browser draws its own.
 */
function PassDrawing({ view, both }: { view: LoopView; both: boolean }) {
  const orientation = useOrientation()
  const shown: readonly Orientation[] = both ? ORIENTATIONS : [orientation]
  return (
    <div className="es-front-drawing" data-front-poster="">
      {shown.map((which) => (
        <Frame key={which} view={view} orientation={which} />
      ))}
    </div>
  )
}

function Frame({ view, orientation }: { view: LoopView; orientation: Orientation }) {
  const svg = useMemo(() => svgToReact(passDrawing(view, orientation)), [view, orientation])
  return (
    <div className="es-front-drawing__frame" data-orientation={orientation}>
      {svg}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Dragging a ticket onto the pass                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Ghost {
  readonly req: number
  readonly label: string
  readonly x: number
  readonly y: number
}

/** How far a pointer moves before a press on a ticket becomes a drag, in CSS px [estimated]. */
const DRAG_FROM_PX = 6

/**
 * The signature interaction's drag (the surface brief's FORM): press a waiting ticket on the printer's strip, carry it onto the pass,
 * and let go to hang it, on the clip nearest the pointer when that clip is free. A tap hangs it too, and so does its key; no action
 * needs a drag (A§6.8), so a touch is always a tap and only a mouse or a pen drags. A drag that ends anywhere else puts the ticket back.
 */
function useTicketDrag({
  strip,
  stage,
  view,
  dispatch,
  announce,
  flat,
}: {
  strip: RefObject<HTMLDivElement | null>
  stage: RefObject<HTMLDivElement | null>
  view: LoopView
  dispatch: (action: LoopAction) => void
  announce: (message: string) => void
  /** The pass shows the 2D drawing, not the 3D scene. */
  flat: boolean
}) {
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const swallowClick = useRef(false)
  const latest = useRef({ view, dispatch, announce, flat })
  useEffect(() => {
    latest.current = { view, dispatch, announce, flat }
  })

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false
    if (event.pointerType === 'touch' || event.button !== 0) return
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-loop-controls] ul button')
    if (button === null || button.disabled || !latest.current.view.canHang) return
    const buttons = Array.from(strip.current?.querySelectorAll<HTMLButtonElement>('[data-loop-controls] ul button') ?? [])
    const req = latest.current.view.waiting[buttons.indexOf(button)]
    if (req === undefined) return
    const label = button.querySelector('.es-ticket__head')?.textContent?.trim() ?? ''
    const from = { x: event.clientX, y: event.clientY }
    let dragging = false

    const move = (e: globalThis.PointerEvent) => {
      if (!dragging && Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_FROM_PX) return
      if (!dragging) latest.current.announce(DECK.dropHere)
      dragging = true
      setGhost({ req, label, x: e.clientX, y: e.clientY })
    }
    const up = (e: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      setGhost(null)
      if (!dragging) return
      swallowClick.current = true
      const box = stage.current?.getBoundingClientRect()
      const inside = box !== undefined && e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom
      if (!inside) return
      const { view: now } = latest.current
      if (!now.canHang || !now.waiting.includes(req)) return
      const slot = nearestFreeClip(stage.current, now, e.clientX, latest.current.flat)
      latest.current.dispatch(slot === null ? { t: 'admit', req } : { t: 'admit', req, slot })
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      setGhost(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  // A drag that ends back on its own ticket would click it: the drag already decided, so the click is swallowed.
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return { ghost, stripProps: { onPointerDown, onClickCapture } }
}

/**
 * The free clip nearest the pointer, across the pass. In the 2D drawing the rail's clips are its marks. In the 3D scene they are where
 * the front page's shot puts them (anchors.ts), measured on the scene's own canvas, whose middle is the camera's. Null when neither
 * can be measured, and the ticket then takes the first free clip.
 */
function nearestFreeClip(stage: HTMLElement | null, view: LoopView, x: number, flat: boolean): number | null {
  const free = view.rail.flatMap((clip, slot) => (clip.req === null ? [slot] : []))
  if (free.length === 0 || stage === null) return null
  let centres: number[] = []
  if (flat) {
    // The drawing's clips are a layer of their own, one mark for each clip, in order.
    const grips = Array.from(stage.querySelectorAll<SVGRectElement>('[data-part="clips"] rect'))
    centres = grips.map((rect) => {
      const box = rect.getBoundingClientRect()
      return box.left + box.width / 2
    })
  } else {
    const canvas = stage.querySelector('canvas')
    const box = (canvas ?? stage).getBoundingClientRect()
    if (box.width >= PORTRAIT_WIDTH) centres = PASS_ANCHORS.clips.map((c) => box.left + box.width / 2 + (c * box.height) / 2)
  }
  if (centres.length !== view.rail.length || centres.every((centre) => centre === 0)) return null
  return free.reduce((best, slot) => (Math.abs(centres[slot] - x) < Math.abs(centres[best] - x) ? slot : best), free[0])
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Below the pass                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The order: PRODUCT.md's four outcomes, printed as the lines of one long ticket (never a row of cards). */
function Order() {
  const id = useId()
  return (
    <section aria-labelledby={id} className="es-front-order-section">
      <span className="es-front-section-rail" aria-hidden="true" />
      <span className="es-front-section-grip" aria-hidden="true" />
      <Ticket as="div" className="es-front-dishes" width="full" titleAs="h2" title={<span id={id}>{ORDER.title}</span>} foot={ORDER.foot}>
        <p className="es-front-lede">{ORDER.lede}</p>
        <ol className="es-front-dishes__list">
          {ORDER.dishes.map((dish) => (
            <li key={dish.outcome} className="es-front-dish">
              <span className="es-front-dish__modules">
                <span className="sr-only">{ORDER.modulesLabel}: </span>
                {dish.modules.join(' · ')}
              </span>
              <span className="es-front-dish__outcome">{dish.outcome}</span>
              <span className="es-front-dish__games">
                <span className="es-front-dish__label">{ORDER.gamesLabel}</span> {dish.games.join(' · ')}
              </span>
            </li>
          ))}
        </ol>
      </Ticket>
    </section>
  )
}

/**
 * The menu: the course map's teaser, on a sheet of the pass's steel, with every module and its hours (A§6.11, "the map teaser"). A wide
 * screen reads it as a table; a narrow one prints each module as a block of its own (front.css), so no course name is squeezed into
 * a column, and the table keeps its roles either way.
 */
function Menu({ index }: { index: ContentIndex | null }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="es-front-menu">
      <div className="es-front-menu__board">
        <h2 id={id} className="es-front-menu__title">
          {MENU.title}
          <span className="es-front-menu__term">{MENU.term}</span>
        </h2>
        <p className="es-front-lede">{MENU.lede}</p>
        {index === null ? (
          <p>{MENU.unavailable}</p>
        ) : (
          <table className="es-front-menu__table" role="table">
            <caption className="sr-only">
              {MENU.title}: {MENU.term}
            </caption>
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  {MENU.columns.module}
                </th>
                <th scope="col" role="columnheader">
                  {MENU.columns.course}
                </th>
                <th scope="col" role="columnheader">
                  {MENU.columns.lanes}
                </th>
                <th scope="col" className="es-front-menu__hours-head" role="columnheader">
                  {MENU.hours}
                  <span className="es-front-menu__tag">{MENU.estimated}</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {index.modules.map((module) => (
                <tr key={module.id} role="row">
                  <th scope="row" className="es-front-menu__id" role="rowheader">
                    {menuId(module.id)}
                  </th>
                  <td className="es-front-menu__course" role="cell">
                    <TextLink to={module.route}>{module.title}</TextLink>
                  </td>
                  <td className="es-front-menu__lanes" role="cell" data-label={MENU.columns.lanes}>
                    {lanesOf(module).join(' · ')}
                  </td>
                  <td className="es-front-menu__hours" role="cell" data-label={`${MENU.hours}, ${MENU.estimated}`}>
                    {formatReadout(module.hours, decimalsOf(module.hours))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot role="rowgroup">
              <tr role="row">
                <th scope="row" colSpan={3} role="rowheader">
                  {MENU.total}
                </th>
                <td className="es-front-menu__hours" role="cell">
                  <Readout value={index.totalHours} digits={decimalsOf(index.totalHours)} tag="derived" size="sm" />
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        <MenuLink className="es-front-menu__link" />
      </div>
    </section>
  )
}

/** The close: the next ticket out of the printer, TR1, with "Start TR1" on its stub. */
function NextTicket({ index }: { index: ContentIndex | null }) {
  const id = useId()
  const tr1 = index?.modules.find((module) => module.id === 'tr1') ?? null
  const body: ReactNode = (
    <>
      <p>{NEXT.body}</p>
      {tr1 === null ? null : (
        <TicketLine note={<Readout value={tr1.hours} digits={decimalsOf(tr1.hours)} tag="estimated" size="sm" />}>
          {NEXT.hours} · {lanesOf(tr1).join(' · ')}
        </TicketLine>
      )}
    </>
  )
  return (
    <section aria-labelledby={id} className="es-front-next">
      <span className="es-front-section-rail" aria-hidden="true" />
      <span className="es-front-section-grip" aria-hidden="true" />
      <Ticket
        as="div"
        className="es-front-next__ticket"
        width="wide"
        titleAs="h2"
        title={<span id={id}>{tr1?.title ?? NEXT.title}</span>}
        foot={[NEXT.foot, menuId('tr1')]}
        stub={<Stub to="/m/tr1">{NEXT.start}</Stub>}
      >
        {body}
      </Ticket>
      {tr1?.status === 'planned' ? <p className="es-front-next__planned">{NEXT.planned}</p> : null}
    </section>
  )
}
