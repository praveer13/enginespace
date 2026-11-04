/*
 * The registry (ARCHITECTURE §6.3, D-049): the records of the games, the keys common to every game, and the component registry that
 * maps the same ids to lazy components.
 *
 * Three of these tests read the documents, so a change to a document without the code, or the reverse, fails here:
 *   - the common keys are the ones ARCHITECTURE §6.8 lists;
 *   - every registered game carries the display name and subtitle that D-049's table gives it;
 *   - the two game modes are packages/schema's, which this package may import only as types.
 */
import { describe, expect, test } from 'bun:test'
import { GAME_MODES as SCHEMA_GAME_MODES } from '@es/schema/content'
import { COMMON_KEYS, GAMES, GAME_MODES, PHASES, PHASE_NAMES, createRegistry, keyProblems, keymapOf, levelOf } from '@es/play'
import type { KeyBinding } from '@es/play'
import { GAME_COMPONENTS, resolveGame, type GameComponent } from '@/games/registry'
import { backticked, between, read } from '../ci/support'
import { TOY } from './support'

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
    const decisions = read('docs/DECISIONS.md')
    const block = between(decisions, '### D-049', '### D-050')
    const rows = block
      .split('\n')
      .filter((line) => line.trim().startsWith('|'))
      .slice(2)
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    return new Map(rows.map(([id, title, subtitle]) => [id.replaceAll('`', ''), { title, subtitle }]))
  }

  test('D-049\'s table is the nine games of ARCHITECTURE §6.1', () => {
    const table = displayNames()
    expect([...table.keys()].sort()).toEqual(['broken-bench', 'dispatch', 'engine-floor', 'gap-hunt', 'loop', 'pool', 'shape-shifter', 'switchyard', 'verifier'])
    expect(table.get('loop')).toEqual({ title: 'Service', subtitle: 'the step loop' })
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

  test('the component registry and the records list the same ids (verify:games says which half is missing)', () => {
    expect(Object.keys(GAME_COMPONENTS).sort()).toEqual(GAMES.games.map((game) => game.id).sort())
  })
})

describe('resolveGame', () => {
  const component = {} as GameComponent

  test('a game is its record and its component together; either missing makes it unknown', () => {
    const registry = createRegistry([TOY])
    expect(resolveGame('toy', registry, { toy: component })).toEqual({ kind: 'game', id: 'toy', entry: TOY, Component: component })
    expect(resolveGame('toy', registry, {})).toEqual({ kind: 'unknown', id: 'toy' })
    expect(resolveGame('toy', createRegistry([]), { toy: component })).toEqual({ kind: 'unknown', id: 'toy' })
  })

  test('only own properties count: prototype names are unknown', () => {
    const registry = createRegistry([{ ...TOY, id: 'constructor' }])
    for (const id of ['constructor', 'toString', '__proto__']) expect(resolveGame(id, registry, {}).kind).toBe('unknown')
  })
})

describe('the vocabulary', () => {
  test('the two modes are packages/schema\'s, in the same order', () => {
    expect([...GAME_MODES]).toEqual([...SCHEMA_GAME_MODES])
  })

  test('the play sequence is Play, Debrief, Compose, In production, Build this', () => {
    expect(PHASES.map((phase) => PHASE_NAMES[phase])).toEqual(['Play', 'Debrief', 'Compose', 'In production', 'Build this'])
  })
})
