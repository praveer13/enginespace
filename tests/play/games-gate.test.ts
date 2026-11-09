/*
 * W0-T14 acceptance check 1: a toy game registered in the tests passes `verify:games`, and removing its mirror, 2D view, card,
 * keyboard map or display name fails the gate.
 *
 * The gate is `checkGames`, a function over the games, the component ids, a view of the files and the world's ids. These tests give
 * it the toy of support.ts and a tree held in memory, take one part away at a time, and expect exactly that part to be named. The
 * last tests run the command line on this checkout, and through the gate registry.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GAMES } from '@es/play'
import type { AnySession, GameEntry } from '@es/play'
import { BAND_CANDIDATES, checkEntry, checkFiles, checkGames, checkSession, filesAt, readGameSource, worldAt } from '../../scripts/verify-games'
import type { GateInput, Report } from '../../scripts/verify-games'
import { GAME_TSX, PRACTICE_SEED, TOY, TOY_3D, memoryFiles, toyFiles, toySession } from './support'

// The gate measures every registered game's band on four hundred seeds a level, and the Reach-In's nights are simulations: it takes seconds, and several on a loaded host.
setDefaultTimeout(120_000)

const root = path.resolve(import.meta.dirname, '../..')

/** The gate over the toy, with parts taken away or changed. */
function gate(over: { entry?: Partial<GameEntry>; files?: Map<string, string>; componentIds?: string[]; world?: GateInput['world'] } = {}): Promise<Report> {
  return checkGames({
    games: [{ ...TOY, ...over.entry }],
    componentIds: over.componentIds ?? ['toy'],
    files: memoryFiles(over.files ?? toyFiles()),
    world: over.world ?? {},
  })
}
const without = (...names: string[]) => {
  const files = toyFiles()
  for (const name of names) files.delete(name)
  return files
}
const said = (report: Report) => report.findings.map((finding) => finding.message)

describe('the toy game passes', () => {
  test('with every part, the gate has nothing to say', async () => {
    const report = await gate()
    expect(said(report)).toEqual([])
  })

  test('and it prints what it measured: the practice seed in band, and the share of seeds in band against the floor', async () => {
    const report = await gate()
    const lines = report.lines.get('toy') ?? []
    expect(lines[0]).toBe('Counting House · adding up to a mark')
    expect(lines.some((line) => line.startsWith(`pile: practice seed ${PRACTICE_SEED} in band; `) && line.includes(`of the first ${BAND_CANDIDATES} seeds in band (floor 20%)`))).toBe(true)
    expect(lines).toContain('keys: 8 common + 1 of its own')
  })

  test('the claims registry and the KC graph are not built yet, and the gate says it did not check them', async () => {
    const report = await gate()
    expect(report.notes).toEqual([expect.stringContaining('W0-T08'), expect.stringContaining('W1-T03')])
  })
})

