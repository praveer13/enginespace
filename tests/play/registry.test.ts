/*
 * The registry (ARCHITECTURE §6.3, D-049): the records of the games, the keys common to every game, and the component registry that
 * maps the same ids to lazy components and to a loader of each game's record, which `/play/:game` loads instead of every record.
 *
 * Three of these tests read the documents, so a change to a document without the code, or the reverse, fails here:
 *   - the common keys are the ones ARCHITECTURE §6.8 lists;
 *   - every registered game carries the display name and subtitle that D-049's table gives it;
 *   - the two game modes are packages/schema's, which this package may import only as types.
 */
import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { GAME_MODES as SCHEMA_GAME_MODES } from '@es/schema/content'
import { COMMON_KEYS, GAMES, GAME_MODES, PHASES, PHASE_NAMES, createRegistry, keyProblems, keymapOf, levelOf } from '@es/play'
import type { KeyBinding } from '@es/play'
import { GAME_COMPONENTS, GAME_RECORDS, loadGame, resolveGame, type GameComponent, type RecordLoader } from '@/games/registry'
import { checkGames, checkRecordLoader, filesAt, worldAt } from '../../scripts/verify-games'
import { backticked, between, read } from '../ci/support'
import { TOY, memoryFiles, toyFiles } from './support'

const key = (id: string, code: string, extra: Partial<KeyBinding> = {}): KeyBinding => ({ id, code, label: id.toUpperCase(), description: `does ${id}`, ...extra })

describe('the common keys', () => {
  test('are the ones ARCHITECTURE §6.8 lists, key for key', () => {
    const section = between(read('docs/ARCHITECTURE.md'), '### 6.8 Input', '### 6.9')
    const bullet = section.split('\n').find((line) => line.includes('common to every game:'))
    if (bullet === undefined) throw new Error('ARCHITECTURE §6.8 no longer says "common to every game:"')
    expect(COMMON_KEYS.map((binding) => binding.label).sort()).toEqual(backticked(bullet).sort())
  })

  test('are matched by the physical key, with the help key matched by its character too', () => {
    expect(Object.fromEntries(COMMON_KEYS.map((binding) => [binding.id, binding.code]))).toEqual({
      'play-pause': 'Space',
      step: 'Period',
      'step-back': 'Comma',
      'stage-prev': 'BracketLeft',
      'stage-next': 'BracketRight',
      camera: 'KeyC',
      view: 'KeyV',
      help: 'Slash',
    })
    const help = COMMON_KEYS.find((binding) => binding.id === 'help')
    expect(help).toMatchObject({ shift: true, key: '?' })
  })

  test('are frozen, valid keys of their own, and put first in a game\'s map', () => {
    expect(Object.isFrozen(COMMON_KEYS)).toBe(true)
    expect(keyProblems([])).toEqual([])
    expect(keymapOf(TOY).map((binding) => binding.id)).toEqual([...COMMON_KEYS.map((binding) => binding.id), 'add-three'])
  })
})

describe('keyProblems', () => {
  test('accepts a game\'s own keys', () => {
    expect(keyProblems([key('overlap', 'KeyO'), key('graph-mode', 'KeyG'), key('place', 'Enter'), key('next', 'ArrowDown')])).toEqual([])
  })

  test('refuses a common key\'s id or physical key, and a key another of the game\'s already has', () => {
    expect(keyProblems([key('view', 'KeyX')])).toEqual([expect.stringContaining('the id is already taken')])
    expect(keyProblems([key('mine', 'KeyC')])).toEqual([expect.stringContaining('KeyC is already the key for "camera"')])
    expect(keyProblems([key('a', 'Space')])).toEqual([expect.stringContaining('Space is already the key for "play-pause"')])
    expect(keyProblems([key('a', 'KeyO'), key('b', 'KeyO')])).toEqual([expect.stringContaining('KeyO is already the key for "a"')])
    expect(keyProblems([key('a', 'KeyO'), key('a', 'KeyP')])).toEqual([expect.stringContaining('the id is already taken')])
  })

  test('tells a shifted key from the same key unshifted', () => {
    expect(keyProblems([key('wide', 'Slash')])).toEqual([])
    expect(keyProblems([key('also-help', 'Slash', { shift: true })])).toEqual([expect.stringContaining('Slash+Shift is already the key for "help"')])
  })

  test('refuses keys that would trap focus or only modify, and codes that are not codes', () => {
    for (const code of ['Tab', 'ShiftLeft', 'ControlRight', 'AltLeft', 'MetaLeft', 'CapsLock', 'ContextMenu']) {
      expect([code, keyProblems([key('x', code)])]).toEqual([code, [expect.stringContaining('may not bind it')]])
    }
    for (const code of ['', 'key c', 'Key-C', '1']) expect([code, keyProblems([key('x', code)]).length]).toEqual([code, 1])
  })

  test('wants a slug id, a label and a description for the help dialog', () => {
    expect(keyProblems([key('Not A Slug', 'KeyO')])).toEqual([expect.stringContaining('the id must be a slug')])
    expect(keyProblems([{ ...key('a', 'KeyO'), label: ' ' }])).toEqual([expect.stringContaining('needs a label')])
    expect(keyProblems([{ ...key('a', 'KeyO'), description: '' }])).toEqual([expect.stringContaining('needs a description')])
  })
})

