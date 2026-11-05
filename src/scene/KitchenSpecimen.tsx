import { lazy, useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { Bell } from '@/design/components/Bell'
import { Button } from '@/design/components/Button'
import { PrinterTape } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket } from '@/design/components/Ticket'
import { SUBJECT_INFO, SUBJECTS, type Subject } from './kitchen-specimen'
import { KitchenDrawing } from './KitchenNote2D'
import { Stage } from './Stage'
import type { FrameStats } from './stage-runtime'
import { useDeviceTier, type Tier } from './tiers'
import './kitchen.css'

/*
 * The kitchen on /design (scene kit v1): each piece of the line's equipment alone and the whole pass assembled, at tier 1 and tier
 * 2, each beside its 2D note. The specimen's session (the piece in view, the bells rung, the tier) lives here, outside both views,
 * so a swap to 2D, a lost context or a restore keeps it.
 *
 *   - The rail of equipment tickets picks the piece. The pass, assembled, is first.
 *   - The bell runs one fire: every piece moves on it, and only on it (cut under reduced motion).
 *   - Tier 1 and tier 2 cap the Stage: tier 1 keeps the props, their baked occlusion and their contact shadows; tier 2 adds the heat
 *     lamps' shadow maps, bloom, the light cones and steam. A device that starts at tier 1 cannot be raised.
 *   - The page holds one live canvas: this Stage opens when it is scrolled to or used, and the kit's own specimen above shows its 2D
 *     twin meanwhile.
 *   - The tape prints what this browser measures of the frame: draw calls, triangles and passes, tagged measured.
 */

const KitchenScene3D = lazy(() => import('./KitchenScene3D'))

interface StatsStore {
  get(): FrameStats | null
  set(stats: FrameStats | null): void
  subscribe(listener: () => void): () => void
}

