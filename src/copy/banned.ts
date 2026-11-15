/**
 * The copy guard's data, and the guard (REDESIGN §2.7, D-063): the kitchen words that no learner reads, and the phrases that are banned
 * in their kitchen sense, each with the contexts in which the same words stay allowed.
 *
 * The guard reads rendered text and the compiled sources of rendered text, never a raw source file, so an id or an enum value inside
 * state (`plate`, `Rotation`) never trips it (REDESIGN §2.7, policy 7). Code spans are skipped: a backticked identifier is the pinned
 * source's spelling, not the course's word. tests/copy/no-kitchen.test.ts runs it over the copy tables, the terms, the compiled lessons,
 * the Markdown export, llms.txt, the item stems and the predictions' sentences, and the e2e scan runs it over rendered routes.
 *
 * The guard cannot catch a kitchen sentence that uses none of these words. A second reader still reads each edited page.
 */

/** Banned everywhere, as a whole word in any case (REDESIGN §2.7). A hyphen bounds a word, so `dish-by-dish` is caught. */
export const BANNED_WORDS: readonly string[] = [
  'allergy',
  'basement',
  'bell',
  'binned',
  'burner',
  'chef',
  'chit',
  'clip',
  'clips',
  'clipboard',
  'comb',
  'commis',
  'cook',
  'cooks',
  'cooler',
  'copier',
  'court',
  'dish',
  'dishes',
  'dumbwaiter',
  'expediter',
  'expo',
  'fire',
  'fired',
  'fires',
  'firing',
  'fryer',
  'griddle',
  'groove',
  'guest',
  'guests',
  'inspector',
  'kitchen',
  'lamp',
  'lamps',
  'mise',
  'mold',
  'molds',
  'oven',
  'ovens',
  'pan',
  'pans',
  'par',
  'plate',
  'plated',
  'plates',
  'printer',
  'rail',
  'reach-in',
  'recipe',
  're-plate',
  're-plating',
  'ruling',
  'specials',
  'station',
  'stations',
  'stopwatch',
  'stove',
  'tape',
  'tasting',
  'ticket',
  'tickets',
  'tray',
  'twine',
  'walk-in',
  'walk-ins',
]

/**
 * A phrase banned in its kitchen sense. `text` is the phrase as the brief writes it, matched as a whole phrase in any case, with any run
 * of spaces between its words; `pattern`, where given, replaces that match (a capital that matters, a mark that ends the phrase).
 */
export interface BannedPhrase {
  readonly text: string
  readonly pattern?: RegExp
}

/** One row of the brief's table: the phrases banned in the kitchen sense, and the contexts in which their words stay allowed. */
export interface PhraseRow {
  readonly banned: readonly BannedPhrase[]
  /**
   * What stays allowed. A context longer than any banned phrase of its row is blanked out before the row is checked ("the pass rule"
   * keeps "the pass" from matching); a context the banned phrase itself contains ("pass" in "the pass") is a reminder that the word
   * alone was never banned.
   */
  readonly allowed: readonly string[]
}

const p = (text: string, pattern?: RegExp): BannedPhrase => (pattern === undefined ? { text } : { text, pattern })

