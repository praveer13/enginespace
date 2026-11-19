/*
 * The design system's token roles and their values: Data Book (REDESIGN 2.8), the engine's own data book printed on
 * flat paper, with one amber mark that means now.
 *
 * This file is the one source. `bun scripts/verify-tokens.ts --write` generates src/design/tokens.css from it, Tailwind
 * reads `tailwindTheme()` (tailwind.config.ts), scenes read the resolved values through scene-tokens.ts, and
 * scripts/verify-tokens.ts checks all three agree, that no value is a placeholder, and that every declared pair meets
 * its ARCHITECTURE §11.2 threshold in every scheme the system ships.
 *
 * The roles: a flat ground and surfaces 0-3, paper with its two inks and its graticule, the marker (amber, with its
 * edge) for now alone, ink for focus, and six fills with their glyphs as the one colour code. Lane, memory, probability
 * and status roles point at that code: nothing gets a colour of its own. Role names are the system's contract, apart from the roles that were kitchen words
 * (marker, marker-edge, slip, slip-ink, light-ambient, dur-step, radius-control, size-control, font-readout); the ambient light is the 3D view's, and
 * nothing in the app draws the label slip now (DESIGN.md, Label slip).
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
  // The ground and the surfaces: flat paper greys with no texture (REDESIGN 2.8, the Flat Paper Rule).
  'surface-0': hex('material', '#e9ece6', 'The ground: the page, flat.'),
  'surface-1': hex('material', '#f4f5f0', 'A raised surface: the header and the frame round an instrument.'),
  'surface-2': hex('material', '#d9ddd4', 'A well: an empty slot, a pressed control, a selected row, the 3D base.'),
  'surface-3': hex('material', '#2b3138', 'The dark surface: the footer and a selected tab. Paper-white text sits on it.'),
  edge: hex('material', '#5f666d', "Hairlines, a control's boundary and dimension lines, at 3:1 (WCAG 1.4.11)."),
  // Paper and its two inks.
  paper: hex('material', '#fafaf6', 'Paper: everything read, and every diagram, is drawn on it.'),
  'paper-ink': hex('material', '#1d1b22', 'Ink on paper.'),
  'paper-ink-2': hex('material', '#a30f1a', 'The second ink: errors, "Not yet", "unverified". Never the colour of an action.'),
  'paper-rule': hex('material', '#c2c8bd', 'The graticule inside diagrams and figures, and a sheet\'s rules. Never the only carrier of anything.'),
  // The marker: amber means now, and only now (the One Marker Rule).
  marker: hex('material', '#ffb547', 'The marker: amber means now. The control to act on now, the "now" cursor, and the current position in a lesson\'s section list.'),
  'marker-edge': hex('material', '#9a3d00', "The marker's edge: amber never stands alone, it always comes with this edge, a shape and a word."),
  // Outside the type system's own roles: the 3D view takes its sky from the ambient light. Nothing in the app draws the label slip now: the broken
  // benchmark's sheets use the plain label, and only the retired Request path drawing's tests paint with it.
  slip: hex('material', '#e6d6ad', 'A pale slip for a label that needs one. Nothing in the app draws it now.'),
  'slip-ink': hex('material', '#1a1a1c', 'The words on a label slip.'),
  'light-ambient': hex('material', '#eef4f8', "The cool white of the 3D view's sky and key light. It colours no surface."),

  // Text on the ground, the surfaces and paper.
  'text-1': hex('text', '#17191d', 'Primary text. It is also the focus ring.'),
  'text-2': hex('text', '#3b4148', 'Secondary text: captions, the second line of a label.'),
  'text-3': hex('text', '#4b525a', 'Quiet text: placeholders and metadata.'),

  // Focus is ink, never amber, so focus is never mistaken for "now" (the Ink Focus Rule).
  focus: ref('focus', 'text-1', 'The focus ring: 3 px of ink at a 2 px offset, with a paper halo.'),

  // The one colour code. Each slot has its fill, an edge for outlines and text, and the ink that reads on the fill.
  'cat-red': hex('categorical', '#c8102e', 'Red, with the triangle: evicted; the residual (p - q)+; a violation.'),
  'cat-red-edge': hex('categorical', '#9b0d1a', "Red's edge: outlines, and text in the code's colour."),
  'cat-red-ink': ref('categorical', 'paper', 'Text on red.'),
  'cat-blue': hex('categorical', '#1b5faa', 'Blue, with the circle: CPU work; a page in use; the target p.'),
  'cat-blue-edge': hex('categorical', '#18509a', "Blue's edge."),
  'cat-blue-ink': ref('categorical', 'paper', 'Text on blue.'),
  'cat-yellow': hex('categorical', '#f5c400', 'Yellow, with the diamond: a sync; a cached page; the draft q. Too light to stand alone: its marks carry the edge.'),
  'cat-yellow-edge': hex('categorical', '#685000', "Yellow's edge."),
  'cat-yellow-ink': ref('categorical', 'paper-ink', 'Text on yellow.'),
  'cat-green': hex('categorical', '#237a37', 'Green, with the hexagon: GPU work; a page shared by a prefix hit; the accepted overlap min(p, q).'),
  'cat-green-edge': hex('categorical', '#185e2c', "Green's edge."),
  'cat-green-ink': ref('categorical', 'paper', 'Text on green.'),
  'cat-white': hex('categorical', '#f3f3ef', 'White, with the hollow ring: idle; free; observed. Its marks carry the edge.'),
  'cat-white-edge': hex('categorical', '#5f666d', "White's edge."),
  'cat-white-ink': ref('categorical', 'paper-ink', 'Text on white.'),
  'cat-brown': hex('categorical', '#7b4a26', "Brown, with the square: a copy between host and GPU; an adapter's page."),
  'cat-brown-edge': hex('categorical', '#5a361b', "Brown's edge."),
  'cat-brown-ink': ref('categorical', 'paper', 'Text on brown.'),

  // Status: the code's edges and the second ink, each with its glyph in the components.
  'status-ok': ref('status', 'cat-green-edge', 'A check passed.'),
  'status-warn': ref('status', 'cat-yellow-edge', 'Look before going on.'),
  'status-bad': ref('status', 'paper-ink-2', 'Something failed: in the second ink.'),
  'status-info': ref('status', 'cat-blue-edge', 'A note.'),

  // Lanes of the step loop's timing diagram.
  'lane-cpu': ref('lane', 'cat-blue', 'CPU work: the scheduler writing the next step and reading the results back.'),
  'lane-gpu': ref('lane', 'cat-green', 'GPU work, as a category beside the CPU lane: a code, never a state.'),
  'lane-sync': ref('lane', 'cat-yellow', 'A sync: the CPU waits for the GPU.'),
  'lane-copy': ref('lane', 'cat-brown', 'A copy between host and GPU.'),
  'lane-idle': ref('lane', 'cat-white', 'Idle: a bubble, drawn as a dashed hollow box.'),

  // Memory: the KV page pool.
  'memory-free': ref('memory', 'cat-white', 'A free page.'),
  'memory-used': ref('memory', 'cat-blue', "A page in use, held by a request's block table."),
  'memory-cached': ref('memory', 'cat-yellow', 'A cached page: its KV is still there, and no request holds it.'),
  'memory-shared': ref('memory', 'cat-green', 'A page shared by a prefix hit.'),
  'memory-adapter': ref('memory', 'cat-brown', "An adapter's page."),
  'memory-evicted': ref('memory', 'cat-red', 'An evicted page.'),

  // Probability: the rejection sampler.
  'probability-target': ref('probability', 'cat-blue', 'The target distribution p.'),
  'probability-draft': ref('probability', 'cat-yellow', 'The draft distribution q, and the excess q - p.'),
  'probability-overlap': ref('probability', 'cat-green', 'The accepted overlap min(p, q).'),
  'probability-residual': ref('probability', 'cat-red', 'The residual (p - q)+ that a rejection resamples from.'),
  'probability-observed': ref('probability', 'cat-white', 'What was observed: drawn hollow over the target.'),
} as const satisfies Record<string, ColorValue>

// ------------------------------------------------------------------------------------------------ the other roles

interface ShadowValue {
  kind: 'shadow'
  value: string
  note: string
}
/** Retired with the brushed grain (REDESIGN 2.8, the Flat Paper Rule): no role has this kind. The type stays for its readers. */
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
/** A step of the type-size ramp: a rem, or a clamp() for a fluid size. Every `font-size` in the system is one of these, or a documented one-off. */
interface SizeValue {
  kind: 'size'
  value: string
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
  /** Sentence case everywhere (REDESIGN 2.8): every role is 'none' (tests/design/flat.test.ts); the type keeps its old member. */
  case: 'none' | 'uppercase'
  note: string
}

