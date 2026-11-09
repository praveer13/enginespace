import type { ReactNode } from 'react'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Toggle } from '@/design/components/Toggle'
import { DEFAULT_CHOICE, startingTier, TIERS, unavailableReason } from '@/scene/tiers'
import type { DeviceTier } from '@/scene/tiers'
import { Choice } from './Choice'
import type { MotionMode, SettingName, Settings, TierCap } from './model'
import { effectiveMotion } from './rules'

/*
 * /settings (ARCHITECTURE §3.1): the learner's choices for this browser, and what they do. Controls stand on the stainless
 * (an equipment switch, a row of plates), and the printer's tape beside them says what the pass will actually do now: a
 * choice and its effect are not always the same thing, since a device that cannot draw 3D stays in 2D whatever the switch
 * says, and "follow my system" means whatever the system says. Every change applies at once, in this tab and in every other
 * tab of this browser (src/settings/store.ts).
 *
 * `SettingsView` is the page once it has what it shows, and takes all of it as props: the settings, what the device is doing,
 * what the system asks of motion, and the panel for this device's data, which belongs to the page because it owns the ledger.
 */

export interface SettingsViewProps {
  settings: Settings
  /** What the 3D view does on this device, given these settings (the Stage decides it the same way). */
  device: DeviceTier
  /** What `prefers-reduced-motion` says, or null where the browser cannot be asked. */
  systemReduces: boolean | null
  onChange: (patch: Partial<Settings>) => void
  /** A change that could not be saved: which setting, and why. It is shown at that setting. */
  problem: { setting: SettingName; detail: string } | null
  /** The panel for this device's data: export, import and reset. */
  data: ReactNode
}

const TIER_OPTIONS: readonly { value: TierCap; label: string; hint: string }[] = [
  { value: 1, label: 'Tier 1 · light', hint: 'The lightest 3D view: a lower frame rate, no anti-aliasing and no glow. Phones and small machines start here.' },
  { value: 2, label: 'Tier 2 · standard', hint: 'Smoother, with anti-aliasing and a soft glow on the heat lamps. Larger machines start here.' },
  { value: 3, label: 'Tier 3 · full', hint: 'The sharpest view. A device reaches it only by running tier 2 smoothly first, so this is no cap at all.' },
]

/** What this device would start at before any cap, in words. */
function deviceSentence(device: DeviceTier): string {
  if (!device.known || device.hints === null) return 'Checking what this device can draw.'
  const natural = startingTier(device.hints, DEFAULT_CHOICE)
  if (natural.tier === 0) return `${unavailableReason(natural.reason) ?? '3D is not available here'}, so the view stays in 2D and there is nothing to cap.`
  return `This device starts at tier ${natural.tier}, and the cap can only lower that.`
}

/** What each way of deciding about motion says, with what the system says now. */
function motionOptions(systemReduces: boolean | null): readonly { value: MotionMode; label: string; hint: string }[] {
  const system = systemReduces === null ? 'This browser does not say what your system asks.' : `Your system asks for ${systemReduces ? 'reduced' : 'full'} motion right now.`
  return [
    { value: 'system', label: 'Follow my system', hint: system },
    { value: 'reduce', label: 'Reduce motion', hint: 'Always reduced, whatever your system asks.' },
    { value: 'full', label: 'Keep motion', hint: 'Always full, whatever your system asks.' },
  ]
}

