/*
 * The settings of this tab, as a store the whole app reads (ARCHITECTURE §3.1): a few lines of state, the copy of it that every
 * page can read at once, and the one thing a setting does to the document itself, which is the `data-motion` attribute that
 * tokens.css, base.css and the scene tokens obey. The ledger's `working` store is the record, and model.ts says why this copy
 * exists beside it. React is not here: the hook is in useSettings.ts, and the tests build a store over a fake environment.
 *
 *   set     a change made in this tab: the store, the copy and the attribute follow it, and every subscriber hears it. The
 *           Settings page saves the record first and calls this when the save was kept, so the two never part.
 *   adopt   the record says something else than this tab holds (the Settings page, when the ledger has opened): the store
 *           takes the record's values and the copy is rewritten to match.
 *   reset   everything back to the defaults, and the copy gone: the learner erased this device.
 *   start   called once, before the first render (src/main.tsx): puts the attribute on the root, and listens for another tab
 *           of this browser writing the copy, so a change made in one tab applies live in all of them.
 *
 * Nothing in here may throw. `localStorage` can be blocked (a private window, site data turned off) or full, and then the
 * settings live for as long as the page does, and the record in `working` keeps them for the next visit.
 */
import { decodeMirror, DEFAULT_SETTINGS, encodeMirror, MIRROR_KEY, MOTION_ATTRIBUTE, motionAttribute, sameSettings } from './model'
import type { Settings } from './model'

/** What a store touches outside itself. The browser's is `browserEnv`, and a test passes its own. */
export interface SettingsEnv {
  /** `localStorage`, or null where it cannot be had. */
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** The root element, which carries `data-motion`. Null with no document. */
  readonly root: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void } | null
  /** Calls the listener when another tab writes the copy, and returns what stops it. */
  hear(listener: () => void): () => void
}

export interface SettingsStore {
  get(): Settings
  subscribe(listener: () => void): () => void
  set(patch: Partial<Settings>): void
  adopt(next: Settings): void
  reset(): void
  start(): () => void
}

export function createSettingsStore(env: SettingsEnv): SettingsStore {
  const read = (): Settings => {
    try {
      return decodeMirror(env.storage?.getItem(MIRROR_KEY) ?? null)
    } catch {
      return DEFAULT_SETTINGS
    }
  }
  let current = read()
  const listeners = new Set<() => void>()

  /** The attribute on the root: the system decides while it is absent. */
  function show(): void {
    const mode = motionAttribute(current.motion)
    try {
      if (mode === null) env.root?.removeAttribute(MOTION_ATTRIBUTE)
      else env.root?.setAttribute(MOTION_ATTRIBUTE, mode)
    } catch {
      // No document to mark.
    }
  }

  /** The copy, which is absent while every setting is at its default, so a learner who chose nothing has nothing stored. */
  function keep(): void {
    try {
      if (sameSettings(current, DEFAULT_SETTINGS)) env.storage?.removeItem(MIRROR_KEY)
      else env.storage?.setItem(MIRROR_KEY, encodeMirror(current))
    } catch {
      // Blocked or full: the settings stand for this page, and `working` has them for the next.
    }
  }

  function change(next: Settings, writeCopy: boolean): void {
    if (!sameSettings(current, next)) {
      current = next
      show()
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch (error) {
          // A listener that throws is the page's bug, and it must not keep the others from hearing or break the change.
          console.error('A listener of the settings threw.', error)
        }
      }
    }
    if (writeCopy) keep()
  }

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (patch) => change(Object.freeze({ ...current, ...patch }), true),
    adopt: (next) => change(next, true),
    reset: () => {
      change(DEFAULT_SETTINGS, true)
      // The device was erased: the places go with the evidence they were read from (D-066).
      for (const key of Object.values(PLACE_KEYS)) {
        try {
          env.storage?.removeItem(key)
        } catch {
          // Blocked: nothing was kept there either.
        }
      }
    },
    start() {
      show()
      // Another tab wrote the copy: take what it says, and write nothing back, so two tabs never answer each other.
      return env.hear(() => change(read(), false))
    },
  }
}

/** The browser's own environment. On the server and in a test it has no storage and no root, and the store holds the defaults. */
export function browserEnv(): SettingsEnv {
  if (typeof window === 'undefined' || typeof document === 'undefined') return { storage: null, root: null, hear: () => () => undefined }
  let storage: Storage | null = null
  try {
    // Even reading the property throws where site data is blocked.
    storage = window.localStorage
  } catch {
    storage = null
  }
  return {
    storage,
    root: document.documentElement,
    hear(listener) {
      const onStorage = (event: StorageEvent) => {
        // `key` is null when another tab cleared the whole area.
        if (event.storageArea === storage && (event.key === null || event.key === MIRROR_KEY)) listener()
      }
      window.addEventListener('storage', onStorage)
      return () => window.removeEventListener('storage', onStorage)
    },
  }
}

