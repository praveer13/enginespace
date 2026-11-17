import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { drawInBand, levelOf } from '@es/play'
import type { GameMode } from '@es/play'
import { VERIFIER_COPY } from '@es/play/verifier/copy'
import { VERIFIER } from '@es/play/verifier/entry'
import { verifierSession } from '@es/play/verifier/session'
import type { VerifierLevelId } from '@es/play/verifier/types'
import { ROSTER } from '@es/play/roster'
import type { Seed } from '@es/sim/core'
import { Button } from '@/design/components/Button'
import { LevelMenu } from '@/design/components/LevelMenu'
import { Frame } from '@/games/kit/Frame'
import type { GameView } from '@/games/kit/ViewSwitch'
import type { GameProps } from '@/games/registry'
import { CameraButtons } from '@/scene/CameraButtons'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { partRows, verifierKit } from './kit'
import { Mirror } from './Mirror'
import { ReadoutStrip } from './ReadoutStrip'
import { showDraws, showMeter, showScaffold } from './rules'
import type { Scene3DProps } from './Scene3D'
import { DEFAULT_PRESET, TASTING_SHOTS } from './scene-shots'
import type { VerifierRun } from './types'
import { View2D, VerifierLegend } from './View2D'
import './verifier.css'

// The result loads when a run ends, not before.
const Debrief = lazy(() => import('./Debrief').then((module) => ({ default: module.Debrief })))
// The 3D scene is its own chunk over three's (A§6.10). The Stage loads only when the learner switches to 3D, since the diagram is the
// default view.
const Scene3D = lazy(() => import('./Scene3D'))
const VerifierStage = lazy(() => import('./Stage3D'))

/** The scene as the Stage mounts it, inside the Stage's canvas box. */
function SamplerScene(props: Scene3DProps) {
  return <Scene3D {...props} />
}

/*
 * The rejection sampler (`verifier`, D-063): the learner is the verifier. The page is the instrument frame (src/games/kit/Frame.tsx) around
 * the sampler's diagram, its dock, its readout and its table (D-018: one session, drawn by every view). The frame owns the run and its
 * action log; this file wires the sampler's parts into it, and the keys that are its own: `D` draws a batch of rounds, `.` draws one, and
 * Enter submits the answer.
 *
 * A level opens in practice on its pinned seed. A level that can be graded also opens a graded run on a seed drawn when it starts, in
 * band (GAMES.md §2.1), with no undo and no live meter. Whether a page records the run is its own business: the game's page and a lesson's
 * block each pass the recorder as `onFinish` (src/games/kit/record.ts). Inside a lesson the block names the level, so the level menu and
 * the next level are left out, and the way into a graded run and back stays.
 *
 * The diagram is the default view (REDESIGN §2.9). The 3D view is one switch away, unchanged: a Stage that paints the diagram first and
 * keeps it as the fallback (A§6.7). The session lives in the frame, above both, so a swap keeps every weight and every round. The
 * camera's preset lives here too: `C` and the preset buttons move it, in 3D only.
 */

const ROLE = ROSTER.find((entry) => entry.id === VERIFIER.id)?.role ?? ''

interface Attempt {
  readonly level: string
  readonly mode: GameMode
  readonly seed: Seed
}

const known = (id: string | undefined): string => VERIFIER.levels.find((entry) => entry.id === id)?.id ?? VERIFIER.levels[0].id
const fresh = (): Seed => crypto.getRandomValues(new Uint32Array(1))[0]
const practice = (id: string): Attempt => ({ level: id, mode: 'practice', seed: levelOf(VERIFIER, id)?.practiceSeed ?? 0 })
/** A graded run: a seed drawn at the start, in band, and stamped unseen by whoever records it (ARCHITECTURE §8.2). */
const graded = (id: string): Attempt => ({ level: id, mode: 'graded', seed: drawInBand(verifierSession, id, fresh()) })

