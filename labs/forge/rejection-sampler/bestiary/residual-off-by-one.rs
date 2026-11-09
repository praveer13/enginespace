//! Bestiary: an off-by-one in the residual. The excess of each dish is written one place along, wrapping at the end of the vocabulary: a
//! 1-based position taken for a 0-based one. The plates are kept as they should be, and the walk over the weights is right, so the dish
//! that replaces a plate is the one after the dish it should be.
//! `residual`, `round` and `exact` must fail it. `accept` and `pick` are the reference's and pass.

use crate::TOTAL;
use kslab::Rng;

pub fn accept(px: u32, _qx: u32, u: u32) -> bool {
    u < px
}

pub fn residual(p: &[u32], q: &[u32]) -> Vec<u32> {
    // The mistake: the excess of dish x is written at x + 1, and the last dish's at 0.
    let n = p.len();
    let mut out = vec![0; n];
    for x in 0..n {
        out[(x + 1) % n] = p[x].saturating_sub(q[x]);
    }
    out
}

pub fn pick(weights: &[u32], draw: u32) -> usize {
    let mut running = 0;
    for (token, &weight) in weights.iter().enumerate() {
        running += weight;
        if draw < running {
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
