/*
 * W2-T06: the words of /receipts (src/receipts/copy.ts), held to what they claim.
 *
 *   - The lead is the sentence of the page's served document (scripts/pages/plan.ts), and the document's heading is the page's, so the
 *     tab and the heading do not change when the app takes over (WCAG 2.4.2).
 *   - No number is in a sentence without a tag (rule 7): a wave, a task and a lab are identifiers, and the 14 days of a token's life, and the caps
 *     of the slip, are readouts that are tagged [estimated], which the markup tests find.
 *   - The tracker's W2-T06 is about this page, and its W2-T07 is about the slip that takes a receipt back, in the words the copy uses for it.
 *   - The 14 days that the page says are ARCHITECTURE §8.4's and ASSESSMENT §5.3's.
 */
import { describe, expect, test } from 'bun:test'
import { untaggedNumbers } from '../../scripts/content/prose'
import { planPages } from '../../scripts/pages/plan'
import type { Page, Written } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import { CHALLENGE_TTL_DAYS } from '@/receipts/challenge'
import { IMPORT, LEAD, receiptsCopy, REPORTS, stageNote, VERDICT_WORDS } from '@/receipts/copy'
import { RECEIPT_STAGES } from '@/receipts/labs'
import { routes } from '@/routes'
import { read, trackerTasks } from '../ci/support'

const tasks = trackerTasks()
const plan = planPages(routes, loadSources())
const documentOf = (url: string): Written => {
  const page: Page | undefined = plan.pages.find((candidate) => candidate.url === url)
  if (page === undefined || page.keep) throw new Error(`the plan has no document of its own for ${url}`)
  return page
}

describe('the lead', () => {
  test("is the served document's description, and the document is headed as the page is", () => {
    expect(documentOf('/receipts')).toMatchObject({ heading: 'GPU lab results', description: LEAD })
  })

  test('says what the page does and that nothing leaves the browser, and holds no number', () => {
    expect(LEAD).toMatch(/challenge/)
    expect(LEAD).toMatch(/receipt file/)
    expect(LEAD).toMatch(/Nothing here is sent anywhere/)
    expect(untaggedNumbers(LEAD)).toEqual([])
  })
})

describe('the copy', () => {
  test('holds no number that no tag covers: a wave, a task and a lab are identifiers', () => {
    expect(receiptsCopy().length).toBeGreaterThan(40)
    expect(receiptsCopy().flatMap((sentence) => untaggedNumbers(sentence))).toEqual([])
  })

  test('says nothing of a licence for the site\'s own code and content: that is the owner\'s to decide (O-3)', () => {
    expect(receiptsCopy().join(' ')).not.toMatch(/\bMIT\b|CC BY|all rights reserved|\bGPL\b|\bBSD\b|Apache/i)
  })

  test('has a note for every stage that a lab lists: where it runs, and that the module can do without it when it can', () => {
    for (const stage of RECEIPT_STAGES) {
      const note = stageNote(stage.id)
      expect(note, stage.id).toMatch(/^It (runs on your laptop's CPU|needs a GPU, yours or a rented one)\./)
      expect(note.includes('The module does not need it.'), stage.id).toBe(stage.optional)
    }
    expect(stageNote('tr9.later.s1')).toBe('')
    expect(stageNote('')).toBe('')
  })
})

describe('the slip that takes a receipt back', () => {
  test("is the tracker's W2-T07, by the words of its goal: a drop or a file picker, and the parsed receipt and its report stored", () => {
    const task = tasks.get('W2-T07') ?? ''
    expect(task.split('\n', 1)[0]).toContain('Receipt worker and import')
    expect(task).toContain('Import works by drop or by file picker')
    expect(task).toContain('the parsed receipt and its report are stored')
    expect(IMPORT.title).toBe('Bring a result back')
    expect(IMPORT.dropNote).toMatch(/Drop it here, or choose it\./)
  })

  test('is in the lead, which the served document says too', () => {
    expect(LEAD).toMatch(/bring back the receipt file that your grader writes/)
    expect(LEAD).toMatch(/how this browser checked it/)
  })

  test('says a receipt does not count yet in words a learner reads, and names no number', () => {
    expect(VERDICT_WORDS['gpu-unverified']).toBe('not counted')
    expect(VERDICT_WORDS.unchecked).toBe('unchecked')
    expect(REPORTS.none).toContain('Not checked in this browser yet')
    for (const sentence of [...Object.values(IMPORT), ...Object.values(REPORTS), ...Object.values(VERDICT_WORDS)]) expect(untaggedNumbers(sentence)).toEqual([])
  })

  test('has no part that says it is not built: the page is whole', () => {
    expect(receiptsCopy().join(' ')).not.toMatch(/not built|still to come|arriving with/i)
  })
})

describe("a token's life", () => {
  test("is the 14 days of ARCHITECTURE §8.4 and ASSESSMENT §5.3, which both call it an estimate", () => {
    expect(CHALLENGE_TTL_DAYS).toBe(14)
    expect(read('docs/ARCHITECTURE.md')).toMatch(/expires after 14 days \[estimated\]/)
    expect(read('docs/ASSESSMENT.md')).toMatch(/expires after 14 days \[estimated\]/)
  })
})
