/*
 * The settings as data (W0-T22; ARCHITECTURE §3.1, §6.6 and §6.9): what each setting may hold, where its record lives in
 * the ledger's `working` store, how a record is read when it is missing or wrong, the copy that every page can read, and what the
 * settings limit. Nothing here has a DOM.
 */
import { describe, expect, test } from 'bun:test'
import { decodeWorkingRecord } from '@es/ledger'
import {
  decodeMirror,
  decodeSettings,
  DEFAULT_SETTINGS,
  encodeMirror,
  MIRROR_KEY,
  MOTION_ATTRIBUTE,
  MOTION_MODES,
  motionAttribute,
  sameSettings,
  SETTING_KEYS,
  SETTING_NAMES,
  settingValue,
  TIER_CAPS,
} from '@/settings/model'
import type { Settings } from '@/settings/model'
import { effectiveMotion, limitsFor, shellLimits } from '@/settings/rules'

const all = (settings: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...settings })

describe('the defaults', () => {
  test('3D on, no cap, motion by the system, keys bound: a learner who chose nothing has changed nothing', () => {
    expect(DEFAULT_SETTINGS).toEqual({ view3d: true, tierCap: 3, motion: 'system', gameKeys: true })
  })

  test('are frozen, so no page can change what every page falls back to', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true)
    expect(Object.isFrozen(decodeSettings(() => undefined))).toBe(true)
  })

  test('the cap offers T1 to T3 only: "2D only" is the 3D switch', () => {
    expect([...TIER_CAPS]).toEqual([1, 2, 3])
    expect([...MOTION_MODES]).toEqual(['system', 'reduce', 'full'])
  })
})

describe('the record in `working`', () => {
  test('has one key for each setting, and the ledger accepts every one as a working key', () => {
    expect(SETTING_NAMES.length).toBe(4)
    for (const name of SETTING_NAMES) {
      const decoded = decodeWorkingRecord({ key: SETTING_KEYS[name], value: settingValue(DEFAULT_SETTINGS, name), at: '2026-11-04T09:00:00.000Z', dev: 'dev-a1' })
      expect(decoded.ok, SETTING_KEYS[name]).toBe(true)
    }
    expect(new Set(Object.values(SETTING_KEYS)).size).toBe(4)
  })

  test('every key is in the settings namespace, and the sample records the ledger\'s own suite writes read without harm', () => {
    for (const key of Object.values(SETTING_KEYS)) expect(key.startsWith('settings:')).toBe(true)
    // packages/ledger/conformance.ts writes `true` to settings:reduced-motion and 2 to settings:tier-cap as sample records: the second is
    // a valid cap, and the first is not a motion mode, so the default replaces it.
    expect(decodeSettings((key) => (key === 'settings:tier-cap' ? 2 : undefined)).tierCap).toBe(2)
    expect(decodeSettings((key) => (key === 'settings:reduced-motion' ? true : undefined)).motion).toBe('system')
  })

  test('is read setting by setting: what is there is taken, and what is missing is the default', () => {
    const records: Record<string, unknown> = { 'settings:3d': false, 'settings:tier-cap': 1, 'settings:reduced-motion': 'reduce', 'settings:game-keys': false }
    expect(decodeSettings((key) => records[key])).toEqual({ view3d: false, tierCap: 1, motion: 'reduce', gameKeys: false })
    expect(decodeSettings((key) => (key === 'settings:3d' ? false : undefined))).toEqual(all({ view3d: false }))
    expect(decodeSettings(() => undefined)).toEqual(DEFAULT_SETTINGS)
  })

  test.each([
    ['settings:3d', 'yes'],
    ['settings:3d', 1],
    ['settings:3d', null],
    ['settings:tier-cap', 0],
    ['settings:tier-cap', 4],
    ['settings:tier-cap', 2.5],
    ['settings:tier-cap', '2'],
    ['settings:reduced-motion', 'always'],
    ['settings:reduced-motion', false],
    ['settings:game-keys', 'off'],
    ['settings:game-keys', {}],
  ])('a record of %s that says %p takes the default, and costs the page nothing', (key, value) => {
    expect(decodeSettings((asked) => (asked === key ? value : undefined))).toEqual(DEFAULT_SETTINGS)
  })

  test('one bad record does not take the good ones with it', () => {
    const records: Record<string, unknown> = { 'settings:3d': false, 'settings:tier-cap': 99, 'settings:reduced-motion': 'full' }
    expect(decodeSettings((key) => records[key])).toEqual(all({ view3d: false, motion: 'full' }))
  })

  test('what each setting stores is JSON the ledger can hold', () => {
    expect(settingValue(all({ tierCap: 2, motion: 'reduce', view3d: false }), 'tierCap')).toBe(2)
    expect(settingValue(all({ motion: 'reduce' }), 'motion')).toBe('reduce')
    expect(settingValue(all({ view3d: false }), 'view3d')).toBe(false)
  })
})

describe('comparing settings', () => {
  test('sameSettings looks at every part', () => {
    expect(sameSettings(DEFAULT_SETTINGS, all({}))).toBe(true)
    for (const patch of [{ view3d: false }, { tierCap: 1 }, { motion: 'full' }, { gameKeys: false }] as const) expect(sameSettings(DEFAULT_SETTINGS, all(patch))).toBe(false)
  })
})