describe('removing a part of the toy fails the gate, and names that part', () => {
  const removals: [string, Parameters<typeof gate>[0], RegExp][] = [
    ['its mirror', { files: without('src/games/toy/Mirror.tsx') }, /the DOM mirror is missing: src\/games\/toy\/Mirror\.tsx/],
    ['its 2D view', { files: without('src/games/toy/View2D.tsx') }, /the 2D view is missing: src\/games\/toy\/View2D\.tsx/],
    ['its card file', { files: without('content/cards/toy-world.md') }, /the notional-machine card is missing: content\/cards\/toy-world\.md/],
    ['its card id', { entry: { card: '' } }, /no notional-machine card/],
    ['its keyboard map', { entry: { keys: [] } }, /no keyboard map/],
    ['its display name', { entry: { title: '' } }, /no display name \(D-049\)/],
    ['its subtitle', { entry: { subtitle: '' } }, /no subtitle \(D-049\)/],
    ['its debrief', { files: without('src/games/toy/Debrief.tsx') }, /the debrief is missing: src\/games\/toy\/Debrief\.tsx/],
    ['its controls', { files: without('src/games/toy/Controls.tsx') }, /the controls are missing: src\/games\/toy\/Controls\.tsx/],
    ['its Game.tsx', { files: without('src/games/toy/Game.tsx') }, /the game component is missing: src\/games\/toy\/Game\.tsx/],
  ]
  for (const [name, over, expected] of removals) {
    test(name, async () => {
      const messages = said(await gate(over))
      expect(messages.length).toBeGreaterThan(0)
      expect(messages.some((message) => expected.test(message))).toBe(true)
    })
  }

  test('a title or subtitle of blanks counts as none, and so does a subtitle that only repeats the title', async () => {
    expect(said(await gate({ entry: { title: '   ' } })).some((message) => message.includes('no display name'))).toBe(true)
    expect(said(await gate({ entry: { subtitle: '\t' } })).some((message) => message.includes('no subtitle'))).toBe(true)
    expect(said(await gate({ entry: { subtitle: 'counting house' } }))).toEqual([expect.stringContaining('repeats the display name')])
  })

  test('each finding is attributed to the game, so a registry of many names which one', async () => {
    const report = await gate({ files: without('src/games/toy/Mirror.tsx') })
    expect(report.findings.every((finding) => finding.game === 'toy')).toBe(true)
  })
})

describe('Game.tsx must render what the registry promises', () => {
  const withGame = (text: string, entry: Partial<GameEntry> = {}) => gate({ entry, files: toyFiles({ 'src/games/toy/Game.tsx': text }) })

  test('each part is rendered as a tag', async () => {
    for (const part of ['View2D', 'Mirror', 'Controls', 'Debrief']) {
      const messages = said(await withGame(GAME_TSX.replaceAll(`<${part} `, '<Other ')))
      expect(messages).toEqual([`src/games/toy/Game.tsx never renders <${part}>`])
    }
  })

  test('it has a default export, which the component registry loads', async () => {
    expect(said(await withGame(GAME_TSX.replace('export default function Game', 'export function Game')))).toEqual([expect.stringContaining('no default export')])
    expect(said(await withGame(GAME_TSX.replace('export default function Game', 'function Game') + '\nexport default Game\n'))).toEqual([])
  })

  test('a 3D game has a scene file that Game.tsx renders, loaded through import() and never statically', async () => {
    const files = toyFiles({ 'src/games/toy/Scene3D.tsx': 'export default function Scene3D() { return null }\n' })
    expect(said(await gate({ entry: { has3d: true }, files }))).toEqual([])
    expect(said(await gate({ entry: { has3d: true } }))).toEqual([expect.stringContaining('the 3D scene is missing: src/games/toy/Scene3D.tsx')])
    const eager = GAME_TSX.replace("const Scene3D = lazy(() => import('./Scene3D'))", "import Scene3D from './Scene3D'")
    expect(said(await gate({ entry: { has3d: true }, files: toyFiles({ 'src/games/toy/Scene3D.tsx': 'export default 0', 'src/games/toy/Game.tsx': eager }) }))).toEqual([
      expect.stringContaining('imports Scene3D statically'),
    ])
    const never = GAME_TSX.replace('<Scene3D run={run} />', '<Other />')
    expect(said(await gate({ entry: { has3d: true }, files: toyFiles({ 'src/games/toy/Scene3D.tsx': 'export default 0', 'src/games/toy/Game.tsx': never }) }))).toEqual([
      'src/games/toy/Game.tsx never renders <Scene3D>',
    ])
  })

  test('a scene file for a game that says it has no 3D is dead code, and fails', async () => {
    const files = toyFiles({ 'src/games/toy/Scene3D.tsx': 'export default 0' })
    expect(said(await gate({ files }))).toEqual([expect.stringContaining('the entry says the game has no 3D')])
  })

  test('a type-only import of the scene is no static import', () => {
    const source = readGameSource('Game.tsx', "import type { Props } from './Scene3D'\nexport default function Game() { return <View2D /> }\n")
    expect(source.staticImports).toEqual([])
    expect(source.tags.has('View2D')).toBe(true)
    expect(source.defaultExport).toBe(true)
  })
})

