/*
 * R-T45, "Show on the machine": a figure may carry a `replay` (a game, a level, a seed and a list of actions), and in a lesson with a dock it gains a
 * button that loads that state into the dock, with "Back to my run". This holds the block's shape in the schema, the compiler's replay of each figure's
 * actions on the pure session, the dock's view of a figure's state and the way back, and which lessons use it. e2e/show-on-machine.spec.ts holds the
 * button in a browser, at both widths.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { statSync } from 'node:fs'
import path from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BLOCK_TYPES, blockBodySchemas } from '@es/schema'
import Dock from '@/content/render/Dock'
import { forgetRuns, latestRun, nextTouch, publishRun, retireRun, type LiveRun } from '@/games/kit/RunContext'
import { loadReplayDock } from '@/games/replay-dock'
import { compileContent } from '../../scripts/content/build.ts'
import { checkReplay } from '../../scripts/content/replay.ts'
import { errors, lineOf, project, read, repo, swap, LESSON, readSample } from './support.ts'

const compile = (edits: Parameters<typeof project>[0] = {}) => compileContent({ root: project(edits), replay: checkReplay })

const figure = {
  src: 'figures/tr2/l1-one-step.svg',
  alt: 'Two engine steps',
  description: 'Two steps on two lanes.',
  origin: 'generated',
}
const replay = { game: 'loop', level: 'first-3-gap', seed: 1, actions: [{ t: 'run', until: 'step' }] }
const parse = (value: unknown) => blockBodySchemas.figure.safeParse(value)

describe('the schema', () => {
  test('takes a figure with no replay, and with one', () => {
    expect(parse(figure).success).toBe(true)
    expect(parse({ ...figure, replay }).success).toBe(true)
  })

  test('rejects an unknown game, a missing seed, an action with no kind, an action holding a list or a key it does not have, an empty log and a key it does not know', () => {
    const bad = [
      { ...replay, game: 'chess' },
      { game: 'loop', level: 'first-3-gap', actions: replay.actions },
      { ...replay, actions: [{ until: 'step' }] },
      { ...replay, actions: [{ t: 'admit', req: [1] }] },
      { ...replay, actions: [{ t: 'run', until: 'step', speed: 2 }] },
      { ...replay, actions: [] },
      { ...replay, speed: 2 },
    ]
    for (const value of bad) expect([JSON.stringify(value), parse({ ...figure, replay: value }).success]).toEqual([JSON.stringify(value), false])
  })

  test('the block types are still eight', () => {
    expect(BLOCK_TYPES).toHaveLength(8)
  })
})

describe('the compiler replays each figure', () => {
  const sample = readSample(LESSON)
  const withReplay = (body: string) => swap('origin: authored\n:::', `origin: authored\nreplay:\n${body}\n:::`)

  test('takes a log that replays, and writes it into the lesson', () => {
    const result = compile({ [LESSON]: withReplay('  game: loop\n  level: first-3-gap\n  seed: 1\n  actions:\n    - { t: run, until: step }') })
    expect(errors(result)).toEqual([])
  })

  const cases: [string, string, RegExp][] = [
    ['a level the game does not have', '  game: loop\n  level: first-9-nothing\n  seed: 1\n  actions:\n    - { t: run, until: step }', /does not replay on loop.*no level/],
    ['an action the game does not have', '  game: loop\n  level: first-3-gap\n  seed: 1\n  actions:\n    - { t: dance }', /action 0 \(dance\) is illegal/],
    ['an action the state refuses', '  game: loop\n  level: first-3-gap\n  seed: 1\n  actions:\n    - { t: run, until: step }\n    - { t: admit, req: 99 }', /action 1 \(admit\) is illegal/],
  ]
  for (const [name, body, message] of cases) {
    test(`fails on ${name}, on the line of the replay`, () => {
      const result = compile({ [LESSON]: withReplay(body) })
      const found = errors(result).filter((d) => d.code === 'replay')
      expect(found).toHaveLength(1)
      expect(found[0].message).toMatch(message)
      expect(found[0].line).toBeGreaterThanOrEqual(lineOf(sample, 'src: figures/tr2/l0-sample.svg'))
    })
  }
})

/** The lessons that use it, and the level each shows. */
const USES: Record<string, string> = { 'tr2.l1': 'first-3-gap', 'tr2.l3': 'first-4-par' }