describe('createRegistry', () => {
  test('looks games up by id, and an id such as constructor is not a game', () => {
    const registry = createRegistry([TOY])
    expect(registry.get('toy')).toBe(TOY)
    expect(registry.has('toy')).toBe(true)
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '', 'Toy']) {
      expect([name, registry.has(name), registry.get(name)]).toEqual([name, false, undefined])
    }
  })

  test('refuses two games with one id, because a ref play:<game>/<level> would name both', () => {
    expect(() => createRegistry([TOY, { ...TOY, title: 'Another' }])).toThrow('two games are registered as "toy"')
  })

  test('lists the games in the order given, and its list cannot be changed from outside', () => {
    const registry = createRegistry([TOY, { ...TOY, id: 'other' }])
    expect(registry.games.map((game) => game.id)).toEqual(['toy', 'other'])
    expect(Object.isFrozen(registry.games)).toBe(true)
  })

  test('levelOf finds a level of a game, or nothing', () => {
    expect(levelOf(TOY, 'pile')?.title).toBe('The pile')
    expect(levelOf(TOY, 'nope')).toBeUndefined()
    expect(levelOf(TOY, 'constructor')).toBeUndefined()
  })
})

describe('the games of the course', () => {
  /** D-049's table: id, display name and subtitle. */
  function displayNames(): Map<string, { title: string; subtitle: string }> {
    // D-063 adopts REDESIGN §2.7's table of titles and subtitles.
    const block = between(read('docs/REDESIGN.md'), '**Games**', '**Labs.**')
    const rows = block
      .split('\n')
      .filter((line) => line.trim().startsWith('|'))
      .slice(2)
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    return new Map(rows.map(([id, , title, subtitle]) => [id.replaceAll('`', ''), { title: title.replaceAll('**', ''), subtitle }]))
  }

  test('D-049\'s table is the nine games of ARCHITECTURE §6.1', () => {
    const table = displayNames()
    expect([...table.keys()].sort()).toEqual(['broken-bench', 'dispatch', 'engine-floor', 'gap-hunt', 'loop', 'pool', 'shape-shifter', 'switchyard', 'verifier'])
    expect(table.get('loop')).toEqual({ title: 'Step loop', subtitle: 'Keep every slot live, and never make the GPU wait for the CPU.' })
    const roster = between(read('docs/ARCHITECTURE.md'), '### 6.1 Roster', '### 6.2')
    for (const [id, { title }] of table) expect([id, roster.includes(`**${title}**`)]).toEqual([id, true])
  })

  test('every registered game carries its D-049 display name and subtitle, and only the nine ids are used', () => {
    const table = displayNames()
    for (const game of GAMES.games) {
      expect([game.id, table.has(game.id)]).toEqual([game.id, true])
      expect([game.id, { title: game.title, subtitle: game.subtitle }]).toEqual([game.id, table.get(game.id)])
    }
  })

  test('the component registry, its record loaders and the records list the same ids (verify:games says which is missing)', () => {
    expect(Object.keys(GAME_COMPONENTS).sort()).toEqual(GAMES.games.map((game) => game.id).sort())
    expect(Object.keys(GAME_RECORDS).sort()).toEqual(GAMES.games.map((game) => game.id).sort())
  })
})

