/*
 * What the site declares for TR0's three stages (src/receipts/declared.ts): the model's files are the references manifest's entries for the lab, by name, hash and size, so that the
 * two cannot part; the banks are still empty (the owner records the bank, and no task commits one for them); and the stages that the table declares are stages of a lab the site lists.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { BANKS, STAGE_DECLARATIONS } from '../../src/receipts/declared'
import { labById } from '../../src/receipts/labs'

const root = path.resolve(import.meta.dirname, '../..')
const manifest = JSON.parse(readFileSync(path.join(root, 'labs/references/manifest.json'), 'utf8')) as {
  entries: { name: string; kind: string; labs: string[]; sha256: string; bytes: number }[]
}

describe('the stages of tr0.forward', () => {
  const pinned = manifest.entries.filter((entry) => entry.labs.includes('tr0.forward') && entry.kind === 'model').map(({ name, sha256, bytes }) => ({ name, sha256, bytes }))

  test('declare the files of the pinned model, by hash and size, as the references manifest lists them', () => {
    expect(pinned.length).toBe(3)
    for (const stage of labById('tr0.forward')?.stages ?? []) {
      expect([stage.id, STAGE_DECLARATIONS[stage.id]?.model]).toEqual([stage.id, pinned])
    }
  })

  test('declare no workload and no GPU: the lab runs on the CPU and the grader draws its prompts', () => {
    for (const [id, declared] of Object.entries(STAGE_DECLARATIONS)) {
      expect(Object.keys(declared).sort(), id).toEqual(['model'])
    }
  })

  test('declare only stages of a lab the site lists', () => {
    for (const id of Object.keys(STAGE_DECLARATIONS)) expect([id, labById(id.slice(0, id.lastIndexOf('.')))?.stages.some((stage) => stage.id === id)]).toEqual([id, true])
  })

  test('leave the banks empty: the owner records the argmax bank, and until then argmax-bank fails with its reason', () => {
    expect(BANKS).toEqual({})
  })
})
