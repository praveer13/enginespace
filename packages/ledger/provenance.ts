/**
 * Provenance (ARCHITECTURE §7.3, D-024): how a graded result earned its place in the ledger, and what that place is worth.
 *
 * An event stores its provenance and never a weight. The weights below are ASSESSMENT.md §3.2's table, and whoever reads the
 * ledger applies them at read time, so changing a weight rewrites no history (kernelspace's rule). Nothing that writes,
 * merges or stores an event imports `PROVENANCE_WEIGHTS` or `weightOf`; tests/ledger/no-weight.test.ts reads the imports to
 * hold that line, and tests/ledger/provenance.test.ts reads A§7.3 and ASSESSMENT §3.2 so the names and the numbers cannot
 * drift from the documents.
 *
 * A§7.3 puts the table in `src/evidence/provenance.ts`. It lives here because the pure package and its tests need it too, and
 * D-024 asks for one module; a file in `src/evidence` can re-export it.
 *
 * Q-9 asks whether `gpu-verified` and `gpu-unverified`, which also cover the L lane (TR0 runs on a CPU), should become
 * `receipt-verified` and `receipt-unverified`. Its default is to keep the names, and so does this file. A name is stored in
 * every event that carries it, so a rename after the first receipt is written needs a schema version bump and a migration.
 */

/** A§7.3's seven names, in its order. */
export const PROVENANCES = ['unseen', 'proved', 'gpu-verified', 'practice', 'assisted', 'gpu-unverified', 'self-reported'] as const

export type Provenance = (typeof PROVENANCES)[number]

export function isProvenance(value: unknown): value is Provenance {
  return typeof value === 'string' && (PROVENANCES as readonly string[]).includes(value)
}

/**
 * What each provenance credits at read time (ASSESSMENT §3.2): 1.0 for full credit, 0.3 for partial, 0 for none. They are
 * kernelspace's values, carried over as a design choice [estimated], and ASSESSMENT.md owns them.
 */
export const PROVENANCE_WEIGHTS: Readonly<Record<Provenance, number>> = {
  unseen: 1,
  proved: 1,
  'gpu-verified': 1,
  practice: 0.3,
  assisted: 0.3,
  'gpu-unverified': 0,
  'self-reported': 0,
}

/** The weight of a provenance, for a reader that derives credit from events. */
export function weightOf(provenance: Provenance): number {
  return PROVENANCE_WEIGHTS[provenance]
}
