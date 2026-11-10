/*
 * W2-T06: the receipts that the ledger holds, read for the page (src/receipts/records.ts). The store keeps a parsed receipt as bounded
 * JSON and an import file may have edited it, so a record is read through the receipt's own schema and listed either way: a receipt, or
 * a record that says why it is not one.
 */
import { describe, expect, test } from 'bun:test'
import type { ReceiptRecord } from '@es/ledger'
import { detailAddress, gpuLine, hashOfFragment, heldReceipts, latestReport, readReceipt, shortHash, summarizeChecks } from '@/receipts/records'
import { asJson, sampleReceipt, sampleRecord, sha256 } from './support'

const HASH = sha256('a receipt')

describe('a record', () => {
  test('is a receipt when the schema takes it, with its reports', () => {
    const record = { ...sampleRecord(), reports: [{ at: '2026-11-09T10:00:00.000Z', report: { ok: true } }] }
    const read = readReceipt(record)
    expect(read.ok).toBe(true)
    if (read.ok) {
      expect(read.receipt.stage).toBe('tr3.profile.s2')
      expect(read.sha256).toBe(record.sha256)
      expect(read.reports).toHaveLength(1)
    }
  })

  test('is not a receipt when the schema refuses it, and says where, in the schema\'s own words', () => {
    const extra = readReceipt({ sha256: HASH, receipt: asJson({ ...sampleReceipt(), hostname: 'example-host' }), reports: [] })
    expect(extra.ok).toBe(false)
    if (!extra.ok) expect(extra.problem).toContain('hostname')
    const wrong = readReceipt({ sha256: HASH, receipt: asJson({ ...sampleReceipt(), stage: 'tr3.profile.s3' }), reports: [] })
    if (wrong.ok) throw new Error('a receipt whose stage differs from its token should be refused')
    expect(wrong.problem).toContain('challenge.token')
  })

  test('is not a receipt when it is not even an object, and the reader never throws', () => {
    for (const receipt of [null, 0, 'text', [], true, { schema: 1 }]) {
      const read = readReceipt({ sha256: HASH, receipt: receipt as ReceiptRecord['receipt'], reports: [] })
      expect(read.ok, JSON.stringify(receipt)).toBe(false)
    }
  })

  test('is told at most three reasons, and how many more there are', () => {
    const read = readReceipt({ sha256: HASH, receipt: { schema: 'x', lab: 1, stage: 2, challenge: 3, createdAt: 4 }, reports: [] })
    if (read.ok) throw new Error('expected a refusal')
    expect(read.problem.split('; ')).toHaveLength(3)
    expect(read.problem).toMatch(/\(and \d+ more\)$/)
  })
})

describe('the list of receipts', () => {
  const older = sampleRecord((receipt) => {
    receipt.createdAt = '2026-11-01T09:00:00Z'
  })
  const newer = sampleRecord((receipt) => {
    receipt.createdAt = '2026-11-08T09:00:00Z'
  })
  const odd = (digit: string): ReceiptRecord => ({ sha256: digit.repeat(64), receipt: { schema: 'something else' }, reports: [] })

  test('is newest first, with the records that are not receipts after them in the order of their hashes', () => {
    const list = heldReceipts([odd('b'), older, odd('a'), newer])
    expect(list.map((entry) => [entry.ok, entry.sha256])).toEqual([
      [true, newer.sha256],
      [true, older.sha256],
      [false, 'a'.repeat(64)],
      [false, 'b'.repeat(64)],
    ])
  })

  test('is the same whatever order the ledger gave', () => {
    const records = [older, newer, odd('c'), odd('a')]
    expect(heldReceipts([...records].reverse())).toEqual(heldReceipts(records))
  })

  test('orders two receipts of one moment by their hashes', () => {
    const one = sampleRecord((receipt) => (receipt.notes = 'one'))
    const two = sampleRecord((receipt) => (receipt.notes = 'two'))
    const list = heldReceipts([one, two]).map((entry) => entry.sha256)
    expect(list).toEqual([one.sha256, two.sha256].sort())
  })
})

describe('the address of a receipt', () => {
  test('is /receipts#<sha256>, and only a full SHA-256 in lower-case hex is taken from a fragment', () => {
    expect(detailAddress(HASH)).toEqual({ pathname: '/receipts', hash: HASH })
    expect(hashOfFragment(`#${HASH}`)).toBe(HASH)
    for (const fragment of ['', '#', HASH, `#${HASH.toUpperCase()}`, `#${HASH.slice(1)}`, `#${HASH}0`, '#abc', `#${'g'.repeat(64)}`, `# ${HASH}`, `#${HASH}\n`]) {
      expect(hashOfFragment(fragment), JSON.stringify(fragment)).toBeNull()
    }
  })

  test('is printed by its first eight digits', () => {
    expect(shortHash(HASH)).toBe(HASH.slice(0, 8))
    expect(shortHash(HASH)).toHaveLength(8)
  })
})

describe('what a receipt says of itself', () => {
  test('counts the checks that the grader reports as passed and failed', () => {
    const receipt = sampleReceipt()
    expect(summarizeChecks(receipt)).toEqual({ total: 3, passed: 3, failed: 0 })
    receipt.checks[1].pass = false
    expect(summarizeChecks(receipt)).toEqual({ total: 3, passed: 2, failed: 1 })
    receipt.checks = []
    expect(summarizeChecks(receipt)).toEqual({ total: 0, passed: 0, failed: 0 })
  })

  test('names the GPUs as the driver lists them, grouped, and says no GPU for a run on the CPU', () => {
    const receipt = sampleReceipt()
    expect(gpuLine(receipt)).toBe('Example GPU 24GB')
    receipt.environment.gpus = [receipt.environment.gpus[0], receipt.environment.gpus[0], { ...receipt.environment.gpus[0], name: 'Example GPU 80GB' }]
    expect(gpuLine(receipt)).toBe('2 × Example GPU 24GB, Example GPU 80GB')
    receipt.environment.gpus = []
    expect(gpuLine(receipt)).toBe('no GPU')
  })

  test('finds the newest report of a record, or none', () => {
    expect(latestReport([])).toBeUndefined()
    const reports = [
      { at: '2026-11-09T09:00:00.000Z', report: 1 },
      { at: '2026-11-09T11:00:00.000Z', report: 2 },
      { at: '2026-11-09T10:00:00.000Z', report: 3 },
    ]
    expect(latestReport(reports)?.report).toBe(2)
  })
})
