//! Bestiary: an event published twice. Every stored run is announced two times, so a consumer that rebuilds the cache from the events
//! counts each block twice. The site names it by the events check: every block is published exactly once.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use base::{Manager, Policy};

#[derive(Debug, Clone, Copy, Default)]
pub struct Echo;

impl Policy for Echo {
    fn stored_copies(&self) -> usize {
        2
    }
}

pub type KvManager = Manager<Echo>;
