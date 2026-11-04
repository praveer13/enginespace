// The pure game sessions (ARCHITECTURE §6.3): state, actions, reducer, score and debrief, with no views. Like
// packages/sim it compiles with no DOM and obeys the determinism lint. It imports packages/sim, and the types (never the
// values) of packages/schema (§2.3, enforced by ESLint and verify:boundaries).
//
// W0-T14 adds the framework every game follows:
//   types     the session contract, the action log, the keys, and the registry's record of a game;
//   registry  the games (each with its display name and subtitle, D-049), the keys common to every game, and regradeStored;
//   replay    play a run into a log, replay a log into a grade, and the log as text. A stored score never changes a grade.
// Each game adds a folder here (`packages/play/<id>/session.ts`, `levels.ts`, `layout.ts`) and an entry in registry.ts.
export * from './types'
export * from './registry'
export * from './replay'
