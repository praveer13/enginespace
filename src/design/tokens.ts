/*
 * The design system's token roles and their values: The Pass, a line kitchen and its expo pass (D-047).
 *
 * This file is the one source. `bun scripts/verify-tokens.ts --write` generates src/design/tokens.css from it, Tailwind
 * reads `tailwindTheme()` (tailwind.config.ts), scenes read the resolved values through scene-tokens.ts, and
 * scripts/verify-tokens.ts checks all three agree, that no value is a placeholder, and that every declared pair meets
 * its ARCHITECTURE §11.2 threshold in every scheme the system ships.
 *
 * The world's materials are the roles: brushed stainless for the ground and surfaces 0-3, white bond ticket paper with
 * the ribbon's black and red, heat-lamp amber for the active state alone, masking tape with marker, and the HACCP
 * cutting-board colours as the only categorical code. Lane, memory, probability and status roles point at that code:
 * nothing gets a colour of its own.
 *
 * Pure data and pure functions, with no DOM: tailwind.config.ts (Node) and the tests import it too.
 */

// ------------------------------------------------------------------------------------------------ colour roles

export type Hex = `#${string}`

export {
  LANES,
  MEMORY_STATES,
  PROBABILITIES,
  SLOT_MARKS,
  SLOTS,
  type FillPattern,
  type GlyphShape,
  type Lane,
  type MemoryState,
  type Probability,
  type Slot,
} from './code'
import { SLOTS, type Slot } from './code'

type ColorGroup = 'material' | 'text' | 'focus' | 'status' | 'categorical' | 'lane' | 'memory' | 'probability'

interface ColorValue {
  kind: 'color'
  group: ColorGroup
  /** A literal sRGB hex value, or the colour role this one stands for. */
  value: Hex | { ref: string }
  note: string
}

const hex = (group: ColorGroup, value: Hex, note: string): ColorValue => ({ kind: 'color', group, value, note })
const ref = (group: ColorGroup, role: string, note: string): ColorValue => ({ kind: 'color', group, value: { ref: role }, note })

