/*
 * W1-T20's second acceptance check, "every code reference is a pinned permalink", against the files themselves, and the claims of
 * `content/claims/tr1.yaml` against the lines they quote.
 *
 * What the lessons say about the engines cannot be read from a gate, which has no network, so the check that matters most runs on a machine
 * that has the sources. Set ES_LIFECYCLE_SOURCES to the folder that holds the pinned trees unpacked side by side, as tests/sim/lifecycle-
 * sources.test.ts asks, each in the folder GitHub names it, <repository>-<commit>:
 *
 *   curl -sSL -A 'Mozilla/5.0 (X11; Linux x86_64)' https://codeload.github.com/vllm-project/vllm/tar.gz/<commit> | tar -xz -C <folder>
 *
 * for vllm-project/vllm at both of its commits (the pin's and the post's), sgl-project/sglang, sgl-project/mini-sglang and
 * GeeeekExplorer/nano-vllm. Then this file judges, tree by tree:
 *
 *   - each claim: the file is in the tree, and the quote is inside the lines that the claim's `#L` anchor names;
 *   - each excerpt of a lesson: its lines are the file's own, line by line, with the lines the lesson leaves out marked `...`;
 *   - each line count a lesson prints, which is `wc -l` of the file at the commit;
 *   - each absence that a claim states: the search it names finds nothing.
 *
 * The claims whose source is the post "Inside vLLM" are judged too when ES_INSIDE_VLLM_POST names a text file of the page. Without the
 * variables the real checks are skipped and the offline ones still run.
 *
 * W1-T20 ran it on 2026-11-05 against tarballs whose embedded commit ids (`git get-tar-commit-id`) were the lock's: every quote, excerpt,
 * count and search held. At the next re-pin the claims are re-read, and this test is the way to know they were.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { CLAIMS_FILE, PIN_OF, excerptsOf, inlineText, lessons, linksIn, mentions, pin, result, tableWithHead } from './tr1-support.ts'

const SOURCES = process.env.ES_LIFECYCLE_SOURCES
const POST_FILE = process.env.ES_INSIDE_VLLM_POST

const mine = result.claims.filter((record) => record.file === CLAIMS_FILE).map((record) => record.claim)

const FOLDER: Readonly<Record<string, string>> = {
  'vllm-project/vllm': 'vllm',
  'sgl-project/sglang': 'sglang',
  'sgl-project/mini-sglang': 'mini-sglang',
  'GeeeekExplorer/nano-vllm': 'nano-vllm',
}

/** The commit that a ref stands for: the lock's commit for a tag of vLLM or SGLang, and the ref itself for a commit. */
function commitOf(ref: string): string {
  if (ref === `v${pin('vllm').version}`) return pin('vllm').commit ?? ref
  if (ref === `v${pin('sglang').version}`) return pin('sglang').commit ?? ref
  return ref
}

const treeOf = (repo: string, ref: string): string => path.join(SOURCES ?? '', `${FOLDER[repo]}-${commitOf(ref)}`)
const fileOf = (repo: string, ref: string, file: string): string => path.join(treeOf(repo, ref), file)

const cache = new Map<string, string>()
function textOf(file: string): string {
  const known = cache.get(file)
  if (known !== undefined) return known
  const text = readFileSync(file, 'utf8')
  cache.set(file, text)
  return text
}
const linesOfFile = (file: string): string[] => textOf(file).split('\n')
/** What `wc -l` prints: the number of newlines. */
const wcLines = (file: string): number => (textOf(file).match(/\n/g) ?? []).length

/** Every file under a folder whose name matches, as paths relative to the folder, in order. */
function filesUnder(root: string, accept: (name: string) => boolean, rel = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(path.join(root, rel)).sort()) {
    const here = path.join(rel, name)
    if (statSync(path.join(root, here)).isDirectory()) out.push(...filesUnder(root, accept, here))
    else if (accept(name)) out.push(here)
  }
  return out
}

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()

