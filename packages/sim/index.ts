// The pure, seeded simulation models (ARCHITECTURE §5). Pure means no DOM, no I/O, no clocks and no entropy:
// tsconfig.pure.json compiles this package with lib ES2022 only, ESLint bans the non-deterministic APIs (§5.1), and
// verify:determinism checks them again. It imports nothing outside itself except kernelspace's vendored rng and S5 card
// (§2.3, enforced by ESLint and verify:boundaries).
//
// W0-T12 adds the four modules every model builds on: `core` (time, seeds, the generator, canonical JSON, integer statistics),
// `physics` (the S5 step card and its fitted rows), `host` (the host card's presets) and `workload` (seeded request streams).
// W0-T13 adds `steploop`, the engine's step loop (v0, the TR2 spike). W1-T08 adds `trace`, `trace@1` with its synthetic traces,
// attribution and structural checks. The rest follow, each in a folder of its own.
export * from './core'
export * from './physics'
export * from './host'
export * from './workload'
export * from './steploop'
export * from './trace'
