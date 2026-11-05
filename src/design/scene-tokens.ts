/*
 * The token roles as a scene reads them (ARCHITECTURE §6.4): `useSceneTokens()` reads every role's computed value from
 * the root's CSS custom properties, and reads them again when the colour scheme, the contrast preference, reduced
 * motion, forced colours or the root's `data-motion` change. Scenes take their material inputs from here and never
 * write a colour of their own (TRACKER W0-T17, check 5).
 *
 * Nothing here imports three: the material inputs are plain objects that `MeshStandardMaterial`,
 * `MeshPhysicalMaterial`, `SpotLight` and `HemisphereLight` accept as they are, so the entry chunk stays free of the
 * 3D vendor chunk (D-023).
 */
import { useSyncExternalStore } from 'react'
import { COLOR_ROLE_NAMES, cssVar, LANES, lightValue, MEMORY_STATES, PROBABILITIES, ROLE_NAMES, resolveColor, SLOTS, type ColorRoleName, type RoleName } from './tokens'

/** Every role's resolved value, as the stylesheet computes it on the root element. */
export type SceneRoles = Record<RoleName, string>

export interface MaterialInputs {
  color: string
  roughness: number
  metalness: number
}

/** Brushed stainless for `MeshPhysicalMaterial`: the brush's grain runs along x (anisotropy). */
export interface StainlessInputs extends MaterialInputs {
  anisotropy: number
  anisotropyRotation: number
  clearcoat: number
  clearcoatRoughness: number
}

/** The heat lamp, for a `SpotLight` over the present: the active state's light, and only that. */
export interface HeatLampInputs {
  color: string
  intensity: number
  distance: number
  decay: number
  angle: number
  penumbra: number
}

/** The fluorescent tubes, for a `HemisphereLight`: cool white above, the steel's bounce below. */
export interface FluorescentInputs {
  skyColor: string
  groundColor: string
  intensity: number
}

/**
 * The kitchen's equipment (scene kit v1, src/scene/props): the inputs the props' materials take. Every colour is a role; the
 * physical numbers are PROP_PARAMS below.
 */
export interface PropMaterialInputs {
  /** Brushed stainless in its three tones, the line's bright, shaded and deep steel. */
  steel: string
  steelShaded: string
  steelDeep: string
  /** Cast iron and the griddle's seasoned plate: the deep steel's role, darkened by the props' tone (src/scene/props/palette.ts). */
  iron: string
  /** Glazed ceramic: plates, and the subway tile on the back wall. */
  ceramic: string
  tile: string
  /** The grout between the tiles. */
  grout: string
  /** The sealed floor. */
  floor: string
  /** A lit station, a lamp's bulb and the heat strip: the heat lamp's amber, and only those (One Lamp). */
  glow: string
  /** A dark station's element: cold deep steel. */
  cold: string
  /** The hood's tube lights: the fluorescent tubes' white. */
  tube: string
  /** Contact shadows under the props: the shadows' own ink (DESIGN.md's shadow vocabulary is text-1 at an alpha). */
  shadow: string
  /** Steam over a lit station: the steel's own pale grey, so it shows as haze against the white tile and the dark hood alike. */
  steam: string
  /** Ticket paper, its print and the masking tape. */
  paper: string
  ink: string
  tape: string
}

