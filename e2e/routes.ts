/*
 * The addresses that the e2e specs visit (ARCHITECTURE §10.1 and §11.2, TRACKER W0-T21 and W1-T36).
 *
 * This file is plain data on purpose. `verify:routes` (scripts/verify-routes.ts) imports it under Bun and fails when a path of
 * `PR_ROUTES` or `W1_ROUTES` is an address that no document of the build answers, so a route renamed in src/routes.tsx or dropped from
 * the plan of scripts/pages/plan.ts breaks the gate before it breaks a spec. The Playwright specs import it too, through their own loader.
 * Keep it free of imports.
 */

/**
 * The pull-request subset: the routes that axe checks on every pull request, that the network check visits, and that the
 * reduced-motion check scans (A§10.1: "axe at 360 and 1280 px on 8 routes"). Each is a page the learner meets in the first
 * minutes: the front page and its game, the course map, a module and one of its lessons (TR2's third, which has an item set, a game, a
 * figure and cards of both kinds), the games' own page, and the three pages that hold the learner's data and the design system.
 */
export const PR_ROUTES: string[] = ['/', '/map', '/m/tr2', '/m/tr2/l3-async-scheduling-closes-the-bubble', '/play/loop', '/settings', '/design', '/evidence']

/**
 * What W1 adds to the pull-request subset (W1-T36), a page of every kind that W1 built, and every game it built: the four modules
 * that W1 wrote (TR1, TR5a, TR6 and TR8; TR2's is above) with the lesson of each that holds the most (its figure, games, items, lab
 * and claims), the Play index, the four games besides Service, the two labs of the forge, and Today. The nightly sweep visits every
 * document and not these alone (e2e/support/site.ts, `documentRoutes`).
 *
 * The Trace Room and the receipts page are left out: they are stubs until W2 builds them, and the specimen tape of the viewer shows
 * only in a test build (src/pages/TraceRoom.tsx). Both are in the nightly sweep as documents.
 */
export const W1_ROUTES: string[] = [
  '/m/tr1',
  '/m/tr1/l5-vllm-at-the-pin-by-symbol',
  '/m/tr5a',
  '/m/tr5a/l4-adapters-as-pages-and-upstreams-slots',
  '/m/tr6',
  '/m/tr6/l2-the-rejection-sampler-exactly',
  '/m/tr8',
  '/m/tr8/l2-warm-up-samples-and-an-interval',
  '/play',
  '/play/verifier',
  '/play/engine-floor',
  '/play/pool',
  '/play/broken-bench',
  '/labs/hybrid-kv',
  '/labs/rejection-sampler',
  '/today',
]

/**
 * A game's page opens on its first level, and `?level=` opens another, so the document list does not reach them. W1-T36 adds the levels
 * of the full service (TR2's `async`, `graphs`, `mrv2` and `close`, and TR6's `mask`) to the pull-request subset: their page is Service's
 * with stage tabs, levers and cards, which `/play/loop` (the first service) does not show, and no spec audited it. The other games'
 * levels are audited by their own specs (e2e/pool.spec.ts and the rest), and the registry is walked level by level in
 * e2e/walks.spec.ts.
 */
export const W1_LEVEL_PAGES: string[] = [
  '/play/loop?level=async',
  '/play/loop?level=graphs',
  '/play/loop?level=mrv2',
  '/play/loop?level=close',
  '/play/loop?level=mask',
]

/** The widths, in CSS px, of the pull-request axe run: a phone's and a laptop's (A§11.2). */
export const PR_WIDTHS: number[] = [360, 1280]

/**
 * The widths of the nightly sweep (A§11.2): the pull-request pair, and 320, the narrowest that WCAG 1.4.10 (Reflow) names, which
 * is also where the "no sideways scroll" check runs.
 */
export const NIGHTLY_WIDTHS: number[] = [320, 360, 1280]
