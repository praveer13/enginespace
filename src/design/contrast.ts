/*
 * WCAG 2.2 contrast, for the declared pairs in tokens.ts (ARCHITECTURE §11.2). Pure: tokens.ts, the tests,
 * scripts/verify-tokens.ts and the /design page all compute ratios with this one function.
 */

/** An sRGB colour as 0-255 channels. */
export interface Rgb {
  r: number
  g: number
  b: number
}

/** Parses `#rgb` or `#rrggbb`. Token colours are written as hex so that contrast stays computable. */
export function parseHex(value: string): Rgb {
  const hex = value.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex)
  if (short) {
    const [r, g, b] = short.slice(1).map((digit) => Number.parseInt(digit + digit, 16))
    return { r, g, b }
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex)
  if (!long) throw new Error(`not a #rgb or #rrggbb colour: "${value}"`)
  const [r, g, b] = long.slice(1).map((pair) => Number.parseInt(pair, 16))
  return { r, g, b }
}

/** WCAG relative luminance of an sRGB colour (0 for black, 1 for white). */
export function luminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** The WCAG contrast ratio of two hex colours, from 1 to 21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** A ratio as WCAG writes it, rounded down so that a printed 4.50 never hides a 4.497. */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`
}
