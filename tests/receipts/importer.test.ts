/*
 * W2-T07, W2-T08: bringing a receipt back, end to end except for the browser: a file is checked by the rules of packages/verify (the same function the
 * worker runs), and a receipt that was read whole is kept in a real ledger engine on the memory store (the same engine the page runs). The
 * worker, the page and the real IndexedDB are held in a browser, in e2e/receipts-import.spec.ts.
 *
 *   - An honest receipt is kept: its record and its event are written in one transaction, the event spends the challenge's token, and the page's
 *     own list of challenges then calls the token used, by this receipt. The bare sample is `gpu-unverified` and credits nothing: the stage asks of its
 *     evidence (rules 7 to 9) what a toy trace cannot give, and the verdict says which checks.
 *   - A receipt checked again adds a report and no event. A second receipt for the same token is kept, labelled, and does not take the token.
 *   - A reused token fails binding. An unknown grader build gives `gpu-unverified`. Both are kept with their reasons.
 *   - An oversized file, a zip bomb and a tampered hash are refused with a message, and the ledger is as it was: no record, no event, no token spent.
 *   - A check that breaks, a ledger that refuses, and a page that has gone keep nothing, and say so.
 */
import { describe, expect, test } from 'bun:test'
import { gzipSync } from 'node:zlib'
import { parseExport } from '@es/ledger'
import type { Draft } from '@es/ledger'
import { verifyBundle } from '@es/verify'
import type { Outcome, PublishedGrader } from '@es/verify'
import { ATLAS } from '@/receipts/atlas'
import { heldChallenges } from '@/receipts/challenge'
import { creditReceipts } from '@/receipts/credit'
import { STAGE_DECLARATIONS } from '@/receipts/declared'
import { importReceipt } from '@/receipts/importer'
import type { ImportEnv, ImportResult } from '@/receipts/importer'
import { readReceipt } from '@/receipts/records'
import { readStoredReport, MAX_COMPRESSED_BYTES, MAX_DECOMPRESSED_BYTES, verdictOf } from '@es/verify'
import { SharedDb, openTab } from '../evidence/support'
import type { Tab } from '../evidence/support'
import { changed, fileOf, sampleBundle, sha256, VLLM_PIN } from '../verify/support'

const NOW_ISO = '2026-11-09T12:00:00.000Z'
const ISSUED_ISO = '2026-11-08T12:00:00.000Z'

const bundle = sampleBundle()
const { token, seed, nonce, issuedOn } = bundle.receipt.challenge
const GRADER: PublishedGrader = { version: bundle.receipt.grader.version, sourceSha256: bundle.receipt.grader.sourceSha256 }

const CHALLENGE: Draft<'challenge'> = { kind: 'challenge', ref: 'challenge:tr3.profile.s2', data: { token, seed, nonce, issuedOn } }

/** A ledger engine with the challenge of the sample issued a day ago, on the memory store, with the clock at the moment of the import. */
async function ledgerWithChallenge(): Promise<{ tab: Tab; db: SharedDb }> {
  const db = new SharedDb()
  const tab = await openTab(db, null)
  tab.clock.set(ISSUED_ISO)
  await tab.engine.append(CHALLENGE)
  tab.clock.set(NOW_ISO)
  return { tab, db }
}

function envOf(tab: Tab, over: Partial<ImportEnv> = {}): ImportEnv {
  const snapshot = tab.engine.getSnapshot()
  return {
    verify: (file, context) => verifyBundle(file, context),
    keep: (input) => tab.engine.keepReceipt(input),
    ledger: { events: snapshot.events, receipts: snapshot.receipts },
    now: () => Date.parse(NOW_ISO),
    graders: [GRADER],
    pins: [VLLM_PIN],
    ...over,
  }
}

