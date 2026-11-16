import { createElement, useEffect, useState, type ReactNode } from 'react'
import type { DeviceTier } from '@/scene/tiers'

/*
 * The device's tier for the front page, read from src/scene/tiers.ts once the page has rendered. The first paint is the 2D view on every
 * device (the tier is not known before the browser has been asked, A§6.10), so the tier's code, with the learner's settings that it
 * reads, loads beside the page rather than in its first-paint closure. Until it is in, the device reads as not known, as it does in the
 * first render of every view.
 */
type Tiers = typeof import('@/scene/tiers')

export interface FrontDevice {
  readonly device: DeviceTier
  /** Why there is no 3D view, once the device is known and draws none. */
  readonly unavailable?: string
  /** Renders nothing: it keeps the device's answer current once the tier's code is in. Mount it once. */
  readonly reader: ReactNode
}

const UNKNOWN: DeviceTier = {
  tier: 0,
  reason: 'default',
  known: false,
  hints: null,
}

let tiers: Tiers | null = null

function Reader({ tiers, onChange }: { tiers: Tiers; onChange: (device: DeviceTier) => void }) {
  const device = tiers.useDeviceTier()
  useEffect(() => onChange(device), [device, onChange])
  return null
}

export function useFrontDevice(): FrontDevice {
  const [code, setCode] = useState<Tiers | null>(tiers)
  const [device, setDevice] = useState<DeviceTier>(UNKNOWN)
  useEffect(() => {
    if (code !== null) return
    let live = true
    import('@/scene/tiers').then(
      (loaded) => {
        tiers = loaded
        if (live) setCode(loaded)
      },
      // The 2D view stays, as on a device that draws no 3D; a later page asks again.
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [code])
  return {
    device,
    unavailable: code !== null && device.known && device.tier < 1 ? code.unavailableReason(device.reason) : undefined,
    reader: code === null ? null : createElement(Reader, { tiers: code, onChange: setDevice }),
  }
}
