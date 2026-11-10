/*
 * W2-T09: the hardware atlas (docs/TRACKER.md, W2-T09; ARCHITECTURE §8.5 rule 9; ASSESSMENT §6.4). `content/claims/hardware/*.yaml` holds, for
 * each GPU that a learner owns or rents, what NVIDIA states of its memory and of its peak rates, and the name by which a fingerprint finds it.
 * The task's checks, and what this file holds the atlas to:
 *
 *   1. verify:claims passes: the atlas compiles with no diagnostic (tests/content/claims.test.ts runs the gate on the whole repo), and every
 *      derived claim of it recomputes.
 *   2. Every value quotes NVIDIA's own document with the day it was read: each claim names a source on a host of NVIDIA's, a quote that holds the
 *      number it states, and a day; and every document it cites is listed in the header of its file with the SHA-256 of the copy that was read.
 *   3. Derived values recompute: a dense peak that is derived is half of the sparse figure its input holds, and a bandwidth in GB/s that is derived
 *      is the TB/s figure times a thousand.
 *
 * Beyond those, the atlas is what the physics floors key into, so its shape is held too: the roster of the task, the grammar of an id, the unit of
 * each attribute, a name for every GPU that is found exactly, and the relations between the rates of one GPU that the architectures keep (a
 * mistyped figure breaks one of them). The sources are on the network, and nothing here fetches them: the pieces of each quote were found in
 * the text of the downloaded document when the claims were written, and the files' headers say how.
 */
import { describe, expect, test } from 'bun:test'
import type { Claim } from '@es/schema'
import { compileContent } from '../../scripts/content/build.ts'
import { read as readDoc } from '../ci/support.ts'
import { repo } from './support.ts'

const DIR = 'content/claims/hardware'
const FILES = ['ada', 'ampere', 'blackwell', 'hopper'].map((name) => `${DIR}/${name}.yaml`)

/** The GPUs of the task, with the name that NVIDIA's driver lists each under and the file that holds it. */
const DEVICES: Record<string, { name: string; file: string }> = {
  'h100-sxm': { name: 'NVIDIA H100 80GB HBM3', file: 'hopper' },
  'h100-pcie': { name: 'NVIDIA H100 PCIe', file: 'hopper' },
  'h200-sxm': { name: 'NVIDIA H200', file: 'hopper' },
  'a100-40-sxm': { name: 'NVIDIA A100-SXM4-40GB', file: 'ampere' },
  'a100-40-pcie': { name: 'NVIDIA A100-PCIE-40GB', file: 'ampere' },
  'a100-80-sxm': { name: 'NVIDIA A100-SXM4-80GB', file: 'ampere' },
  'a100-80-pcie': { name: 'NVIDIA A100 80GB PCIe', file: 'ampere' },
  rtx4090: { name: 'NVIDIA GeForce RTX 4090', file: 'ada' },
  l4: { name: 'NVIDIA L4', file: 'ada' },
  l40s: { name: 'NVIDIA L40S', file: 'ada' },
  rtx5090: { name: 'NVIDIA GeForce RTX 5090', file: 'blackwell' },
  'rtx-pro-6000-server': { name: 'NVIDIA RTX PRO 6000 Blackwell Server Edition', file: 'blackwell' },
  'rtx-pro-6000-workstation': { name: 'NVIDIA RTX PRO 6000 Blackwell Workstation Edition', file: 'blackwell' },
  'rtx-pro-6000-max-q': { name: 'NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition', file: 'blackwell' },
}

const PRECISIONS = ['tf32', 'bf16', 'fp16', 'fp16-fp32acc', 'fp8', 'fp8-fp32acc', 'int8', 'fp4']
const ATTRIBUTE = new RegExp(`^(?:product-name|mem-capacity|mem-bw|mem-bw-tbps|fp32|(?:${PRECISIONS.join('|')})-(?:dense|sparse|listed))$`)
/** The hosts of NVIDIA's own documents: its site, its image and download servers, and the asset server that its resource pages link PDFs on. */
const NVIDIA_HOSTS = new Set(['www.nvidia.com', 'images.nvidia.com', 'download.nvidia.com', 'dam-cdn.nvd.orangelogic.com'])

