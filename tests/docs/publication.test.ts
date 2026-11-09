/*
 * What a public repository has to carry (D-060): the third-party notices, the documents that no longer say "private", and a tree
 * with nothing personal in it.
 *
 *   1. LICENSES/Apache-2.0.txt is the Apache License 2.0 as apache.org publishes it, byte for byte, and NOTICE records its SHA-256.
 *   2. NOTICE has its five sections. The Mooncake bullet points at that text. The vLLM section names the upstream files that the
 *      headers of the three translated files name, and the Quoted excerpts section names every pin at which the lessons, the
 *      claims and the lifecycle model quote nano-vllm, Mini-SGLang, vLLM and SGLang, with each project's licence and copyright line.
 *   3. The three translated files begin with the header that says so, and carry no SPDX line (the licence of enginespace's own
 *      code is the owner's, O-3).
 *   4. The documents say that the repo is public and that enginespace's own work is all rights reserved until O-3 is answered, and
 *      D-060 answers O-2.
 *   5. No tracked text file carries a local path, a session id or the owner's login name.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { readVendorMd } from '../../scripts/vendor-drift'
import { between, read, root } from '../ci/support'

/** These tests start git, which a busy machine can stretch past bun's 5 s default. */
const SLOW = 30_000

/** git's output as lines, from the repository's root. */
function git(...args: string[]): string[] {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (run.status !== 0 && run.status !== 1) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`)
  return run.stdout.split('\n').filter((line) => line !== '')
}

const notice = read('NOTICE')

/** The line of equals signs above and below a section's name in NOTICE. */
const BAR = '='.repeat(76)
/** The sections that this task added or kept, in the order NOTICE gives them. A later section may join them. */
const SECTIONS = ['kernelspace', 'ts-fsrs', 'Fonts', 'vLLM', 'Quoted excerpts']
const headings = [...notice.matchAll(new RegExp(`^${BAR}\\n(.+)\\n${BAR}$`, 'gm'))].map((match) => ({ name: match[1], at: match.index ?? 0 }))
const section = (name: string): string => {
  const at = headings.findIndex((found) => found.name === name)
  if (at < 0) throw new Error(`NOTICE has no section "${name}"`)
  return notice.slice(headings[at].at, headings[at + 1]?.at ?? notice.length)
}
const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The Apache License 2.0 as https://www.apache.org/licenses/LICENSE-2.0.txt published it, fetched on 2026-11-08 [measured]. */
const APACHE_SHA256 = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'

describe('LICENSES/Apache-2.0.txt', () => {
  const file = 'LICENSES/Apache-2.0.txt'

  test("is the text that apache.org publishes, byte for byte, and NOTICE records the hash it was fetched with", () => {
    expect(createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')).toBe(APACHE_SHA256)
    expect(notice).toContain(APACHE_SHA256)
  })

  test("is the licence and not the font's copy: the appendix keeps its placeholders, and no copyright holder is named", () => {
    const text = read(file)
    expect(text).toContain('Apache License\n                           Version 2.0, January 2004')
    expect(text).toContain('END OF TERMS AND CONDITIONS')
    expect(text).toContain('Copyright [yyyy] [name of copyright owner]')
    expect(text).not.toContain('Font Diner')
  })

  test('is at the root and not under vendor/, where verify:vendor fails on a file that VENDOR.md does not list', () => {
    expect(existsSync(path.join(root, 'vendor/kernelspace/LICENSES'))).toBe(false)
    expect(git('ls-files', 'vendor').filter((tracked) => /apache/i.test(tracked))).toEqual([])
  })
})

describe('NOTICE', () => {
  test('has its five sections in order, and the opening lines name them and the Apache text', () => {
    const found = headings.map((heading) => heading.name)
    expect(found.filter((name) => SECTIONS.includes(name))).toEqual(SECTIONS)
    const opening = flat(notice.slice(0, notice.indexOf(BAR)))
    for (const name of SECTIONS) expect([name, opening.includes(name)]).toEqual([name, true])
    expect(opening).toContain('LICENSES/Apache-2.0.txt')
  })

  test("says that the licence of enginespace's own work is undecided (O-3) and that it is all rights reserved until then", () => {
    const opening = flat(notice.slice(0, notice.indexOf(BAR)))
    expect(opening).toContain("the owner's decision (O-3) and is not stated here")
    expect(opening).toContain('are all rights reserved')
  })

  test('ends the Mooncake bullet with a pointer to the Apache text and to apache.org, after saying that Mooncake has no NOTICE file', () => {
    const bullet = flat(between(notice, '- vendor/kernelspace/public/traces/kimi-conversation.json', '- vendor/kernelspace/src/lib/learner/fsrs.ts'))
    expect(bullet).toContain('Mooncake has no NOTICE file at the commit that the slice is cut from (b82b9f86ceb67bb809339b9088085f34329683bb')
    expect(bullet.endsWith('The text of the Apache License 2.0 is in LICENSES/Apache-2.0.txt (https://www.apache.org/licenses/LICENSE-2.0).')).toBe(true)
  })

  test("names every file under vendor/kernelspace/ that VENDOR.md does not list, because those are enginespace's own and not byte copies", () => {
    const listed = new Set(readVendorMd(root).rows.map((row) => row.path))
    const own = git('ls-files', 'vendor/kernelspace')
      .map((file) => file.slice('vendor/kernelspace/'.length))
      .filter((file) => !listed.has(file))
    expect(own).toEqual(expect.arrayContaining(['VENDOR.md', '.gitattributes']))
    for (const file of own) expect([file, notice.includes(file)]).toEqual([file, true])
    expect(notice).not.toMatch(/The files under vendor\/kernelspace\/ are copied, byte for byte/)
  })
})

describe('the three files that translate parts of vLLM', () => {
  const ported = ['packages/sim/steploop/graphs.ts', 'tests/sim/graphs-oracle.ts', 'tests/sim/kv-support.ts']
  const vllm = section('vLLM')

  test('begin with a header that says what was translated and modified, whose copyright it is, and the licence', () => {
    for (const file of ported) {
      const top = read(file)
        .split('\n')
        .slice(0, 8)
        .join(' ')
        .replace(/ (?:\/\/|\*|\/\*) /g, ' ')
        .replace(/\s+/g, ' ')
      for (const part of ['translated to TypeScript from vLLM v0.33.0', 'and modified', 'Copyright contributors to the vLLM project', 'Licensed under the Apache License 2.0; see NOTICE and LICENSES/Apache-2.0.txt']) {
        expect([file, top.includes(part)]).toEqual([file, true])
      }
      // The licence of enginespace's own files is the owner's to give (O-3): no file claims one with an SPDX line.
      expect([file, /SPDX/.test(read(file))]).toEqual([file, false])
    }
  })

  test("name upstream files that NOTICE's vLLM section names too, and the pin and the copyright line that it gives", () => {
    expect(vllm).toContain('4ba787ec9959e566d3b587a796dff07673324da5')
    expect(vllm).toContain('Copyright contributors to the vLLM project')
    expect(vllm).toContain('LICENSES/Apache-2.0.txt')
    for (const file of ported) {
      const upstream = new Set([...read(file).split('\n').slice(0, 40).join('\n').matchAll(/\bvllm\/[A-Za-z0-9_/]+\.py\b/g)].map((match) => match[0]))
      expect(upstream.size).toBeGreaterThan(1)
      for (const name of upstream) expect([file, name, vllm.includes(name)]).toEqual([file, name, true])
      expect([file, vllm.includes(file)]).toEqual([file, true])
    }
  })
})

describe('the Quoted excerpts section', () => {
  const quoted = section('Quoted excerpts')
  const lock = JSON.parse(read('course.lock.json')) as { entries: { key: string; commit?: string }[] }
  const files = (dir: string, ending: string): string[] => git('ls-files', dir).filter((file) => file.endsWith(ending))

  test('names the commit that course.lock.json pins for each quoted project, with its licence and its exact copyright line', () => {
    for (const key of ['nano-vllm', 'mini-sglang', 'inside-vllm', 'vllm', 'sglang']) {
      const commit = lock.entries.find((entry) => entry.key === key)?.commit ?? ''
      expect([key, commit.length, quoted.includes(commit)]).toEqual([key, 40, true])
    }
    for (const line of ['Copyright (c) 2025 Xingkai Yu', 'Copyright (c) 2026 sgl-project', 'Copyright contributors to the vLLM project', 'Copyright 2023-2024 SGLang Team']) {
      expect([line, quoted.includes(line)]).toEqual([line, true])
    }
    expect(flat(quoted)).toContain('Apache License, Version 2.0 (LICENSES/Apache-2.0.txt)')
    expect(quoted.match(/Permission is hereby granted/g)?.length).toBe(1)
  })

  test('names every pin at which a TR1 lesson quotes an excerpt: five, as the lessons head their blocks', () => {
    const pins = new Set<string>()
    for (const lesson of readdirSync(path.join(root, 'content/modules/tr1/lessons'))) {
      for (const match of read(`content/modules/tr1/lessons/${lesson}`).matchAll(/^# \S+, lines? \d+(?: to \d+)? at (\S+)$/gm)) pins.add(match[1])
    }
    expect([...pins].sort()).toEqual(['42172ad', '9a91cfa', 'bb823b3', 'v0.33.0', 'v0.5.23'])
    for (const pin of pins) expect([pin, quoted.includes(pin)]).toEqual([pin, true])
  })

  test('names every ref at which a claim or the lifecycle model quotes one of the four projects', () => {
    const refs = new Set<string>()
    const projects = 'vllm-project\\/vllm|sgl-project\\/sglang|sgl-project\\/mini-sglang|GeeeekExplorer\\/nano-vllm'
    const cited = new RegExp(`https://github\\.com/(?:${projects})/blob/([^/\\s#"']+)/`, 'g')
    for (const file of files('content/claims', '.yaml')) for (const match of read(file).matchAll(cited)) refs.add(match[1])
    for (const file of files('packages/sim/lifecycle/engines', '.ts')) for (const match of read(file).matchAll(/^const REF = '([0-9a-f]{40})'/gm)) refs.add(match[1])
    expect(refs.size).toBeGreaterThanOrEqual(5)
    for (const ref of refs) expect([ref, quoted.includes(ref)]).toEqual([ref, true])
  })

  test('says that the excerpts stay under their own licences', () => {
    expect(flat(quoted)).toContain('The excerpts stay under their own licences')
  })
})

