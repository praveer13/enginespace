//! TODO(you): the verify step. This is the only file you edit.
//!
//! The commis, a junior cook, plates a run of courses ahead of you. In the engine the commis is the draft model: each plate is a drafted
//! token x, drawn from the commis's tastes `q`. You are the chef at the pass, and `p` says how often you would send each dish yourself.
//! What goes out must be exactly `p`, however the commis plates. That is the verify step of speculative decoding, and it is exact.
//!
//! Every weight in this lab is a whole number out of `TOTAL` = 65,536, and `p` and `q` add up to it, so a probability is a weight over
//! `TOTAL` and no step needs a float. A draw is a whole number too. Four functions, in the order the checks ask for them:
//!
//! ```text
//!   accept     keep a plate or send it back, from one coin
//!   residual   what the chef re-plates from: where p is bigger than q
//!   pick       a draw picks a dish from a list of weights
//!   verify     one round: walk the run, stop at the first plate sent back, and finish it
//! ```
//!
//! The rule, in integers:
//!
//!   * **Keep or send back.** For the plate x, draw a coin `u`, uniform in `0..q[x]`, and keep the plate when `u < p[x]`. That keeps it
//!     with probability min(1, p[x] / q[x]): all `q[x]` coins when p is at least q, and `p[x]` of them when it is less.
//!   * **Re-plate.** At the first plate you send back, the round stops. The dish that replaces it is picked from the residual
//!     (p − q)⁺: the weight of each dish x is `max(0, p[x] − q[x])`, the dishes the commis under-plates, and a draw uniform in
//!     `0..(the residual's total)` picks one. A plate was sent back only where q is bigger than p, so the residual is never empty then.
//!   * **The extra course.** If every plate is kept, you plate one more course yourself, the bonus, picked from `p` after the last draft
//!     by a draw uniform in `0..TOTAL`.
//!
//! The round emits the plates it kept and then one more, the re-plate or the bonus, so it emits between 1 and γ + 1 tokens for γ drafts.
//!
//! Build it when the checks are green on your machine:
//!
//! ```text
//!   cargo test
//!   cargo build --release --target wasm32-unknown-unknown
//! ```
//!
//! then drop `target/wasm32-unknown-unknown/release/rejection_sampler.wasm` on the lab's page.

// Remove this line when you use the arguments and the imports.
#![allow(unused_variables, unused_imports)]

use crate::TOTAL;
use kslab::Rng;

/// Is the drafted plate kept?
///
/// `px` and `qx` are the weights that p and q give the drafted token x (out of `TOTAL`), and `u` is the coin: uniform in `0..qx`.
/// Keep the plate for exactly `min(px, qx)` of the `qx` coins. `qx` is there for a rule that needs it.
pub fn accept(px: u32, qx: u32, u: u32) -> bool {
    todo!("keep a plate: true for exactly min(px, qx) of the qx coins u in 0..qx")
}

/// The residual (p − q)⁺: for every dish, how much more the chef would send than the commis plates, and 0 where the commis plates
/// at least as often as the chef. The lists are one weight per token, and the answer is a list of the same length.
pub fn residual(p: &[u32], q: &[u32]) -> Vec<u32> {
    todo!("re-plate from the excess: max(0, p[x] - q[x]) for every token x (mind that a u32 cannot go below 0)")
}

/// The token that `draw` picks from `weights`: the first token whose running total passes the draw. `draw` is uniform in
/// `0..(the sum of the weights)`, so every token is picked by exactly as many draws as its weight, and a token of weight 0 is never picked.
pub fn pick(weights: &[u32], draw: u32) -> usize {
    todo!("walk the weights, keeping a running total, and return the token where the total first goes past the draw")
}

/// One round of the verify step.
///
/// `draft[i]` is the token the commis plated at position i, drawn from `q[i]`. `p` has one distribution more than `draft` has tokens:
/// `p[i]` is the chef's tasting at position i, and `p[draft.len()]` is the one after the last draft, for the bonus. Every distribution
/// is a list of weights, one per token, that adds up to `TOTAL`.
///
/// Walk the drafts in order. For each one draw a coin from `rng` (`rng.below(n)` is uniform in `0..n`) and `accept` it, or stop and
/// replace it with a token picked from the residual by a draw from `rng`. After a full run of kept plates, pick the bonus from
/// `p[draft.len()]`. Return the tokens that go out: the kept drafts, then the replacement or the bonus.
pub fn verify(p: &[Vec<u32>], q: &[Vec<u32>], draft: &[usize], rng: &mut Rng) -> Vec<usize> {
    todo!("one round: a coin and accept for each draft in turn; at the first send-back pick a replacement from the residual and stop; after a full run pick the bonus from p")
}
