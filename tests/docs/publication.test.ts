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
 *      D-060 answers O-2. It also says what is public as things stand: that `main`'s tip has been clean since PR #2 merged `wave-1`
 *      while the history of `main`, `wave-0` and `wave-1` still holds older versions, that a rewrite is the owner's call and needs a
 *      force-push of `main`, what the first deploy did, and, of the routine that the audit took for a translation, only what its
 *      header said and what the audit judged. Those facts were read from GitHub's API on 2026-11-09 and are tagged in the record,
 *      and the commits that it names are read from the history of the clone, when the clone has it (a shallow one does not).
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

/** git's exit status, from the repository's root: 0, or 1 for "no match" and "not an ancestor", or more for a commit that the clone does not have. */
function gitStatus(...args: string[]): number {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).status ?? -1
}

/** Built from pieces, so that this file does not match what it looks for: a local path, a session id, and the owner's login name. */
const PERSONAL = [['/ho', 'me/[a-z]'], ['/tm', 'p/claude'], ['9aec', '8729'], ['prav', 'eern']].map((pieces) => pieces.join('')).join('|')

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

  test('begin with a header that says what was translated and modified, whose copyright it is, and the licence of those parts', () => {
    const licence = 'Those parts carry vLLM\'s notice, "Copyright contributors to the vLLM project", and are under the Apache License 2.0; see NOTICE and LICENSES/Apache-2.0.txt'
    for (const file of ported) {
      const top = read(file)
        .split('\n')
        .slice(0, 8)
        .join(' ')
        .replace(/ (?:\/\/|\*|\/\*) /g, ' ')
        .replace(/\s+/g, ' ')
      for (const part of ['translated to TypeScript from vLLM v0.33.0', 'and modified', 'Copyright contributors to the vLLM project', licence]) {
        expect([file, top.includes(part)]).toEqual([file, true])
      }
      // The licence sentence has a subject, the translated parts. "Licensed under ..." with none reads as the licence of the whole file,
      // which is partly enginespace's own, and the licence of that is the owner's to give (O-3).
      expect([file, top.includes('Licensed under')]).toEqual([file, false])
      // ... so no file claims a licence for its own part with an SPDX line either.
      expect([file, /SPDX/.test(read(file))]).toEqual([file, false])
    }
  })

  test("NOTICE's section says the same: the Apache License is the licence of the translated parts, and not of the rest of each file, which is enginespace's own (O-3)", () => {
    const text = flat(vllm)
    expect(text).toContain("Those parts are under vLLM's licence, the Apache License 2.0, and carry vLLM's copyright line.")
    expect(text).toContain("That licence does not reach the rest of each of the three files, which is enginespace's own work: its licence is the owner's decision (O-3), and until it is decided the rest is all rights reserved.")
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

  describe("D-060's account of what is public", () => {
    const decisions = read('docs/DECISIONS.md')
    const record = flat(between(decisions, '### D-060 · ', '\n---\n'))
    /** D-nnn's record, from its heading to the next heading or rule. */
    const recordOf = (id: string): string => {
      const start = decisions.indexOf(`\n### ${id} · `)
      if (start < 0) throw new Error(`docs/DECISIONS.md has no record ${id}`)
      const rest = decisions.slice(start + 1)
      const end = rest.slice(5).search(/\n#{2,3} |\n---\n/)
      return end < 0 ? rest : rest.slice(0, end + 5)
    }

    test("keeps its rule for the tree and for new commits, and does not call history clean: it says what older versions carry, that main's tip has been clean since PR #2 merged wave-1 while its history is not, and that a rewrite is the owner's call and needs a force-push of main", () => {
      expect(record).toContain('From now on a committed file, fixture or commit message carries no local path, no session id and no login name.')
      expect(record).not.toContain('history included, and `wave-1` goes up after this record. A committed file')
      for (const needle of [
        '**`main`\'s tip is clean, and history is not.**',
        'Older versions of five files carry what the rule keeps out.',
        // The tip: it carried two of the paths until PR #2 merged wave-1, which holds wave-0's a4b3bdf, and it carries none now.
        '`main`\'s tip carried the paths of docs/TRACKER.md and research/upstream-vllm.md, in its root commit 4249418, until PR #2 merged `wave-1`, which holds `wave-0`\'s a4b3bdf',
        'PR #2 merged as 9b7736c at 06:59 UTC on 2026-11-09',
        'The tip carries none now',
        // The history: PR #2 was a merge commit, so main's history holds the old versions of all five files.
        '`main`\'s history holds the old versions of all five files, as `wave-1`\'s does',
        'PR #2 was a merge commit, with 4249418 and `wave-1`\'s tip, 597433f, as its parents',
        // A rewrite: the owner's call, and it reaches main's merge commits too.
        "Rewriting history to remove them is the owner's call, and this record does not make it",
        'It also changes `main`\'s merge commits (9b7736c and 1b402ca), and so needs a force-push of `main`',
      ]) {
        expect([needle, record.includes(needle)]).toEqual([needle, true])
      }
      // What stopped being true when PR #2 merged wave-1 into main, and what was never true of main's tip.
      for (const stale of ['`main`\'s tip is not yet', '`main`\'s one commit', 'carries them today', 'when `wave-0` merges', '`wave-1` goes up after this record']) {
        expect([stale, record.includes(stale)]).toEqual([stale, false])
      }
      // It names the five files, and quotes nothing of what they carry (the sweep below holds the tree to that, this record included).
      for (const file of ['AGENTS.md', 'docs/TRACKER.md', 'docs/waves/W0-report.md', 'research/upstream-vllm.md', 'tests/fixtures/play/broken-bench-flagged.json']) {
        expect([file, record.includes(file)]).toEqual([file, true])
      }
      // Every date and figure it adds is tagged where it stands: each of its measurements is named with its date, and the tip's with its SHA.
      expect(record).toContain('[measured 2026-11-09 at 1b402ca: the tree through GitHub\'s API')
    })

    test("records the chi-square generator's history without asserting what the audit only judged: the commit that held the routine, what its header said, what the audit took it for, the commit that replaced it, and the commits a rewrite would change", () => {
      const bullet = flat(between(decisions, "- **The chi-square generator's history.**", '\n  - The third-party material carries its notices.'))
      for (const needle of [
        'f6796c7',
        '72ca4e0',
        'DLMF §8.7 and §8.9',
        // What the header said, and what the audit took it for, with the tag that the audit's comparison was from memory of the book.
        "whose header said that Q came from Numerical Recipes' series for P and its Lentz continued fraction",
        "The licence audit of 2026-11-08 took it for a translation of the book's routines (finding licensing#5) [unverified against the book]",
        'the audit worked from memory of the book, with no copy to compare against',
        // The first version is in main's history too, and a rewrite of it reaches main's merge commits.
        'The first version stays in the history of `wave-1` and, since PR #2, of `main`',
        'would change the SHAs of the 142 commits after f6796c7',
        'and also `main`\'s merge commits (9b7736c and 1b402ca), so it would need a force-push of `main`',
        'The owner can still choose to rewrite it.',
      ]) {
        expect([needle, bullet.includes(needle)]).toEqual([needle, true])
      }
      // Neither "transliterated" nor "copied" is said of the routine as a plain fact: the audit's judgment is attributed.
      for (const plain of [/transliterat/i, /\bcopied\b/i, /\bcopy of Numerical/i]) expect([plain.source, plain.test(bullet)]).toEqual([plain.source, false])
    })

    test("names commits of this history and says of each what it did: where each of the five files first carried its path, where the path went out, and what the chi-square routine's two versions were", () => {
      // The clone must have the history: a shallow one, as the deploy's checkout makes, lacks the old commits, and then there is nothing to read.
      const has = (sha: string): boolean => gitStatus('cat-file', '-e', `${sha}^{commit}`) === 0
      const carries = (sha: string, file: string): boolean => gitStatus('grep', '-q', '-I', '-E', PERSONAL, sha, '--', file) === 0
      // Each file, the commit where it first carried its path, and the commit that took the path out: all of them are in the history bullet.
      const files: [string, string, string][] = [
        ['docs/TRACKER.md', '4249418', 'a4b3bdf'],
        ['research/upstream-vllm.md', '4249418', 'a4b3bdf'],
        ['AGENTS.md', '0dd073b', 'a4b3bdf'],
        ['docs/waves/W0-report.md', '5fe5192', 'a4b3bdf'],
        ['tests/fixtures/play/broken-bench-flagged.json', 'a405a96', '6b40104'],
      ]
      for (const [file, first, out] of files) {
        expect([file, first, record.includes(first)]).toEqual([file, first, true])
        if (has(first)) {
          expect([file, first, 'carries', carries(first, file)]).toEqual([file, first, 'carries', true])
          // It is the first: the commit before it does not (a root commit has none).
          expect([file, first, 'before', carries(`${first}^`, file)]).toEqual([file, first, 'before', false])
        }
        if (has(first) && has(out)) {
          // It is the one that took the path out: the commit before it carries the path, and it does not.
          expect([file, out, 'before', carries(`${out}^`, file)]).toEqual([file, out, 'before', true])
          expect([file, out, 'carries', carries(out, file)]).toEqual([file, out, 'carries', false])
          expect([file, first, out, gitStatus('merge-base', '--is-ancestor', first, out)]).toEqual([file, first, out, 0])
        }
      }
      expect(record).toContain("`wave-0`'s a4b3bdf")
      if (has('4249418')) expect(git('rev-list', '--max-parents=0', 'HEAD')).toEqual([expect.stringMatching(/^4249418/)])
      // The two versions of the chi-square generator: the first said what the record says it said, the second does not, and the table is the same.
      if (has('f6796c7') && has('72ca4e0')) {
        const header = "Q comes from Numerical Recipes' series for P when y < a + 1 and its Lentz continued fraction otherwise"
        expect(git('show', 'f6796c7:scripts/tables/chi-square-critical.ts').join('\n')).toContain(header)
        expect(git('show', '72ca4e0:scripts/tables/chi-square-critical.ts').join('\n')).not.toContain('Numerical Recipes')
        expect(gitStatus('diff', '--quiet', 'f6796c7', '72ca4e0', '--', 'packages/sim/spec/critical.ts')).toBe(0)
        expect(gitStatus('merge-base', '--is-ancestor', 'f6796c7', '72ca4e0')).toBe(0)
      }
    }, SLOW)

    test('records the first deploy: the run on the push of PR #2 failed twice at the tests, the run on the next push twice at setting up Bun, the first deploy that succeeded ran from main at 1b402ca, and Enforce HTTPS is still the owner\'s step', () => {
      const bullet = flat(between(decisions, '- **The first deploy.**', '\n  - The kits still ship as static downloads'))
      for (const needle of [
        'The deploy ran first on the push of PR #2\'s merge to `main` (9b7736c), and failed twice there, at `bun run test`',
        "two tests ran past Bun's limit of 5 s for a test that sets none",
        'PR #3 set that limit to 30 s [estimated], and merged as 1b402ca',
        'The run on 1b402ca then failed twice at "Set up pinned Bun"',
        "GitHub's release download of Bun 1.3.14 answered HTTP 504",
        "GitHub's status page had an incident open",
        'PR #4 is still open, and proposes to install the pinned Bun from npm when that download fails',
        'so the first deploy that succeeded ran from `main` at 1b402ca on 2026-11-09',
        'the Pages API reports no certificate and `https_enforced` false',
        "Enforce HTTPS is still the owner's step, or the orchestrator's when the owner asks for it, once GitHub issues the certificate",
      ]) {
        expect([needle, bullet.includes(needle)]).toEqual([needle, true])
      }
      // Each of its facts is tagged with its date, and the sources are named: GitHub's API, the logs of the attempts, and the status page.
      expect((bullet.match(/\[measured 2026-11-09[^\]]*\]/g) ?? []).length).toBeGreaterThanOrEqual(5)
      expect(bullet).toContain('https://www.githubstatus.com/api/v2/incidents.json')
      expect(bullet).not.toMatch(/HTTPS is enforced once|GitHub enforces HTTPS/)
    })

    test('names as pointing here only the records that do: each of them says D-060', () => {
      const named = /((?:D-\d{3}, )+D-\d{3} and D-\d{3}) point here/.exec(record)?.[1] ?? ''
      const ids = named.match(/D-\d{3}/g) ?? []
      // D-031 was on the list while its record said nothing of D-060.
      expect(ids.length).toBeGreaterThanOrEqual(5)
      expect(ids).toContain('D-031')
      expect(ids.filter((id) => !recordOf(id).includes('D-060'))).toEqual([])
    })

    test("gives enforcing HTTPS as the owner's action, once GitHub offers it, and does not say that it turns itself on", () => {
      expect(record).toContain('Enforcing HTTPS is the owner\'s step and does not turn itself on')
      for (const needle of ['"Enforce HTTPS" in Settings → Pages', '`https_enforced` through the Pages API', 'GitHub says the option can take up to 24 hours to become available', 'no certificate in the 110 minutes after the domain was set [measured 2026-11-08]']) {
        expect([needle, record.includes(needle)]).toEqual([needle, true])
      }
      expect(record).not.toMatch(/HTTPS is enforced once|GitHub enforces HTTPS/)
    })
  })

  test('no LICENSE or LICENSE-CONTENT file exists until the owner answers O-3', () => {
    const names = git('ls-files').filter((file) => !file.startsWith('vendor/') && /(^|\/)(LICENSE|LICENCE|COPYING)(-CONTENT)?(\.[a-z]+)?$/i.test(file))
    // The font licences sit beside the faces they cover, under public/fonts/.
    expect(names.filter((file) => !file.startsWith('public/fonts/'))).toEqual([])
  })
})

describe('the tree of a public repository', () => {
  test('no tracked text file carries a local path, a session id or the owner\'s login name', () => {
    expect(git('grep', '-n', '-I', '-E', PERSONAL, '--', '.', ':!package-lock.json').map((line) => line.slice(0, 200))).toEqual([])
  }, SLOW)
})