const COLORS = {
  // Stainless: the ground and surfaces 0-3.
  'surface-0': hex('material', '#ccd1d4', 'The ground: brushed stainless under fluorescent tubes. The page, the pass, the line.'),
  'surface-1': hex('material', '#dde1e4', 'Raised stainless, catching the tubes: the board, panels, the top of the pass.'),
  'surface-2': hex('material', '#b2b9be', 'Shaded stainless: the underside of the rail, plates and trims.'),
  'surface-3': hex('material', '#59616a', "Deep stainless: the printer's housing, a dark station, a switch's well. Paper-white text sits on it."),
  edge: hex('material', '#5f666d', "A control's boundary on steel or paper, at 3:1 (WCAG 1.4.11)."),
  // Ticket paper and the ribbon's two inks.
  paper: hex('material', '#fafaf6', 'Impact-printer ticket paper: white bond. The text you read sits on it.'),
  'paper-ink': hex('material', '#1d1b22', "The ribbon's black: dot-matrix print on a ticket."),
  'paper-ink-2': hex('material', '#a30f1a', "The ribbon's red, the printer's second colour: what must not be missed."),
  'paper-rule': hex('material', '#bcb9b1', 'Perforations and feed marks on the paper. Never the only carrier of anything.'),
  // The heat lamp: the active state, and only there.
  lamp: hex('material', '#ffb547', 'Heat-lamp amber, pooled over the present: the place the next decision acts on.'),
  'lamp-ring': hex('material', '#9a3d00', "The lamp's filament: the ring and edge of the active state, at 3:1 on every ground."),
  // Masking tape and marker.
  tape: hex('material', '#e6d6ad', 'Masking tape, torn off the roll: labels on pans and objects.'),
  'tape-ink': hex('material', '#1a1a1c', 'Marker on masking tape.'),
  'light-fluorescent': hex('material', '#eef4f8', "The tubes' cool white: the scene's ambient light."),

  // Text on steel and paper.
  'text-1': hex('text', '#17191d', 'Primary text on steel and paper.'),
  'text-2': hex('text', '#3b4148', 'Secondary text: captions, the second line of a label.'),
  'text-3': hex('text', '#4b525a', 'Quiet text: placeholders and metadata. Not on surface-2.'),

  // Focus is the heat lamp.
  focus: ref('focus', 'lamp-ring', 'The focus ring: the heat lamp falls on the control the keyboard is on.'),

  // The HACCP cutting boards. Each slot has its board colour (fill), an edge for outlines and text, and the ink that
  // reads on the fill.
  'cat-red': hex('categorical', '#c8102e', 'The red board.'),
  'cat-red-edge': hex('categorical', '#9b0d1a', "The red board's edge: outlines, and text in the code's colour."),
  'cat-red-ink': ref('categorical', 'paper', 'Text on the red board.'),
  'cat-blue': hex('categorical', '#1b5faa', 'The blue board.'),
  'cat-blue-edge': hex('categorical', '#18509a', "The blue board's edge."),
  'cat-blue-ink': ref('categorical', 'paper', 'Text on the blue board.'),
  'cat-yellow': hex('categorical', '#f5c400', 'The yellow board. Too light to stand alone on steel: its marks carry the edge.'),
  'cat-yellow-edge': hex('categorical', '#685000', "The yellow board's edge."),
  'cat-yellow-ink': ref('categorical', 'paper-ink', 'Text on the yellow board.'),
  'cat-green': hex('categorical', '#237a37', 'The green board.'),
  'cat-green-edge': hex('categorical', '#185e2c', "The green board's edge."),
  'cat-green-ink': ref('categorical', 'paper', 'Text on the green board.'),
  'cat-white': hex('categorical', '#f3f3ef', 'The white board. Its marks carry the edge.'),
  'cat-white-edge': hex('categorical', '#5f666d', "The white board's edge."),
  'cat-white-ink': ref('categorical', 'paper-ink', 'Text on the white board.'),
  'cat-brown': hex('categorical', '#7b4a26', 'The brown board.'),
  'cat-brown-edge': hex('categorical', '#5a361b', "The brown board's edge."),
  'cat-brown-ink': ref('categorical', 'paper', 'Text on the brown board.'),

  // Status: the code's edges and the ribbon's red, each with its glyph in the components.
  'status-ok': ref('status', 'cat-green-edge', 'A check passed.'),
  'status-warn': ref('status', 'cat-yellow-edge', 'Look before going on.'),
  'status-bad': ref('status', 'paper-ink-2', 'Something failed: printed in the ribbon red.'),
  'status-info': ref('status', 'cat-blue-edge', 'A note.'),

  // Lanes (GAMES.md §2.6, Service and The Tape).
  'lane-cpu': ref('lane', 'cat-blue', "The expo's lane: the CPU writing the next call and reading the plates back."),
  'lane-gpu': ref('lane', 'cat-green', "The line's stations: the GPU cooking. A lit stretch is the GPU busy."),
  'lane-sync': ref('lane', 'cat-yellow', '"Heard!": a sync, where the hands that asked wait for the line.'),
  'lane-copy': ref('lane', 'cat-brown', 'The dumbwaiter: copies between host and device.'),
  'lane-idle': ref('lane', 'cat-white', 'Stations dark: a bubble, drawn hollow.'),

  // Memory: hotel pans in the reach-in (GAMES.md §2.6, The Reach-In).
  'memory-free': ref('memory', 'cat-white', 'A bare pan: no tape, no mise.'),
  'memory-used': ref('memory', 'cat-blue', 'A full pan, held by a ticket.'),
  'memory-cached': ref('memory', 'cat-yellow', 'Tape still on: the mise is there, and nobody holds it.'),
  'memory-shared': ref('memory', 'cat-green', 'Shared mise: a prefix hit.'),
  'memory-adapter': ref('memory', 'cat-brown', "A recipe kit's pan."),
  'memory-evicted': ref('memory', 'cat-red', 'A dumped pan.'),

  // Probability: the tasting (GAMES.md §2.6, The Tasting).
  'probability-target': ref('probability', 'cat-blue', "The chef's tasting: p."),
  'probability-draft': ref('probability', 'cat-yellow', "The commis's plates: q, and the over-plated cap q - p."),
  'probability-overlap': ref('probability', 'cat-green', 'The agreed base: min(p, q).'),
  'probability-residual': ref('probability', 'cat-red', 'The under-plated well the chef re-plates from: (p - q)+.'),
  'probability-observed': ref('probability', 'cat-white', 'What went out: drawn hollow over the target.'),
} as const satisfies Record<string, ColorValue>

