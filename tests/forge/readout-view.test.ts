/*
 * W1b-T08, acceptance 3, on the page: the `hybrid-kv` lab's slot readout (TR5a §5) as markup, in every state it can be in, with the state as a
 * prop. The numbers on the page are the sim's (tests/forge/slot-night.test.ts holds the sim and the module to each other), and this file holds
 * the page to them: each figure a learner reads is a figure of `slotNight()`, in its row, with its tag, and the page says what the readout is.
 */
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { ForgeView } from '../../src/forge/ForgeView'
import type { LoadedModule } from '../../src/forge/host'
import type { CheckResult, LabRun } from '../../src/forge/invoke'
import { FORGE_LABS } from '../../src/forge/labs'
import type { ReadoutState } from '../../src/forge/readout'
import type { ForgeState } from '../../src/forge/useForge'
import { readoutSentence } from '../../src/forge/words'
import { slotNight } from '../../packages/sim'

const lab = FORGE_LABS['hybrid-kv']
const night = slotNight()
const SHA = '9f'.repeat(32)

const decode = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
const noop = () => undefined
const render = (state: ForgeState, id = 'hybrid-kv') =>
  renderToString(createElement(ForgeView, { lab: FORGE_LABS[id], state, onChoose: noop, onRunAgain: noop, onReplay: noop })).replaceAll('<!-- -->', '')

const module: LoadedModule = {
  sha256: SHA,
  bytes: 120_000,
  lab: 'hybrid-kv',
  reference: false,
  version: 1,
  list: { lab: 'hybrid-kv', version: 1, abi: 2, checks: lab.checks.map(({ id, label, stage, seeded }) => ({ id, label, stage, seeded })) },
}
const file = { name: 'hybrid_kv.wasm', bytes: 120_000 }

const result = (index: number, status: CheckResult['status']): CheckResult => {
  const check = lab.checks[index]
  return { id: check.id, label: check.label, stage: check.stage, status, msg: 'fine', commands: 10, seed: 123, fresh: true }
}
const checks = (red: readonly number[] = []): CheckResult[] => lab.checks.map((_, index) => result(index, red.includes(index) ? 'fail' : 'pass'))

const done = (run: CheckResult[], readout?: ReadoutState): ForgeState => ({
  step: 'done',
  file,
  module,
  run: { lab: 'hybrid-kv', reference: false, version: 1, wasmSha256: SHA, seeds: 'fresh', complete: true, checks: run } satisfies LabRun,
  recorded: { kind: 'saved', durable: true },
  ...(readout === undefined ? {} : { readout }),
})

/** The `<data>` elements of the readout's table, in order: [admitted, loads] of each row. */
function figures(html: string): number[][] {
  const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'))
  return body
    .split('<tr ')
    .slice(1)
    .map((row) => [...row.matchAll(/<data class="es-readout__value" value="(\d+)">/g)].map((m) => Number(m[1])))
}

describe('the readout\'s place on the page', () => {
  test('a lab\'s readout comes after a check that the lab has, and only hybrid-kv has one: TR5a §5 prints it after stage 5', () => {
    const withReadout = Object.values(FORGE_LABS).filter((l) => l.readout !== undefined)
    expect(withReadout.map((l) => l.id)).toEqual(['hybrid-kv'])
    for (const l of withReadout) {
      expect(l.readout?.kind).toBe('slots')
      expect(l.checks.find((check) => check.id === l.readout?.after)?.stage).toBe(5)
    }
  })

  test('a lab with a readout names it after the checks, in an h2 of its own, and says what it is before there is anything to read', () => {
    const html = render({ step: 'idle' })
    expect(html).toContain('id="forge-readout"')
    expect(html.indexOf('id="forge-readout"')).toBeGreaterThan(html.indexOf('id="forge-checks"'))
    expect(text(html)).toContain('Measured against the slots')
    expect(text(html)).toContain('Once check 5 (adapters take pages of the same pool) passes, the page plays one night of adapter churn on your module and the same night on a model that keeps adapters in fixed slots')
    expect(text(html)).toContain('It is a readout and not a check: it earns nothing, and it is not written to your ledger.')
    expect(html).not.toContain('<table')
    expect(html).toContain('data-readout=""')
  })

  test('a lab without a readout has no such section, and its layout is the one it had', () => {
    const html = render({ step: 'idle' }, 'toy')
    expect(html).not.toContain('forge-readout')
    expect(html).not.toContain('Measured against the slots')
    expect(html).not.toContain('data-readout')
  })

  test('the readout carries no lamp, so the page keeps one', () => {
    for (const state of [{ step: 'idle' }, done(checks(), { status: 'ready', night, yours: { ...night.pool, differs: null } })] as ForgeState[]) {
      expect((render(state).match(/<[^>]+data-lamp="true"/g) ?? []).length).toBeLessThanOrEqual(1)
    }
  })

  test('a run that did not pass the adapter check says that there is no night to play yet', () => {
    const html = render(done(checks([4])))
    expect(text(html)).toContain('This run did not pass check 5, so there is no night to play yet.')
    expect(html).not.toContain('<table')
  })
})

