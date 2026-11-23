/*
 * claims:requote. Reads each claim's quote again at its pin and says whether it still lies inside the lines its anchor names.
 *
 * verify:claims checks a claim's schema, ids, dates and formula; it never reads the source. This does, so it needs the network and
 * is not part of the standard gate. A module's technical check runs it, and a later wave adds it to the nightly's reports job.
 *
 *   bun scripts/claims/requote.ts [--id-prefix <text>] [--pin <key>] [--delay-ms <n>] [--raw-base <url>] <claims file>...
 *
 * A claim whose source is a file of a GitHub repository at a pin (`https://github.com/<owner>/<repo>/blob/<ref>/<path>#L<a>-L<b>`) is
 * fetched as raw text from raw.githubusercontent.com, once per file, with a generic User-Agent, no token and no cookie. The script reads
 * nothing from the environment. Each claim gets one status:
 *
 *   verified     the quote lies inside the anchored lines (or, for an anchor without lines, anywhere in the file);
 *   moved        the quote is in the file but not inside the anchored lines; the lines where it is are given;
 *   missing      the file was read and the quote is not in it;
 *   unreadable   the file could not be read (status given);
 *   skipped      the source is not a file at a pin (a blog post, a release page, a derived or synthetic claim);
 *   not reached  the run stopped at a rate limit before this claim.
 *
 * Whitespace runs count as one space on both sides, so a quote that the source wraps over two lines still matches.
 * Exit status: 0 when every claim read is verified or skipped, 1 when one is moved or missing, 3 when one is unreadable or the run stopped
 * early, 2 for a usage error.
 */
import { readFileSync } from 'node:fs'
import { CORE_SCHEMA, load } from 'js-yaml'

export const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64)'
export const RAW_BASE = 'https://raw.githubusercontent.com'

export type Status = 'verified' | 'moved' | 'missing' | 'unreadable' | 'skipped' | 'not reached'

export interface Row {
  id: string
  status: Status
  /** The anchor's lines as written, or a dash. */
  anchor: string
  /** What else the reader needs: where a moved quote is, the HTTP status of an unreadable file, why a claim was skipped. */
  note: string
}

export interface Report {
  rows: Row[]
  /** Claims that were read or skipped before the run ended. */
  covered: number
  total: number
  /** Set when the run stopped at a rate limit. */
  stoppedAt?: string
}

export interface Anchor {
  owner: string
  repo: string
  ref: string
  path: string
  /** 1-based, inclusive. Absent when the URL names no lines. */
  lines?: { from: number; to: number }
}