const URL_AT = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/([^#]+)#L(\d+)(?:-L(\d+))?$/

/* ------------------------------------------------------------------------------------------------------------------ */
/* Offline                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the claims and excerpts, offline', () => {
  test('are many: the claims are measured at five pins, and the lessons have eighteen excerpts', () => {
    expect(mine.length).toBeGreaterThanOrEqual(130)
    expect(new Set(mine.map((claim) => claim.pin))).toEqual(new Set(['nano-vllm', 'mini-sglang', 'inside-vllm', 'vllm', 'sglang']))
    expect(lessons.reduce((sum, { text }) => sum + excerptsOf(text).length, 0)).toBe(18)
  })

  test('every claim that is read from a file anchors lines that the file can have, and the claims of the post name its page', () => {
    for (const claim of mine) {
      const url = claim.source?.url ?? ''
      if (url.startsWith('https://vllm.ai/')) continue
      const m = URL_AT.exec(url)
      expect([claim.id, m !== null]).toEqual([claim.id, true])
      if (m === null) continue
      expect([claim.id, Number(m[4]) < 20_000]).toEqual([claim.id, true])
    }
    expect(mine.filter((claim) => (claim.source?.url ?? '').startsWith('https://vllm.ai/')).length).toBe(5)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Against the trees                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

describe.skipIf(!SOURCES)('against the unpacked tarballs of the pins', () => {
  test('has the tree of every pin', () => {
    const missing = Object.entries(FOLDER)
      .flatMap(([repo]) => {
        const refs = new Set<string>()
        for (const claim of mine) {
          const m = URL_AT.exec(claim.source?.url ?? '')
          if (m !== null && m[1] === repo) refs.add(m[2])
        }
        return [...refs].map((ref) => treeOf(repo, ref))
      })
      .filter((tree) => !existsSync(tree))
    expect(missing).toEqual([])
  })

  test('every claim quotes the file it names, inside the lines of its anchor', () => {
    const problems: string[] = []
    let checked = 0
    for (const claim of mine) {
      const m = URL_AT.exec(claim.source?.url ?? '')
      if (m === null) continue
      const [, repo, ref, file, first, last] = m
      const full = fileOf(repo, ref, file)
      if (!existsSync(full)) {
        problems.push(`${claim.id}: no file ${file}`)
        continue
      }
      const lines = linesOfFile(full)
      const [a, b] = [Number(first), Number(last ?? first)]
      if (b > lines.length) {
        problems.push(`${claim.id}: lines ${a}-${b} are past the end of ${file} (${lines.length})`)
        continue
      }
      checked++
      const inside = squash(lines.slice(a - 1, b).join(' '))
      if (!inside.includes(squash(claim.source?.quote ?? ''))) problems.push(`${claim.id}: the quote is not in lines ${a}-${b} of ${file}`)
    }
    expect(problems).toEqual([])
    expect(checked).toBeGreaterThan(120)
  })

  test('the lines of an anchor are the quote and what it needs, not a whole file: a range is at most a hundred lines', () => {
    for (const claim of mine) {
      const m = URL_AT.exec(claim.source?.url ?? '')
      if (m === null) continue
      expect([claim.id, Number(m[5] ?? m[4]) - Number(m[4]) < 100]).toEqual([claim.id, true])
    }
  })

  test('every excerpt is the file at its pin, line by line, and `...` marks what the lesson leaves out', () => {
    const problems: string[] = []
    for (const { file, text } of lessons) {
      for (const excerpt of excerptsOf(text)) {
        const where = PIN_OF[excerpt.pin]
        const full = fileOf(where.repo, where.ref, excerpt.file)
        if (!existsSync(full)) {
          problems.push(`${file}:${excerpt.at}: no file ${excerpt.file}`)
          continue
        }
        const source = linesOfFile(full).slice(excerpt.first - 1, excerpt.last)
        const wanted = excerpt.body.map((line) => line.trimEnd()).filter((line) => line.trim() !== '...')
        // The lines a lesson shows sit at a shallower indent than the file's when they come from the inside of a definition.
        const held = [0, 4, 8, 12, 16, 20, 24, 28, 32].some((indent) => {
          const dedented = source.map((line) => (line.startsWith(' '.repeat(indent)) ? line.slice(indent) : line).trimEnd())
          let at = 0
          for (const line of wanted) {
            while (at < dedented.length && dedented[at] !== line) at++
            if (at >= dedented.length) return false
            at++
          }
          return true
        })
        if (!held) problems.push(`${file}:${excerpt.at}: not verbatim in ${excerpt.file} lines ${excerpt.first}-${excerpt.last} at ${excerpt.pin}`)
      }
    }
    expect(problems).toEqual([])
  })

  test('lesson 2: the four files and sequence.py have the lines the lesson counts, and the library has 1,385', () => {
    const nano = (file: string) => fileOf('GeeeekExplorer/nano-vllm', pin('nano-vllm').commit ?? '', file)
    const rows = tableWithHead('tr1.l2', ['Part', 'File', 'What it owns', 'Lines [measured]'])
    const files = ['llm_engine.py', 'scheduler.py', 'block_manager.py', 'model_runner.py']
    expect(rows.length).toBe(4)
    rows.forEach((row, i) => expect([files[i], wcLines(nano(`nanovllm/engine/${files[i]}`))]).toEqual([files[i], Number(inlineText(row[3]).trim())]))
    expect(wcLines(nano('nanovllm/engine/sequence.py'))).toBe(83)
    mentions('tr1.l2', 'sequence.py', ', 83 lines [measured]')
    const root = treeOf('GeeeekExplorer/nano-vllm', pin('nano-vllm').commit ?? '')
    const all = filesUnder(path.join(root, 'nanovllm'), (name) => name.endsWith('.py')).reduce((sum, rel) => sum + wcLines(path.join(root, 'nanovllm', rel)), 0)
    expect(all).toBe(1385)
  })

  test('lesson 4: each file has the lines the table counts at the post\'s commit and at the pin', () => {
    const rows = tableWithHead('tr1.l4', ['File', 'Lines at 42172ad [measured]', 'Lines at v0.33.0 [measured]', 'Growth [derived]'])
    expect(rows.length).toBe(8)
    const num = (cell: Parameters<typeof inlineText>[0]) => Number(inlineText(cell).replace(/,/g, '').trim())
    for (const row of rows) {
      const file = inlineText(row[0]).replace(/\s*\(.*\)$/, '').trim()
      const post = wcLines(fileOf('vllm-project/vllm', pin('inside-vllm').commit ?? '', file))
      const now = wcLines(fileOf('vllm-project/vllm', `v${pin('vllm').version}`, file))
      expect([file, post, now]).toEqual([file, num(row[1]), num(row[2])])
    }
  })

  test("lesson 4: each box of the post sits at the line the table links, at both commits", () => {
    const rows = tableWithHead('tr1.l4', ["The post's box", 'Where it was at 42172ad', 'Where it is at v0.33.0', 'What happened'])
    expect(rows.length).toBe(15)
    // The name that is looked for on the linked line; the pin's side differs where the box was renamed or replaced.
    const AT_PIN: Readonly<Record<string, string>> = { WAITING_FOR_FSM: 'WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR', req_to_block_hashes: 'block_hashes' }
    const problems: string[] = []
    let linked = 0
    for (const row of rows) {
      const name = /^[A-Za-z_][\w.]*/.exec(inlineText(row[0]))?.[0] ?? ''
      const needle = name.split('.').at(-1) ?? name
      for (const [side, cell] of [['post', row[1]], ['pin', row[2]]] as const) {
        const link = linksIn(cell)[0]
        if (link === undefined) {
          expect([name, side, inlineText(cell).trim()]).toEqual([name, side, 'none'])
          continue
        }
        const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/([^#]+)(?:#L(\d+))?$/.exec(link.href)
        if (m === null || m[4] === undefined) continue
        linked++
        const line = linesOfFile(fileOf(m[1], m[2], m[3]))[Number(m[4]) - 1] ?? ''
        const want = side === 'pin' ? (AT_PIN[needle] ?? needle) : needle
        if (!line.includes(want)) problems.push(`${name} at ${side}: line ${m[4]} of ${m[3]} is "${line.trim()}", which has no ${want}`)
      }
    }
    expect(problems).toEqual([])
    expect(linked).toBe(28)
  })

  test('lesson 5: the five files of the reading budget have the lines the table counts at the pin', () => {
    const rows = tableWithHead('tr1.l5', ['File', 'Lines [measured]', 'What to read in it'])
    expect(rows.length).toBe(5)
    for (const row of rows) {
      const file = inlineText(row[0]).trim()
      expect([file, wcLines(fileOf('vllm-project/vllm', `v${pin('vllm').version}`, file))]).toEqual([file, Number(inlineText(row[1]).replace(/,/g, '').trim())])
    }
  })

  test('lesson 5: each transition of the table of states links the line that sets the status', () => {
    const rows = tableWithHead('tr1.l5', ['From', 'To', 'What moves it', 'Read it at'])
    expect(rows.length).toBe(10)
    const problems: string[] = []
    for (const row of rows) {
      const link = linksIn(row[3])[0]
      const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/([^#]+)#L(\d+)$/.exec(link.href)
      expect([inlineText(row[0]), m !== null]).toEqual([inlineText(row[0]), true])
      if (m === null) continue
      const line = linesOfFile(fileOf(m[1], m[2], m[3]))[Number(m[4]) - 1] ?? ''
      const to = inlineText(row[1]).trim()
      // A single status is named on the line; several are set by one line that names them in a chain or by a variable.
      const named = /^[A-Z_]+$/.test(to) ? [to] : []
      const ok = /status\b/.test(line) && (named.length === 0 || named.some((name) => new RegExp(`RequestStatus\\.${name}\\b`).test(line)) || /finished_status|RequestStatus\.FINISHED_/.test(line))
      if (!ok) problems.push(`${inlineText(row[0])} to ${to}: line ${m[4]} of ${m[3]} is "${line.trim()}"`)
    }
    expect(problems).toEqual([])
  })

  test("lesson 6: SGLang's scheduler and tokenizer manager have the lines the lesson counts, at the commit of the tag", () => {
    const sgl = (file: string) => fileOf('sgl-project/sglang', `v${pin('sglang').version}`, file)
    expect(wcLines(sgl('python/sglang/srt/managers/scheduler.py'))).toBe(6409)
    expect(wcLines(sgl('python/sglang/srt/managers/tokenizer_manager.py'))).toBe(4107)
    mentions('tr1.l6', 'scheduler', 'is 6,409 lines [measured]')
    mentions('tr1.l6', 'tokenizer manager', 'is 4,107 [measured]')
    mentions('tr1.l6', 'commit', "whose commit is `297e54f`")
    expect(pin('sglang').commit?.startsWith('297e54f')).toBe(true)
  })

  test("lesson 3: Mini-SGLang's scheduler and server packages have the 846 and 840 lines that the lesson counts", () => {
    const root = treeOf('sgl-project/mini-sglang', pin('mini-sglang').commit ?? '')
    const lines = (dir: string) => filesUnder(path.join(root, dir), (name) => name.endsWith('.py')).reduce((sum, rel) => sum + wcLines(path.join(root, dir, rel)), 0)
    expect([lines('python/minisgl/scheduler'), lines('python/minisgl/server')]).toEqual([846, 840])
    mentions('tr1.l3', 'packages', 'the scheduler package is 846 lines [measured] and the server package is 840 [measured]')
  })

  test("Mini-SGLang's package has the 8,090 physical lines that its claim counts", () => {
    const root = treeOf('sgl-project/mini-sglang', pin('mini-sglang').commit ?? '')
    const all = filesUnder(path.join(root, 'python/minisgl'), (name) => name.endsWith('.py')).reduce((sum, rel) => sum + wcLines(path.join(root, 'python/minisgl', rel)), 0)
    expect(all).toBe(8090)
    expect(mine.find((claim) => claim.id === 'mini-sglang.readme-lines')?.text).toContain('8,090 physical lines')
  })

  describe('the absences that the claims state', () => {
    /** The 1-based lines of every file under `dir` (relative to a tree) whose text matches. */
    function search(tree: string, dir: string, accept: (name: string) => boolean, pattern: RegExp): string[] {
      const root = path.join(tree, dir)
      return filesUnder(root, accept).flatMap((rel) =>
        linesOfFile(path.join(root, rel)).flatMap((line, i) => (pattern.test(line) ? [`${path.join(dir, rel)}:${i + 1}: ${line.trim()}`] : [])),
      )
    }
    const py = (name: string) => name.endsWith('.py')
    const nano = treeOf('GeeeekExplorer/nano-vllm', pin('nano-vllm').commit ?? '')
    const mini = treeOf('sgl-project/mini-sglang', pin('mini-sglang').commit ?? '')
    const now = treeOf('vllm-project/vllm', `v${pin('vllm').version}`)
    const post = treeOf('vllm-project/vllm', pin('inside-vllm').commit ?? '')

    test('nano-vllm has no zmq, asyncio, threading, stream, abort or cancel (nano-vllm.llm-is-the-engine)', () => {
      expect(search(nano, 'nanovllm', py, /zmq|asyncio|threading|stream|abort|cancel/i)).toEqual([])
    })

    test('Mini-SGLang has no speculation, grammar, adapter or disaggregation (mini-sglang.feature-list)', () => {
      expect(search(mini, 'python/minisgl', py, /speculat|grammar|lora|disagg/i)).toEqual([])
    })

    test('Mini-SGLang\'s server never reads n, stop or either penalty of a request (mini-sglang.accepted-and-ignored)', () => {
      const reads = search(mini, 'python/minisgl/server', (name) => name === 'api_server.py', /\.n\b|\.stop\b|presence_penalty|frequency_penalty/)
      // The fields are declared once each, in the request model, and the queues' own `.stop()` is not a field.
      expect(reads.filter((line) => !/\.stop\(\)/.test(line)).map((line) => line.replace(/^[^:]+:\d+: /, ''))).toEqual(['presence_penalty: float = 0.0', 'frequency_penalty: float = 0.0'])
    })

    test('vLLM at the pin has no VLLM_USE_V1, no req_to_block_hashes and no hash_request_tokens (vllm.env.no-use-v1, vllm.request.block-hashes)', () => {
      expect(search(now, 'vllm', py, /VLLM_USE_V1/)).toEqual([])
      expect(search(now, 'vllm', py, /req_to_block_hashes|hash_request_tokens/)).toEqual([])
    })

    test('FINISHED_IGNORED is in the enum and the finish-reason map and nowhere else (vllm.request.ignored-unassigned)', () => {
      expect(search(now, 'vllm', py, /FINISHED_IGNORED/).map((line) => line.replace(/:\d+:.*$/, ''))).toEqual(['vllm/v1/request.py', 'vllm/v1/request.py'])
    })

    test("the post's commit has no aborts_queue, and its engine core steps without one (inside-vllm.abort-input-queue, inside-vllm.step-three-calls)", () => {
      expect(search(post, 'vllm', py, /aborts_queue/)).toEqual([])
    })
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The post                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

describe.skipIf(!POST_FILE)('against the text of the post "Inside vLLM"', () => {
  const post = squash(POST_FILE === undefined ? '' : readFileSync(POST_FILE, 'utf8'))

  test('every claim that cites the post quotes it', () => {
    const problems = mine
      .filter((claim) => (claim.source?.url ?? '').startsWith('https://vllm.ai/'))
      .filter((claim) => !post.includes(squash(claim.source?.quote ?? '')))
      .map((claim) => claim.id)
    expect(problems).toEqual([])
  })
})