// ------------------------------------------------------------------------------------------------ the other roles

interface ShadowValue {
  kind: 'shadow'
  value: string
  note: string
}
interface TextureValue {
  kind: 'texture'
  value: string
  note: string
}
interface DurationValue {
  kind: 'duration'
  value: `${number}ms`
  note: string
}
interface EasingValue {
  kind: 'easing'
  value: string
  note: string
}
interface RadiusValue {
  kind: 'radius'
  value: string
  note: string
}
interface SpaceValue {
  kind: 'space'
  value: `${number}rem`
  note: string
}
export interface FontValue {
  kind: 'font'
  /** The self-hosted face first (src/design/fonts.css), then fallbacks. A generic family is never first. */
  family: readonly string[]
  size: string
  leading: string
  tracking: string
  weight: number
  case: 'none' | 'uppercase'
  note: string
}

/*
 * The brushed grain: fractal noise stretched along x, so it reads as streaks from the brush, light and dark, over the
 * steel's own colour. An inline SVG, so it makes no request (D-033). Its colours are the grain's own light and shade.
 */
const BRUSHED_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='720' height='720'%3E%3Cfilter id='l' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.0016 0.92' numOctaves='3' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.25 0 0 0 -0.56'/%3E%3C/filter%3E%3Cfilter id='d' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.0022 0.7' numOctaves='2' seed='29' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.16 0 0 0 0 0.18 0 0 0 0 0.2 0 1.1 0 0 -0.5'/%3E%3C/filter%3E%3Crect width='720' height='720' filter='url(%23l)'/%3E%3Crect width='720' height='720' filter='url(%23d)'/%3E%3C/svg%3E\")"