const OTHERS = {
  // Depth: two shadows and no more (the Flat Paper Rule). Each has an offset and a soft blur, never a zero-offset halo.
  'shadow-paper': {
    kind: 'shadow',
    value: '0 1px 2px rgb(23 25 29 / 0.12), 0 6px 14px -8px rgb(23 25 29 / 0.28)',
    note: 'A sheet of paper on the ground.',
  },
  'shadow-lift': {
    kind: 'shadow',
    value: '0 2px 4px rgb(23 25 29 / 0.14), 0 16px 32px -12px rgb(23 25 29 / 0.36)',
    note: 'A popover over the page.',
  },

  // Motion: things move on an action and are still between actions (the Moves On Step Rule).
  'dur-quick': { kind: 'duration', value: '120ms', note: 'The hand: a press or a hover answering it.' },
  'dur-step': { kind: 'duration', value: '240ms', note: 'One step.' },
  'dur-feed': { kind: 'duration', value: '420ms', note: 'A marker settling on a new reading, such as the verifier\'s output line.' },
  'dur-settle': { kind: 'duration', value: '640ms', note: "The one authored moment of an instrument." },
  'ease-settle': { kind: 'easing', value: 'cubic-bezier(0.16, 1, 0.3, 1)', note: 'Exponential ease-out: fast away, long rest.' },
  'ease-strike': { kind: 'easing', value: 'cubic-bezier(0.19, 1, 0.22, 1)', note: 'A step that settles exponentially, with no overshoot.' },

  // Radii: paper is cut square, small parts take 2 px and controls 3 px.
  'radius-paper': { kind: 'radius', value: '0px', note: 'Paper is cut square: sheets, diagrams, fields.' },
  'radius-trim': { kind: 'radius', value: '2px', note: 'A small part: a stamp, a chip, a bar, a slot.' },
  'radius-control': { kind: 'radius', value: '3px', note: 'A control: a button, a switch, a menu.' },
  'radius-round': { kind: 'radius', value: '999px', note: 'A dot, a disc, a pill.' },

  // Spacing, on a 4 px step.
  'space-1': { kind: 'space', value: '0.25rem', note: 'Hairline gaps inside a mark.' },
  'space-2': { kind: 'space', value: '0.5rem', note: 'Inside a control.' },
  'space-3': { kind: 'space', value: '0.75rem', note: 'Between a label and its control.' },
  'space-4': { kind: 'space', value: '1rem', note: 'The gutter at phone width.' },
  'space-6': { kind: 'space', value: '1.5rem', note: 'Between items of a group, and inside a sheet.' },
  'space-8': { kind: 'space', value: '2rem', note: 'Inside a sheet at desktop width.' },
  'space-12': { kind: 'space', value: '3rem', note: 'Between groups.' },
  'space-16': { kind: 'space', value: '4rem', note: 'Above a section heading.' },
  'space-24': { kind: 'space', value: '6rem', note: 'Between sections at desktop width.' },

  // Type: three faces. Sentence case everywhere, never transformed to upper case, so vLLM, SGLang and v0.33.0 keep their casing.
  'font-display': {
    kind: 'font',
    family: ['Big Shoulders Display', 'sans-serif'],
    size: 'clamp(2rem, 1.2rem + 3.4vw, 3.5rem)',
    leading: '1',
    tracking: '0.005em',
    weight: 800,
    case: 'none',
    note: 'A page title: page, lesson and game titles only.',
  },
  'font-heading': {
    kind: 'font',
    family: ['Big Shoulders Display', 'sans-serif'],
    size: 'clamp(1.625rem, 1.3rem + 1.4vw, 2.25rem)',
    leading: '1.05',
    tracking: '0.005em',
    weight: 800,
    case: 'none',
    note: "A title one step under a page's: a game's title inside a lesson, a front-page section.",
  },
  'font-body': {
    kind: 'font',
    family: ['Atkinson Hyperlegible', 'sans-serif'],
    size: '1.0625rem',
    leading: '1.6',
    tracking: '0em',
    weight: 400,
    case: 'none',
    note: 'Reading, and section heads at 700: a face drawn for legibility, which tells l, I and 1 and O and 0 apart.',
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
    family: ['Atkinson Hyperlegible Mono', 'Atkinson Hyperlegible', 'monospace'],
    size: '1.125rem',
    leading: '1.25',
    tracking: '0em',
    weight: 500,
    case: 'none',
    note: 'Every number the learner compares, with tabular figures. Atkinson Hyperlegible carries µ and ±.',
  },
  'font-readout': {
    kind: 'font',
    family: ['Atkinson Hyperlegible Mono', 'Atkinson Hyperlegible', 'monospace'],
    size: '0.9375rem',
    leading: '1.45',
    tracking: '0em',
    weight: 400,
    case: 'none',
    note: "A readout strip's lines, and a sheet's numbered lines: terms and values in the mono face.",
  },
  'font-label': {
    kind: 'font',
    family: ['Atkinson Hyperlegible', 'sans-serif'],
    size: '0.875rem',
    leading: '1.25',
    tracking: '0em',
    weight: 700,
    case: 'none',
    note: 'A label: buttons, lane and axis names, the name of a part. Sentence case.',
  },

  // The size ramp: the sizes the type roles above leave to a component's own lines. Every `font-size` is a step of it, or a
  // documented one-off with its reason beside it. The mono, ticket and print sizes are `size-print`, the body size is
  // `size-body`, and the numeric size is `size-control`.
  'size-micro': { kind: 'size', value: '0.6875rem', note: 'Fine print: a label on a dense diagram at its floor.' },
  'size-stamp': { kind: 'size', value: '0.75rem', note: 'A stamp: a provenance tag, a chip.' },
  'size-caption': { kind: 'size', value: '0.8125rem', note: "A caption or a state word: under a figure, beside a switch, an axis's name." },
  'size-note': { kind: 'size', value: '0.875rem', note: "A note: a table heading, a label, a menu term." },
  'size-print': { kind: 'size', value: '0.9375rem', note: "A readout strip's line, a hint, an error. The mono size." },
  'size-base': { kind: 'size', value: '1rem', note: 'The root size: a footer link, a button.' },
  'size-body': { kind: 'size', value: '1.0625rem', note: 'Reading: the body size.' },
  'size-control': { kind: 'size', value: '1.125rem', note: 'A large button and a count: the numeric size.' },
  'size-title': { kind: 'size', value: '1.25rem', note: "A small section head, and a sheet's title." },
  'size-action': { kind: 'size', value: '1.375rem', note: 'A large label: the widest primary button.' },
  'size-large': { kind: 'size', value: '1.5rem', note: 'A section head, and a big readout.' },
  'size-count': { kind: 'size', value: 'clamp(2rem, 1.4rem + 2.4vw, 3rem)', note: 'The biggest count: an extra-large readout.' },
  'size-page': { kind: 'size', value: 'clamp(2rem, 1.2rem + 3.4vw, 3.5rem)', note: "A page's title, on every page that is not the front page." },
  'size-course': { kind: 'size', value: 'clamp(2.5rem, 1.8rem + 3vw, 4.5rem)', note: "The front page's section titles." },
} as const satisfies Record<string, ShadowValue | DurationValue | EasingValue | RadiusValue | SpaceValue | FontValue | SizeValue>

