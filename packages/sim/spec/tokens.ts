// The acceptance-length model (ARCHITECTURE §5.5; Leviathan, Kalman and Matias 2023, arXiv 2211.17192; kernelspace's `push-luck`,
// `src/lib/world/fleet-ex/push-luck.ts` at d478f91).
//
// A round drafts γ tokens and accepts each with probability α, independently, until the first rejection. It then emits one more
// token of the target's own, a recovered one or the bonus, so it emits 1 + (the drafts accepted) tokens. The j-th draft is accepted
// only if the first j are, which has probability α^j, so the expected number of tokens is
//
//   E(γ) = 1 + α + α² + … + α^γ = (1 − α^(γ+1)) ÷ (1 − α).

/**
 * Tokens a round emits on average, for acceptance α = `alphaPermille` ÷ 1000 at every position and draft length `gamma`.
 *
 * It sums the terms by repeated multiplication, kernelspace's rule (`Math.pow` and `**` can differ in the last bit between engines),
 * so it gives the same bits in every engine: the operations are the IEEE 754 ones. The sum has no singularity at α = 1, where the
 * closed form divides by 0, and it equals the closed form to within rounding, about 1e-15 of its value [estimated].
 */
export function expectedTokensPerRound(alphaPermille: number, gamma: number): number {
  if (!Number.isInteger(alphaPermille) || alphaPermille < 0 || alphaPermille > 1000) {
    throw new RangeError(`alpha is an integer from 0 to 1000 permille, got ${alphaPermille}`)
  }
  if (!Number.isInteger(gamma) || gamma < 0) throw new RangeError(`the draft length is a non-negative integer, got ${gamma}`)
  const alpha = alphaPermille / 1000
  let term = 1
  let total = 1
  for (let j = 1; j <= gamma; j++) {
    term *= alpha
    total += term
  }
  return total
}
