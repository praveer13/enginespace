/*
 * What the item block reads from a learner and shows of a seed: small pure functions, so that a test can hold them to a table
 * without a browser.
 */

/** The unit spellings a learner may type after a number: the printed unit, and the ASCII one for µ. */
function unitSpellings(unit: string): string[] {
  const ascii = unit.replace(/[µμ]/g, 'u')
  return [...new Set([unit, ascii].map((spelling) => spelling.toLowerCase()))]
}

/**
 * Reads a number from what was typed in a slip: `380`, `1,200`, `1 200` (thousands in groups of three), `0.5`, `-3`, a true minus, and the
 * number followed by the slip's own unit (`380 µs` or `380 us`). Anything else, including an empty slip, a word, two numbers and a unit that is not the
 * slip's, is not a number: null, so the block asks again instead of grading a guess at what was meant.
 */
export function parseNumber(input: string, unit?: string): number | null {
  let text = input.trim().replace(/[\u2212\u2013\u2014]/g, '-')
  if (unit !== undefined) {
    const lower = text.toLowerCase()
    const spelling = unitSpellings(unit).find((candidate) => lower.endsWith(candidate))
    if (spelling !== undefined) text = text.slice(0, text.length - spelling.length).trim()
  }
  // Thousands separators are a comma, a space, a thin space or an underscore, and only between groups of three digits: `1,200` and
  // `1 200` are twelve hundred, and `12 34` and `1,20` are no number. A comma is never a decimal point here.
  if (/[,_\s\u2009\u202f]/.test(text)) {
    if (!/^[+-]?\d{1,3}(?:[,_\u00a0\u2009\u202f ]\d{3})+(?:\.\d*)?$/.test(text)) return null
    text = text.replace(/[,_\u00a0\u2009\u202f ]/g, '')
  }
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/** A seed as it is printed on a ticket: eight capital hex digits, which is how a challenge token writes one too (A§8.4). */
export function seedLabel(seed: number): string {
  return seed.toString(16).toUpperCase().padStart(8, '0')
}

/** Reads a printed seed back. */
export function parseSeedLabel(label: string): number | null {
  return /^[0-9A-F]{8}$/.test(label) ? Number.parseInt(label, 16) : null
}

/** `count` uint32s of entropy from the browser, one for each item of an attempt: drawn when the attempt starts (A§8.2). */
export function freshEntropy(count: number): number[] {
  const values = new Uint32Array(count)
  crypto.getRandomValues(values)
  return Array.from(values)
}
