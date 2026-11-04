import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { KeyBinding } from '@es/play'

/*
 * A game's keys (ARCHITECTURE §6.8, GAMES.md §2.3). Three rules decide whether a key press is the game's:
 *
 *   1. Keys are bound on the game's container, never on the window, so they act only while focus is inside the game
 *      (WCAG 2.1.4). A native listener on the container does not hear a dialog portalled out of it.
 *   2. A key is matched by `event.code`, the physical key, with Ctrl, Alt and Meta never matching, so no browser or system
 *      shortcut is taken. The help key also matches the character `?`, which the physical key does not give on every layout.
 *   3. Native keys win. A key is ignored when the focused control uses it: every key in a text field, `Space` and `Enter` on a
 *      button, the arrows in a radio group, a listbox or a slider. A widget that reads keys of its own says so with
 *      `data-native-keys` (`arrows`, `*`, or `Space Enter`), and the game's keys stay out of its way.
 *
 * The decisions are plain functions over a small description of the event, so the tests need no DOM. useGameInput is the
 * thin hook that binds them.
 */

/** What a key press carries. A KeyboardEvent has all of it, and a test builds one by hand. */
export interface GameKeyEvent {
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
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']
/** A control that reads every key. */
const ALL = '*'

/** The keys a widget with this ARIA role reads, where the role is on the focused element. */
const ROLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  button: ACTIVATE,
  switch: ACTIVATE,
  checkbox: ACTIVATE,
  link: ['Enter', 'NumpadEnter'],
  radio: [...ACTIVATE, ...ARROWS],
  radiogroup: ARROWS,
  tab: [...ACTIVATE, ...ARROWS],
  tablist: ARROWS,
  option: [...ACTIVATE, ...ARROWS],
  listbox: [...ACTIVATE, ...ARROWS],
  menu: [...ACTIVATE, ...ARROWS],
  menuitem: [...ACTIVATE, ...ARROWS],
  menuitemcheckbox: [...ACTIVATE, ...ARROWS],
  menuitemradio: [...ACTIVATE, ...ARROWS],
  slider: ARROWS,
  scrollbar: ARROWS,
  tree: [...ACTIVATE, ...ARROWS],
  treeitem: [...ACTIVATE, ...ARROWS],
  grid: [...ACTIVATE, ...ARROWS],
  gridcell: [...ACTIVATE, ...ARROWS],
  textbox: [ALL],
  searchbox: [ALL],
  combobox: [ALL],
  spinbutton: [ALL],
}

/** The keys an `<input>` of this type reads. A type that is not listed (and the default, text) reads every key. */
function inputKeys(type: string): readonly string[] {
  switch (type) {
    case 'button':
    case 'submit':
    case 'reset':
    case 'image':
    case 'file':
    case 'color':
      return ACTIVATE
    case 'checkbox':
      return ['Space']
    case 'radio':
      return [...ACTIVATE, ...ARROWS]
    case 'range':
      return ARROWS
    default:
      return [ALL]
  }
}

/** The keys named by a `data-native-keys` attribute: `*`, `arrows`, or key codes separated by spaces. */
function declaredKeys(value: string): readonly string[] {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => (token === 'arrows' ? ARROWS : [token]))
}

/** Every key the focused element reads for itself. */
function nativeKeys(target: KeyTarget): readonly string[] {
  const tag = (target.tagName ?? '').toLowerCase()
  const attribute = (name: string) => target.getAttribute?.(name) ?? null
  const keys: string[] = []
  const editable = attribute('contenteditable')
  if (target.isContentEditable === true || (editable !== null && editable !== 'false')) keys.push(ALL)
  if (tag === 'textarea' || tag === 'select') keys.push(ALL)
  else if (tag === 'input') keys.push(...inputKeys((attribute('type') ?? 'text').toLowerCase()))
  else if (tag === 'button' || tag === 'summary') keys.push(...ACTIVATE)
  else if (tag === 'a' && attribute('href') !== null) keys.push('Enter', 'NumpadEnter')
  const role = (attribute('role') ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  keys.push(...(ROLE_KEYS[role] ?? []))
  const declared = target.closest?.('[data-native-keys]')?.getAttribute?.('data-native-keys')
  if (declared) keys.push(...declaredKeys(declared))
  return keys
}

/** Whether the focused element uses this key itself, so that a game's shortcut must stay out of its way. */
export function ownsKey(target: unknown, code: string): boolean {
  if (typeof target !== 'object' || target === null) return false
  const keys = nativeKeys(target as KeyTarget)
  return keys.includes(ALL) || keys.includes(code)
}

/** The binding a key press stands for, or undefined. */
export function matchBinding(keys: readonly KeyBinding[], event: GameKeyEvent): KeyBinding | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined
  return keys.find((binding) => (binding.key !== undefined && event.key === binding.key) || (binding.code === event.code && (binding.shift === true) === event.shiftKey))
}

export interface KeyHandling {
  /** The game's whole map: `keymapOf(entry)`. */
  readonly keys: readonly KeyBinding[]
  /** Settings can turn shortcuts off (WCAG 2.1.4). Default on. */
  readonly enabled?: boolean
  /**
   * Called for a key the map binds. Return false when the command does not apply right now, so the key keeps its browser
   * meaning (a game with no camera lets `C` through). Any other return takes the key: `preventDefault` stops `Space` scrolling.
   */
  readonly onCommand: (binding: KeyBinding, event: GameKeyEvent) => boolean | void
}

/**
 * One key press. Ignored while shortcuts are off, for a press another handler took, one that is part of an IME composition, and
 * one the keyboard is repeating (holding a key is not asking again). Returns whether the game took the key.
 */
export function handleKeyDown(event: GameKeyEvent, handling: KeyHandling): boolean {
  if (handling.enabled === false || event.defaultPrevented || event.isComposing || event.repeat) return false
  const binding = matchBinding(handling.keys, event)
  if (binding === undefined || ownsKey(event.target, event.code)) return false
  if (handling.onCommand(binding, event) === false) return false
  event.preventDefault()
  return true
}

/** Whatever has `addEventListener`: the game's container, or a stand-in in a test. */
export interface KeyContainer {
  addEventListener(type: 'keydown', listener: (event: GameKeyEvent) => void): void
  removeEventListener(type: 'keydown', listener: (event: GameKeyEvent) => void): void
}

/** Binds the game's keys on `container`, and returns the function that unbinds them. `handling` is read at each press. */
export function bindKeys(container: KeyContainer, handling: () => KeyHandling): () => void {
  const listener = (event: GameKeyEvent) => {
    handleKeyDown(event, handling())
  }
  container.addEventListener('keydown', listener)
  return () => container.removeEventListener('keydown', listener)
}

/**
 * Binds the keys on the element that gets the returned ref. The handlers may change on every render and the listener stays: it
 * reads the latest of them at each press.
 */
export function useGameInput(handling: KeyHandling): RefObject<HTMLElement | null> {
  const container = useRef<HTMLElement | null>(null)
  const latest = useRef(handling)
  useEffect(() => {
    latest.current = handling
  })
  useEffect(() => {
    const element = container.current
    if (element === null) return undefined
    return bindKeys(element, () => latest.current)
  }, [])
  return container
}
