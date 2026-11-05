//! Bestiary: an admit that takes pages before it fails. The groups are served in turn, and when one does not fit it refuses, with the
//! pages of the groups before it already taken. The site names it by the atomic check: a refusal must leave the state as it was.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use base::{AdmitPlan, Manager, Policy};

#[derive(Debug, Clone, Copy, Default)]
pub struct Greedy;

impl Policy for Greedy {
    fn refused_admit(&self, manager: &mut Manager<Self>, plan: &AdmitPlan) {
        let mut have = manager.queue.len().saturating_sub(plan.from_queue);
        for (g, group) in plan.groups.iter().enumerate() {
            if group.fresh > have {
                break;
            }
            have -= group.fresh;
            for p in manager.take_pages(group.fresh) {
                manager.owner[p] = Some(g);
                manager.refs[p] = 1;
            }
        }
    }
}

pub type KvManager = Manager<Greedy>;
