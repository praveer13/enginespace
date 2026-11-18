/*
 * W2-T07, W2-T08: the slip a receipt comes back on (src/receipts/ImportPanel.tsx), the list of rules it prints (Rules.tsx), and the part of a receipt's
 * page that keeps each check (ReceiptDetail.tsx), drawn on the server renderer from the real results of the rules. What a drop does is checked in
 * a real browser, in e2e/receipts-import.spec.ts.
 *
 *   - The slip in each state: waiting for the ledger, ready, read-only, in memory only, checking, refused, kept, kept again, failed.
 *   - A refused file says which rule stopped it, in the ribbon's red, and that nothing was kept; the rules after it say they did not run.
 *   - A receipt that was kept lists its nine rules and the checks of rules 7 to 9 with their bounds, says what it is worth now (not credited, and why),
 *     and leads to its page.
 *   - A result is a word and a mark and never a colour alone; the learner's file name and every sentence a rule quotes go on the page as text.
 *   - The caps are readouts with the tag of an estimate; the file's size is a readout with the tag of a measurement.
 *   - A receipt's page keeps every check it has had, the newest open and the rest folded, reads a report back through the verifier's own reader,
 *     and says so when it cannot; a line of the list says in a word what the latest check made of the receipt.
 */
import { describe, expect, test } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import type { VerificationReport } from '@es/ledger'
import { storedReport, verifyBundle } from '@es/verify'
import type { Outcome } from '@es/verify'
import { ImportPanel } from '@/receipts/ImportPanel'
import type { ImportPanelProps } from '@/receipts/ImportPanel'
import { ReceiptDetail } from '@/receipts/ReceiptDetail'
import { ReceiptList } from '@/receipts/Held'
import { RuleList } from '@/receipts/Rules'
import { heldReceipts, readReceipt } from '@/receipts/records'
import type { ImportState } from '@/receipts/useImport'
import { changed, contextFor, fileOf, sampleBundle, sha256 } from '../verify/support'
import { sampleRecord } from './support'

process.env.TZ = 'UTC'

const render = (element: ReactElement): string => renderToString(createElement(StaticRouter, { location: '/receipts' }, element)).replaceAll('<!-- -->', '')
const decode = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
const text = (html: string) => decode(html.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())

const props = (state: ImportState, over: Partial<ImportPanelProps> = {}): ImportPanelProps => ({
  ready: true,
  readOnly: false,
  memoryOnly: false,
  state,
  onChoose: () => undefined,
  onClear: () => undefined,
  ...over,
})
const panel = (state: ImportState, over: Partial<ImportPanelProps> = {}): string => render(createElement(ImportPanel, props(state, over)))

/* The real results of the rules, for the states that show them. */
const bundle = sampleBundle()
const checkedOutcome = async (b = bundle, over = {}): Promise<Extract<Outcome, { kind: 'checked' }>> => {
  const outcome = await verifyBundle(fileOf(b), contextFor(b, over))
  if (outcome.kind !== 'checked') throw new Error('refused')
  return outcome
}
const good = await checkedOutcome()
const unbound = await checkedOutcome(bundle, { book: [] })
const tampered = changed((b) => {
  const entry = b.receipt.artifacts.find((artifact) => artifact.id === 'log')
  if (entry !== undefined) entry.sha256 = '0'.repeat(64)
})
const refusedOutcome = await verifyBundle(fileOf(tampered), contextFor(tampered))
if (refusedOutcome.kind !== 'refused') throw new Error('the tampered file was taken')

const FILE = { name: 'tr3.profile-s2-20261109T120000Z.es.json.gz', bytes: 2082 }
const kept = (over: Partial<Extract<ImportState, { step: 'kept' }>> = {}): ImportState => ({ step: 'kept', file: FILE, rules: good.rules, sha256: good.receiptSha256, verdict: good.verdict, grader: good.receipt.grader.version, recheck: false, ...over })

