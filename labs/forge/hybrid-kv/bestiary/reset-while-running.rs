//! Bestiary: a reset accepted while a request runs. It forgets every cached block under the feet of the request that holds them,
//! where it should be refused with `busy`. The site names it by the reply.

#[allow(dead_code)]
#[path = "../reference/manager.rs"]
mod base;

use base::{Manager, Policy};

#[derive(Debug, Clone, Copy, Default)]
pub struct Anyway;

impl Policy for Anyway {
    fn reset_when_running(&self) -> bool {
        true
    }
}

pub type KvManager = Manager<Anyway>;