/** Every role: name to definition. */
export const ROLES = { ...COLORS, ...OTHERS }
export type RoleName = keyof typeof ROLES
export type ColorRoleName = keyof typeof COLORS
export type RoleKind = (typeof ROLES)[RoleName]['kind']
export type Role = ColorValue | ShadowValue | TextureValue | DurationValue | EasingValue | RadiusValue | SpaceValue | SizeValue | FontValue

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
  { id: 'motion', title: 'Motion', kinds: ['duration', 'easing'] },
  { id: 'radius', title: 'Radii', kinds: ['radius'] },
  { id: 'space', title: 'Spacing', kinds: ['space'] },
  { id: 'type', title: 'Type', kinds: ['font'] },
  { id: 'size', title: 'Type sizes', kinds: ['size'] },
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
 * The colour schemes the system ships. There is one light scheme, paper under daylight (D-050 says why there is no
 * dark one). `contrast-more` answers `prefers-contrast: more` by darkening the well, the quiet text, the edges, the
 * graticule and the marker's edge. Every declared pair is checked in both.
 */
export const SCHEMES = {
  light: { media: null, label: 'Light', values: {} },
  'contrast-more': {
    media: '(prefers-contrast: more)',
    label: 'More contrast',
    values: {
      'surface-2': '#cbd0c5',
      'text-2': '#272b30',
      'text-3': '#30353b',
      edge: '#3f454b',
      'paper-rule': '#717869',
      'marker-edge': '#7a2f00',
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
  ...pairs('text', 'Text on the ground, the surfaces and paper', ['text-1', 'text-2'], ['surface-0', 'surface-1', 'surface-2', 'paper']),
  ...pairs('text', 'Quiet text on the ground, the surfaces, a well and paper', ['text-3'], [...GROUNDS, 'surface-2']),
  ...pairs('text', 'Ink on paper, and the label of the amber button', ['paper-ink'], ['paper', 'marker']),
  ...pairs('text', 'Text on the marker: the primary button and the current position', ['text-1'], ['marker']),
  ...pairs('text', 'The second ink', ['paper-ink-2'], GROUNDS),
  ...pairs('text', 'The words on a label slip', ['slip-ink'], ['slip']),
  ...pairs('text', 'Paper-white text on the dark surface: the footer, a selected tab', ['paper'], ['surface-3']),
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
    "The focus ring, and the marker's edge on paper and on the marker",
    ['focus', 'marker-edge'],
    ['surface-0', 'surface-1', 'surface-2', 'paper', 'marker'],
  ),
  ...pairs('non-text', "A control's boundary, a hairline, a dimension line", ['edge'], [...GROUNDS, 'surface-2']),
  ...pairs('non-text', 'The dark surface as a mark: a switch that is on, a selected tab', ['surface-3'], ['surface-0', 'surface-1', 'surface-2', 'paper']),
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
    case 'size':
      // Whole name as the key (`text-size-print`): Tailwind's own `text-sm` and the rest keep their meaning.
      return { section: 'fontSize', key: name }
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
  'marker-edge': 'Highlight',
  marker: 'Highlight',
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