describe('the slip, waiting for a file', () => {
  const html = panel({ step: 'idle' })

  test('is a section headed "Bring a result back", with a slip titled "Drop a receipt file" and a stub that chooses a file', () => {
    expect(html).toMatch(/<h2 id="rc-import" class="es-panel__title">Bring a result back<\/h2>/)
    expect(html).toContain('aria-labelledby="rc-import"')
    expect(text(html)).toContain('Receipt file')
    expect(text(html)).toContain('.es.json.gz')
    expect(html).toMatch(/<h3[^>]*>Drop a receipt file<\/h3>/)
    expect(text(html)).toContain('Choose a file')
    expect(html).toMatch(/<button[^>]*class="es-primary-button__pull"[^>]*>/)
    expect(html).not.toMatch(/<button[^>]*es-primary-button__pull[^>]*disabled/)
  })

  test('has a file input that a keyboard and a reader reach through its name, hidden behind the stub, and accepts gzip', () => {
    expect(html).toMatch(/<input[^>]*type="file"[^>]*hidden=""[^>]*aria-label="The receipt file"|<input[^>]*aria-label="The receipt file"[^>]*type="file"/)
    expect(html).toContain('accept=".gz,application/gzip,application/x-gzip"')
  })

  test('says the file is read here and never leaves the tab, and where the grader writes it', () => {
    expect(text(html)).toContain('The file never leaves the tab.')
    expect(text(html)).toContain('Your grader writes it to its receipts folder as one file that ends in .es.json.gz.')
  })

  test('prints the caps of rule 1 as readouts that carry the tag of an estimate: 32 MB as a file, and 256 MB inside it', () => {
    // The caps are the last thing on the slip's paper, so what follows the marker is them and nothing else.
    const foot = html.slice(html.indexOf('es-import__caps'))
    expect([...foot.matchAll(/<data class="es-readout__value" value="(\d+)">/g)].map((match) => match[1])).toEqual(['32', '256'])
    expect([...foot.matchAll(/data-tag="(\w+)"/g)].map((match) => match[1])).toEqual(['estimated', 'estimated'])
    expect(text(foot)).toMatch(/at most 32 MB estimated as a file and 256 MB estimated inside it/)
  })

  test('has a live region from the start, and it is empty until there is something to say', () => {
    expect(html).toMatch(/<p class="sr-only" role="status" aria-live="polite"><\/p>/)
  })

  test('has no clear button and no result: there is nothing to clear', () => {
    expect(html).not.toContain('Clear this')
    expect(html).toContain('data-step="idle"')
  })
})

describe('the slip, while the ledger opens and when the ledger cannot be written', () => {
  test('holds the stub until the ledger is open, and says so', () => {
    const html = panel({ step: 'idle' }, { ready: false })
    expect(html).toMatch(/<button[^>]*es-primary-button__pull[^>]*disabled=""|<button[^>]*disabled=""[^>]*es-primary-button__pull/)
    expect(text(html)).toContain('Your record is opening, and the page takes a file as soon as it has.')
  })

  test('holds the stub when a newer version of the site has the ledger, and says to reload', () => {
    const html = panel({ step: 'idle' }, { readOnly: true })
    expect(html).toMatch(/<button[^>]*es-primary-button__pull[^>]*disabled=""|<button[^>]*disabled=""[^>]*es-primary-button__pull/)
    expect(text(html)).toContain('has handed your record to a newer version of the site. Reload the page to bring a result back.')
  })

  test('warns when the ledger is in memory only, and still takes the file', () => {
    const html = panel({ step: 'idle' }, { memoryOnly: true })
    expect(text(html)).toContain('This browser is not keeping your record. A result kept now is lost when this tab closes.')
    expect(html).not.toMatch(/<button[^>]*es-primary-button__pull[^>]*disabled/)
  })
})

describe('the slip, checking a file', () => {
  const html = panel({ step: 'checking', file: FILE })

  test('is a ticket that is still printing, with the file named and its size as a measured readout, and no stub to press', () => {
    expect(html).toContain('aria-busy="true"')
    expect(text(html)).toContain(FILE.name)
    expect(html).toMatch(/<data class="es-readout__value" value="2082">2,082<\/data>/)
    expect(html).toMatch(/data-tag="measured"/)
    expect(html).not.toContain('Choose a file')
  })

  test('says in the status line what it is doing', () => {
    expect(html).toMatch(/role="status" aria-live="polite">Checking the receipt: tr3\.profile-s2-20261109T120000Z\.es\.json\.gz\.<\/p>/)
  })
})

