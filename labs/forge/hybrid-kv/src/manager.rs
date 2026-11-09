//! TODO(you): the hybrid KV manager. This is the only file you edit.
//!
//! A model that mixes kinds of layer needs several KV caches at once: full attention keeps every token, a sliding window keeps the last
//! W tokens, and a recurrent layer keeps a fixed-size state. vLLM's hybrid manager serves them all from ONE pool of equal pages, and
//! S-LoRA serves LoRA adapters from the same pool. You write that manager: the pool, the free queue, one block table for each group, the
//! prefix cache with its N-group hit, the adapters, and the events that let a consumer rebuild the cache.
//!
//! Build it in six stages, each at most about 25 minutes [estimated], in this order. A `todo!()` traps only the check that reaches it,
//! so each stage turns its check green while the later ones still say "not implemented yet".
//!
//! ```text
//!   STAGE 1  one_group        `new`, `admit`, `append`, `finish`, `snapshot`, `take_events`; `table_rule` for `Kind::Full`; the
//!                             cache, the hash chain and the hit for ONE full group. Pages, all or nothing, shared blocks, the order
//!                             pages leave and join the queue. Lab 02 and lab 07 in one module.
//!   STAGE 2  sliding          `table_rule` for `Kind::Sliding`: a window gives its blocks back, and `append` counts what it gives back
//!   STAGE 3  state            `table_rule` for `Kind::State`: a fixed number of pages for each request
//!   STAGE 4  hit_all_groups   the hit for every group at once: the longest prefix that all of them hold
//!   STAGE 5  adapter_pages    `load_adapter`, `unload_adapter`, and an admit with an adapter: lab 02's `adapter_unified_paging`
//!   STAGE 6  gauntlet         `reset`, and everything together: about 2,000 seeded operations [estimated], the invariants after each
//! ```
//!
//! Check a stage on your machine with `cargo test <check id>`, for example `cargo test one_group`. The message names the operation that
//! first went wrong and the invariant it broke. The site runs the same checks on seeds it draws when you drop the `.wasm`, and judges
//! more: every reply, hit and event against its own reference. The header of the harness (src/lib.rs) says which check catches which
//! mistake, and what the wire looks like if you want to poke your module.
//!
//! ## The pool
//!
//! `spec.pool_pages` physical pages, ids `0 .. pool_pages`, serve every group and every adapter. The harness checked that a block of
//! every group is exactly one page, so a block is a page, whatever its group. A page is in one of four states, which `snapshot` reports:
//!
//! ```text
//!   free     holds nothing
//!   cached   holds a hashed block that nobody holds: a prefix hit can bring it back, and an allocation can evict it
//!   used     held by the tables of `refs` requests (a shared prefix is one page with `refs` above 1)
//!   adapter  holds part of a resident adapter
//! ```
//!
//! ## The free queue
//!
//! One queue holds every page an allocation may take, the free and the cached ones, in eviction order, the next to be taken first. It
//! starts as `0, 1, …, pool_pages - 1`, and `Reply::free` is its length (claim vllm.hybrid-kv.one-lru).
//!
//!   * An allocation takes pages from the FRONT (vllm.kv-pool.allocate-from-front). A cached page that it takes loses its hash: delete
//!     its cache entry, and publish `Event::Removed`, one for each page, in the order the pages are taken.
//!   * A page that nobody holds any more joins the queue: at the BACK when it has a hash, so that cached pages leave oldest first, and
//!     at the FRONT when it has none, so that it is reused before any cached page is touched (vllm.kv-pool.free-order). Pages go back
//!     in batches, a batch being the pages of ONE group that an operation lets go of, last block first. A batch puts its bare pages in
//!     front of the queue, in the order of the batch, so the bare pages of a later batch land in front of an earlier batch's; and it
//!     puts its hashed pages behind the queue, in the order of the batch.
//!   * A request lets its pages go last block first, one group at a time, in the order of the groups, so that the tail of a prefix is
//!     dumped before its head (vllm.kv-pool.free-reverse).
//!   * A prefix hit takes the pages it uses out of the queue (vllm.kv-pool.touch).
//!
//! ## A group's table
//!
//! For a request of L tokens, group g keeps a table of ⌈L ÷ B⌉ entries (B is `block_tokens`), one for each block: the page that holds
//! it, or `None` where the group has let go of it. The first `skip` entries are `None`, and a request holds a page for every `Some`:
//!
//! ```text
//!   Kind::Full     skip = 0
//!   Kind::Sliding  skip = ⌊max(0, L - W + 1) ÷ B⌋, W = `window`: the next token attends to itself and the W - 1 before it, so a block
//!                  goes once every token in it is before that (vllm.hybrid-kv.sliding-skipped-tokens)
//!   Kind::State    skip = max(0, blocks - S), S = `state_pages`: the newest S blocks stay, however long the request runs
//! ```
//!
//! With 16-token blocks, a window of 32 and the groups full0, sw0 and sw1, a request of 112 tokens holds 7 + 2 + 2 blocks [measured:
//! vllm.hybrid-kv.doc-example-blocks, 2026-11-04].
//!
//! ## The hash, the cache and the events
//!
//! A block that has filled (all B of its tokens are in the request) is cached under (its group, its hash). The hash of block j is
//! `block_hash(hash of block j - 1, the block's tokens, extra_key(adapter))`, with 0 for the parent of block 0; the harness gives you
//! `block_hash` and `extra_key` (vllm.kv-hash.chain). The chain depends on the block size, so groups with the same size share a chain.
//!
//! Every pool of the lab caches prefixes (`spec.prefix_caching` is true, and the site never asks for another). A group caches only a
//! block it holds (not one it let go of or never took), and only when no page of that group is cached under that hash already: then
//! the new page stays unhashed. Each run of consecutive blocks that one operation newly caches in one group is one
//! `Event::Stored`, in the order of the groups, after the operation has taken its pages: the run's hashes, the hash of the block
//! before the first (`None` for block 0), the run's tokens, and the request's adapter (vllm.kv-events.stored-content).
//!
//! ## The prefix hit
//!
//! An admit starts from the longest prefix of its prompt that EVERY group holds, in tokens: a multiple of the least common multiple of
//! the groups' block sizes, and short of the last token of the prompt (a request computes its last token to get its logits). A hit of
//! m whole blocks is accepted by a group when
//!
//! ```text
//!   Full     blocks 0 … m-1 are all cached
//!   Sliding  the ⌈(W - 1) ÷ B⌉ blocks before the edge are cached, or all m of them when there are fewer
//!   State    block m-1 is cached: it holds the state at the edge
//! ```
//!
//! Find it as vLLM does, a fixed point: ask each group, full attention first, for the longest hit it accepts within the length the last
//! one allowed, and ask them all again while any of them shortened the length (vllm.hybrid-kv.n-group-lookup). The hit is the
//! intersection of the groups' hits, never the longest of any one. The pages of a hit are, in each group, the cached pages of the
//! blocks that group needs for it; the request keeps those at or after `skip`, and the others were read and go back to the queue.
//!
//! ## The operations
//!
//! All or nothing: an operation either succeeds, or leaves everything exactly as it was: pages, tables, the cache, the queue and the
//! events. Work out what it needs first, refuse when the pool cannot supply it, and only then change anything.
//!
//! ```text
//!   admit(req, prompt, adapter)  refuse Exists, then NoAdapter. Find the hit, and what each group needs: its blocks from `skip` on,
//!                                less the pages the hit supplies. Refuse NoPages unless the new pages fit once the cached pages
//!                                of the hit have left the queue. Then: the hit pages leave the queue (held once more); group by
//!                                group, take the new pages; the hit pages before `skip` go back (a batch for each group, last
//!                                block first) after every group has taken; cache the filled blocks. Reply::admitted(free, hit).
//!   append(req, tokens)          refuse Unknown. Each group lets go of the blocks its rule drops (highest block first) and needs
//!                                the new blocks its rule adds. Refuse NoPages unless the new pages fit in the queue plus the pages
//!                                that the let-go blocks give back (only a page that this request alone holds gives one back).
//!                                Then: let go of every group's blocks first (a batch for each group), take the new pages group by
//!                                group, cache.
//!   finish(req)                  refuse Unknown. Each group's pages go back as one batch, last block first, group by group.
//!   load_adapter(adapter, pages) refuse Exists, then NoPages unless `pages` ≤ free. Take `pages` pages from the front; the adapter
//!                                holds them in the order they were taken, and a request may run on it from now on.
//!   unload_adapter(adapter)      refuse Unknown, then InUse while a running request uses it. Its pages go back as one batch, last
//!                                page first.
//!   reset()                      refuse Busy while any request runs. Forget every cached block (the queue keeps its order) and
//!                                publish Event::Cleared once. Nothing else changes.
//! ```
//!
//! An adapter takes ⌈adapter bytes ÷ page bytes⌉ pages of the same pool, stored anywhere in it, and every request that uses it shares
//! them (S-LoRA's unified paging). At the pins neither engine does this: vLLM keeps adapters in `max_loras` slots outside the KV pool,
//! and the lab page compares your pool with that (D-042). The adapter's id is the extra key of its requests' blocks, so the same
//! tokens under two adapters are two blocks.
//!
//! Suggested shape. Everything is up to you, as long as `snapshot` can report it:
//!
//! ```text
//!   refs: Vec<u32>, owner: Vec<Option<usize>>, hash: Vec<Option<u64>>, lender: Vec<Option<u32>>   per page
//!   queue: Vec<usize>                                  the free queue, front first
//!   cache: Vec<BTreeMap<u64, usize>>                   per group, hash to page
//!   requests: BTreeMap<u32, …>                         tokens, adapter, one table per group, how many blocks the cache has decided
//!   adapters: BTreeMap<u32, …>                         pages, users
//!   events: Vec<Event>                                 what `take_events` hands out
//! ```

