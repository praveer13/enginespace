// The pure game sessions (ARCHITECTURE §6.3): state, actions, reducer, score and debrief, with no views. Like
// packages/sim it compiles with no DOM and obeys the determinism lint. It imports packages/sim, and the types (never the
// values) of packages/schema (§2.3, enforced by ESLint and verify:boundaries). W0-T14 adds the session framework. Until
// then the file keeps tsconfig.pure.json's input set non-empty.
export {}