describe('the slip, with a file that is not a receipt this browser can read', () => {
  const state: ImportState = { step: 'refused', file: FILE, rules: refusedOutcome.rules }
  const html = panel(state)

  test('says which rule stopped it, in the ribbon\'s red, and that nothing was kept and no challenge was spent', () => {
    expect(html).toMatch(/<h3[^>]*>Not a receipt this browser can read<\/h3>/)
    expect(html).toContain('data-state="error"')
    expect(text(html)).toContain('An artifact in the bundle is not the one the receipt lists.')
    expect(text(html)).toContain('Nothing was kept and no challenge was spent.')
  })

  test('lists the nine rules: the first two pass, integrity fails and names the artifact, and the rest say they did not run', () => {
    const rules = [...html.matchAll(/<li class="es-rule" data-status="(\w+)" data-rule="(\w+)">/g)].map((match) => `${match[2]}:${match[1]}`)
    expect(rules).toEqual(['caps:pass', 'schema:pass', 'integrity:fail', 'binding:skipped', 'grader:skipped', 'pins:skipped', 'rechecks:skipped', 'recomputation:skipped', 'floors:skipped'])
    expect(text(html)).toContain('Artifact "log": its data in the bundle hashes to')
    expect(text(html)).toContain('Not checked: an earlier rule stopped the check.')
  })

  test('shows each result as a word and a drawn mark, never as a colour alone', () => {
    expect([...html.matchAll(/<span class="es-rule__result"><svg[^>]*data-icon="(\w+)"[^>]*>.*?<\/svg><span>([^<]+)<\/span>/g)].map((match) => `${match[1]}:${match[2]}`)).toEqual([
      'check:pass',
      'check:pass',
      'alert:fail',
      'strike:not run',
      'strike:not run',
      'strike:not run',
      'strike:not run',
      'strike:not run',
      'strike:not run',
    ])
  })

  test('names the rules by their numbers and their names, and a reader hears the number', () => {
    expect([...html.matchAll(/<p class="es-rule__name"><span class="sr-only">Rule (\d), <\/span>([^<]+)<\/p>/g)].map((match) => `${match[1]}:${match[2]}`)).toEqual([
      '1:Caps',
      '2:Schema',
      '3:Integrity',
      '4:Binding',
      '5:Grader identity',
      '6:Pins',
      '7:Re-checks',
      '8:Recomputation',
      '9:Physics floors',
    ])
    expect(html).toContain('aria-label="How this browser checked the file"')
  })

  test('offers another file and a way to clear the result, and says it in the status line', () => {
    expect(text(html)).toContain('Choose another file')
    expect(text(html)).toContain('Clear this')
    expect(html).toMatch(/role="status" aria-live="polite">Not a receipt this browser can read\. An artifact in the bundle is not the one the receipt lists\./)
  })

  test('does not link to a receipt page: there is no receipt', () => {
    expect(html).not.toContain('href="/receipts#')
  })
})

describe('the slip, with a receipt that was kept', () => {
  const html = panel(kept())

  test('is titled for what happened, names the receipt by its short hash, and leads to its page by its full hash', () => {
    expect(html).toMatch(/<h3[^>]*>Kept in your record<\/h3>/)
    expect(text(html)).toContain(`Result ${good.receiptSha256.slice(0, 8)}`)
    expect(html).toContain(`href="/receipts#${good.receiptSha256}"`)
    expect(text(html)).toContain('Open the result')
    expect(text(html)).toContain('The result is in your record with this check beside it.')
  })

  test('lists the nine rules, with what each found: the six of W2-T07 pass, and the bare sample fails what the stage asks of its evidence in rules 8 and 9', () => {
    expect([...html.matchAll(/<li class="es-rule" data-status="(\w+)" data-rule="(\w+)">/g)].map((match) => `${match[2]}:${match[1]}`)).toEqual([
      'caps:pass',
      'schema:pass',
      'integrity:pass',
      'binding:pass',
      'grader:pass',
      'pins:pass',
      'rechecks:pass',
      'recomputation:fail',
      'floors:fail',
    ])
    expect(text(html)).toContain('2 artifacts hashed over canonical bytes')
    expect(text(html)).toContain('Bound to the challenge this browser issued for tr3.profile.s2')
  })

  test('prints each check once, under the verdict, with an id, a word, the bound it was held to and who checked it, and the rules above say only what they found', () => {
    const checks = [...html.matchAll(/<li class="es-check" data-status="(\w+)" data-check="([\w-]+)" data-how="([\w-]+)">/g)].map((match) => `${match[2]}:${match[1]}:${match[3]}`)
    expect(checks).toContain('T6:fail:re-checked')
    expect(checks).toContain('T2:pass:re-checked')
    expect(checks).toContain('P1:fail:re-checked')
    expect(checks).toContain('agreement:attested:attested')
    expect(new Set(checks).size).toBe(checks.length)
    expect(text(html)).toContain('This site declares no step count for tr3.profile.s2')
    expect(text(html)).toContain('The hardware atlas has no entry for "Example GPU 24GB"')
    expect(text(html)).toContain('re-checked here')
    expect(text(html)).toContain('attested by grader 0.1.0')
    // The rules of 7 to 9 give their sentence and no list: the verdict has the list.
    expect(html).not.toContain('aria-label="Checks of rule')
    expect(text(html)).toMatch(/\d+ checks?, \d+ passed and \d+ failed\./)
  })

  test('lists the checks under their rule where there is no verdict to list them: a check that was made and not kept', () => {
    const html = panel({ step: 'failed', file: FILE, message: 'This tab is read-only.', rules: good.rules })
    expect(html).toContain('aria-label="Checks of rule 8"')
    expect(html).toMatch(/<li class="es-check" data-status="fail" data-check="T6">/)
  })

  test('says what it is worth now: not counted, and why, in the words of the verifier and not in a number of the page\'s own', () => {
    expect(text(html)).toContain('not counted')
    expect(text(html)).toContain('What it is worth now')
    expect(text(html)).toContain('X1 is a check this site does not run yet, so a receipt of tr3.profile.s2 does not count until it does.')
    expect(html).toContain('data-rule="verdict"')
    expect(html).toMatch(/role="status" aria-live="polite">Kept in your record\. Not counted\.<\/p>/)
  })

  test('offers another file and a way to clear the result, as a refused file does', () => {
    const html = panel(kept())
    expect(text(html)).toContain('Choose another file')
    expect(text(html)).toContain('Clear this')
  })

  test('says "Checked again" for a receipt that was in the ledger already, and that only this check is added', () => {
    const again = panel(kept({ recheck: true }))
    expect(again).toMatch(/<h3[^>]*>Checked again<\/h3>/)
    expect(text(again)).toContain('This result was in your record already. This check is added to it, and nothing else is written.')
  })

  test('says the reason when the receipt failed a rule after it was read: kept, labelled, and why', () => {
    const state = kept({ rules: unbound.rules, verdict: unbound.verdict, sha256: unbound.receiptSha256 })
    const page = panel(state)
    expect(page).toContain('data-status="fail" data-rule="binding"')
    expect(text(page)).toContain("This browser's ledger holds no challenge with this token.")
    expect(text(page)).toContain('not counted')
  })
})

