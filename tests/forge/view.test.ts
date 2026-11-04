/*
 * W1-T10: the forge view as markup, in every state that useForge.ts can be in, rendered on the server renderer with the state as a prop.
 * What a click or a drop does is checked in a real browser, in e2e/forge.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { LoadedModule } from '../../src/forge/host'
import type { CheckResult, LabRun } from '../../src/forge/invoke'
import { FORGE_LABS } from '../../src/forge/labs'
import type { ForgeState } from '../../src/forge/useForge'
import { ForgeView } from '../../src/forge/ForgeView'

const lab = FORGE_LABS.toy
const SHA = '02abd5f4fb63aabbccddeeff00112233445566778899aabbccddeeff00112233'

const decode = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
const noop = () => undefined
const render = (state: ForgeState) =>
  renderToString(createElement(ForgeView, { lab, state, onChoose: noop, onRunAgain: noop, onReplay: noop })).replaceAll('<!-- -->', '')

const module = (overrides: Partial<LoadedModule> = {}): LoadedModule => ({
  sha256: SHA,
  bytes: 73_635,
  lab: 'toy',
  reference: false,
  version: 1,
  list: { lab: 'toy', version: 1, abi: 2, checks: lab.checks.map(({ id, label, stage, seeded }) => ({ id, label, stage, seeded })) },
  ...overrides,
})
const file = { name: 'toy.wasm', bytes: 73_635 }

const result = (index: number, status: CheckResult['status'], msg = 'fine', extra: Partial<CheckResult> = {}): CheckResult => {
  const check = lab.checks[index]
  return { id: check.id, label: check.label, stage: check.stage, status, msg, commands: 10, ...(check.seeded ? { seed: 3_141_592_653, fresh: true } : {}), ...extra }
}

const done = (checks: CheckResult[], overrides: Partial<LabRun> = {}, recorded: Extract<ForgeState, { step: 'done' }>['recorded'] = { kind: 'saved', durable: true }): ForgeState => ({
  step: 'done',
  file,
  module: module(),
  run: { lab: 'toy', reference: false, version: 1, wasmSha256: SHA, seeds: 'fresh', complete: true, checks, ...overrides },
  recorded,
})

const green = () => lab.checks.map((_, index) => result(index, 'pass', `check ${index} established it`))

describe('before a file', () => {
  const html = render({ step: 'idle' })

  test('names the lab, says what it is in the kitchen\'s words and the engine\'s, and offers a file', () => {
    expect(text(html)).toContain('The Rotation')
    expect(html).toContain('<h1')
    expect(text(html)).toContain('In the engine: an LRU free queue.')
    expect(text(html)).toContain('Drop a .wasm')
    expect(text(html)).toContain('Choose a file')
    expect(text(html)).toContain('cargo build --release --target wasm32-unknown-unknown')
    expect(text(html)).toContain('target/wasm32-unknown-unknown/release/toy.wasm')
  })

  test('lists the five checks, each not run, with the mistake it catches', () => {
    for (const check of lab.checks) {
      expect(text(html)).toContain(check.label)
      expect(text(html)).toContain(check.catches)
    }
    expect((html.match(/not run/g) ?? []).length).toBe(5)
  })

  test('puts the lamp on the slip and on no check, and has an empty tape', () => {
    expect(html).toMatch(/class="es-ticket"[^>]*data-lamp="true"/)
    expect(html).not.toMatch(/es-forge-check[^>]*data-lamp/)
    expect(text(html)).toContain('Nothing printed yet. Drop a module.')
  })

  test('has a file input that a drop or a click can use, named for the module, and says nothing is sent anywhere', () => {
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="\.wasm,application\/wasm"/)
    expect(text(html)).toContain('never sent anywhere')
  })
})

describe('reading, and a file that is refused', () => {
  test('a file being read prints as a ticket that is still printing', () => {
    const html = render({ step: 'reading', file })
    expect(html).toContain('aria-busy="true"')
    expect(text(html)).toContain('Reading the module')
    expect(text(html)).toContain('toy.wasm')
  })

  test('a refusal puts the lamp back on the slip, because choosing another file is the next decision', () => {
    const html = render({ step: 'refused', file, message: 'no.' })
    expect(html).toMatch(/class="es-ticket"[^>]*data-lamp="true"/)
  })

  test('a refusal says why in the ribbon\'s red, offers another file, and runs nothing', () => {
    const html = render({ step: 'refused', file: { name: 'notes.txt', bytes: 12 }, message: 'this is not a WebAssembly file: it does not begin with \\0asm.' })
    expect(text(html)).toContain('Not graded')
    expect(text(html)).toContain('it does not begin with \\0asm')
    expect(text(html)).toContain('Choose another file')
    expect(html).toContain('role="alert"')
    expect(text(html)).toContain('Nothing ran.')
  })

  test('a module that loaded and is not this lab\'s still shows the hash it was named by', () => {
    const html = render({ step: 'refused', file, message: 'this module is the "hybrid-kv" lab\'s, and this page grades "toy".', sha256: SHA })
    expect(text(html)).toContain(SHA)
  })
})

describe('a run in progress', () => {
  const state: ForgeState = { step: 'running', file, module: module(), seeds: 'fresh', results: [result(0, 'pass'), result(1, 'pass')], current: { index: 2, id: 'dump' } }
  const html = render(state)

  test('shows the checks that finished, the one that is running and the ones that wait', () => {
    expect((html.match(/data-state="result"/g) ?? []).length).toBe(2)
    expect((html.match(/data-state="running"/g) ?? []).length).toBe(1)
    expect((html.match(/data-state="waiting"/g) ?? []).length).toBe(2)
  })

  test('prints the module on the tape as it is known, and offers no new run until this one is over', () => {
    expect(text(html)).toContain('02abd5f4fb63…')
    expect(text(html)).not.toContain('Run on new seeds')
    expect(text(html)).toContain('Running check 3 of 5.')
  })
})

describe('a run that is over', () => {
  test('all green: five passes, the module\'s hash on masking tape, the seed of the seeded check, and a new run to pull', () => {
    const html = render(done(green()))
    expect((html.match(/data-status="pass"/g) ?? []).length).toBeGreaterThanOrEqual(5)
    expect(text(html)).toContain(SHA)
    expect(text(html)).toContain('sha-256')
    expect(text(html)).toContain('seed 3141592653 drawn when the run began')
    expect(text(html)).toContain('Run on new seeds')
    expect(text(html)).toContain('Tell these seeds again')
    expect(text(html)).toContain('5 of 5 checks passed.')
    expect(text(html)).toContain('Written to your ledger on this device')
    expect(html).not.toMatch(/es-forge-check[^>]*data-lamp="true"/)
  })

  test('the slip is the module\'s heading: the page has one h1, the slip\'s title is its h2, and the checks have an h2 of their own', () => {
    for (const state of [{ step: 'idle' }, done(green())] as ForgeState[]) {
      const html = render(state)
      expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1)
      expect((html.match(/<h2[ >]/g) ?? []).length).toBe(2)
      expect(html).not.toMatch(/<h3[ >]/)
      expect(html).toContain('aria-label="Your module"')
    }
  })

  test('the first check that is not green is under the lamp, says what went wrong, and says what the check catches', () => {
    const checks = green()
    checks[1] = result(1, 'fail', 'order should answer "2,3,1", and the module answered "1,2,3": a hit moves the key to the back')
    checks[3] = result(3, 'fail', 'touch 4 should answer "miss dump 2"')
    const html = render(done(checks))
    const lamps = html.match(/<li class="es-forge-check"[^>]*data-lamp="true"/g) ?? []
    expect(lamps).toHaveLength(1)
    expect(html.indexOf('data-lamp="true"', html.indexOf('es-forge-checks'))).toBeLessThan(html.indexOf(lab.checks[2].label))
    expect(text(html)).toContain('order should answer "2,3,1"')
    expect(text(html)).toContain(`Catches: ${lab.checks[1].catches}`)
    expect(text(html)).toContain('3 of 5 checks passed. First to fix: a held key is a hit and goes to the back, fail.')
  })

  test('a trap says "not implemented yet" with the panic\'s place, and a timeout says what stopped it', () => {
    const checks = green()
    checks[0] = result(0, 'trap', 'not implemented yet: build the rotation (toy/src/rotation.rs:31:9)', { panic: 'panicked at toy/src/rotation.rs:31:9: not yet implemented: build the rotation' })
    checks[2] = result(2, 'timeout', 'check "dump" was still running after 2 s, so the grader stopped it and went on with the next check.')
    const html = render(done(checks))
    expect(text(html)).toContain('not implemented yet: build the rotation (toy/src/rotation.rs:31:9)')
    expect(text(html)).toContain('was still running after 2 s')
    expect(html).toContain('data-status="trap"')
    expect(html).toContain('data-status="timeout"')
  })

  test('a reference build says "toy@reference: no credit" on its slip, prints it on the tape too, and writes no record', () => {
    const html = render(done(green(), { reference: true }, { kind: 'none', why: 'reference' }))
    expect(text(html)).toContain('toy@reference: no credit')
    expect(text(html)).toContain('ledger no credit')
    // The slip is the voided ticket, and the sentence is printed there once, with the tape's own line beside it.
    expect(html).toMatch(/<section class="es-ticket"[^>]*data-state="error"/)
    expect(html.match(/A reference build is shown and never recorded/g)).toHaveLength(2)
    expect(text(html)).not.toContain('Written to your ledger')
  })

  test('a red run is written, and says so on the tape and in words, without calling it earned or a miss', () => {
    const checks = green()
    checks[2] = result(2, 'fail', 'x')
    const html = render(done(checks))
    expect(text(html)).toContain('ledger written, unseen')
    expect(text(html)).toContain('passed 4 measured of 5')
    expect(text(html)).toContain('Written to your ledger as "check failed, retry": it takes nothing away')
    expect(text(html)).not.toContain('Written to your ledger on this device')
  })

  test('a trap that says what the check above said says so, and prints the words once', () => {
    const trap = 'not implemented yet: build the rotation (toy/src/rotation.rs:31:9)'
    const html = render(done(lab.checks.map((_, index) => result(index, 'trap', trap))))
    expect(text(html).split(trap)).toHaveLength(2)
    expect((text(html).match(/the same trap as the check above/g) ?? []).length).toBe(4)
    // What a check catches is about wrong replies, so a trap or a timeout does not print it.
    expect(text(html)).not.toContain('Catches:')
  })

  test('a replay is not recorded, and says so', () => {
    const html = render(done(green(), { seeds: 'replay' }, { kind: 'none', why: 'replay' }))
    expect(text(html)).toContain('Not recorded: these are seeds you have seen already')
  })

  test('a ledger that refused is said in the ribbon\'s red, and the run is still shown', () => {
    const html = render(done(green(), {}, { kind: 'failed', detail: 'the ledger is read-only in this tab.' }))
    expect(text(html)).toContain('Not recorded: the ledger is read-only in this tab.')
    expect(html).toContain('data-kind="failed"')
    expect((html.match(/data-status="pass"/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  test('prints a module\'s words as text and never as markup', () => {
    const checks = green()
    checks[0] = result(0, 'fail', 'touch 1 should answer "miss", and the module answered "<img src=x onerror=alert(1)>"', { trace: '<script>alert(1)</script>' })
    const html = render(done(checks))
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('What the module traced')
  })
})
