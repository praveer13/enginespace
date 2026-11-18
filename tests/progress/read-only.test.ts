/*
 * W1-T06, acceptance 1: "No status is stored: a test asserts that progress reads only events and content."
 *
 * Progress is what a learner holds: which knowledge components they have practised, earned and kept, and what a module's loop has
 * counted. ASSESSMENT §3.3 and ARCHITECTURE §7 say it is computed at read time from events and content, "nothing derived is stored".
 * Four things hold that line here:
 *   - the answer is a function of the events and the content: a ledger with status-shaped records planted everywhere else gives the
 *     answer of a ledger without them, and a ledger with its events taken away gives an empty course;
 *   - the function that derives it is handed those two and nothing more, and the hook that feeds it reads the ledger's events;
 *   - the code that derives and shows progress never calls a write of the evidence engine or of the browser's storage;
 *   - the code that derives it imports neither the settings nor the parts of the engine that read or write a store.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { GAMES } from '@es/play'
import { deriveProgress } from '@/progress/derive'
import { appSources, homeModule } from '@/progress/sources'
import { root } from '../ci/support'
import { ITEM, openTab, REVIEW, SharedDb } from '../evidence/support'
import { MAP } from './support'

const tr2 = (kc: string) => ({ ...REVIEW, ref: `review:${kc}` }) as typeof REVIEW

/** The sources the app hands to `deriveProgress`, over this small course's refs and the real game registry. */
const progressOf = (events: Parameters<typeof deriveProgress>[0]) => deriveProgress(events, MAP, appSources(MAP), homeModule)