describe('the slip, when the check broke or the ledger would not take the receipt', () => {
  test('says why in the red line, keeps nothing, and offers another try', () => {
    const html = panel({ step: 'failed', file: FILE, message: 'The check took longer than 120 seconds, so it was stopped. Nothing was kept.' })
    expect(html).toMatch(/<h3[^>]*>Not kept<\/h3>/)
    expect(text(html)).toContain('The check took longer than 120 seconds, so it was stopped. Nothing was kept.')
    expect(text(html)).toContain('Choose another file')
    expect(html).not.toContain('class="es-rules"')
  })

  test('lists the rules when the file was checked and the ledger refused it', () => {
    const html = panel({ step: 'failed', file: FILE, message: 'This tab is read-only.', rules: good.rules })
    expect([...html.matchAll(/data-rule="(\w+)"/g)]).toHaveLength(9)
  })
})

describe('what a file puts on the page', () => {
  test('is text: a file name and the sentences a rule quotes carry no markup', () => {
    const name = '<img src=x onerror=alert(1)>.es.json.gz'
    const html = panel({ step: 'checking', file: { name, bytes: 10 } })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;.es.json.gz')
    const rules = [{ rule: 2, id: 'schema' as const, status: 'fail' as const, summary: '<script>alert(2)</script>', problems: ['<b onmouseover=alert(3)>x</b>'] }]
    const list = render(createElement(RuleList, { rules, label: 'Rules' }))
    expect(list).not.toContain('<script>')
    expect(list).not.toContain('<b onmouseover')
    expect(list).toContain('&lt;script&gt;alert(2)&lt;/script&gt;')
  })
})

