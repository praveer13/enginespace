/*
 * The diagram's colours, taken from the token roles (ARCHITECTURE §6.4, `scene-tokens.ts`). The canvas cannot read a stylesheet, so the
 * painter is handed these resolved values and never names a colour of its own: this file only says which role each mark takes.
 *
 * The one colour code is the only code (REDESIGN 2.8, the Colour Is State Rule): a span takes the lane role of its kind of work (blue
 * for the CPU, green for the GPU, brown for a copy, yellow for a sync, white for a note) and a mark takes the lane role of the category
 * it names. Each carries the code's glyph, drawn in the span's own ink, and yellow and white carry their edge, because neither stands
 * alone on paper. Amber is the cursor's alone (the One Marker Rule).
 */
import { slotOf } from '@/design/tokens'
import type { ColorRoleName, Slot } from '@/design/tokens'
import { SLOT_MARKS } from '@/design/code'
import type { GlyphShape } from '@/design/code'
import type { SceneRoles } from '@/design/scene-tokens'
import type { Category } from './marks'
import type { SpanStyle } from './model'

export interface Ink {
  readonly fill: string
  readonly edge: string
  /** What reads on the fill: the glyph's colour. */
  readonly ink: string
  /** The code's glyph for this colour. */
  readonly glyph: GlyphShape
}

export interface TapeTheme {
  readonly paper: string
  readonly paperRule: string
  readonly paperInk: string
  readonly edge: string
  /** The label column beside the paper. */
  readonly gutter: string
  /** The marker: amber, and its edge. */
  readonly lamp: string
  readonly lampRing: string
  /** A slip's ground under a mark being made. */
  readonly well: string
  readonly styles: Readonly<Record<SpanStyle, Ink>>
  readonly categories: Readonly<Record<Category, Ink>>
}

/** The role a span style takes: the lane of its work. */
export const STYLE_ROLE: Readonly<Record<SpanStyle, ColorRoleName>> = {
  frame: 'lane-cpu',
  launch: 'lane-cpu',
  kernel: 'lane-gpu',
  copy: 'lane-copy',
  sync: 'lane-sync',
  note: 'lane-idle',
}

/** The role a mark's category takes. A CPU gap is the CPU's colour: the GPU waits on the CPU. */
export const CATEGORY_ROLE: Readonly<Record<Category, ColorRoleName>> = {
  kernel: 'lane-gpu',
  copy: 'lane-copy',
  'cpu-gap': 'lane-cpu',
  'both-idle': 'lane-idle',
}

/** The slot a role stands for, which names its glyph and its edge. */
export const slotOfRole = (role: ColorRoleName): Slot => slotOf(role) ?? 'white'

const edgeRole = (role: ColorRoleName): ColorRoleName => `cat-${slotOfRole(role)}-edge` as ColorRoleName
const inkRole = (role: ColorRoleName): ColorRoleName => `cat-${slotOfRole(role)}-ink` as ColorRoleName

export function tapeTheme(roles: SceneRoles): TapeTheme {
  const ink = (role: ColorRoleName): Ink => ({ fill: roles[role], edge: roles[edgeRole(role)], ink: roles[inkRole(role)], glyph: SLOT_MARKS[slotOfRole(role)].glyph })
  const styles = Object.fromEntries((Object.keys(STYLE_ROLE) as SpanStyle[]).map((style) => [style, ink(STYLE_ROLE[style])])) as Record<SpanStyle, Ink>
  // A note is an outline in the neutral edge, not in the white board's.
  styles.note = { ...styles.note, edge: roles.edge }
  const categories = Object.fromEntries((Object.keys(CATEGORY_ROLE) as Category[]).map((c) => [c, ink(CATEGORY_ROLE[c])])) as Record<Category, Ink>
  return {
    paper: roles.paper,
    paperRule: roles['paper-rule'],
    paperInk: roles['paper-ink'],
    edge: roles.edge,
    gutter: roles['surface-1'],
    lamp: roles.lamp,
    lampRing: roles['lamp-ring'],
    well: roles['surface-2'],
    styles,
    categories,
  }
}

/** A colour at a share of its strength over what is under it: CSS's `color-mix`, which the canvas parses as the page does. */
export const wash = (color: string, percent: number): string => `color-mix(in srgb, ${color} ${percent}%, transparent)`
