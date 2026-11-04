/*
 * What every primitive inside a scene's canvas reaches (ARCHITECTURE §6.4): the token roles as the page computes them,
 * the shared materials, the tier, reduced motion, and the frame loop. SceneCanvas provides it inside the R3F root, where
 * the page's own React context does not reach.
 */
import { createContext, useContext, useEffect, useRef } from 'react'
import type { Object3D } from 'three'
import type { SceneTokens } from '@/design/scene-tokens'
import type { KitMaterials } from './materials'
import type { Tier } from './tiers'

export interface Kit {
  readonly tokens: SceneTokens
  readonly materials: KitMaterials
  readonly tier: Tier
  readonly reducedMotion: boolean
  /** The design system's settle curve (`ease-settle`), for every move the kit animates. */
  readonly ease: (t: number) => number
  /**
   * Keeps frames coming while something animates, at the tier's frame-rate cap, and returns the release. With nothing
   * held the loop draws only when something changes (`demand`). Under reduced motion nothing animates, so nothing holds.
   */
  hold(): () => void
  /** Asks for one frame. */
  invalidate(): void
  /** Names an object whose space labels can be anchored in (`LabelSpec.frame`), such as the time track. */
  registerFrame(name: string, object: Object3D): () => void
  /** The camera's distance to what it looks at: the fog starts this far beyond it (the CameraRig sets it). */
  focus(distance: number): void
}

export const KitContext = createContext<Kit | null>(null)

export function useKit(): Kit {
  const kit = useContext(KitContext)
  if (kit === null) throw new Error('a scene-kit primitive renders inside <SceneCanvas>')
  return kit
}

/** Holds the frame loop while `active` is true, and lets go when it turns false or the component unmounts. */
export function useHold(active: boolean): void {
  const { hold } = useKit()
  const release = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!active) return
    release.current = hold()
    return () => {
      release.current?.()
      release.current = null
    }
  }, [active, hold])
}
