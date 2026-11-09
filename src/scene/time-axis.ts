/*
 * The time axis's arithmetic (ARCHITECTURE §6.4, `TimeAxis`): a window over the model's integer clock, ticks at round
 * steps, and where a time lies along the track.
 *
 * Time runs into the screen. The camera looks down -z, the present sits at the near end (z = 0) and history recedes (GAMES.md
 * §3, "3D scene"), so a time t lies at z = (t - now) × scale. The 3D track is one group whose offset follows `now`: when the clock advances,
 * the group slides back by the step, over the bell's duration, or in one step under reduced motion. The marks inside the
 * group never move, so a step costs one transform and not one per instance.
 *
 * The clock is the model's: integer µs, or the front page's synthetic ticks (D-048). The axis never converts between them.
 */

export type TimeUnit = 'µs' | 'ticks'

export interface TimeWindow {
  /** The earliest time shown. */
  readonly start: number
  /** The present: the time at the near end of the track. */
  readonly now: number
}

/** Scene units per unit of time along the track, and where the track's present sits. */
export interface TrackScale {
  readonly unitsPerTime: number
}

/** The z of time `t` in the track group's own frame: the group itself sits at z = -now × scale. */
export function trackZ(t: number, scale: TrackScale): number {
  return t * scale.unitsPerTime
}

/** Where the track group sits so that `now` lands at z = 0 and the past recedes down -z. */
export function trackOffset(now: number, scale: TrackScale): number {
  return -now * scale.unitsPerTime
}

/** A round step for about `maxTicks` ticks over `span`: 1, 2 or 5 times a power of ten, and never below 1. */
export function niceStep(span: number, maxTicks: number): number {
  if (!(span > 0) || !(maxTicks >= 1)) return 1
  const raw = span / maxTicks
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * power).find((candidate) => candidate >= raw) ?? 10 * power
  return Math.max(1, Math.round(step))
}

/** The tick times inside the window, at round steps, earliest first. */
export function axisTicks(window: TimeWindow, maxTicks: number): number[] {
  const span = window.now - window.start
  if (!(span > 0)) return []
  const step = niceStep(span, maxTicks)
  const ticks: number[] = []
  for (let t = Math.ceil(window.start / step) * step; t <= window.now; t += step) ticks.push(t)
  return ticks
}

/** How long the track slides when the clock advances, in ms: the bell's duration, or nothing under reduced motion. */
export function scrollMs(bellMs: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : Math.max(0, bellMs)
}

/** A tick's label: the clock value with its unit, which the label layer prints in the numeral face. */
export function tickLabel(t: number, unit: TimeUnit): string {
  return unit === 'ticks' ? `${t}` : `${t} µs`
}
