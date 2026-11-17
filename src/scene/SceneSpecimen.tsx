import { lazy, useCallback, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { Button } from '@/design/components/Button'
import { ReadoutStrip } from '@/design/components/ReadoutStrip'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Sheet } from '@/design/components/Sheet'
import { Toggle } from '@/design/components/Toggle'
import { nextPreset } from './camera-rig'
import { CameraButtons } from './CameraButtons'
import { SelectionList } from './SelectionList'
import { useSelection } from './selection'
import { initialFired, LONG_NIGHT_FIRES, SPECIMEN_PRESETS, specimenLayout, specimenRun, type SpecimenClips, type SpecimenSettings } from './specimen-layout'
import { SpecimenView2D } from './SpecimenView2D'
import { Stage } from './Stage'
import type { FrameStats } from './stage-runtime'
import type { Tier } from './tiers'
import './specimen.css'

/*
 * The scene kit on /design (TRACKER W0-T15): one pass drawn by every part of the kit, beside its 2D twin, with the
 * controls that move it. The specimen's session (the load, overlap, the fires shown, the camera, the selection) lives here,
 * outside both views, so a swap to 2D, a lost context or a restore keeps all of it.
 *
 *   - The step button runs the next step; the track slides back and the new step extrudes out of the present (cut under reduced
 *     motion). `.` runs it, `C` cycles the camera.
 *   - Overlap (async scheduling) re-runs the model: the idle stretches close and ghost tokens appear.
 *   - 64 slots is the long run: more than 10,000 instances, still a handful of draw calls.
 *   - The kit's own tape prints what this browser measures of the frame: the tier, the pixel ratio, draw calls,
 *     instances and, while something animates, the frame-time p95 the governor holds.
 */

const SpecimenScene3D = lazy(() => import('./SpecimenScene3D'))

interface StatsStore {
  get(): FrameStats | null
  set(stats: FrameStats | null): void
  subscribe(listener: () => void): () => void
}

