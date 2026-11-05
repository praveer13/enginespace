//! The reference manager: what a finished src/manager.rs does. The `reference` and `solved` features build this file in its place, and
//! the bestiary builds a `Manager` of its own policy on it. No zip carries it (W1-T11), and the site never shows it.
//!
//! It is the Rust statement of packages/sim/kv/reference.ts (ARCHITECTURE §5.4), operation for operation, because the site judges a
//! module against that reference: replies, hits, the state and the events must be the same, so the order in which pages leave and
//! join the free queue is the same too. Where the TypeScript says `protected`, this says `Policy`: each hook is one rule, and a bestiary
//! member is a policy that breaks exactly one.

use crate::{block_hash, extra_key, AdapterView, CacheEntry, Event, Group, Kind, PageState, Refusal, Reply, RequestView, Snapshot, Spec};
use std::collections::BTreeMap;

/// Which blocks of a request a group keeps: its table has `blocks` entries, and the first `skip` of them have been let go.
#[derive(Debug, Clone, Copy)]
pub struct Rule {
    pub blocks: usize,
    pub skip: usize,
}

/// A group's rule for a request of `tokens` tokens.
pub fn table_rule(group: &Group, tokens: usize) -> Rule {
    let blocks = tokens.div_ceil(group.block_tokens);
    let skip = match group.kind {
        Kind::Full => 0,
        // The next token attends to itself and the `window - 1` before it, so the tokens before `tokens - window + 1` are skipped, and
        // a block is let go once every token in it is skipped.
        Kind::Sliding => (tokens + 1).saturating_sub(group.window) / group.block_tokens,
        Kind::State => blocks.saturating_sub(group.state_pages),
    };
    Rule { blocks, skip }
}

/// How many blocks before its edge a group needs cached for a prefix hit: all of them for a full group, the blocks the next token
/// reads for a sliding group, and the one that holds the state at the edge for a state group.
fn hit_blocks(group: &Group) -> usize {
    match group.kind {
        Kind::Full => usize::MAX,
        Kind::Sliding => (group.window - 1).div_ceil(group.block_tokens),
        Kind::State => 1,
    }
}