describe('a receipt\'s page, with the checks it has had', () => {
  const record = sampleRecord()
  const held = readReceipt(record)
  if (!held.ok) throw new Error('the sample receipt was not read')
  const report = (at: string, rules = good.rules): VerificationReport => ({ at, report: JSON.parse(JSON.stringify(storedReport(rules, good.sizes))) as VerificationReport['report'] })
  const page = (reports: VerificationReport[]): string => render(createElement(ReceiptDetail, { held: { ...held, reports }, challenges: [] }))

  test('lists the rules of the newest check, open, with the verdict as the tenth, and what they came to', () => {
    const html = page([report('2026-11-09T12:00:00.000Z')])
    expect(text(html)).toContain('Checked 9 Nov 2026, 12:00')
    expect(html).toContain('aria-label="How this browser checked the receipt, 9 Nov 2026, 12:00"')
    expect([...html.matchAll(/data-rule="(\w+)"/g)].map((match) => match[1])).toEqual(['caps', 'schema', 'integrity', 'binding', 'grader', 'pins', 'rechecks', 'recomputation', 'floors', 'verdict'])
    expect(text(html)).not.toContain('of the ten verification rules ran in this check')
    expect(text(html)).toContain('not counted')
    expect(text(html)).not.toContain('Not checked in this browser yet')
  })

  test('shows the verdict check by check, each with its bound and who checked it: re-checked here, or attested by the grader', () => {
    const html = page([report('2026-11-09T12:00:00.000Z')])
    const items = [...html.matchAll(/<li class="es-check" data-status="(\w+)" data-check="([\w-]+)" data-how="([\w-]+)">/g)].map((match) => `${match[2]}:${match[1]}:${match[3]}`)
    expect(items).toContain('T2:pass:re-checked')
    expect(items).toContain('X1:fail:re-checked')
    expect(items).toContain('teacher-forced:fail:attested')
    expect(items).toContain('agreement:attested:attested')
    expect(text(html)).toContain('re-checked here')
    expect(text(html)).toContain('attested by grader 0.1.0')
  })

  test('says how many rules ran when an earlier build made the check: six, and the learner is asked to bring the file back', () => {
    const six = storedReport(good.rules.slice(0, 6), good.sizes)
    const older = { ...JSON.parse(JSON.stringify(six)), ran: 6 } as VerificationReport['report']
    const html = page([{ at: '2026-11-09T12:00:00.000Z', report: older }])
    expect(html).toMatch(/<data class="es-readout__value" value="6">6<\/data>.*?of the ten verification rules ran in this check/s)
    expect(text(html)).toContain("Bring the receipt's file back, and all of them run.")
    expect(text(html)).toContain('This check was made by an earlier version of the site that ran 6 of the 10 rules.')
  })

  test('folds the earlier checks under the time they were made, newest first', () => {
    const html = page([report('2026-11-08T09:00:00.000Z'), report('2026-11-09T12:00:00.000Z', unbound.rules), report('2026-11-07T08:00:00.000Z')])
    expect([...html.matchAll(/Checked <time dateTime="([^"]+)">/g)].map((match) => match[1])).toEqual(['2026-11-09T12:00:00.000Z', '2026-11-08T09:00:00.000Z', '2026-11-07T08:00:00.000Z'])
    expect([...html.matchAll(/<details class="es-receipt__earlier">/g)]).toHaveLength(2)
    // The newest check is the one that failed binding, and it is open: its failure is in the page outside any fold.
    const open = html.slice(0, html.indexOf('<details'))
    expect(open).toContain('data-status="fail" data-rule="binding"')
  })

  test('says so when a report is one this build cannot read, and still says when it was made', () => {
    const html = page([{ at: '2026-11-09T10:00:00.000Z', report: { checks: [] } }])
    expect(text(html)).toMatch(/Checked 9 Nov 2026, 10:00\s*\. A check that a version of the site wrote, and this one cannot read\./)
  })

  test('says a receipt that was never checked here is not checked, and how to have it checked', () => {
    expect(text(page([]))).toContain('Not checked in this browser yet.')
  })
})

describe('the list of receipts, in a word', () => {
  const unchecked = sampleRecord()
  const checkedGood = { ...sampleRecord((r) => (r.createdAt = '2026-11-01T00:00:00Z')), reports: [{ at: '2026-11-09T12:00:00.000Z', report: JSON.parse(JSON.stringify(storedReport(good.rules))) as VerificationReport['report'] }] }
  const odd = { ...sampleRecord((r) => (r.createdAt = '2026-11-02T00:00:00Z')), reports: [{ at: '2026-11-09T10:00:00.000Z', report: { checks: [] } }] }
  const html = render(createElement(ReceiptList, { held: heldReceipts([unchecked, checkedGood, odd, { sha256: sha256('x'), receipt: { schema: 'else' }, reports: [] }]) }))
  const words = [...html.matchAll(/class="es-plain-label es-held__worth"[^>]*>.*?<span class="es-plain-label__text">([^<]+)<\/span>/g)].map((match) => match[1])

  test('names what the latest check made of each receipt, and that one was never checked', () => {
    // Newest first: the sample (9 Nov, never checked), the one checked and not credited, and the one whose report this build cannot read, which has no word.
    expect(words).toEqual(['unchecked', 'not counted'])
  })
})