const result = compileContent({ root: repo })
const atlas = result.claims.filter((record) => record.file.startsWith(`${DIR}/`))
const byId = new Map<string, Claim>(atlas.map((record) => [record.claim.id, record.claim]))
const parts = (claim: Claim) => {
  const [, device, attribute] = /^hw\.([a-z0-9-]+)\.([a-z0-9-]+)$/.exec(claim.id) ?? []
  return { device, attribute }
}
const value = (device: string, attribute: string): number => {
  const found = byId.get(`hw.${device}.${attribute}`)?.value
  if (typeof found !== 'number') throw new Error(`hw.${device}.${attribute} is not a number claim`)
  return found
}
const has = (device: string, attribute: string): boolean => byId.has(`hw.${device}.${attribute}`)

describe('the files', () => {
  test('are the four architectures, and every claim of the folder is in one of them', () => {
    expect([...new Set(atlas.map((record) => record.file))].sort()).toEqual(FILES)
    for (const record of atlas) expect([record.claim.id, record.file]).toEqual([record.claim.id, `${DIR}/${DEVICES[parts(record.claim).device]?.file}.yaml`])
  })

  test('hold the 14 GPUs of the task: the 4090, 5090, L4, L40S, A100 in 40 and 80 GB, H100 in PCIe and SXM, H200 and the RTX PRO 6000', () => {
    expect([...new Set(atlas.map((record) => parts(record.claim).device))].sort()).toEqual(Object.keys(DEVICES).sort())
  })

  test('list, in their headers, every document that a claim cites, with the size and the SHA-256 of the copy that was read', () => {
    for (const file of FILES) {
      const header = readDoc(file).split('\n').filter((line) => line.startsWith('#'))
      const listed = new Map<string, string>()
      header.forEach((line, i) => {
        const url = /^#\s{5}(https:\/\/\S+)$/.exec(line)?.[1]
        if (url === undefined) return
        const hash = /^#\s{5}\d+ bytes, SHA-256 ([0-9a-f]{64})$/.exec(header[i + 1] ?? '')?.[1]
        expect([file, url, hash === undefined]).toEqual([file, url, false])
        listed.set(url, hash ?? '')
      })
      const cited = new Set(atlas.filter((record) => record.file === file).map((record) => record.claim.source?.url ?? ''))
      expect([file, [...listed.keys()].sort()]).toEqual([file, [...cited].sort()])
    }
  })
})

describe('every claim', () => {
  test('is an id of the atlas: hw, a device of the roster, and an attribute of the grammar', () => {
    for (const { claim } of atlas) {
      const { device, attribute } = parts(claim)
      expect([claim.id, device in DEVICES]).toEqual([claim.id, true])
      expect([claim.id, ATTRIBUTE.test(attribute ?? '')]).toEqual([claim.id, true])
      expect(claim.pin).toBeUndefined()
      expect(claim.synthetic).toBeUndefined()
    }
  })

  test('is read from a source or derived from one, with a TTL of a year, and none is an estimate', () => {
    for (const { claim } of atlas) {
      expect([claim.id, ['measured', 'derived'].includes(claim.tag)]).toEqual([claim.id, true])
      expect([claim.id, claim.ttlDays]).toEqual([claim.id, 365])
      expect([claim.id, claim.source !== undefined]).toEqual([claim.id, true])
      expect([claim.id, claim.derived !== undefined]).toEqual([claim.id, claim.tag === 'derived'])
      expect([claim.id, (claim.source?.accessed ?? '9999') <= claim.verifiedAt]).toEqual([claim.id, true])
    }
  })

  test('quotes a document on a host of NVIDIA, a quote of some length, and the number it states', () => {
    for (const { claim } of atlas) {
      const source = claim.source
      expect(source).toBeDefined()
      expect([claim.id, NVIDIA_HOSTS.has(new URL(source?.url ?? 'https://example.invalid').host)]).toEqual([claim.id, true])
      const quote = source?.quote ?? ''
      expect([claim.id, quote.trim().length >= 8]).toEqual([claim.id, true])
      if (typeof claim.value === 'string') {
        // A name: the quote opens with it.
        expect([claim.id, quote.startsWith(`${claim.value} |`)]).toEqual([claim.id, true])
      } else if (claim.tag === 'measured') {
        // The figures that the quote prints, with the thousands separators taken out: a mistyped value is not among them.
        const printed = [...quote.matchAll(/(?<![A-Za-z0-9.])\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replaceAll(',', '')))
        expect([claim.id, printed.includes(claim.value)]).toEqual([claim.id, true])
      }
    }
  })

  test('has the unit of its attribute, and a name has none', () => {
    for (const { claim } of atlas) {
      const { attribute } = parts(claim)
      const expected = attribute === 'product-name' ? undefined
        : attribute === 'mem-capacity' ? 'GB'
        : attribute === 'mem-bw' ? 'GB/s'
        : attribute === 'mem-bw-tbps' ? 'TB/s'
        : attribute.endsWith('-listed') ? (claim.unit === 'PFLOPS' ? 'PFLOPS' : 'TFLOPS')
        : attribute.startsWith('int8-') ? 'TOPS'
        : 'TFLOPS'
      expect([claim.id, claim.unit]).toEqual([claim.id, expected])
    }
  })
})

