/*
 * /receipts as markup (W2-T06, W2-T07): its states, drawn on the server renderer with every input as a prop. What a click does is checked in a
 * real browser, in e2e/receipts.spec.ts (the keyboard walk, axe, the copy, the issue, the focus that moves) and e2e/receipts-import.spec.ts (the
 * slip: a file chosen and dropped, the worker, the ledger).
 *
 *   - Loading, empty, and full: the tickets that are still printing, the blank ones, and the lists with a challenge in each state, a
 *     receipt, and a record that is not one.
 *   - A challenge is open, used or expired in words on tape, and only an open one can be copied. Newest first, eight at a time.
 *   - One receipt opened at its hash: every part of the receipt on the page, as text (a receipt comes from a file, A§12), every figure
 *     through the readout with the tag of a number that nobody has checked, the tables readable as tables, and the way back.
 *   - The slip a receipt comes back on, in every state of the importer (tests/receipts/import-view.test.ts).
 *   - The page is one heading, and every control is named.
 */
import { describe, expect, test } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { heldChallenges } from '@/receipts/challenge'
import type { HeldChallenge } from '@/receipts/challenge'
import { ChallengeTicket, IssuePanel } from '@/receipts/IssuePanel'
import { ReceiptsView } from '@/receipts/ReceiptsView'
import type { ReceiptsViewProps } from '@/receipts/ReceiptsView'
import type { ChallengeEvent, VerificationReport } from '@es/ledger'
import { Ledger, sampleReceipt, sampleRecord, sha256 } from './support'

// The page prints a moment in the learner's zone, and these tests name days and hours: they run in UTC wherever they run (Bun's default for a
// test run, unless the machine's TZ says otherwise, which a developer's may).
process.env.TZ = 'UTC'

const NOW = Date.parse('2026-11-09T12:00:00.000Z')
const DAY = 86_400_000
const at = (days: number): string => new Date(NOW - days * DAY).toISOString()

