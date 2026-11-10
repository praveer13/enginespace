/*
 * W2-T07, rules 1 to 6 of ARCHITECTURE §8.5 together: `verifyBundle` on a file, and the report and the verdict it leaves. W2-T08 added rules 7 to 9 to the
 * report (they have their own tests, and the bestiary's) and the verdict as rule 10. The sample here is bare: it is a `tr3.profile.s2` receipt with a
 * toy trace, and the stage asks for far more of it, so it fails rules 8 and 9 and is not credited, and these tests look at the first six.
 *
 * The task's four checks, on files:
 *   1. Oversized and zip-bomb files abort with a message. They are `refused` at rule 1, and every rule after it says it did not run.
 *   2. A tampered hash fails integrity. The file is `refused` at rule 3 and the message names the artifact.
 *   3. A reused token fails binding. The receipt is `checked`, rule 4 failed, and it is `gpu-unverified`.
 *   4. An unknown grader build gives `gpu-unverified`. Rule 5 failed, and the verdict says why.
 * And the honest ones: the synthetic sample, and the bundle that the Python grader's own code wrote, pass all six rules when the ledger, the
 * published list and the pins are the ones they were made against.
 *
 * What is held back is the credit. The bare sample asks of rules 7 to 9 what it cannot give, and the verdict says which checks, in words.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { bundleSchema } from '@es/schema/bundle'
import {
  MAX_COMPRESSED_BYTES,
  MAX_DECOMPRESSED_BYTES,
  readStoredReport,
  RULES,
  RULES_IN_ALL,
  RULES_RUN,
  storedReport,
  verdictOf,
  verifyBundle,
} from '@es/verify'
import type { CheckedOutcome, Outcome, RefusedOutcome, RuleResult } from '@es/verify'
import { root } from '../ci/support'
import { bookedFor, changed, contextFor, fileOf, NOW, receiptSha, resigned, sampleBundle, sha256, VLLM_PIN } from './support'

const statuses = (outcome: Outcome): string[] => outcome.rules.map((rule) => `${rule.rule}:${rule.id}:${rule.status}`)
const checked = (outcome: Outcome): CheckedOutcome => {
  if (outcome.kind !== 'checked') throw new Error(`the file was refused: ${JSON.stringify(outcome.rules)}`)
  return outcome
}
const refused = (outcome: Outcome): RefusedOutcome => {
  if (outcome.kind !== 'refused') throw new Error('the file was taken')
  return outcome
}
const ALL_PASS = ['1:caps:pass', '2:schema:pass', '3:integrity:pass', '4:binding:pass', '5:grader:pass', '6:pins:pass']
/** What rules 7 to 9 say when a rule before them stopped the check. */
const LATER_SKIPPED = ['7:rechecks:skipped', '8:recomputation:skipped', '9:floors:skipped']
const firstSix = (outcome: Outcome): string[] => statuses(outcome).slice(0, 6)

describe('the honest sample', () => {
  test('passes the first six rules, in the order and with the names of A§8.5, and the nine rules that a report stores have the names of A§8.5 too', async () => {
    const outcome = checked(await verifyBundle(fileOf(sampleBundle()), contextFor()))
    expect(firstSix(outcome)).toEqual(ALL_PASS)
    expect(RULES.map((rule) => [rule.rule, rule.id])).toEqual([[1, 'caps'], [2, 'schema'], [3, 'integrity'], [4, 'binding'], [5, 'grader'], [6, 'pins'], [7, 'rechecks'], [8, 'recomputation'], [9, 'floors']])
    expect(outcome.rules.slice(0, 6).every((rule) => rule.problems.length === 0)).toBe(true)
    expect(outcome.rules).toHaveLength(9)
  })

  test('comes back parsed, with the receipt\'s identity, which is the SHA-256 of its canonical JSON', async () => {
    const bundle = sampleBundle()
    const outcome = checked(await verifyBundle(fileOf(bundle), contextFor()))
    expect(outcome.receipt).toEqual(bundle.receipt)
    expect(outcome.receiptSha256).toBe(receiptSha(bundle.receipt))
    expect(outcome.sizes.compressedBytes).toBeGreaterThan(100)
    expect(outcome.sizes.decompressedBytes).toBeGreaterThan(outcome.sizes.compressedBytes)
  })

  test('is not credited, and says why: the stage asks of the evidence what the bare sample does not give, and the verdict names each check', async () => {
    const outcome = checked(await verifyBundle(fileOf(sampleBundle()), contextFor()))
    expect(RULES_RUN).toBe(10)
    expect(RULES_IN_ALL).toBe(10)
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
    // The toy trace has no capture time and says it is synthetic; the site declares no step count for the stage; the GPU is not in the atlas; the checks
    // that tr3.profile.s2 requires and that are not built yet are named with the task that builds them; the grader lists none of the checks the stage requires.
    const reasons = outcome.verdict.reasons.join('\n')
    expect(reasons).toContain('T1: ')
    expect(reasons).toContain('T6: This site declares no step count for tr3.profile.s2.')
    expect(reasons).toContain('P1: The hardware atlas has no entry for "Example GPU 24GB"')
    expect(reasons).toContain('X1 is not built yet: W2-T23 builds it')
    expect(outcome.rules[6].status).toBe('pass')
    expect(outcome.rules[7].status).toBe('fail')
    expect(outcome.rules[8].status).toBe('fail')
  })

  test('is the same receipt when the file is written again: the identity does not depend on the gzip, the key order or the spacing', async () => {
    const bundle = sampleBundle()
    const first = checked(await verifyBundle(fileOf(bundle), contextFor()))
    const spaced = new Blob([new Uint8Array(gzipSync(JSON.stringify(bundle, null, 4)))])
    const second = checked(await verifyBundle(spaced, contextFor()))
    expect(second.receiptSha256).toBe(first.receiptSha256)
  })
})

