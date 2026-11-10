/*
 * W2-T08: the atlas that rule 9 reads (src/receipts/atlas.ts) is the hardware claims of W2-T09, number for number. The table is their compact form,
 * because a worker has room for 14 rows and `public/claims.json` is half a megabyte; this test compiles the claims and holds each row to them:
 *
 *   - a GPU's name is the `product-name` claim, exactly, since the floors find a GPU by comparing the name NVML reports with it;
 *   - its bandwidth is the `mem-bw` claim, in GB/s;
 *   - its peak is the largest of the `fp32`, `<precision>-dense` and `<precision>-listed` claims, with a `-listed` figure in PFLOPS taken in TFLOPS. A
 *     sparse figure is not a peak: its dense claim is its half, and the table takes the dense one;
 *   - the table has a row for every GPU of the atlas, and no row for one that is not in it.
 * A claim that moves (a re-read of a datasheet) fails here until the table follows it.
 */
import { describe, expect, test } from 'bun:test'
import type { Claim } from '@es/schema'
import { compileContent } from '../../scripts/content/build.ts'
import { ATLAS } from '@/receipts/atlas'
import { repo } from '../content/support.ts'

const DIR = 'content/claims/hardware/'
const result = compileContent({ root: repo })
const claims: Claim[] = result.claims.filter((record) => record.file.startsWith(DIR)).map((record) => record.claim)
const byDevice = new Map<string, Claim[]>()
for (const claim of claims) {
  const device = /^hw\.([a-z0-9-]+)\./.exec(claim.id)?.[1]
  if (device !== undefined) byDevice.set(device, [...(byDevice.get(device) ?? []), claim])
}
const attribute = (claim: Claim): string => claim.id.split('.').slice(2).join('.')

/** What the table must say of a device, made from its claims by the rule above. */
function expected(device: string): { name: string; bandwidthGBps: number; peakTflops: number } {
  const list = byDevice.get(device) ?? []
  const named = (a: string): Claim | undefined => list.find((claim) => attribute(claim) === a)
  const name = named('product-name')?.value
  const bandwidth = named('mem-bw')?.value
  if (typeof name !== 'string' || typeof bandwidth !== 'number') throw new Error(`${device} lacks its name or its bandwidth`)
  let peak = 0
  for (const claim of list) {
    const a = attribute(claim)
    if (!(a === 'fp32' || /-dense$/.test(a) || /-listed$/.test(a))) continue
    if (typeof claim.value !== 'number') continue
    peak = Math.max(peak, claim.unit === 'PFLOPS' ? claim.value * 1000 : claim.value)
  }
  return { name, bandwidthGBps: bandwidth, peakTflops: peak }
}

describe('the atlas of the floors', () => {
  test('has a row for each of the 14 GPUs of the hardware claims, and none for another', () => {
    expect(byDevice.size).toBe(14)
    expect(ATLAS).toHaveLength(14)
    expect(ATLAS.map((row) => row.name).sort()).toEqual([...byDevice.keys()].map((device) => expected(device).name).sort())
  })

  test('is each row\'s claims: the name, the bandwidth and the peak', () => {
    for (const device of byDevice.keys()) {
      const want = expected(device)
      const row = ATLAS.find((entry) => entry.name === want.name)
      expect([device, row]).toEqual([device, want])
    }
  })

  test('holds a bandwidth and a peak that are positive, and no two rows with one name', () => {
    expect(new Set(ATLAS.map((row) => row.name)).size).toBe(ATLAS.length)
    for (const row of ATLAS) {
      expect([row.name, row.bandwidthGBps > 0, row.peakTflops > 0]).toEqual([row.name, true, true])
    }
  })

  test('names the claims it was made from in the comment on each row, so that a reader can find them', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../../src/receipts/atlas.ts', import.meta.url), 'utf8')
    for (const device of byDevice.keys()) expect([device, source.includes(`// ${device}: mem-bw`)]).toEqual([device, true])
  })
})