describe('the night, played', () => {
  const ready = render(done(checks(), { status: 'ready', night, yours: { ...night.pool, differs: null } }))

  test('the table is your module\'s row and a row for each count of slots, each with admitted requests and adapter loads: the sim\'s figures', () => {
    expect(figures(ready)).toEqual([[night.pool.admitted, night.pool.loads], ...night.slots.map((s) => [s.row.admitted, s.row.loads])])
    const rows = text(ready)
    expect(rows).toContain('Your module adapters as pages of the pool')
    expect(rows).toContain("One slot vLLM's default at the pin, outside the pool")
    expect(rows).toContain('Two slots one for each adapter, outside the pool')
  })

  test('the heads carry the engine\'s term and the kitchen\'s word, and every figure of the table is tagged as a count of the synthetic world', () => {
    expect(text(ready)).toContain('Admitted requests tickets hung')
    expect(text(ready)).toContain('Adapter loads kits brought in')
    const table = ready.slice(ready.indexOf('<tbody'), ready.indexOf('</tbody>'))
    expect((table.match(/data-tag="synthetic"/g) ?? []).length).toBe(2 * (1 + night.slots.length))
  })

  test('the notes give the night\'s size from the sim, and what the free slots hide, with the arithmetic tagged as derived', () => {
    expect(text(ready)).toContain(`The night: ${night.arrivals} tickets over ${night.steps} steps, on a pool of ${night.spec.poolPages} pans.`)
    expect(text(ready)).toContain('A slot costs no pans here. A real slot is as wide as the widest adapter the engine will accept, and is paid for before the first request')
    const widest = Math.max(...night.adapters.map((a) => a.pages))
    expect(ready).toContain(`<data class="es-readout__value" value="${2 * widest}">`)
    expect(ready).toContain('data-tag="derived"')
    expect(text(ready)).toContain('Lesson 4 of TR5a weighs that cost.')
  })

  test('a screen reader is told the whole of it once, in a sentence that is the same figures', () => {
    const sentence = readoutSentence(night, night.pool)
    expect(ready).toContain(sentence)
    for (const value of [night.pool.admitted, night.pool.loads, ...night.slots.flatMap((s) => [s.row.admitted, s.row.loads])]) expect(sentence).toContain(String(value))
    expect(sentence).toMatch(/^Slot readout: of 60 requests, your module admitted \d+ and loaded adapters (once|\d+ times); one slot admitted \d+ and loaded (once|\d+ times); two slots admitted \d+ and loaded (once|\d+ times)\.$/)
  })

  test('where the module parted from the model, the page says where, and that the row is what the module answered', () => {
    const differs = 'operation 12 of 139, finish 1: the model answers "ok 4", and the module answered "ok 3"'
    const html = render(done(checks(), { status: 'ready', night, yours: { admitted: 7, loads: 2, differs } }))
    expect(text(html)).toContain(`Your module parts from the model at ${differs}. The row counts what your module answered.`)
    expect(figures(html)[0]).toEqual([7, 2])
    expect(ready).not.toContain('data-readout-differs')
  })

  test('a module\'s words are text and never markup', () => {
    const html = render(done(checks(), { status: 'ready', night, yours: { admitted: 1, loads: 1, differs: 'operation 1 of 9, admit 1: the module answered "<img src=x onerror=alert(1)>"' } }))
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('the night, being played, and not played', () => {
  test('while the night is played the page is held, as it is during a run: no new run, no new seeds, no file', () => {
    const html = render(done(checks(), { status: 'running' }))
    expect(html).toContain('aria-busy="true"')
    expect(text(html)).toContain('Playing the night on your module')
    expect(html).not.toContain('<table')
    // Run on new seeds, Tell these seeds again and Choose another file are dull plates until the night is over.
    for (const name of ['Run on new seeds', 'Tell these seeds again', 'Choose another file']) {
      const at = html.indexOf(name)
      expect(at, name).toBeGreaterThan(0)
      expect(html.slice(html.lastIndexOf('<button', at), at), name).toContain('disabled')
    }
  })

  test('with the night over they are live again', () => {
    const html = render(done(checks(), { status: 'ready', night, yours: { ...night.pool, differs: null } }))
    for (const name of ['Run on new seeds', 'Tell these seeds again', 'Choose another file']) {
      const at = html.indexOf(name)
      expect(html.slice(html.lastIndexOf('<button', at), at), name).not.toContain('disabled')
    }
  })

  test('a module that could not play the night costs the readout its row and the checks nothing, and the ribbon says why', () => {
    const html = render(done(checks(), { status: 'failed', night, message: 'not implemented yet: build the manager (hybrid-kv/src/manager.rs:12:9)' }))
    expect(text(html)).toContain('The night could not be played on your module: not implemented yet: build the manager (hybrid-kv/src/manager.rs:12:9)')
    expect(text(html)).toContain('The checks above stand as they are.')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('<table')
    expect(text(html)).toContain('6 of 6 checks passed.')
  })
})
