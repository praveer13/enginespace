//! TODO(you): the verify step. This is the only file you edit.
//!
//! A small draft model proposes a run of tokens ahead of the target model. Each draft token x is drawn from the draft model's distribution
//! `q`, and `p` says how often the target model would pick each token itself. What comes out must be exactly `p`, however the draft model
//! drafts. That is the verify step of speculative decoding, and it is exact.
//!
//! Every weight in this lab is a whole number out of `TOTAL` = 65,536, and `p` and `q` add up to it, so a probability is a weight over
//! `TOTAL` and no step needs a float. A draw is a whole number too. Four functions, in the order the checks ask for them:
//!
//! ```text
//!   accept     accept a draft token or reject it, from one coin
//!   residual   what a rejected token is resampled from: where p is bigger than q
//!   pick       a draw picks a token from a list of weights
//!   verify     one round: walk the run, stop at the first rejection, and finish the round
//! ```
//!
//! The rule, in integers:
//!
//!   * **Accept or reject.** For the draft token x, draw a coin `u`, uniform in `0..q[x]`, and accept the token when `u < p[x]`. That accepts it
//!     with probability min(1, p[x] / q[x]): all `q[x]` coins when p is at least q, and `p[x]` of them when it is less.
//!   * **Resample.** At the first rejected token, the round stops. The token that replaces it is picked from the residual
//!     (p − q)⁺: the weight of each token x is `max(0, p[x] − q[x])`, the tokens the draft model under-proposes, and a draw uniform in
//!     `0..(the residual's total)` picks one. A token was rejected only where q is bigger than p, so the residual is never empty then.
//!   * **The bonus token.** If every draft token is accepted, one more token is picked, the bonus, from `p` after the last draft
//!     by a draw uniform in `0..TOTAL`.
//!
//! The round emits the draft tokens it accepted and then one more, the resampled token or the bonus, so it emits between 1 and γ + 1 tokens for γ drafts.
//!
//! Build it when the checks are green on your machine:
//!
//! ```text
//!   cargo test
//!   cargo build --release --locked --target wasm32-unknown-unknown --package rejection-sampler
//! ```
//!
//! then drop `target/wasm32-unknown-unknown/release/rejection_sampler.wasm` on the lab's page.

// Remove this line when you use the arguments and the imports.
#![allow(unused_variables, unused_imports)]

use crate::TOTAL;
use kslab::Rng;

/// Is the draft token accepted?
///
/// `px` and `qx` are the weights that p and q give the drafted token x (out of `TOTAL`), and `u` is the coin: uniform in `0..qx`.
/// Accept the token for exactly `min(px, qx)` of the `qx` coins. `qx` is there for a rule that needs it.
pub fn accept(px: u32, qx: u32, u: u32) -> bool {
    todo!("accept a draft token: true for exactly min(px, qx) of the qx coins u in 0..qx")
}

/// The residual (p − q)⁺: for every token, how much more the target model would pick it than the draft model does, and 0 where the draft model
/// picks it at least as often as the target model. The lists are one weight per token, and the answer is a list of the same length.
pub fn residual(p: &[u32], q: &[u32]) -> Vec<u32> {
    todo!("resample from the excess: max(0, p[x] - q[x]) for every token x (mind that a u32 cannot go below 0)")
}

/// The token that `draw` picks from `weights`: the first token whose running total passes the draw. `draw` is uniform in
/// `0..(the sum of the weights)`, so every token is picked by exactly as many draws as its weight, and a token of weight 0 is never picked.
pub fn pick(weights: &[u32], draw: u32) -> usize {
    todo!("walk the weights, keeping a running total, and return the token where the total first goes past the draw")
}

/// One round of the verify step.
///
/// `draft[i]` is the token the draft model proposed at position i, drawn from `q[i]`. `p` has one distribution more than `draft` has tokens:
/// `p[i]` is the target model's distribution at position i, and `p[draft.len()]` is the one after the last draft, for the bonus. Every distribution
/// is a list of weights, one per token, that adds up to `TOTAL`.
///
/// Walk the drafts in order. For each one draw a coin from `rng` (`rng.below(n)` is uniform in `0..n`) and `accept` it, or stop and
/// replace it with a token picked from the residual by a draw from `rng`. After a full run of accepted tokens, pick the bonus from
/// `p[draft.len()]`. Return the tokens that go out: the accepted drafts, then the replacement or the bonus.
pub fn verify(p: &[Vec<u32>], q: &[Vec<u32>], draft: &[usize], rng: &mut Rng) -> Vec<usize> {
    todo!("one round: a coin and accept for each draft in turn; at the first rejection pick a replacement from the residual and stop; after a full run pick the bonus from p")
}
