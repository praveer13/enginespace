/*
 * W2-T06: the words of /receipts (src/receipts/copy.ts), held to what they claim.
 *
 *   - The lead is the sentence of the page's served document (scripts/pages/plan.ts), and the document's heading is the page's, so the
 *     tab and the heading do not change when the app takes over (WCAG 2.4.2).
 *   - No number is in a sentence without a tag (rule 7): a wave, a task and a lab are identifiers, and the 14 days of a token's life are a
 *     readout that is tagged [estimated], which the markup tests find.
 *   - The part that is still to come names a task that exists, in the wave it says, whose tracker line is about it, and the tracker's
 *     W2-T06 is about this page.
 *   - The 14 days that the page says are ARCHITECTURE §8.4's and ASSESSMENT §5.3's.
 */
import { describe, expect, test } from 'bun:test'
import { untaggedNumbers } from '../../scripts/content/prose'
import { planPages } from '../../scripts/pages/plan'
import type { Page, Written } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import { CHALLENGE_TTL_DAYS } from '@/receipts/challenge'
import { COMING, LEAD, receiptsCopy, stageNote, waveOf } from '@/receipts/copy'
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
    expect(documentOf('/receipts')).toMatchObject({ heading: 'Receipts', description: LEAD })
  })

  test('says what the page does and that nothing leaves the browser, and holds no number', () => {
    expect(LEAD).toMatch(/challenge/)
    expect(LEAD).toMatch(/receipts/)
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

describe('the part that is still to come', () => {
  test('names a task of the tracker, in the wave it says, and the tracker\'s line for it is about the import', () => {
    expect(COMING.tasks).toEqual(['W2-T07'])
    for (const task of COMING.tasks) {
      expect(tasks.has(task), `${task} is in docs/TRACKER.md`).toBe(true)
      expect(waveOf(task)).toBe('W2')
    }
    expect(tasks.get('W2-T07')?.split('\n', 1)[0]).toContain(COMING.about)
    expect(tasks.get('W2-T07')).toContain('Import works by drop or by file picker')
  })

  test("is the tracker's W2-T06 that this page builds: its line is about /receipts, a challenge and the list of receipts", () => {
    const task = tasks.get('W2-T06') ?? ''
    expect(task.split('\n', 1)[0]).toContain('`/receipts`')
    expect(task).toContain('issue a token')
    expect(task).toContain('open a receipt\'s detail at `#<sha256>`')
  })

  test('is a wave that the page says in its foot: the wave of the task', () => {
    expect(waveOf(COMING.tasks[0])).toBe('W2')
  })
})

describe("a token's life", () => {
  test("is the 14 days of ARCHITECTURE §8.4 and ASSESSMENT §5.3, which both call it an estimate", () => {
    expect(CHALLENGE_TTL_DAYS).toBe(14)
    expect(read('docs/ARCHITECTURE.md')).toMatch(/expires after 14 days \[estimated\]/)
    expect(read('docs/ASSESSMENT.md')).toMatch(/expires after 14 days \[estimated\]/)
  })
})