const fileNamed = (blob: Blob, name = 'tr3.profile-s2-20261109T120000Z.es.json.gz'): File => new File([blob], name)
const kept = (result: ImportResult) => {
  if (result.step !== 'kept') throw new Error(`the receipt was not kept: ${JSON.stringify(result).slice(0, 400)}`)
  return result
}
const ruleStatuses = (result: ImportResult) => (result.step === 'failed' ? [] : result.rules.map((rule) => `${rule.id}:${rule.status}`))
/** The first six, which are the rules of W2-T07: the bare sample's rules 7 to 9 are the bestiary's and the pipeline's to look at. */
const sixOf = (result: ImportResult) => ruleStatuses(result).slice(0, 6)
const LATER_SKIPPED = ['rechecks:skipped', 'recomputation:skipped', 'floors:skipped']

describe('an honest receipt', () => {
  test('is kept: the record and the event are written, and the answer says which receipt, with the verdict that holds it back', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab)))
    expect(sixOf(result)).toEqual(['caps:pass', 'schema:pass', 'integrity:pass', 'binding:pass', 'grader:pass', 'pins:pass'])
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(result.recheck).toBe(false)
    expect(result.verdict.provenance).toBe('gpu-unverified')
    expect(result.verdict.reasons.length).toBeGreaterThan(1)
    expect(result.verdict.reasons.join(' ')).toContain('X1 is a check this site does not run yet')
    expect(result.file).toEqual({ name: 'tr3.profile-s2-20261109T120000Z.es.json.gz', bytes: expect.any(Number) })

    const snapshot = tab.engine.getSnapshot()
    expect(snapshot.receipts.map((record) => record.sha256)).toEqual([result.sha256])
    const receiptEvents = snapshot.events.filter((event) => event.kind === 'receipt')
    expect(receiptEvents).toHaveLength(1)
  })

  test('is stored as the receipt the page reads, and its report reads back with the nine rules it stores and says it ran ten', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab)))
    const [record] = tab.engine.getSnapshot().receipts
    const held = readReceipt(record)
    expect(held.ok).toBe(true)
    if (held.ok) {
      expect(held.receipt).toEqual(bundle.receipt)
      expect(held.sha256).toBe(result.sha256)
      expect(held.reports).toHaveLength(1)
    }
    expect(record.reports[0].at).toBe(NOW_ISO)
    const report = readStoredReport(record.reports[0].report)
    expect(report?.rules.map((rule) => rule.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'fail', 'fail'])
    expect(report?.ran).toBe(10)
    expect(report?.sizes?.compressedBytes).toBeGreaterThan(0)
    expect(verdictOf(bundle.receipt, report?.rules ?? [], report?.ran).provenance).toBe('gpu-unverified')
  })

  test('writes an event that holds no verdict, names the receipt and the token, and holds nothing about the machine but its GPU, engine and driver', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab)))
    const event = tab.engine.getSnapshot().events.find((entry) => entry.kind === 'receipt')
    expect(event).toMatchObject({
      kind: 'receipt',
      ref: 'receipt:tr3.profile.s2',
      data: {
        receiptSha256: result.sha256,
        challenge: token,
        graderVersion: '0.1.0',
        environment: 'Example GPU 24GB, vllm 0.33.0, driver 580.82.07',
      },
    })
    expect(event).not.toHaveProperty('ok')
    expect(event).not.toHaveProperty('score')
    expect(event).not.toHaveProperty('provenance')
    expect(event?.kind === 'receipt' ? event.data : {}).not.toHaveProperty('checks')
    // What it is worth is read from the record: this receipt credits nothing, and the report says each check as this browser ran it or the grader attested it.
    const snapshot = tab.engine.getSnapshot()
    expect(creditReceipts(snapshot.events, snapshot.receipts).find((entry) => entry.kind === 'receipt')).toMatchObject({ ok: false, score: 0, provenance: 'gpu-unverified' })
    const stored = readStoredReport(snapshot.receipts[0].reports[0].report)
    const checks = result.verdict.checks
    expect(checks.filter((check) => ['agreement', 'runner', 'engine-integrity'].includes(check.id)).map(({ id, verdict, bound }) => ({ id, verdict, bound }))).toEqual([
      { id: 'agreement', verdict: 'attested', bound: 'value 0.995, bound 0.99, n 200; teacher-forced agreement over 200 positions' },
      { id: 'runner', verdict: 'attested', bound: 'MRV2 ran' },
      { id: 'engine-integrity', verdict: 'attested', bound: 'tolerance 0' },
    ])
    expect(checks.find((check) => check.id === 'T2')).toMatchObject({ verdict: 'pass' })
    expect(checks.find((check) => check.id === 'X1')).toMatchObject({ verdict: 'fail' })
    expect(stored?.rules.flatMap((rule) => rule.checks ?? []).map((check) => check.id)).toContain('T2')
  })

  test('spends the token: the page\'s own list of challenges calls it used, by this receipt', async () => {
    const { tab } = await ledgerWithChallenge()
    const before = heldChallenges(tab.engine.getSnapshot().events, Date.parse(NOW_ISO))
    expect(before.map((challenge) => challenge.state)).toEqual(['open'])
    const result = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab)))
    const after = heldChallenges(tab.engine.getSnapshot().events, Date.parse(NOW_ISO))
    expect(after.map((challenge) => [challenge.state, challenge.usedBy])).toEqual([['used', result.sha256]])
  })

  test('survives an export and an import of the ledger: what was kept passes the codec that reads an export', async () => {
    const { tab } = await ledgerWithChallenge()
    kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab)))
    const exported = await tab.engine.exportLedger()
    expect(exported.ok).toBe(true)
    if (exported.ok) {
      const parsed = parseExport(exported.text)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect([parsed.file.receipts.length, parsed.file.events.filter((event) => event.kind === 'receipt').length]).toEqual([1, 1])
    }
  })
})