describe('the bundle that the Python grader wrote', () => {
  const bytes = readFileSync(path.join(root, 'tests/fixtures/grader/sample.es.json.gz'))
  const expected = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/grader/sample.expected.json'), 'utf8')) as { receiptSha256: string }
  const file = (): Blob => new Blob([new Uint8Array(bytes)])
  const document = JSON.parse(new TextDecoder().decode(gunzipSync(bytes))) as unknown
  const { receipt } = bundleSchema.parse(document)

  test('passes rules 1 to 3 as it is written, with the identity that the grader computed, and fails rules 4 to 6 until the site knows its ledger, grader and pins', async () => {
    const outcome = checked(await verifyBundle(file(), { book: [], nowMs: NOW, graders: [], pins: [] }))
    expect(firstSix(outcome)).toEqual(['1:caps:pass', '2:schema:pass', '3:integrity:pass', '4:binding:fail', '5:grader:fail', '6:pins:fail'])
    expect(outcome.receiptSha256).toBe(expected.receiptSha256)
  })

  test('passes all six when the ledger holds its challenge, the site published its grader and the engine is on the pin', async () => {
    const outcome = checked(
      await verifyBundle(file(), {
        book: [bookedFor(receipt)],
        nowMs: NOW,
        graders: [{ version: receipt.grader.version, sourceSha256: receipt.grader.sourceSha256 }],
        pins: [VLLM_PIN],
      }),
    )
    expect(firstSix(outcome)).toEqual(ALL_PASS)
    expect(outcome.receiptSha256).toBe(expected.receiptSha256)
  })
})

describe('an oversized file', () => {
  test('is refused at rule 1 with the size and the cap in its message, and every later rule says it did not run', async () => {
    const outcome = refused(await verifyBundle(new Blob([new Uint8Array(MAX_COMPRESSED_BYTES + 1)]), contextFor()))
    expect(statuses(outcome)).toEqual(['1:caps:fail', '2:schema:skipped', '3:integrity:skipped', '4:binding:skipped', '5:grader:skipped', '6:pins:skipped', ...LATER_SKIPPED])
    expect(outcome.rules[0].summary).toBe('The file is 33,554,433 bytes, and the site reads at most 33,554,432 compressed (the cap of rule 1).')
    expect(outcome.rules[1].summary).toBe('Not checked: an earlier rule stopped the check.')
    expect(outcome.sizes).toEqual({ compressedBytes: MAX_COMPRESSED_BYTES + 1 })
  })

  test('is refused at a smaller cap by the same path, for a test that cannot afford 32 MB', async () => {
    const file = fileOf(sampleBundle())
    const outcome = refused(await verifyBundle(file, contextFor(sampleBundle(), { caps: { compressedBytes: file.size - 1, decompressedBytes: MAX_DECOMPRESSED_BYTES } })))
    expect(outcome.rules[0].status).toBe('fail')
    expect(outcome.rules[0].summary).toContain(`The file is ${file.size.toLocaleString('en-US')} bytes`)
  })
})

