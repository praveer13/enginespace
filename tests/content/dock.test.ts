/*
 * R-T11, the lesson's dock (REDESIGN §2.5, §3.4): a second view of the run the learner touched last in a lesson, over the same run state as
 * the instrument. These tests render the dock on the server with a stub game that supplies only the kit's interface (a compact view, a step
 * and its words) and the run's own functions, so they hold what the dock draws for any game, and that Dock.tsx reaches no game's file: a
 * game's compact view arrives with the run the game's frame publishes (src/games/kit/RunContext.tsx). e2e/lesson-games.spec.ts holds the
 * dock live beside the reference lesson, with an action taken in either view showing in both.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GameAction } from '@es/play'
import Dock from '@/content/render/Dock'
import { forgetRuns, latestRun, nextTouch, publishRun, retireRun, type DockViewProps, type LiveRun } from '@/games/kit/RunContext'

const repo = path.resolve(import.meta.dirname, '../..')

interface StubView {
  readonly filled: number
}

/** The stub game's compact view: it draws the view it is given, and nothing of any real game. */
function StubDockView({ run }: DockViewProps<StubView>) {
  return h('p', { 'data-stub-view': '' }, `filled ${run.view.filled}`)
}

const calls: string[] = []

/** A run as a stub game's frame would publish it. */
function stubRun(over: Partial<LiveRun<StubView>> = {}): LiveRun<StubView> {
  return {
    place: { scope: 'tr9.l1', key: 'tr9.l1#3', anchor: 'run-3' },
    game: 'stub',
    gameTitle: 'Stub game',
    levelTitle: 'The first level',
    mode: 'practice',
    view: { filled: 2 },
    done: false,
    turns: 1,
    canUndo: true,
    askOpen: false,
    step: { t: 'fill' } as GameAction,
    stepWords: 'Step fills the next slot.',
    dispatch: (action) => calls.push(`dispatch ${action.t}`),
    undo: () => calls.push('undo'),
    restart: () => calls.push('restart'),
    DockView: StubDockView,
    touched: nextTouch(),
    ...over,
  }
}

const publish = (run: LiveRun<StubView>) => publishRun(run as LiveRun)
const dock = (scope = 'tr9.l1') => renderToStaticMarkup(h(Dock, { scope }))

afterEach(() => {
  forgetRuns()
  calls.length = 0
})

