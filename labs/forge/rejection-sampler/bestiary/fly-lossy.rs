//! Bestiary: a FLy-style lossy rule. vLLM ships FLy as an option that "is intentionally lossy" and "does not preserve the target
//! distribution" (claim vllm.spec.fly-lossy), and its documentation says it can defer a native rejection at a high-entropy position when
//! the following draft tokens remain aligned with native verification (the quote and its line are in packages/sim/spec/bestiary.ts, which
//! built the same stand-in for the model). This one does that and no more: when a plate is sent back at a flat target (no dish has half
//! of the weight) and the next plate would be kept, it keeps the sent-back plate and walks on, so the output drifts from p toward q.
//! It is the course's example of a loose acceptance rule and not FLy's algorithm, whose gate and window were not read for this model
//! [unverified]. The accept step, the residual and the walk are the reference's.
//! `round` must fail it (a flat target whose first plate p rules out, followed by a plate that is kept for sure, is kept anyway).
//! `accept`, `residual` and `pick` pass.

use crate::TOTAL;
use kslab::Rng;

/// How many of the next plates must all be kept for a send-back to be deferred.
const WINDOW: usize = 1;

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

/// No dish has half of the weight.
fn flat(d: &[u32]) -> bool {
    d.iter().all(|&w| w * 2 < TOTAL)
}

/// The coin of position `i`, drawn when it is first needed, in position order.
fn coin(coins: &mut Vec<u32>, rng: &mut Rng, q: &[Vec<u32>], draft: &[usize], i: usize) -> u32 {
    while coins.len() <= i {
        let k = coins.len();
        coins.push(rng.below(q[k][draft[k]] as usize) as u32);
    }
    coins[i]
}

pub fn verify(p: &[Vec<u32>], q: &[Vec<u32>], draft: &[usize], rng: &mut Rng) -> Vec<usize> {
    let mut coins: Vec<u32> = Vec::new();
    let mut out = Vec::with_capacity(draft.len() + 1);
    for (i, &x) in draft.iter().enumerate() {
        let u = coin(&mut coins, rng, q, draft, i);
        let mut kept = accept(p[i][x], q[i][x], u);
        // The mistake: a send-back at a flat target is deferred when the plates after it would be kept.
        if !kept && i + WINDOW < draft.len() && flat(&p[i]) {
            kept = true;
            for j in 1..=WINDOW {
                if !kept {
                    break;
                }
                let u = coin(&mut coins, rng, q, draft, i + j);
                kept = accept(p[i + j][draft[i + j]], q[i + j][draft[i + j]], u);
            }
        }
        if kept {
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