describe('a receipt checked again', () => {
  test('adds a report to its record and writes no second event: it is the receipt that spent the token, and it is bound again', async () => {
    const { tab } = await ledgerWithChallenge()
    const first = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab)))
    tab.clock.advance(60_000)
    const again = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab, { now: () => Date.parse(NOW_ISO) + 60_000 })))
    expect(again.recheck).toBe(true)
    expect(again.sha256).toBe(first.sha256)
    expect(sixOf(again)).toEqual(['caps:pass', 'schema:pass', 'integrity:pass', 'binding:pass', 'grader:pass', 'pins:pass'])
    const snapshot = tab.engine.getSnapshot()
    expect(snapshot.receipts).toHaveLength(1)
    expect(snapshot.receipts[0].reports.map((report) => report.at)).toEqual([NOW_ISO, '2026-11-09T12:01:00.000Z'])
    expect(snapshot.events.filter((event) => event.kind === 'receipt')).toHaveLength(1)
  })

  test('is bound again even after the token\'s 14 days: a token that was spent in time stays spent', async () => {
    const { tab } = await ledgerWithChallenge()
    kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab)))
    const later = Date.parse(NOW_ISO) + 40 * 86_400_000
    const again = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab, { now: () => later })))
    expect(ruleStatuses(again)[3]).toBe('binding:pass')
  })
})

describe('a reused token', () => {
  test('fails binding for a second receipt, which is kept with its reason and does not take the token from the first', async () => {
    const { tab } = await ledgerWithChallenge()
    const first = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab)))
    // The same stage and token, another run: its notes differ, so it is another receipt.
    const second = changed((b) => {
      b.receipt.notes = 'A second run on the same challenge.'
    })
    // A minute later: the ledger spends a token on the earliest receipt event that carries it, by the instant it was written.
    tab.clock.advance(60_000)
    const result = kept(await importReceipt(fileNamed(fileOf(second)), envOf(tab, { now: () => Date.parse(NOW_ISO) + 60_000 })))
    expect(result.sha256).not.toBe(first.sha256)
    expect(result.recheck).toBe(false)
    expect(sixOf(result)).toEqual(['caps:pass', 'schema:pass', 'integrity:pass', 'binding:fail', 'grader:pass', 'pins:pass'])
    expect(result.rules[3].problems[0]).toContain(`spent by receipt ${first.sha256.slice(0, 8)} already`)
    expect(result.verdict.provenance).toBe('gpu-unverified')
    const snapshot = tab.engine.getSnapshot()
    expect(snapshot.receipts).toHaveLength(2)
    expect(heldChallenges(snapshot.events, Date.parse(NOW_ISO)).map((challenge) => challenge.usedBy)).toEqual([first.sha256])
  })

  test('fails binding for a token this ledger never issued, a friend\'s receipt, and is kept with that reason', async () => {
    const db = new SharedDb()
    const tab = await openTab(db, null)
    const result = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab)))
    expect(ruleStatuses(result)[3]).toBe('binding:fail')
    expect(result.rules[3].summary).toBe("This browser's ledger holds no challenge with this token.")
  })

  test('fails binding for a token that expired, and the message says when', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab, { now: () => Date.parse(ISSUED_ISO) + 15 * 86_400_000 })))
    expect(ruleStatuses(result)[3]).toBe('binding:fail')
    expect(result.rules[3].problems[0]).toContain('The token expired at 2026-11-22 12:00 UTC')
  })
})