describe('the two registries list the same ids', () => {
  test('a game with no component fails, and so does a component with no game', async () => {
    expect(said(await gate({ componentIds: [] }))).toEqual(['it has no component in src/games/registry.ts'])
    const orphan = await gate({ componentIds: ['toy', 'ghost-town'] })
    expect(orphan.findings).toEqual([{ game: null, message: expect.stringContaining('a component for "ghost-town"') }])
  })

  test('two games with one id fail', async () => {
    const report = await checkGames({ games: [TOY, TOY], componentIds: ['toy'], files: memoryFiles(toyFiles()), world: {} })
    expect(said(report)).toContain('two games are registered as "toy"')
  })

  test('with no games at all there is nothing to fail', async () => {
    expect(await checkGames({ games: [], componentIds: [], files: memoryFiles(new Map()), world: {} })).toMatchObject({ findings: [] })
  })
})

describe('the entry', () => {
  test('is checked for its identity, modules, KCs, sources, levels and keys', () => {
    expect(checkEntry(TOY)).toEqual([])
    const cases: [Partial<GameEntry>, RegExp][] = [
      [{ id: 'Not A Slug' }, /must be a slug/],
      [{ modules: [] }, /names no module/],
      [{ modules: ['tr9'] }, /"tr9" is not a module id/],
      [{ kcs: [] }, /names no KC/],
      [{ kcs: ['nope'] }, /"nope" is not a KC id/],
      [{ claims: [] }, /cites no claim/],
      [{ claims: ['one'] }, /"one" is not a claim id/],
      [{ card: 'Not A Slug' }, /no notional-machine card/],
      [{ levels: [] }, /has no level/],
      [{ levels: [{ id: 'pile', title: 'x', graded: false, practiceSeed: -1 }] }, /pinned practice seed/],
      [{ levels: [{ id: 'pile', title: 'x', graded: false, practiceSeed: 1.5 }] }, /pinned practice seed/],
      [{ levels: [{ id: 'pile', title: '', graded: false, practiceSeed: 1 }] }, /has no title/],
      [{ levels: [{ id: 'Bad', title: 'x', graded: false, practiceSeed: 1 }] }, /must be a slug/],
      [{ levels: [TOY.levels[0], TOY.levels[0]] }, /listed twice/],
      [{ keys: [{ id: 'camera', code: 'KeyX', label: 'X', description: 'x' }] }, /already taken/],
      [{ keys: [{ id: 'mine', code: 'Space', label: 'S', description: 'x' }] }, /already the key for "play-pause"/],
      [{ has3d: 'yes' as unknown as boolean }, /has3d must be true or false/],
      [{ session: undefined as unknown as GameEntry['session'] }, /no session loader/],
    ]
    for (const [change, expected] of cases) {
      const problems = checkEntry({ ...TOY, ...change })
      expect([change, problems.some((problem) => expected.test(problem))]).toEqual([change, true])
    }
  })
})