describe('derived values', () => {
  test('are halves of the sparse figure for a dense peak, and a thousand times the TB/s figure for a bandwidth in GB/s', () => {
    const derived = atlas.map((record) => record.claim).filter((claim) => claim.tag === 'derived')
    expect(derived.length).toBeGreaterThan(0)
    for (const claim of derived) {
      const { device, attribute } = parts(claim)
      if (attribute === 'mem-bw') {
        expect([claim.id, claim.derived?.formula, claim.derived?.inputs]).toEqual([claim.id, `hw.${device}.mem-bw-tbps * 1000`, [`hw.${device}.mem-bw-tbps`]])
        expect(claim.value).toBe(Math.round(value(device, 'mem-bw-tbps') * 1000))
      } else {
        const precision = attribute.replace(/-dense$/, '')
        expect([claim.id, attribute.endsWith('-dense')]).toEqual([claim.id, true])
        expect([claim.id, claim.derived?.formula, claim.derived?.inputs]).toEqual([claim.id, `hw.${device}.${precision}-sparse / 2`, [`hw.${device}.${precision}-sparse`]])
        expect(claim.value).toBe(value(device, `${precision}-sparse`) / 2)
      }
    }
  })

  test('are the dense peaks of exactly the GPUs whose datasheets print them with sparsity: the H100 SXM, the H200 SXM and the L4', () => {
    const halved = new Set(atlas.filter((record) => record.claim.tag === 'derived' && record.claim.id.endsWith('-dense')).map((record) => parts(record.claim).device))
    expect([...halved].sort()).toEqual(['h100-sxm', 'h200-sxm', 'l4'])
    for (const device of halved) for (const precision of ['tf32', 'bf16', 'fp16', 'fp8', 'int8']) expect([device, precision, has(device, `${precision}-sparse`) && has(device, `${precision}-dense`)]).toEqual([device, precision, true])
  })
})

