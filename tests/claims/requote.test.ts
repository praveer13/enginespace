/*
 * W2b-T46's claims:requote. Every request goes to a server on 127.0.0.1 that this file starts; nothing reaches the internet.
 *   - the anchor parser and the quote locator;
 *   - the five outcomes, a rate limit that stops the run, and what the server was sent (a generic User-Agent, no token, no cookie).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { exitCode, formatReport, judge, locate, pageText, parseAnchor, rawUrl, requote, USER_AGENT } from '../../scripts/claims/requote.ts'

const FILE = ['line one', 'def step(self):', '    # For transferring state', '    # to the next call.', 'return x', 'tail'].join('\n')

type Seen = { path: string; headers: Record<string, string> }
const seen: Seen[] = []
let server: ReturnType<typeof Bun.serve>
let base = ''

beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      seen.push({ path: url.pathname, headers: Object.fromEntries(req.headers.entries()) })
      if (url.pathname.endsWith('/ok.py')) return new Response(FILE)
      if (url.pathname.endsWith('/gone.py')) return new Response('nope', { status: 404 })
      if (url.pathname.endsWith('/limited.py')) return new Response('slow down', { status: 429 })
      return new Response('?', { status: 404 })
    },
  })
  base = `http://127.0.0.1:${server.port}`
})
afterAll(() => server.stop(true))

const claim = (id: string, file: string, lines: string, quote: string, pin = 'vllm') => ({
  id,
  pin,
  source: { url: `https://github.com/o/r/blob/abc123/${file}${lines}`, quote },
})

describe('parseAnchor and rawUrl', () => {
  test('reads a file at a ref with a line range, a single line and none', () => {
    expect(parseAnchor('https://github.com/o/r/blob/v1.2/a/b.py#L3-L9')).toEqual({ owner: 'o', repo: 'r', ref: 'v1.2', path: 'a/b.py', lines: { from: 3, to: 9 } })
    expect(parseAnchor('https://github.com/o/r/blob/v1/a.py#L7')?.lines).toEqual({ from: 7, to: 7 })
    expect(parseAnchor('https://github.com/o/r/blob/v1/a.py')?.lines).toBeUndefined()
  })
  test('a blog, a release page and a tree are not files at a pin', () => {
    expect(parseAnchor('https://vllm.ai/blog/2026-03-24-mrv2')).toBeUndefined()
    expect(parseAnchor('https://github.com/o/r/releases/tag/v1')).toBeUndefined()
    expect(parseAnchor('https://github.com/o/r/tree/v1/a')).toBeUndefined()
  })
  test('the raw address names the same ref and path, on the host given', () => {
    const a = parseAnchor('https://github.com/o/r/blob/abc/x/y.py#L1')
    expect(a && rawUrl(a)).toBe('https://raw.githubusercontent.com/o/r/abc/x/y.py')
    expect(a && rawUrl(a, 'http://127.0.0.1:1')).toBe('http://127.0.0.1:1/o/r/abc/x/y.py')
  })
})

describe('locate and judge', () => {
  test('finds a quote that wraps over two lines, ignoring indentation', () => {
    expect(locate(FILE, '# For transferring state # to the next call.')).toEqual([{ from: 3, to: 4 }])
  })
  test('inside, outside and absent', () => {
    expect(judge(FILE, 'return x', { from: 5, to: 5 }).status).toBe('verified')
    expect(judge(FILE, 'return x', { from: 1, to: 3 })).toEqual({ status: 'moved', note: 'found at L5' })
    expect(judge(FILE, 'not there', { from: 1, to: 6 }).status).toBe('missing')
    expect(judge(FILE, 'tail').status).toBe('verified')
  })
  test('a quote that occurs twice is verified when one of them is inside', () => {
    expect(judge('a\nb\na', 'a', { from: 3, to: 3 }).status).toBe('verified')
  })
})

describe('locate after a character outside the BMP', () => {
  test('an emoji line above the quote does not shift the lines', () => {
    const text = ['intro \u{1F600}\u{1F680} line', 'second \u{1F600}', 'def step(self):', '    return x', 'tail'].join('\n')
    expect(locate(text, 'def step(self):')).toEqual([{ from: 3, to: 3 }])
    expect(locate(text, 'def step(self): return x')).toEqual([{ from: 3, to: 4 }])
    expect(locate(text, 'tail')).toEqual([{ from: 5, to: 5 }])
    expect(judge(text, 'return x', { from: 4, to: 4 }).status).toBe('verified')
  })
  test('a quote that holds an astral character is found where it is', () => {
    const text = 'a\nb \u{1F600} c\nd'
    expect(locate(text, '\u{1F600} c d')).toEqual([{ from: 2, to: 3 }])
  })
})

describe('page mode', () => {
  const html = '<html><head><style>.x{}</style><script>var q = "hidden"</script></head><body><h1>Title</h1><p>A view shares the&nbsp;data &amp; more.</p><!-- no --></body></html>'
  test('pageText drops scripts and tags and decodes entities', () => {
    const text = pageText(html)
    expect(text).toContain('A view shares the data & more.')
    expect(text).not.toContain('hidden')
    expect(text).not.toContain('<')
  })
  const page = (id: string, url: string, quote: string) => ({
    id,
    source: { url, quote },
  })
  test('pages are skipped by default and read with the option, once per address, with a generic header set', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const fetchImpl = (async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url, headers: init?.headers ?? {} })
      return new Response(html)
    }) as unknown as typeof fetch
    const claims = [
      page('p.a', 'https://docs.example.org/2.14/view.html#section', 'A view shares the data & more.'),
      page('p.b', 'https://docs.example.org/2.14/view.html', 'not on the page'),
      { id: 'p.c' },
    ]
    const off = await requote(claims, { fetchImpl })
    expect(calls.length).toBe(0)
    expect(off.rows.map((r) => r.status)).toEqual(['skipped', 'skipped', 'skipped'])
    expect(formatReport(off)).toContain('Skipped 2: a page or other source that is not a file at a pin (read with --pages).')
    expect(formatReport(off)).toContain('Skipped 1: a derived or synthetic claim, which has no source.')
    const on = await requote(claims, { fetchImpl, pages: true })
    expect(on.rows.map((r) => r.status)).toEqual(['verified', 'missing', 'skipped'])
    expect(calls.map((c) => c.url)).toEqual(['https://docs.example.org/2.14/view.html'])
    expect(calls[0].headers['User-Agent']).toBe(USER_AGENT)
    expect(exitCode(on)).toBe(1)
  })
})

describe('requote against a local server', () => {
  test('each outcome, one request per file, and a generic header set', async () => {
    seen.length = 0
    const report = await requote(
      [
        claim('a.verified', 'ok.py', '#L2-L2', 'def step(self):'),
        claim('a.moved', 'ok.py', '#L1-L2', 'return x'),
        claim('a.missing', 'ok.py', '#L1-L6', 'absent words'),
        claim('a.unreadable', 'gone.py', '#L1', 'x'),
        { id: 'a.blog', source: { url: 'https://vllm.ai/blog/x', quote: 'q' } },
        { id: 'a.derived' },
      ],
      { rawBase: base },
    )
    expect(report.rows.map((r) => [r.id, r.status])).toEqual([
      ['a.verified', 'verified'],
      ['a.moved', 'moved'],
      ['a.missing', 'missing'],
      ['a.unreadable', 'unreadable'],
      ['a.blog', 'skipped'],
      ['a.derived', 'skipped'],
    ])
    expect(report.rows[3].note).toBe('HTTP 404')
    expect(report.covered).toBe(6)
    expect(seen.map((s) => s.path)).toEqual(['/o/r/abc123/ok.py', '/o/r/abc123/gone.py'])
    for (const s of seen) {
      expect(s.headers['user-agent']).toBe(USER_AGENT)
      expect(s.headers.authorization).toBeUndefined()
      expect(s.headers.cookie).toBeUndefined()
      expect(s.headers.from).toBeUndefined()
    }
    expect(exitCode(report)).toBe(3)
  })

  test('a rate limit stops the run and says how many claims it covered', async () => {
    const report = await requote(
      [claim('b.one', 'ok.py', '#L1', 'line one'), claim('b.two', 'limited.py', '#L1', 'x'), claim('b.three', 'ok.py', '#L1', 'line one')],
      { rawBase: base },
    )
    expect(report.rows.map((r) => r.status)).toEqual(['verified', 'not reached', 'not reached'])
    expect(report.covered).toBe(1)
    expect(report.total).toBe(3)
    expect(report.stoppedAt).toContain('429')
    expect(formatReport(report)).toContain('Covered 1 of 3 claims')
    expect(exitCode(report)).toBe(3)
  })

  test('the id prefix and pin choose the claims; a clean run exits 0 and a moved quote 1', async () => {
    const claims = [claim('vllm.a', 'ok.py', '#L1', 'line one'), claim('sglang.b', 'ok.py', '#L1', 'line one', 'sglang'), claim('vllm.c', 'ok.py', '#L1', 'tail')]
    const some = await requote(claims, { rawBase: base, idPrefix: 'vllm.' })
    expect(some.total).toBe(2)
    expect(exitCode(some)).toBe(1)
    const one = await requote(claims, { rawBase: base, pin: 'sglang' })
    expect(one.rows.map((r) => r.id)).toEqual(['sglang.b'])
    expect(exitCode(one)).toBe(0)
  })

  test('the script reads no token and writes no name or email', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../../scripts/claims/requote.ts'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//, '')
    expect(code).not.toMatch(/process\.env|Bun\.env|import\.meta\.env/)
    expect(code).not.toMatch(/[\w.-]+@[\w-]+\.\w+/)
    expect(code).not.toMatch(/authorization|cookie/i)
  })
})
