/*
 * Which key press is the viewer's (ARCHITECTURE §6.8, GAMES.md §2.3): the kit's three rules (src/games/kit/useGameInput.ts), written
 * for the controls this viewer has.
 *
 *   1. A key is matched by `event.code`, the physical key, with Ctrl, Alt and Meta never matching, so no browser or system shortcut
 *      is taken. A binding may also name the character it types (`key`), as `+` and `?` do, which a layout may put on another key.
 *   2. Native keys win. A key is left alone when the focused control uses it itself: every key in a text field, Space and Enter on a
 *      button, Enter on a link, and the keys that a widget says it reads of its own with `data-native-keys` (the span table's arrows).
 *   3. A press that is part of an IME composition, that another handler took, or that is the repeat of a key held down is not a new
 *      command. The moves of the paper are the exception: holding an arrow to feed the tape along is what the hand does.
 *
 * It is not the kit's file, because the viewer is not a game: it sits on the Trace Room's page and in lessons, and takes no part
 * in a game's shell. The two agree where they overlap, and the kit's own tests hold its side. These are plain functions over a
 * description of the press, so the tests need no DOM.
 */
import type { KeyBinding } from '@es/play'

/** What a key press carries. A KeyboardEvent has all of it, and a test builds one by hand. */
export interface KeyPress {
  readonly code: string
  readonly key: string
  readonly shiftKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
  readonly repeat: boolean
  readonly isComposing: boolean
  readonly defaultPrevented: boolean
  readonly target: unknown
  preventDefault(): void
}

/** The part of an element that the rules read. */
export interface KeyTarget {
  readonly tagName?: string
  readonly isContentEditable?: boolean
  getAttribute?(name: string): string | null
  closest?(selector: string): KeyTarget | null
}

const ACTIVATE = ['Space', 'Enter', 'NumpadEnter']

/** Whether the focused element uses this key itself, so that a shortcut must stay out of its way. */
export function ownsKey(target: unknown, code: string): boolean {
  if (typeof target !== 'object' || target === null) return false
  const element = target as KeyTarget
  const tag = (element.tagName ?? '').toLowerCase()
  const editable = element.getAttribute?.('contenteditable') ?? null
  if (element.isContentEditable === true || (editable !== null && editable !== 'false')) return true
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((tag === 'button' || tag === 'summary') && ACTIVATE.includes(code)) return true
  if (tag === 'a' && element.getAttribute?.('href') !== null && (code === 'Enter' || code === 'NumpadEnter')) return true
  const declared = element.closest?.('[data-native-keys]')?.getAttribute?.('data-native-keys')
  return declared !== undefined && declared !== null && declared.split(/\s+/).includes(code)
}

/** The binding a press stands for, or undefined. */
export function matchKey(keys: readonly KeyBinding[], press: KeyPress): KeyBinding | undefined {
  if (press.ctrlKey || press.altKey || press.metaKey) return undefined
  return keys.find((binding) => (binding.key !== undefined && press.key === binding.key) || (binding.code === press.code && (binding.shift === true) === press.shiftKey))
}

export interface KeyHandling {
  readonly keys: readonly KeyBinding[]
  /** Settings can turn shortcuts off (WCAG 2.1.4). */
  readonly enabled: boolean
  /** The ids of the commands that act again while their key is held. */
  readonly repeating: ReadonlySet<string>
  /** Called with a bound key's id. Return false when the command does not apply right now, so the key keeps its browser meaning. */
  readonly onCommand: (id: string) => boolean | void
}

/** One key press. Returns whether the viewer took the key, and has stopped the browser from acting on it when it did. */
export function handleKey(press: KeyPress, handling: KeyHandling): boolean {
  if (!handling.enabled || press.defaultPrevented || press.isComposing) return false
  const binding = matchKey(handling.keys, press)
  if (binding === undefined) return false
  if (press.repeat && !handling.repeating.has(binding.id)) return false
  if (ownsKey(press.target, press.code)) return false
  if (handling.onCommand(binding.id) === false) return false
  press.preventDefault()
  return true
}