const render = (element: ReactElement, location = '/receipts'): string => renderToString(createElement(StaticRouter, { location }, element)).replaceAll('<!-- -->', '')
const decode = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
const text = (html: string) => decode(html.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
const headings = (html: string, level: number) => [...html.matchAll(new RegExp(`<h${level}[^>]*>(.*?)</h${level}>`, 'gs'))].map((match) => text(match[1]))

const issue = async () => ({ ok: false as const, detail: 'not here' })
const base = (over: Partial<ReceiptsViewProps> = {}): ReceiptsViewProps => ({
  ready: true,
  backend: 'idb',
  readOnly: false,
  held: [],
  receipts: [],
  open: null,
  issue,
  importer: { step: 'idle' },
  onChoose: () => undefined,
  onClear: () => undefined,
  ...over,
})
const view = (over: Partial<ReceiptsViewProps> = {}) => render(createElement(ReceiptsView, base(over)))

/** A ledger with a challenge in each state, and the sample receipt that spent one. */
function seeded() {
  const ledger = new Ledger()
  const record = sampleRecord()
  const expired = ledger.challenge(at(20), 'tr4.sweep.s1', 11)
  const used = ledger.challengeFor(at(5), (record.receipt as { challenge: { token: string } }).challenge.token)
  const open = ledger.challenge(at(2), 'tr8.replay.s2', 13)
  ledger.receipt(at(4), used.data.token, record.sha256)
  return { ledger, record, expired, used, open, held: heldChallenges(ledger.events, NOW) }
}

describe('the page while the ledger opens', () => {
  const html = view({ ready: false })

  test('is one heading and its lead, and the lists are tickets that are still printing', () => {
    expect(headings(html, 1)).toEqual(['GPU lab results'])
    expect(html).toContain('Loading your challenges')
    expect(html).toContain('Loading your results')
    expect(html).not.toContain('class="es-held"')
    expect(html).toContain('aria-busy="true"')
  })

  test('holds the button until the ledger is open, and the tape says it is printing', () => {
    expect(/<button[^>]*type="submit"[^>]*disabled/.test(html) || /<button[^>]*disabled[^>]*type="submit"/.test(html)).toBe(true)
    expect(text(html)).toContain('Warming up')
  })
})

describe('the page with nothing in the ledger', () => {
  const html = view()

  test('offers the two choices, the button, and blank tickets for the two lists', () => {
    expect(html).toContain('Choose a lab')
    expect(html).toContain('Choose a lab first.')
    expect(text(html)).toContain('Get a challenge')
    expect(text(html)).toContain('No challenge issued yet')
    expect(text(html)).toContain('No result yet')
    expect(text(html)).toContain('Nothing issued yet')
  })

  test('lists every lab, with its lane, as the group the stage is chosen from', () => {
    const labs = [...html.matchAll(/<option value="([a-z0-9.-]+)">([^<]*)<\/option>/g)].map((match) => [match[1], match[2]])
    expect(labs).toHaveLength(9)
    expect(labs[0]).toEqual(['tr0.forward', 'tr0.forward · laptop'])
    expect(labs[7]).toEqual(['tr8.replay', 'tr8.replay · GPU'])
    expect(labs[8]).toEqual(['capstone.pair', 'capstone.pair · GPU'])
  })

  test('has the slip that a receipt comes back on, after the two lists, and no part of the page is left unbuilt', () => {
    expect(headings(html, 2)).toEqual(['Get a challenge', 'Your challenges', 'Your results', 'Bring a result back'])
    expect(text(html)).not.toContain('Not built yet')
    expect(text(html)).not.toContain('Arriving with')
    expect(text(html)).toContain('Drop a receipt file')
    expect(text(html)).toContain('Choose a file')
    expect(html).toContain('type="file"')
  })

  test('says the expiry in days as an estimate, through the readout', () => {
    expect(html).toMatch(/<data class="es-readout__value" value="14">14<\/data>/)
    expect(html).toMatch(/data-tag="estimated"/)
  })

  test('has every field named by its label, and every section named by its heading', () => {
    for (const id of [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((match) => match[1])) expect(html).toContain(`id="${id}"`)
    expect([...html.matchAll(/<select/g)]).toHaveLength(2)
    expect([...html.matchAll(/<label/g)]).toHaveLength(2)
    for (const id of [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((match) => match[1])) expect(html).toContain(`id="${id}"`)
  })
})

describe('the challenges', () => {
  const { held, open, used, expired, record } = seeded()
  const html = view({ held, receipts: [record] })

  test('are listed newest first, each in its state, in words', () => {
    const lines = [...html.matchAll(/<li class="es-held__item" data-state="(open|used|expired)" data-stage="([^"]+)"/g)].map((match) => [match[2], match[1]])
    expect(lines).toEqual([
      ['tr8.replay.s2', 'open'],
      ['tr3.profile.s2', 'used'],
      ['tr4.sweep.s1', 'expired'],
    ])
    expect(held.map((entry) => entry.event.id)).toEqual([open.id, used.id, expired.id])
    expect([...html.matchAll(/class="es-tape es-held__state"[^>]*>.*?<span class="es-tape__text">(\w+)<\/span>/g)].map((match) => match[1])).toEqual(['open', 'used', 'expired'])
    // The lists have no headings of their own: the only one below the panels' is the slip's.
    expect(headings(html, 3)).toEqual(['Drop a receipt file'])
  })

  test('offer a copy only for the open one, named for its stage', () => {
    expect([...html.matchAll(/aria-label="Copy token for ([^"]+)"/g)].map((match) => match[1])).toEqual(['tr8.replay.s2'])
  })

  test('say when each was issued and, for an open one, when it stops being good, and for an expired one, when it did', () => {
    const lines = [...html.matchAll(/<li class="es-held__item"[^>]*>(.*?)<\/li>/gs)].map((match) => text(match[1]))
    expect(lines[0]).toContain('issued 7 Nov 2026')
    expect(lines[0]).toContain('good until 21 Nov 2026')
    expect(lines[2]).toContain('expired 3 Nov 2026')
    expect(lines[2]).not.toContain('Copy')
  })

  test('send a used one to the receipt that used it, by its hash', () => {
    expect(html).toContain(`href="/receipts#${record.sha256}"`)
    expect(text(html)).toContain(`used by result ${record.sha256.slice(0, 8)}`)
  })

  test('are counted on the tape by state, and the receipts held with them', () => {
    const tape = /<figure[^>]*aria-label="Challenges and results, counted"[^>]*>(.*?)<\/figure>/s.exec(html)?.[1] ?? ''
    expect(text(tape)).toMatch(/open 1 used 1 expired 1 results 1/i)
    expect(tape).not.toContain('data-tag')
  })

  test('show eight and offer the rest, when there are more', () => {
    const ledger = new Ledger()
    for (let n = 0; n < 11; n += 1) ledger.challenge(at(n + 0.1), 'tr8.replay.s2', n + 1)
    const many = view({ held: heldChallenges(ledger.events, NOW) })
    expect([...many.matchAll(/class="es-held__item"/g)]).toHaveLength(8)
    expect(text(many)).toContain('Show all 11 challenges')
    expect(many).toContain('aria-expanded="false"')
  })
})

describe('the receipts', () => {
  const good = sampleRecord()
  const failing = sampleRecord((receipt) => {
    receipt.createdAt = '2026-11-08T08:00:00Z'
    receipt.checks = [
      { id: 'one', kind: 'correctness', pass: true, detail: '' },
      { id: 'two', kind: 'correctness', pass: false, detail: '' },
      { id: 'three', kind: 'property', pass: false, detail: '' },
    ]
  })
  const odd = { sha256: sha256('odd'), receipt: { schema: 'something else' }, reports: [] }
  const checkedReports: VerificationReport[] = [{ at: '2026-11-09T10:00:00.000Z', report: { checks: [] } }]
  const checked = { ...sampleRecord((receipt) => (receipt.createdAt = '2026-11-01T00:00:00Z')), reports: checkedReports }

  test('are listed newest first, each linked to the address of its detail, and the record that is not one last', () => {
    const html = view({ receipts: [odd, checked, good, failing] })
    const items = [...html.matchAll(/<li class="es-held__item" data-state="(\w+)"/g)].map((match) => match[1])
    expect(items).toEqual(['receipt', 'receipt', 'receipt', 'unreadable'])
    for (const record of [good, failing, checked, odd]) expect(html).toContain(`href="/receipts#${record.sha256}"`)
    expect(text(html)).toContain('Not a receipt this build can read')
  })

  test('say what the grader reported and that this browser has not checked it, or when it did', () => {
    const html = view({ receipts: [good, checked] })
    expect(text(html)).toContain('The grader reports that every check passed.')
    expect(text(html)).toContain('Not checked in this browser yet')
    expect(text(html)).toContain('Last checked in this browser 9 Nov 2026, 10:00')
    expect(text(html)).toContain('by grader 0.1.0 on Example GPU 24GB')
  })

  test('count the checks that failed, through the readout', () => {
    const html = view({ receipts: [failing] })
    expect(text(html)).toMatch(/The grader reports that 2 unverified of 3 unverified checks failed\./)
  })

  test('say why a record is not a receipt, as text', () => {
    const html = view({ receipts: [odd] })
    expect(text(html)).toContain('schema:')
  })
})

describe('one receipt, opened at its hash', () => {
  const { held, record } = seeded()
  const html = view({ held, receipts: [record], open: record.sha256 })

  test('is the page with the way back, and not the lists', () => {
    expect(headings(html, 1)).toEqual(['GPU lab results'])
    expect(html).toContain('data-view="receipt"')
    expect(html).toContain('<a class="es-link" href="/receipts" data-discover="true">All results</a>')
    expect(html).not.toContain('>Get a challenge</h2>')
    expect(html).not.toContain('class="es-held"')
  })

  test('opens on the stage as its title, and lays out every part of the receipt', () => {
    expect(headings(html, 2)).toEqual(['tr3.profile.s2'])
    expect(headings(html, 3)).toEqual(['The run', 'Where it ran', 'Pins', 'Inputs', 'Artifacts', 'What the grader checked', 'What the run claimed', 'Notes', 'How this browser checked it'])
  })

  test('says it is reported by the grader and not checked here, once, for the eye, and keeps each figure\'s tag for a reader', () => {
    expect(text(html)).toContain('Reported by the grader, not checked here')
    expect([...html.matchAll(/es-receipt__stamp/g)]).toHaveLength(1)
    expect(html).toContain('data-tag="unverified"')
    expect(html).not.toContain('data-tag="measured"')
  })

  test('says what the challenge became in this ledger, and the hash that names the receipt', () => {
    expect(text(html)).toContain('Used by this receipt.')
    expect(html).toContain(record.sha256)
    expect(text(html)).toContain('es1:tr3.profile.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:')
  })

  test('says that the learner declared how they worked, and that nothing checks it', () => {
    expect(text(html)).toContain('assisted: none; agent: no; guard: on. You declared this, and nothing checks it.')
  })

  test('prints the GPU, the engine and what it ran with, from the receipt', () => {
    const body = text(html)
    for (const part of ['Example GPU 24GB', '580.82.07, CUDA 13.0', 'vllm 0.33.0, commit 4ba787ec9959', 'MRV2, graphs FULL_AND_PIECEWISE, async scheduling on, attention FLASH_ATTN', 'VLLM_LOGGING_LEVEL=INFO']) {
      expect(body).toContain(part)
    }
    expect(html).toMatch(/<data class="es-readout__value" value="25\.769803776">25\.8<\/data>/)
  })

  test('has its lists as tables that a reader can read as tables, with their column heads', () => {
    const tables = [...html.matchAll(/<table class="es-receipt__table" role="table" aria-label="([^"]+)"/g)].map((match) => match[1])
    expect(tables).toEqual(['Inputs of the run', 'Artifacts of the run', 'Checks that the grader ran'])
    expect([...html.matchAll(/role="columnheader"/g)].length).toBe(4 + 5 + 6)
    expect([...html.matchAll(/role="rowheader"/g)].length).toBe(2 + 3 + 3)
    expect(html).toContain('data-label="SHA-256"')
    // A check with no bound has none, and says so.
    expect(html).toContain('data-label="Bound" data-empty="true"')
  })

  test('shows a check as a word and a mark, never as a colour alone', () => {
    expect(text(html)).toContain('pass')
    expect(html).toContain('<span class="es-receipt__result" data-pass="true">')
  })

  test('says it has not been checked in this browser, and how to have it checked', () => {
    expect(text(html)).toContain("Not checked in this browser yet. Bring the grader's receipt file back on this page, and the rules it was checked by will be listed here.")
  })

  test('lists the times it was checked, once there are reports', () => {
    const reports: VerificationReport[] = [
      { at: '2026-11-09T11:00:00.000Z', report: { checks: [] } },
      { at: '2026-11-09T09:00:00.000Z', report: {} },
    ]
    const reported = { ...record, reports }
    const withReports = view({ held, receipts: [reported], open: record.sha256 })
    expect(text(withReports)).toContain('Checked 9 Nov 2026, 11:00')
    expect(text(withReports)).toContain('Checked 9 Nov 2026, 09:00')
    expect(text(withReports)).toContain('Reported by the grader')
    expect(text(withReports)).not.toContain('not checked here')
  })

  test('puts a hostile receipt on the page as text: nothing in it is markup', () => {
    const hostile = sampleRecord((receipt) => {
      receipt.notes = '<img src=x onerror=alert(1)> <script>alert(2)</script>'
      receipt.environment.gpus[0].name = '<b onmouseover=alert(3)>GPU</b>'
      receipt.environment.host.os = '"><svg onload=alert(4)>'
      receipt.checks[0].detail = '</td><script>alert(5)</script>'
      receipt.performance = { kind: 'bench', claimed: { '<i>key</i>': '<script>alert(6)</script>', nested: { '<u>': 1 } } }
    })
    const page = view({ receipts: [hostile], open: hostile.sha256 })
    for (const raw of ['<script>', '<img ', '<b onmouseover', '<svg onload', '<i>key', '<u>']) expect(page, raw).not.toContain(raw)
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(page).toContain('&lt;script&gt;alert(2)&lt;/script&gt;')
    expect(page).toContain('&lt;b onmouseover=alert(3)&gt;GPU&lt;/b&gt;')
    expect(page).toContain('&lt;i&gt;key&lt;/i&gt;')
  })

  test('lays out the first 40 keys of a claim and says how many more there are, so that a hostile receipt cannot ask for a page of thousands of rows', () => {
    const claimed = Object.fromEntries(Array.from({ length: 1000 }, (_, at) => [`key-${String(at).padStart(4, '0')}`, at]))
    const big = sampleRecord((receipt) => {
      receipt.performance = { kind: 'bench', claimed }
    })
    const page = view({ receipts: [big], open: big.sha256 })
    const part = /<div class="es-receipt__part"><h3 class="es-receipt__heading">What the run claimed<\/h3>(.*?)<\/div><div class="es-receipt__part">/s.exec(page)?.[1] ?? ''
    expect([...part.matchAll(/<div class="es-facts__row">/g)]).toHaveLength(40)
    expect(part).toContain('key-0039')
    expect(part).not.toContain('key-0040')
    expect(text(part)).toContain('And 960 unverified more keys, which are not laid out here.')
  })

  test('says so when the hash names no receipt this browser holds, with a way back and no lists', () => {
    const none = view({ held, receipts: [], open: sha256('nothing') })
    expect(headings(none, 2)).toEqual(['This browser holds no result with that hash'])
    expect(none).toContain('href="/receipts"')
    expect(text(none)).toContain('A result is kept on the device that imported it, so its address opens there and nowhere else.')
  })

  test('says why a record is not a receipt, and shows its hash, when the hash names one', () => {
    const odd = { sha256: sha256('odd'), receipt: { schema: 'something else', lab: 'x' }, reports: [] }
    const page = view({ receipts: [odd], open: odd.sha256 })
    expect(headings(page, 2)).toEqual(['Not a receipt this build can read'])
    expect(page).toContain(odd.sha256)
    expect(text(page)).toContain('is not a receipt of the format this build reads')
    expect(text(page)).toContain('schema:')
  })

  test('is still printing while the ledger opens, and names no receipt until it has', () => {
    const waiting = view({ ready: false, open: record.sha256 })
    expect(text(waiting)).toContain('Loading the result')
    expect(waiting).not.toContain('This browser holds no result')
  })

  test('has the one heading of the page, whichever view', () => {
    for (const page of [html, view({ ready: false, open: record.sha256 }), view({ open: sha256('nothing') })]) expect(headings(page, 1)).toEqual(['GPU lab results'])
  })
})

describe('the issue panel', () => {
  const panel = (props: Partial<Parameters<typeof IssuePanel>[0]> = {}) => render(createElement(IssuePanel, { ready: true, readOnly: false, memoryOnly: false, issue, ...props }))

  test('starts on a stage that the address asks for, with its lab chosen and a note of where it runs', () => {
    const html = panel({ preset: 'tr8.replay.s1' })
    expect(html).toContain('<option value="tr8.replay" selected="">tr8.replay · GPU</option>')
    expect(html).toContain('<option value="tr8.replay.s1" selected="">s1 · a smoke replay (optional)</option>')
    expect(text(html)).toContain('It needs a GPU, yours or a rented one. The module does not need it.')
  })

  test('says a stage is on the laptop, for the one lab that is', () => {
    expect(text(panel({ preset: 'tr0.forward.s2' }))).toContain("It runs on your laptop's CPU.")
    expect(text(panel({ preset: 'tr0.forward.s2' }))).not.toContain('The module does not need it.')
  })

  test('starts on nothing for a stage that no lab lists, and offers the stages of a lab only once it is chosen', () => {
    // The placeholders are what is chosen, in the lab's list and in the stage's: their values are empty.
    for (const preset of ['tr8.replay.s9', 'nothing', '', '__proto__']) expect([...panel({ preset }).matchAll(/<option value="([^"]*)" selected=""/g)].map((match) => match[1])).toEqual(['', ''])
    const html = panel({ preset: 'tr4.sweep.s3' })
    expect([...html.matchAll(/<option value="(tr4\.sweep\.s\d)"/g)].map((match) => match[1])).toEqual(['tr4.sweep.s1', 'tr4.sweep.s2', 'tr4.sweep.s3', 'tr4.sweep.s4'])
    expect(panel()).not.toContain('<option value="tr4.sweep.s1"')
  })

  test('warns when the ledger is in memory only, and when it is read-only, and holds the button in the second case', () => {
    expect(text(panel({ memoryOnly: true }))).toContain('This browser is not keeping your record.')
    const locked = panel({ readOnly: true })
    expect(text(locked)).toContain('has handed your record to a newer version of the site')
    expect(locked).toMatch(/<button[^>]*disabled=""[^>]*>/)
  })
})

describe('the ticket a challenge is printed on', () => {
  const ledger = new Ledger()
  const event = ledger.challenge('2026-11-09T12:30:00.000Z', 'tr8.replay.s2', 5) as ChallengeEvent
  const html = render(createElement(ChallengeTicket, { event, durable: true, memoryOnly: false }))

  test('is under the heat lamp, titled for the stage, and prints the token whole', () => {
    expect(html).toContain('data-lamp="true"')
    expect(headings(html, 3)).toEqual(['The BurstGPT replay'])
    expect(text(html)).toContain(event.data.token)
    expect(html).toContain('<wbr/>')
  })

  test('prints the command, with the token in it, and a way to copy each', () => {
    expect(text(html)).toContain(`enginespace grade tr8.replay.s2 --challenge ${event.data.token}`)
    expect(text(html)).toContain('Copy the token')
    expect(text(html)).toContain('Copy the command')
  })

  test('says when it was issued and when it stops being good, and points at the lab', () => {
    expect(text(html)).toContain('issued 9 Nov 2026, 12:30')
    expect(text(html)).toContain('good until 23 Nov 2026, 12:30')
    expect(html).toContain('href="/labs/tr8.replay"')
    expect(text(html)).toContain(`Challenge ${event.data.seed.toString(16).padStart(8, '0')}`)
  })

  test('keeps a place for what the copy did, so that the stub does not move, and for a screen reader to hear it', () => {
    expect(html).toContain('role="status" data-status="idle"')
  })

  test('warns when the browser has not confirmed that it kept the challenge, and not when the ledger is in memory (the panel says that)', () => {
    expect(text(render(createElement(ChallengeTicket, { event, durable: false, memoryOnly: false })))).toContain('has not confirmed that it kept this challenge')
    expect(text(render(createElement(ChallengeTicket, { event, durable: false, memoryOnly: true })))).not.toContain('has not confirmed')
  })
})

describe('the held challenges', () => {
  test('are the ones the ledger holds, and a list with none is empty and not missing', () => {
    const none: readonly HeldChallenge[] = []
    expect(view({ held: none })).not.toContain('class="es-held"')
    expect(sampleReceipt().stage).toBe('tr3.profile.s2')
  })
})
