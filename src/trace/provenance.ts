/*
 * Where a tape's numbers come from, in the words the screen prints (PRODUCT.md "Evidence on Hand", WORLD §3.1, DESIGN.md "The Dots
 * For Numbers Rule"): a synthetic tape says so on its face and a captured one carries its GPU, its engine pin, its date and its hash.
 * A learner's own capture is measured on their device. Every ns the viewer prints is tagged with the result.
 */
import type { NumberTag } from '@/design/components/Readout'
import type { TraceMeta } from '@es/sim/trace'

export interface Provenance {
  /** The tag a Readout of this tape's ns prints. */
  readonly tag: NumberTag
  /** For a measured number: the date and hash, printed after the tag. */
  readonly source?: string
  /** A column head's one word: `synthetic` or `measured`. */
  readonly word: string
  /** The line under the title. */
  readonly line: string
}

export function provenanceOf(meta: TraceMeta): Provenance {
  if (meta.source === 'synthetic') {
    return { tag: 'synthetic', word: 'synthetic', line: 'A synthetic tape: the step-loop model with seeded jitter. It is not a measurement of any engine.' }
  }
  const date = meta.capturedAt === undefined ? 'undated' : meta.capturedAt.slice(0, 10)
  const hash = meta.sha256 === undefined ? null : meta.sha256.slice(0, 12)
  if (meta.source === 'learner') {
    return { tag: 'measured', source: `your capture, ${date}`, word: 'measured', line: `Your own capture, on your device, ${date}${hash === null ? '' : `, sha256 ${hash}`}. It never leaves it.` }
  }
  const engine = [meta.engine, meta.version].filter(Boolean).join(' ')
  const parts = [meta.gpu, engine === '' ? null : engine, `captured ${date}`, hash === null ? null : `sha256 ${hash}`].filter((part): part is string => part !== null && part !== undefined && part !== '')
  return { tag: 'measured', source: `${date}${hash === null ? '' : ` ${hash.slice(0, 8)}`}`, word: 'measured', line: `Captured: ${parts.join(' · ')}.` }
}