describe('the session', () => {
  const base: AnySession = toySession
  const check = (session: AnySession, candidates = 100) => checkSession(TOY, session, candidates)

  test('the toy keeps the contract', () => {
    const checked = check(base)
    expect(checked.problems).toEqual([])
    expect(checked.lines).toHaveLength(1)
  })

  test('a pinned practice seed that is out of band fails', () => {
    const outOfBand = { ...base, inBand: (_id: string, seed: number) => seed !== PRACTICE_SEED }
    expect(check(outOfBand).problems).toEqual([expect.stringContaining(`the pinned practice seed ${PRACTICE_SEED} is not in band`)])
  })

  test('a band that accepts under 20% of the seeds fails, and says so with the figure', () => {
    const narrow = { ...base, inBand: (_id: string, seed: number) => seed === PRACTICE_SEED }
    expect(check(narrow).problems).toEqual([expect.stringMatching(/^level pile: only 1% of the first 100 seeds are in band, under the 20% floor/)])
    const edge = { ...base, inBand: (_id: string, seed: number) => seed === PRACTICE_SEED || seed % 5 === 0 }
    expect(check(edge, 100).problems).toEqual([])
  })

  test('a reference that does not finish, or does not pass its own grade, fails', () => {
    expect(check({ ...base, ghost: (level: unknown) => base.init(level) }).problems).toContainEqual(expect.stringContaining('the reference does not finish the level'))
    expect(check({ ...base, grade: () => ({ score: 0.5, ok: false }) }).problems).toContainEqual(expect.stringContaining('does not pass its own level'))
    expect(check({ ...base, grade: () => ({ score: 2, ok: true }) }).problems).toContainEqual(expect.stringContaining('score in [0, 1]'))
  })

  test('a session that is not deterministic fails, whether its start or its reference moves', () => {
    let calls = 0
    const drifting = { ...base, init: (level: unknown) => ({ ...(base.init(level) as object), calls: (calls += 1) }) }
    expect(check(drifting).problems).toContainEqual(expect.stringContaining('two different starts'))
    let runs = 0
    const wandering = { ...base, ghost: (level: unknown) => ({ ...(base.ghost(level) as object), runs: (runs += 1) }) }
    expect(check(wandering).problems).toContainEqual(expect.stringContaining('two different runs on one seed'))
  })

  test('a run that is over before it starts, and a debrief with nothing to say, fail', () => {
    expect(check({ ...base, done: () => true }).problems).toContainEqual(expect.stringContaining('already over'))
    expect(check({ ...base, debrief: () => ({ sentence: ' ', names: null }) }).problems).toContainEqual(expect.stringContaining('no sentence'))
  })

  test('a missing method is named, and a method that throws is a finding and not a crash', () => {
    const incomplete: Record<string, unknown> = { ...base }
    delete incomplete.debrief
    expect(check(incomplete as unknown as AnySession).problems).toEqual([expect.stringContaining('lacks debrief')])
    const throws = { ...base, level: () => { throw new Error('boom') } }
    expect(check(throws).problems).toEqual(['level pile: the session threw: boom'])
  })

  test('a level the session does not have is a finding of the level', () => {
    const session = { ...base, inBand: () => true, level: (id: string, seed: number) => base.level(id === 'other' ? 'pile' : id, seed) }
    const two = { ...TOY, levels: [...TOY.levels, { id: 'other', title: 'Other', graded: false, practiceSeed: PRACTICE_SEED }] }
    expect(checkSession(two, session, 20).lines).toHaveLength(2)
  })

  test('a session that fails to load is reported by the gate with its reason', async () => {
    const broken = { ...TOY, session: async () => { throw new Error('no such chunk') } }
    const report = await checkGames({ games: [broken], componentIds: ['toy'], files: memoryFiles(toyFiles()), world: {} })
    expect(said(report)).toEqual(['its session did not load: no such chunk'])
  })
})

describe('the world\'s ids', () => {
  test('a KC or a claim that is not there fails once the graph and the claims files exist', async () => {
    const world = { kcIds: new Set(['tr2.other']), claimIds: new Set(['toy.other']) }
    expect(said(await gate({ world }))).toEqual(['the KC "tr2.toy-add" is not in content/kc/graph.yaml', 'the claim "toy.counting.rule" is not in content/claims'])
    const present = { kcIds: new Set(['tr2.toy-add']), claimIds: new Set(['toy.counting.rule']) }
    const report = await gate({ world: present })
    expect(said(report)).toEqual([])
    expect(report.notes).toEqual([])
  })

  test('one set can be known while the other is not', async () => {
    const report = await gate({ world: { claimIds: new Set(['toy.counting.rule']) } })
    expect(said(report)).toEqual([])
    expect(report.notes).toEqual([expect.stringContaining('W1-T03')])
  })
})

