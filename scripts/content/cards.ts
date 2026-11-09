/*
 * Notional-machine cards (ARCHITECTURE §5.9, D-012): the files of `content/cards/`, read.
 *
 * A card is prose and nothing else: front matter, a few words that say what the world is, and three parts under `##` headings,
 * in this order: Models, Ignores and Calibrated against. The compiler reads a card's words as it reads a lesson's (the same
 * token tree, the same number gate, the same `{{claim:id}}` references), and adds what makes a card a card:
 *   - the file's name is the card's id, and the front matter is `cardFrontMatterSchema`;
 *   - the three parts are all there, once each, in order, and none is empty;
 *   - the card cites at least one claim, and every claim it cites exists (W1-T07, "every card cites claim ids");
 *   - each rule under Models says where it comes from: a claim, for a fact about the world's source, or the decision or design
 *     section that made the rule the course's own (`D-044`, `A§5.3`, `WORLD §2.6`). A rule with none is a rule nobody can check.
 *
 * `compileCard` takes the file's text and reports every problem with its line. It reads no file, so the tests and
 * `verify:games` can hand it a card held in memory.
 */
import { getDefaults, Lexer } from 'marked'
import type { Tokens } from 'marked'
import { CARD_PARTS, cardFrontMatterSchema } from '../../packages/schema/content.ts'
import type { CardFrontMatter } from '../../packages/schema/content.ts'
import type { ProseFlow } from '../../packages/schema/compiled.ts'
import { slugSchema } from '../../packages/schema/refs.ts'
import { locate, parseContentFile, problem, schemaDiagnostics } from './parse.ts'
import type { Diagnostic, ProseSegment } from './parse.ts'
import { compileProse, numberMessage, untaggedNumbers, withoutCode } from './prose.ts'
import type { ProseContext } from './prose.ts'

/** Keys the compiler writes itself, which an author must not. */
const COMPILER_KEYS = { rev: 'the compiler adds rev, a SHA-256 over the authored fields, the words and the claims the card cites' } as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* Splitting a card into its parts                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A run of a card's Markdown under one `##` heading. The words before the first heading are the card's intro, which has no name. */
export interface Chunk {
  /** The heading's words, or null for the intro. */
  name: string | null
  /** The line of the heading, or of the intro's first line. */
  headingLine: number
  /** The line of the first line of `md`. */
  firstLine: number
  md: string
}

const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})/
const CLOSE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/
/** A part's heading is exactly two hashes, a space and words: a `###` is inside a part. */
const PART_HEADING = /^##[ \t]+(.*\S)[ \t]*$/

/**
 * Splits the prose segments of a card at its `##` headings, outside fenced code. Each heading starts a chunk that runs to the
 * next one, and the lines before the first heading are the intro. The heading line itself is not part of any chunk's Markdown.
 */
