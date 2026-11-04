/*
 * W0-T09, accept 2: a claim chip shows the value, the unit, the source's title and `verifiedAt`, and says "stale since" past
 * its TTL. Every test fixes today, so no test depends on the day it runs.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import type { Claim } from '@es/schema'
import { ClaimChip } from '@/content/render/ClaimChip'
import { renderEnv, staleSince } from '@/content/render/model'
import { claimProblems } from '../../scripts/verify-claims.ts'

const base = {
  text: 'A fixture claim.',
  verifiedAt: '2026-08-01',
  ttlDays: 90,
} as const

const SOURCED: Claim = {
  ...base,
  id: 'test.widget.latency',
  value: 340,
  unit: 'us',
  tag: 'measured',
  source: { url: 'https://example.org/widget', title: 'The widget datasheet', quote: 'latency: 340 us', accessed: '2026-08-01' },
}

/** The chip for `claim` on `today`, as the server renders it, with React's text-node markers taken out. */
function chip(claim: Claim, today: string, claims: ReadonlyMap<string, Claim> | null = new Map([[claim.id, claim]])): string {
  return renderToString(h(ClaimChip, { id: claim.id, env: renderEnv([], claims, today) })).replaceAll('<!-- -->', '')
}

describe('a claim chip', () => {
  const html = chip(SOURCED, '2026-08-20')

  test('shows the value, the unit and the tag, through the readout', () => {
    expect(html).toContain('<data class="es-readout__value" value="340">340</data>')
    expect(html).toContain('<span class="es-readout__unit">µs</span>')
    expect(html).toContain('data-tag="measured">measured<')
  })

  test('shows the source\'s title, as a link to the page it was read from', () => {
    expect(html).toMatch(/<a href="https:\/\/example\.org\/widget"[^>]*target="_blank"[^>]*>The widget datasheet/)
    expect(html).toContain('(opens in a new tab)')
  })

  test('shows the day the claim was verified, as a machine-readable date', () => {
    expect(html).toContain('verified <time dateTime="2026-08-01">2026-08-01</time>')
  })

  test('says nothing about age while the claim is fresh', () => {
    expect(html).not.toContain('stale since')
    expect(html).toContain('data-state="fresh"')
  })

  test('carries the claim\'s sentence as its title, and its id for tests and for the page that replaces a chip', () => {
    expect(html).toContain('title="A fixture claim."')
    expect(html).toContain('data-claim="test.widget.latency"')
  })
})

describe('"stale since"', () => {
  test('is the last good day, once today is past it: 2026-08-01 and 90 days is 2026-10-30', () => {
    const stale = chip(SOURCED, '2026-10-31')
    expect(stale).toContain('stale since <time dateTime="2026-10-30">2026-10-30</time>')
    expect(stale).toContain('data-state="stale"')
    // The warning is a word and a mark, never only a colour (WCAG 1.4.1).
    expect(stale).toContain('data-icon="alert"')
  })

  test('is not said on the last good day itself', () => {
    expect(chip(SOURCED, '2026-10-30')).not.toContain('stale since')
  })

  test('is said on a claim that went stale long ago, and still shows the value and the source', () => {
    const old = chip(SOURCED, '2030-01-01')
    expect(old).toContain('stale since <time dateTime="2026-10-30">')
    expect(old).toContain('value="340"')
    expect(old).toContain('The widget datasheet')
  })

  test('uses the same rule as verify:claims, on every day from the verification to well past the TTL', () => {
    for (const ttlDays of [1, 7, 90, 365]) {
      const claim: Claim = { ...SOURCED, ttlDays }
      const verified = Date.parse(`${claim.verifiedAt}T00:00:00Z`)
      for (let offset = -1; offset <= ttlDays + 4; offset += 1) {
        const today = new Date(verified + offset * 86_400_000).toISOString().slice(0, 10)
        const warning = claimProblems([{ claim, file: 'content/claims/test.yaml', line: 1 }], null, today).find((found) => found.code === 'stale-claim')
        const since = staleSince(claim, today)
        if (warning === undefined) expect(since).toBeNull()
        else expect(warning.message).toContain(`stale since ${since}`)
        expect(chip(claim, today).includes('stale since')).toBe(warning !== undefined)
      }
    }
  })
})

describe('a claim with no source', () => {
  test('a synthetic number says it comes from the synthetic world, and its readout is stamped synthetic', () => {
    const synthetic: Claim = { ...base, id: 'test.world.step', value: 300, unit: 'us', tag: 'estimated', synthetic: true }
    const html = chip(synthetic, '2026-08-20')
    expect(html).toContain('data-tag="synthetic">synthetic<')
    expect(html).toContain('synthetic world, estimated')
    expect(html).toContain('data-synthetic="true"')
    expect(html).not.toContain('<a ')
  })

  test('a derived number shows its formula', () => {
    const derived: Claim = {
      ...base,
      id: 'test.world.step-ms',
      value: 2.1,
      unit: 'ms',
      tag: 'derived',
      derived: { formula: 'test.world.step-us / 1000', inputs: ['test.world.step-us'] },
    }
    const html = chip(derived, '2026-08-20')
    expect(html).toContain('derived: <code>test.world.step-us / 1000</code>')
    // 2.1 keeps its one digit after the point.
    expect(html).toContain('<data class="es-readout__value" value="2.1">2.1</data>')
  })
})

describe('the shapes of a value', () => {
  test('a number over a thousand is grouped, as the printer prints it', () => {
    expect(chip({ ...SOURCED, value: 2100 }, '2026-08-20')).toContain('>2,100</data>')
  })

  test('a word or a range is printed in code, with its tag on tape', () => {
    const range: Claim = { ...SOURCED, id: 'test.pkg.python', value: '<3.15,>=3.11', unit: undefined }
    const html = chip(range, '2026-08-20')
    expect(html).toContain('<code class="es-claim__text">&lt;3.15,&gt;=3.11</code>')
    expect(html).toContain('class="es-tag" data-tag="measured"')
    expect(html).not.toContain('es-readout')
  })

  test('a unit the readout has no word for is printed as the claim writes it', () => {
    const html = chip({ ...SOURCED, unit: 'GB/s' }, '2026-08-20')
    expect(html).toContain('<span class="es-claim__unit">GB/s</span>')
    expect(html).not.toContain('es-readout__unit')
  })

  test('a claim with no unit prints a bare number', () => {
    const html = chip({ ...SOURCED, unit: undefined }, '2026-08-20')
    expect(html).not.toContain('es-readout__unit')
    expect(html).not.toContain('es-claim__unit')
  })
})

describe('a claim that cannot be shown', () => {
  test('names the claim and says the claims did not load, when there is no claims file to look in', () => {
    const html = chip(SOURCED, '2026-08-20', null)
    expect(html).toContain('data-state="unavailable"')
    expect(html).toContain('<code>test.widget.latency</code>')
    expect(html).toContain('the claims did not load')
  })

  test('names the claim and says there is no such claim, when the file has none by that id', () => {
    const html = chip(SOURCED, '2026-08-20', new Map())
    expect(html).toContain('data-state="unknown"')
    expect(html).toContain('no such claim')
  })
})