const startOf = (id: string, mode: GameMode | undefined): Attempt => (mode === 'graded' && levelOf(VERIFIER, id)?.graded ? graded(id) : practice(id))

/** What the frame's key commands do in this game. Returns whether the key was taken. */
function command(name: string, run: VerifierRun): boolean {
  const { view, dispatch } = run
  if (name === 'step' || name === 'draw') {
    if (!showDraws(run)) return false
    dispatch({ t: 'draw', n: Math.min(name === 'step' ? 1 : 20, view.drawsLeft) })
    return true
  }
  if (name === 'submit') {
    const kind = view.ask?.kind
    const ready =
      kind === 'finish' ||
      (kind === 'recipe' && view.weightTotal > 0) ||
      (kind === 'choose-gamma' && (view.gamma?.pick ?? 0) >= 1) ||
      (kind === 'audit' && (view.cards ?? []).every((card) => card.label !== null))
    if (!ready) return false
    dispatch({ t: 'submit' })
    return true
  }
  return false
}

export default function Game({ level, mode, placement = 'page', rev, onFinish }: GameProps) {
  const [asked, setAsked] = useState({ level, mode })
  const [attempt, setAttempt] = useState<Attempt>(() => startOf(known(level), mode))
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked.level || mode !== asked.mode) {
    setAsked({ level, mode })
    setAttempt(startOf(known(level), mode))
  }
  // Moving to another level replaces the page's content, and the control that was pressed may go with it: focus goes back to the game, this
  // game's own, found from its box, since a lesson can hold two of it.
  const host = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    host.current?.querySelector<HTMLElement>('[data-game]')?.focus({ preventScroll: true })
  }, [attempt])
  const go = (next: Attempt) => {
    moved.current = true
    setAttempt(next)
  }

  // The diagram is the default view; the learner's own choice wins from then on. 3D is offered where the device draws it.
  const device = useDeviceTier()
  const draws3d = device.known && device.tier >= 1
  const [view, setView] = useState<GameView>('2d')
  const [preset, setPreset] = useState<string>(DEFAULT_PRESET)

  const embedded = placement === 'embed'
  const entry = levelOf(VERIFIER, attempt.level) ?? VERIFIER.levels[0]
  const levelId = entry.id as VerifierLevelId
  const at = VERIFIER.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = embedded ? null : (VERIFIER.levels[at + 1] ?? null)
  const isGraded = attempt.mode === 'graded' && entry.graded
  const copy = VERIFIER_COPY[levelId]
  const kit = useCallback(() => verifierKit(levelId), [levelId])

  const menu = embedded ? undefined : (
    <LevelMenu
      label="Level"
      value={entry.id}
      levels={VERIFIER.levels.map((candidate) => ({ id: candidate.id, title: candidate.title, mode: candidate.id === entry.id ? (isGraded ? 'graded' : 'practice') : candidate.graded ? 'graded' : 'practice' }))}
      onChange={(id) => go(practice(id))}
    />
  )

  // Practice or a graded run, for a level that can be graded; a level that cannot says what practice is.
  const modeSwitch = (
    <>
      <span className="es-vf__mode" data-vf-mode={isGraded ? 'graded' : 'practice'}>
        {isGraded
          ? 'Graded: fresh numbers, no undo, no live distance, one submission.'
          : entry.graded
            ? 'Practice: fixed numbers, undo, and the live distance from p.'
            : 'Practice: fixed numbers and undo.'}
      </span>
      {entry.graded ? (
        <Button size="sm" variant="plate" onClick={() => go(isGraded ? practice(entry.id) : graded(entry.id))}>
          {isGraded ? 'Back to practice' : 'Start a graded run'}
        </Button>
      ) : null}
    </>
  )

  return (
    <div ref={host} className="flex flex-col gap-6">
      <Frame
        game={VERIFIER}
        role={ROLE}
        session={verifierSession}
        level={entry.id}
        levelTitle={entry.title}
        seed={attempt.seed}
        mode={attempt.mode}
        rev={rev}
        embedded={embedded}
        onFinish={onFinish}
        ledger={onFinish !== undefined}
        kit={kit}
        menu={menu}
        modeSwitch={modeSwitch}
        allow3d={draws3d}
        unavailable3d={device.known && !draws3d ? unavailableReason(device.reason) : undefined}
        view={view}
        onViewChange={setView}
        onCommand={(name, run) => {
          if (name !== 'camera') return command(name, run)
          if (view !== '3d') return false
          const next = TASTING_SHOTS[(TASTING_SHOTS.findIndex((shot) => shot.id === preset) + 1) % TASTING_SHOTS.length]
          setPreset(next.id)
          run.announce(`Camera: ${next.label}.`)
          return true
        }}
        goal={(run) => ({
          aim: copy.goal.aim,
          control: copy.goal.controls,
          target: copy.goal.beat,
          ends: copy.goal.ends,
          met: run.done ? 'Your answer is in.' : undefined,
        })}
        diagram={(run) => <View2D run={run} />}
        // Depth is one row per draft position: on a level with one draft position it carries nothing, so the 3D view is offered on the
        // chain only, and not on a phone, where the rows would not read.
        phone3d={false}
        level3d={entry.id === 'chain'}
        scene3d={(run) => (
          <Suspense fallback={<View2D run={run} />}>
            <VerifierStage
              run={run}
              preset={preset}
              shots={TASTING_SHOTS}
              scaffold={showScaffold(run)}
              outcome={showMeter(run)}
              diagram={<View2D run={run} part="drawing" />}
              scene={SamplerScene}
            />
          </Suspense>
        )}
        legend={(run) =>
          view === '3d' && entry.id === 'chain' ? (
            <div className="es-vf__cameras">
              <CameraButtons presets={TASTING_SHOTS} value={preset} onChange={setPreset} label="Camera on the sampler" />
              <VerifierLegend run={run} scene />
            </div>
          ) : (
            <VerifierLegend run={run} />
          )
        }
        dock={(run) => <Controls run={run} />}
        readout={(run) => <ReadoutStrip view={run.view} meter={showMeter(run)} />}
        result={(run, outcome) => (
          <Suspense fallback={<p role="status">Reading the run…</p>}>
            <Debrief
              run={run}
              outcome={outcome}
              next={after === null ? null : { id: after.id, title: after.title }}
              onNext={() => after !== null && go(practice(after.id))}
              onGraded={entry.graded && !isGraded ? () => go(graded(entry.id)) : null}
              embedded={embedded}
            />
          </Suspense>
        )}
        mirror={(run) => <Mirror run={run} />}
        parts={partRows(levelId)}
        howTo={<HowTo levelId={levelId} />}
        titleBlock={{ model: 'Model of a rejection sampler, after vLLM v0.33.0', clock: 'Clock: rounds, synthetic', leavesOut: <WorldCard /> }}
      />
    </div>
  )
}

/** How to play: the level's own opening line, then the round of one decision. */
function HowTo({ levelId }: { levelId: VerifierLevelId }) {
  return (
    <div className="flex flex-col gap-3" data-vf-howto="">
      <p data-verifier-prompt="">{VERIFIER_COPY[levelId].prompt}</p>
      <ol className="list-decimal pl-5">
        <li>Read the goal line: it says what to beat and when the level ends.</li>
        <li>Each token has two bars: the draft&apos;s q and the target&apos;s p. Where the level allows it, the bars are cut into the accepted part and the residual.</li>
        <li>Make the level&apos;s decision in the dock. A prediction comes first where the level asks one, and it cannot be skipped.</li>
        <li>Draw rounds to watch the rule at work: each draft token is a dot, accepted below the accepted part and rejected above it.</li>
        <li>At the end, the dock shows your result beside the reference&apos;s.</li>
      </ol>
    </div>
  )
}
