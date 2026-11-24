/*
 * W2b-T106: `tr3.provider-preflight`. The rule rests on claims of content/claims/tr3.yaml (the driver line of vLLM's install page, the two
 * older drivers of its compatibility mode and the cards it runs on, and Nsight Systems' paranoid level), which this file reads again. Each
 * key is worked out again from the host lines the ticket prints, with no code of the family.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { familyById, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { COMPAT_DRIVERS, DRIVER_MIN, PARANOID_MAX, providerPreflight } from '@es/play/items/families/tr3/provider-preflight'
import { wrongOf } from './items-support.ts'
import { chunks, codesOf } from './items-tr3-support.ts'

interface Claim {
  id: string
  value: string
  tag: string
  pin: string
  text: string
}

const root = path.resolve(import.meta.dirname, '../..')
const claims = load(readFileSync(path.join(root, 'content/claims/tr3.yaml'), 'utf8')) as Claim[]
const claim = (id: string): Claim => {
  const found = claims.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`no claim ${id}`)
  return found
}

describe('the rule rests on claims', () => {
  test('each claim exists, is measured and is pinned to the document it is read from', () => {
    for (const [id, pin] of [
      ['vllm.install.cuda13-driver', 'vllm'],
      ['vllm.install.compat-drivers', 'vllm'],
      ['vllm.install.compat-gpus', 'vllm'],
      ['nsys.paranoid-level', 'nsys'],
      ['nsys.paranoid-2-gaps', 'nsys'],
      ['nsys.paranoid-host-container', 'nsys'],
    ] as const) {
      expect(claim(id).tag, id).toBe('measured')
      expect(claim(id).pin, id).toBe(pin)
    }
  })

  test("the family's thresholds are the claims' values", () => {
    expect(claim('vllm.install.cuda13-driver').value).toBe(`R${DRIVER_MIN}`)
    expect(claim('vllm.install.compat-drivers').value).toBe(COMPAT_DRIVERS.map((driver) => `R${driver}`).join(' and '))
    expect(claim('vllm.install.compat-gpus').value).toContain('professional and datacenter')
    expect(claim('nsys.paranoid-level').value).toBe(`${PARANOID_MAX} or lower`)
    expect(claim('nsys.paranoid-2-gaps').text).toContain('gaps')
  })

  test('no key rests on the GPU-name check, which no source has been read for: the file lists it as not read', () => {
    expect(readFileSync(path.join(root, 'content/claims/tr3.yaml'), 'utf8')).toContain('Modal\'s page for the GPU name')
    expect(claims.some((candidate) => /gpu-name|which-gpu/.test(candidate.id))).toBe(false)
  })
})

describe('the family', () => {
  test('is registered, names the preflight KC, and offers a choice and a numeric variant at every level', () => {
    expect(familyById('tr3.provider-preflight')).toBe(providerPreflight)
    expect(FAMILIES).toContain(providerPreflight)
    expect(providerPreflight.kcs).toEqual(['tr3.provider-preflight'])
    for (const level of LEVELS) expect(new Set(offeredAt(providerPreflight, level).map((variant) => providerPreflight.make(1, level, variant.id).answer.kind))).toEqual(new Set(['choice', 'numeric']))
  })
})

interface Host {
  readonly driver: number
  readonly paranoid: number
  readonly gpu: string
}

function hosts(item: Item): Host[] {
  return item.givens.flatMap((given) => {
    if (!given.label.startsWith('host') || given.value.t !== 'code') return []
    const m = given.value.code.match(/^driver R(\d+), perf_event_paranoid (-?\d+), (.+)$/)
    if (m === null) throw new Error(given.value.code)
    return [{ driver: Number(m[1]), paranoid: Number(m[2]), gpu: m[3] }]
  })
}

/** The rule, written again from the claims: R580 or newer, or R535 or R570 on a datacenter card (from level 2); and a paranoid level of 2 or lower. */
function checks(host: Host, level: number): { driver: boolean; paranoid: boolean } {
  const datacenter = !host.gpu.includes('GeForce')
  return { driver: host.driver >= 580 || (level >= 2 && (host.driver === 535 || host.driver === 570) && datacenter), paranoid: host.paranoid <= 2 }
}