describe('the documents of a public repository (D-060)', () => {
  test("README.md and PRODUCT.md say that the repo has been public since 2026-11-08, and that enginespace's own work is all rights reserved until O-3 is answered", () => {
    for (const file of ['README.md', 'PRODUCT.md']) {
      const text = flat(read(file))
      expect([file, text.includes('public since 2026-11-08')]).toEqual([file, true])
      expect([file, text.includes('all rights reserved')]).toEqual([file, true])
      expect([file, text.includes('O-3')]).toEqual([file, true])
    }
  })

  test('none of the documents and comments that spoke of a private repository or a site that is not live still does', () => {
    const stale = [/private for now(?! \()/i, /\b(?:repo|repository) is private\b/i, /nothing here is live/i, /when the repo goes public/i, /pages on a private repo/i, /until the owner answers O-2/i]
    const files = ['README.md', 'PRODUCT.md', 'AGENTS.md', 'docs/ARCHITECTURE.md', 'docs/PLAN.md', '.github/workflows/deploy.yml', 'scripts/pack-labs.ts', 'labs/forge/README.md']
    const found = files.flatMap((file) => stale.filter((pattern) => pattern.test(read(file))).map((pattern) => `${file}: ${pattern}`))
    expect(found).toEqual([])
  })

  test("D-060 answers O-2 as the owner's decision of 2026-11-08, and O-3 stays open with its old default superseded", () => {
    const decisions = read('docs/DECISIONS.md')
    expect(decisions).toMatch(/^\| D-060 \| [^\n]*\| owner-decided 2026-11-08 \|$/m)
    const record = between(decisions, '### D-060 · ', '\n---\n')
    expect(record).toContain('- **Status:** owner-decided 2026-11-08.')
    for (const needle of ['`workflow_dispatch`', '`PAGES_ENABLED`', 'LICENSES/Apache-2.0.txt', 'Mooncake', 'agent-kit', 'all rights reserved']) expect([needle, record.includes(needle)]).toEqual([needle, true])
    const open = between(decisions, '## Open owner questions', '**Answered.**')
    expect(open).not.toMatch(/^\| O-2 \|/m)
    expect(open).toMatch(/^\| O-3 \|[^\n]*all rights reserved[^\n]*\(D-060\)[^\n]*\| W3-T15 \|$/m)
    expect(between(decisions, '**Answered.**', '**Carried over by the W0 exit review')).toContain('**O-2**')
  })

  test('no LICENSE or LICENSE-CONTENT file exists until the owner answers O-3', () => {
    const names = git('ls-files').filter((file) => !file.startsWith('vendor/') && /(^|\/)(LICENSE|LICENCE|COPYING)(-CONTENT)?(\.[a-z]+)?$/i.test(file))
    // The font licences sit beside the faces they cover, under public/fonts/.
    expect(names.filter((file) => !file.startsWith('public/fonts/'))).toEqual([])
  })
})

describe('the tree of a public repository', () => {
  /** Built from pieces, so that this file does not match what it looks for: a local path, a session id, and the owner's login name. */
  const personal = [['/ho', 'me/[a-z]'], ['/tm', 'p/claude'], ['9aec', '8729'], ['prav', 'eern']].map((pieces) => pieces.join('')).join('|')

  test('no tracked text file carries a local path, a session id or the owner\'s login name', () => {
    expect(git('grep', '-n', '-I', '-E', personal, '--', '.', ':!package-lock.json').map((line) => line.slice(0, 200))).toEqual([])
  }, SLOW)
})
