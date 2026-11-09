/*
 * The learner's settings (ARCHITECTURE §3.1, §6.6 and §6.9), as plain data: what the 3D view does, how far its quality may
 * climb, how motion behaves, and whether a game's keys are bound. This file has no DOM and no React, so the shell can hold
 * it in the entry without cost and the tests can read every rule in it.
 *
 * Where a setting lives. The record is the ledger's `working` store (A§7.1: "settings, drafts, the current position,
 * remembered tabs"; last writer wins; never evidence), one key for each setting. A setting that was never chosen has no
 * record and takes its default, so a learner who has changed nothing has a `working` store with nothing of ours in it.
 *
 * The front page writes nothing and never opens the ledger (D-038, `useEvidence`), and yet it must honour a learner's choice
 * of 2D or of reduced motion from its first paint. So a copy of what was last saved sits in the browser's `localStorage`, a
 * per-viewer convenience that every page can read at once, with no database to open. It is a cache and never the record: the
 * Settings page, which opens the ledger, takes `working` as the truth and rewrites the copy to match (store.ts).
 *
 * Reading is lenient and never throws. A record that is missing, from another build, or edited by hand, takes the default,
 * so a bad value can never keep a page from drawing.
 */
import type { Json } from '@es/ledger'

/** How reduced motion is decided: by the system's preference, or forced on, or forced off (A§6.9: "overridable both ways"). */
export const MOTION_MODES = ['system', 'reduce', 'full'] as const
export type MotionMode = (typeof MOTION_MODES)[number]

/** The tier cap's choices (A§6.6): T1, T2 or T3. "2D only" is the 3D switch, which is why there is no T0 here. */
export const TIER_CAPS = [1, 2, 3] as const
export type TierCap = (typeof TIER_CAPS)[number]

export interface Settings {
  /** On, a 3D game opens in its 3D view where the device can draw it. Off, every game stays in its 2D view (A§6.6, T0 "the learner chose 2D"). */
  readonly view3d: boolean
  /** The highest tier the governor may run the 3D view at (A§6.6). It only ever lowers what the device would start at. */
  readonly tierCap: TierCap
  /** Whether motion is reduced: `system` follows `prefers-reduced-motion`, the others override it either way (A§6.9). */
  readonly motion: MotionMode
  /** Whether a game binds its keys (WCAG 2.1.4, GAMES.md §2.3: "Shortcuts can be turned off in Settings"). */
  readonly gameKeys: boolean
}

export type SettingName = keyof Settings

export const DEFAULT_SETTINGS: Settings = Object.freeze({ view3d: true, tierCap: 3, motion: 'system', gameKeys: true })

/** The `working` key of each setting: `<namespace>:<name>`, as the ledger's codec asks (A§7.1). */
export const SETTING_KEYS: Readonly<Record<SettingName, string>> = Object.freeze({
  view3d: 'settings:3d',
  tierCap: 'settings:tier-cap',
  motion: 'settings:reduced-motion',
  gameKeys: 'settings:game-keys',
})

export const SETTING_NAMES = Object.keys(SETTING_KEYS) as SettingName[]

/** Each setting's reader: the value it holds, or `undefined` for anything it does not understand. */
const READERS = {
  view3d: (value: unknown) => (typeof value === 'boolean' ? value : undefined),
  tierCap: (value: unknown): TierCap | undefined => (value === 1 || value === 2 || value === 3 ? value : undefined),
  motion: (value: unknown): MotionMode | undefined => (value === 'system' || value === 'reduce' || value === 'full' ? value : undefined),
  gameKeys: (value: unknown) => (typeof value === 'boolean' ? value : undefined),
}

/**
 * The settings in force, from a reader of `working` records by key. Whatever a record says that a setting does not
 * understand, and every setting with no record, takes the default.
 */
export function decodeSettings(read: (key: string) => unknown): Settings {
  return Object.freeze({
    view3d: READERS.view3d(read(SETTING_KEYS.view3d)) ?? DEFAULT_SETTINGS.view3d,
    tierCap: READERS.tierCap(read(SETTING_KEYS.tierCap)) ?? DEFAULT_SETTINGS.tierCap,
    motion: READERS.motion(read(SETTING_KEYS.motion)) ?? DEFAULT_SETTINGS.motion,
    gameKeys: READERS.gameKeys(read(SETTING_KEYS.gameKeys)) ?? DEFAULT_SETTINGS.gameKeys,
  })
}

/** What `working` stores for one setting: its value, as JSON. */
export const settingValue = (settings: Settings, name: SettingName): Json => settings[name]

/** Whether two settings are the same in every part. */
export function sameSettings(a: Settings, b: Settings): boolean {
  return SETTING_NAMES.every((name) => a[name] === b[name])
}

// ------------------------------------------------------------------------------------------------ the copy in localStorage

/** The key of the copy that every page can read at once (see the head of this file). The `es:` prefix is the site's own. */
export const MIRROR_KEY = 'es:settings'

/** The copy as text: each setting under its `working` key, so one reader decodes both. */
export function encodeMirror(settings: Settings): string {
  return JSON.stringify(Object.fromEntries(SETTING_NAMES.map((name) => [SETTING_KEYS[name], settingValue(settings, name)])))
}

/** The settings a stored copy says. Missing, damaged or foreign text gives the defaults. */
export function decodeMirror(text: string | null): Settings {
  if (text === null) return DEFAULT_SETTINGS
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return DEFAULT_SETTINGS
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_SETTINGS
  const record = parsed as Record<string, unknown>
  return decodeSettings((key) => (Object.hasOwn(record, key) ? record[key] : undefined))
}

// ------------------------------------------------------------------------------------------------ the root's attribute

/** The attribute on the root element that carries the override (`tokens.css`, `base.css` and `scene-tokens.ts` read it). */
export const MOTION_ATTRIBUTE = 'data-motion'

/** The value the root's `data-motion` takes for a mode: none at all when the system decides. */
export function motionAttribute(mode: MotionMode): 'reduce' | 'full' | null {
  return mode === 'system' ? null : mode
}
