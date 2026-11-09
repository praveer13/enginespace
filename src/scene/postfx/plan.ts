/*
 * What post-processing a frame gets (ARCHITECTURE §6.5): decided here, with no three in it, so a test reads the budget and
 * the scene decides before the `postfx` chunk loads. The chunk itself (postfx.ts) is fetched only when a plan needs it.
 *
 *   T0, T1    no composer: the scene renders straight to the canvas, and the `postfx` chunk is never requested.
 *   T2, T3    the composer: the scene, then bloom at half resolution, then one final pass that tone-maps, encodes sRGB and
 *             runs FXAA. Bloom is the one effect pass, within T2's budget of one and T3's of two (A§6.6). FXAA rides in
 *             the final pass, which every composer needs anyway, so anti-aliasing costs no pass of its own.
 *
 * Bloom falls only on what glows: the heat lamps' housings. It switches off under `prefers-contrast: more` and forced
 * colours (A§6.5), and when the tier drops below 2. Its strength is a constant: nothing about an effect animates, so no
 * intensity changes faster than 3 Hz (WCAG 2.3.1). It turns on or off as a cut, at most once per tier change, and the
 * governor changes tiers at most once every 5 s.
 */
import { TIERS, type Tier } from '../tiers'

export type PassName = 'scene' | 'bloom' | 'final'

export interface PostFxPlan {
  /** Whether a composer runs at all. Without one the scene renders straight to the canvas. */
  readonly composer: boolean
  readonly bloom: boolean
  readonly fxaa: boolean
  /** The passes in order, the scene render first. */
  readonly passes: readonly PassName[]
  /** Effect passes beyond the scene render and the final pass: what A§6.6's "post passes" row counts. */
  readonly effectPasses: number
}

export interface PostFxFlags {
  readonly contrastMore: boolean
  readonly forcedColors: boolean
}

/** Bloom's constants [estimated]: a tight glow around the lamps' elements, set above the brightest lit paper, so nothing else blooms. */
export const BLOOM = { strength: 0.5, radius: 0.28, threshold: 2.4 } as const

export const NO_POSTFX: PostFxPlan = { composer: false, bloom: false, fxaa: false, passes: ['scene'], effectPasses: 0 }

export function postFxPlan(tier: Tier, flags: PostFxFlags): PostFxPlan {
  if (tier < 2) return NO_POSTFX
  const bloom = !flags.contrastMore && !flags.forcedColors && TIERS[tier].postPasses >= 1
  const fxaa = TIERS[tier].antialias === 'fxaa'
  if (!bloom && !fxaa) return NO_POSTFX
  const passes: PassName[] = ['scene', ...(bloom ? (['bloom'] as const) : []), 'final']
  return { composer: true, bloom, fxaa, passes, effectPasses: bloom ? 1 : 0 }
}

/** A plan's identity as a string, so a scene re-creates its composer only when the plan itself changes. */
export function planId(plan: PostFxPlan): string {
  return plan.composer ? `${plan.bloom ? 'bloom' : 'plain'}+${plan.fxaa ? 'fxaa' : 'none'}` : 'none'
}

/** The plan a `planId` names. */
export function planFromId(id: string): PostFxPlan {
  if (id === 'none') return NO_POSTFX
  const bloom = id.startsWith('bloom')
  const fxaa = id.endsWith('fxaa')
  return { composer: true, bloom, fxaa, passes: ['scene', ...(bloom ? (['bloom'] as const) : []), 'final'], effectPasses: bloom ? 1 : 0 }
}
