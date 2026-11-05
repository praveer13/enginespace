import { MECHANISM_WORDS } from '@es/play/engine-floor/words'
import type { Mechanism, SourceRef } from '@es/sim/lifecycle'

/*
 * The words of Back of House's page that are not components: code spans, a hand-off in words, and a permalink. The components that use them
 * live in their own files, because a file that exports a component and a function cannot be hot-reloaded.
 */

/** The pieces of a text, alternating plain and code: the lifecycle model writes a symbol, a path or a place in backticks. */
export function splitCode(text: string): { code: boolean; text: string }[] {
  return text
    .split('`')
    .map((piece, index) => ({ code: index % 2 === 1, text: piece }))
    .filter((piece) => piece.text !== '')
}

/** The same line as plain words, for a live region or an accessible name: the backticks go, and the words stay. */
export const plain = (text: string): string => text.replaceAll('`', '')

/** A hand-off in words, the kitchen's and then the engine's: `spike · queue`. */
export const handoffWords = (mechanism: Mechanism): string => `${MECHANISM_WORDS[mechanism].kitchen} · ${mechanism}`

/** The permalink of a stage's line at the commit it is cited at (A§4.4, TR1's "every code reference is a pinned permalink"). */
export const permalink = (source: SourceRef): string => `https://github.com/${source.repo}/blob/${source.ref}/${source.path}#L${source.line}`
