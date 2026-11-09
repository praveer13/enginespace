//! The reference rotation: what a finished src/rotation.rs does. The `reference` and `solved` features build this file in its place.
//! No zip carries it (W1-T11), and the site never shows it.

use crate::Touch;

pub struct Rotation {
    capacity: usize,
    /// The front is the next to dump.
    keys: Vec<u32>,
}

impl Rotation {
    pub fn new(capacity: usize) -> Rotation {
        Rotation { capacity, keys: Vec::with_capacity(capacity) }
    }

    pub fn touch(&mut self, key: u32) -> Touch {
        if let Some(at) = self.keys.iter().position(|&held| held == key) {
            self.keys.remove(at);
            self.keys.push(key);
            return Touch::Hit;
        }
        let dumped = if self.keys.len() == self.capacity { Some(self.keys.remove(0)) } else { None };
        self.keys.push(key);
        Touch::Miss { dumped }
    }

    pub fn len(&self) -> usize {
        self.keys.len()
    }

    pub fn order(&self) -> Vec<u32> {
        self.keys.clone()
    }
}
