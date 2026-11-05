//! The reference verify step: what a finished src/verify.rs does. The `reference` and `solved` features build this file in its place.
//! No zip carries it (W1-T11), and the site never shows it.

use crate::TOTAL;
use kslab::Rng;

pub fn accept(px: u32, _qx: u32, u: u32) -> bool {
    u < px
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
