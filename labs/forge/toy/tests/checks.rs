//! The crate's own checks, run by `cargo test` on your machine. They are red on the template until you have written src/rotation.rs, and
//! green on the reference (`cargo test --features reference`), which is how the repository's CI runs them. The site grades the module
//! through `ks_invoke` and not through these, and the two agree on the default seeds.

use kslab::Ctx;

#[test]
fn the_checks_are_listed_in_grading_order() {
    // `list` runs no student code, so this one is green on the template too.
    let reply = kslab::respond(b"v 2\nlist\n", &toy::LAB);
    let ids: Vec<&str> = toy::CHECKS.iter().map(|c| c.id).collect();
    assert_eq!(ids, ["fill", "hits", "dump", "recency", "churn"]);
    for id in ids {
        assert!(reply.contains(&format!("\"id\":\"{id}\"")), "{reply}");
    }
    assert!(reply.contains("\"abi\":2"), "{reply}");
}

#[test]
fn every_check_passes_on_its_default_seed() {
    for (def, check) in toy::CHECKS.iter().zip(toy::self_checks()) {
        assert!(check.pass, "{}: {}", def.id, check.msg);
    }
}

#[test]
fn the_seeded_check_passes_on_32_more_seeds() {
    for seed in 1..=32u32 {
        let check = toy::LAB.run_check("churn", Some(seed)).expect("churn is listed");
        assert!(check.pass, "seed {seed}: {}", check.msg);
    }
}

#[test]
fn the_bridge_speaks_the_wire() {
    let mut rotation = None;
    let mut say = |command: &str| toy::bridge(&mut rotation, command);
    assert_eq!(say("len"), "err not initialized");
    assert_eq!(say("init 3"), "ok");
    assert_eq!(say("touch 1"), "miss");
    assert_eq!(say("touch 2"), "miss");
    assert_eq!(say("touch 3"), "miss");
    assert_eq!(say("touch 1"), "hit");
    assert_eq!(say("touch 4"), "miss dump 2");
    assert_eq!(say("order"), "3,1,4");
    assert_eq!(say("len"), "3");
}

#[test]
fn the_bridge_refuses_what_it_cannot_read() {
    // These answer before any rotation code runs, so they are green on the template too.
    let mut rotation = None;
    assert_eq!(toy::bridge(&mut rotation, "touch 1"), "err not initialized");
    assert_eq!(toy::bridge(&mut rotation, "init 0"), "err bad capacity '0'");
    assert_eq!(toy::bridge(&mut rotation, "init 99999"), "err bad capacity '99999'");
    assert_eq!(toy::bridge(&mut rotation, "touch x"), "err bad key 'x'");
    assert_eq!(toy::bridge(&mut rotation, ""), "err empty command");
    assert_eq!(toy::bridge(&mut rotation, "dump 1"), "err unknown command 'dump 1'");
}

#[test]
fn the_default_seed_is_what_the_site_calls_default() {
    // Seedless runs use each check's own default seed, and a seeded one is the only check that takes any other.
    let def = toy::CHECKS.iter().find(|c| c.seeded).expect("one check is seeded");
    let ctx = Ctx { seed: def.default_seed, fresh: false };
    assert_eq!((def.run)(&ctx).pass, toy::LAB.run_check("churn", None).unwrap().pass);
}