// Remove this line when you use the arguments.
#![allow(unused_variables, unused_imports, dead_code)]

use crate::{block_hash, extra_key, Event, Group, Kind, Refusal, Reply, Snapshot, Spec};

/// Which blocks of a request a group keeps: a table of `blocks` entries, the first `skip` of them let go. Returns `(blocks, skip)`.
/// STAGE 1 for `Kind::Full`, STAGE 2 for `Kind::Sliding`, STAGE 3 for `Kind::State`.
fn table_rule(group: &Group, tokens: usize) -> (usize, usize) {
    let blocks = tokens.div_ceil(group.block_tokens);
    match group.kind {
        Kind::Full => todo!("stage 1: a full group keeps every block, so nothing is let go"),
        Kind::Sliding => todo!("stage 2: skip = ⌊max(0, tokens - window + 1) ÷ block_tokens⌋"),
        Kind::State => todo!("stage 3: skip = max(0, blocks - state_pages)"),
    }
}

/// Add the fields you need (see the suggested shape above).
pub struct KvManager {}

impl KvManager {
    /// A manager for `spec`: `spec.pool_pages` pages, all free, in the queue in order.
    /// STAGE 1.
    pub fn new(spec: &Spec) -> KvManager {
        todo!("build the manager: the pages, the queue 0, 1, …, the caches, no requests and no adapters")
    }