describe('the course', () => {
  const compiled = compileContent({ root: repo, replay: checkReplay })
  const lessons = compiled.outputs.filter((output) => output.path.startsWith('src/content/generated/lessons/')).map((output) => ({ path: output.path, json: JSON.parse(output.text) as { id: string; blocks: { type: string; replay?: { level: string } }[] } }))

  test('TR2 lessons 1 and 3 each use it once, and no other lesson does', () => {
    const used = Object.fromEntries(
      lessons.flatMap(({ json }) => {
        const n = json.blocks.filter((block) => block.type === 'figure' && block.replay !== undefined)
        return n.length === 0 ? [] : [[json.id, n.map((block) => block.replay?.level)]]
      }),
    )
    expect(used).toEqual(Object.fromEntries(Object.entries(USES).map(([id, level]) => [id, [level]])))
  })

  test('each lesson stays at or under 40 KB of JSON', () => {
    for (const output of compiled.outputs.filter((o) => o.path.startsWith('src/content/generated/lessons/'))) {
      expect([output.path, Buffer.byteLength(output.text)]).toEqual([output.path, Math.min(Buffer.byteLength(output.text), 40 * 1024)])
    }
  })

  test('D-016 records that the block types are still eight', () => {
    const decisions = read('docs/DECISIONS.md')
    expect(decisions).toMatch(/R-T45[^\n]*still eight[^\n]*optional `replay`/)
  })
})

describe("the dock's view of a figure's state", () => {
  afterEach(forgetRuns)

  test('loads the state the actions lead to, as the dock draws a run', async () => {
    const dock = await loadReplayDock('loop', { level: 'first-3-gap', seed: 1, actions: [{ t: 'run', until: 'step' }, { t: 'run', until: 'step' }] })
    expect(dock.gameTitle).toBe('Step loop')
    expect(dock.turns).toBe(2)
    expect((dock.view as { step: number }).step).toBe(4)
    expect(dock.DockView).not.toBeNull()
  })

  test('refuses a game with no replay and a log that does not replay', async () => {
    await expect(loadReplayDock('chess', { level: 'x', seed: 1, actions: [] })).rejects.toThrow(/no replay/)
    await expect(loadReplayDock('loop', { level: 'first-3-gap', seed: 1, actions: [{ t: 'dance' }] })).rejects.toThrow(/illegal/)
  })

  const own = (over: Partial<LiveRun> = {}): LiveRun => ({
    place: { scope: 'tr2.l1', key: 'tr2.l1#4', anchor: 'run-4' },
    game: 'loop',
    gameTitle: 'Step loop',
    levelTitle: 'Close a bubble',
    mode: 'practice',
    view: {},
    done: false,
    turns: 3,
    canUndo: true,
    askOpen: false,
    step: { t: 'run' },
    stepWords: 'Step runs one step.',
    dispatch: () => undefined,
    undo: () => undefined,
    restart: () => undefined,
    DockView: null,
    touched: nextTouch(),
    ...over,
  })

  test("the dock shows the figure's state with no controls and a way back, and the learner's run is the same object afterwards", () => {
    const mine = own()
    publishRun(mine)
    const shown = own({
      place: { scope: 'tr2.l1', key: 'tr2.l1#figure-9', anchor: 'tr2.l1#figure-9' },
      levelTitle: 'Close a bubble',
      touched: nextTouch(),
      figure: { caption: 'Two engine steps', back: () => retireRun('tr2.l1#figure-9') },
    })
    publishRun(shown)
    const html = renderToStaticMarkup(h(Dock, { scope: 'tr2.l1' }))
    expect(html).toContain('data-dock-state="figure"')
    expect(html).toContain('On the machine')
    expect(html).toContain('Back to my run')
    expect(html).toContain('The state the figure draws: two engine steps')
    expect(html).not.toContain('>Step<')
    expect(html).not.toContain('>Undo<')

    shown.figure?.back()
    expect(latestRun('tr2.l1')).toBe(mine)
    const after = renderToStaticMarkup(h(Dock, { scope: 'tr2.l1' }))
    expect(after).toContain('data-dock-state="live"')
    expect(after).toContain('Your run')
    expect(after).toContain('Step runs one step.')
  })

  test('the lesson page reaches no game for the button: ShowOnMachine and the replay loader are chunks of their own', () => {
    const blocks = read('src/pages/Lesson.tsx')
    expect(blocks).toMatch(/lazy\(\(\) => import\('@\/content\/render\/ShowOnMachine'\)\)/)
    expect(blocks).not.toMatch(/from '@\/games\/replay-dock'/)
    expect(statSync(path.join(repo, 'src/games/loop/replayDock.tsx')).isFile()).toBe(true)
  })
})
