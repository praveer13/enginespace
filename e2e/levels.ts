/*
 * The levels that the keyboard walks play (W1-T36; ARCHITECTURE §11.2: "every game's level completable by keyboard alone; focus always
 * visible and never obscured"), as plain data like e2e/routes.ts, so that tests/ci/e2e-coverage.test.ts can hold it to the game registry
 * under Bun. Keep it free of imports.
 *
 * Every level of every game in the registry is in one of two lists:
 *   - `FRONT_LEVELS`, the four levels of "First service", which the front page plays and e2e/keyboard-loop.spec.ts walks (it is Service's
 *     session in the page's own frame, and part of the pull-request subset already);
 *   - `WALKED`, the levels that e2e/walks.spec.ts walks with e2e/support/walks.ts: a keyboard-only play from the level's own
 *     page to its debrief.
 * A game that joins the registry (W2's) adds its levels to `WALKED` and a walker for each, and the test fails until it does.
 */

/** Service's levels on the front page. */
export const FRONT_LEVELS = ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par'] as const

/** The levels walked on a game's own page, by game id. */
export const WALKED = {
  // TR2's levels and TR6's mask lane: Service's full service. (`keys` waits for the owner's tables and is not a level of the registry.)
  loop: ['async', 'graphs', 'mrv2', 'close', 'mask'],
  verifier: ['overlap', 'exact', 'chain', 'greedy-ngram', 'mutants', 'gamma'],
  'engine-floor': ['nano', 'nano-tp', 'mini', 'inside', 'vllm', 'sglang', 'abort', 'map'],
  pool: ['one-group', 'two-kinds', 'evict', 'same-size', 'state', 'adapters', 'manager'],
  'broken-bench': ['due', 'warm', 'sure', 'court'],
} as const

/**
 * The level of each game that a pull request walks: the first of each, the cheapest to play, so that the pull-request subset has a
 * complete keyboard play of every W1 game and the front page's four levels. The nightly sweep walks all of `WALKED`.
 */
export const SMOKE_LEVELS: { readonly [Game in keyof typeof WALKED]: (typeof WALKED)[Game][number] } = {
  loop: 'async',
  verifier: 'overlap',
  'engine-floor': 'nano',
  pool: 'one-group',
  'broken-bench': 'due',
}