const OTHERS = {
  // Depth: offset and soft blur, never a zero-offset halo.
  'shadow-paper': {
    kind: 'shadow',
    value: '0 1px 1px rgb(23 25 29 / 0.16), 0 8px 18px -8px rgb(23 25 29 / 0.38)',
    note: 'Paper lifted off the steel.',
  },
  'shadow-lift': {
    kind: 'shadow',
    value: '0 2px 3px rgb(23 25 29 / 0.16), 0 16px 28px -12px rgb(23 25 29 / 0.42)',
    note: 'Paper or a plate picked up: hover.',
  },
  'shadow-plate': {
    kind: 'shadow',
    value: 'inset 0 1px 0 rgb(255 255 255 / 0.7), inset 0 -1px 0 rgb(23 25 29 / 0.12), 0 1px 2px rgb(23 25 29 / 0.3)',
    note: 'A stamped steel plate: lit top edge, shaded foot.',
  },
  'shadow-press': {
    kind: 'shadow',
    value: 'inset 0 2px 4px rgb(23 25 29 / 0.32), inset 0 0 0 1px rgb(23 25 29 / 0.08)',
    note: 'A plate or stub pressed in.',
  },
  'shadow-shelf': {
    kind: 'shadow',
    value: '0 1px 0 rgb(255 255 255 / 0.55), 0 6px 12px -6px rgb(23 25 29 / 0.35)',
    note: "The board's lip over the ground.",
  },

  // Material grain.
  'texture-brushed': { kind: 'texture', value: BRUSHED_GRAIN, note: 'The brush streaks of stainless steel, over any surface role.' },
  'texture-sheen': {
    kind: 'texture',
    value: 'linear-gradient(180deg, rgb(255 255 255 / 0.36), rgb(255 255 255 / 0) 24rem)',
    note: 'The fluorescent tubes reflected along the top of the steel.',
  },

  // Motion: everything moves on the bell; between bells only the printer feeds.
  'dur-quick': { kind: 'duration', value: '120ms', note: 'A press or a hover answering the hand.' },
  'dur-bell': { kind: 'duration', value: '240ms', note: 'The bell strike: one step.' },
  'dur-feed': { kind: 'duration', value: '420ms', note: 'The printer feeding one ticket line.' },
  'dur-settle': { kind: 'duration', value: '640ms', note: 'A course sliding down the pass and coming to rest.' },
  'ease-settle': { kind: 'easing', value: 'cubic-bezier(0.16, 1, 0.3, 1)', note: 'Exponential ease-out: fast away, long rest.' },
  'ease-strike': { kind: 'easing', value: 'cubic-bezier(0.19, 1, 0.22, 1)', note: 'The bell: a hard strike that settles exponentially, with no overshoot.' },
  'ease-feed': { kind: 'easing', value: 'steps(6, end)', note: 'The printer advances in line steps, never a glide.' },

  // Radii: sheet metal and paper.
  'radius-paper': { kind: 'radius', value: '0px', note: 'Paper is cut square.' },
  'radius-plate': { kind: 'radius', value: '3px', note: 'A stamped plate or a sheet-metal edge.' },
  'radius-pan': { kind: 'radius', value: '10px', note: "A hotel pan's drawn corners." },
  'radius-round': { kind: 'radius', value: '999px', note: 'A light, a bell, a rivet.' },

  // Spacing, on a 4 px step.
  'space-1': { kind: 'space', value: '0.25rem', note: 'Hairline gaps inside a mark.' },
  'space-2': { kind: 'space', value: '0.5rem', note: 'Inside a control.' },
  'space-3': { kind: 'space', value: '0.75rem', note: 'Between a label and its control.' },
  'space-4': { kind: 'space', value: '1rem', note: 'The gutter at phone width.' },
  'space-6': { kind: 'space', value: '1.5rem', note: 'Between items of a group.' },
  'space-8': { kind: 'space', value: '2rem', note: 'Inside a ticket at desktop width.' },
  'space-12': { kind: 'space', value: '3rem', note: 'Between groups.' },
  'space-16': { kind: 'space', value: '4rem', note: 'Above a section heading.' },
  'space-24': { kind: 'space', value: '6rem', note: 'Between sections at desktop width.' },

  // Type: one face per kitchen object.
  'font-display': {
    kind: 'font',
    family: ['Big Shoulders Display', 'sans-serif'],
    size: 'clamp(2.75rem, 1.5rem + 5vw, 6rem)',
    leading: '0.88',
    tracking: '0.004em',
    weight: 800,
    case: 'uppercase',
    note: 'Stamped equipment plates and signage: the headline.',
  },
  'font-heading': {
    kind: 'font',
    family: ['Big Shoulders Display', 'sans-serif'],
    size: 'clamp(1.75rem, 1.35rem + 1.6vw, 2.5rem)',
    leading: '0.95',
    tracking: '0.01em',
    weight: 800,
    case: 'uppercase',
    note: "A section's plate.",
  },
  'font-body': {
    kind: 'font',
    family: ['Atkinson Hyperlegible', 'sans-serif'],
    size: '1.0625rem',
    leading: '1.6',
    tracking: '0em',
    weight: 400,
    case: 'none',
    note: 'Long reading: a face drawn for legibility, which tells l, I and 1 and O and 0 apart.',
  },
  'font-mono': {
    kind: 'font',
    family: ['Atkinson Hyperlegible Mono', 'Atkinson Hyperlegible', 'monospace'],
    size: '0.9375rem',
    leading: '1.55',
    tracking: '0em',
    weight: 400,
    case: 'none',
    note: 'Code from vLLM and SGLang, and identifiers.',
  },
  'font-numeric': {
    kind: 'font',
    family: ['Doto', 'Handjet', 'monospace'],
    size: '1.125rem',
    leading: '1.2',
    tracking: '0.02em',
    weight: 900,
    case: 'none',
    note: 'Impact-printer dot matrix: every count, tick, timestamp and microsecond.',
  },
  'font-ticket': {
    kind: 'font',
    family: ['Doto', 'Handjet', 'monospace'],
    size: '1.0625rem',
    leading: '1.45',
    tracking: '0.02em',
    weight: 900,
    case: 'none',
    note: "Ticket lines and the printer tape, in the printer's dots.",
  },
  'font-label': {
    kind: 'font',
    family: ['Permanent Marker', 'cursive'],
    size: '0.9375rem',
    leading: '1.2',
    tracking: '0.02em',
    weight: 400,
    case: 'none',
    note: 'Marker on masking tape.',
  },
} as const satisfies Record<string, ShadowValue | TextureValue | DurationValue | EasingValue | RadiusValue | SpaceValue | FontValue>