/** This tab's settings. */
export const settingsStore: SettingsStore = createSettingsStore(browserEnv())

/** Marks the document and starts hearing the other tabs: once, before the app renders. */
export const startSettings = (): (() => void) => settingsStore.start()

/* ------------------------------------------------------------------------------------------------------------------ */
/* The places (D-066)                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/*
 * Three per-viewer keys beside the settings' copy, none of them evidence (D-066, REDESIGN §2.4):
 *   es:next   the pointer: a copy of `nextStep`'s last answer (src/progress/next.ts), so the header and the front page can label
 *             Continue without opening IndexedDB (D-038). A page that opens the ledger rewrites it.
 *   es:here   the bookmark: the lesson, section and part last in view. A lesson page writes it. It is a place, not progress.
 *   es:intro  the intro flag: for each game, the parts its first-run intro has shown (R-T08 writes it).
 * Every read and write is inside try/catch, and deleting a key loses a place or a label, never evidence. Erasing the device removes all
 * three (`reset` above).
 */
export const PLACE_KEYS = { next: 'es:next', here: 'es:here', intro: 'es:intro' } as const

/** The pointer: what Continue says and where it goes. */
export interface Pointer {
  readonly href: string
  readonly label: string
  readonly word: 'Start' | 'Continue'
  readonly minutes?: number
}

/**
 * The pointer of an empty ledger: the first lesson of the course, as `nextStep` answers with no events and no bookmark. The header shows
 * it until a page that opens the ledger has written one; tests/progress/next.test.ts holds it to `nextStep`'s answer on the compiled map.
 */
export const START_POINTER: Pointer = { href: '/m/tr1/l1-five-mechanisms', label: 'Start: TR1 lesson 1', word: 'Start', minutes: 35 }

/** Something said that the pointer changed in this tab. Another tab's write arrives as a `storage` event. */
const POINTER_EVENT = 'es:pointer'

export function local(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readJson(key: string): unknown {
  try {
    const text = local()?.getItem(key) ?? null
    return text === null ? null : (JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    const store = local()
    if (store === null) return false
    const text = JSON.stringify(value)
    if (store.getItem(key) === text) return false
    store.setItem(key, text)
    return true
  } catch {
    // Blocked or full: the place is lost, and nothing else.
    return false
  }
}

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
/** A path of this site: `/m/tr2/l1#read`, and never `//elsewhere` or a scheme. */
export const isPath = (value: unknown): value is string => typeof value === 'string' && /^\/(?![/\\])\S*$/.test(value) && value.length <= 300
export const isLine = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value.length <= 200

/** The pointer `es:next` holds, or null when it holds none or something that is not one. */
export function decodePointer(value: unknown): Pointer | null {
  if (!isObject(value) || !isPath(value.href) || !isLine(value.label) || (value.word !== 'Start' && value.word !== 'Continue')) return null
  const minutes = typeof value.minutes === 'number' && Number.isInteger(value.minutes) && value.minutes > 0 ? value.minutes : undefined
  return { href: value.href, label: value.label, word: value.word, ...(minutes === undefined ? {} : { minutes }) }
}

export const readPointer = (): Pointer | null => decodePointer(readJson(PLACE_KEYS.next))

let seen: { text: string | null; pointer: Pointer | null } = { text: null, pointer: null }

/** The pointer as a store's snapshot: the same object until the key's text changes, so a subscriber renders once per change. */
export function pointerSnapshot(): Pointer | null {
  let text: string | null = null
  try {
    text = local()?.getItem(PLACE_KEYS.next) ?? null
  } catch {
    text = null
  }
  if (text !== seen.text) seen = { text, pointer: readPointer() }
  return seen.pointer
}

/** Keeps `nextStep`'s answer as the pointer, and tells this tab's Continue controls. Only a page that opens the ledger calls it. */
export function keepPointer(pointer: Pointer): void {
  const clean = decodePointer(pointer)
  if (clean === null || !writeJson(PLACE_KEYS.next, clean)) return
  try {
    window.dispatchEvent(new Event(POINTER_EVENT))
  } catch {
    // No window to tell.
  }
}

/** Calls the listener when the pointer changes, in this tab or another, and returns what stops it. */
export function hearPointer(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === PLACE_KEYS.next) listener()
  }
  window.addEventListener(POINTER_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(POINTER_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}
