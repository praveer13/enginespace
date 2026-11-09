import { useCallback, useEffect, useRef, useState } from 'react'
import { LedgerFiles } from '@/evidence/LedgerFiles'
import { ResetPanel } from '@/evidence/ResetPanel'
import { StorageTape } from '@/evidence/StorageTape'
import { useEvidence } from '@/evidence/useEvidence'
import { useDeviceTier } from '@/scene/tiers'
import { decodeSettings, sameSettings, SETTING_KEYS, settingValue } from '@/settings/model'
import type { SettingName, Settings } from '@/settings/model'
import { SettingsView } from '@/settings/SettingsView'
import { settingsStore } from '@/settings/store'
import { useSettings, useSystemReducedMotion } from '@/settings/useSettings'
import './panels.css'

/*
 * /settings (ARCHITECTURE §3.1): 3D on or off, the quality cap, reduced motion, game keys, and this device's data. The record of
 * every setting is the ledger's `working` store (A§7.1), one key each, and the store of this tab (src/settings/store.ts) is what
 * the Stage, the game shell and the document read. A change goes to the record first, and the store follows once the record is
 * kept, so the two never part: a change the ledger refuses (a tab that has gone read-only) is shown at its control and applied
 * nowhere. The other way round, once the ledger has opened the record is the truth, and the store takes what it says.
 */

export function Component() {
  const settings = useSettings()
  const evidence = useEvidence()
  const systemReduces = useSystemReducedMotion()
  const device = useDeviceTier()
  const [problem, setProblem] = useState<{ setting: SettingName; detail: string } | null>(null)

  // `working` is the record. When it changes (and the first time it can be read), the store follows it. A memory-backed ledger is
  // not a record that survives, and a read-only one reads nothing, so in both the copy in localStorage stands. The ledger shows a
  // record to the page as soon as it is asked to keep it, before it is kept, so a change that this tab is still saving is left to
  // `change` below, which brings the store along only once the record is kept: the copy that the front page reads is never ahead of
  // what a reload would find.
  const record = useRef<Settings | null>(null)
  const saving = useRef(0)
  // Counts the changes that have finished saving, so the effect below looks at the record again once they have.
  const [finished, setFinished] = useState(0)
  useEffect(() => {
    if (!evidence.ready || evidence.readOnly || evidence.backend !== 'idb' || saving.current > 0) return
    const next = decodeSettings((key) => evidence.working.get(key)?.value)
    if (record.current !== null && sameSettings(record.current, next)) return
    record.current = next
    settingsStore.adopt(next)
  }, [evidence.ready, evidence.readOnly, evidence.backend, evidence.working, finished])

  const { setWorking } = evidence
  const change = useCallback(
    async (patch: Partial<Settings>) => {
      setProblem(null)
      saving.current += 1
      try {
        for (const name of Object.keys(patch) as SettingName[]) {
          let saved
          try {
            saved = await setWorking(SETTING_KEYS[name], settingValue({ ...settingsStore.get(), ...patch }, name))
          } catch {
            saved = { ok: false as const, detail: 'the browser would not open its storage.' }
          }
          if (!saved.ok) {
            setProblem({ setting: name, detail: saved.detail })
            return
          }
        }
        settingsStore.set(patch)
      } finally {
        saving.current -= 1
        setFinished((count) => count + 1)
      }
    },
    [setWorking],
  )

  return (
    <SettingsView
      settings={settings}
      device={device}
      systemReduces={systemReduces}
      onChange={(patch) => void change(patch)}
      problem={problem}
      data={
        <section aria-labelledby="set-data" className="es-panel">
          <h2 id="set-data" className="es-panel__title">
            This device
          </h2>
          <p className="es-panel__lead">
            Your evidence and these settings are kept in this browser and nowhere else. Clearing this site&apos;s data erases them, so keep a copy.
          </p>
          <StorageTape ledger={evidence} />
          <LedgerFiles api={evidence} checkpoints={evidence.checkpoints} />
          <div className="es-deck">
            <ResetPanel
              api={evidence}
              holds={{ events: evidence.events.length, receipts: evidence.receipts.length, checkpoints: evidence.checkpoints.length }}
              onErased={() => settingsStore.reset()}
            />
          </div>
        </section>
      }
    />
  )
}
