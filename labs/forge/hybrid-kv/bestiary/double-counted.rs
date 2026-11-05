//! Bestiary: an adapter charged twice. A load takes twice the pages it was asked for, so the pool pays for the adapter two times over.
//! The site names it by the adapters check: an adapter that holds other pages than the load asked for.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use base::{Manager, Policy};

#[derive(Debug, Clone, Copy, Default)]
pub struct Twice;

impl Policy for Twice {
    fn adapter_pages(&self, asked: usize) -> usize {
        asked * 2
    }
}

pub type KvManager = Manager<Twice>;
