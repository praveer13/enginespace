/*
 * What each part of a prop is made of (scene kit v1): a tone names a material of the kitchen, and the palette turns it into a
 * surface, a colour and the surface's per-vertex numbers. Every colour is a role from scene-tokens.ts (`tokens.materials.props`);
 * the factors below only darken a role, as cast iron is the deep steel's role in shadow [estimated].
 *
 * Glow is the heat lamp's amber and is the active state alone (DESIGN.md, One Lamp): a lit station's element, a lamp's bulb, the heat
 * strip over the pass. Each glowing part follows a channel, and a static set lights its channels by a mask, so a fire changes a
 * uniform and never a geometry. The hood's tubes glow too, in the tubes' white, below bloom's threshold, on a channel always lit.
 */
import { Color } from 'three'
import type { SceneTokens } from '@/design/scene-tokens'
import type { Part, Surface, Vec3 } from './shape'
import type { BufferGeometry } from 'three'

export type Tone =
  | 'steel'
  | 'shaded'
  | 'deep'
  | 'alu'
  | 'chrome'
  | 'polished'
  | 'turned'
  | 'iron'
  | 'griddle'
  | 'knob'
  | 'ceramic'
  | 'oil'
  | 'paper'
  | 'tile'
  | 'floor'

/**
 * How a tone is drawn: its surface, the role it takes its colour from, how much darker than the role, and its numbers. A metal's
 * numbers are a finish of PROP_PARAMS; a ceramic's are [roughness ×, clearcoat ×, 0], so bakelite, oil and a paper roll share the
 * glaze's draw and differ in their sheen.
 */
interface ToneSpec {
  readonly surface: Surface
  readonly role: keyof SceneTokens['materials']['props']
  readonly shade: number
  readonly finish: 'brushed' | 'spun' | 'chrome' | 'iron' | 'griddle' | Vec3
}

/** The tones [estimated]: darkening factors and finishes chosen on the /design specimens. */
const TONES: Readonly<Record<Tone, ToneSpec>> = {
  steel: { surface: 'metal', role: 'steel', shade: 1, finish: 'brushed' },
  shaded: { surface: 'metal', role: 'steelShaded', shade: 1, finish: 'brushed' },
  deep: { surface: 'metal', role: 'steelDeep', shade: 1, finish: 'brushed' },
  alu: { surface: 'metal', role: 'steel', shade: 0.98, finish: 'spun' },
  chrome: { surface: 'metal', role: 'steel', shade: 1, finish: 'chrome' },
  // The bell's dome: chrome polished even, with no grain. Mirrored as sharply as the chrome finish mirrors, the dim room drew the tubes as
  // hard white stripes on a grey body, an emblem on a mouse (W1b's finish review of the lesson blocks, rounds 1 and 2); this rough, the
  // room's reflection blurs, so the tubes overhead merge into one soft highlight that rolls over the crown, and the body reads bright.
  polished: { surface: 'metal', role: 'steel', shade: 1, finish: [0.3, 0, 1] },
  // The bell's base: shaded steel turned on the lathe, a shade toward deep steel, so a lit dome stands on deep steel and not on black.
  turned: { surface: 'metal', role: 'steelShaded', shade: 0.55, finish: 'spun' },
  iron: { surface: 'metal', role: 'iron', shade: 0.36, finish: 'iron' },
  griddle: { surface: 'metal', role: 'iron', shade: 0.55, finish: 'griddle' },
  knob: { surface: 'ceramic', role: 'iron', shade: 0.2, finish: [1.6, 0.5, 0] },
  ceramic: { surface: 'ceramic', role: 'ceramic', shade: 1, finish: [1, 1, 0] },
  oil: { surface: 'ceramic', role: 'iron', shade: 0.28, finish: [0.4, 1, 0] },
  paper: { surface: 'ceramic', role: 'paper', shade: 0.97, finish: [4.5, 0, 0] },
  tile: { surface: 'tile', role: 'tile', shade: 1, finish: [1, 1, 1] },
  floor: { surface: 'floor', role: 'floor', shade: 0.72, finish: [1, 1, 1] },
}

/** The channels that are not a station's: a lamp's bulb, the pass's heat strip, and the hood's tubes, which are always lit. */
export const CHANNEL = { lamp: 28, strip: 29, tube: 30 } as const
/** A station's channel is its index on the line, from 0. */
export const MAX_STATIONS = 28

export interface Palette {
  /** The colour of a tone: the one `Color` that every part in that tone shares. */
  colorOf(tone: Tone): Color
  /** A part in a tone: the surface it is drawn in, its colour and its numbers. */
  part(geometry: BufferGeometry, tone: Tone): Part
  /** A glowing part on a channel, `strength` of the full glow. Tube light takes the tubes' white; every other channel the lamp's amber. */
  glow(geometry: BufferGeometry, channel: number, strength?: number): Part
  readonly finishes: Readonly<Record<Exclude<ToneSpec['finish'], Vec3>, Vec3>>
}

export function paletteFrom(tokens: SceneTokens): Palette {
  const inputs = tokens.materials.props
  const finishes = tokens.materials.propParams.finishes
  const colors = new Map<Tone, Color>()
  const colorOf = (tone: Tone) => {
    let color = colors.get(tone)
    if (!color) {
      const spec = TONES[tone]
      color = new Color(inputs[spec.role]).multiplyScalar(spec.shade)
      colors.set(tone, color)
    }
    return color
  }
  const lamp = new Color(inputs.glow)
  const tube = new Color(inputs.tube)
  // The tubes are light, but not the present: they glow below bloom's threshold, at their own share of the lamp's glow.
  const params = tokens.materials.propParams
  const tubeShare = params.tube.emissiveIntensity / params.glow.emissiveIntensity
  return {
    finishes,
    colorOf,
    part(geometry, tone) {
      const spec = TONES[tone]
      return { geometry, surface: spec.surface, color: colorOf(tone), finish: typeof spec.finish === 'string' ? finishes[spec.finish] : spec.finish }
    },
    glow(geometry, channel, strength = 1) {
      const isTube = channel === CHANNEL.tube
      return { geometry, surface: 'glow', color: isTube ? tube : lamp, finish: [channel, isTube ? strength * tubeShare : strength, 0] }
    },
  }
}
