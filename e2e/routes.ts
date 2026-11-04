/*
 * The addresses that the e2e specs visit (ARCHITECTURE §10.1 and §11.2, TRACKER W0-T21).
 *
 * This file is plain data on purpose. `verify:routes` (scripts/verify-routes.ts) imports it under Bun and fails when a path of
 * `PR_ROUTES` is an address that no document of the build answers, so a route renamed in src/routes.tsx or dropped from the plan
 * of scripts/pages/plan.ts breaks the gate before it breaks a spec. The Playwright specs import it too, through their own loader.
 * Keep it free of imports.
 */

/**
 * The pull-request subset: the routes that axe checks on every pull request, that the network check visits, and that the
 * reduced-motion check scans (A§10.1: "axe at 360 and 1280 px on 8 routes"). Each is a page the learner meets in the first
 * minutes: the front page and its game, the course map, a module and its sample lesson, the games' own page, and the three pages
 * that hold the learner's data and the design system.
 */
export const PR_ROUTES: string[] = ['/', '/map', '/m/tr2', '/m/tr2/l0-sample', '/play/loop', '/settings', '/design', '/evidence']

/** The widths, in CSS px, of the pull-request axe run: a phone's and a laptop's (A§11.2). */
export const PR_WIDTHS: number[] = [360, 1280]

/**
 * The widths of the nightly sweep (A§11.2): the pull-request pair, and 320, the narrowest that WCAG 1.4.10 (Reflow) names, which
 * is also where the "no sideways scroll" check runs.
 */
export const NIGHTLY_WIDTHS: number[] = [320, 360, 1280]
