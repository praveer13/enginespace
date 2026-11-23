import type { Draft, IsoInstant } from '@es/ledger'
import type { Hasher, ProveStamp, Recorded } from './record'

// This module imports nothing at run time: the frame fetches it with a dynamic import, and a static import of another chunk would put that
// chunk's name in the page's own preload list, which every game's page carries (the bundle rows). The few lines it shares with record.ts are
// written again here, and tests/play/prove.test.ts holds the two to each other.

/** The browser's own SHA-256, as record.ts's `sha256Text`. */
const sha256Text: Hasher = async (text) => {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) throw new Error('The browser hashes the run, as the record needs, only on a secure page: https, or this machine.')
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The canonical JSON of an empty log (packages/sim/core/json.ts). */
const NO_ACTIONS = '[]'

/*
 * A run left before its end, as the ledger holds it (W2b-T78). It is its own module, fetched when a graded run is on a page with a ledger and
 * when a Prove attempt is left, so that the code every game's page carries (record.ts, the frame) does not grow by it.
 */

/**
 * A run that was left before its end (W2b-T78): a reload, the page closed, a restart, Leave Prove mode, or a second tab that found a Prove
 * attempt's open record lapsed. It is a `play` event of the level with `data.left` set to the instant the run began, a score of 0 and a
 * miss, so that the export shows the attempt. Its log is `[]`: a run that did not end is not replayed, and the Evidence page reads it as
 * left (src/evidence/rows.ts). A graded run outside Prove mode is stamped `unseen`, as it would have been, and no window applies to it;
 * a Prove attempt that counted is stamped `proved`, as a miss is, and opens the 24 hours as a miss does (src/prove/window.ts).
 */
export interface LeftRun {
  readonly game: string
  readonly level: string
  /** When the run began, as `toISOString` writes it. */
  readonly began: IsoInstant
  readonly seed?: number
  readonly rev?: string
  readonly prove?: ProveStamp
}

/**
 * Watches a graded run for being left: when the page goes (`pagehide`) or the run is taken away (the returned function, which the frame calls
 * when it unmounts), a run that `live` says has had a move and has not ended is written as left, once.
 */
export function guardLeft(live: () => boolean, run: Omit<LeftRun, 'began'>): () => void {
  const began = new Date().toISOString()
  let sent = false
  const leave = () => {
    if (sent || !live()) return
    sent = true
    void recordLeft({ ...run, began })
  }
  window.addEventListener('pagehide', leave)
  return () => {
    window.removeEventListener('pagehide', leave)
    leave()
  }
}

/** The event that records a run left before its end. */
export async function leftDraft(run: LeftRun, hash: Hasher = sha256Text): Promise<Draft<'play'>> {
  return {
    kind: 'play',
    ref: `play:${run.game}/${run.level}`,
    score: 0,
    ok: false,
    provenance: run.prove === undefined ? 'unseen' : run.prove.counts ? 'proved' : 'practice',
    ...(run.seed === undefined ? {} : { seed: run.seed }),
    ...(run.rev === undefined ? {} : { rev: run.rev }),
    data: { actions: NO_ACTIONS, actionsSha256: await hash(NO_ACTIONS), left: run.began },
  }
}

/** Writes a run that was left. It never throws. */
export async function recordLeft(run: LeftRun): Promise<Recorded> {
  try {
    const [draft, { appendEvidence }] = await Promise.all([leftDraft(run), import('@/evidence/useEvidence')])
    const written = await appendEvidence(draft)
    return written.ok ? { ok: true } : { ok: false, detail: written.detail }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}
