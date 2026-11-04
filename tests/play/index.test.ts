/*
 * The package's public surface. Two star exports that give one name twice would drop it without a word, so this lists every
 * value a caller may count on (the types leave no trace at run time).
 */
import { expect, test } from 'bun:test'
import * as play from '@es/play'

const VALUES = [
  // types.ts
  'GAME_MODES',
  'PHASES',
  'PHASE_NAMES',
  // registry.ts
  'COMMON_KEYS',
  'keymapOf',
  'keyProblems',
  'createRegistry',
  'GAMES',
  'levelOf',
  'regradeStored',
  // replay.ts
  'startRun',
  'applyAction',
  'undoAction',
  'replay',
  'finishRun',
  'regrade',
  'MAX_DRAWS',
  'drawInBand',
  'encodeActions',
  'decodeActions',
  'playRef',
  'storedRunOf',
  'stateHash',
]

test('@es/play exports exactly these values', () => {
  expect(Object.keys(play).sort()).toEqual([...VALUES].sort())
})

test('every one of them is defined', () => {
  for (const name of VALUES) expect([name, (play as Record<string, unknown>)[name] !== undefined]).toEqual([name, true])
})