describe('each GPU', () => {
  test('has a name, a capacity, a bandwidth in GB/s and the FP32 peak, and a BF16 and FP16 peak or, where the vendor gives no basis, a listed one', () => {
    for (const device of Object.keys(DEVICES)) {
      for (const attribute of ['product-name', 'mem-capacity', 'mem-bw', 'fp32']) expect([device, attribute, has(device, attribute)]).toEqual([device, attribute, true])
      const dense = has(device, 'bf16-dense') && has(device, 'fp16-dense')
      const listed = has(device, 'bf16-listed') && has(device, 'fp16-listed')
      expect([device, dense !== listed]).toEqual([device, true])
      expect([device, listed]).toEqual([device, device === 'rtx-pro-6000-server'])
    }
  })

  test('is found by its name, exactly: the names are the driver\'s, they differ, and a sibling that the atlas does not hold is not found', () => {
    const found = new Map(atlas.filter((record) => parts(record.claim).attribute === 'product-name').map((record) => [record.claim.value as string, parts(record.claim).device]))
    expect(found.size).toBe(Object.keys(DEVICES).length)
    for (const [device, { name }] of Object.entries(DEVICES)) expect([name, found.get(name)]).toEqual([name, device])
    for (const absent of ['NVIDIA H100', 'NVIDIA H100 NVL', 'NVIDIA H200 NVL', 'NVIDIA GeForce RTX 4090 D', 'NVIDIA GeForce RTX 5090 D', 'NVIDIA B200', 'NVIDIA A100']) {
      expect([absent, found.has(absent)]).toEqual([absent, false])
    }
  })

  test('keeps the relations between its rates that the architectures keep, so that a mistyped figure shows', () => {
    const near = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) < 0.02
    for (const device of Object.keys(DEVICES)) {
      if (!has(device, 'bf16-dense')) continue
      const bf16 = value(device, 'bf16-dense')
      // TF32 runs at half the rate of BF16.
      expect([device, 'tf32', near(value(device, 'tf32-dense'), bf16 / 2)]).toEqual([device, 'tf32', true])
      // BF16 and FP16 share a rate, except on a GeForce card, where FP16 accumulates in FP16 at twice the rate of the FP32 accumulation that BF16 needs.
      const fp16Alike = has(device, 'fp16-fp32acc-dense') ? value(device, 'fp16-fp32acc-dense') : value(device, 'fp16-dense')
      expect([device, 'fp16', near(fp16Alike, bf16)]).toEqual([device, 'fp16', true])
      if (has(device, 'fp16-fp32acc-dense')) expect([device, 'fp16 accumulation', near(value(device, 'fp16-dense'), 2 * bf16)]).toEqual([device, 'fp16 accumulation', true])
      // FP8 runs at twice the rate of FP16 with the same accumulation, FP4 at twice that of FP8, and INT8 at the rate of FP8, or at twice that of FP16 where there is no FP8.
      if (has(device, 'fp8-dense')) {
        expect([device, 'fp8', near(value(device, 'fp8-dense'), 2 * value(device, 'fp16-dense'))]).toEqual([device, 'fp8', true])
        expect([device, 'int8', near(value(device, 'int8-dense'), value(device, 'fp8-dense'))]).toEqual([device, 'int8', true])
      } else {
        expect([device, 'int8 without fp8', near(value(device, 'int8-dense'), 2 * value(device, 'fp16-dense'))]).toEqual([device, 'int8 without fp8', true])
      }
      if (has(device, 'fp8-fp32acc-dense')) expect([device, 'fp8 fp32', near(value(device, 'fp8-fp32acc-dense'), 2 * value(device, 'fp16-fp32acc-dense'))]).toEqual([device, 'fp8 fp32', true])
      if (has(device, 'fp4-dense')) expect([device, 'fp4', near(value(device, 'fp4-dense'), 2 * value(device, 'fp8-dense'))]).toEqual([device, 'fp4', true])
      // The CUDA cores come below the Tensor Cores.
      expect([device, 'fp32', value(device, 'fp32') < bf16]).toEqual([device, 'fp32', true])
    }
  })

  test('has the memory of its name, and a bandwidth that fits it: HBM cards above 1.5 TB/s, GDDR cards below 2 TB/s', () => {
    const capacity: Record<string, number> = {
      'h100-sxm': 80, 'h100-pcie': 80, 'h200-sxm': 141, 'a100-40-sxm': 40, 'a100-40-pcie': 40, 'a100-80-sxm': 80, 'a100-80-pcie': 80,
      rtx4090: 24, l4: 24, l40s: 48, rtx5090: 32, 'rtx-pro-6000-server': 96, 'rtx-pro-6000-workstation': 96, 'rtx-pro-6000-max-q': 96,
    }
    const hbm = new Set(['h100-sxm', 'h100-pcie', 'h200-sxm', 'a100-40-sxm', 'a100-40-pcie', 'a100-80-sxm', 'a100-80-pcie'])
    for (const device of Object.keys(DEVICES)) {
      expect([device, value(device, 'mem-capacity')]).toEqual([device, capacity[device]])
      const bandwidth = value(device, 'mem-bw')
      expect([device, hbm.has(device) ? bandwidth >= 1500 : bandwidth < 2000]).toEqual([device, true])
    }
  })

  test('turns into a floor with plain arithmetic: 1.2 GB of weights, as an illustration and not the pinned model\'s, take 1.19 ms to read on a 4090 and 0.358 ms on an H100 SXM [derived]', () => {
    const bytes = 1.2e9
    const floorMs = (device: string) => (bytes / (value(device, 'mem-bw') * 1e9)) * 1000
    expect(floorMs('rtx4090')).toBeCloseTo(1.19, 2)
    expect(floorMs('h100-sxm')).toBeCloseTo(0.358, 3)
  })
})

describe('content/claims/README.md', () => {
  const readme = readDoc('content/claims/README.md')

  test('has a row for hardware/ and the section that says how an id is built, which units it uses and how a GPU is found by its name', () => {
    expect(readme).toContain('| `hardware/` |')
    expect(readme).toContain('## The hardware atlas')
    for (const file of FILES) expect([file, readme.includes(file.split('/').pop() as string)]).toEqual([file, true])
    for (const device of Object.keys(DEVICES)) expect([device, readme.includes(`\`${device}\``)]).toEqual([device, true])
    for (const attribute of ['`product-name`', '`mem-capacity`', '`mem-bw`', '`mem-bw-tbps`', '`fp32`', '-dense`', '-sparse`', '-listed`']) expect([attribute, readme.includes(attribute)]).toEqual([attribute, true])
  })
})