    /// Admit request `req` with `prompt` (a non-empty list of token ids), on `adapter` when it has one.
    /// STAGE 1 for one full group, STAGE 2 and 3 for the other kinds of group, STAGE 4 for the hit across groups, STAGE 5 for adapters.
    pub fn admit(&mut self, req: u32, prompt: &[u32], adapter: Option<u32>) -> Reply {
        todo!("refuse Exists or NoAdapter; find the hit; refuse NoPages unless it fits; then take pages, build the tables, cache, publish")
    }

    /// Append `tokens` (at least one) to request `req`.
    /// STAGE 1; STAGE 2 when a window moves on.
    pub fn append(&mut self, req: u32, tokens: &[u32]) -> Reply {
        todo!("refuse Unknown; work out the blocks to let go and the blocks to add; refuse NoPages unless it fits; then apply")
    }

    /// Request `req` is done: its pages go back to the queue, last block first.
    /// STAGE 1.
    pub fn finish(&mut self, req: u32) -> Reply {
        todo!("refuse Unknown; let go of every group's pages, last block first; the adapter loses a user")
    }

    /// Load `adapter`, which takes `pages` pages of the pool.
    /// STAGE 5.
    pub fn load_adapter(&mut self, adapter: u32, pages: usize) -> Reply {
        todo!("refuse Exists or NoPages; take the pages from the front of the queue")
    }

    /// Unload `adapter`, and give its pages back.
    /// STAGE 5.
    pub fn unload_adapter(&mut self, adapter: u32) -> Reply {
        todo!("refuse Unknown or InUse; give the pages back, last page first")
    }

    /// Forget every cached block.
    /// STAGE 6.
    pub fn reset(&mut self) -> Reply {
        todo!("refuse Busy while a request runs; forget the cache; publish Cleared")
    }

    /// Everything the site looks at, after each operation: every page's state, the queue, the requests and their tables, the adapters,
    /// and the cache. The harness sorts the lists. This is your manager's `dump()`: you cannot operate what you cannot see.
    /// STAGE 1.
    pub fn snapshot(&self) -> Snapshot {
        todo!("report the pages (free, cached, used or an adapter's), the queue, the requests, the adapters and the cache")
    }

    /// The events published since the last call, in order.
    /// STAGE 1.
    pub fn take_events(&mut self) -> Vec<Event> {
        todo!("hand out the events and forget them")
    }
}