describe('this checkout', () => {
  const trees: string[] = []
  afterAll(() => trees.forEach((tree) => rmSync(tree, { recursive: true, force: true })))

  test('filesAt and worldAt read a tree: its files, its claim ids and its KC ids', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-games-'))
    trees.push(dir)
    for (const sub of ['content/claims', 'content/kc', 'src/games/toy']) mkdirSync(path.join(dir, sub), { recursive: true })
    writeFileSync(path.join(dir, 'content/claims/a.yaml'), '- id: a.one\n  value: 1\n- id: a.two\n  value: 2\n')
    writeFileSync(path.join(dir, 'content/claims/b.yaml'), '- id: b.one\n  value: 3\n')
    writeFileSync(path.join(dir, 'content/kc/graph.yaml'), '- id: tr2.one\n  description: x\n')
    writeFileSync(path.join(dir, 'src/games/toy/Game.tsx'), 'export default 0\n')
    const files = filesAt(dir)
    expect(files.exists('src/games/toy/Game.tsx')).toBe(true)
    expect(files.exists('src/games/toy/Mirror.tsx')).toBe(false)
    expect(files.read('src/games/toy/Game.tsx')).toBe('export default 0\n')
    const world = worldAt(dir)
    expect([...(world.claimIds ?? [])].sort()).toEqual(['a.one', 'a.two', 'b.one'])
    expect([...(world.kcIds ?? [])]).toEqual(['tr2.one'])
    expect(worldAt(path.join(dir, 'src'))).toEqual({ claimIds: undefined, kcIds: undefined })
  })

  test('checkFiles reads the real tree: a game that has no files here is told which ones it lacks', () => {
    const problems = checkFiles({ ...TOY_3D, id: 'nothing-here' }, filesAt(root))
    expect(problems.some((problem) => problem.includes('src/games/nothing-here/Scene3D.tsx'))).toBe(true)
    expect(problems.some((problem) => problem.includes('content/cards/toy-world.md'))).toBe(true)
    expect(problems).toHaveLength(7)
  })

  /** The graded levels of the registered games: each has a line that says what the best blind strategy passed against the bound (ASSESSMENT §4.1). */
  const blindLines = (stdout: string): string[] =>
    GAMES.games.flatMap((game) => game.levels.filter((level) => level.graded).map((level) => `${level.id}: best blind strategy passes `)).filter((line) => !stdout.includes(line))

  test('`bun scripts/verify-games.ts` passes on this checkout and says how many games it checked', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-games.ts'], { cwd: root, encoding: 'utf8' })
    expect(`${result.stdout}${result.stderr}`).toContain('verify-games: ')
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/^verify-games: \d+ games? registered, \d+ components?/)
    expect(result.stdout).toContain('verify-games: ok')
    // And it measures ASSESSMENT §4.1's blind-strategy bound on every graded level of every game (W1b-T12): twelve of them.
    expect(GAMES.games.flatMap((game) => game.levels.filter((level) => level.graded))).toHaveLength(12)
    expect(blindLines(result.stdout)).toEqual([])
    expect(result.stdout.match(/best blind strategy passes /g)).toHaveLength(12)
    expect(result.stdout).toContain('against the bound of 15.0% [estimated]')
  })

  test('the gate registry runs it: `bun scripts/verify.ts games` is live and passes', () => {
    const result = spawnSync(process.execPath, ['scripts/verify.ts', 'games'], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('$ bun scripts/verify-games.ts')
    expect(result.stdout).not.toContain('pending')
    // The registry's run is the one that CI and the merge gates make, so it measures the bound too.
    expect(blindLines(result.stdout)).toEqual([])
  })
})
