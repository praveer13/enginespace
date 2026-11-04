/*
 * Type shim for src/lib/forge/run.ts, which imports `LabCheckDetail` and `LabRunV2` from '../ledger/types'.
 *
 * That module is kernelspace's evidence ledger v3, and enginespace re-implements the ledger (ARCHITECTURE section 7).
 * These three declarations are copied from kernelspace's src/lib/ledger/types.ts at d478f91, character for character:
 * `LabRunV2` needs `Provenance`, and `LabCheckDetail` is the other type `run.ts` names. `bun scripts/vendor-drift.ts
 * diff <sha>` compares them with the same declarations in a newer commit. The wrapper resolves `../ledger/types`
 * from `run.ts` to this file with `rootDirs` (VENDOR.md, "Type shims").
 */

/**
 * `proved` and `unseen` credit KCs at w=1.0; `lab-green`, `practice` and `assisted` at w<=0.3;
 * `field` marks field labs. Ledger v3 starts fresh (Addendum A1), so there is no `legacy` provenance.
 */
export type Provenance = 'proved' | 'unseen' | 'lab-green' | 'practice' | 'assisted' | 'field'

/** F1 (Wave 1): one check of a v2 run. */
export interface LabCheckDetail {
  id: string
  status: 'pass' | 'fail' | 'trap' | 'timeout'
  seed?: number
  fresh?: boolean
}

/** A Forge run reported through ABI v1 or v2 (F1). */
export interface LabRunV2 {
  labId: string
  /** Required check ids that passed in this run. */
  passed: string[]
  /** Required checks. */
  total: number
  abi: 1 | 2
  checks: LabCheckDetail[]
  seeds: 'fresh' | 'default'
  /** `unseen` only when `seeds` is fresh and every required check passed or had passed on fresh seeds (spec §12.4). */
  provenance: Extract<Provenance, 'lab-green' | 'unseen' | 'assisted'>
  wasmSha256?: string
  stage?: number
  ms?: number
}