fn gcd(a: usize, b: usize) -> usize {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

/// The prefix hit: the longest one that every group holds, and what each group would give if it stood alone.
#[derive(Debug, Clone)]
pub struct Hit {
    pub hit: usize,
    pub per_group: Vec<usize>,
}

pub struct AdmitGroupPlan {
    pub rule: Rule,
    /// The first block of the hit in this group.
    pub hit_from: usize,
    /// The pages of the hit, by block from `hit_from`; `None` where the cache has no page for the block.
    pub hit_pages: Vec<Option<usize>>,
    /// New pages this group needs.
    pub fresh: usize,
}

/// What an admit would do, worked out before anything changes.
pub struct AdmitPlan {
    pub hit: usize,
    pub chains: BTreeMap<usize, Vec<u64>>,
    pub groups: Vec<AdmitGroupPlan>,
    pub fresh: usize,
    /// Pages the hit takes out of the queue: cached pages that nobody holds.
    pub from_queue: usize,
}

/// The rules a bestiary member breaks, one by one. The default of every hook is the right rule.
pub trait Policy: Copy + Default {
    /// Which blocks a group keeps for a request of `tokens` tokens.
    fn rule(&self, group: &Group, tokens: usize) -> Rule {
        table_rule(group, tokens)
    }
    /// The pages a free lets go of, in the order it lets them go.
    fn release(&self, pages: Vec<usize>) -> Vec<usize> {
        pages
    }
    /// The hit, after the groups have been asked.
    fn adjust_hit(&self, found: Hit) -> Hit {
        found
    }
    /// How many times a stored run is published.
    fn stored_copies(&self) -> usize {
        1
    }
    /// The pages an adapter is charged for the pages it asked for.
    fn adapter_pages(&self, asked: usize) -> usize {
        asked
    }
    /// Whether a reset is accepted while a request runs.
    fn reset_when_running(&self) -> bool {
        false
    }
    /// Whether a page with no hash goes to the front of the queue, before every cached page, when nobody holds it any more.
    fn unhashed_to_front(&self) -> bool {
        true
    }
    /// Called when an admit does not fit, before it is refused.
    fn refused_admit(&self, _manager: &mut Manager<Self>, _plan: &AdmitPlan) {}
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Right;
impl Policy for Right {}

/// A running request.
struct Req {
    adapter: Option<u32>,
    /// Its prompt and everything appended.
    tokens: Vec<u32>,
    /// Per group, per block: the page, or `None` where the group has let go of the block.
    tables: Vec<Vec<Option<usize>>>,
    /// Per distinct block size: the hash chain of the full blocks so far.
    chains: BTreeMap<usize, Vec<u64>>,
    /// Per group: how many leading blocks have been decided for the cache: hit, cached, let go, or left out as a duplicate.
    done: Vec<usize>,
}

struct Adapter {
    pages: Vec<usize>,
    users: usize,
}

pub struct Manager<P: Policy> {
    policy: P,
    spec: Spec,
    /// The least common multiple of the groups' block sizes: a hit is a multiple of it.
    align: usize,
    /// Per page: the requests whose tables hold it.
    pub refs: Vec<u32>,
    /// Per page: the group it was allocated to.
    pub owner: Vec<Option<usize>>,
    /// Per page: the hash it is cached under.
    pub hash: Vec<Option<u64>>,
    /// Per page: the adapter that holds it.
    pub lender: Vec<Option<u32>>,
    /// The pages an allocation may take, the next one first.
    pub queue: Vec<usize>,
    /// Per group: hash to page.
    cache: Vec<BTreeMap<u64, usize>>,
    reqs: BTreeMap<u32, Req>,
    adapters: BTreeMap<u32, Adapter>,
    events: Vec<Event>,
}

pub type KvManager = Manager<Right>;

impl<P: Policy> Manager<P> {
    pub fn new(spec: &Spec) -> Manager<P> {
        let n = spec.pool_pages;
        let align = spec.groups.iter().fold(1, |lcm, g| lcm / gcd(lcm, g.block_tokens) * g.block_tokens);
        Manager {
            policy: P::default(),
            spec: spec.clone(),
            align,
            refs: vec![0; n],
            owner: vec![None; n],
            hash: vec![None; n],
            lender: vec![None; n],
            queue: (0..n).collect(),
            cache: spec.groups.iter().map(|_| BTreeMap::new()).collect(),
            reqs: BTreeMap::new(),
            adapters: BTreeMap::new(),
            events: Vec::new(),
        }
    }

    fn refuse(&self, reason: Refusal) -> Reply {
        Reply::refused(reason, self.queue.len())
    }

    /* ------------------------------ the queue and the pages ------------------------------ */

    /// Takes `count` pages from the front of the queue. A page that was cached loses its hash, and that is published.
    pub fn take_pages(&mut self, count: usize) -> Vec<usize> {
        let mut taken = Vec::with_capacity(count);
        for _ in 0..count {
            let p = self.queue.remove(0);
            if let (Some(hash), Some(group)) = (self.hash[p], self.owner[p]) {
                self.cache[group].remove(&hash);
                self.hash[p] = None;
                self.events.push(Event::Removed { group, hash });
            }
            self.owner[p] = None;
            taken.push(p);
        }
        taken
    }

    /// Lets go of the pages in the order given. A page whose last holder this was joins the queue: at the back when it has a hash, so
    /// that cached pages leave oldest first, and at the front when it has none, so that it is reused before any cached page is touched.
    pub fn free_pages(&mut self, pages: Vec<usize>) {
        let pages = self.policy.release(pages);
        let mut front = Vec::new();
        let mut back = Vec::new();
        let mut parked = Vec::new();
        for p in pages {
            self.refs[p] -= 1;
            if self.refs[p] > 0 {
                continue;
            }
            if self.hash[p].is_none() || !self.spec.prefix_caching {
                self.owner[p] = None;
                if self.policy.unhashed_to_front() {
                    front.push(p);
                } else {
                    parked.push(p);
                }
            } else {
                back.push(p);
            }
        }
        back.extend(parked);
        self.queue.splice(0..0, front);
        self.queue.extend(back);
    }

    /// A hit uses a cached page, and the page leaves the queue if nobody else holds it.
    fn touch_pages(&mut self, pages: &[usize]) {
        for &p in pages {
            if self.refs[p] == 0 {
                if let Some(at) = self.queue.iter().position(|&q| q == p) {
                    self.queue.remove(at);
                }
            }
            self.refs[p] += 1;
        }
    }

    /* ------------------------------ the prefix hit ------------------------------ */

    /// The hash chains of `tokens` at each distinct block size, for the full blocks it holds.
    fn chains_of(&self, tokens: &[u32], extra: u32) -> BTreeMap<usize, Vec<u64>> {
        let mut chains = BTreeMap::new();
        for group in &self.spec.groups {
            let size = group.block_tokens;
            chains.entry(size).or_insert_with(|| {
                let mut parent = 0;
                (0..tokens.len() / size)
                    .map(|j| {
                        parent = block_hash(parent, &tokens[j * size..(j + 1) * size], extra);
                        parent
                    })
                    .collect()
            });
        }
        chains
    }

    /// The longest prefix, within `max_hit` tokens, that every group holds: ask each group, full attention first, for its longest hit
    /// within the length the last one allowed, and ask them all again while any of them shortened it.
    fn find_hit(&self, chains: &[&Vec<u64>], max_hit: usize) -> Hit {
        let groups = &self.spec.groups;
        let cached: Vec<Vec<bool>> = groups
            .iter()
            .enumerate()
            .map(|(g, group)| (0..max_hit / group.block_tokens).map(|j| self.cache[g].contains_key(&chains[g][j])).collect())
            .collect();
        let group_hit = |g: usize, limit: usize| -> usize {
            let group = &groups[g];
            let size = group.block_tokens;
            let blocks = limit / size;
            if group.kind == Kind::Full {
                let m = cached[g][..blocks].iter().take_while(|&&c| c).count();
                let tokens = m * size;
                return tokens - tokens % self.align;
            }
            let need = hit_blocks(group);
            let (mut run, mut best) = (0, 0);
            for (j, &held) in cached[g][..blocks].iter().enumerate() {
                run = if held { run + 1 } else { 0 };
                let tokens = (j + 1) * size;
                if tokens.is_multiple_of(self.align) && run >= need.min(j + 1) {
                    best = tokens;
                }
            }
            best
        };
        let order: Vec<usize> = (0..groups.len()).filter(|&g| groups[g].kind == Kind::Full).chain((0..groups.len()).filter(|&g| groups[g].kind != Kind::Full)).collect();
        let mut hit = max_hit;
        loop {
            let mut now = hit;
            for &g in &order {
                now = group_hit(g, now);
            }
            if now >= hit {
                break;
            }
            hit = now;
        }
        Hit { hit, per_group: (0..groups.len()).map(|g| group_hit(g, max_hit)).collect() }
    }

    /* ------------------------------ admit ------------------------------ */

    pub fn admit(&mut self, req: u32, prompt: &[u32], adapter: Option<u32>) -> Reply {
        if self.reqs.contains_key(&req) {
            return self.refuse(Refusal::Exists);
        }
        if adapter.is_some_and(|a| !self.adapters.contains_key(&a)) {
            return self.refuse(Refusal::NoAdapter);
        }
        let plan = self.plan_admit(prompt, adapter);
        if plan.fresh > self.queue.len().saturating_sub(plan.from_queue) {
            let policy = self.policy;
            policy.refused_admit(self, &plan);
            return self.refuse(Refusal::NoPages);
        }
        let hit = plan.hit;
        self.commit_admit(req, prompt, adapter, plan);
        Reply::admitted(self.queue.len(), hit)
    }

    /// Works out an admit: the hit, and for each group how many new pages it needs. Changes nothing.
    fn plan_admit(&self, prompt: &[u32], adapter: Option<u32>) -> AdmitPlan {
        let total = prompt.len();
        let chains = self.chains_of(prompt, extra_key(adapter));
        let hit = if self.spec.prefix_caching {
            let per_group: Vec<&Vec<u64>> = self.spec.groups.iter().map(|g| &chains[&g.block_tokens]).collect();
            self.policy.adjust_hit(self.find_hit(&per_group, total.saturating_sub(1))).hit
        } else {
            0
        };
        let mut fresh = 0;
        let mut from_queue = 0;
        let mut groups = Vec::new();
        for (g, group) in self.spec.groups.iter().enumerate() {
            let rule = self.policy.rule(group, total);
            let edge = hit / group.block_tokens;
            let hit_from = edge.saturating_sub(hit_blocks(group));
            let chain = &chains[&group.block_tokens];
            let hit_pages: Vec<Option<usize>> = (hit_from..edge).map(|j| self.cache[g].get(&chain[j]).copied()).collect();
            from_queue += hit_pages.iter().flatten().filter(|&&p| self.refs[p] == 0).count();
            // The request keeps the blocks from `rule.skip`. Those below `edge` come from the hit, the rest are new.
            let made = (rule.skip..rule.blocks).filter(|&j| !(j >= hit_from && j < edge && hit_pages[j - hit_from].is_some())).count();
            fresh += made;
            groups.push(AdmitGroupPlan { rule, hit_from, hit_pages, fresh: made });
        }
        AdmitPlan { hit, chains, groups, fresh, from_queue }
    }

    fn commit_admit(&mut self, id: u32, prompt: &[u32], adapter: Option<u32>, plan: AdmitPlan) {
        let every_hit: Vec<usize> = plan.groups.iter().flat_map(|gp| gp.hit_pages.iter().flatten().copied()).collect();
        self.touch_pages(&every_hit);

        let mut tables = Vec::new();
        let mut released = Vec::new();
        for g in 0..self.spec.groups.len() {
            let size = self.spec.groups[g].block_tokens;
            let gp = &plan.groups[g];
            let made = self.take_pages(gp.fresh);
            for &p in &made {
                self.owner[p] = Some(g);
                self.refs[p] = 1;
            }
            let edge = plan.hit / size;
            let mut table = vec![None; gp.rule.blocks];
            let mut next = 0;
            for (j, entry) in table.iter_mut().enumerate().skip(gp.rule.skip) {
                let hit_page = if j >= gp.hit_from && j < edge { gp.hit_pages[j - gp.hit_from] } else { None };
                *entry = hit_page.or_else(|| {
                    next += 1;
                    Some(made[next - 1])
                });
            }
            tables.push(table);
            // The hit pages that fall before the window's edge were read and are not kept: they go back, last block first.
            let mut dropped = Vec::new();
            for j in (gp.hit_from..edge.min(gp.rule.skip)).rev() {
                if let Some(p) = gp.hit_pages[j - gp.hit_from] {
                    dropped.push(p);
                }
            }
            released.push(dropped);
        }
        for dropped in released {
            self.free_pages(dropped);
        }

        let done = self.spec.groups.iter().map(|g| plan.hit / g.block_tokens).collect();
        let mut request = Req { adapter, tokens: prompt.to_vec(), tables, chains: plan.chains, done };
        if let Some(a) = adapter {
            if let Some(held) = self.adapters.get_mut(&a) {
                held.users += 1;
            }
        }
        self.cache_blocks(&mut request);
        self.reqs.insert(id, request);
    }

    /* ------------------------------ append ------------------------------ */

    pub fn append(&mut self, id: u32, tokens: &[u32]) -> Reply {
        let Some(mut r) = self.reqs.remove(&id) else { return self.refuse(Refusal::Unknown) };
        let before = r.tokens.len();
        let after = before + tokens.len();
        struct Step {
            old: Rule,
            now: Rule,
            let_go: Vec<usize>,
            made: usize,
        }
        let mut fresh = 0;
        let mut freed = 0;
        let mut plan = Vec::new();
        for (g, group) in self.spec.groups.iter().enumerate() {
            let old = self.policy.rule(group, before);
            let now = self.policy.rule(group, after);
            // The entries below `old.skip` were let go already. The ones from there to `now.skip` go now, the highest block first.
            let mut let_go = Vec::new();
            for j in (old.skip..now.skip.min(old.blocks)).rev() {
                if let Some(p) = r.tables[g][j] {
                    let_go.push(p);
                }
            }
            freed += let_go.iter().filter(|&&p| self.refs[p] == 1).count();
            let made = now.blocks.saturating_sub(old.blocks.max(now.skip));
            fresh += made;
            plan.push(Step { old, now, let_go, made });
        }
        if fresh > self.queue.len() + freed {
            self.reqs.insert(id, r);
            return self.refuse(Refusal::NoPages);
        }
        // Let go of what the windows have left behind first, so that the pages go back before new ones are taken.
        for step in &plan {
            self.free_pages(step.let_go.clone());
        }
        for (g, step) in plan.iter().enumerate() {
            for j in step.old.skip..step.now.skip.min(step.old.blocks) {
                r.tables[g][j] = None;
            }
            let made = self.take_pages(step.made);
            for &p in &made {
                self.owner[p] = Some(g);
                self.refs[p] = 1;
            }
            let mut next = 0;
            for j in step.old.blocks..step.now.blocks {
                if j < step.now.skip {
                    r.tables[g].push(None);
                } else {
                    r.tables[g].push(Some(made[next]));
                    next += 1;
                }
            }
        }
        r.tokens.extend_from_slice(tokens);
        self.cache_blocks(&mut r);
        self.reqs.insert(id, r);
        Reply::ok(self.queue.len())
    }

    /* ------------------------------ finish ------------------------------ */

    pub fn finish(&mut self, id: u32) -> Reply {
        let Some(r) = self.reqs.remove(&id) else { return self.refuse(Refusal::Unknown) };
        for table in &r.tables {
            let pages: Vec<usize> = table.iter().rev().flatten().copied().collect();
            self.free_pages(pages);
        }
        if let Some(held) = r.adapter.and_then(|a| self.adapters.get_mut(&a)) {
            held.users -= 1;
        }
        Reply::ok(self.queue.len())
    }

    /* ------------------------------ the cache ------------------------------ */

    /// Caches the full blocks of a request that nobody has decided yet, group by group: each takes its hash from the request's chain
    /// and becomes the page that a later hit finds. A block the group has let go of is skipped, and so is one whose key another page
    /// holds already. Each run of consecutive blocks that were cached is published as one `Stored`.
    fn cache_blocks(&mut self, r: &mut Req) {
        if !self.spec.prefix_caching {
            return;
        }
        let extra = extra_key(r.adapter);
        for group in &self.spec.groups {
            let size = group.block_tokens;
            let chain = r.chains.entry(size).or_default();
            for j in chain.len()..r.tokens.len() / size {
                let parent = if j == 0 { 0 } else { chain[j - 1] };
                chain.push(block_hash(parent, &r.tokens[j * size..(j + 1) * size], extra));
            }
        }
        for g in 0..self.spec.groups.len() {
            let size = self.spec.groups[g].block_tokens;
            let to = r.tokens.len() / size;
            let mut run: Vec<u64> = Vec::new();
            let mut start = 0;
            for j in r.done[g]..to {
                let hash = r.chains[&size][j];
                match r.tables[g][j] {
                    Some(page) if !self.cache[g].contains_key(&hash) => {
                        self.cache[g].insert(hash, page);
                        self.hash[page] = Some(hash);
                        if run.is_empty() {
                            start = j;
                        }
                        run.push(hash);
                    }
                    _ => self.publish_run(g, &mut run, start, r),
                }
            }
            self.publish_run(g, &mut run, start, r);
            r.done[g] = r.done[g].max(to);
        }
    }

    fn publish_run(&mut self, g: usize, run: &mut Vec<u64>, start: usize, r: &Req) {
        if run.is_empty() {
            return;
        }
        let size = self.spec.groups[g].block_tokens;
        let parent = if start == 0 { None } else { Some(r.chains[&size][start - 1]) };
        let tokens = r.tokens[start * size..(start + run.len()) * size].to_vec();
        for _ in 0..self.policy.stored_copies() {
            self.events.push(Event::Stored { group: g, hashes: run.clone(), parent, tokens: tokens.clone(), adapter: r.adapter });
        }
        run.clear();
    }

    /* ------------------------------ adapters ------------------------------ */

    pub fn load_adapter(&mut self, id: u32, pages: usize) -> Reply {
        if self.adapters.contains_key(&id) {
            return self.refuse(Refusal::Exists);
        }
        let pages = self.policy.adapter_pages(pages);
        if pages > self.queue.len() {
            return self.refuse(Refusal::NoPages);
        }
        let taken = self.take_pages(pages);
        for &p in &taken {
            self.lender[p] = Some(id);
        }
        self.adapters.insert(id, Adapter { pages: taken, users: 0 });
        Reply::ok(self.queue.len())
    }

    pub fn unload_adapter(&mut self, id: u32) -> Reply {
        match self.adapters.get(&id) {
            None => return self.refuse(Refusal::Unknown),
            Some(a) if a.users > 0 => return self.refuse(Refusal::InUse),
            Some(_) => {}
        }
        if let Some(a) = self.adapters.remove(&id) {
            let mut given = Vec::new();
            for &p in a.pages.iter().rev() {
                self.lender[p] = None;
                self.refs[p] = 1;
                given.push(p);
            }
            self.free_pages(given);
        }
        Reply::ok(self.queue.len())
    }

    /* ------------------------------ reset ------------------------------ */

    /// Forgets every cached block. It needs the pool at rest: with a request running it is refused.
    pub fn reset(&mut self) -> Reply {
        if !self.reqs.is_empty() && !self.policy.reset_when_running() {
            return self.refuse(Refusal::Busy);
        }
        if self.spec.prefix_caching {
            for map in &mut self.cache {
                map.clear();
            }
            for p in 0..self.spec.pool_pages {
                self.hash[p] = None;
                if self.refs[p] == 0 && self.lender[p].is_none() {
                    self.owner[p] = None;
                }
            }
            self.events.push(Event::Cleared);
        }
        Reply::ok(self.queue.len())
    }

    /* ------------------------------ what the site looks at ------------------------------ */

    pub fn snapshot(&self) -> Snapshot {
        let pages = (0..self.spec.pool_pages)
            .map(|p| {
                let group = self.owner[p].unwrap_or(0);
                if let Some(adapter) = self.lender[p] {
                    PageState::Adapter { adapter }
                } else if self.refs[p] > 0 {
                    PageState::Used { group, refs: self.refs[p], hash: self.hash[p] }
                } else if let Some(hash) = self.hash[p] {
                    PageState::Cached { group, hash }
                } else {
                    PageState::Free
                }
            })
            .collect();
        Snapshot {
            pages,
            queue: self.queue.clone(),
            requests: self.reqs.iter().map(|(&id, r)| RequestView { id, adapter: r.adapter, length: r.tokens.len(), tables: r.tables.clone() }).collect(),
            adapters: self.adapters.iter().map(|(&id, a)| AdapterView { id, users: a.users, pages: a.pages.clone() }).collect(),
            cache: self.cache.iter().enumerate().flat_map(|(group, map)| map.iter().map(move |(&hash, &page)| CacheEntry { group, hash, page })).collect(),
        }
    }

    pub fn take_events(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }
}
