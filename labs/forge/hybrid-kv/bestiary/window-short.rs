//! Bestiary: a window that is one token short. A sliding group lets go of a block a token early, while the next token still reads it.
//! The site names it by the window check: a block that the group still keeps has been let go.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use crate::{Group, Kind};
use base::{table_rule, Manager, Policy, Rule};

#[derive(Debug, Clone, Copy, Default)]
pub struct Short;

impl Policy for Short {
    fn rule(&self, group: &Group, tokens: usize) -> Rule {
        let mut group = group.clone();
        if group.kind == Kind::Sliding {
            group.window -= 1;
        }
        table_rule(&group, tokens)
    }
}

pub type KvManager = Manager<Short>;
