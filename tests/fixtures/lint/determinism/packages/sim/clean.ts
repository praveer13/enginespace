// Control: the allowed side of every ban. verify:determinism must report nothing in this file.
export const isqrt = (n: number): number => Math.floor(Math.sqrt(n))
export const mix = (a: number, b: number): number => Math.imul(a, 31) + Math.max(a, b)
export const ordered = (xs: number[]): number[] => xs.sort((a, b) => a - b)
// A `window` that is a sliding window is no DOM global.
export const total = (window: number[]): number => window.reduce((sum, x) => sum + x, 0)
