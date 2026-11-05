//! Bestiary: accept when p > q. The plate is kept exactly when p is bigger than q at its dish, and it takes no coin: a plate whose q is
//! at least its p is always sent back, so a dish the chef would send as often as the commis plates it never goes out.
//! `accept` and `round` must fail it. `residual` and `pick` are the reference's and pass.

use crate::TOTAL;
use kslab::Rng;

pub fn accept(px: u32, qx: u32, _u: u32) -> bool {
    // The mistake: the comparison of p with q, with no coin.
    px > qx
}

pub fn residual(p: &[u32], q: &[u32]) -> Vec<u32> {
    p.iter().zip(q).map(|(&px, &qx)| px.saturating_sub(qx)).collect()
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