describe('the dock renders any game through the kit’s interface', () => {
  test('a stub game that gives only the interface: its compact view of the run, the level named, and Step, Undo and Reset in practice', () => {
    publish(stubRun())
    const markup = dock()
    expect(markup).toContain('data-stub-view=""')
    expect(markup).toContain('filled 2')
    expect(markup).toContain('Stub game')
    expect(markup).toContain('The first level')
    for (const control of ['Step', 'Undo', 'Reset']) expect(markup).toMatch(new RegExp(`<button[^>]*>${control}</button>`))
    expect(markup).toContain('Step fills the next slot.')
    expect(markup).toContain('href="#run-3"')
    expect(markup).toContain('Back to my run')
    expect(markup).toMatch(/<aside[^>]*aria-labelledby="dock-title"/)
  })

  test('the dock’s controls are the run’s own functions: Step dispatches the game’s step, Undo and Reset call the run', () => {
    const run = stubRun()
    publish(run)
    const shown = latestRun('tr9.l1')
    expect(shown?.dispatch).toBe(run.dispatch)
    expect(shown?.undo).toBe(run.undo)
    expect(shown?.restart).toBe(run.restart)
  })

  test('before any run in the lesson the dock is empty and says so', () => {
    const markup = dock()
    expect(markup).toContain('data-dock-state="empty"')
    expect(markup).toContain('Your run appears here.')
    expect(markup).not.toContain('<button')
  })

  test('a run of another lesson is not this lesson’s', () => {
    publish(stubRun({ place: { scope: 'tr9.l2', key: 'tr9.l2#0', anchor: 'run-0' } }))
    expect(dock()).toContain('Your run appears here.')
  })

  test('the dock follows the run touched last, and falls back when it leaves the page', () => {
    publish(stubRun({ place: { scope: 'tr9.l1', key: 'tr9.l1#3', anchor: 'run-3' }, levelTitle: 'Level A' }))
    publish(stubRun({ place: { scope: 'tr9.l1', key: 'tr9.l1#7', anchor: 'run-7' }, levelTitle: 'Level B' }))
    expect(dock()).toContain('Level B')
    retireRun('tr9.l1#7')
    expect(dock()).toContain('Level A')
  })

  test('while the session’s guess is open, Step waits and says why; with no move to take, it is off', () => {
    publish(stubRun({ askOpen: true }))
    let markup = dock()
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Step<\/button>/)
    expect(markup).toContain('Make your guess in the run, or skip it, before you step.')
    publish(stubRun({ step: null }))
    markup = dock()
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Step<\/button>/)
  })

  test('a graded run has no Step, Undo or Reset in the dock', () => {
    publish(stubRun({ mode: 'graded', step: null, canUndo: false }))
    const markup = dock()
    expect(markup).not.toContain('>Step</button>')
    expect(markup).not.toContain('>Undo</button>')
    expect(markup).toContain('A graded run is played in the run itself')
  })

  test('a game that gives no compact view is named, with the way back to its run', () => {
    publish(stubRun({ DockView: null }))
    const markup = dock()
    expect(markup).toContain('This game draws its run in the run itself.')
    expect(markup).toContain('href="#run-3"')
  })

  test('a finished run says where its result is, and offers no move', () => {
    publish(stubRun({ done: true, step: null }))
    const markup = dock()
    expect(markup).toContain('The run is over. Its result is under the run.')
    expect(markup).not.toContain('>Step</button>')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Dock.tsx imports no game                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const ALIASES: readonly (readonly [string, string])[] = [
  ['@/', 'src/'],
  ['@es/sim', 'packages/sim'],
  ['@es/play', 'packages/play'],
  ['@es/ledger', 'packages/ledger'],
  ['@es/schema', 'packages/schema'],
]

/** The repository file an import names, or null for a package outside the repository. */
function resolve(from: string, spec: string): string | null {
  let base: string | null = null
  if (spec.startsWith('.')) base = path.join(path.dirname(from), spec)
  for (const [alias, target] of ALIASES) if (spec === alias.replace(/\/$/, '') || spec.startsWith(alias)) base = path.join(repo, target + spec.slice(alias.length))
  if (base === null) return null
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx'), base]) if (existsSync(candidate) && /\.(tsx?|css|json)$/.test(candidate)) return candidate
  return null
}

/** Every repository file a module reaches through its imports, static or dynamic. */
function closure(start: string): Set<string> {
  const seen = new Set<string>()
  const queue = [start]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file) || /\.(css|json)$/.test(file)) continue
    seen.add(file)
    // A type-only import is erased from the build, so it reaches nothing.
    const text = readFileSync(file, 'utf8').replace(/(?:import|export)\s+type\s[^;]*?from\s+['"][^'"]+['"]/gs, '')
    for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      const next = resolve(file, match[1])
      if (next !== null) queue.push(next)
    }
  }
  return seen
}

describe('Dock.tsx reaches no game', () => {
  test('nothing in its closure is a game’s file or a game’s rules: each game supplies its own view through the run it publishes', () => {
    const files = [...closure(path.join(repo, 'src/content/render/Dock.tsx'))].map((file) => path.relative(repo, file))
    expect(files).toContain('src/content/render/Dock.tsx')
    expect(files).toContain('src/games/kit/RunContext.tsx')
    const games = files.filter((file) => /^src\/games\/(?!kit\/)/.test(file) || /^packages\/play\/(?!index|types)[^/]+\//.test(file))
    expect(games).toEqual([])
  })
})