export function splitCard(segments: readonly ProseSegment[]): Chunk[] {
  const chunks: Chunk[] = []
  let current: { name: string | null; headingLine: number; firstLine: number; lines: string[] } | null = null
  let fence: { char: string; length: number } | null = null
  const flush = () => {
    if (current !== null) chunks.push({ name: current.name, headingLine: current.headingLine, firstLine: current.firstLine, md: current.lines.join('\n') })
    current = null
  }
  for (const segment of segments) {
    segment.md.split('\n').forEach((text, index) => {
      const line = segment.line + index
      if (fence !== null) {
        const close = CLOSE_FENCE.exec(text)
        if (close !== null && close[1][0] === fence.char && close[1].length >= fence.length) fence = null
      } else {
        const open = OPEN_FENCE.exec(text)
        if (open !== null && !(open[1][0] === '`' && text.slice(open[0].length).includes('`'))) fence = { char: open[1][0], length: open[1].length }
        else {
          const heading = PART_HEADING.exec(text)
          if (heading !== null) {
            flush()
            current = { name: heading[1], headingLine: line, firstLine: line + 1, lines: [] }
            return
          }
        }
      }
      current ??= { name: null, headingLine: line, firstLine: line, lines: [] }
      current.lines.push(text)
    })
  }
  flush()
  return chunks
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The rules under Models                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What makes a rule sourced: a claim reference, for a fact about the engine or the paper it follows; or a decision record (`D-044`) or
 * a design section (`A§5.3`, `WORLD §2.6`, `GAMES.md §3.1`, `ASSESSMENT §4.3`) that made the rule the course's own.
 */
const SOURCED = /\{\{\s*claim:|\bD-\d{3}\b|\bA§\d|\b(?:WORLD|GAMES|ASSESSMENT)(?:\.md)? §\d/

const newlines = (text: string): number => text.match(/\n/g)?.length ?? 0

/**
 * The rules of a Models part: the items of its lists, and the line of each that names no source. `lists` counts the lists, so a
 * Models part that is all paragraphs can be told from one whose every rule is sourced. `first` is the line of the Markdown's first line.
 */
export function unsourcedRules(md: string, first: number): { lists: number; rules: number; unsourced: number[] } {
  const tokens = Lexer.lex(md, { ...getDefaults(), gfm: true, breaks: false, pedantic: false })
  const unsourced: number[] = []
  let lists = 0
  let rules = 0
  let at = first
  for (const token of tokens) {
    const start = at
    at += newlines(token.raw)
    if (token.type !== 'list') continue
    lists += 1
    let itemAt = start
    for (const item of (token as Tokens.List).items) {
      rules += 1
      if (!SOURCED.test(item.raw)) unsourced.push(itemAt)
      itemAt += newlines(item.raw)
    }
  }
  return { lists, rules, unsourced }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Compiling a card                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The words of a compiled card: what comes before the first part, then the three parts. */
export interface CardWords {
  intro: ProseFlow[]
  models: ProseFlow[]
  ignores: ProseFlow[]
  calibrated: ProseFlow[]
}

export interface CardResult {
  /** The file, relative to the repository's root. */
  file: string
  front: CardFrontMatter
  words: CardWords
  /** The claims the card cites. */
  cited: ReadonlySet<string>
}

const list = (words: readonly string[]): string => words.join(', ')

/** What an empty part is asked to say. */
const EMPTY_PART: Readonly<Record<string, string>> = {
  Models: 'list the rules the world follows, each with its source',
  Ignores: 'list what the world leaves out',
  'Calibrated against': 'name the claims or fits it was checked against, or say "nothing yet"',
}

/**
 * Compiles one card file. `file` is its path from the repository's root, and its name fixes the card's id. `claims` holds the
 * ids of the claims that exist. Every problem goes to `out` with its line, and the result is null when the card cannot be
 * used: the front matter is wrong, or a part is missing or empty.
 */
export function compileCard(file: string, source: string, claims: ReadonlySet<string>, out: Diagnostic[]): CardResult | null {
  const stem = file.slice(file.lastIndexOf('/') + 1).replace(/\.md$/, '')
  if (!slugSchema.safeParse(stem).success) {
    out.push(problem('content', 'error', 'bad-file-name', file, 1, `a card file is named like trace-room-steploop.md: lowercase words joined by hyphens, which are the card's id`))
  }

  const parsed = parseContentFile(file, source, out)
  if (parsed === null) return null
  let usable = true

  let front: CardFrontMatter | undefined
  if (parsed.frontMatter !== undefined) {
    const result = cardFrontMatterSchema.safeParse(parsed.frontMatter)
    if (result.success) front = result.data
    else {
      out.push(
        ...schemaDiagnostics(result.error.issues, {
          file,
          text: parsed.frontMatterText,
          firstLine: parsed.frontMatterLine,
          gate: 'content',
          subject: 'a card',
          allowedKeys: Object.keys(cardFrontMatterSchema.shape),
          hints: COMPILER_KEYS,
        }),
      )
    }
  }
  if (front === undefined) usable = false
  const frontLines = parsed.frontMatterText.split('\n')
  const frontLine = (key: string): number => parsed.frontMatterLine + locate(frontLines, [key])
  if (front !== undefined) {
    if (front.id !== stem) {
      out.push(problem('content', 'error', 'id-mismatch', file, frontLine('id'), `the file ${stem}.md is the card "${stem}", and its id says "${front.id}"`))
      usable = false
    }
    for (const finding of untaggedNumbers(withoutCode(front.title))) out.push(problem('numbers', 'error', 'untagged-number', file, frontLine('title'), numberMessage(finding)))
  }

  for (const segment of parsed.segments) {
    if (segment.kind === 'directive') {
      out.push(problem('content', 'error', 'card-directive', file, segment.line, `a card is prose: :::${segment.name} does not belong in it`))
    }
  }
  const prose = parsed.segments.filter((segment): segment is ProseSegment => segment.kind === 'prose')
  const chunks = splitCard(prose)
  /** Where a problem with the card as a whole goes: its first part's heading, or the line after the front matter. */
  const afterFront = parsed.frontMatterLine + frontLines.length + 1
  const parts = chunks.filter((chunk) => chunk.name !== null)

  const names = parts.map((chunk) => chunk.name as string)
  if (names.length !== CARD_PARTS.length || names.some((name, index) => name !== CARD_PARTS[index])) {
    const lacking = CARD_PARTS.filter((part) => !names.includes(part))
    const said = names.length === 0 ? 'it has none' : `it has ${list(names)}`
    const why = lacking.length > 0 ? `${list(lacking)} ${lacking.length === 1 ? 'is' : 'are'} missing` : 'they are repeated or out of order'
    out.push(
      problem('content', 'error', 'card-parts', file, parts[0]?.headingLine ?? afterFront, `a notional-machine card has three parts, under ## headings and in this order: ${list(CARD_PARTS)} (A§5.9). ${why}, and ${said}`),
    )
    usable = false
  }

  const cited = new Set<string>()
  let intro: ProseFlow[] = []
  const byName = new Map<string, ProseFlow[]>()
  for (const chunk of chunks) {
    const ctx: ProseContext = { file, claims, cited, outline: { depth: chunk.name === null ? 1 : 2 }, words: { count: 0 }, out }
    const flows = compileProse(chunk.md, chunk.firstLine, ctx)
    if (flows.some((flow) => flow.type === 'heading' && flow.depth === 2)) {
      out.push(problem('content', 'error', 'bad-heading', file, chunk.headingLine, 'a part of a card has headings of ### and deeper: a ## starts the next part'))
    }
    if (chunk.name === null) {
      intro = flows
      continue
    }
    if (flows.length === 0) {
      out.push(problem('content', 'error', 'card-empty-part', file, chunk.headingLine, `the part ${chunk.name} is empty: ${EMPTY_PART[chunk.name] ?? 'a card has three parts, and none of them is empty'}`))
      usable = false
    }
    // The first copy of a name is the part. A repeat was reported with the other problems of the parts.
    if (!byName.has(chunk.name)) byName.set(chunk.name, flows)
  }

  const models = parts.find((chunk) => chunk.name === 'Models')
  if (models !== undefined) {
    const rules = unsourcedRules(models.md, models.firstLine)
    if (rules.lists === 0) {
      out.push(problem('content', 'error', 'card-rules', file, models.headingLine, 'Models states its rules as a list, one item for each rule, and each item names its source (A§5.9)'))
    }
    for (const line of rules.unsourced) {
      out.push(problem('content', 'error', 'card-rule-unsourced', file, line, 'this rule names no source: cite the claim it comes from as {{claim:id}}, or the decision or the design section that made it the course\'s own, such as D-044 or A§5.3'))
    }
  }
  // A reference to a claim that does not exist is reported where it is, and is not also "no claim".
  const mentioned = chunks.some((chunk) => /\{\{\s*claim:/.test(chunk.md))
  if (cited.size === 0 && !mentioned && usable) {
    out.push(problem('content', 'error', 'card-no-claims', file, models?.headingLine ?? afterFront, 'the card cites no claim: every rule and every figure of a world traces to a {{claim:id}} (A§5.9, D-012)'))
  }

  if (!usable || front === undefined) return null
  return {
    file,
    front,
    words: {
      intro,
      models: byName.get('Models') ?? [],
      ignores: byName.get('Ignores') ?? [],
      calibrated: byName.get('Calibrated against') ?? [],
    },
    cited,
  }
}