describe('the copy that every page can read', () => {
  test('is under a key of the site`s own, and carries each setting under its `working` key', () => {
    expect(MIRROR_KEY).toBe('es:settings')
    const copy = JSON.parse(encodeMirror(all({ motion: 'reduce', tierCap: 2 }))) as Record<string, unknown>
    expect(copy).toEqual({ 'settings:3d': true, 'settings:tier-cap': 2, 'settings:reduced-motion': 'reduce', 'settings:game-keys': true })
  })

  test('round-trips every combination of the settings', () => {
    for (const view3d of [true, false])
      for (const tierCap of TIER_CAPS)
        for (const motion of MOTION_MODES)
          for (const gameKeys of [true, false]) {
            const settings: Settings = { view3d, tierCap, motion, gameKeys }
            expect(decodeMirror(encodeMirror(settings))).toEqual(settings)
          }
  })

  test.each([
    ['nothing stored', null],
    ['text that is not JSON', 'not json'],
    ['a JSON array', '[1,2]'],
    ['JSON null', 'null'],
    ['a JSON string', '"reduce"'],
    ['an empty object', '{}'],
  ])('%s gives the defaults', (_, text) => {
    expect(decodeMirror(text)).toEqual(DEFAULT_SETTINGS)
  })

  test('reads only its own keys, so a name from the prototype is not a setting', () => {
    expect(decodeMirror('{"__proto__":{"settings:3d":false},"constructor":1,"settings:tier-cap":1}')).toEqual(all({ tierCap: 1 }))
    expect(decodeMirror('{"toString":"x"}')).toEqual(DEFAULT_SETTINGS)
  })

  test('takes what is valid from a copy written by another build, and ignores what it does not know', () => {
    expect(decodeMirror('{"settings:3d":false,"settings:future":true,"settings:reduced-motion":"sideways"}')).toEqual(all({ view3d: false }))
  })
})

describe('reduced motion', () => {
  test('a choice overrides the system either way, and "follow" asks the system', () => {
    expect(effectiveMotion('reduce', false)).toEqual({ reduced: true, source: 'settings' })
    expect(effectiveMotion('reduce', true)).toEqual({ reduced: true, source: 'settings' })
    expect(effectiveMotion('full', true)).toEqual({ reduced: false, source: 'settings' })
    expect(effectiveMotion('full', false)).toEqual({ reduced: false, source: 'settings' })
    expect(effectiveMotion('system', true)).toEqual({ reduced: true, source: 'system' })
    expect(effectiveMotion('system', false)).toEqual({ reduced: false, source: 'system' })
    // Where the browser cannot be asked, motion is not reduced.
    expect(effectiveMotion('system', null)).toEqual({ reduced: false, source: 'system' })
  })

  test('the root carries the override as data-motion, and carries nothing while the system decides', () => {
    expect(MOTION_ATTRIBUTE).toBe('data-motion')
    expect(motionAttribute('system')).toBeNull()
    expect(motionAttribute('reduce')).toBe('reduce')
    expect(motionAttribute('full')).toBe('full')
  })
})

describe('what the settings limit', () => {
  test('a Stage is 2D if the game or the learner asks, and takes the lower cap', () => {
    expect(limitsFor(DEFAULT_SETTINGS)).toEqual({ prefer2d: false, cap: 3 })
    expect(limitsFor(all({ view3d: false }))).toEqual({ prefer2d: true, cap: 3 })
    expect(limitsFor(DEFAULT_SETTINGS, { prefer2d: true })).toEqual({ prefer2d: true, cap: 3 })
    expect(limitsFor(all({ tierCap: 2 }), { tierCap: 3 })).toEqual({ prefer2d: false, cap: 2 })
    expect(limitsFor(all({ tierCap: 3 }), { tierCap: 1 })).toEqual({ prefer2d: false, cap: 1 })
    expect(limitsFor(all({ tierCap: 1 }), { tierCap: 0 })).toEqual({ prefer2d: false, cap: 0 })
  })

  test('neither side raises what the other holds', () => {
    for (const learner of TIER_CAPS) for (const game of [0, 1, 2, 3] as const) expect(limitsFor(all({ tierCap: learner }), { tierCap: game }).cap).toBe(Math.min(learner, game))
    expect(limitsFor(all({ view3d: false }), { prefer2d: false }).prefer2d).toBe(true)
  })

  test('a game shell allows 3D and binds its keys only if both the game and the learner allow them', () => {
    expect(shellLimits(DEFAULT_SETTINGS)).toEqual({ allow3d: true, unavailable3d: undefined, keys: true })
    expect(shellLimits(all({ view3d: false }))).toEqual({ allow3d: false, unavailable3d: '3D is off in Settings', keys: true })
    expect(shellLimits(all({ gameKeys: false }))).toEqual({ allow3d: true, unavailable3d: undefined, keys: false })
    expect(shellLimits(DEFAULT_SETTINGS, { shortcuts: false })).toMatchObject({ keys: false })
    expect(shellLimits(all({ gameKeys: false }), { shortcuts: true })).toMatchObject({ keys: false })
  })

  test('a game that cannot do 3D keeps its own reason, even when the learner has turned 3D off too', () => {
    const asked = { allow3d: false, unavailable3d: 'This browser has no WebGL2' }
    expect(shellLimits(DEFAULT_SETTINGS, asked)).toEqual({ allow3d: false, unavailable3d: 'This browser has no WebGL2', keys: true })
    expect(shellLimits(all({ view3d: false }), asked)).toMatchObject({ allow3d: false, unavailable3d: 'This browser has no WebGL2' })
  })
})