export const BANNED_PHRASES: readonly PhraseRow[] = [
  { banned: [p('the pass'), p('at the pass'), p('The Pass')], allowed: ['pass', 'passed', 'passes at', 'forward pass', 'pass rule'] },
  { banned: [p('the line ·', /(?<![\p{L}\p{N}])the line ·/iu), p('on the line'), p("the line's"), p('line cook')], allowed: [] },
  { banned: [p('the house'), p('house run'), p('two houses')], allowed: [] },
  { banned: [p('a floor'), p('floors of'), p('floor plan')], allowed: ['noise floor'] },
  {
    // "table A", with any capital after it: the pool's old name for a conversation. The capital is what makes it a name.
    banned: [p('table A', /(?<![\p{L}\p{N}])[Tt][Aa][Bb][Ll][Ee] [A-Z](?![\p{L}\p{N}])/u), p('each table'), p("a table's"), p('set of tables')],
    allowed: ['block table', 'as a table', 'the table below'],
  },
  { banned: [p('standing order'), p('Order Window'), p('the order was taken'), p('writing the order')], allowed: ['in order', 'eviction order', 'stride order'] },
  { banned: [p('ticket window'), p('window shelf'), p('hold window')], allowed: ['sliding window', 'context window'] },
  { banned: [p('First service'), p('the full service'), p('START SERVICE'), p('serve the night')], allowed: ['serving', 'served'] },
  { banned: [p('each course'), p('a course takes'), p('per course'), p('courses out')], allowed: ['the course', 'Course'] },
  { banned: [p('on the board')], allowed: [] },
  { banned: [p('the menu'), p('set menu')], allowed: [] },
  { banned: [p('the night'), p('a night')], allowed: [] },
  { banned: [p('dark stretch'), p('go dark')], allowed: [] },
  { banned: [p('hang a'), p('it hangs'), p('hung on the')], allowed: [] },
  { banned: [p('dump the'), p('dumps the'), p('dumping a')], allowed: ['core dump'] },
  { banned: [p('a spike'), p('the spike')], allowed: ['latency spike', 'traffic spike', 'load spike'] },
  { banned: [p('prep list'), p('re-prep'), p('start the prep')], allowed: [] },
  // The Mirror was the progress page's name; the DOM mirror of a diagram keeps its lower-case name.
  { banned: [p('the Mirror', /(?<![\p{L}\p{N}])[Tt]he Mirror(?![\p{L}\p{N}])/u)], allowed: [] },
  { banned: [p('Heard!', /(?<![\p{L}\p{N}])Heard!/iu)], allowed: [] },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The guard                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A banned word or phrase found in a text: what matched, and the word or phrase of the lists it matched. */
export interface Finding {
  readonly kind: 'word' | 'phrase'
  readonly rule: string
  readonly match: string
  readonly index: number
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A whole-word, any-case pattern for a word or a phrase, with any run of spaces between its words. */
const wholePattern = (text: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${text.split(/\s+/).map(escape).join('\\s+')}(?![\\p{L}\\p{N}])`, 'giu')

const WORD_PATTERNS: readonly (readonly [string, RegExp])[] = BANNED_WORDS.map((word) => [word, wholePattern(word)])

interface CompiledRow {
  readonly banned: readonly (readonly [string, RegExp])[]
  readonly masks: readonly RegExp[]
}

const ROWS: readonly CompiledRow[] = BANNED_PHRASES.map((row) => {
  const lower = row.banned.map((phrase) => phrase.text.toLowerCase())
  return {
    banned: row.banned.map((phrase) => [phrase.text, phrase.pattern === undefined ? wholePattern(phrase.text) : new RegExp(phrase.pattern.source, `${phrase.pattern.flags.replace('g', '')}g`)] as const),
    masks: row.allowed.filter((context) => !lower.some((banned) => banned.includes(context.toLowerCase()))).map(wholePattern),
  }
})

/** Code spans and fenced code blocks, which the guard skips: they hold identifiers, spelled as the pinned source spells them. */
export function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, (block) => ' '.repeat(block.length)).replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length))
}

/** Blanks every match of `pattern` with spaces of the same length, so that the indices of what is left stay where they were. */
const blank = (text: string, pattern: RegExp): string => text.replace(pattern, (m) => ' '.repeat(m.length))

/** Every banned word and every phrase banned in its kitchen sense in `text`, outside its code spans, in the order they occur. */
export function findBanned(text: string): Finding[] {
  const prose = stripCode(text)
  const found: Finding[] = []
  for (const [word, pattern] of WORD_PATTERNS) {
    for (const m of prose.matchAll(pattern)) found.push({ kind: 'word', rule: word, match: m[0], index: m.index })
  }
  for (const row of ROWS) {
    const checked = row.masks.reduce(blank, prose)
    // A row can list one phrase twice in two cases ("the pass", "The Pass"): a span of the text is found once, by the first.
    const seen = new Set<string>()
    for (const [rule, pattern] of row.banned) {
      for (const m of checked.matchAll(pattern)) {
        const span = `${m.index}:${m[0].length}`
        if (seen.has(span)) continue
        seen.add(span)
        found.push({ kind: 'phrase', rule, match: m[0], index: m.index })
      }
    }
  }
  return found.sort((a, b) => a.index - b.index || a.rule.localeCompare(b.rule))
}

/** Whether `text` reads clean: no banned word and no banned phrase outside its code spans. */
export const isClean = (text: string): boolean => findBanned(text).length === 0
