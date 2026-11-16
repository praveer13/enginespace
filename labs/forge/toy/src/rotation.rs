//! TODO(you): the free queue, which this crate calls the rotation. This is the only file you edit.
//!
//! A free queue holds at most `capacity` keys, and remembers the order they were last touched in. The front of the order is the key
//! nobody has touched for the longest, which is the next to be evicted.
//!
//!   * `touch(key)` on a key you hold is a hit: the key keeps its place in the queue and goes to the back of the order.
//!   * `touch(key)` on a key you do not hold is a miss: the key comes in at the back. If the queue was full, the front key is
//!     evicted first to make room, and the miss says which one.
//!   * `len()` counts the keys held, and `order()` lists them, next to evict first.
//!
//! Build it when the checks are green on your machine:
//!
//! ```text
//!   cargo test
//!   cargo build --release --locked --target wasm32-unknown-unknown --package toy
//! ```
//!
//! then drop `target/wasm32-unknown-unknown/release/toy.wasm` on the lab's page.

// Remove this line when you use the arguments.
#![allow(unused_variables)]

use crate::Touch;

/// Add the fields you need.
pub struct Rotation {}

impl Rotation {
    /// An empty free queue that holds at most `capacity` keys (`capacity` is at least 1).
    pub fn new(capacity: usize) -> Rotation {
        todo!("build the free queue: an empty order, and the capacity to remember")
    }

    /// Touch `key`. `Touch::Hit` when it was held; otherwise `Touch::Miss`, carrying the key evicted to make room, if one was.
    pub fn touch(&mut self, key: u32) -> Touch {
        todo!("touch a key: a hit goes to the back; a miss comes in at the back, after evicting the front if the queue is full")
    }

    /// How many keys are held.
    pub fn len(&self) -> usize {
        todo!("count the keys held")
    }

    /// The keys held, next to evict first.
    pub fn order(&self) -> Vec<u32> {
        todo!("list the keys, front of the queue first")
    }
}
