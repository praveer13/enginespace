/*
 * The settings, for React. `useSettings()` is what a page, the Stage and a game's shell read, and it re-renders when a
 * setting changes in this tab or in another (store.ts). On the server, and in a test, it answers the defaults.
 *
 * `useSystemReducedMotion()` is what the browser itself asks for, which the Settings page prints beside the learner's choice
 * so that "follow my system" says what it follows. It is null where the question cannot be asked.
 */
import { useSyncExternalStore } from 'react'
import { DEFAULT_SETTINGS } from './model'
import type { Settings } from './model'
import { settingsStore } from './store'

const defaults = (): Settings => DEFAULT_SETTINGS

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, defaults)
}

const REDUCED = '(prefers-reduced-motion: reduce)'

function subscribeSystem(listener: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined
  const query = matchMedia(REDUCED)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

const systemReduces = (): boolean | null => (typeof matchMedia === 'function' ? matchMedia(REDUCED).matches : null)
const unknown = (): null => null

export function useSystemReducedMotion(): boolean | null {
  return useSyncExternalStore(subscribeSystem, systemReduces, unknown)
}
