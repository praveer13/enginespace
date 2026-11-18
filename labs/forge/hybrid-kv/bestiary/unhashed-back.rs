//! Bestiary: a page with no hash sent to the back of the free queue. A page that nobody holds and that holds no block joins the queue
//! behind the cached pages, so the next allocation evicts a cached block before it reuses a bare page. The site names it by the events
//! and the hits that follow.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use base::{Manager, Policy};

#[derive(Debug, Clone, Copy, Default)]
pub struct Parked;

impl Policy for Parked {
    fn unhashed_to_front(&self) -> bool {
        false
    }
}

pub type KvManager = Manager<Parked>;
