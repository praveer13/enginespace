/*
 * Prose (ARCHITECTURE §4.1, §4.4; D-016): Markdown in, a restricted token tree out, and the number gate that reads it.
 *
 * marked's lexer reads the Markdown, and this module keeps only what A§4.1 lists. A paragraph, a heading, a list, a table
 * and a code block become block nodes. Text, emphasis, a code span, a link, a claim reference (`{{claim:id}}`, `{{ks:T5.L7}}`)
 * and a tag (`[measured]`, `[derived]`, `[estimated]`, `[unverified]`) become the nodes inside a line. Everything else is an
 * error that names the line: raw HTML, an image, a quote, a rule, a hard line break, a task list, a reference definition.
 * marked's parser and renderer never run, and no node holds HTML, so React is the only thing that renders prose.
 *
 * The number gate lives here because it reads the same tokens. A digit run must carry one of the four tags within its
 * sentence unless it sits in code or a reference, in an id, or in an ISO date (`untaggedNumbers`).
 */
import { getDefaults, Lexer } from 'marked'
import type { Token, Tokens } from 'marked'
import { CLAIM_TAGS } from '../../packages/schema/claims.ts'
import type { ProseAlign, ProseFlow, ProseInline } from '../../packages/schema/compiled.ts'
import { PROSE_HREF } from '../../packages/schema/compiled.ts'
import { claimIdSchema, ksRefSchema } from '../../packages/schema/refs.ts'
import { problem } from './parse.ts'
import type { Diagnostic } from './parse.ts'

/** Stands in for a code span or a reference in the text that the number gate reads. It is neither a letter nor a digit. */
const PLACEHOLDER = '\uFFFC'

/** Reading speed for prose: 200 words a minute [estimated]. The compiler warns when a lesson's `minutes` strays from its own sum. */
export const WORDS_PER_MINUTE = 200

