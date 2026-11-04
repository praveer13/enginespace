//! Bestiary: a hit on the front key never finishes. The key is walked to the back one swap at a time, and the walk skips the front,
//! where there is no neighbour on the left to step from, and waits for a step that never comes. The site must stop it at the time limit
//! per check, mark that check `timeout`, and go on with the next one in a new worker.
//! `hits`, `recency` and `churn` touch the front key again; `fill` and `dump` never do, and pass.

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
        if let Some(mut at) = self.keys.iter().position(|&held| held == key) {
            while at + 1 < self.keys.len() {
                if at == 0 {
                    // The mistake: the front key has nothing to its left, so the walk skips it, and `at` never moves.
                    std::hint::black_box(&self.keys);
                    continue;
                }
                self.keys.swap(at, at + 1);
                at += 1;
            }
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