describe('the answer is a function of the events and the content', () => {
  test('status-shaped records in the working store change nothing: only events are read', async () => {
    const tab = await openTab(new SharedDb(), null)
    await tab.engine.append(tr2('tr2.bubble'))
    await tab.engine.append(tr2('tr2.async-overlap'))
    await tab.engine.append({ ...ITEM, ok: false })
    const before = progressOf(tab.engine.getSnapshot().events)
    expect(before.counts.earned).toBe(2)

    // A learner's settings and drafts live in `working`, and nothing in it is evidence. Plant records that look like stored status.
    for (const key of ['progress:tr2', 'status:tr2', 'map:tr2', 'kc:tr2.graph-replay', 'module:tr2:complete', 'settings:module-state']) {
      await tab.engine.setWorking(key, { state: 'complete', earned: 99, kept: 99, complete: true })
    }
    const after = progressOf(tab.engine.getSnapshot().events)
    expect(after).toEqual(before)
    expect(after.modules.get('tr2')?.counts).toEqual({ total: 3, practised: 2, earned: 2, kept: 0 })
    expect(after.kcs.get('tr2.graph-replay')?.state).toBe('none')
  })

  test('taking the events away takes the progress away: nothing else held it', async () => {
    const tab = await openTab(new SharedDb(), null)
    await tab.engine.append(tr2('tr2.bubble'))
    expect(progressOf(tab.engine.getSnapshot().events).counts.earned).toBe(1)
    const reset = await tab.engine.reset()
    expect(reset.ok).toBe(true)
    expect(tab.engine.getSnapshot().events).toEqual([])
    expect(progressOf(tab.engine.getSnapshot().events).counts).toEqual({ total: 7, practised: 0, earned: 0, kept: 0 })
  })

  test('a second tab that opens the same ledger derives the same progress, because the events are all it has', async () => {
    const db = new SharedDb()
    const first = await openTab(db, null)
    await first.engine.append(tr2('tr2.bubble'))
    const second = await openTab(db, null)
    expect(progressOf(second.engine.getSnapshot().events)).toEqual(progressOf(first.engine.getSnapshot().events))
  })

  test('the function is handed the events, the content and the registry, and nothing else', () => {
    expect(deriveProgress.length).toBe(4)
    // The registry is the only thing the app passes besides the compiled map: a game's KCs and its home module.
    expect(homeModule('loop')).toBe(GAMES.get('loop')?.modules[0])
    expect(appSources(MAP).game('loop', 'close')).toEqual(GAMES.get('loop')?.kcs ?? [])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The code that derives and shows progress                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1')

function sourcesUnder(dir: string): string[] {
  const abs = path.join(root, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort()
}

/** Everything that derives progress (src/progress) and everything that shows it: the map's pieces, and the pages that use them. */
const DERIVES = sourcesUnder('src/progress')
const SHOWS = [...sourcesUnder('src/map'), 'src/pages/Map.tsx', 'src/pages/Module.tsx', 'src/pages/PlayIndex.tsx']
const ALL = [...DERIVES, ...SHOWS]
const text = (file: string) => strip(readFileSync(path.join(root, file), 'utf8'))

describe('the code that derives and shows progress', () => {
  test('is where the tracker puts it: src/progress derives, and src/map and the pages show', () => {
    expect(DERIVES).toEqual(['src/progress/derive.ts', 'src/progress/kcmap.ts', 'src/progress/next.ts', 'src/progress/sources.ts', 'src/progress/useProgress.ts', 'src/progress/useWayOn.ts', 'src/progress/words.ts'])
    for (const file of SHOWS) expect(existsSync(path.join(root, file)), file).toBe(true)
    expect(sourcesUnder('src/map').length).toBeGreaterThan(2)
  })

  // Every write there is: the evidence engine's, and the browser's own stores.
  const WRITES = [
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bIDB[A-Za-z]+\b/,
    /\bnavigator\.storage\b/,
    /\bdocument\.cookie\b/,
    /\bsetWorking\b/,
    /\bdeleteWorking\b/,
    /\bappend\b/,
    /\bimportLedger\b/,
    /\bundoImport\b/,
    /\bexportLedger\b/,
    /\bpreviewImport\b/,
    /\bresetEvidence\b|\.reset\(/,
    /\bconfigureEvidence\b/,
    /\bcloseEvidence\b/,
  ]

  test.each(ALL)('%s never writes: not the ledger, the working store, the settings, nor the browser\'s storage', (file) => {
    const source = text(file)
    const hits = WRITES.filter((pattern) => pattern.test(source)).map(String)
    expect(hits).toEqual([])
  })

  test.each(ALL)('%s reads nothing of the ledger but its events: not the working store, the receipts nor the checkpoints', (file) => {
    const source = text(file)
    // A lesson's `checkpoints` in the map's lessons table are its item blocks outside the Test (next.ts), not the ledger's undo points.
    const hits = [/\bworking\b/, /\breceipts\b/, /(?<!lesson\.)\bcheckpoints\b/, /\bunsaved\b/, /\bstuck\b/].filter((pattern) => pattern.test(source)).map(String)
    expect(hits).toEqual([])
  })

  /*
   * One exception, D-066's (REDESIGN §2.4): the hook that opens the ledger keeps a copy of `nextStep`'s answer, the pointer, and reads the
   * bookmark, so that the header can say Continue without opening the ledger. It imports those two from the settings' store and nothing
   * else of it, and the pointer holds the answer's link and words, never a state, a count or an event (tests/app/places.test.ts).
   */
  test.each(ALL)('%s imports no settings and none of the parts of the engine that read or write a store, but the pointer and the bookmark', (file) => {
    const source = text(file)
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    const banned = imports.filter((from) => /^@\/settings(\/|$)|^\.\.?\/settings|^@\/evidence\/(engine|idb-store|outbox|channel|guard|import|export|transfer|notice)$/.test(from))
    if (file === 'src/progress/useWayOn.ts') {
      expect(banned).toEqual(['@/settings/bookmark', '@/settings/store'])
      expect(/import \{ ([^}]+) \} from '@\/settings\/bookmark'/.exec(source)?.[1]).toBe('readPlace')
      expect(/import \{ ([^}]+) \} from '@\/settings\/store'/.exec(source)?.[1]).toBe('keepPointer')
    } else if (file === 'src/progress/useProgress.ts') {
      // The sentence that tells the last work back reads the place last in view, as the way on does, to say which lesson a shared question set was for.
      expect(banned).toEqual(['@/settings/bookmark'])
      expect(/import \{ ([^}]+) \} from '@\/settings\/bookmark'/.exec(source)?.[1]).toBe('readPlace')
    } else expect(banned).toEqual([])
  })

  test('the derivation is pure: no React, no clock, no entropy, no store', () => {
    for (const file of ['src/progress/derive.ts', 'src/progress/kcmap.ts', 'src/progress/next.ts', 'src/progress/words.ts']) {
      const source = text(file)
      expect(source, file).not.toMatch(/from\s+'react'/)
      expect(source, file).not.toMatch(/\bDate\.now\b|\bnew Date\(\)|\bMath\.random\b|\bperformance\.now\b|\bcrypto\./)
      expect(source, file).not.toMatch(/from\s+'@\/evidence\/useEvidence'/)
    }
  })

  test('the only files that open the ledger are the two hooks, and each takes the events and the ready flag and no more', () => {
    const openers = DERIVES.filter((file) => /useEvidence/.test(text(file)))
    // useWayOn is the way on alone, for a lesson page, and useProgress calls it for Course and a module page.
    expect(openers).toEqual(['src/progress/useProgress.ts', 'src/progress/useWayOn.ts'])
    for (const file of openers) expect(text(file), file).toMatch(/const \{ ready, events \} = useEvidence\(\)/)
  })
})