/** Reads `https://github.com/<owner>/<repo>/blob/<ref>/<path>#L<a>[-L<b>]`. Anything else is not a file at a pin. */
export function parseAnchor(url: string): Anchor | undefined {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/([^#?]+)(?:#L(\d+)(?:-L(\d+))?)?$/.exec(url)
  if (m === null) return undefined
  const from = m[5] === undefined ? undefined : Number(m[5])
  const to = m[6] === undefined ? from : Number(m[6])
  return { owner: m[1], repo: m[2], ref: m[3], path: m[4], lines: from === undefined || to === undefined ? undefined : { from, to } }
}

export const rawUrl = (a: Anchor, base: string = RAW_BASE): string => `${base}/${a.owner}/${a.repo}/${a.ref}/${a.path}`

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * Where `quote` lies in `text`: the 1-based first and last line of its first occurrence, or undefined. Works on the text with
 * whitespace runs squashed, and maps the match back to the line that holds its first and its last character.
 */
export function locate(text: string, quote: string): { from: number; to: number }[] {
  const want = squash(quote)
  if (want === '') return []
  // Squash while remembering the source line of every kept character.
  let squashed = ''
  const lineOf: number[] = []
  let line = 1
  let space = true
  for (const ch of text) {
    if (/\s/.test(ch)) {
      if (!space) {
        squashed += ' '
        lineOf.push(line)
        space = true
      }
      if (ch === '\n') line += 1
      continue
    }
    squashed += ch
    lineOf.push(line)
    space = false
  }
  const found: { from: number; to: number }[] = []
  let at = squashed.indexOf(want)
  while (at >= 0) {
    found.push({ from: lineOf[at], to: lineOf[at + want.length - 1] })
    at = squashed.indexOf(want, at + 1)
  }
  return found
}

/** The verdict for one quote against a file's text. */
export function judge(text: string, quote: string, lines?: { from: number; to: number }): { status: 'verified' | 'moved' | 'missing'; note: string } {
  const found = locate(text, quote)
  if (found.length === 0) return { status: 'missing', note: 'the quote is not in the file' }
  if (lines === undefined) return { status: 'verified', note: 'no line range in the anchor; found in the file' }
  if (found.some((f) => f.from >= lines.from && f.to <= lines.to)) return { status: 'verified', note: '' }
  const where = found.slice(0, 3).map((f) => (f.from === f.to ? `L${f.from}` : `L${f.from}-L${f.to}`))
  return { status: 'moved', note: `found at ${where.join(', ')}${found.length > 3 ? ' and more' : ''}` }
}

interface ClaimLike {
  id: string
  pin?: string
  source?: { url: string; quote: string }
}

export interface Options {
  idPrefix?: string
  pin?: string
  delayMs?: number
  rawBase?: string
  fetchImpl?: typeof fetch
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function readClaims(file: string): ClaimLike[] {
  const doc = load(readFileSync(file, 'utf8'), { schema: CORE_SCHEMA })
  if (!Array.isArray(doc)) throw new Error(`${file}: a claims file is a list of claims`)
  return doc as ClaimLike[]
}

const isRateLimit = (res: Response): boolean => res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')

/** Checks the claims in order. One request per file; a rate limit ends the run and leaves the rest as "not reached". */
export async function requote(claims: readonly ClaimLike[], options: Options = {}): Promise<Report> {
  const chosen = claims.filter((c) => (options.idPrefix === undefined || c.id.startsWith(options.idPrefix)) && (options.pin === undefined || c.pin === options.pin))
  const doFetch = options.fetchImpl ?? fetch
  const cache = new Map<string, { text: string } | { error: string }>()
  const rows: Row[] = []
  let covered = 0
  let stoppedAt: string | undefined
  let requests = 0
  for (const claim of chosen) {
    const anchorText = (a?: Anchor): string => (a?.lines === undefined ? '-' : a.lines.from === a.lines.to ? `L${a.lines.from}` : `L${a.lines.from}-L${a.lines.to}`)
    if (stoppedAt !== undefined) {
      rows.push({ id: claim.id, status: 'not reached', anchor: '-', note: '' })
      continue
    }
    if (claim.source === undefined) {
      rows.push({ id: claim.id, status: 'skipped', anchor: '-', note: 'no source (derived or synthetic)' })
      covered += 1
      continue
    }
    const anchor = parseAnchor(claim.source.url)
    if (anchor === undefined) {
      rows.push({ id: claim.id, status: 'skipped', anchor: '-', note: 'not a file at a pin' })
      covered += 1
      continue
    }
    const url = rawUrl(anchor, options.rawBase)
    let got = cache.get(url)
    if (got === undefined) {
      if (requests > 0 && (options.delayMs ?? 0) > 0) await sleep(options.delayMs ?? 0)
      requests += 1
      try {
        const res = await doFetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'error' })
        if (isRateLimit(res)) {
          stoppedAt = `${claim.id}: HTTP ${res.status} from the host`
          rows.push({ id: claim.id, status: 'not reached', anchor: anchorText(anchor), note: `rate limit (HTTP ${res.status})` })
          continue
        }
        got = res.ok ? { text: await res.text() } : { error: `HTTP ${res.status}` }
      } catch (e) {
        got = { error: e instanceof Error ? e.message : 'request failed' }
      }
      cache.set(url, got)
    }
    if ('error' in got) {
      rows.push({ id: claim.id, status: 'unreadable', anchor: anchorText(anchor), note: got.error })
    } else {
      const verdict = judge(got.text, claim.source.quote, anchor.lines)
      rows.push({ id: claim.id, status: verdict.status, anchor: anchorText(anchor), note: verdict.note })
    }
    covered += 1
  }
  return { rows, covered, total: chosen.length, stoppedAt }
}

/** A markdown table of the rows, then the counts. */
export function formatReport(report: Report): string {
  const lines = ['| claim | anchor | status | note |', '|---|---|---|---|']
  for (const r of report.rows) lines.push(`| ${r.id} | ${r.anchor} | ${r.status} | ${r.note} |`)
  const count = (s: Status): number => report.rows.filter((r) => r.status === s).length
  lines.push('')
  lines.push(
    `Covered ${report.covered} of ${report.total} claims: ${count('verified')} verified, ${count('moved')} moved, ${count('missing')} missing, ${count('unreadable')} unreadable, ${count('skipped')} skipped, ${count('not reached')} not reached.`,
  )
  if (report.stoppedAt !== undefined) lines.push(`Stopped at a rate limit (${report.stoppedAt}).`)
  return lines.join('\n')
}

export function exitCode(report: Report): number {
  if (report.stoppedAt !== undefined || report.rows.some((r) => r.status === 'unreadable')) return 3
  return report.rows.some((r) => r.status === 'moved' || r.status === 'missing') ? 1 : 0
}

async function main(argv: string[]): Promise<number> {
  const options: Options = { delayMs: 250 }
  const files: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = (): string => {
      i += 1
      if (i >= argv.length) throw new Error(`${arg} needs a value`)
      return argv[i]
    }
    if (arg === '--id-prefix') options.idPrefix = value()
    else if (arg === '--pin') options.pin = value()
    else if (arg === '--delay-ms') options.delayMs = Number(value())
    else if (arg === '--raw-base') options.rawBase = value()
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    else files.push(arg)
  }
  if (files.length === 0) throw new Error('name at least one claims file')
  const claims = files.flatMap((f) => readClaims(f))
  const report = await requote(claims, options)
  console.log(formatReport(report))
  return exitCode(report)
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e))
      console.error('usage: bun scripts/claims/requote.ts [--id-prefix <text>] [--pin <key>] [--delay-ms <n>] <claims file>...')
      process.exit(2)
    },
  )
}