/** Every role: name to definition. */
export const ROLES = { ...COLORS, ...OTHERS }
export type RoleName = keyof typeof ROLES
export type ColorRoleName = keyof typeof COLORS
export type RoleKind = (typeof ROLES)[RoleName]['kind']
export type Role = ColorValue | ShadowValue | TextureValue | DurationValue | EasingValue | RadiusValue | SpaceValue | FontValue

export const ROLE_NAMES = Object.keys(ROLES) as RoleName[]
export const COLOR_ROLE_NAMES = Object.keys(COLORS) as ColorRoleName[]
export const isColorRole = (name: string): name is ColorRoleName => Object.hasOwn(COLORS, name)
export const roleOf = (name: RoleName): Role => ROLES[name] as Role

/** The groups the roles fall into, in the order the /design page and verify-tokens print them. */
export const ROLE_GROUPS = [
  { id: 'material', title: 'Materials', kinds: ['color'], colorGroup: 'material' },
  { id: 'text', title: 'Text', kinds: ['color'], colorGroup: 'text' },
  { id: 'focus', title: 'Focus', kinds: ['color'], colorGroup: 'focus' },
  { id: 'categorical', title: 'The categorical code', kinds: ['color'], colorGroup: 'categorical' },
  { id: 'status', title: 'Status', kinds: ['color'], colorGroup: 'status' },
  { id: 'lane', title: 'Lanes', kinds: ['color'], colorGroup: 'lane' },
  { id: 'memory', title: 'Memory', kinds: ['color'], colorGroup: 'memory' },
  { id: 'probability', title: 'Probability', kinds: ['color'], colorGroup: 'probability' },
  { id: 'elevation', title: 'Depth', kinds: ['shadow'] },
  { id: 'texture', title: 'Grain', kinds: ['texture'] },
  { id: 'motion', title: 'Motion', kinds: ['duration', 'easing'] },
  { id: 'radius', title: 'Radii', kinds: ['radius'] },
  { id: 'space', title: 'Spacing', kinds: ['space'] },
  { id: 'type', title: 'Type', kinds: ['font'] },
] as const

export type RoleGroupId = (typeof ROLE_GROUPS)[number]['id']

/** The roles of one group, in declaration order. */
export function rolesIn(groupId: RoleGroupId): RoleName[] {
  const group = ROLE_GROUPS.find((candidate) => candidate.id === groupId)
  if (!group) throw new Error(`no role group "${groupId}"`)
  return ROLE_NAMES.filter((name) => {
    const role = roleOf(name)
    if (!(group.kinds as readonly string[]).includes(role.kind)) return false
    return role.kind !== 'color' || !('colorGroup' in group) || role.group === group.colorGroup
  })
}

/** The categorical slot a lane, memory or probability role (or a slot role itself) stands for. */
export function slotOf(name: ColorRoleName): Slot | undefined {
  let current: string = name
  for (let hops = 0; hops < 8; hops += 1) {
    const match = /^cat-(red|blue|yellow|green|white|brown)$/.exec(current)
    if (match) return match[1] as Slot
    const role = COLORS[current as ColorRoleName] as ColorValue | undefined
    if (!role || typeof role.value === 'string') return undefined
    current = role.value.ref
  }
  return undefined
}