function createStatsStore(): StatsStore {
  let value: FrameStats | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      if (
        next === value ||
        (next && value && next.sceneCalls === value.sceneCalls && next.calls === value.calls && next.triangles === value.triangles && next.shadows === value.shadows && next.passes.join() === value.passes.join())
      )
        return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The tape: what this browser measures of the kitchen's frame. */
function KitchenTape({ store, tier }: { store: StatsStore; tier: Tier | null }) {
  const stats = useSyncExternalStore(store.subscribe, store.get, () => null)
  const live = 'this frame'
  const lines = [
    { id: 'tier', label: 'tier', value: <span className="es-kitchen__word">{tier === null ? 'deciding' : `T${tier}`}</span> },
    ...(stats
      ? [
          { id: 'scene', label: 'draws · scene', value: <Readout value={stats.sceneCalls} tag="measured" source={live} size="sm" /> },
          { id: 'frame', label: 'draws · frame', value: <Readout value={stats.calls} tag="measured" source={live} size="sm" /> },
          { id: 'triangles', label: 'triangles', value: <Readout value={stats.triangles} tag="measured" source={live} size="sm" /> },
          { id: 'shadows', label: 'shadow maps', value: <Readout value={stats.shadows ?? 0} tag="measured" source={live} size="sm" /> },
          { id: 'passes', label: 'passes', value: <span className="es-kitchen__word">{stats.passes.join(' · ')}</span> },
        ]
      : []),
  ]
  return <PrinterTape label="The kitchen's tape: what this browser measures of the frame" lines={lines} empty="No 3D frame yet" className="es-kitchen__tape" />
}

/** What each tier draws, in the kitchen's words. */
const TIER_NOTES: Readonly<Record<1 | 2, string>> = {
  1: 'Tier 1 keeps every prop, its baked occlusion and its contact shadow, and the lamps’ light: the kitchen, on a phone.',
  2: 'Tier 2 adds the heat lamps’ soft shadow maps, bloom on what glows, the light cones under the lamps, and steam off a lit station.',
}

export function KitchenSpecimen() {
  const [subject, setSubject] = useState<Subject>('assembled')
  const [step, setStep] = useState(0)
  const [cap, setCap] = useState<1 | 2>(2)
  const [liveTier, setLiveTier] = useState<Tier | null>(null)
  const [stats] = useState(createStatsStore)
  const device = useDeviceTier()
  const highest: Tier = device.known ? device.tier : 2
  const info = SUBJECT_INFO[subject]
  const ring = useCallback(() => setStep((current) => current + 1), [])
  const sceneProps = useMemo(() => ({ subject, step }), [subject, step])
  const pick = (next: Subject) => {
    setSubject(next)
    stats.set(null)
  }

  return (
    <div className="es-kitchen">
      <figure className="es-kitchen__view">
        <Stage
          id="kitchen"
          className="es-kitchen__stage"
          view2d={<KitchenDrawing subject={subject} step={step} />}
          scene={KitchenScene3D}
          sceneProps={sceneProps}
          tierCap={cap}
          openInView
          onStats={stats.set}
          onTier={setLiveTier}
          onFallback={() => stats.set(null)}
        />
        <figcaption className="es-kitchen__caption">
          <TapeLabel size="sm" tilt="none">
            3D · {info.name.toLowerCase()}
          </TapeLabel>
          <span>Drawn by src/scene/props in metres; every size is estimated.</span>
        </figcaption>
      </figure>

      <Ticket className="es-kitchen__sheet" head="SPEC SHEET" meta={`T${Math.min(cap, highest)}`} title={info.name} titleAs="h4" width="full">
        <p className="es-kitchen__term">{info.term}</p>
        <figure className="es-kitchen__note">
          <KitchenDrawing subject={subject} step={step} variant="note" />
          <figcaption className="es-kitchen__note-caption">2D note: the same piece, front on</figcaption>
        </figure>
        <p className="es-kitchen__made">{info.made}</p>
        <dl className="es-kitchen__sizes">
          {info.sizes.map((size) => (
            <div key={size.label} className="es-kitchen__size">
              <dt>{size.label}</dt>
              <dd>
                <Readout value={size.mm} unit="mm" tag="estimated" size="sm" />
              </dd>
            </div>
          ))}
        </dl>
        <p className="es-kitchen__bell-note">
          <span className="es-kitchen__on">On the bell:</span> {info.bell}
        </p>
        <p className="es-kitchen__tier-note">{TIER_NOTES[cap]}</p>
      </Ticket>

      <div className="es-kitchen__picker" role="group" aria-label="The kitchen's equipment: pick a piece">
        {SUBJECTS.map((id, index) => (
          <button key={id} type="button" className="es-kitchen__pick" aria-pressed={id === subject} onClick={() => pick(id)}>
            <span className="es-kitchen__pick-no">{String(index + 1).padStart(2, '0')}</span>
            <span className="es-kitchen__pick-name">{SUBJECT_INFO[id].name}</span>
          </button>
        ))}
      </div>

      <div className="es-kitchen__deck" role="group" aria-label="The kitchen's controls">
        <Bell step={step} caption="fire" onRing={ring} ringLabel="Ring the bell: one fire on the kitchen" className="es-kitchen__bell" />
        <div className="es-kitchen__tiers" role="group" aria-label="Tier">
          {([1, 2] as const).map((tier) => (
            <Button key={tier} size="sm" variant={cap === tier ? 'ink' : 'plate'} aria-pressed={cap === tier} disabled={tier > highest} onClick={() => setCap(tier)}>
              {tier === 1 ? 'Tier 1 · a phone' : 'Tier 2 · a laptop'}
            </Button>
          ))}
          {device.known && highest < 2 ? <p className="es-kitchen__tier-why">This device starts at tier {highest}, so tier 2 waits for a larger one.</p> : null}
        </div>
        <KitchenTape store={stats} tier={liveTier} />
      </div>
    </div>
  )
}
