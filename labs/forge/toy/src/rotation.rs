//! TODO(you): the rotation. This is the only file you edit.
//!
//! A rotation holds at most `capacity` keys, and remembers the order they were last touched in. The front of the order is the key
//! nobody has touched for the longest, which is the next to be dumped.
//!
//!   * `touch(key)` on a key you hold is a hit: the key keeps its place in the reach-in and goes to the back of the order.
//!   * `touch(key)` on a key you do not hold is a miss: the key comes in at the back. If the rotation was full, the front key is
//!     dumped first to make room, and the miss says which one.
//!   * `len()` counts the keys held, and `order()` lists them, next to dump first.
//!
//! Build it when the checks are green on your machine:
//!
//! ```text
//!   cargo test
//!   cargo build --release --target wasm32-unknown-unknown
//! ```
//!
//! then drop `target/wasm32-unknown-unknown/release/toy.wasm` on the lab's page.

// Remove this line when you use the arguments.
#![allow(unused_variables)]

use crate::Touch;

/// Add the fields you need.
pub struct Rotation {}

impl Rotation {
    /// An empty rotation that holds at most `capacity` keys (`capacity` is at least 1).
    pub fn new(capacity: usize) -> Rotation {
        todo!("build the rotation: an empty order, and the capacity to remember")
    }

    /// Touch `key`. `Touch::Hit` when it was held; otherwise `Touch::Miss`, carrying the key dumped to make room, if one was.
    pub fn touch(&mut self, key: u32) -> Touch {
        todo!("touch a key: a hit goes to the back; a miss comes in at the back, after dumping the front if the rotation is full")
    }

    /// How many keys are held.
    pub fn len(&self) -> usize {
        todo!("count the keys held")
    }

    /// The keys held, next to dump first.
    pub fn order(&self) -> Vec<u32> {
        todo!("list the keys, front of the rotation first")
    }
}
