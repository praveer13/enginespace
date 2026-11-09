/*
 * W0-T14 acceptance check 3: keys are bound on the container, and ignored inside text inputs and on controls that use the key
 * natively, such as `Space` on a focused button (ARCHITECTURE §6.8).
 *
 * The decisions are plain functions over a description of the key press, so these tests build presses and focused elements by hand
 * and need no DOM. The real DOM, a real focus and a real dialog are exercised in a browser by the task's own run, noted in its report.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { COMMON_KEYS, keymapOf } from '@es/play'
import type { KeyBinding } from '@es/play'
import { bindKeys, handleKeyDown, matchBinding, ownsKey } from '@/games/kit/useGameInput'
import type { GameKeyEvent, KeyHandling, KeyTarget } from '@/games/kit/useGameInput'
import { TOY } from './support'

/** A focused element, as much of one as the rules read. `closest` supports the one selector they use. */
function element(tag: string, attributes: Record<string, string> = {}, options: { editable?: boolean; parent?: KeyTarget } = {}): KeyTarget {
  const node: KeyTarget = {
    tagName: tag.toUpperCase(),
    isContentEditable: options.editable,
    getAttribute: (name) => attributes[name] ?? null,
    closest(selector) {
      if (selector !== '[data-native-keys]') throw new Error(`the fake element answers only [data-native-keys], not ${selector}`)
      return attributes['data-native-keys'] !== undefined ? node : (options.parent?.closest?.(selector) ?? null)
    },
  }
  return node
}

const CHARACTERS: Record<string, string> = { Space: ' ', Period: '.', Comma: ',', BracketLeft: '[', BracketRight: ']', Slash: '/', KeyC: 'c', KeyV: 'v', KeyA: 'a', KeyO: 'o' }

interface Press extends GameKeyEvent {
  prevented: boolean
}
function press(code: string, over: Partial<GameKeyEvent> = {}): Press {
  const event: Press = {
    code,
    key: CHARACTERS[code] ?? code,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    target: element('section', { tabindex: '-1' }),
    prevented: false,
    preventDefault() {
      event.prevented = true
    },
    ...over,
  }
  return event
}

/** A handling that records the commands it receives. */
function recorder(over: Partial<KeyHandling> = {}) {
  const commands: string[] = []
  const handling: KeyHandling = {
    keys: keymapOf(TOY),
    onCommand: (binding) => {
      commands.push(binding.id)
    },
    ...over,
  }
  return { handling, commands }
}
const taken = (event: GameKeyEvent, over: Partial<KeyHandling> = {}) => {
  const { handling, commands } = recorder(over)
  return { handled: handleKeyDown(event, handling), commands }
}

describe('the keys are bound on the container', () => {
  test('bindKeys listens on the container it is given, once, and unbinds the same listener', () => {
    const added: [string, unknown][] = []
    const removed: [string, unknown][] = []
    const container = {
      addEventListener: (type: 'keydown', listener: unknown) => void added.push([type, listener]),
      removeEventListener: (type: 'keydown', listener: unknown) => void removed.push([type, listener]),
    }
    const { handling } = recorder()
    const unbind = bindKeys(container as never, () => handling)
    expect(added).toHaveLength(1)
    expect(added[0][0]).toBe('keydown')
    expect(removed).toEqual([])
    unbind()
    expect(removed).toEqual([added[0]])
  })

  test('a press that reaches the container\'s listener runs the command, with the handling read at the time of the press', () => {
    let listener: (event: GameKeyEvent) => void = () => undefined
    const container = { addEventListener: (_: 'keydown', fn: (event: GameKeyEvent) => void) => void (listener = fn), removeEventListener: () => undefined }
    const first = recorder()
    const second = recorder()
    let current = first.handling
    bindKeys(container, () => current)
    listener(press('KeyC'))
    current = second.handling
    listener(press('KeyV'))
    expect(first.commands).toEqual(['camera'])
    expect(second.commands).toEqual(['view'])
  })

  test('the hook binds nothing on the window or the document', () => {
    const file = path.resolve(import.meta.dirname, '../../src/games/kit/useGameInput.ts')
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const reached: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && ['window', 'document', 'globalThis', 'self'].includes(node.text)) reached.push(node.text)
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(reached).toEqual([])
  })
})

describe('a key is the game\'s when focus is on the game itself', () => {
  test('on the container, or on any element that reads no keys', () => {
    for (const target of [element('section'), element('div'), element('span'), element('p'), element('li'), element('svg'), element('table')]) {
      const { handled, commands } = taken(press('Space', { target }))
      expect([target.tagName, handled, commands]).toEqual([target.tagName, true, ['play-pause']])
    }
  })

  test('and the key keeps its place in the page: preventDefault stops Space scrolling', () => {
    const event = press('Space')
    expect(taken(event).handled).toBe(true)
    expect(event.prevented).toBe(true)
  })

  test('every key of the map, the common ones and the game\'s own, reaches its command', () => {
    for (const binding of keymapOf(TOY)) {
      const event = press(binding.code, { shiftKey: binding.shift === true, key: binding.key ?? CHARACTERS[binding.code] ?? binding.code })
      expect([binding.id, taken(event).commands]).toEqual([binding.id, [binding.id]])
    }
  })

  test('a key the map does not bind is left alone', () => {
    for (const code of ['KeyZ', 'Enter', 'ArrowUp', 'Escape', 'Tab', 'F5']) {
      const event = press(code)
      expect([code, taken(event).handled, event.prevented]).toEqual([code, false, false])
    }
  })
})