describe('an unknown grader build', () => {
  test('gives gpu-unverified: the receipt is kept with the reason, and the token is spent because it was bound', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = kept(await importReceipt(fileNamed(fileOf(bundle)), envOf(tab, { graders: [{ version: '0.1.0', sourceSha256: sha256('what the site published') }] })))
    expect(sixOf(result)).toEqual(['caps:pass', 'schema:pass', 'integrity:pass', 'binding:pass', 'grader:fail', 'pins:pass'])
    expect(result.verdict.provenance).toBe('gpu-unverified')
    expect(result.verdict.reasons[0]).toBe('enginespace-grader 0.1.0 is not the build this site published under that version.')
    const event = tab.engine.getSnapshot().events.find((entry) => entry.kind === 'receipt')
    expect(event).not.toHaveProperty('ok')
    const snapshot = tab.engine.getSnapshot()
    expect(creditReceipts(snapshot.events, snapshot.receipts).find((entry) => entry.kind === 'receipt')).toMatchObject({ ok: false, provenance: 'gpu-unverified' })
    expect(heldChallenges(tab.engine.getSnapshot().events, Date.parse(NOW_ISO))[0].state).toBe('used')
  })

  test('is every grader, with the site as it is today: it has published none, so the shipped list knows no build', async () => {
    const { tab } = await ledgerWithChallenge()
    const env = envOf(tab)
    delete env.graders
    delete env.pins
    const result = kept(await importReceipt(fileNamed(fileOf(bundle)), env))
    expect(ruleStatuses(result)[4]).toBe('grader:fail')
    expect(result.verdict.provenance).toBe('gpu-unverified')
  })
})

describe('a file that is refused', () => {
  /** The ledger is as it was: no record, no event, and the token still open. */
  async function untouched(tab: Tab): Promise<void> {
    const snapshot = tab.engine.getSnapshot()
    expect(snapshot.receipts).toEqual([])
    expect(snapshot.events.map((event) => event.kind)).toEqual(['challenge'])
    expect(heldChallenges(snapshot.events, Date.parse(NOW_ISO))[0].state).toBe('open')
  }

  test('an oversized file is refused with a message, and nothing is kept', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = await importReceipt(fileNamed(new Blob([new Uint8Array(MAX_COMPRESSED_BYTES + 1)])), envOf(tab))
    expect(result.step).toBe('refused')
    expect(ruleStatuses(result)[0]).toBe('caps:fail')
    if (result.step === 'refused') expect(result.rules[0].summary).toContain('The file is 33,554,433 bytes, and the site reads at most 33,554,432 compressed')
    await untouched(tab)
  })

  test('a zip bomb is refused with a message, and nothing is kept', async () => {
    const { tab } = await ledgerWithChallenge()
    const bomb = new Blob([new Uint8Array(gzipSync(Buffer.alloc(MAX_DECOMPRESSED_BYTES + 8 * 1024 * 1024)))])
    const result = await importReceipt(fileNamed(bomb), envOf(tab))
    expect(result.step).toBe('refused')
    if (result.step === 'refused') expect(result.rules[0].summary).toContain('bytes that the site reads once decompressed')
    await untouched(tab)
  })

  test('a tampered hash fails integrity, naming the artifact, and nothing is kept: the token is still open', async () => {
    const { tab } = await ledgerWithChallenge()
    const tampered = changed((b) => {
      const entry = b.receipt.artifacts.find((artifact) => artifact.id === 'trace')
      if (entry !== undefined) entry.sha256 = '1'.repeat(64)
    })
    const result = await importReceipt(fileNamed(fileOf(tampered)), envOf(tab))
    expect(result.step).toBe('refused')
    expect(ruleStatuses(result)).toEqual(['caps:pass', 'schema:pass', 'integrity:fail', 'binding:skipped', 'grader:skipped', 'pins:skipped', ...LATER_SKIPPED])
    if (result.step === 'refused') expect(result.rules[2].problems[0]).toContain('Artifact "trace"')
    await untouched(tab)
  })

  test('a file that is not a bundle is refused, and so is one that is not gzip', async () => {
    const { tab } = await ledgerWithChallenge()
    expect((await importReceipt(fileNamed(fileOf({ hello: 'world' })), envOf(tab))).step).toBe('refused')
    expect((await importReceipt(fileNamed(new Blob(['not a bundle'])), envOf(tab))).step).toBe('refused')
    await untouched(tab)
  })
})