// ------------------------------------------------------------------------------------------------ schemes

/**
 * The colour schemes the system ships. There is one light scheme, the scene itself: a bright line under fluorescent
 * tubes and heat lamps (D-050 says why there is no dark one). `contrast-more` answers `prefers-contrast: more` by
 * darkening the quiet text, the edges and the filament. Every declared pair is checked in both.
 */
export const SCHEMES = {
  light: { media: null, label: 'Light', values: {} },
  'contrast-more': {
    media: '(prefers-contrast: more)',
    label: 'More contrast',
    values: {
      'surface-2': '#c3c9cd',
      'text-2': '#272b30',
      'text-3': '#30353b',
      edge: '#3f454b',
      'paper-rule': '#77746d',
      'lamp-ring': '#7a2f00',
      'cat-white-edge': '#3f454b',
    },
  },
} as const satisfies Record<string, { media: string | null; label: string; values: Partial<Record<ColorRoleName, Hex>> }>

export type SchemeName = keyof typeof SCHEMES
export const SCHEME_NAMES = Object.keys(SCHEMES) as SchemeName[]

/**
 * Under reduced motion every duration is 0 (ARCHITECTURE §6.9: transitions off, cameras cut). Settings can force
 * either answer with `data-motion` on the root element (W0-T22).
 */
export const REDUCED_MOTION_DURATION = '0ms'

/** A colour role's literal hex value in a scheme, following refs. */
export function resolveColor(name: ColorRoleName, scheme: SchemeName = 'light'): Hex {
  const overrides: Partial<Record<string, Hex>> = SCHEMES[scheme].values
  let current: string = name
  for (let hops = 0; hops < 8; hops += 1) {
    const override = overrides[current]
    if (override) return override
    const role = COLORS[current as ColorRoleName] as ColorValue | undefined
    if (!role) throw new Error(`colour role "${name}" refers to "${current}", which is not a colour role`)
    if (typeof role.value === 'string') return role.value
    current = role.value.ref
  }
  throw new Error(`colour role "${name}" refers in a loop`)
}

// ------------------------------------------------------------------------------------------------ contrast pairs

/** ARCHITECTURE §11.2: 4.5 for body text, 3 for large text and for non-text marks (WCAG 1.4.3, 1.4.11). */
export const THRESHOLDS = { text: 4.5, 'non-text': 3 } as const
export type PairKind = keyof typeof THRESHOLDS

export interface ContrastPair {
  fg: ColorRoleName
  bg: ColorRoleName
  kind: PairKind
  use: string
}

const pairs = (kind: PairKind, use: string, fgs: readonly ColorRoleName[], bgs: readonly ColorRoleName[]): ContrastPair[] =>
  fgs.flatMap((fg) => bgs.map((bg) => ({ fg, bg, kind, use })))

const GROUNDS = ['surface-0', 'surface-1', 'paper'] as const satisfies readonly ColorRoleName[]
const STATUS = ['status-ok', 'status-warn', 'status-bad', 'status-info'] as const satisfies readonly ColorRoleName[]
const CAT_EDGES = SLOTS.map((slot) => `cat-${slot}-edge` as ColorRoleName)

