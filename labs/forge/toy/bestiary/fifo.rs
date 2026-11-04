//! Bestiary: first in, first out. A hit changes nothing, so the rotation dumps by arrival and not by use.
//! `hits`, `recency` and `churn` must fail it. `fill` and `dump` cannot tell, because nothing is touched twice before the first dump.

use crate::Touch;

pub struct Rotation {
    capacity: usize,
    keys: Vec<u32>,
}

impl Rotation {
    pub fn new(capacity: usize) -> Rotation {
        Rotation { capacity, keys: Vec::with_capacity(capacity) }
    }

    pub fn touch(&mut self, key: u32) -> Touch {
        // The mistake: a held key is a hit, and stays where it came in.
        if self.keys.contains(&key) {
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