describe('a check that cannot finish', () => {
  test('is failed when the worker breaks, with its message, and nothing is kept', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = await importReceipt(
      fileNamed(fileOf(bundle)),
      envOf(tab, {
        verify: async () => {
          throw new Error('The check took longer than 120 seconds, so it was stopped. Nothing was kept.')
        },
      }),
    )
    expect(result).toEqual({ step: 'failed', file: { name: expect.any(String), bytes: expect.any(Number) }, message: 'The check took longer than 120 seconds, so it was stopped. Nothing was kept.' })
    expect(tab.engine.getSnapshot().receipts).toEqual([])
  })

  test('is failed when the ledger refuses what was checked, with the ledger\'s own words, and the rules are still reported', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = await importReceipt(fileNamed(fileOf(bundle)), envOf(tab, { keep: async () => ({ ok: false, error: 'read-only', detail: 'This tab is read-only, so it cannot import or undo. Reload to update, then try again.' }) }))
    expect(result.step).toBe('failed')
    if (result.step === 'failed') {
      expect(result.message).toBe('This tab is read-only, so it cannot import or undo. Reload to update, then try again.')
      expect(result.rules).toHaveLength(9)
    }
  })

  test('is failed when the draft would not pass the codec, and the throw is the message', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = await importReceipt(
      fileNamed(fileOf(bundle)),
      envOf(tab, {
        keep: async () => {
          throw new Error('cannot write the event: data.environment: must be one line of plain text')
        },
      }),
    )
    expect(result).toMatchObject({ step: 'failed', message: 'cannot write the event: data.environment: must be one line of plain text' })
  })

  test('keeps nothing when the page has gone before the check finished', async () => {
    const { tab } = await ledgerWithChallenge()
    const result = await importReceipt(fileNamed(fileOf(bundle)), envOf(tab, { cancelled: () => true }))
    expect(result).toMatchObject({ step: 'failed', message: 'The page was closed before the check finished, so nothing was kept.' })
    expect(tab.engine.getSnapshot().receipts).toEqual([])
  })

  test('hands the worker only plain data: a book of the ledger\'s challenges, the moment, the published list and the pins', async () => {
    const { tab } = await ledgerWithChallenge()
    let seen: unknown
    await importReceipt(
      fileNamed(fileOf(bundle)),
      envOf(tab, {
        verify: async (file, context) => {
          seen = context
          return verifyBundle(file, context) as Promise<Outcome>
        },
      }),
    )
    expect(JSON.parse(JSON.stringify(seen))).toEqual({
      book: [{ token, stage: 'tr3.profile.s2', seed, nonce, issuedOn, at: ISSUED_ISO }],
      nowMs: Date.parse(NOW_ISO),
      graders: [GRADER],
      pins: [VLLM_PIN],
      atlas: ATLAS,
      // The site's own declarations (TR0's three stages: the pinned model's files), and no bank until the owner records one.
      stages: STAGE_DECLARATIONS,
      banks: {},
    })
  })
})
