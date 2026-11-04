// The pure, seeded simulation models (ARCHITECTURE §5). Pure means no DOM, no I/O, no clocks and no entropy:
// tsconfig.pure.json compiles this package with lib ES2022 only, ESLint bans the non-deterministic APIs (§5.1), and
// verify:determinism checks them again. It imports nothing outside itself except kernelspace's vendored rng and S5 card
// (§2.3, enforced by ESLint and verify:boundaries). W0-T12 adds the first models. Until then the file keeps
// tsconfig.pure.json's input set non-empty.
export {}