describe('can-run and fails-first: the keys, read again from the ticket', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: the options say what the two checks give, and the first failure is the driver's before the paranoid level's`, () => {
        for (const seed of seeds) {
          const item = providerPreflight.make(seed, level, 'can-run')
          if (item.answer.kind !== 'choice') throw new Error('choice')
          const [host] = hosts(item)
          const result = checks(host, level)
          const right = plain(item.answer.options.find((option) => option.id === (item.answer.kind === 'choice' ? item.answer.correct : ''))?.text ?? [])
          expect(right, `seed ${seed}`).toBe(result.driver && result.paranoid ? 'Yes: both checks pass' : !result.driver && !result.paranoid ? 'No: both checks fail' : !result.driver ? 'No: the driver check fails' : 'No: the paranoid check fails')

          const first = providerPreflight.make(seed, level, 'fails-first')
          if (first.answer.kind !== 'choice') throw new Error('choice')
          const [h] = hosts(first)
          const r = checks(h, level)
          const key = first.answer.options.find((option) => option.id === (first.answer.kind === 'choice' ? first.answer.correct : ''))
          const words = plain(key?.text ?? [])
          expect(words.startsWith(!r.driver ? 'The driver check' : !r.paranoid ? 'The paranoid check' : 'Neither'), `seed ${seed}: ${words}`).toBe(true)
        }
      })
    }
  }

  test('each outcome is the key about one seed in four (three for the first failure)', () => {
    for (const level of LEVELS) {
      const four = [0, 0, 0, 0]
      const three = [0, 0, 0]
      for (const seed of chunks[0].concat(chunks[1] ?? [])) {
        const r = checks(hosts(providerPreflight.make(seed, level, 'can-run'))[0], level)
        four[(r.driver ? 0 : 1) + (r.paranoid ? 0 : 2)] += 1
        const f = checks(hosts(providerPreflight.make(seed, level, 'fails-first'))[0], level)
        three[!f.driver ? 1 : !f.paranoid ? 2 : 0] += 1
      }
      for (const n of four) expect(n / 200, `${level} ${four}`).toBeGreaterThan(0.15)
      for (const n of three) expect(n / 200, `${level} ${three}`).toBeGreaterThan(0.2)
    }
  })

  test('the older drivers of the compatibility mode are in play from level 2 only, and a datacenter card passes on one while a GeForce card fails', () => {
    const seen = { passOnDatacenter: false, failOnGeForce: false }
    for (const level of LEVELS) {
      for (const seed of chunks[0].concat(chunks[1] ?? [])) {
        const [host] = hosts(providerPreflight.make(seed, level, 'can-run'))
        const old = host.driver === 535 || host.driver === 570
        if (level < 2) expect(old, `${level} ${seed}`).toBe(false)
        if (old && checks(host, level).driver) seen.passOnDatacenter = true
        if (old && !checks(host, level).driver) {
          expect(host.gpu).toContain('GeForce')
          seen.failOnGeForce = true
        }
      }
    }
    expect(seen).toEqual({ passOnDatacenter: true, failOnGeForce: true })
  })

  test('the thresholds are on the ticket at levels 0 and 1 and are left to the lesson at levels 2 and 3', () => {
    for (const level of LEVELS) {
      const labels = providerPreflight.make(2, level, 'can-run').givens.map((given) => given.label)
      expect(labels.includes('driver the build needs'), `${level}`).toBe(level <= 1)
    }
  })

  test('every lure names its misconception, and a host at the guide\'s own value of the paranoid level is said to have gaps', () => {
    const misses = new Set<string>()
    let gaps = false
    for (const level of LEVELS) {
      for (const seed of chunks[0]) {
        const item = providerPreflight.make(seed, level, 'can-run')
        if (item.answer.kind === 'choice') for (const option of item.answer.options) if (option.miss !== undefined) misses.add(option.miss)
        if (hosts(item)[0].paranoid === 2 && providerPreflight.solution(item).some((step) => plain(step.text).includes('gaps'))) gaps = true
      }
    }
    expect(gaps).toBe(true)
    expect([...misses].sort()).toEqual(['tr3.provider-preflight.both-fail', 'tr3.provider-preflight.both-pass', 'tr3.provider-preflight.driver-only', 'tr3.provider-preflight.paranoid-only'])
  })
})

describe('hosts-ok: the keys, read again from the ticket', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: the hosts that pass both checks`, () => {
        for (const seed of seeds) {
          const item = providerPreflight.make(seed, level, 'hosts-ok')
          if (item.answer.kind !== 'numeric') throw new Error('numeric')
          const list = hosts(item)
          expect(list.length).toBeGreaterThanOrEqual(8)
          expect(list.length).toBeLessThanOrEqual(12)
          expect(item.answer.truth, `seed ${seed}`).toBe(list.filter((host) => checks(host, level).driver && checks(host, level).paranoid).length)
          expect(item.answer.tolerance).toEqual({})
        }
      })
    }
  }

  test('a wrong count is named: the hosts that pass one check only, the hosts that fail, and the compatibility mode misread', () => {
    const ids = new Set<string>()
    for (const level of [0, 2, 3] as const) {
      for (const seed of chunks[0]) {
        const item = providerPreflight.make(seed, level, 'hosts-ok')
        if (item.answer.kind !== 'numeric') continue
        const list = hosts(item)
        const key = item.answer.truth
        const candidates = [list.filter((host) => checks(host, level).driver).length, list.filter((host) => checks(host, level).paranoid).length, list.length - key, list.filter((host) => (host.driver >= 580 || host.driver === 535 || host.driver === 570) && host.paranoid <= 2).length, list.filter((host) => host.driver >= 580 && host.paranoid <= 2).length]
        for (const value of candidates) {
          if (value === key) continue
          ids.add(providerPreflight.grade(item, { kind: 'numeric', value }).diagnosis?.id ?? 'none')
        }
        expect(providerPreflight.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
    for (const id of ['driver-only', 'paranoid-only', 'counted-failures', 'ignored-compat', 'compat-on-any-card']) expect(ids.has(`tr3.provider-preflight.${id}`), id).toBe(true)
  })

  test('the card names are product names, and the sentence of the stem is plain words with the build named in code', () => {
    const item = providerPreflight.make(3, 2, 'can-run')
    expect(codesOf(item.stem)).toEqual(['CUDA 13'])
    expect(plain(item.stem)).toContain('GeForce card is a gaming card')
  })
})
