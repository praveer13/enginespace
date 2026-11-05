//! Bestiary: a window off by one. A sliding group keeps one token more than the next token reads, so it lets go of each block a token
//! late and holds a page too many at the edge of every block. The site names it by the window check: a table that holds a block the
//! window has left.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use crate::{Group, Kind};
use base::{table_rule, Manager, Policy, Rule};

#[derive(Debug, Clone, Copy, Default)]
pub struct Long;

impl Policy for Long {
    fn rule(&self, group: &Group, tokens: usize) -> Rule {
        let mut group = group.clone();
        if group.kind == Kind::Sliding {
            group.window += 1;
        }
        table_rule(&group, tokens)
    }
}

pub type KvManager = Manager<Long>;
