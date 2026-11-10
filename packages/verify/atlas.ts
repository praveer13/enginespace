/**
 * The hardware atlas as rule 9 reads it (ARCHITECTURE §8.5 rule 9, ASSESSMENT §6.4; W2-T09 wrote the claims it comes from): for each GPU that a learner
 * owns or rents, the name that NVML reports for it, the peak memory bandwidth, and the highest dense Tensor Core peak of any precision.
 *
 * This package does not read `content/` (A§2.3), so the page gives it the table as data (src/receipts/atlas.ts, which tests/receipts/atlas.test.ts
 * holds to the claims, number for number). The GPU is found by its name, exactly: "NVIDIA H100 NVL" is not "NVIDIA H100 80GB HBM3", and a name that
 * no entry holds has no floors. The rule says so and does not guess (content/claims/README.md, "Finding a GPU by its name").
 *
 * Every figure is a vendor's peak, so a floor made from one never binds an honest run: no kernel moves bytes faster than the pins of the memory can,
 * and no run reaches a peak. What can make a floor too strict is the other side of the division, the bytes, and `READ_PERMILLE` below deals with it.
 */

/** One GPU of the atlas. */
export interface AtlasEntry {
  /** The name NVML reports, which NVIDIA's driver lists the GPU under. */
  readonly name: string
  /** The peak memory bandwidth in GB/s (10^9 bytes per second), as NVIDIA states it. */
  readonly bandwidthGBps: number
  /** The highest dense Tensor Core peak of any precision, in TFLOPS (10^12 operations per second). */
  readonly peakTflops: number
}

export type Atlas = readonly AtlasEntry[]

/**
 * The share of a model's weight bytes that one forward is taken to read, in permille [estimated]. A decode step streams every weight once, but an input
 * embedding that is not tied to the output head is gathered by token and never streamed, so a floor made from the whole file would be too strict
 * for a model that has one. Reading four fifths of the file is a conservative lower bound for a dense model; a mixture of experts reads far less at a
 * small batch, and a lab that serves one declares its own share (`StageDeclaration.readPermille`).
 */
export const READ_PERMILLE = 800

/**
 * A margin on the compute peak, in permille [estimated]. The vendors' whitepapers state peaks at the boost clock they list, and whether a GeForce or an
 * RTX PRO card can run above that clock is not stated in the documents the atlas was read from [unverified], so a ceiling made from a peak allows a
 * quarter more.
 */
export const PEAK_MARGIN_PERMILLE = 1250

/** The entry for a GPU name, or undefined. The match is exact. */
export function findGpu(atlas: Atlas, name: string): AtlasEntry | undefined {
  return atlas.find((entry) => entry.name === name)
}

/** What the GPUs of a run are to the floors: the sum of their bandwidths and of their peaks, or the names that the atlas lacks. */
export type Gpus =
  | { readonly ok: true; readonly count: number; readonly bandwidthGBps: number; readonly peakTflops: number }
  | { readonly ok: false; readonly missing: readonly string[]; readonly count: number }

/**
 * The atlas's figures for the GPUs a receipt names, summed. A run on several GPUs reads its weights from all of them at once, so the bandwidths add
 * (perfect tensor or pipeline parallelism, the most any split can do, which keeps a floor from the sum safe). A GPU the atlas lacks makes the whole
 * answer `ok: false`, with its name, once: a floor needs every GPU.
 */
export function gpusOf(atlas: Atlas, names: readonly string[]): Gpus {
  const missing = [...new Set(names.filter((name) => findGpu(atlas, name) === undefined))]
  if (missing.length > 0 || names.length === 0) return { ok: false, missing, count: names.length }
  let bandwidthGBps = 0
  let peakTflops = 0
  for (const name of names) {
    const entry = findGpu(atlas, name)
    bandwidthGBps += entry?.bandwidthGBps ?? 0
    peakTflops += entry?.peakTflops ?? 0
  }
  return { ok: true, count: names.length, bandwidthGBps, peakTflops }
}

/**
 * The least time a forward takes to read its weights, in ns (P1): `bytes` over the bandwidth, rounded down. GB/s is bytes per ns, so the quotient is in
 * ns, and a floor rounded down is never above the exact one.
 */
export function readFloorNs(weightBytes: number, readPermille: number, bandwidthGBps: number): number {
  return Math.floor((weightBytes * readPermille) / 1000 / bandwidthGBps)
}
