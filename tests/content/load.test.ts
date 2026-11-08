/*
 * src/content/load.ts is where the app reaches the compiled content (W0-T09), with load-lessons.ts and load-map.ts beside it for the
 * tables of the lessons, the modules and the cards, and the map's (D-059, W1-T06). Their `import.meta.glob` calls are Vite's, so
 * the real loads are checked in a browser (the pages are served from `vite preview` and `npm run dev`). What can be checked
 * here is what the server renderer needs of them: tests/smoke.test.ts renders every route, and each page imports these modules,
 * so importing one must evaluate no glob, and a load that cannot run must fail as a rejected promise, which a page shows as
 * its "did not load" ticket, and not as an exception thrown at a caller.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { loadClaims, loadIndex, publicUrl } from '@/content/load'
import { loadCard, loadLesson, loadModule } from '@/content/load-lessons'
import { loadMap } from '@/content/load-map'

const source = readFileSync(path.resolve(import.meta.dirname, '../../src/content/load.ts'), 'utf8')
const lessonsSource = readFileSync(path.resolve(import.meta.dirname, '../../src/content/load-lessons.ts'), 'utf8')
const globsOf = (text: string) =>
  text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .filter((line) => line.includes('import.meta.glob'))

describe('the loader, outside Vite', () => {
  test('imports without evaluating a glob, because every glob sits inside a function', () => {
    const globs = [...globsOf(source), ...globsOf(lessonsSource)]
    expect(globs.length).toBe(4)
    for (const line of globs) expect(line).toMatch(/^const \w+ = \(\) => import\.meta\.glob/)
  })

  test("keeps the tables that grow with the course out of load.ts: the index is its one glob, and the lessons', modules' and cards' are in load-lessons.ts (D-059)", () => {
    // load.ts is in the closure of the front page's first paint (its loader awaits the index) and of every game that cites a claim, and
    // a glob's table names every file it can load. A lesson written later must not grow those pages.
    expect(globsOf(source)).toEqual([expect.stringContaining("'./generated/index.json'")])
    expect(globsOf(lessonsSource).map((line) => /'\.\/generated\/(\w+)\//.exec(line)?.[1])).toEqual(['lessons', 'modules', 'cards'])
  })

  test('a load that cannot run is a rejected promise, never a throw', async () => {
    for (const load of [() => loadIndex(), () => loadModule('tr2'), () => loadLesson('tr2', 'l0-sample'), () => loadCard('trace-room-steploop')]) {
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

/*
 * W1-T06: the compiled map has its own loader, beside load.ts and not in it. load.ts is in the front page's first-paint closure (the
 * course index is loaded by the page's loader), and nothing the front page does reads the map, so its code stays out of that budget.
 */
describe('the map\'s loader, outside Vite', () => {
  const mapSource = readFileSync(path.resolve(import.meta.dirname, '../../src/content/load-map.ts'), 'utf8')

  test('is its own file, with its one glob inside a function, as load.ts\'s are', () => {
    const code = mapSource.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    const globs = code.filter((line) => line.includes('import.meta.glob'))
    expect(globs.length).toBe(1)
    expect(globs[0]).toMatch(/^const \w+ = \(\) => import\.meta\.glob/)
    expect(source).not.toContain('map.json')
  })

  test('a load that cannot run is a rejected promise, never a throw, and is not remembered', async () => {
    let first: Promise<unknown> | undefined
    expect(() => {
      first = loadMap()
    }).not.toThrow()
    await expect(first).rejects.toBeInstanceOf(Error)
    const second = loadMap()
    expect(second).not.toBe(first)
    await second.catch(() => undefined)
  })
})
