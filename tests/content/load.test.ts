/*
 * src/content/load.ts is the one place that reaches the compiled content (W0-T09). Its `import.meta.glob` calls are Vite's, so
 * the real loads are checked in a browser (the pages are served from `vite preview` and `npm run dev`). What can be checked
 * here is what the server renderer needs of it: tests/smoke.test.ts renders every route, and each page imports this module,
 * so importing it must evaluate no glob, and a load that cannot run must fail as a rejected promise, which a page shows as
 * its "did not load" ticket, and not as an exception thrown at a caller.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { loadClaims, loadIndex, loadLesson, loadModule, publicUrl } from '@/content/load'

const source = readFileSync(path.resolve(import.meta.dirname, '../../src/content/load.ts'), 'utf8')

describe('the loader, outside Vite', () => {
  test('imports without evaluating a glob, because every glob sits inside a function', () => {
    const code = source.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    const globs = code.filter((line) => line.includes('import.meta.glob'))
    expect(globs.length).toBe(3)
    for (const line of globs) expect(line).toMatch(/^const \w+ = \(\) => import\.meta\.glob/)
  })

  test('a load that cannot run is a rejected promise, never a throw', async () => {
    for (const load of [() => loadIndex(), () => loadModule('tr2'), () => loadLesson('tr2', 'l0-sample')]) {
      let promise: Promise<unknown> | undefined
      expect(() => {
        promise = load()
      }).not.toThrow()
      await expect(promise).rejects.toBeInstanceOf(Error)
    }
  })

  test('a load that failed is not remembered, so the next ask tries again', async () => {
    const first = loadLesson('tr2', 'l0-sample')
    await first.catch(() => undefined)
    const second = loadLesson('tr2', 'l0-sample')
    expect(second).not.toBe(first)
    await second.catch(() => undefined)
  })

  test('the claims are fetched from this site\'s own origin, and a failure to fetch is a rejection', async () => {
    const real = globalThis.fetch
    const seen: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input))
      return new Response('nope', { status: 404 })
    }) as typeof fetch
    try {
      await expect(loadClaims()).rejects.toThrow('claims.json answered 404')
      expect(seen).toEqual(['/claims.json'])
    } finally {
      globalThis.fetch = real
    }
  })

  test('a claims file that holds claims becomes a map by id, and is fetched once', async () => {
    const real = globalThis.fetch
    let fetched = 0
    globalThis.fetch = (async () => {
      fetched += 1
      return new Response(JSON.stringify({ claims: [{ id: 'a.b', value: 1 }, { id: 'c.d', value: 'x' }] }))
    }) as typeof fetch
    try {
      const claims = await loadClaims()
      expect([...claims.keys()]).toEqual(['a.b', 'c.d'])
      expect(await loadClaims()).toBe(claims)
      expect(fetched).toBe(1)
    } finally {
      globalThis.fetch = real
    }
  })

  test('a path under public/ is joined to the site\'s base, whatever its leading slashes', () => {
    expect(publicUrl('figures/tr2/l0-sample.svg')).toBe('/figures/tr2/l0-sample.svg')
    expect(publicUrl('/claims.json')).toBe('/claims.json')
  })
})