describe('resolveGame and loadGame', () => {
  const component = {} as GameComponent
  const toy: RecordLoader = () => Promise.resolve(TOY)

  test('a game is its component and the loader of its record together; either missing makes it unknown', () => {
    expect(resolveGame('toy', { toy: component }, { toy })).toEqual({ kind: 'game', id: 'toy', record: toy, Component: component })
    expect(resolveGame('toy', {}, { toy })).toEqual({ kind: 'unknown', id: 'toy' })
    expect(resolveGame('toy', { toy: component }, {})).toEqual({ kind: 'unknown', id: 'toy' })
  })

  test('only own properties count: prototype names are unknown', () => {
    for (const id of ['constructor', 'toString', '__proto__']) {
      expect(resolveGame(id, {}, {}).kind).toBe('unknown')
      expect(resolveGame(id).kind).toBe('unknown')
    }
  })

  test('loadGame loads the one record that the id names, and no other game\'s', async () => {
    const asked: string[] = []
    const watched = (id: string, entry: typeof TOY): RecordLoader => () => {
      asked.push(id)
      return Promise.resolve(entry)
    }
    const records = { toy: watched('toy', TOY), other: watched('other', { ...TOY, id: 'other' }) }
    const components = { toy: component, other: component }
    expect(await loadGame('toy', components, records)).toEqual({ kind: 'game', id: 'toy', entry: TOY, Component: component })
    expect(asked).toEqual(['toy'])
    expect(await loadGame('nope', components, records)).toEqual({ kind: 'unknown', id: 'nope' })
    expect(asked).toEqual(['toy'])
  })

  test('a loader that brings the record of another id is not that game', async () => {
    expect(await loadGame('toy', { toy: component }, { toy: () => Promise.resolve({ ...TOY, id: 'other' }) })).toEqual({ kind: 'unknown', id: 'toy' })
  })

  test('each game of the course loads its own record, the one GAMES holds, and its page shows its display name', async () => {
    for (const game of GAMES.games) {
      const loaded = await loadGame(game.id)
      expect([game.id, loaded.kind === 'game' ? loaded.entry : null]).toEqual([game.id, game])
      expect(loaded.kind === 'game' && loaded.entry === game).toBe(true)
    }
    expect(await loadGame('constructor')).toEqual({ kind: 'unknown', id: 'constructor' })
  })

  test('src/games/registry.ts reads no value of packages/play: it imports types alone, and loads each record by the game\'s own record.ts', () => {
    const imports = (file: string) =>
      [...read(file).matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)].map((match) => ({ type: match[1] !== undefined, from: match[2] }))
    const source = read('src/games/registry.ts')
    expect(imports('src/games/registry.ts').filter((line) => !line.type && line.from.startsWith('@es/play'))).toEqual([])
    expect(source).not.toMatch(/\bGAMES\b(?!`)/)
    const loaded = [...source.matchAll(/import\('(\.\/[^']+\/record)'\)/g)].map((match) => match[1]).sort()
    expect(loaded).toEqual(GAMES.games.map((game) => `./${game.id}/record`).sort())
    // A game's record.ts imports its own entry.ts and nothing else that holds a value.
    for (const game of GAMES.games) {
      const values = imports(`src/games/${game.id}/record.ts`).filter((line) => !line.type).map((line) => line.from)
      expect([game.id, values]).toEqual([game.id, [`@es/play/${game.id}/entry`]])
    }
  })

  test("each game loads through its own record.ts alone: the registry imports no Game.tsx, and a record.ts loads its own game's component", () => {
    // The chunk of src/games/registry.ts is in every game's route, so it names one file per game (tests/build.test.ts holds the build).
    expect(read('src/games/registry.ts')).not.toMatch(/import\('\.\/[^']+\/Game'\)/)
    for (const game of GAMES.games) expect([game.id, [...read(`src/games/${game.id}/record.ts`).matchAll(/import\('([^']+)'\)/g)].map((match) => match[1])]).toEqual([game.id, ['./Game']])
  })
})

describe('verify:games over the record loaders', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const gate = (records: Record<string, RecordLoader>, componentIds = ['toy']) =>
    checkGames({ games: [TOY], componentIds, records, files: memoryFiles(toyFiles()), world: {} }).then((report) => report.findings.map((finding) => finding.message))

  test('passes when the loaders, the components and the records list the same ids, and each loader brings its record', async () => {
    expect(await gate({ toy: () => Promise.resolve(TOY) })).toEqual([])
  })

  test('fails a game with no loader of its record, and a loader of a game that is not registered', async () => {
    expect(await gate({})).toEqual([
      'src/games/registry.ts has a component for "toy" and no loader of its record',
      'it has no loader of its record in src/games/registry.ts (GAME_RECORDS)',
    ])
    expect(await gate({ toy: () => Promise.resolve(TOY), ghost: () => Promise.resolve({ ...TOY, id: 'ghost' }) })).toEqual([
      'src/games/registry.ts has a record loader for "ghost", which packages/play/registry.ts does not list',
    ])
  })

  test('fails a component with no record loader even where the records list it, and a loader of another record', async () => {
    expect(await gate({ toy: () => Promise.resolve(TOY) }, ['toy', 'ghost'])).toEqual([
      'src/games/registry.ts has a component for "ghost", which packages/play/registry.ts does not list',
      'src/games/registry.ts has a component for "ghost" and no loader of its record',
    ])
    expect(await checkRecordLoader(TOY, { toy: () => Promise.resolve({ ...TOY, id: 'other' }) })).toEqual([
      'the loader of its record in src/games/registry.ts brings a record with "other" that is not the one packages/play/registry.ts lists',
    ])
    expect(await checkRecordLoader(TOY, { toy: () => Promise.reject(new Error('gone')) })).toEqual(['the loader of its record in src/games/registry.ts failed: gone'])
  })

  test('over this checkout, the three lists agree and each loader brings the record GAMES holds', async () => {
    const report = await checkGames({ games: GAMES.games, componentIds: Object.keys(GAME_COMPONENTS), records: GAME_RECORDS, files: filesAt(root), world: worldAt(root) })
    expect(report.findings).toEqual([])
    expect(Object.keys(GAME_RECORDS).sort()).toEqual(GAMES.games.map((game) => game.id).sort())
  }, 120_000)
})

describe('the vocabulary', () => {
  test('the two modes are packages/schema\'s, in the same order', () => {
    expect([...GAME_MODES]).toEqual([...SCHEMA_GAME_MODES])
  })

  test('the play sequence is Play, Debrief, Compose, In production, Build this', () => {
    expect(PHASES.map((phase) => PHASE_NAMES[phase])).toEqual(['Play', 'Debrief', 'Compose', 'In production', 'Build this'])
  })
})
