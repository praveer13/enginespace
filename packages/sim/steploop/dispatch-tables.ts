// The state of the dispatcher golden tables (TRACKER W1-T12 check 4; GAMES.md §3, "Invariants the tests check"; DECISIONS Q-10).
//
// `dispatchV2` and `dispatchV1` are ports of vLLM's two dispatchers, and the only proof that a port is right is vLLM's own answers. The
// answers come from running the pinned code: scripts/tables/vllm-dispatch.py runs MRV2's `CudaGraphManager.dispatch` and MRV1's
// `CudagraphDispatcher.dispatch` on 6,400 cases each, on a CPU host, and writes tests/fixtures/dispatch/v0.33.0.json with its SHA-256.
// `bun scripts/tables/dispatch-cases.ts --check` then holds the model to every row.
//
// This constant says whether that run has happened and its tables are committed. W1-T13's `keys` level is built to wait on it: a level
// that teaches dispatch keys must not ship on a port that nothing has checked against the code it ports. tests/sim/dispatch-tables.test.ts
// fails when this constant and the committed files disagree, so whoever commits the tables must flip it, and cannot forget to.

/**
 * `'waiting'`: the tables have not been generated. W1-T12's build agent did not run the pinned vLLM: the permission system refused to
 * run code from the downloaded source tarball, and the agent did not work around the refusal. The script, the cases and the checker are
 * shipped and tested (tests/sim/dispatch-tables.test.ts holds the checker to a table that an independent port of the two dispatchers
 * wrote), and the owner runs the script on a CPU host (Q-10). `'committed'`: the tables are in tests/fixtures/dispatch/ and the model
 * agrees with them.
 */
export const DISPATCH_TABLES: { readonly status: 'waiting' | 'committed'; readonly pin: string; readonly table: string; readonly script: string; readonly question: string } = Object.freeze({
  status: 'waiting',
  pin: 'vllm v0.33.0 (4ba787ec9959e566d3b587a796dff07673324da5)',
  table: 'tests/fixtures/dispatch/v0.33.0.json',
  script: 'scripts/tables/vllm-dispatch.py',
  question: 'Q-10',
})
