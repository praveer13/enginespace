//! The crate's own checks, run by `cargo test` on your machine. They are red on the template until you have written src/manager.rs, and
//! green on the reference (`cargo test --features reference`), which is how the repository's CI runs them. The site grades the module
//! through `ks_invoke` and not through these, and the two agree on the default seeds.

use hybrid_kv::{block_hash, bridge, extra_key, Session};
use kslab::Ctx;

#[test]
fn the_checks_are_listed_in_grading_order() {
    // `list` runs no student code, so this one is green on the template too.
    let reply = kslab::respond(b"v 2\nlist\n", &hybrid_kv::LAB);
    let ids: Vec<&str> = hybrid_kv::CHECKS.iter().map(|c| c.id).collect();
    assert_eq!(ids, ["one_group", "sliding", "state", "hit_all_groups", "adapter_pages", "gauntlet"]);
    for id in ids {
        assert!(reply.contains(&format!("\"id\":\"{id}\"")), "{reply}");
    }
    assert!(reply.contains("\"abi\":2"), "{reply}");
}

/// One test for each check, named by its id, so that `cargo test one_group` runs the first stage and nothing else.
macro_rules! stage_test {
    ($name:ident) => {
        #[test]
        fn $name() {
            let c = hybrid_kv::LAB.run_check(stringify!($name), None).expect("the check is listed");
            assert!(c.pass, "[{}] {} — {}", c.id, c.label, c.msg);
        }
    };
}

stage_test!(one_group);
stage_test!(sliding);
stage_test!(state);
stage_test!(hit_all_groups);
stage_test!(adapter_pages);
stage_test!(gauntlet);

#[test]
fn every_check_passes_on_its_default_seed() {
    for (def, check) in hybrid_kv::CHECKS.iter().zip(hybrid_kv::self_checks()) {
        assert!(check.pass, "{}: {}", def.id, check.msg);
    }
}

#[test]
fn the_seeded_checks_pass_on_32_more_seeds() {
    for def in hybrid_kv::CHECKS.iter().filter(|c| c.seeded) {
        // Spread over the u32 range (a Weyl sequence), and fewer for the longest check.
        let seeds = if def.id == "gauntlet" { 4 } else { 32 };
        for i in 1..=seeds as u32 {
            let seed = i.wrapping_mul(0x9E37_79B9);
            let check = hybrid_kv::LAB.run_check(def.id, Some(seed)).expect("the check is listed");
            assert!(check.pass, "{} on seed {seed}: {}", def.id, check.msg);
        }
    }
}

#[test]
fn the_default_seed_is_what_the_site_calls_default() {
    for def in hybrid_kv::CHECKS.iter().filter(|c| c.seeded) {
        let ctx = Ctx { seed: def.default_seed, fresh: false };
        assert_eq!((def.run)(&ctx).pass, hybrid_kv::LAB.run_check(def.id, None).unwrap().pass);
    }
}

#[test]
fn the_hash_is_the_sites() {
    // Values from packages/sim/kv/hash.ts (kvBlockHash), the hash the site judges your events by.
    let first: Vec<u32> = (0..16).collect();
    assert_eq!(block_hash(0, &first, 0), 227_796_527_905_085);
    let second: Vec<u32> = (16..32).collect();
    assert_eq!(block_hash(227_796_527_905_085, &second, 4), 1_842_527_204_376_511);
    assert_eq!(block_hash(0, &[u32::MAX, 0, 7], 1), 549_021_916_857_176);
    assert_eq!(extra_key(None), 0);
    assert_eq!(extra_key(Some(3)), 4);
}

#[test]
fn the_bridge_speaks_the_wire() {
    let mut session: Option<Session> = None;
    let mut say = |command: &str| bridge(&mut session, command);
    assert_eq!(say("pages"), "err not initialized");
    assert_eq!(say("init 8 1024 16 1 - full0:full:1:0:64:-:-"), "ok");
    assert_eq!(say("queue"), "0,1,2,3,4,5,6,7");
    assert_eq!(say("admit 1 - 0+70"), "ok 6 hit 0");
    assert_eq!(say("requests"), "1:-:70:0,1");
    assert_eq!(say("cache").split(';').count(), 1);
    assert!(say("events").starts_with("S:0:-:-:"), "the first full block is published");
    assert_eq!(say("events"), "-", "events are handed out once");
    assert_eq!(say("finish 1"), "ok 8");
}

#[test]
fn the_bridge_refuses_what_it_cannot_read() {
    // These answer before any manager code runs, so they are green on the template too.
    let mut session: Option<Session> = None;
    assert_eq!(bridge(&mut session, "admit 1 - 0+3"), "err not initialized");
    assert_eq!(bridge(&mut session, ""), "err empty command");
    assert!(bridge(&mut session, "init 0 1 1 1 - a:full:1:0:1:-:-").starts_with("err the pool holds 1 to 128 pages"));
    assert!(bridge(&mut session, "init 8 1024 16 1 2 full0:full:1:0:64:-:-").starts_with("err this lab's pool has no adapter slots"));
    assert!(bridge(&mut session, "init 8 1024 16 1 - full0:full:1:0:32:-:-").contains("not exactly one page"));
    assert!(session.is_none());
}
