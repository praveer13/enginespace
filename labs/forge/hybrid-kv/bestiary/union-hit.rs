//! Bestiary: a prefix hit that is the union of the groups. It reports the longest hit of any one group in place of the longest that
//! every group holds, so a request is told it has prefix tokens that a group has already dumped. The site names it by the hit check.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use base::{Hit, Manager, Policy};

#[derive(Debug, Clone, Copy, Default)]
pub struct Union;

impl Policy for Union {
    fn adjust_hit(&self, found: Hit) -> Hit {
        let hit = found.per_group.iter().copied().max().unwrap_or(0);
        Hit { hit, per_group: found.per_group }
    }
}

pub type KvManager = Manager<Union>;
