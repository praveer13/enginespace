/*
 * W0-T05, accept 6: the direction contract lives in the front page's surface brief and nowhere that ships. Its block
 * labels appear in no file under src/ or public/, nor in index.html (D-047; impeccable's new-work §5).
 *
 * R-T01: the brief's contract is Data Book's (D-062). The Pass's stays below it, marked superseded, until the owner's look gate.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const LABELS = ['THESIS:', 'OWN-WORLD:', 'STORY:', 'FIRST VIEWPORT:', 'FORM:', 'FINISH:']
const BRIEF = '.impeccable/surfaces/src-front-frontpage-tsx.md'

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(full) : [full]
  })
}

/** The labels a file's bytes contain, read as Latin-1 so a binary file is searched too. */
const labelsIn = (file: string) => {
  const text = readFileSync(file).toString('latin1')
  return LABELS.filter((label) => text.includes(label))
}

describe('the direction contract stays in its brief', () => {
  test('the brief carries every label, so the search below would find a leak', () => {
    expect(labelsIn(path.join(root, BRIEF))).toEqual(LABELS)
  })

  test("the brief's direction contract is Data Book's, with every label, and The Pass's follows it marked superseded", () => {
    const brief = readFileSync(path.join(root, BRIEF), 'utf8')
    const contract = brief.slice(brief.indexOf('## Direction contract\n'), brief.indexOf("## The Pass's contract, superseded\n"))
    expect(contract.startsWith('## Direction contract\n')).toBe(true)
    expect(contract).toContain('Data Book (D-062')
    for (const label of LABELS) expect([label, contract.includes(`\n${label}`)]).toEqual([label, true])
    expect(contract).not.toContain('line kitchen')
    const pass = brief.slice(brief.indexOf("## The Pass's contract, superseded\n"))
    expect(pass).toContain('D-062')
    expect(pass).toContain('THESIS: Continuous batching is a line kitchen')
  })

  test('no file under src/ or public/, nor index.html, carries a label', () => {
    const files = [...filesUnder(path.join(root, 'src')), ...filesUnder(path.join(root, 'public')), path.join(root, 'index.html')]
    expect(files.length).toBeGreaterThan(20)
    const leaks = files.flatMap((file) => labelsIn(file).map((label) => `${path.relative(root, file)}: ${label}`))
    expect(leaks).toEqual([])
  })
})
