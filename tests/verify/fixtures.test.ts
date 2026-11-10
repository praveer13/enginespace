/*
 * W2-T08 and W2-T12: the receipt fixtures of tests/fixtures/receipts/. The folder holds the owner's real bundles from the GPU smoke runs (W2-T12), pinned by SHA-256
 * and dated, and there are none yet. The tests are written for them, and run on the folder as it is:
 *
 *   - The manifest is in the format of its README, and each file is its entry's SHA-256. The loader is run on a folder of synthetic bundles in a temporary
 *     folder, so that the code which reads the owner's has run before they exist, and it refuses a file that changed.
 *   - Each real fixture passes browser verification, and the forgeries of tests/verify/bestiary.ts are made from it, and each fails its named check with the bound
 *     printed. With no fixtures there is nothing to run, and the first test says so.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { verifyBundle } from '@es/verify'
import type { CheckedOutcome } from '@es/verify'
import { forgeriesFor } from './bestiary'
import { FIXTURES_DIR, loadFixtures, readManifest } from './fixtures'
import { fileOf } from './support'
import { contextOf, replayFixture } from './synthetic'

const folders: string[] = []
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})
function folderWith(files: Record<string, Uint8Array>, manifest: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'es-fixtures-'))
  folders.push(dir)
  for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(dir, name), bytes)
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  return dir
}
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

describe('the manifest of the owner\'s fixtures', () => {
  test('is in the format of the folder\'s README, and lists each file once', () => {
    const manifest = readManifest()
    expect(manifest.schema).toBe('enginespace/receipt-fixtures@1')
    expect(new Set(manifest.fixtures.map((entry) => entry.file)).size).toBe(manifest.fixtures.length)
  })

  test('is empty until the owner\'s GPU smoke runs (W2-T12) commit their bundles, and a folder with no manifest is an empty list', () => {
    expect(readManifest(path.join(FIXTURES_DIR, 'nothing-here')).fixtures).toEqual([])
  })

  test('refuses an entry that is not in the format, and names it', () => {
    const bad = (entry: unknown): string => {
      try {
        readManifest(folderWith({}, { schema: 'enginespace/receipt-fixtures@1', fixtures: [entry] }))
        return 'accepted'
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }
    const good = { file: 'a.es.json.gz', sha256: 'a'.repeat(64), dated: '2026-11-20', stage: 'tr8.replay.s2', gpu: 'NVIDIA H100 80GB HBM3' }
    expect(bad(good)).toBe('accepted')
    expect(bad({ ...good, sha256: 'A'.repeat(64) })).toBe('manifest.json: fixtures[0].sha256 is not 64 lower-case hex digits')
    expect(bad({ ...good, dated: '20 November' })).toBe('manifest.json: fixtures[0].dated is not a date')
    expect(bad({ ...good, file: '../a.es.json.gz' })).toBe("manifest.json: fixtures[0].file is not a bundle's file name")
    expect(bad({ ...good, gpu: 4 })).toBe('manifest.json: fixtures[0].gpu is not a string')
    expect(() => readManifest(folderWith({}, { schema: 'else', fixtures: [] }))).toThrow('schema is "else"')
  })
})

describe('the loader, on synthetic bundles in a folder of their own', () => {
  const honest = replayFixture()
  const bytes = new Uint8Array(gzipSync(JSON.stringify(honest.bundle)))
  const entry = { file: 'tr8-replay-s2-synthetic.es.json.gz', sha256: sha(bytes), dated: '2026-11-10', stage: 'tr8.replay.s2', gpu: 'NVIDIA H100 80GB HBM3' }

  test('reads a pinned bundle and the context that makes it pass, and the bundle passes', async () => {
    const dir = folderWith({ [entry.file]: bytes }, { schema: 'enginespace/receipt-fixtures@1', fixtures: [entry] })
    const [fixture] = loadFixtures(dir, (bundle) => contextOf(bundle, honest.context.stages))
    expect(fixture.bundle).toEqual(honest.bundle)
    const outcome = (await verifyBundle(fileOf(fixture.bundle), fixture.context)) as CheckedOutcome
    expect(outcome.verdict.provenance).toBe('gpu-verified')
  })

  test('forges from what it read: the bestiary is made from the bundle of a folder as it is from one in memory', async () => {
    const dir = folderWith({ [entry.file]: bytes }, { schema: 'enginespace/receipt-fixtures@1', fixtures: [entry] })
    const [fixture] = loadFixtures(dir, (bundle) => contextOf(bundle, honest.context.stages))
    const forgeries = forgeriesFor(fixture)
    expect(forgeries.length).toBeGreaterThanOrEqual(7)
    for (const forgery of forgeries) {
      const outcome = (await verifyBundle(fileOf(forgery.forge(fixture).bundle), forgery.forge(fixture).context)) as CheckedOutcome
      expect([forgery.id, outcome.verdict.provenance]).toEqual([forgery.id, 'gpu-unverified'])
    }
  })

  test('refuses a file whose bytes are not the SHA-256 that the manifest pins: a fixture that changed is another fixture', () => {
    const changed = new Uint8Array(gzipSync(JSON.stringify({ ...honest.bundle, receipt: { ...honest.bundle.receipt, notes: 'edited' } })))
    const dir = folderWith({ [entry.file]: changed }, { schema: 'enginespace/receipt-fixtures@1', fixtures: [entry] })
    expect(() => loadFixtures(dir)).toThrow(`${entry.file}: its bytes hash to ${sha(changed)}, and the manifest pins ${entry.sha256}`)
  })

  test('refuses a bundle of another stage than its entry says', () => {
    const dir = folderWith({ [entry.file]: bytes }, { schema: 'enginespace/receipt-fixtures@1', fixtures: [{ ...entry, stage: 'tr3.profile.s2' }] })
    expect(() => loadFixtures(dir)).toThrow('the receipt is of tr8.replay.s2, and the manifest says tr3.profile.s2')
  })
})

describe('the owner\'s fixtures', () => {
  const fixtures = loadFixtures()

  test('are each its manifest entry\'s SHA-256, and there are none to run until W2-T12 commits them', () => {
    expect(fixtures.map((fixture) => fixture.name)).toEqual(readManifest().fixtures.map((entry) => entry.file))
  })

  for (const fixture of fixtures) {
    test(`${fixture.name} passes browser verification: every rule, and the verdict of ${fixture.stage}`, async () => {
      const outcome = await verifyBundle(fileOf(fixture.bundle), fixture.context)
      if (outcome.kind !== 'checked') throw new Error('refused')
      expect(outcome.rules.map((rule) => rule.status)).toEqual(Array(9).fill('pass'))
      expect(['gpu-verified', 'practice']).toContain(outcome.verdict.provenance)
    })

    for (const forgery of forgeriesFor(fixture)) {
      test(`${fixture.name}: ${forgery.title} fails ${forgery.fails.check} with the bound printed`, async () => {
        const forged = forgery.forge(fixture)
        const outcome = await verifyBundle(fileOf(forged.bundle), forged.context)
        if (outcome.kind !== 'checked') throw new Error('refused')
        const result = outcome.rules.find((rule) => rule.rule === forgery.fails.rule)
        const text = forgery.fails.rule <= 6 ? [result?.summary, ...(result?.problems ?? [])].join(' ') : (result?.checks ?? []).find((check) => check.id === forgery.fails.check && check.status === 'fail')?.bound
        expect(text).toMatch(forgery.bound)
        expect(outcome.verdict.provenance).toBe('gpu-unverified')
      })
    }
  }
})
