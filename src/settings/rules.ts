/*
 * What the settings mean to the parts that read them (ARCHITECTURE §6.6 and §6.9), as plain functions: what a Stage may do, what a
 * game's shell allows, and whether motion is reduced. The parts that read them are lazily loaded, so this file stays out of the
 * entry, which holds only what the first render needs (model.ts and store.ts).
 */
import type { MotionMode, Settings } from './model'

type TierId = 0 | 1 | 2 | 3

/**
 * What a 3D view may do, from what its game asks and from the learner's settings. Each side can only hold the view back: it is
 * 2D if either asks for 2D, and the lower of the two tier caps holds. Neither side can raise what the other holds.
 */
export function limitsFor(settings: Settings, asked: { prefer2d?: boolean; tierCap?: TierId } = {}): { prefer2d: boolean; cap: TierId } {
  return { prefer2d: asked.prefer2d === true || !settings.view3d, cap: Math.min(asked.tierCap ?? 3, settings.tierCap) as TierId }
}

/** What a game's shell asks of itself. */
export interface ShellAsks {
  allow3d?: boolean
  unavailable3d?: string
  shortcuts?: boolean
}

/**
 * What a game's shell allows, from what the game asks and from the learner's settings: 3D if both allow it, and the keys if both
 * bind them. When 3D is off only because the learner turned it off, the shell says so beside its disabled 3D button.
 */
export function shellLimits(settings: Settings, asked: ShellAsks = {}): { allow3d: boolean; unavailable3d: string | undefined; keys: boolean } {
  const gameAllows3d = asked.allow3d ?? true
  return {
    allow3d: gameAllows3d && settings.view3d,
    unavailable3d: !gameAllows3d || settings.view3d ? asked.unavailable3d : '3D is off in Settings',
    keys: (asked.shortcuts ?? true) && settings.gameKeys,
  }
}

/** Whether motion is reduced, and who says so: the learner's setting, or the system's preference. */
export interface EffectiveMotion {
  readonly reduced: boolean
  readonly source: 'settings' | 'system'
}

/** The answer motion gives, from the setting and from what `prefers-reduced-motion` says (null where it cannot be asked). */
export function effectiveMotion(mode: MotionMode, systemReduces: boolean | null): EffectiveMotion {
  if (mode === 'reduce') return { reduced: true, source: 'settings' }
  if (mode === 'full') return { reduced: false, source: 'settings' }
  return { reduced: systemReduces === true, source: 'system' }
}
