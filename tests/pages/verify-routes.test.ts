/*
 * verify:routes (ARCHITECTURE §10.2, W0-T19): the route table, prepare-pages and the e2e route list agree.
 *
 *   - On this checkout the gate passes, run on its own and through the registry, which no longer reports it pending.
 *   - Acceptance 3: a route that cannot be enumerated fails it, as a table in a fixture and as a table handed to `checkRoutes`.
 *   - The e2e route list (e2e/routes.ts, W0-T21) is held to the documents the plan writes.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { planPages } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import { checkRoutes, e2eProblems } from '../../scripts/verify-routes'
import { GATES } from '../../scripts/verify'
import { routes } from '../../src/routes'
import { fakeSources, root } from './support'

/** Runs a script of the repository under Bun, as CI does, and returns what it printed and how it ended. */
function bun(...args: string[]) {
  const run = spawnSync('bun', args, { cwd: root, encoding: 'utf8' })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

describe('on this checkout', () => {
  test('the gate passes, and prints how many documents each route has', () => {
    const { status, out } = bun('scripts/verify-routes.ts')
    expect(out).toMatch(/^verify:routes passed: \d+ route-table entries with \d+ documents\n/)
    expect(status).toBe(0)
    expect(out).toMatch(/ {2}\/m\/:module +\d+\n/)
    expect(out).toContain('e2e route list:')
  })

  test('is registered for W0-T19 as a gate that reads the source, and the registry runs it', () => {
    expect(GATES.routes.stage).toBe('source')
    expect(GATES.routes.parts).toEqual([{ task: 'W0-T19', script: 'scripts/verify-routes.ts', args: [] }])
    const { status, out } = bun('scripts/verify.ts', 'routes')
    expect(out).toContain('$ bun scripts/verify-routes.ts')
    expect(out).toContain('verify:routes passed')
    expect(out).not.toContain('pending')
    expect(status).toBe(0)
  })

  test('shows up as live in the registry list', () => {
    const { out } = bun('scripts/verify.ts', 'list')
    expect(out.split('\n').find((line) => line.startsWith('routes '))).toMatch(/^routes +source +live +W0-T19 +scripts\/verify-routes\.ts$/)
  })
})

describe('a route that cannot be enumerated (acceptance 3)', () => {
  test('fails the gate on a route table with one more route, and names the route and where to add it', () => {
    const { status, out } = bun('scripts/verify-routes.ts', '--routes', 'tests/fixtures/routes/unenumerable.ts')
    expect(status).toBe(1)
    expect(out).toContain('verify:routes: /rooms/:room cannot be enumerated: scripts/pages/plan.ts has no entry for it')
    expect(out).toContain('verify:routes failed: 1 problem')
  })

  test('fails it through the registry, as CI would see it', () => {
    const { status, out } = bun('scripts/verify.ts', 'routes', '--routes', 'tests/fixtures/routes/unenumerable.ts')
    expect(status).toBe(1)
    expect(out).toContain('verify:routes failed: scripts/verify-routes.ts exited with 1')
  })

  test('fails checkRoutes the same way, for any table', () => {
    const [shell] = routes
    const table = [{ ...shell, children: [...(shell.children ?? []), { path: 'rooms/:room', Component: () => null, handle: { title: 'Room · enginespace' } }] }]
    const report = checkRoutes({ routes: table, sources: fakeSources, e2e: null })
    expect(report.problems.map((problem) => problem.split(' cannot')[0])).toEqual(['/rooms/:room'])
  })

  test('passes the real table', () => {
    expect(checkRoutes({ routes, sources: loadSources(), e2e: null }).problems).toEqual([])
  })

  test('exits 2 for an option it does not know', () => {
    expect(bun('scripts/verify-routes.ts', '--nope').status).toBe(2)
    expect(bun('scripts/verify-routes.ts', '--routes').status).toBe(2)
  })
})

describe('the e2e route list', () => {
  const { pages } = planPages(routes, fakeSources)

  test('has nothing to disagree with while e2e/routes.ts does not exist', () => {
    expect(checkRoutes({ routes, sources: fakeSources, e2e: null }).problems).toEqual([])
  })

  test('agrees when every path it names has a document, the front page and a lesson included', () => {
    const e2e = ['/', '/map', '/m/tr2', '/m/tr2/l1-first', '/play/loop', '/settings', '/design', '/evidence']
    expect(e2eProblems(e2e, pages)).toEqual([])
    expect(checkRoutes({ routes, sources: fakeSources, e2e }).problems).toEqual([])
  })

  test('disagrees when it names a path that no document answers, and says what to do', () => {
    const problems = e2eProblems(['/map', '/play/pool', '/nope'], pages)
    expect(problems.map((problem) => problem.split(',')[0])).toEqual(['e2e/routes.ts lists /play/pool', 'e2e/routes.ts lists /nope'])
    expect(problems[0]).toContain('Mend the list, or add the page')
  })

  test('disagrees when a game is not registered yet: the path it would have is a path with no document', () => {
    const noGames = planPages(routes, { ...fakeSources, games: [] }).pages
    expect(e2eProblems(['/play/loop'], noGames)).toHaveLength(1)
  })

  test('disagrees when it names a path twice', () => {
    expect(e2eProblems(['/map', '/map'], pages)).toEqual(['e2e/routes.ts lists /map twice'])
  })

  test('does not take the 404 page for an address', () => {
    expect(e2eProblems(['404.html'], pages)).toHaveLength(1)
  })
})
