//! Bestiary: a free that leaks. The last page of every free is never let go, so it stays held by a request that is gone, and the pool
//! loses a page each time. The site names it by page conservation: a page that no table holds.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use base::{Manager, Policy};

#[derive(Debug, Clone, Copy, Default)]
pub struct Leaky;

impl Policy for Leaky {
    fn release(&self, mut pages: Vec<usize>) -> Vec<usize> {
        pages.pop();
        pages
    }
}

pub type KvManager = Manager<Leaky>;
