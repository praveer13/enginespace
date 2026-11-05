//! The crate's own checks, run by `cargo test` on your machine. They are red on the template until you have written src/verify.rs, and
//! green on the reference (`cargo test --features reference`), which is how the repository's CI runs them. The site grades the module
//! through `ks_invoke` and not through these, and the two ask the same questions.

use kslab::Ctx;
use rejection_sampler::{bridge, Bridge};

#[test]
fn the_checks_are_listed_in_grading_order() {
    // `list` runs no student code, so this one is green on the template too.
    let reply = kslab::respond(b"v 2\nlist\n", &rejection_sampler::LAB);
    let ids: Vec<&str> = rejection_sampler::CHECKS.iter().map(|c| c.id).collect();
    assert_eq!(ids, ["accept", "residual", "pick", "round", "exact"]);
    for id in ids {
        assert!(reply.contains(&format!("\"id\":\"{id}\"")), "{reply}");
    }
    assert!(reply.contains("\"abi\":2"), "{reply}");
}

#[test]
fn every_check_passes_on_its_default_seed() {
    for (def, check) in rejection_sampler::CHECKS.iter().zip(rejection_sampler::self_checks()) {
        assert!(check.pass, "{}: {}", def.id, check.msg);
    }
}

#[test]
fn the_seeded_checks_pass_on_32_more_seeds() {
    for def in rejection_sampler::CHECKS.iter() {
        for seed in 1..=32u32 {
            let check = rejection_sampler::LAB.run_check(def.id, Some(seed)).expect("the check is listed");
            assert!(check.pass, "{} on seed {seed}: {}", def.id, check.msg);
        }
    }
}

#[test]
fn the_default_seed_is_what_the_site_calls_default() {
    // Seedless runs use each check's own default seed, and a seeded check is the only kind that takes any other.
    for def in rejection_sampler::CHECKS.iter() {
        let ctx = Ctx { seed: def.default_seed, fresh: false };
        assert_eq!((def.run)(&ctx).pass, rejection_sampler::LAB.run_check(def.id, None).unwrap().pass, "{}", def.id);
    }
}

fn say(state: &mut Bridge, command: &str) -> String {
    bridge(state, command)
}

#[test]
fn the_bridge_speaks_the_wire() {
    let mut state = Bridge::default();
    // The accept step: p = 3 and q = 5 keeps the coins 0, 1 and 2.
    assert_eq!(say(&mut state, "accept 3 5 2"), "yes");
    assert_eq!(say(&mut state, "accept 3 5 3"), "no");
    assert_eq!(say(&mut state, "residual 5,3,0,8 2,6,0,8"), "3,0,0,0");
    // A pick walks the kept weights: 3,0,2 gives token 0 to draws 0 to 2, and token 2 to draws 3 and 4.
    assert_eq!(say(&mut state, "weights 3,0,2"), "ok");
    assert_eq!(say(&mut state, "pick 2"), "0");
    assert_eq!(say(&mut state, "pick 3"), "2");
    // A chain of one draft over two dishes: the plate 1 has p = 0, so it is sent back for sure, and the residual is dish 0 alone.
    assert_eq!(say(&mut state, "chain 65536,0|0,65536 32768,32768"), "ok");
    assert_eq!(say(&mut state, "seed 7"), "ok");
    assert_eq!(say(&mut state, "round 1"), "0");
}

#[test]
fn the_bridge_refuses_what_it_cannot_read() {
    // These answer before any learner code runs, so they are green on the template too.
    let mut state = Bridge::default();
    assert_eq!(say(&mut state, "pick 0"), "err no weights are kept");
    assert_eq!(say(&mut state, "round 0"), "err no chain is kept");
    assert_eq!(say(&mut state, "accept 3 5 5"), "err the coin 5 is not below q (5)");
    assert_eq!(say(&mut state, "accept x 5 1"), "err bad numbers 'accept x 5 1'");
    assert_eq!(say(&mut state, "weights 1,x"), "err bad weights '1,x'");
    assert_eq!(say(&mut state, "weights 3,2"), "ok");
    assert_eq!(say(&mut state, "pick 5"), "err the draw 5 is not below the weights' sum");
    assert_eq!(say(&mut state, "pick x"), "err bad draw 'x'");
    assert_eq!(say(&mut state, "residual 1,2 1"), "err the two lists have different numbers of tokens");
    assert_eq!(say(&mut state, "chain 1,2|3 1,2"), "err a distribution adds up to 3, and it must add up to 65536");
    // A weight is at most the total, so that no sum overflows a u32 in the learner's code.
    assert_eq!(say(&mut state, "chain 4294967295,4294967295|1 1,2"), "err bad weights '4294967295,4294967295'");
    assert_eq!(say(&mut state, "weights 65537"), "err bad weights '65537'");
    assert_eq!(say(&mut state, "accept 65537 5 1"), "err a weight is at most 65536");
    assert_eq!(say(&mut state, "weights 65536,65536"), "ok");
    assert_eq!(say(&mut state, "pick 131072"), "err the draw 131072 is not below the weights' sum");
    assert_eq!(say(&mut state, "chain 65536,0 65536,0"), "err a chain has 1 to 8 q and one more p over the same tokens");
    assert_eq!(say(&mut state, "chain 65536,0|65536 65536,0"), "err the distributions have different numbers of tokens");
    assert_eq!(say(&mut state, "chain 65536,0|0,65536 65536,0"), "ok");
    assert_eq!(say(&mut state, "round 1"), "err the draft token 1 at position 0 has no weight in q");
    assert_eq!(say(&mut state, "round 0,0"), "err the chain has 1 drafts, and the round got 2");
    assert_eq!(say(&mut state, "seed -1"), "err bad seed '-1'");
    assert_eq!(say(&mut state, ""), "err empty command");
    assert_eq!(say(&mut state, "plate 1"), "err unknown command 'plate 1'");
}