/** The pairs the system promises. A component may only put a foreground on a background through one of these. */
export const PAIRS: readonly ContrastPair[] = [
  ...pairs('text', 'Text on steel and paper', ['text-1', 'text-2'], ['surface-0', 'surface-1', 'surface-2', 'paper']),
  ...pairs('text', 'Quiet text on steel and paper', ['text-3'], GROUNDS),
  ...pairs('text', 'Print on a ticket, and text under the lamp', ['paper-ink'], ['paper', 'lamp']),
  ...pairs('text', 'Text under the lamp on the board', ['text-1'], ['lamp']),
  ...pairs('text', 'The red second colour', ['paper-ink-2'], GROUNDS),
  ...pairs('text', 'Marker on tape', ['tape-ink'], ['tape']),
  ...pairs('text', 'Paper-white text on deep steel', ['paper'], ['surface-3']),
  ...pairs('text', 'Status text and its glyph', STATUS, GROUNDS),
  ...pairs(
    'text',
    'Text in the code colour',
    CAT_EDGES.filter((edge) => edge !== 'cat-white-edge'),
    GROUNDS,
  ),
  ...SLOTS.map((slot): ContrastPair => ({
    fg: `cat-${slot}-ink` as ColorRoleName,
    bg: `cat-${slot}` as ColorRoleName,
    kind: 'text',
    use: 'A label on a board',
  })),
  ...pairs(
    'non-text',
    'The focus ring and the active edge',
    ['focus', 'lamp-ring'],
    ['surface-0', 'surface-1', 'surface-2', 'paper', 'tape', 'lamp'],
  ),
  ...pairs('non-text', "A control's boundary", ['edge'], GROUNDS),
  ...pairs('non-text', 'Deep steel structures: the rail, clips, wells', ['surface-3'], ['surface-0', 'surface-1']),
  ...pairs('non-text', 'An outlined mark in the code', CAT_EDGES, GROUNDS),
  ...pairs('non-text', 'A filled mark in the code', ['cat-red', 'cat-blue', 'cat-green', 'cat-brown'], GROUNDS),
  { fg: 'cat-yellow-edge', bg: 'cat-yellow', kind: 'non-text', use: "A yellow mark's edge" },
  { fg: 'cat-white-edge', bg: 'cat-white', kind: 'non-text', use: "A white mark's edge" },
]

// ------------------------------------------------------------------------------------------------ names out

/** The CSS custom property of a role. A font role's family is `--es-font-<x>`; its metrics hang off it. */
export const cssVar = (name: RoleName) => `--es-${name}`
export const FONT_PARTS = ['size', 'leading', 'tracking', 'weight', 'case'] as const
export const fontVar = (name: RoleName, part: (typeof FONT_PARTS)[number]) => `--es-${name}-${part}`

/** Where a role lives in the Tailwind theme: the section and the key (its class is `<prefix>-<key>`). */
export function tailwindKey(name: RoleName): { section: string; key: string } {
  const role = roleOf(name)
  switch (role.kind) {
    case 'color':
      return { section: 'colors', key: name }
    case 'shadow':
      return { section: 'boxShadow', key: name.replace(/^shadow-/, '') }
    case 'texture':
      return { section: 'backgroundImage', key: name.replace(/^texture-/, '') }
    case 'duration':
      return { section: 'transitionDuration', key: name.replace(/^dur-/, '') }
    case 'easing':
      return { section: 'transitionTimingFunction', key: name.replace(/^ease-/, '') }
    case 'radius':
      return { section: 'borderRadius', key: name.replace(/^radius-/, '') }
    case 'space':
      return { section: 'spacing', key: name.replace(/^space-/, '') }
    case 'font':
      return { section: 'fontFamily', key: name.replace(/^font-/, '') }
  }
}

/** The Tailwind theme extension: every role as a key whose value is its CSS variable, never a literal. */
export function tailwindTheme() {
  const theme: Record<string, Record<string, unknown>> = {}
  for (const name of ROLE_NAMES) {
    const { section, key } = tailwindKey(name)
    theme[section] ??= {}
    theme[section][key] = `var(${cssVar(name)})`
    if (roleOf(name).kind === 'font') {
      theme.fontSize ??= {}
      theme.fontSize[key] = [
        `var(${fontVar(name, 'size')})`,
        {
          lineHeight: `var(${fontVar(name, 'leading')})`,
          letterSpacing: `var(${fontVar(name, 'tracking')})`,
          fontWeight: `var(${fontVar(name, 'weight')})`,
        },
      ]
    }
  }
  // Tailwind's preflight sets the root face from `sans`, and `font-mono` is its code face: both are the system's roles.
  theme.fontFamily.sans = `var(${cssVar('font-body')})`
  return theme
}

