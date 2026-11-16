/*
 * Small helpers for the sentences that the rules write. A rule quotes names and messages that came out of a file someone else wrote, so
 * what it quotes is cut to a length first (limits.ts), and a count is written with its thousands separators so that it reads at a glance.
 */
import { PROBLEMS_SHOWN, PROBLEM_CHARS } from './limits'

/** `n` with its thousands separators, whichever locale the browser is in: `33,554,432`. */
export const grouped = (n: number): string => n.toLocaleString('en-US')

/** `n` and a noun, in the plural unless it is 1. A noun whose plural is not the noun and an `s` gives its plural. */
export const plural = (n: number, noun: string, many: string = `${noun}s`): string => `${grouped(n)} ${n === 1 ? noun : many}`

/** Text from a file, cut short with `...` when it is longer than `max`, so that one hostile name cannot fill the page. */
export function cut(text: unknown, max: number = 64): string {
  const shown = typeof text === 'string' ? text : String(text)
  return shown.length <= max ? shown : `${shown.slice(0, Math.max(0, max - 3))}...`
}

/** A problem as the report keeps it: one line, no longer than a result may hold. */
export const problem = (text: string): string => cut(text.replace(/\s+/g, ' '), PROBLEM_CHARS)

/** The first problems of a list, and a last line that counts the rest. */
export function firstProblems(all: readonly string[], shown: number = PROBLEMS_SHOWN): string[] {
  const kept = all.slice(0, shown).map(problem)
  const more = all.length - kept.length
  return more > 0 ? [...kept, `And ${plural(more, 'more problem')}.`] : kept
}

/** An instant in the sentence form the report uses: the date and the minute, in UTC, `2026-11-09 12:30 UTC`. */
export const when = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`
