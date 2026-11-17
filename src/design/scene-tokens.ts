/*
 * The token roles as a scene reads them (ARCHITECTURE §6.4): `useSceneTokens()` reads every role's computed value from
 * the root's CSS custom properties, and reads them again when the colour scheme, the contrast preference, reduced
 * motion, forced colours or the root's `data-motion` change. Scenes take their material inputs from here and never
 * write a colour of their own (TRACKER W0-T17, check 5).
 *
 * Nothing here imports three: the light inputs are plain objects that `HemisphereLight` and `DirectionalLight` accept as they are, so the entry chunk stays free of the
 * 3D vendor chunk (D-023).
 */
import { useSyncExternalStore } from 'react'
import { COLOR_ROLE_NAMES, cssVar, LANES, lightValue, MEMORY_STATES, PROBABILITIES, ROLE_NAMES, resolveColor, SLOTS, type ColorRoleName, type RoleName } from './tokens'

/** Every role's resolved value, as the stylesheet computes it on the root element. */
export type SceneRoles = Record<RoleName, string>

/** The scene's light, for a `HemisphereLight`: cool white above, the ground's grey below. */
export interface FluorescentInputs {
  skyColor: string
  groundColor: string
  intensity: number
}

export interface SceneMaterials {
  fluorescent: FluorescentInputs
}

export interface SceneTokens {
  roles: SceneRoles
  /** Every colour role as a value three can parse: the computed value, or the role's light value where it is a system colour. */
  colors: Readonly<Record<ColorRoleName, string>>
  materials: SceneMaterials
  /** The colour of each palette role, in `SCENE_PALETTE` order, for an instanced mesh's role index. */
  palette: readonly string[]
  motion: { quickMs: number; bellMs: number; feedMs: number; settleMs: number; reduced: boolean }
  contrastMore: boolean
  forcedColors: boolean
}

/** Light parameters, [estimated]: starting values tuned by eye. Colours always come from the roles. */
export const MATERIAL_PARAMS = {
  fluorescent: { intensity: 1.15 },
} as const

/**
 * The colour roles an instanced primitive can index (`SpanInstances`, `BlockGrid` and the rest take a role index per
 * instance): the code's slots, then the lanes, memory, probability and status roles.
 */
export const SCENE_PALETTE: readonly ColorRoleName[] = [
  ...SLOTS.map((slot) => `cat-${slot}` as ColorRoleName),
  ...LANES.map((lane) => `lane-${lane}` as ColorRoleName),
  ...MEMORY_STATES.map((state) => `memory-${state}` as ColorRoleName),
  ...PROBABILITIES.map((probability) => `probability-${probability}` as ColorRoleName),
  'status-ok',
  'status-warn',
  'status-bad',
  'status-info',
]

/** A role's index in `SCENE_PALETTE`. */
export function paletteIndex(role: ColorRoleName): number {
  const index = SCENE_PALETTE.indexOf(role)
  if (index < 0) throw new Error(`${role} is not in the scene palette`)
  return index
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** A colour three can parse. A system colour (forced colours) falls back to the role's light value. */
function sceneColor(role: ColorRoleName, value: string): string {
  return HEX.test(value) ? value.toLowerCase() : resolveColor(role)
}

const milliseconds = (value: string) => {
  const match = /^(-?[\d.]+)(ms|s)$/.exec(value.trim())
  if (!match) return 0
  return match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1])
}

/** Builds the tokens from a reader of the root's custom properties. */
export function sceneTokensFrom(
  read: (variable: string) => string,
  flags: { contrastMore?: boolean; forcedColors?: boolean; reduced?: boolean } = {},
): SceneTokens {
  const roles = Object.fromEntries(ROLE_NAMES.map((name) => [name, read(cssVar(name)).trim()])) as SceneRoles
  const color = (name: ColorRoleName) => sceneColor(name, roles[name])
  const { fluorescent } = MATERIAL_PARAMS
  const bellMs = milliseconds(roles['dur-bell'])
  const colors = Object.fromEntries(COLOR_ROLE_NAMES.map((name) => [name, color(name)])) as Record<ColorRoleName, string>
  return {
    roles,
    colors,
    materials: {
      fluorescent: { skyColor: color('light-fluorescent'), groundColor: color('surface-0'), ...fluorescent },
    },
    palette: SCENE_PALETTE.map(color),
    motion: {
      quickMs: milliseconds(roles['dur-quick']),
      bellMs,
      feedMs: milliseconds(roles['dur-feed']),
      settleMs: milliseconds(roles['dur-settle']),
      reduced: flags.reduced ?? bellMs === 0,
    },
    contrastMore: flags.contrastMore ?? false,
    forcedColors: flags.forcedColors ?? false,
  }
}

/** The tokens with no stylesheet to read (server rendering, tests): the light scheme's values from tokens.ts. */
export function staticSceneTokens(): SceneTokens {
  return sceneTokensFrom((variable) => lightValue(variable.replace(/^--es-/, '') as RoleName))
}

// ------------------------------------------------------------------------------------------------ the live store

const QUERIES = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)', '(prefers-reduced-motion: reduce)', '(forced-colors: active)']

let cached: SceneTokens | null = null
const listeners = new Set<() => void>()

function readLive(): SceneTokens {
  const root = document.documentElement
  const style = getComputedStyle(root)
  const matches = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches
  const motion = root.dataset.motion
  return sceneTokensFrom((variable) => style.getPropertyValue(variable), {
    contrastMore: matches('(prefers-contrast: more)'),
    forcedColors: matches('(forced-colors: active)'),
    reduced: motion === 'reduce' || (motion !== 'full' && matches('(prefers-reduced-motion: reduce)')),
  })
}

function invalidate() {
  cached = null
  for (const listener of listeners) listener()
}

let detach: (() => void) | null = null

function attach() {
  const lists = typeof matchMedia === 'function' ? QUERIES.map((query) => matchMedia(query)) : []
  for (const list of lists) list.addEventListener('change', invalidate)
  const observer = new MutationObserver(invalidate)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion', 'data-theme', 'class', 'style'] })
  return () => {
    for (const list of lists) list.removeEventListener('change', invalidate)
    observer.disconnect()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) detach = attach()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      detach?.()
      detach = null
    }
  }
}

function getSnapshot(): SceneTokens {
  cached ??= readLive()
  return cached
}

let serverSnapshot: SceneTokens | null = null
function getServerSnapshot(): SceneTokens {
  serverSnapshot ??= staticSceneTokens()
  return serverSnapshot
}

/** The token roles and material inputs as the page computes them now; re-read on every preference change. */
export function useSceneTokens(): SceneTokens {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