/** The printer's tape: what the pass will do now, from the choices and from the device. */
export function EffectTape({ settings, device, systemReduces }: Pick<SettingsViewProps, 'settings' | 'device' | 'systemReduces'>) {
  const threeD = device.known && device.tier >= 1
  const motion = effectiveMotion(settings.motion, systemReduces)
  const why = device.known && !threeD ? unavailableReason(device.reason) : undefined
  const lines: PrinterTapeLine[] = [{ id: 'view', label: 'view', value: !device.known ? 'checking' : threeD ? '3D' : '2D' }]
  if (why !== undefined) lines.push({ id: 'why', label: 'because', value: why })
  if (threeD) {
    const limits = TIERS[device.tier]
    lines.push(
      { id: 'tier', label: 'tier', value: `T${device.tier}` },
      { id: 'budget', label: 'frame budget', value: <Readout value={limits.frameBudgetMs} digits={1} unit="ms" tag="estimated" size="sm" /> },
      { id: 'ratio', label: 'pixel ratio, up to', value: <Readout value={limits.dprCap} digits={1} unit="x" tag="estimated" size="sm" /> },
    )
  }
  lines.push(
    { id: 'motion', label: 'motion', value: `${motion.reduced ? 'reduced' : 'full'} · ${motion.source === 'settings' ? 'your choice' : 'your system'}` },
    { id: 'keys', label: 'game keys', value: settings.gameKeys ? 'on' : 'off', tone: settings.gameKeys ? 'ink' : 'ink-2' },
  )
  return <PrinterTape label="What these settings do now" lines={lines} state={device.known ? 'default' : 'loading'} />
}

export function SettingsView({ settings, device, systemReduces, onChange, problem, data }: SettingsViewProps) {
  const problemAt = (setting: SettingName) => (problem?.setting === setting ? `Not saved: ${problem.detail}` : undefined)
  return (
    <div className="es-page" data-page="settings">
      <header className="es-page__header">
        <h1 className="es-page__title">Settings</h1>
        <p className="es-page__lead">
          Choices for this browser. They are kept on this device and sent nowhere, and each one applies at once, in every tab you have open.
        </p>
      </header>
      <div className="es-page__columns">
        <div className="es-page__main">
          <section aria-labelledby="set-view" className="es-panel">
            <h2 id="set-view" className="es-panel__title">
              View
            </h2>
            <p className="es-panel__lead">How the pass is drawn: the 3D scenes of the games.</p>
            <div className="es-deck">
              <Toggle
                label="Draw the games in 3D"
                hint="Off, every game stays in its 2D view, which teaches the same concept."
                checked={settings.view3d}
                onCheckedChange={(view3d) => onChange({ view3d })}
                error={problemAt('view3d')}
              />
              <Choice
                label="Quality cap"
                options={TIER_OPTIONS}
                value={settings.tierCap}
                onChange={(tierCap) => onChange({ tierCap })}
                hint={`The view lowers its tier when it runs slowly and raises it when there is room, never above the cap. ${deviceSentence(device)}`}
                error={problemAt('tierCap')}
                disabled={!settings.view3d}
              />
            </div>
          </section>

          <section aria-labelledby="set-motion" className="es-panel">
            <h2 id="set-motion" className="es-panel__title">
              Motion
            </h2>
            <p className="es-panel__lead">Everything on the pass moves on the bell. Reduced, the cameras cut, time advances in steps, and nothing moves until you press something.</p>
            <div className="es-deck">
              <Choice label="Reduced motion" options={motionOptions(systemReduces)} value={settings.motion} onChange={(motion) => onChange({ motion })} error={problemAt('motion')} />
            </div>
          </section>

          <section aria-labelledby="set-keys" className="es-panel">
            <h2 id="set-keys" className="es-panel__title">
              Keys
            </h2>
            <p className="es-panel__lead">A game&apos;s keys act only while focus is inside the game, and never when the focused control uses the key itself.</p>
            <div className="es-deck">
              <Toggle
                label="Game keys"
                hint="The keys every game answers to, such as Space, C and V, and each game's own. Off, no game key does anything, and every control is still a button."
                checked={settings.gameKeys}
                onCheckedChange={(gameKeys) => onChange({ gameKeys })}
                error={problemAt('gameKeys')}
              />
            </div>
          </section>

          {data}
        </div>
        <aside className="es-page__side" aria-label="What these settings do">
          <EffectTape settings={settings} device={device} systemReduces={systemReduces} />
        </aside>
      </div>
    </div>
  )
}
