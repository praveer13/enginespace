/*
 * R-T06: the pointer and the bookmark in localStorage (D-066, REDESIGN §2.4), and who may write them.
 *
 *   - `es:next` holds `nextStep`'s last answer as a link and its words, and nothing of progress; `es:here` holds a place. Each is read and
 *     written inside try/catch: a store that throws, or one that holds something else, gives no pointer and no place, and never an error.
 *   - Deleting either changes the place only: the header falls back to the empty ledger's answer, and the evidence is untouched (the
 *     ledger is IndexedDB, and these are not in it).
 *   - Only pages that open the ledger write the pointer (through `useProgress`), and only the lesson page writes the bookmark (through
 *     `useBookmark`). Erasing the device removes both, and the intro flag.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { decodePlace, isReadAt, keepPlace, readPlace } from '@/settings/bookmark'
import { createSettingsStore, decodePointer, keepPointer, PLACE_KEYS, pointerSnapshot, readPointer, START_POINTER } from '@/settings/store'
import type { SettingsEnv } from '@/settings/store'
import { root } from '../ci/support'

/** A localStorage that keeps strings, or throws on every call when `blocked`. */
function storage(blocked = false) {
  const items = new Map<string, string>()
  const guard = () => {
    if (blocked) throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  return {
    items,
    getItem: (key: string) => (guard(), items.get(key) ?? null),
    setItem: (key: string, value: string) => (guard(), void items.set(key, value)),
    removeItem: (key: string) => (guard(), void items.delete(key)),
  }
}

const had = Object.getOwnPropertyDescriptor(globalThis, 'window')
function withWindow(store: ReturnType<typeof storage>) {
  const heard: string[] = []
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: store, dispatchEvent: (event: Event) => (heard.push(event.type), true), addEventListener() {}, removeEventListener() {} },
  })
  return heard
}
afterEach(() => {
  if (had === undefined) delete (globalThis as { window?: unknown }).window
  else Object.defineProperty(globalThis, 'window', had)
})

const STEP = { href: '/m/tr2/l1-one-step-five-calls#one-thread-one-loop', label: 'Continue: TR2 lesson 1, read why', word: 'Continue' as const }

describe('the pointer, es:next', () => {
  test('keeps the answer as its link and words, and nothing more; this tab hears of it', () => {
    const store = storage()
    const heard = withWindow(store)
    keepPointer({ ...STEP, minutes: 35 })
    expect(JSON.parse(store.items.get(PLACE_KEYS.next) ?? 'null')).toEqual({ ...STEP, minutes: 35 })
    expect(readPointer()).toEqual({ ...STEP, minutes: 35 })
    expect(heard).toEqual(['es:pointer'])
    // The same answer again writes nothing and says nothing.
    keepPointer({ ...STEP, minutes: 35 })
    expect(heard).toHaveLength(1)
  })

  test('refuses a link that leaves the site, and anything that is not a pointer', () => {
    for (const href of ['//elsewhere.example/x', 'javascript:alert(1)', 'https://elsewhere.example/', '/\\\\elsewhere', 'm/tr2']) expect(decodePointer({ ...STEP, href }), href).toBeNull()
    expect(decodePointer({ ...STEP, word: 'Go' })).toBeNull()
    expect(decodePointer({ ...STEP, label: '' })).toBeNull()
    expect(decodePointer('Continue')).toBeNull()
    expect(decodePointer({ ...STEP, minutes: -3 })).toEqual(STEP)
  })

  test('is read inside try/catch: a blocked store or a broken value gives no pointer and no error', () => {
    withWindow(storage(true))
    expect(readPointer()).toBeNull()
    expect(pointerSnapshot()).toBeNull()
    expect(() => keepPointer(STEP)).not.toThrow()
    const store = storage()
    store.items.set(PLACE_KEYS.next, '{not json')
    withWindow(store)
    expect(readPointer()).toBeNull()
  })

  test("deleting it changes the place only: the header's Continue is the first lesson again", () => {
    const store = storage()
    withWindow(store)
    keepPointer(STEP)
    expect(pointerSnapshot()).toEqual(STEP)
    store.items.delete(PLACE_KEYS.next)
    expect(pointerSnapshot() ?? START_POINTER).toEqual(START_POINTER)
  })
})