describe('a zip bomb', () => {
  test('aborts with a message at the cap of rule 1, the real one, and the rules after it do not run', async () => {
    const bomb = new Blob([new Uint8Array(gzipSync(Buffer.alloc(MAX_DECOMPRESSED_BYTES + 16 * 1024 * 1024)))])
    expect(bomb.size).toBeLessThan(400_000)
    const outcome = refused(await verifyBundle(bomb, contextFor()))
    expect(statuses(outcome)).toEqual(['1:caps:fail', '2:schema:skipped', '3:integrity:skipped', '4:binding:skipped', '5:grader:skipped', '6:pins:skipped', ...LATER_SKIPPED])
    expect(outcome.rules[0].summary).toBe('It holds more than the 268,435,456 bytes that the site reads once decompressed (the cap of rule 1), so it stopped there.')
  })

  test('of a few KB aborts at a smaller cap in the same way', async () => {
    const bomb = new Blob([new Uint8Array(gzipSync(Buffer.alloc(8 * 1024 * 1024)))])
    expect(bomb.size).toBeLessThan(10_000)
    const outcome = refused(await verifyBundle(bomb, contextFor(sampleBundle(), { caps: { compressedBytes: 1024 * 1024, decompressedBytes: 1024 * 1024 } })))
    expect(outcome.rules[0].status).toBe('fail')
    expect(outcome.rules[0].summary).toContain('1,048,576 bytes that the site reads once decompressed')
  })
})

describe('a file that is not a bundle', () => {
  test('is refused at rule 2 when it is JSON of another kind, with the place of the first problem', async () => {
    const outcome = refused(await verifyBundle(fileOf({ hello: 'world' }), contextFor()))
    expect(statuses(outcome)).toEqual(['1:caps:pass', '2:schema:fail', '3:integrity:skipped', '4:binding:skipped', '5:grader:skipped', '6:pins:skipped', ...LATER_SKIPPED])
    expect(outcome.rules[1].problems[0]).toMatch(/^\/schema: /)
  })

  test('is refused at rule 2 when the text inside is not UTF-8, or is not JSON', async () => {
    const notUtf8 = refused(await verifyBundle(new Blob([new Uint8Array(gzipSync(Uint8Array.of(0x7b, 0xff, 0x7d)))]), contextFor()))
    expect(statuses(notUtf8).slice(0, 2)).toEqual(['1:caps:pass', '2:schema:fail'])
    expect(notUtf8.rules[1].summary).toBe('The text inside is not UTF-8.')
    const notJson = refused(await verifyBundle(new Blob([new Uint8Array(gzipSync(Buffer.from('this is a log')))]), contextFor()))
    expect(notJson.rules[1].problems[0]).toMatch(/^The text inside is not JSON/)
  })

  test('is refused at rule 1 when it is not gzip, a text file for instance, and says what a bundle is', async () => {
    const outcome = refused(await verifyBundle(new Blob([Buffer.from('{"schema":"enginespace/bundle@1"}')]), contextFor()))
    expect(outcome.rules[0].status).toBe('fail')
    expect(outcome.rules[0].summary).toContain('.es.json.gz')
  })

  test('never throws, whatever the bytes: the answer is always a result with the nine rules of a report in it', async () => {
    const junk = [new Uint8Array(0), new Uint8Array(1), Uint8Array.of(0x1f, 0x8b, 8), new Uint8Array(1000).fill(0x1f), new TextEncoder().encode('{"schema":"enginespace/bundle@1"}')]
    for (const bytes of junk) {
      const outcome = await verifyBundle(new Blob([bytes]), contextFor())
      expect(outcome.kind).toBe('refused')
      expect(outcome.rules).toHaveLength(9)
    }
  })
})

describe('a tampered hash', () => {
  test('fails integrity, names the artifact, and the file is refused: nothing is kept and no token is spent', async () => {
    const bundle = changed((b) => {
      const entry = b.receipt.artifacts.find((artifact) => artifact.id === 'log')
      if (entry !== undefined) entry.sha256 = '0'.repeat(64)
    })
    const outcome = refused(await verifyBundle(fileOf(bundle), contextFor(bundle)))
    expect(statuses(outcome)).toEqual(['1:caps:pass', '2:schema:pass', '3:integrity:fail', '4:binding:skipped', '5:grader:skipped', '6:pins:skipped', ...LATER_SKIPPED])
    expect(outcome.rules[2].summary).toBe('An artifact in the bundle is not the one the receipt lists.')
    expect(outcome.rules[2].problems).toHaveLength(1)
    expect(outcome.rules[2].problems[0]).toContain('Artifact "log": its data in the bundle hashes to')
    expect(outcome.rules[2].problems[0]).toContain(`and the receipt lists ${'0'.repeat(64)}`)
  })

  test('is also an artifact edited after the run: a trace made faster by one number', async () => {
    const bundle = changed((b) => {
      const trace = b.artifacts.trace.data as { spans: { durNs: number[] } }
      trace.spans.durNs[1] = 1
    })
    const outcome = refused(await verifyBundle(fileOf(bundle), contextFor(bundle)))
    expect(outcome.rules[2].status).toBe('fail')
    expect(outcome.rules[2].problems[0]).toContain('Artifact "trace"')
  })

  test('is not found by rule 3 once the receipt is re-signed, and the file is then a receipt like any other: recomputation is what catches it later', async () => {
    const bundle = resigned(
      changed((b) => {
        const trace = b.artifacts.trace.data as { spans: { durNs: number[] } }
        trace.spans.durNs[1] = 1
      }),
    )
    const outcome = checked(await verifyBundle(fileOf(bundle), contextFor(bundle)))
    expect(firstSix(outcome)).toEqual(ALL_PASS)
  })
})