/** A tiny store for the frame counts, so a new count re-renders the kit's tape alone, not the scene. */
function createStatsStore(): StatsStore {
  let value: FrameStats | null = null
  const listeners = new Set<() => void>()
  const same = (a: FrameStats | null, b: FrameStats | null) =>
    a === b ||
    (a !== null &&
      b !== null &&
      a.sceneCalls === b.sceneCalls &&
      a.calls === b.calls &&
      a.instances === b.instances &&
      a.dpr === b.dpr &&
      a.p95 === b.p95 &&
      a.passes.join() === b.passes.join())
  return {
    get: () => value,
    set(next) {
      if (same(next, value)) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function KitTape({ store, tier }: { store: StatsStore; tier: Tier | null }) {
  const stats = useSyncExternalStore(store.subscribe, store.get, () => null)
  const live = 'this frame'
  const lines = [
    { id: 'tier', label: 'tier', value: <span className="es-kit__word">{tier === null ? 'deciding' : `T${tier}`}</span> },
    ...(stats
      ? [
          { id: 'dpr', label: 'pixel ratio', value: <Readout value={stats.dpr} digits={2} unit="x" tag="measured" source={live} size="sm" /> },
          { id: 'calls', label: 'draws · scene', value: <Readout value={stats.sceneCalls} tag="measured" source={live} size="sm" /> },
          { id: 'frame', label: 'draws · frame', value: <Readout value={stats.calls} tag="measured" source={live} size="sm" /> },
          { id: 'instances', label: 'instances', value: <Readout value={stats.instances} tag="measured" source={live} size="sm" /> },
          { id: 'passes', label: 'passes', value: <span className="es-kit__word">{stats.passes.join(' · ')}</span> },
          {
            id: 'p95',
            label: 'frame p95',
            value: stats.p95 === null ? <span className="es-kit__word">still</span> : <Readout value={stats.p95} digits={1} unit="ms" tag="measured" source={live} size="sm" />,
          },
        ]
      : []),
  ]
  return <ReadoutStrip label="The kit's tape: what this browser measures of the frame" lines={lines} empty="No 3D frame yet" className="es-kit__tape" />
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export function SceneSpecimen() {
  const [settings, setSettings] = useState<SpecimenSettings>({ clips: 4, overlap: false })
  const run = useMemo(() => specimenRun(settings), [settings])
  const settingsKey = `${settings.clips}|${settings.overlap}`
  const [firedState, setFired] = useState<{ key: string; fired: number } | null>(null)
  const fired = firedState?.key === settingsKey ? firedState.fired : initialFired(settings.clips, run)
  const layout = useMemo(() => specimenLayout(run, settings, fired), [run, settings, fired])
  const fireIds = useMemo(() => layout.fires.map((fire) => fire.id), [layout.fires])
  const selection = useSelection(fireIds)
  const [preset, setPreset] = useState(SPECIMEN_PRESETS[0].id)
  const [orbit, setOrbit] = useState(false)
  const [tier, setTier] = useState<Tier | null>(null)
  const [stats] = useState(createStatsStore)
  const stage = useRef<HTMLDivElement>(null)

  const last = settings.clips === 64 ? Math.min(LONG_NIGHT_FIRES, run.steps.length) : run.steps.length
  const ring = useCallback(() => {
    setFired({ key: settingsKey, fired: fired >= last ? initialFired(settings.clips, run) : fired + 1 })
  }, [settingsKey, fired, last, settings.clips, run])

  const { select } = selection
  const onPick = useCallback((id: string) => select(id, { focus: true }), [select])
  const sceneProps = useMemo(() => ({ layout, preset, orbit, selected: selection.selected, onPick }), [layout, preset, orbit, selection.selected, onPick])

  const dropContext = () => {
    const canvas = stage.current?.querySelector('canvas')
    canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
    if (event.code === 'KeyC') {
      event.preventDefault()
      setPreset((current) => nextPreset(SPECIMEN_PRESETS, current))
    } else if (event.code === 'Period' && settings.clips === 4) {
      event.preventDefault()
      ring()
    }
  }

  const latest = layout.fires.at(-1)
  const synthetic = 'synthetic' as const
  const printer = [
    { id: 'fire', label: 'step', value: <Readout value={fired} pad={3} tag={synthetic} size="sm" /> },
    { id: 'clock', label: 'clock', value: <Readout value={layout.totals.clock} unit="ticks" tag={synthetic} size="sm" /> },
    { id: 'step', label: 'this step', value: <Readout value={latest?.ticks ?? 0} unit="ticks" tag={synthetic} size="sm" /> },
    { id: 'busy', label: 'GPU busy', value: <Readout value={layout.totals.busy} unit="ticks" tag={synthetic} size="sm" /> },
    { id: 'dark', label: 'GPU idle', value: <Readout value={layout.totals.dark} unit="ticks" tag={synthetic} size="sm" />, tone: layout.totals.dark > 0 ? ('ink-2' as const) : undefined },
    { id: 'binned', label: 'ghost tokens', value: <Readout value={layout.totals.binned} unit="tokens" tag={synthetic} size="sm" /> },
  ]

  const fireItems = layout.fires.map((fire) => ({
    id: fire.id,
    label: (
      <span className="es-kit__fire">
        <span className="es-kit__fire-name">step {String(fire.index + 1).padStart(3, '0')}</span>
        <span className="es-kit__fire-facts">
          {fire.ticks} ticks · {fire.plates} tokens{fire.binned > 0 ? ` · ${fire.binned} ghost` : ''}
          {fire.empty > 0 ? ` · ${fire.empty} empty` : ''}
          {fire.dark > 0 ? ` · idle ${fire.dark} before` : ''}
        </span>
      </span>
    ),
  }))

  return (
    <div className="es-kit" onKeyDown={onKeyDown}>
      <div className="es-kit__views">
        <figure className="es-kit__view" data-view="3d" ref={stage}>
          <Stage
            id="specimen"
            className="es-kit__stage"
            view2d={<SpecimenView2D layout={layout} selected={selection.selected} onPick={onPick} />}
            scene={SpecimenScene3D}
            sceneProps={sceneProps}
            onStats={stats.set}
            onTier={setTier}
            onFallback={() => stats.set(null)}
          />
          <figcaption className="es-kit__caption">
            <TapeLabel size="sm" tilt="none">
              3D · the lanes
            </TapeLabel>
            <span>Drawn by the kit from the model&apos;s run; every tick is synthetic. The legend on the right holds a place&apos;s four forms: token, empty, ghost and padding.</span>
          </figcaption>
        </figure>
        <figure className="es-kit__view" data-view="2d">
          <div className="es-kit__twin">
            <SpecimenView2D layout={layout} selected={selection.selected} onPick={onPick} />
          </div>
          <figcaption className="es-kit__caption">
            <TapeLabel size="sm" tilt="none">
              2D twin
            </TapeLabel>
            <span>The same layout as a timeline: the first paint, and the view when 3D cannot run.</span>
          </figcaption>
        </figure>
      </div>

      <div className="es-kit__deck" role="group" aria-label="The specimen's controls">
        <Button size="sm" variant="ink" onClick={ring} disabled={settings.clips === 64} className="es-kit__bell">
          {fired >= last ? 'Run again from step 1' : 'Run the next step'}
        </Button>
        <Toggle
          label="Plan the next step during this one"
          hint="overlap (async scheduling)"
          checked={settings.overlap}
          onCheckedChange={(overlap) => setSettings((current) => ({ ...current, overlap }))}
        />
        <div role="group" aria-label="The batch" className="es-kit__clips">
          {([4, 64] as const satisfies readonly SpecimenClips[]).map((clips) => (
            <Button
              key={clips}
              size="sm"
              variant={settings.clips === clips ? 'ink' : 'plate'}
              aria-pressed={settings.clips === clips}
              onClick={() => setSettings((current) => ({ ...current, clips }))}
            >
              {clips === 4 ? '4 slots · a short run' : '64 slots · the long run'}
            </Button>
          ))}
        </div>
        <CameraButtons presets={SPECIMEN_PRESETS} value={preset} onChange={setPreset} />
        <Toggle label="Drag to orbit" hint="optional: every view has its button" checked={orbit} onCheckedChange={setOrbit} />
        <Button size="sm" variant="quiet" onClick={dropContext}>
          Drop the 3D context
        </Button>
      </div>

      <div className="es-kit__readouts">
        <ReadoutStrip label="The run so far" lines={printer} className="es-kit__tape" />
        <KitTape store={stats} tier={tier} />
        <section className="es-kit__fires" aria-labelledby="es-kit-fires">
          <h3 id="es-kit-fires" className="es-kit__fires-title">
            Steps on the GPU
          </h3>
          <p className="es-kit__fires-note">Ticks, synthetic. Pick a step here, in 3D or in the 2D twin: one selection drives all three.</p>
          <SelectionList label="Steps on the GPU" items={fireItems} selection={selection} className="es-kit__list" />
        </section>
      </div>

      <Sheet head="THE KIT" meta="SRC/SCENE" title="What drew this" width="full" className="es-kit__parts">
        <dl className="es-kit__part-list">
          {PARTS.map(([name, what]) => (
            <div key={name} className="es-kit__part">
              <dt>{name}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </div>
  )
}

const PARTS: ReadonlyArray<readonly [string, string]> = [
  ['Stage', 'The 2D twin paints first. The scene loads behind it and fades in, and any failure brings the 2D back in the same box.'],
  ['Tiers', 'The device decides the pixel ratio, the multisampling and the frame cap. Nothing is fetched to decide.'],
  ['Governor', 'While the scene animates, it holds the frame-time p95 to the tier and moves the tier when it cannot.'],
  ['CameraRig', 'Three shots of the lanes, a button each, and C to cycle them. A move eases out on the settle curve, and cuts under reduced motion.'],
  ['SpanInstances', 'Every step and every CPU call: one draw call.'],
  ['BlockGrid', 'Every place on every step, in its form: token, empty, ghost, padding. One draw call.'],
  ['LabelLayer', 'Every word in the scene is page text, placed over the canvas and moved only when the camera moves.'],
  ['TimeAxis', 'The clock runs into the screen. On each step the run slides back and the new step extrudes out of the present.'],
  ['Selection', 'A pick in the scene and a key in the list are the same selection.'],
]
