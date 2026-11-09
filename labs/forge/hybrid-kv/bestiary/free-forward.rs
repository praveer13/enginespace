//! Bestiary: blocks let go head first. A request gives its pages back first block first, so the head of a prefix is dumped before its
//! tail and a later hit is shorter than it should be. The site names it by the events and the replies that follow: a different page
//! is dumped.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use base::{Manager, Policy};

#[derive(Debug, Clone, Copy, Default)]
pub struct Forward;

impl Policy for Forward {
    fn release(&self, mut pages: Vec<usize>) -> Vec<usize> {
        pages.reverse();
        pages
    }
}

pub type KvManager = Manager<Forward>;
