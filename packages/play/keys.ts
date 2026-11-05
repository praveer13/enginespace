/**
 * The keys every game answers to, and the lookup of a level in a game's record (ARCHITECTURE §6.3 and §6.8). They are a module of their
 * own, which registry.ts re-exports, so that what reads only these (the front page) does not pull in the registry and the record of
 * every game with them.
 */
import type { GameEntry, KeyBinding, LevelEntry } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Keys                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The keys every game answers to (ARCHITECTURE §6.8), so a learner who has played one game can drive the next. A game's own keys
 * go in its entry and may not reuse these. What each does is the game's call, except `view` and `help`, which the shell does.
 */
export const COMMON_KEYS: readonly KeyBinding[] = Object.freeze([
  { id: 'play-pause', code: 'Space', label: 'Space', description: 'Play or pause' },
  { id: 'step', code: 'Period', label: '.', description: 'Step forward' },
  { id: 'step-back', code: 'Comma', label: ',', description: 'Step back (practice levels)' },
  { id: 'stage-prev', code: 'BracketLeft', label: '[', description: 'Previous stage of the level' },
  { id: 'stage-next', code: 'BracketRight', label: ']', description: 'Next stage of the level' },
  { id: 'camera', code: 'KeyC', label: 'C', description: 'Cycle the camera preset' },
  { id: 'view', code: 'KeyV', label: 'V', description: 'Switch between the 2D and 3D views' },
  { id: 'help', code: 'Slash', shift: true, key: '?', label: '?', description: 'Show these keys' },
])

/** The keys the shell binds for a game: the common ones, then the game's own. */
export const keymapOf = (entry: { readonly keys: readonly KeyBinding[] }): readonly KeyBinding[] => [...COMMON_KEYS, ...entry.keys]

const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
/** Keys that move focus or only modify others: binding them would trap the keyboard (WCAG 2.1.2) or never fire. */
const RESERVED_CODE = /^(?:Tab|(?:Shift|Control|Alt|Meta|OS)(?:Left|Right)|CapsLock|ContextMenu)$/

/**
 * What is wrong with a game's own keys, in words, or an empty list. A key needs a slug id, a `KeyboardEvent.code`, a label and a
 * description, and must not reuse a common key's id or physical key, or another of the game's own.
 */
export function keyProblems(own: readonly KeyBinding[]): string[] {
  const problems: string[] = []
  const ids = new Set(COMMON_KEYS.map((key) => key.id))
  const chords = new Map(COMMON_KEYS.map((key) => [`${key.code}${key.shift === true ? '+Shift' : ''}`, key.id]))
  for (const key of own) {
    const name = key.id || '(no id)'
    if (!SLUG.test(key.id)) problems.push(`key "${name}": the id must be a slug such as overlap`)
    else if (ids.has(key.id)) problems.push(`key "${key.id}": the id is already taken (by a common key, or another of the game's)`)
    ids.add(key.id)
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key.code)) problems.push(`key "${name}": the code must be a KeyboardEvent.code such as KeyO, got "${key.code}"`)
    else if (RESERVED_CODE.test(key.code)) problems.push(`key "${name}": ${key.code} moves focus or only modifies, so a game may not bind it`)
    const chord = `${key.code}${key.shift === true ? '+Shift' : ''}`
    const taken = chords.get(chord)
    if (taken !== undefined) problems.push(`key "${name}": ${chord} is already the key for "${taken}"`)
    else chords.set(chord, name)
    if (key.label.trim() === '') problems.push(`key "${name}": it needs a label for the help dialog`)
    if (key.description.trim() === '') problems.push(`key "${name}": it needs a description for the help dialog`)
  }
  return problems
}

/** The level of a game with this id, or undefined. */
export const levelOf = (game: GameEntry, id: string): LevelEntry | undefined => game.levels.find((level) => level.id === id)