describe('a reused token', () => {
  test('fails binding: the receipt is kept with its reason, is gpu-unverified, and names the receipt that spent the token', async () => {
    const bundle = sampleBundle()
    const other = sha256('an earlier receipt')
    const outcome = checked(await verifyBundle(fileOf(bundle), contextFor(bundle, { book: [bookedFor(bundle.receipt, { usedBy: other })] })))
    expect(firstSix(outcome)).toEqual(['1:caps:pass', '2:schema:pass', '3:integrity:pass', '4:binding:fail', '5:grader:pass', '6:pins:pass'])
    expect(outcome.rules[3].problems[0]).toContain(`spent by receipt ${other.slice(0, 8)} already`)
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
    expect(outcome.verdict.reasons[0]).toBe('The receipt is not bound to an unused, unexpired challenge of this browser.')
  })

  test('fails binding for a token this ledger never issued, a friend\'s receipt', async () => {
    const bundle = sampleBundle()
    const outcome = checked(await verifyBundle(fileOf(bundle), contextFor(bundle, { book: [] })))
    expect(outcome.rules[3].status).toBe('fail')
    expect(outcome.rules[3].summary).toBe("This browser's ledger holds no challenge with this token.")
  })

  test('is bound once more when it is the receipt itself that spent the token: a re-import is a re-verification', async () => {
    const bundle = sampleBundle()
    const outcome = checked(await verifyBundle(fileOf(bundle), contextFor(bundle, { book: [bookedFor(bundle.receipt, { usedBy: receiptSha(bundle.receipt) })] })))
    expect(firstSix(outcome)).toEqual(ALL_PASS)
  })
})

describe('an unknown grader build', () => {
  test('fails rule 5 and gives gpu-unverified, with the reason shown', async () => {
    const bundle = sampleBundle()
    const outcome = checked(await verifyBundle(fileOf(bundle), contextFor(bundle, { graders: [{ version: '0.1.0', sourceSha256: sha256('a build that was published') }] })))
    expect(firstSix(outcome)).toEqual(['1:caps:pass', '2:schema:pass', '3:integrity:pass', '4:binding:pass', '5:grader:fail', '6:pins:pass'])
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
    expect(outcome.verdict.reasons[0]).toBe('enginespace-grader 0.1.0 is not the build this site published under that version.')
  })

  test('is any grader at all when the site has published none, which is the case until W2-T10', async () => {
    const bundle = sampleBundle()
    const outcome = checked(await verifyBundle(fileOf(bundle), contextFor(bundle, { graders: [] })))
    expect(outcome.rules[4].status).toBe('fail')
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
    expect(outcome.verdict.reasons).toContain('enginespace-grader 0.1.0 is not a build this site knows.')
  })

  test('spends the token all the same: the receipt was bound, and the run\'s seeds were seen', async () => {
    const bundle = sampleBundle()
    const outcome = checked(await verifyBundle(fileOf(bundle), contextFor(bundle, { graders: [] })))
    expect(outcome.rules[3].status).toBe('pass')
  })
})

describe('an engine off the pin', () => {
  test('fails rule 6, and is kept and labelled', async () => {
    const bundle = changed((b) => {
      if (b.receipt.environment.engine !== undefined) b.receipt.environment.engine.version = '0.32.0'
    })
    const outcome = checked(await verifyBundle(fileOf(bundle), contextFor(bundle)))
    expect(firstSix(outcome)).toEqual(['1:caps:pass', '2:schema:pass', '3:integrity:pass', '4:binding:pass', '5:grader:pass', '6:pins:fail'])
    expect(outcome.verdict.reasons[0]).toBe("The run is off the course's pins.")
  })
})