describe('a key is ignored inside text inputs', () => {
  const codes = [...COMMON_KEYS.map((binding) => binding.code), 'KeyA']

  test('every kind of text field reads every key', () => {
    const fields = [
      element('input'),
      element('input', { type: 'text' }),
      element('input', { type: 'search' }),
      element('input', { type: 'email' }),
      element('input', { type: 'number' }),
      element('input', { type: 'password' }),
      element('input', { type: 'url' }),
      element('input', { type: 'tel' }),
      element('input', { type: 'TEXT' }),
      element('textarea'),
      element('select'),
      element('div', {}, { editable: true }),
      element('div', { contenteditable: 'true' }),
      element('div', { contenteditable: '' }),
      element('div', { role: 'textbox' }),
      element('div', { role: 'searchbox' }),
      element('div', { role: 'combobox' }),
      element('div', { role: 'spinbutton' }),
    ]
    for (const target of fields) {
      for (const code of codes) {
        const event = press(code, { target, shiftKey: code === 'Slash', key: code === 'Slash' ? '?' : (CHARACTERS[code] ?? code) })
        const { handled, commands } = taken(event)
        expect([target.tagName, target.getAttribute?.('type'), code, handled, commands, event.prevented]).toEqual([target.tagName, target.getAttribute?.('type'), code, false, [], false])
      }
    }
  })

  test('typing a question mark into a field does not open the help', () => {
    const event = press('Slash', { key: '?', shiftKey: true, target: element('input', { type: 'text' }) })
    expect(taken(event)).toEqual({ handled: false, commands: [] })
  })

  test('contenteditable="false" is not a text field', () => {
    expect(taken(press('KeyC', { target: element('div', { contenteditable: 'false' }) })).commands).toEqual(['camera'])
  })
})

describe('a key is ignored on a control that uses it natively', () => {
  test('Space on a focused button is the button\'s, and so is Enter; the game\'s other keys still work there', () => {
    const button = element('button', { type: 'button' })
    expect(taken(press('Space', { target: button }))).toEqual({ handled: false, commands: [] })
    expect(taken(press('Enter', { target: button }), { keys: [{ id: 'place', code: 'Enter', label: 'Enter', description: 'Place' }] })).toEqual({ handled: false, commands: [] })
    expect(taken(press('KeyC', { target: button })).commands).toEqual(['camera'])
    expect(taken(press('KeyV', { target: button })).commands).toEqual(['view'])
    expect(taken(press('Period', { target: button })).commands).toEqual(['step'])
  })

  test('Space on the things that act like a button', () => {
    const buttons = [
      element('button'),
      element('summary'),
      element('div', { role: 'button' }),
      element('span', { role: 'switch' }),
      element('button', { role: 'switch' }),
      element('div', { role: 'checkbox' }),
      element('input', { type: 'checkbox' }),
      element('input', { type: 'radio' }),
      element('input', { type: 'button' }),
      element('input', { type: 'submit' }),
      element('input', { type: 'file' }),
      element('div', { role: 'tab' }),
      element('div', { role: 'option' }),
      element('div', { role: 'menuitem' }),
    ]
    for (const target of buttons) {
      expect([target.tagName, target.getAttribute?.('role'), taken(press('Space', { target })).handled]).toEqual([target.tagName, target.getAttribute?.('role'), false])
    }
  })

  test('Enter on a link is the link\'s, but a link with no href is not a link', () => {
    const own = { keys: [{ id: 'place', code: 'Enter', label: 'Enter', description: 'Place' }] }
    expect(taken(press('Enter', { target: element('a', { href: '/x' }) }), own).handled).toBe(false)
    expect(taken(press('Enter', { target: element('a') }), own).commands).toEqual(['place'])
    expect(taken(press('Space', { target: element('a', { href: '/x' }) })).commands).toEqual(['play-pause'])
  })

  test('the arrows in a radio group, a listbox, a slider, a tab list, a grid and a menu are theirs', () => {
    const own = { keys: [{ id: 'down', code: 'ArrowDown', label: '↓', description: 'Next' }, { id: 'home', code: 'Home', label: 'Home', description: 'First' }] }
    const widgets = [
      element('button', { role: 'radio' }),
      element('input', { type: 'radio' }),
      element('div', { role: 'radiogroup' }),
      element('div', { role: 'option' }),
      element('ul', { role: 'listbox' }),
      element('span', { role: 'slider' }),
      element('input', { type: 'range' }),
      element('div', { role: 'tab' }),
      element('div', { role: 'tablist' }),
      element('td', { role: 'gridcell' }),
      element('div', { role: 'menuitem' }),
      element('li', { role: 'treeitem' }),
    ]
    for (const target of widgets) {
      for (const code of ['ArrowDown', 'Home']) {
        expect([target.tagName, target.getAttribute?.('role'), code, taken(press(code, { target }), own).handled]).toEqual([target.tagName, target.getAttribute?.('role'), code, false])
      }
    }
  })

  test('arrows are the game\'s where no widget reads them, such as on a plain button', () => {
    const own = { keys: [{ id: 'down', code: 'ArrowDown', label: '↓', description: 'Next' }] }
    expect(taken(press('ArrowDown', { target: element('button') }), own).commands).toEqual(['down'])
    expect(taken(press('ArrowDown'), own).commands).toEqual(['down'])
  })

  test('a widget that reads keys of its own says so with data-native-keys, and so does everything inside it', () => {
    const own = { keys: [{ id: 'down', code: 'ArrowDown', label: '↓', description: 'Next' }, { id: 'go', code: 'Enter', label: 'Enter', description: 'Go' }] }
    const table = element('tbody', { 'data-native-keys': 'arrows' })
    const inside = element('button', {}, { parent: table })
    expect(taken(press('ArrowDown', { target: inside }), own).handled).toBe(false)
    expect(taken(press('ArrowDown', { target: table }), own).handled).toBe(false)
    expect(taken(press('Enter', { target: table }), own).commands).toEqual(['go'])
    const named = element('div', { 'data-native-keys': 'Enter Space' })
    expect(taken(press('Enter', { target: named }), own).handled).toBe(false)
    expect(taken(press('ArrowDown', { target: named }), own).commands).toEqual(['down'])
    const everything = element('div', { 'data-native-keys': '*' })
    expect(taken(press('KeyC', { target: everything })).handled).toBe(false)
  })

  test('ownsKey answers for the focused element alone, and for nothing it does not understand', () => {
    expect(ownsKey(element('button'), 'Space')).toBe(true)
    expect(ownsKey(element('button'), 'KeyC')).toBe(false)
    expect(ownsKey(null, 'Space')).toBe(false)
    expect(ownsKey(undefined, 'Space')).toBe(false)
    expect(ownsKey('a string', 'Space')).toBe(false)
    expect(ownsKey({}, 'Space')).toBe(false)
  })
})

