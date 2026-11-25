/*
 * W2b-T96: the word of TR3's one written form is read from one key, `GAP_WORD` of src/copy/terms.ts (TR3's design, "Before you
 * write", items 2 and 3; content/README.md rule 11). The build takes "CPU gap" as the default and the owner may overturn it (N2). The
 * form, the `attribute` goal line and TR3's item stems read the key, and every other place that states the word is held here to it, so
 * an answer that moves the key fails on each place still to move:
 *
 *   - the key has its row in the terms table, marked as the course's own word, and its definition says it is the bubble as a trace
 *     shows it; "bubble" keeps its own row, TR2's coined word, unrenamed;
 *   - the form, written once in TR3's design, is `step time = GPU-busy + <the word> + both idle`, and its words are the trace model's;
 *   - the viewer's category word, the game's subtitle (roster and GAMES.md §2.6) and the `tr3.partition` KC use the key's word;
 *   - content/README.md rule 11 and the tracker's W2-T20 say the build takes it as the default and the owner may overturn it.
 */
import { describe, expect, test } from 'bun:test'
import { rosterEntry } from '@es/play/roster'
import { GAP_WORD, termOf } from '@/copy/terms'
import { CATEGORY_WORDS } from '@/trace/marks'
import { between, read } from '../ci/support'

const brief = read('curriculum/TR3-profile-a-real-engine.md')
const design = between(brief, '## Before you write (rewritten 2026-11-22)', '### The book')

describe("the word of TR3's form", () => {
  test('is one key with its row in the terms table: the course\'s own word, defined as the bubble seen in a trace', () => {
    expect(GAP_WORD.length).toBeGreaterThan(0)
    const row = termOf(GAP_WORD)
    expect(row?.source).toBe('course')
    expect(row?.coined).toBe(true)
    expect(row?.definition).toContain('bubble')
    expect(row?.definition).toContain('trace')
    // "Bubble" is TR2's coined word and stays as it is.
    expect(termOf('bubble')?.coined).toBe(true)
    expect(termOf('bubble')?.definition).toBe('Time the GPU sits idle while the CPU prepares the next step.')
  })

  test("is the form's word: the form is written once in TR3's design, in a text block, from the key", () => {
    const form = `step time = GPU-busy + ${GAP_WORD} + both idle`
    expect(design).toContain(`\`\`\`text\n   ${form}\n   \`\`\``)
    expect(brief.split('```text').length - 1).toBe(1)
    // The design names the key, so an author looks the word up there.
    expect(design).toContain('`GAP_WORD`')
  })

  test("is the trace model's and the viewer's word, the game's subtitle's, and the partition KC's", () => {
    expect(CATEGORY_WORDS['cpu-gap'].term).toBe(GAP_WORD)
    expect(rosterEntry('gap-hunt')?.subtitle).toContain(GAP_WORD)
    const games = read('docs/GAMES.md')
    expect(between(games, '#### Trace attribution (`gap-hunt`)', '#### Backend dispatch')).toContain(`"${GAP_WORD}" is the trace model's word`)
    const graph = read('content/kc/graph.yaml')
    expect(between(graph, '- id: tr3.partition', '- id: tr3.gap-cause')).toContain(GAP_WORD)
  })

  test("is the build's default, which the owner may overturn, in the authoring rules and the tracker", () => {
    const rule = between(read('content/README.md'), '11. **Write one form per module.**', '12. **Keep four sentence rules.**')
    expect(rule).toContain(`The build takes "${GAP_WORD}" as the default for TR3's form; the owner may overturn it`)
    expect(rule).toContain('`GAP_WORD`')
    const tracker = read('docs/TRACKER.md')
    const t20 = between(tracker, '#### [ ] W2-T20 · ', '#### [ ] W2-T21 · ')
    expect(t20).toContain(`the build takes "${GAP_WORD}" as the default; the owner may overturn it`)
  })

  test('is not said to be chosen by the owner, in any of the places that state it', () => {
    const places = [design, read('content/README.md'), read('src/copy/terms.ts'), between(read('docs/TRACKER.md'), '#### [ ] W2-T20 · ', '#### [ ] W2-T21 · ')]
    for (const text of places) expect(/owner (chose|decided|approved|settled)/i.test(text)).toBe(false)
  })
})