describe('the report', () => {
  const rules: readonly RuleResult[] = RULES.map((rule) => ({ rule: rule.rule, id: rule.id, status: 'pass' as const, summary: `${rule.name} held.`, problems: [] }))

  test('is stored as plain JSON, and reads back to what was written', async () => {
    const outcome = checked(await verifyBundle(fileOf(sampleBundle()), contextFor()))
    const stored = storedReport(outcome.rules, outcome.sizes)
    expect(stored).toEqual({ v: 1, ran: 10, sizes: outcome.sizes, rules: outcome.rules })
    expect(readStoredReport(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
    // The checks of rules 7 to 9 are in it, each with its bound: a few KB, where the six rules of W2-T07 were under 4,000 characters.
    expect(JSON.stringify(stored).length).toBeLessThan(12_000)
  })

  test('reads without sizes, for a file that was refused before they were counted', () => {
    expect(readStoredReport({ v: 1, ran: 10, rules })).toEqual({ v: 1, ran: 10, rules })
  })

  test('reads a report that an earlier build wrote under six rules, and says it ran six', () => {
    const six = rules.slice(0, 6)
    expect(readStoredReport({ v: 1, ran: 6, rules: six })).toEqual({ v: 1, ran: 6, rules: six })
  })

  test('keeps the checks of a rule and reads them back strictly: an id of the grammar, a status of two, a bound of a sentence', () => {
    const withChecks = rules.map((rule) => (rule.rule === 8 ? { ...rule, checks: [{ id: 'B6', status: 'fail' as const, bound: 'The p99 is 2 s.' }] } : rule))
    expect(readStoredReport({ v: 1, ran: 10, rules: withChecks })).toEqual({ v: 1, ran: 10, rules: withChecks })
    for (const bad of [
      [{ id: 'B 6', status: 'pass', bound: 'x' }],
      [{ id: 'B6', status: 'attested', bound: 'x' }],
      [{ id: 'B6', status: 'pass', bound: 7 }],
      [{ id: 'B6', status: 'pass', bound: 'x'.repeat(5000) }],
      [{ id: 'B6', status: 'pass' }],
      'none',
      Array.from({ length: 65 }, () => ({ id: 'B6', status: 'pass', bound: 'x' })),
    ]) {
      expect(readStoredReport({ v: 1, ran: 10, rules: rules.map((rule) => (rule.rule === 8 ? { ...rule, checks: bad } : rule)) }), JSON.stringify(bad).slice(0, 60)).toBeNull()
    }
  })

  test('is null for JSON that is not a report: a newer version, a wrong kind, a result with a field of the wrong type, an unknown rule', () => {
    const good = { v: 1, ran: 10, rules }
    expect(readStoredReport(good)).not.toBeNull()
    for (const bad of [
      null,
      42,
      'report',
      [],
      { ...good, v: 2 },
      { ...good, ran: -1 },
      { ...good, ran: 1.5 },
      { ...good, rules: 'none' },
      { ...good, rules: [{ ...rules[0], status: 'maybe' }] },
      { ...good, rules: [{ ...rules[0], id: 'vibes' }] },
      { ...good, rules: [{ ...rules[0], summary: 7 }] },
      { ...good, rules: [{ ...rules[0], summary: 'x'.repeat(5000) }] },
      { ...good, rules: [{ ...rules[0], problems: 'none' }] },
      { ...good, rules: [{ ...rules[0], problems: [1] }] },
      { ...good, rules: Array.from({ length: 51 }, () => rules[0]) },
      { ...good, sizes: { compressedBytes: 'a', decompressedBytes: 1 } },
      { ...good, sizes: 3 },
    ]) {
      expect(readStoredReport(bad), JSON.stringify(bad).slice(0, 80)).toBeNull()
    }
  })

  test('has a verdict that is worked out when it is read: a report written under six rules reads as needing the file brought back', () => {
    const six = rules.slice(0, 6)
    const older = verdictOf(sampleBundle().receipt, six, 6)
    expect(older.provenance).toBe('gpu-unverified')
    expect(older.reasons[0]).toBe("This check was made by an earlier version of the site that ran 6 of the 10 rules. Bring the receipt's file back, and it is checked by all of them.")
    const failing = six.map((rule) => (rule.id === 'grader' ? { ...rule, status: 'fail' as const, summary: 'The grader is not known.' } : rule))
    expect(verdictOf(sampleBundle().receipt, failing, 6).reasons.slice(0, 2)).toEqual(['The grader is not known.', older.reasons[0]])
  })
})

describe('the schema that the pipeline reads with', () => {
  test('is the one of packages/schema, strictly: the sample is a bundle@1 as it stands', () => {
    expect(bundleSchema.safeParse(sampleBundle()).success).toBe(true)
  })
})