describe('what is never the game\'s', () => {
  test('a press with Ctrl, Alt or Meta held, so no browser or system shortcut is taken', () => {
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      const event = press('KeyC', { [modifier]: true })
      expect([modifier, taken(event).handled, event.prevented]).toEqual([modifier, false, false])
    }
  })

  test('a key pressed with Shift when the binding does not ask for it, and the reverse', () => {
    expect(taken(press('KeyC', { shiftKey: true, key: 'C' })).handled).toBe(false)
    expect(taken(press('Slash', { shiftKey: false, key: '/' })).handled).toBe(false)
  })

  test('the help key matches by its character as well as by its place, so a layout that moves it still finds it', () => {
    const keys = keymapOf(TOY)
    expect(matchBinding(keys, press('Slash', { shiftKey: true, key: '?' }))?.id).toBe('help')
    expect(matchBinding(keys, press('Minus', { shiftKey: true, key: '?' }))?.id).toBe('help')
    expect(matchBinding(keys, press('Slash', { shiftKey: true, key: '_' }))?.id).toBe('help')
    expect(matchBinding(keys, press('Slash', { key: '/' }))).toBeUndefined()
  })

  test('a repeat from holding the key down, a press in an IME composition, and a press another handler took', () => {
    for (const over of [{ repeat: true }, { isComposing: true }, { defaultPrevented: true }]) {
      const event = press('Space', over)
      expect([over, taken(event).handled, event.prevented]).toEqual([over, false, false])
    }
  })

  test('any press while shortcuts are turned off (WCAG 2.1.4)', () => {
    const event = press('Space')
    expect(taken(event, { enabled: false }).handled).toBe(false)
    expect(event.prevented).toBe(false)
    expect(taken(press('Space'), { enabled: true }).handled).toBe(true)
  })
})

describe('what a command returns', () => {
  const only = (id: string): KeyBinding[] => keymapOf(TOY).filter((binding) => binding.id === id)

  test('false lets the key keep its browser meaning; anything else takes it', () => {
    for (const [returned, handled] of [[false, false], [true, true], [undefined, true]] as const) {
      const event = press('KeyC')
      expect([returned, handleKeyDown(event, { keys: only('camera'), onCommand: () => returned })]).toEqual([returned, handled])
      expect([returned, event.prevented]).toEqual([returned, handled])
    }
  })

  test('the command receives the binding and the event', () => {
    let seen: [KeyBinding, GameKeyEvent] | undefined
    const event = press('KeyA')
    handleKeyDown(event, { keys: only('add-three'), onCommand: (binding, pressed) => void (seen = [binding, pressed]) })
    expect(seen?.[0]).toMatchObject({ id: 'add-three', code: 'KeyA' })
    expect(seen?.[1]).toBe(event)
  })
})