export interface SceneMaterials {
  /** The pass, the rail, the lanes, the racks: brushed stainless. */
  stainless: StainlessInputs
  /** Deep stainless: housings, clips, wells. */
  stainlessDeep: MaterialInputs
  /**
   * Ticket paper. Every word and number a learner reads on it is DOM (GAMES.md §2.6, rule 7); the props' tickets carry only a
   * texture of generic order lines in dots (src/scene/props/print.ts), which nobody needs to read.
   */
  paper: MaterialInputs
  /** Masking tape. */
  tape: MaterialInputs
  heatLamp: HeatLampInputs
  /** The lamp's bulb, glowing: `MeshStandardMaterial` with an emissive colour. */
  heatLampBulb: MaterialInputs & { emissive: string; emissiveIntensity: number }
  fluorescent: FluorescentInputs
  /** The kitchen's equipment (scene kit v1): its colours, and its physical numbers, carried here so a scene reaches them at runtime. */
  props: PropMaterialInputs
  propParams: typeof PROP_PARAMS
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

/**
 * Material parameters that are physical, not colour. [estimated]: starting values for W0-T17 to tune on the reference
 * laptop. Colours always come from the roles.
 */
export const MATERIAL_PARAMS = {
  stainless: { roughness: 0.36, metalness: 0.92, anisotropy: 0.65, anisotropyRotation: 0, clearcoat: 0.12, clearcoatRoughness: 0.4 },
  stainlessDeep: { roughness: 0.48, metalness: 0.85 },
  paper: { roughness: 0.95, metalness: 0 },
  tape: { roughness: 0.82, metalness: 0 },
  heatLamp: { intensity: 2.4, distance: 6, decay: 2, angle: 0.62, penumbra: 0.7 },
  heatLampBulb: { roughness: 0.4, metalness: 0, emissiveIntensity: 1.8 },
  fluorescent: { intensity: 1.15 },
} as const

/**
 * The kitchen's physical numbers (scene kit v1, src/scene/props), [estimated] starting values tuned on the /design specimens. A
 * finish is how one metal differs from brushed stainless in the props' one metal material: [roughness ×, grain ×, metalness ×],
 * where the grain scales both the brush's normal map and the anisotropy, so chrome has none and cast iron almost none.
 */
export const PROP_PARAMS = {
  metal: { metalness: 0.92, anisotropy: 0.7, clearcoat: 0.12, clearcoatRoughness: 0.4 },
  finishes: {
    brushed: [1, 1, 1],
    spun: [0.78, 0.9, 1],
    chrome: [0.16, 0, 1],
    iron: [2.2, 0.14, 0.5],
    griddle: [1.35, 0.32, 0.82],
  },
  ceramic: { roughness: 0.2, clearcoat: 0.85, clearcoatRoughness: 0.06 },
  tile: { roughness: 0.14, groutRoughness: 0.92 },
  floor: { roughness: 0.42 },
  /** As bright as the W0 lamp's element (MATERIAL_PARAMS.heatLampBulb × materials.ts's BULB_GLOW), so bloom catches it at T2. */
  glow: { emissiveIntensity: 5.76 },
  /** The tubes glow below bloom's threshold: light, but not the present. */
  tube: { emissiveIntensity: 1.7 },
  shadow: { opacity: 0.62 },
  cone: { opacity: 0.24 },
  steam: { opacity: 0.45 },
  /** A heat lamp over the pass, in metres and candela: a warm pool about a plate and a half across on the steel below. */
  lamp: { intensity: 5.5, distance: 2.2, angle: 0.5, penumbra: 0.8, decay: 2, shadowRadius: 5, shadowMap: 1024 },
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
  const { stainless, stainlessDeep, paper, tape, heatLamp, heatLampBulb, fluorescent } = MATERIAL_PARAMS
  const bellMs = milliseconds(roles['dur-bell'])
  const colors = Object.fromEntries(COLOR_ROLE_NAMES.map((name) => [name, color(name)])) as Record<ColorRoleName, string>
  return {
    roles,
    colors,
    materials: {
      stainless: { color: color('surface-1'), ...stainless },
      stainlessDeep: { color: color('surface-3'), ...stainlessDeep },
      paper: { color: color('paper'), ...paper },
      tape: { color: color('tape'), ...tape },
      heatLamp: { color: color('lamp'), ...heatLamp },
      heatLampBulb: { color: color('lamp'), emissive: color('lamp'), ...heatLampBulb },
      fluorescent: { skyColor: color('light-fluorescent'), groundColor: color('surface-0'), ...fluorescent },
      props: {
        steel: color('surface-1'),
        steelShaded: color('surface-2'),
        steelDeep: color('surface-3'),
        iron: color('surface-3'),
        ceramic: color('paper'),
        tile: color('paper'),
        grout: color('paper-rule'),
        floor: color('surface-3'),
        glow: color('lamp'),
        cold: color('surface-3'),
        tube: color('light-fluorescent'),
        shadow: color('text-1'),
        steam: color('surface-1'),
        paper: color('paper'),
        ink: color('paper-ink'),
        tape: color('tape'),
      },
      propParams: PROP_PARAMS,
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