describe('the bookmark, es:here', () => {
  const PLACE = { route: '/m/tr5a/l1-why-one-model-needs-several-kv-caches', section: 'read' as const, part: 'what-the-next-token-reads', title: 'What the next token reads', at: '2026-11-15T10:00:00.000Z' }

  test('keeps a place, and reads it back', () => {
    const store = storage()
    withWindow(store)
    keepPlace(PLACE)
    expect(readPlace()).toEqual(PLACE)
  })

  test('drops what is not a place: a bad route, a bad time, a part that is not an id', () => {
    expect(decodePlace({ ...PLACE, route: '//x' })).toBeNull()
    expect(decodePlace({ ...PLACE, at: 'yesterday' })).toBeNull()
    expect(decodePlace({ ...PLACE, part: '<b>' })).toEqual({ route: PLACE.route, section: 'read', title: PLACE.title, at: PLACE.at })
    expect(decodePlace({ ...PLACE, section: 'kitchen' })).toEqual({ route: PLACE.route, part: PLACE.part, title: PLACE.title, at: PLACE.at })
  })

  test('is read inside try/catch', () => {
    withWindow(storage(true))
    expect(readPlace()).toBeNull()
    expect(() => keepPlace(PLACE)).not.toThrow()
  })

  test('follows a part being read, never a peek: a heading counts only in the upper part of the screen, so opening a lesson keeps no place', () => {
    // A part's heading at the foot of the first screen of a lesson only opened (the walk of 2026-11-16 found the header's Continue then
    // followed that lesson): no place.
    expect(isReadAt({ top: 860, bottom: 890 }, 900)).toBe(false)
    expect(isReadAt({ top: 500, bottom: 530 }, 900)).toBe(false)
    // Scrolled to, in the upper part of the screen: the part being read.
    expect(isReadAt({ top: 120, bottom: 150 }, 900)).toBe(true)
    expect(isReadAt({ top: 360, bottom: 390 }, 900)).toBe(true)
    // Scrolled past, off the top: not on the screen.
    expect(isReadAt({ top: -60, bottom: -30 }, 900)).toBe(false)
  })
})

describe('erasing the device', () => {
  test('removes the pointer, the bookmark and the intro flag with the settings', () => {
    const store = storage()
    for (const key of Object.values(PLACE_KEYS)) store.items.set(key, '{}')
    store.items.set('es:other', 'kept')
    const env: SettingsEnv = { storage: store, root: null, hear: () => () => undefined }
    createSettingsStore(env).reset()
    expect([...store.items.keys()]).toEqual(['es:other'])
  })
})

describe('who writes them', () => {
  const files = readdirSync(path.join(root, 'src'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  const code = (file: string) => readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const callers = (name: string) => files.filter((file) => file !== 'src/settings/store.ts' && new RegExp(`(?<!function )\\b${name}\\(`).test(code(file))).sort()

  test('the pointer is kept by the hook that opens the ledger, and the bookmark by the lesson page alone', () => {
    expect(callers('keepPointer')).toEqual(['src/progress/useWayOn.ts'])
    expect(callers('keepPlace')).toEqual(['src/settings/bookmark.ts'])
    expect(callers('useBookmark')).toEqual(['src/pages/Lesson.tsx'])
    // Every page that keeps the pointer opens the ledger to do it: Course and a module, through useProgress, and a lesson once it loads the
    // ledger after its first paint (R-T10).
    // Review keeps it too (R-T24): it is told how many reviews are due, which only it knows.
    expect(callers('useWayOn')).toEqual(['src/content/render/LessonLedger.tsx', 'src/items/today/TodayView.tsx', 'src/progress/useProgress.ts'])
    expect(callers('useProgress')).toEqual(['src/pages/Map.tsx', 'src/pages/Module.tsx'])
    expect(code('src/progress/useWayOn.ts')).toMatch(/useEvidence\(\)/)
  })

  test('no other file names the keys', () => {
    const named = files.filter((file) => /'es:(next|here|intro)'/.test(code(file)))
    expect(named).toEqual(['src/settings/store.ts'])
  })
})