export interface ProseContext {
  file: string
  /** The ids of the claims that exist. A reference to any other is an error. */
  claims: ReadonlySet<string>
  /** Out: the claims the prose cites. */
  cited: Set<string>
  /** In and out: the depth of the last heading. The page's title is the h1, so it starts at 1. */
  outline: { depth: number }
  /** Out: the words read, for the reading time. */
  words: { count: number }
  out: Diagnostic[]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The number gate                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const TAG = new RegExp(`\\[(?:${CLAIM_TAGS.join('|')})\\]`)
/** Where a sentence may end: a full stop, `!`, `?` or an ellipsis, with any closing quote or bracket, then a space or the end. */
const TERMINATOR = /[.!?…]+["'”’)\]]*(?=\s|$)/g
/** The words that end in a full stop without ending a sentence. */
const ABBREVIATION = /(?:^|[\s(])(?:e\.g|i\.e|vs|cf|approx|fig|eq|resp|incl|al)$/i
const DATE = /\b\d{4}-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?)?(?![\d-])/g
/** A digit run, with its thousands separators and its decimal or dotted parts: `1,024`, `2.1`, `0.33.0`. A comma not followed by three digits ends it. */
const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)*/g
/** The characters that end a word. A hyphen and a dot do not, so `Llama-3-70B`, `tr2.l3` and `W0-T13` are one word each. */
const WORD_BREAK = /[\s=<>≈≥≤≠×÷·±~/(),;:"'“”‘’[\]{}…—–|\uFFFC]/
/** A letter, an underscore, a section sign, a hash or an at sign before a digit makes it part of an identifier: H100, p99, v0.33.0, §4.2, #12. */
const IDENTIFIER_PREFIX = /[\p{L}_§#@]/u

export interface NumberFinding {
  /** Where the first untagged number starts in the text. */
  index: number
  /** Every untagged number of the sentence, as written. */
  numbers: string[]
  /** The sentence, trimmed. */
  sentence: string
}

/** The sentences of a text, each with its offset. A sentence ends at a full stop, `!`, `?` or `…` followed by a space. */
export function sentences(text: string): { start: number; text: string }[] {
  const found: { start: number; text: string }[] = []
  let start = 0
  for (const match of text.matchAll(TERMINATOR)) {
    if (match[0].startsWith('.') && ABBREVIATION.test(text.slice(start, match.index))) continue
    const end = match.index + match[0].length
    found.push({ start, text: text.slice(start, end) })
    start = end
  }
  if (text.slice(start).trim() !== '') found.push({ start, text: text.slice(start) })
  return found
}

/**
 * The sentences of a text that hold a digit run and none of the four tags (A§4.4). A digit run does not count when:
 *   - it is in an ISO date (`2026-11-03`, `2026-11`);
 *   - a letter, an underscore, `§`, `#` or `@` comes before it in its word, which makes it part of an identifier (`H100`,
 *     `p99`, `tr2.l3`, `T5.L7`, `D-014`, `Llama-3-70B`, `v0.33.0`, `§4.2`, `#12`);
 *   - it is an ordinal (`1st`, `4th`).
 * Code and references are replaced by U+FFFC before the text gets here, so they hold no digit to find. A word breaks at a
 * space and at `= < > / : ( ) , ;` and the like, so `k=4` and `5/10` hold two numbers. `300µs`, `80GB` and `2x` hold one: a
 * letter after a digit is a unit.
 */
export function untaggedNumbers(text: string): NumberFinding[] {
  const findings: NumberFinding[] = []
  for (const { start, text: sentence } of sentences(text)) {
    if (TAG.test(sentence)) continue
    const masked = sentence.replace(DATE, (date) => PLACEHOLDER.repeat(date.length))
    const hits: { at: number; text: string }[] = []
    for (const match of masked.matchAll(NUMBER)) {
      let word = match.index
      while (word > 0 && !WORD_BREAK.test(masked[word - 1])) word -= 1
      if (IDENTIFIER_PREFIX.test(masked.slice(word, match.index))) continue
      if (/^(?:st|nd|rd|th)(?![\p{L}\p{N}])/iu.test(masked.slice(match.index + match[0].length))) continue
      hits.push({ at: match.index, text: match[0] })
    }
    if (hits.length > 0) findings.push({ index: start + hits[0].at, numbers: hits.map((hit) => hit.text), sentence: sentence.trim() })
  }
  return findings
}

/** The text with each code span replaced, so a plain string field reads as a line of prose does. */
export const withoutCode = (text: string): string => text.replace(/`[^`]*`/g, PLACEHOLDER)

const snippet = (sentence: string): string => {
  const plain = sentence.replaceAll(PLACEHOLDER, '…').replace(/\s+/g, ' ')
  return plain.length > 110 ? `${plain.slice(0, 107)}…` : plain
}

export function numberMessage(finding: NumberFinding): string {
  const list = finding.numbers.map((number) => `"${number}"`).join(', ')
  const noun = finding.numbers.length === 1 ? 'number' : 'numbers'
  return `untagged ${noun} ${list} in "${snippet(finding.sentence)}": tag the sentence [measured], [derived], [estimated] or [unverified], replace the number with a {{claim:id}}, or put an identifier in backticks`
}

/** The words in a text, not counting the stand-ins for code and references. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
}

/** Text with its line numbers: the string that the number gate reads, and where each part of it came from. */
class Flat {
  text = ''
  private readonly parts: { offset: number; line: number }[] = []

  add(piece: string, line: number): void {
    this.parts.push({ offset: this.text.length, line })
    this.text += piece
  }

  /** The line of a character of the text, counting the line breaks inside the part that holds it. */
  lineAt(index: number): number {
    let part = this.parts[0]
    for (const candidate of this.parts) {
      if (candidate.offset > index) break
      part = candidate
    }
    if (part === undefined) return 1
    return part.line + (this.text.slice(part.offset, index).match(/\n/g)?.length ?? 0)
  }
}

function scan(flat: Flat, ctx: ProseContext): void {
  ctx.words.count += countWords(flat.text.replaceAll(PLACEHOLDER, ' '))
  for (const finding of untaggedNumbers(flat.text)) {
    ctx.out.push(problem('numbers', 'error', 'untagged-number', ctx.file, flat.lineAt(finding.index), numberMessage(finding)))
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Inline                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const newlines = (text: string): number => text.match(/\n/g)?.length ?? 0

/** Every `{{…}}`, and every tag. A reference or a tag is the whole of its token. */
const SPECIAL = new RegExp(`\\{\\{[^{}]*\\}\\}|\\[(?:${CLAIM_TAGS.join('|')})\\]`, 'g')
/** An HTML character reference: `&amp;`, `&nbsp;`, `&#39;`, `&#x27;`. A bare ampersand is text. */
const ENTITY = /&(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#[xX][0-9A-Fa-f]+);/
/** A tag with something else inside its brackets: a date, a source, an explanation. */
const LOOSE_TAG = new RegExp(`\\[(?:${CLAIM_TAGS.join('|')})\\b[^\\]]*\\]`, 'i')

/** The node for a `{{…}}`, or null with a diagnostic when it is not a reference this module knows. */
function reference(token: string, line: number, ctx: ProseContext): ProseInline | null {
  const bad = (message: string) => {
    ctx.out.push(problem('content', 'error', 'bad-ref', ctx.file, line, `${token}: ${message}`))
    return null
  }
  const inner = token.slice(2, -2).trim()
  const claim = /^claim:(.*)$/s.exec(inner)
  if (claim !== null) {
    const id = claim[1].trim()
    if (!claimIdSchema.safeParse(id).success) return bad('a claim id is dotted lowercase words, as in vllm.async-scheduling.default')
    if (!ctx.claims.has(id)) {
      ctx.out.push(problem('content', 'error', 'unknown-claim', ctx.file, line, `no claim "${id}" in content/claims`))
      return null
    }
    ctx.cited.add(id)
    return { type: 'claim', id }
  }
  const ks = /^ks:(.*)$/s.exec(inner)
  if (ks !== null) {
    const ref = `ks:${ks[1].trim()}`
    if (!ksRefSchema.safeParse(ref).success) return bad('a kernelspace ref reads like T5.L7 or t5.kv-capacity')
    return { type: 'ks', ref }
  }
  return bad('a reference reads {{claim:id}} or {{ks:T5.L7}}')
}

/**
 * Splits a run of text at its references and tags. Whitespace folds to one space in the text nodes, so a rewrap of the
 * Markdown changes nothing the learner or the `rev` can see. The number gate reads the run as written.
 */
function textNodes(raw: string, line: number, ctx: ProseContext, flat: Flat): ProseInline[] {
  const nodes: ProseInline[] = []
  const text = (piece: string, at: number) => {
    if (piece === '') return
    flat.add(piece, at)
    if (LOOSE_TAG.test(piece)) {
      ctx.out.push(problem('numbers', 'error', 'bad-tag', ctx.file, at, 'a tag is [measured], [derived], [estimated] or [unverified] and nothing else inside the brackets: a source and a date belong in a claim'))
    }
    if (/\{\{|\}\}/.test(piece)) ctx.out.push(problem('content', 'error', 'bad-ref', ctx.file, at, 'a reference reads {{claim:id}} or {{ks:T5.L7}}, with both pairs of braces'))
    const entity = ENTITY.exec(piece)
    if (entity !== null) ctx.out.push(problem('content', 'error', 'html', ctx.file, at, `HTML is not allowed in content (D-016): the entity ${entity[0]} is HTML. Write the character itself`))
    const folded = piece.replace(/\s+/g, ' ')
    const last = nodes[nodes.length - 1]
    if (last?.type === 'text') last.text = (last.text + folded).replace(/\s+/g, ' ')
    else nodes.push({ type: 'text', text: folded })
  }

  let end = 0
  for (const match of raw.matchAll(SPECIAL)) {
    text(raw.slice(end, match.index), line + newlines(raw.slice(0, end)))
    const at = line + newlines(raw.slice(0, match.index))
    if (match[0].startsWith('[')) {
      flat.add(match[0], at)
      nodes.push({ type: 'tag', tag: match[0].slice(1, -1) as (typeof CLAIM_TAGS)[number] })
    } else {
      flat.add(PLACEHOLDER, at)
      const node = reference(match[0], at, ctx)
      if (node !== null) nodes.push(node)
    }
    end = match.index + match[0].length
  }
  text(raw.slice(end), line + newlines(raw.slice(0, end)))
  return nodes
}

function unsupported(ctx: ProseContext, line: number, code: string, message: string): void {
  ctx.out.push(problem('content', 'error', code, ctx.file, line, message))
}

function inline(tokens: readonly Token[], line: number, ctx: ProseContext, flat: Flat): ProseInline[] {
  const out: ProseInline[] = []
  let raw = ''
  let rawLine = line
  let at = line
  const flush = () => {
    if (raw !== '') out.push(...textNodes(raw, rawLine, ctx, flat))
    raw = ''
  }
  for (const token of tokens) {
    const start = at
    at += newlines(token.raw)
    switch (token.type) {
      case 'text':
      case 'escape':
        if (raw === '') rawLine = start
        raw += (token as Tokens.Text).text
        break
      case 'codespan':
        flush()
        out.push({ type: 'code', text: (token as Tokens.Codespan).text })
        flat.add(PLACEHOLDER, start)
        break
      case 'em':
      case 'strong': {
        flush()
        const children = inline((token as Tokens.Em).tokens, start, ctx, flat)
        if (children.length > 0) out.push({ type: token.type, children })
        break
      }
      case 'link': {
        flush()
        const { href, tokens: inner } = token as Tokens.Link
        const children = inline(inner, start, ctx, flat)
        if (!PROSE_HREF.test(href)) {
          // The words stay, so that the output is whole and the only finding is the link.
          unsupported(ctx, start, 'bad-link', `the link "${href}" must be an https URL, a route such as /map, or an anchor such as #why`)
          out.push(...children)
        } else if (children.length > 0) out.push({ type: 'link', href, children })
        break
      }
      case 'html':
        unsupported(ctx, start, 'html', `HTML is not allowed in content (D-016): "${token.raw.trim().slice(0, 40)}". Write code, including generic types such as Vec<T>, in backticks`)
        break
      case 'image':
        unsupported(ctx, start, 'unsupported-markdown', 'an image is not prose: use a figure block (A§4.3)')
        break
      case 'br':
        unsupported(ctx, start, 'unsupported-markdown', 'a hard line break is not prose: end the line with its words, or start a new paragraph')
        break
      case 'del':
        unsupported(ctx, start, 'unsupported-markdown', 'strikethrough is not prose')
        break
      case 'checkbox':
        // A task list is reported once, at the list.
        break
      default:
        unsupported(ctx, start, 'unsupported-markdown', `${token.type} is not prose`)
    }
  }
  flush()
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Blocks                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A line of inline nodes with its flat text, scanned for untagged numbers once it is built. */
function line(tokens: readonly Token[], at: number, ctx: ProseContext, scanned = true): ProseInline[] {
  const flat = new Flat()
  const nodes = inline(tokens, at, ctx, flat)
  if (scanned) scan(flat, ctx)
  else ctx.words.count += countWords(flat.text.replaceAll(PLACEHOLDER, ' '))
  return nodes
}

function flow(tokens: readonly Token[], first: number, ctx: ProseContext): ProseFlow[] {
  const out: ProseFlow[] = []
  let at = first
  for (const token of tokens) {
    const start = at
    at += newlines(token.raw)
    switch (token.type) {
      case 'space':
        break
      case 'paragraph':
      case 'text': {
        const inner = (token as Tokens.Paragraph).tokens ?? [{ type: 'text', raw: token.raw, text: (token as Tokens.Text).text } as Tokens.Text]
        const children = line(inner, start, ctx)
        if (children.length > 0) out.push({ type: 'paragraph', children })
        break
      }
      case 'heading': {
        const { depth, tokens: inner } = token as Tokens.Heading
        if (depth < 2 || depth > 4) {
          unsupported(ctx, start, 'bad-heading', `a heading in prose is ## to ####, and this is ${'#'.repeat(depth)}: the page's title is its h1`)
        } else if (depth > ctx.outline.depth + 1) {
          unsupported(ctx, start, 'bad-heading', `a heading goes one level deeper at most: a ${'#'.repeat(depth)} cannot follow a ${'#'.repeat(ctx.outline.depth)}`)
        }
        const children = line(inner, start, ctx)
        if (depth >= 2 && depth <= 4) ctx.outline.depth = depth
        if (children.length > 0 && depth >= 2 && depth <= 4) out.push({ type: 'heading', depth: depth as 2 | 3 | 4, children })
        break
      }
      case 'list': {
        const list = token as Tokens.List
        const items: ProseFlow[][] = []
        let itemAt = start
        for (const item of list.items) {
          if (item.task) unsupported(ctx, itemAt, 'unsupported-markdown', 'a task list is not prose')
          const body = flow(item.tokens, itemAt, ctx)
          if (body.length > 0) items.push(body)
          itemAt += newlines(item.raw)
        }
        if (items.length > 0) out.push({ type: 'list', ordered: list.ordered, ...(list.ordered && typeof list.start === 'number' && list.start !== 1 ? { start: list.start } : {}), items })
        break
      }
      case 'table': {
        const table = token as Tokens.Table
        const flats = table.header.map(() => new Flat())
        const head = table.header.map((cell, column) => inline(cell.tokens, start, ctx, flats[column]))
        // A tag in a column's header tags the whole column: a table says once what its numbers are.
        const tagged = flats.map((flat) => TAG.test(flat.text))
        flats.forEach((flat) => scan(flat, ctx))
        const rows = table.rows.map((row, index) => row.map((cell, column) => line(cell.tokens, start + 2 + index, ctx, !tagged[column])))
        out.push({ type: 'table', align: table.align as ProseAlign[], head, rows })
        break
      }
      case 'code': {
        const code = token as Tokens.Code
        ctx.words.count += countWords(code.text)
        const lang = code.lang?.split(/\s+/)[0]
        if (lang !== undefined && lang !== '' && !/^[A-Za-z0-9][A-Za-z0-9+#._-]*$/.test(lang)) {
          unsupported(ctx, start, 'unsupported-markdown', `"${lang}" is not a language name for a code block`)
        }
        out.push({ type: 'code', ...(lang ? { lang } : {}), text: code.text })
        break
      }
      case 'html':
        unsupported(ctx, start, 'html', `HTML is not allowed in content (D-016): "${token.raw.trim().slice(0, 40)}". Write code in backticks`)
        break
      case 'blockquote':
        unsupported(ctx, start, 'unsupported-markdown', 'a quote is not prose: use a warning or isomorphism card for an aside (A§4.3)')
        break
      case 'hr':
        unsupported(ctx, start, 'unsupported-markdown', 'a horizontal rule is not prose: a heading starts a new part')
        break
      case 'def':
        unsupported(ctx, start, 'unsupported-markdown', 'a link reference definition is not prose: write the link in the line, as [text](https://…)')
        break
      case 'checkbox':
        // A task list is reported once, at its item.
        break
      default:
        unsupported(ctx, start, 'unsupported-markdown', `${token.type} is not prose`)
    }
  }
  return out
}

/**
 * Compiles one run of Markdown, the prose between two directives, into block nodes. `first` is the line of the run's first
 * line in the file. Problems go to `ctx.out`, and the nodes that could be made are returned.
 */
export function compileProse(md: string, first: number, ctx: ProseContext): ProseFlow[] {
  const tokens = Lexer.lex(md, { ...getDefaults(), gfm: true, breaks: false, pedantic: false })
  return flow(tokens, first, ctx)
}