// ------------------------------------------------------------------------------------------------ tokens.css

/** A font role's family list as CSS: quoted names, bare generic families. */
export function fontStack(family: readonly string[]): string {
  const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-monospace', 'ui-sans-serif', 'ui-serif'])
  return family.map((name) => (generic.has(name) ? name : `'${name}'`)).join(', ')
}

/** A role's value in the light scheme, as its variable computes on the root: refs followed, a font as its stack. */
export function lightValue(name: RoleName): string {
  const role = roleOf(name)
  if (role.kind === 'color') return resolveColor(name as ColorRoleName)
  if (role.kind === 'font') return fontStack(role.family)
  return role.value
}

/** The declarations of one role in the light scheme: its variable, plus a font's metrics. */
function declarationsOf(name: RoleName): [string, string][] {
  const role = roleOf(name)
  if (role.kind === 'color') {
    return [[cssVar(name), typeof role.value === 'string' ? role.value : `var(${cssVar(role.value.ref as RoleName)})`]]
  }
  if (role.kind === 'font') {
    return [
      [cssVar(name), fontStack(role.family)],
      [fontVar(name, 'size'), role.size],
      [fontVar(name, 'leading'), role.leading],
      [fontVar(name, 'tracking'), role.tracking],
      [fontVar(name, 'weight'), String(role.weight)],
      [fontVar(name, 'case'), role.case],
    ]
  }
  return [[cssVar(name), role.value]]
}

/**
 * The forced-colors block: the only place a system colour may appear (scripts/verify-tokens.ts). Under Windows High
 * Contrast the system's colours replace the world's, and the roles that draw rings and edges follow them.
 */
const FORCED_COLORS: Partial<Record<ColorRoleName, string>> = {
  focus: 'Highlight',
  'lamp-ring': 'Highlight',
  lamp: 'Highlight',
  edge: 'CanvasText',
  'paper-rule': 'GrayText',
}

/** The whole of src/design/tokens.css, generated. */
export function tokensCss(): string {
  const block = (selector: string, declarations: [string, string][], indent = '') =>
    [`${indent}${selector} {`, ...declarations.map(([property, value]) => `${indent}  ${property}: ${value};`), `${indent}}`].join('\n')

  const durations = ROLE_NAMES.filter((name) => roleOf(name).kind === 'duration').map((name): [string, string] => [
    cssVar(name),
    REDUCED_MOTION_DURATION,
  ])
  const sections = [
    '/*',
    ' * Generated from src/design/tokens.ts by `bun scripts/verify-tokens.ts --write`. Edit tokens.ts, never this file:',
    ' * scripts/verify-tokens.ts fails when the two disagree.',
    ' */',
    '',
    block(':root', [['color-scheme', 'light'], ...ROLE_NAMES.flatMap(declarationsOf)]),
  ]
  for (const scheme of SCHEME_NAMES) {
    const { media, values } = SCHEMES[scheme]
    if (!media) continue
    const declarations = Object.entries(values).map(([name, value]): [string, string] => [cssVar(name as RoleName), value])
    sections.push('', `/* ${SCHEMES[scheme].label} */`, `@media ${media} {`, block(':root', declarations, '  '), '}')
  }
  sections.push(
    '',
    '/* Reduced motion: every duration is 0. Settings can force either answer with data-motion on the root (W0-T22). */',
    '@media (prefers-reduced-motion: reduce) {',
    block(":root:not([data-motion='full'])", durations, '  '),
    '}',
    block(":root[data-motion='reduce']", durations),
    '',
    '/* Forced colours: the system palette replaces the world; rings and edges follow it. */',
    '@media (forced-colors: active) {',
    block(
      ':root',
      Object.entries(FORCED_COLORS).map(([name, value]): [string, string] => [cssVar(name as RoleName), value as string]),
      '  ',
    ),
    '}',
    '',
  )
  return sections.join('\n')
}
