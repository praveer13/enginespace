//! Bestiary: the boundary-inclusive comparison of SGLang PR #35798 (claims sglang.spec.pr-35798, sglang.spec.pr-35798-fix and
//! sglang.spec.pr-35798-interior). SGLang's tree sampler drew its coins from [0, 1) and chose the target CDF bucket with
//! `coin <= cumulative_probability`, so a coin of exactly 0 kept a draft token whose target probability was 0, and a coin that fell
//! exactly on a boundary of the CDF went to the bucket before it. In integers the same slip is `<=` where `<` is right, in two places:
//! the accept step (`u <= px`) and the walk over the weights (`draw <= running total`).
//!
//! Each slip moves a dish's probability by 1/65,536, which 20,000 draws do not show (packages/sim/spec/check.ts), so only the
//! coins can tell it: `accept` (one coin too many is kept) and `pick` (the boundary draws go to the dish before) must fail it.
//! `residual` is the reference's and passes. `round` and `exact` may or may not see it, and bestiary.json does not ask them to.

use crate::TOTAL;
use kslab::Rng;

pub fn accept(px: u32, _qx: u32, u: u32) -> bool {
    // The mistake: the boundary u == px is kept too, and with px == 0 the coin 0 keeps a dish that p rules out.
    u <= px
}

pub fn residual(p: &[u32], q: &[u32]) -> Vec<u32> {
    p.iter().zip(q).map(|(&px, &qx)| px.saturating_sub(qx)).collect()
}

pub fn pick(weights: &[u32], draw: u32) -> usize {
    let mut running = 0;
    for (token, &weight) in weights.iter().enumerate() {
        running += weight;
        // The mistake: a draw that lands on the running total goes to this dish and not to the next.
        if draw <= running {
            return token;
        }
    }
    weights.len() - 1
}

pub fn verify(p: &[Vec<u32>], q: &[Vec<u32>], draft: &[usize], rng: &mut Rng) -> Vec<usize> {
    let mut out = Vec::with_capacity(draft.len() + 1);
    for (i, &x) in draft.iter().enumerate() {
        let u = rng.below(q[i][x] as usize) as u32;
        if accept(p[i][x], q[i][x], u) {
            out.push(x);
            continue;
        }
        let excess = residual(&p[i], &q[i]);
        let total: u32 = excess.iter().sum();
        out.push(pick(&excess, rng.below(total as usize) as u32));
        return out;
    }
    out.push(pick(&p[draft.len()], rng.below(TOTAL as usize) as u32));
    out
}
