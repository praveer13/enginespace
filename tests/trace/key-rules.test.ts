/*
 * W1-T09, accept 2: which key press is the viewer's (src/trace/key-rules.ts): the kit's rules for a game's keys (ARCHITECTURE §6.8,
 * GAMES.md §2.3), written for the controls the viewer has. Plain functions over a description of the press, so no DOM is needed.
 */
import { describe, expect, test } from 'bun:test'
import { handleKey, matchKey, ownsKey } from '@/trace/key-rules'
import type { KeyHandling, KeyPress, KeyTarget } from '@/trace/key-rules'
import { REPEATING, TRACE_KEYS } from '@/trace/keys'

const element = (tagName: string, attributes: Record<string, string> = {}, ancestor?: Record<string, string>): KeyTarget => ({
  tagName,
  getAttribute: (name) => attributes[name] ?? null,
  closest: (selector) => {
    const wanted = /\[(data-native-keys)\]/.exec(selector)?.[1]
    if (wanted === undefined) return null
    if (attributes[wanted] !== undefined) return element(tagName, attributes)
    return ancestor?.[wanted] === undefined ? null : element('tbody', { [wanted]: ancestor[wanted] })
  },
})

function press(code: string, over: Partial<KeyPress> = {}): KeyPress & { prevented: boolean } {
  const state = { prevented: false }
  return {
    code,
    key: over.key ?? '',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    target: null,
    preventDefault: () => {
      state.prevented = true
    },
    get prevented() {
      return state.prevented
    },
    ...over,
  } as KeyPress & { prevented: boolean }
}

const taken: string[] = []
const handling = (over: Partial<KeyHandling> = {}): KeyHandling => ({
  keys: TRACE_KEYS,
  enabled: true,
  repeating: REPEATING,
  onCommand: (id) => {
    taken.push(id)
  },
  ...over,
})

describe('which controls own a key', () => {
  test('a text field owns every key, and so does a select, a text area and an editable box', () => {
    for (const code of ['KeyJ', 'Space', 'ArrowLeft', 'Backspace', 'Digit1', 'Slash']) {
      expect(ownsKey(element('input', { type: 'text' }), code)).toBe(true)
      expect(ownsKey(element('textarea'), code)).toBe(true)
      expect(ownsKey(element('select'), code)).toBe(true)
      expect(ownsKey(element('div', { contenteditable: 'true' }), code)).toBe(true)
    }
    expect(ownsKey(element('div', { contenteditable: 'false' }), 'KeyJ')).toBe(false)
  })

  test('a button owns Space and Enter and nothing else', () => {
    for (const code of ['Space', 'Enter', 'NumpadEnter']) expect(ownsKey(element('button'), code)).toBe(true)
    for (const code of ['KeyJ', 'ArrowRight', 'Equal', 'Escape']) expect(ownsKey(element('button'), code)).toBe(false)
  })

  test('a link owns Enter', () => {
    expect(ownsKey(element('a', { href: '/map' }), 'Enter')).toBe(true)
    expect(ownsKey(element('a', { href: '/map' }), 'Space')).toBe(false)
    expect(ownsKey(element('a'), 'Enter')).toBe(false)
  })

  test('a row of the span table owns the keys its body declares, and the pan keys are not among them', () => {
    const table = 'ArrowUp ArrowDown Home End PageUp PageDown'
    const row = element('button', {}, { 'data-native-keys': table })
    for (const code of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Space']) expect(ownsKey(row, code)).toBe(true)
    for (const code of ['ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyM']) expect(ownsKey(row, code)).toBe(false)
  })

  test('a thing that is not an element owns nothing', () => {
    expect(ownsKey(null, 'KeyJ')).toBe(false)
    expect(ownsKey('text', 'KeyJ')).toBe(false)
  })
})

describe('matching a press', () => {
  test('is by the physical key, or by the character a binding names, and never with Ctrl, Alt or Meta', () => {
    expect(matchKey(TRACE_KEYS, press('KeyK'))?.id).toBe('edge-next')
    expect(matchKey(TRACE_KEYS, press('KeyK', { shiftKey: true }))).toBeUndefined()
    expect(matchKey(TRACE_KEYS, press('KeyK', { ctrlKey: true }))).toBeUndefined()
    expect(matchKey(TRACE_KEYS, press('KeyK', { altKey: true }))).toBeUndefined()
    expect(matchKey(TRACE_KEYS, press('KeyK', { metaKey: true }))).toBeUndefined()
    // A layout that types + on another key still zooms in.
    expect(matchKey(TRACE_KEYS, press('BracketRight', { key: '+', shiftKey: true }))?.id).toBe('zoom-in')
  })
})

describe('taking a press', () => {
  test('runs the command, stops the browser, and says it took the key', () => {
    taken.length = 0
    const p = press('KeyM')
    expect(handleKey(p, handling())).toBe(true)
    expect(taken).toEqual(['mark'])
    expect(p.prevented).toBe(true)
  })

  test('leaves a key to the control that owns it', () => {
    taken.length = 0
    const p = press('KeyM', { target: element('input', { type: 'text' }) })
    expect(handleKey(p, handling())).toBe(false)
    expect(taken).toEqual([])
    expect(p.prevented).toBe(false)
    expect(handleKey(press('Enter', { target: element('button') }), handling())).toBe(false)
  })

  test('is off when shortcuts are off, and for a press that was taken or is part of a composition', () => {
    taken.length = 0
    expect(handleKey(press('KeyM'), handling({ enabled: false }))).toBe(false)
    expect(handleKey(press('KeyM', { defaultPrevented: true }), handling())).toBe(false)
    expect(handleKey(press('KeyM', { isComposing: true }), handling())).toBe(false)
    expect(taken).toEqual([])
  })

  test('lets the moves of the paper repeat while a key is held, and only those', () => {
    taken.length = 0
    expect(handleKey(press('ArrowRight', { repeat: true }), handling())).toBe(true)
    expect(handleKey(press('KeyK', { repeat: true }), handling())).toBe(true)
    expect(handleKey(press('KeyM', { repeat: true }), handling())).toBe(false)
    expect(handleKey(press('Digit1', { repeat: true, key: '1' }), handling())).toBe(false)
    expect(taken).toEqual(['pan-right', 'edge-next'])
  })

  test('leaves the key alone when the command says it does not apply', () => {
    const p = press('Escape')
    expect(handleKey(p, handling({ onCommand: () => false }))).toBe(false)
    expect(p.prevented).toBe(false)
  })
})
