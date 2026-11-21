/*
 * W2b-T31: TR0's forward-pass receipt against a bank, once the site holds one. The bank here is synthetic and lives only in this file: it is made from the honest synthetic
 * receipt's own ids at every third position, so it says nothing about Qwen3-0.6B, and it is never written anywhere. The owner's bank (W2-T17, docs/owner/W2-T17-bank.md) is
 * made by the grader's generator over the pinned model, and BANKS in src/receipts/declared.ts stays empty until then.
 */
import { describe, expect, test } from 'bun:test'
import { verifyBundle } from '@es/verify'
import type { ArgmaxBank, CheckedOutcome } from '@es/verify'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { BANKS } from '../../src/receipts/declared'
import { edited, forwardFixture } from './synthetic'
import type { Fixture } from './synthetic'
import { fileOf } from './support'

const STAGE = 'tr0.forward.s2'

function idsOf(fixture: Fixture): { id: string; positions: number[]; ids: number[] } {
  const entry = fixture.bundle.receipt.artifacts.find((artifact) => artifact.kind === 'outputs')
  if (entry === undefined) throw new Error('the forward-pass fixture carries no argmax ids')
  const artifact = fixture.bundle.artifacts[entry.id]
  if (artifact.encoding !== 'json') throw new Error('argmax ids are JSON')
  const data = artifact.data as { positions: number[]; ids: number[] }
  return { id: entry.id, positions: data.positions, ids: data.ids }
}

/** A bank of the honest receipt's own ids at every third position. */
function syntheticBank(fixture: Fixture): ArgmaxBank {
  const { positions, ids } = idsOf(fixture)
  const keep = positions.map((_, i) => i).filter((i) => i % 3 === 0)
  return { positions: keep.map((i) => positions[i]), ids: keep.map((i) => ids[i]) }
}

const withBank = (fixture: Fixture, bank: ArgmaxBank): Fixture => ({ ...fixture, context: { ...fixture.context, banks: { [STAGE]: bank } } })

const run = async (fixture: Fixture): Promise<CheckedOutcome> => {
  const outcome = await verifyBundle(fileOf(fixture.bundle), fixture.context)
  if (outcome.kind !== 'checked') throw new Error('the file was refused')
  return outcome
}
const bankCheck = (outcome: CheckedOutcome) => outcome.rules.find((rule) => rule.rule === 7)?.checks?.find((check) => check.id === 'argmax-bank')

describe('the forward-pass receipt against a synthetic bank', () => {
  test('the honest receipt passes argmax-bank, and nothing else is left to fail it', async () => {
    const honest = forwardFixture()
    const bank = syntheticBank(honest)
    expect(bank.positions.length).toBe(64)
    const outcome = await run(withBank(honest, bank))
    expect(bankCheck(outcome)).toEqual({ id: 'argmax-bank', status: 'pass', bound: "All 64 banked positions have the pinned bank's argmax token." })
    expect(outcome.rules.map((rule) => `${rule.rule}:${rule.status}`)).toEqual(['1:pass', '2:pass', '3:pass', '4:pass', '5:pass', '6:pass', '7:pass', '8:pass', '9:pass'])
    expect(outcome.verdict.checks.filter((check) => check.verdict === 'fail')).toEqual([])
  })

  test('a receipt with one wrong id at a banked position fails argmax-bank and names the position', async () => {
    const honest = forwardFixture()
    const bank = syntheticBank(honest)
    const target = bank.positions[5]
    const forged = edited(honest, (bundle) => {
      const { id, positions, ids } = idsOf(honest)
      const artifact = bundle.artifacts[id]
      if (artifact.encoding !== 'json') throw new Error('argmax ids are JSON')
      const data = artifact.data as { ids: number[] }
      const at = positions.indexOf(target)
      data.ids[at] = ids[at] + 1
    })
    const outcome = await run(withBank(forged, bank))
    const found = bankCheck(outcome)
    expect(found?.status).toBe('fail')
    expect(found?.bound).toBe(`Position ${target}: the receipt's argmax is token ${idsOf(honest).ids[idsOf(honest).positions.indexOf(target)] + 1}, and the pinned bank has ${bank.ids[5]} (every banked position must agree).`)
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
  })

  test('a wrong id at a position the bank leaves out is not held', async () => {
    const honest = forwardFixture()
    const bank = syntheticBank(honest)
    const unbanked = idsOf(honest).positions.find((position) => !bank.positions.includes(position))
    const loose = edited(honest, (bundle) => {
      const { id, positions } = idsOf(honest)
      const artifact = bundle.artifacts[id]
      if (artifact.encoding !== 'json') throw new Error('argmax ids are JSON')
      ;(artifact.data as { ids: number[] }).ids[positions.indexOf(unbanked as number)] += 1
    })
    expect(bankCheck(await run(withBank(loose, bank)))?.status).toBe('pass')
  })
})

describe('what stays for the owner', () => {
  test('BANKS is still empty, and nothing is written under public/references/', () => {
    expect(BANKS).toEqual({})
    expect(existsSync(path.resolve(import.meta.dirname, '../../public/references'))).toBe(false)
  })
})
