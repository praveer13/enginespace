/*
 * W2-T16: TR0's forward pass, as a receipt the browser checks (the honest synthetic fixture of tests/verify/synthetic.ts, `forwardFixture`).
 *
 *   - The honest receipt verifies in the worker (every rule of the browser holds) except for `argmax-bank`, which fails because the site holds no bank: BANKS is empty until the
 *     owner records it (W2-T17). Its verdict is `gpu-unverified`, and the reason is the missing bank, so no learner is told that the receipt is wrong.
 *   - Each forgery of FORWARD_BESTIARY fails the check it is named for with the bound it broke printed, and the receipt earns nothing.
 *   - What the grader attests is not re-checked here, and the verdict says so; a receipt that lacks a check its stage requires, or that records one as failed, is not credited.
 * No bank is written here, and nothing is committed under tests/fixtures/receipts/: the fixture is made in memory from the grader's recording.
 */
import { describe, expect, test } from 'bun:test'
import { verifyBundle } from '@es/verify'
import type { CheckedOutcome, Outcome } from '@es/verify'
import { BANKS } from '../../src/receipts/declared'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { FORWARD_BESTIARY, forgeriesFor } from './bestiary'
import { edited, forwardFixture } from './synthetic'
import type { Fixture } from './synthetic'
import { fileOf } from './support'

const checked = (outcome: Outcome): CheckedOutcome => {
  if (outcome.kind !== 'checked') throw new Error(`the file was refused: ${JSON.stringify(outcome.rules.filter((rule) => rule.status !== 'pass').map((rule) => rule.summary))}`)
  return outcome
}
const run = async (fixture: Fixture): Promise<CheckedOutcome> => checked(await verifyBundle(fileOf(fixture.bundle), fixture.context))
const checkOf = (outcome: CheckedOutcome, rule: number, id: string) => outcome.rules.find((entry) => entry.rule === rule)?.checks?.find((entry) => entry.id === id)

describe('the honest forward-pass receipt', () => {
  test('is labelled synthetic, has no GPU and no engine, and says what made it', () => {
    const { receipt } = forwardFixture().bundle
    expect(receipt.stage).toBe('tr0.forward.s2')
    expect(receipt.environment.gpus).toEqual([])
    expect(receipt.environment.engine).toBeUndefined()
    expect(receipt.ext).toEqual({ synthetic: true })
    expect(receipt.notes).toMatch(/synthetic receipt/)
  })

  test('verifies every rule but one: argmax-bank fails because the site holds no bank, and its verdict says so', async () => {
    const outcome = await run(forwardFixture())
    expect(outcome.rules.map((rule) => `${rule.rule}:${rule.id}:${rule.status}`)).toEqual([
      '1:caps:pass',
      '2:schema:pass',
      '3:integrity:pass',
      '4:binding:pass',
      '5:grader:pass',
      '6:pins:pass',
      '7:rechecks:fail',
      '8:recomputation:pass',
      '9:floors:pass',
    ])
    expect(outcome.rules[6].checks?.map((check) => [check.id, check.status])).toEqual([['argmax-bank', 'fail']])
    expect(checkOf(outcome, 7, 'argmax-bank')?.bound).toBe('This site holds no argmax bank for tr0.forward.s2 yet, so the ids cannot be compared.')
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
    expect(outcome.verdict.reasons).toEqual(['argmax-bank: This site holds no argmax bank for tr0.forward.s2 yet, so the ids cannot be compared.'])
    expect(outcome.verdict.checks.filter((check) => check.verdict === 'fail').map((check) => check.id)).toEqual(['argmax-bank'])
    expect(outcome.verdict.checks.filter((check) => check.how === 'attested').map((check) => [check.id, check.verdict])).toEqual([
      ['logits-fp32', 'attested'],
      ['import-guard', 'attested'],
    ])
  })

  test('keeps its ids in the stored report, so a bank that the site gains later can be held against them', async () => {
    const outcome = await run(forwardFixture())
    expect(outcome.argmax?.positions.length).toBe(192)
    expect(outcome.argmax?.ids.length).toBe(192)
  })
})

describe('the forward-pass bestiary', () => {
  test('is the three forgeries that read no evidence, and the two that read the ids', () => {
    expect(forgeriesFor(forwardFixture()).map((forgery) => forgery.id)).toEqual(['reused-token', 'replayed-receipt', 'unknown-grader', 'relabelled-ids', 'truncated-ids'])
    expect(FORWARD_BESTIARY).toHaveLength(5)
  })

  for (const forgery of FORWARD_BESTIARY) {
    test(`${forgery.title} fails ${forgery.fails.check} (rule ${forgery.fails.rule}), with the bound it broke printed, and the receipt is not credited`, async () => {
      const outcome = await run(forgery.forge(forwardFixture()))
      const rule = outcome.rules.find((entry) => entry.rule === forgery.fails.rule)
      expect(rule?.status).toBe('fail')
      const bound = forgery.fails.rule <= 6 ? [rule?.summary, ...(rule?.problems ?? [])].join(' ') : (checkOf(outcome, forgery.fails.rule, forgery.fails.check)?.bound ?? '')
      expect(bound).toMatch(forgery.bound)
      expect(outcome.verdict.provenance).toBe('gpu-unverified')
    })
  }

  test('a receipt that lacks the import guard, or records the logits as failed, is not credited, and the reason says which', async () => {
    const lacking = await run(edited(forwardFixture(), (bundle) => (bundle.receipt.checks = bundle.receipt.checks.filter((check) => check.id !== 'import-guard'))))
    expect(lacking.verdict.provenance).toBe('gpu-unverified')
    expect(lacking.verdict.reasons).toContain('The receipt lists no check called import-guard, which tr0.forward.s2 requires of the grader.')
    const failed = await run(
      edited(forwardFixture(), (bundle) => {
        for (const check of bundle.receipt.checks) if (check.id === 'logits-fp32') check.pass = false
      }),
    )
    expect(failed.verdict.provenance).toBe('gpu-unverified')
    expect(failed.verdict.reasons.join('\n')).toMatch(/The grader's check logits-fp32 failed/)
  })
})

describe('what stays for the owner', () => {
  test('BANKS is still empty, and no bundle is written under tests/fixtures/receipts/', () => {
    expect(BANKS).toEqual({})
    const folder = path.resolve(import.meta.dirname, '../fixtures/receipts')
    const bundles = existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith('.es.json.gz')) : []
    expect(bundles).toEqual([])
  })
})
