/*
 * The real route table with one route more: `/rooms/:room`, a page with a parameter that no source of scripts/pages/plan.ts
 * fills. prepare-pages could write no document for it, so a deep link to it would answer 404, and `verify:routes` must fail
 * (W0-T19, acceptance 3). tests/pages/verify-routes.test.ts hands this file to the gate with `--routes`.
 */
import type { RouteObject } from 'react-router'
import { routes as real } from '../../../src/routes'

const [shell] = real

export const routes: RouteObject[] = [
  {
    ...shell,
    children: [
      ...(shell.children ?? []).slice(0, -1),
      { path: 'rooms/:room', Component: () => null, handle: { title: 'Room · enginespace' } },
      ...(shell.children ?? []).slice(-1),
    ],
  },
]
