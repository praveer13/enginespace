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
    reset: () => change(DEFAULT_SETTINGS, true),
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
