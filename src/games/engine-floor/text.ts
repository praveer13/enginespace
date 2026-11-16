import type { READOUT_WORDS } from '@es/play/engine-floor/copy'
import type { FloorView } from '@es/play/engine-floor/types'

/*
 * The words of Request path's page that are not components: code spans, a mechanism in words, a permalink and the readout's counts. The
 * components that use them live in their own files, because a file that exports a component and a function cannot be hot-reloaded.
 */

// The words in a line live with the game's words (packages/play/engine-floor/words.ts), so the result's chunk reads them without this one.
export { handoffWords, permalink, plain, splitCode } from '@es/play/engine-floor/words'

/** The counts the readout strip shows: stages laid, process boundaries the laid path crosses, copies and syncs. */
export function readoutOf(view: FloorView): { id: keyof typeof READOUT_WORDS; value: number }[] {
  const laid = view.laid
  return [
    { id: 'laid', value: laid.length },
    { id: 'boundaries', value: laid.filter((stage) => stage.from.process !== stage.to.process).length },
    { id: 'copies', value: laid.filter((stage) => stage.mechanism === 'h2d' || stage.mechanism === 'd2h').length },
    { id: 'syncs', value: laid.filter((stage) => stage.mechanism === 'sync').length },
  ]
}
