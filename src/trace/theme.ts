/*
 * The tape's colours, taken from the token roles (ARCHITECTURE §6.4, `scene-tokens.ts`). The canvas cannot read a stylesheet, so the
 * painter is handed these resolved values and never names a colour of its own: this file only says which role each mark takes.
 *
 * The categorical code is the only colour code (DESIGN.md, "The Only Code Rule"), so a span takes the lane role of its kind of work
 * (the expo blue, the line green, the dumbwaiter brown, "Heard!" yellow) and a mark takes the lane role of the category it names.
 * Yellow and white marks carry their edge colour, because neither stands alone on paper. The heat lamp is the cursor's alone.
 */
import { slotOf } from '@/design/tokens'
import type { ColorRoleName, Slot } from '@/design/tokens'
import type { SceneRoles } from '@/design/scene-tokens'
import type { Category } from './marks'
import type { SpanStyle } from './model'

export interface Ink {
  readonly fill: string
  readonly edge: string
}

export interface TapeTheme {
  readonly paper: string
  readonly paperRule: string
  readonly paperInk: string
  readonly edge: string
  /** The steel under the paper: the holes show it. */
  readonly steel: string
  readonly steelDeep: string
  readonly lamp: string
  readonly lampRing: string
  readonly tape: string
  readonly tapeInk: string
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

/** The role a mark's category takes. A CPU gap is the expo's colour: the line waits on the expo. */
export const CATEGORY_ROLE: Readonly<Record<Category, ColorRoleName>> = {
  kernel: 'lane-gpu',
  copy: 'lane-copy',
  'cpu-gap': 'lane-cpu',
  'both-idle': 'lane-idle',
}

/** The slot a role stands for, which names its glyph and its edge. */
export const slotOfRole = (role: ColorRoleName): Slot => slotOf(role) ?? 'white'

const edgeRole = (role: ColorRoleName): ColorRoleName => `cat-${slotOfRole(role)}-edge` as ColorRoleName

export function tapeTheme(roles: SceneRoles): TapeTheme {
  const ink = (role: ColorRoleName): Ink => ({ fill: roles[role], edge: roles[edgeRole(role)] })
  const styles = Object.fromEntries((Object.keys(STYLE_ROLE) as SpanStyle[]).map((style) => [style, ink(STYLE_ROLE[style])])) as Record<SpanStyle, Ink>
  // A note is an outline in the neutral edge, not in the white board's.
  styles.note = { fill: roles['lane-idle'], edge: roles.edge }
  const categories = Object.fromEntries((Object.keys(CATEGORY_ROLE) as Category[]).map((c) => [c, ink(CATEGORY_ROLE[c])])) as Record<Category, Ink>
  return {
    paper: roles.paper,
    paperRule: roles['paper-rule'],
    paperInk: roles['paper-ink'],
    edge: roles.edge,
    steel: roles['surface-2'],
    steelDeep: roles['surface-3'],
    lamp: roles.lamp,
    lampRing: roles['lamp-ring'],
    tape: roles.tape,
    tapeInk: roles['tape-ink'],
    styles,
    categories,
  }
}

/** A colour at a share of its strength over what is under it: CSS's `color-mix`, which the canvas parses as the page does. */
export const wash = (color: string, percent: number): string => `color-mix(in srgb, ${color} ${percent}%, transparent)`
