import type { Draft } from '@es/ledger'
import type { GameMode, RunResult } from '@es/play'
// The log's text is packages/play/replay.ts's `encodeActions`, which is canonical JSON, and the ref is its `playRef`
// (tests/play/record.test.ts holds the two to them). Both are written from their parts here, by path: importing replay.ts would split it
// out of the front page's first paint into a chunk of its own, which costs that gated closure a file (D-023).
import { canonicalJson } from '@es/sim/core/json'

/*
 * What a finished game run writes to the ledger (ARCHITECTURE §6.3 and §7.2; ASSESSMENT §3.2 and §4.3): one `play` event. A game's own page
 * and a lesson's game block both record through here, so the same run writes the same event from either (W1b-T01); a lesson's carries
 * the lesson's content revision as well (A§4.2), which a game's page has none of. The front page records nothing (D-038) and never loads
 * this module.
 *
 *   ref         `play:<game>/<level>`
 *   score, ok   the grade the pure session gave the run; a cache, since the Evidence page grades the log again (packages/play/replay.ts)
 *   provenance  `unseen` for a graded run, whose seed was drawn when it started, and `practice` for a practice run, on the level's pinned
 *               seed or on new numbers (ASSESSMENT §3.2). The weight is applied when the ledger is read (A§7.3), and is never stored.
 *   seed, rev   the run's seed, and the lesson's revision when a lesson played it
 *   data        the action log as canonical JSON, which `storedRunOf` reads back for a replay, and its SHA-256 (ASSESSMENT §5.5)
 *
 * The ledger's own code loads with the first run that ends, not before, so a page that is only looked at never opens it.
 */

/** How a run of this mode is stamped. */
export const provenanceOf = (mode: GameMode): 'unseen' | 'practice' => (mode === 'graded' ? 'unseen' : 'practice')

/** The SHA-256 of a text's UTF-8 bytes, as lowercase hex. */
export type Hasher = (text: string) => Promise<string>

/**
 * The browser's own SHA-256 (`crypto.subtle`), so no library is added (A§14). A page has it only in a secure context: https, and this
 * machine's own addresses.
 */
export const sha256Text: Hasher = async (text) => {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) throw new Error('The browser hashes the run, as the record needs, only on a secure page: https, or this machine.')
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The event that records a run. The same run and mode make the same draft, wherever the run was played. */
export async function playDraft(result: RunResult, mode: GameMode, hash: Hasher = sha256Text): Promise<Draft<'play'>> {
  const { record, grade } = result
  const actions = canonicalJson(record.actions)
  return {
    kind: 'play',
    ref: `play:${record.game}/${record.level}`,
    score: grade.score,
    ok: grade.ok,
    provenance: provenanceOf(mode),
    seed: record.seed,
    ...(record.rev === undefined ? {} : { rev: record.rev }),
    data: { actions, actionsSha256: await hash(actions) },
  }
}

/** What became of a run: written, or why not. */
export type Recorded = { readonly ok: true } | { readonly ok: false; readonly detail: string }

/** Writes a run to the ledger. It never throws: a run that could not be written says why. */
export async function recordPlay(result: RunResult, mode: GameMode): Promise<Recorded> {
  try {
    const [draft, { appendEvidence }] = await Promise.all([playDraft(result, mode), import('@/evidence/useEvidence')])
    const written = await appendEvidence(draft)
    return written.ok ? { ok: true } : { ok: false, detail: written.detail }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}
