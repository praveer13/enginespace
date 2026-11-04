/*
 * W1-T01's upstream claims (ARCHITECTURE §4.4, D-035): the claims about vLLM, SGLang and the reading targets that W1's modules cite.
 *
 *   - Every claim names a pin of course.lock.json, and cites a file at that pin's tag or commit, or a release page, a pull request, a
 *     PyPI page or the post it reads, with the lines of its quote, and with the day it was read. None cites main, latest or stable.
 *   - Every topic that W1-T01's goal lists has its claims, so a claim cannot be dropped without this test saying which topic lost it.
 *   - The documents that name a claim name one that exists, and content/claims/README.md carries the note on kernelspace's twins.
 *
 * That each quote is the source's own text was checked when the claims were written, against the tag's tarball and the pages; the
 * README says how. The sources are on the network, and nothing here fetches them.
 */
import { describe, expect, test } from 'bun:test'
import { compileContent } from '../../scripts/content/build.ts'
import { read as readDoc, trackerTasks } from '../ci/support.ts'
import { LOCK_KEYS, repo } from './support.ts'

const result = compileContent({ root: repo })
const upstream = result.claims.filter(
  (record) => record.file === 'content/claims/readings.yaml' || record.file.startsWith('content/claims/vllm/') || record.file.startsWith('content/claims/sglang/'),
)
const ids = new Set(result.claims.map((record) => record.claim.id))

const NANO = 'bb823b3e06983d71485a8e1f23715ebd87d98ef8'
const MINI = '9a91cfafe754aa85daee49998176275667eb58f2'
const VLLM_COMMIT = '4ba787ec9959e566d3b587a796dff07673324da5'
const INSIDE = '42172ad18fbc22c89d0063184e4570cc84186e16'

/** The repository, and the one ref, of each pin whose files a claim may cite by a blob URL. */
const BLOB: Record<string, { repo: string; ref: string }> = {
  vllm: { repo: 'vllm-project/vllm', ref: 'v0.33.0' },
  sglang: { repo: 'sgl-project/sglang', ref: 'v0.5.23' },
  'nano-vllm': { repo: 'GeeeekExplorer/nano-vllm', ref: NANO },
  'mini-sglang': { repo: 'sgl-project/mini-sglang', ref: MINI },
}
/** The release pages that a claim may cite, which hold what a release says about itself and the day a default changed. */
const RELEASES: Record<string, { repo: string; tags: string[] }> = {
  vllm: { repo: 'vllm-project/vllm', tags: ['v0.14.0', 'v0.29.0', 'v0.33.0', 'v0.33.0rc3'] },
  sglang: { repo: 'sgl-project/sglang', tags: ['v0.5.21', 'v0.5.22', 'v0.5.23'] },
}
const PULLS: Record<string, string[]> = { sglang: ['https://github.com/sgl-project/sglang/pull/35798'] }
const PYPI: Record<string, string[]> = {
  vllm: ['https://pypi.org/pypi/vllm/0.33.0/json'],
  sglang: ['https://pypi.org/pypi/sglang/0.5.23/json'],
}
const POSTS: Record<string, string[]> = {
  'inside-vllm': ['https://vllm.ai/blog/2025-09-05-anatomy-of-vllm', `https://github.com/vllm-project/vllm/commit/${INSIDE}.patch`],
}

type Kind = 'blob' | 'release' | 'pull' | 'pypi' | 'post'

/** What kind of page a claim of this pin may cite at this URL, or null when none. */
function classify(pin: string, url: string): Kind | null {
  const blob = BLOB[pin]
  if (blob !== undefined && url.startsWith(`https://github.com/${blob.repo}/blob/`)) {
    return url.startsWith(`https://github.com/${blob.repo}/blob/${blob.ref}/`) ? 'blob' : null
  }
  const release = RELEASES[pin]
  if (release !== undefined && release.tags.some((tag) => url === `https://github.com/${release.repo}/releases/tag/${tag}`)) return 'release'
  if (PULLS[pin]?.includes(url) === true) return 'pull'
  if (PYPI[pin]?.includes(url) === true) return 'pypi'
  if (POSTS[pin]?.includes(url) === true) return 'post'
  return null
}

describe('the upstream claims', () => {
  test('are many, and in the files that W1-T01 wrote', () => {
    expect(upstream.length).toBeGreaterThan(150)
    expect(new Set(upstream.map((record) => record.file))).toEqual(
      new Set([
        'content/claims/readings.yaml',
        ...['engine', 'graphs', 'kv', 'spec', 'bench', 'release'].map((name) => `content/claims/vllm/${name}.yaml`),
        ...['engine', 'graphs', 'kv', 'spec', 'bench'].map((name) => `content/claims/sglang/${name}.yaml`),
      ]),
    )
  })

  test('each names a pin of the lockfile, and begins its id with the area of that pin', () => {
    for (const { claim } of upstream) {
      expect(claim.pin).toBeDefined()
      expect([claim.id, LOCK_KEYS.has(claim.pin ?? '')]).toEqual([claim.id, true])
      expect([claim.id, claim.id.startsWith(`${claim.pin}.`)]).toEqual([claim.id, true])
    }
  })

  test('are read from a source, on the day the lockfile was checked, and are measured, or unverified where the source gives a number we have not checked', () => {
    const unverified = upstream.filter(({ claim }) => claim.tag === 'unverified').map(({ claim }) => claim.id)
    expect(unverified).toEqual(['nano-vllm.readme-lines'])
    for (const { claim } of upstream) {
      expect(['measured', 'unverified']).toContain(claim.tag)
      expect(claim.source).toBeDefined()
      expect(claim.source?.accessed).toBe('2026-11-04')
      expect(claim.verifiedAt).toBe('2026-11-04')
      expect(claim.synthetic).toBeUndefined()
    }
  })

  test('have a TTL of 90 days, or 365 for the history of a release', () => {
    for (const { claim } of upstream) expect([claim.id, [90, 365].includes(claim.ttlDays)]).toEqual([claim.id, true])
  })

  test('cite a page at the pin, or a release, a pull request, a PyPI page or the post, and never main, latest or stable', () => {
    const bad = upstream.filter(({ claim }) => classify(claim.pin ?? '', claim.source?.url ?? '') === null).map(({ claim }) => `${claim.id} ${claim.source?.url}`)
    expect(bad).toEqual([])
    for (const { claim } of upstream) expect(claim.source?.url).not.toMatch(/\/(?:main|master|latest|stable|HEAD)(?:\/|#|$)/)
  })

  test('cite a file with the lines of the quote, and have a TTL of 90 days; a page that holds history has a TTL of a year', () => {
    for (const { claim } of upstream) {
      const url = claim.source?.url ?? ''
      const kind = classify(claim.pin ?? '', url)
      if (kind === 'blob') {
        const lines = /#L(\d+)(?:-L(\d+))?$/.exec(url)
        expect([claim.id, lines !== null]).toEqual([claim.id, true])
        expect([claim.id, Number(lines?.[2] ?? lines?.[1]) >= Number(lines?.[1])]).toEqual([claim.id, true])
        expect([claim.id, claim.ttlDays]).toEqual([claim.id, 90])
      }
      if (claim.ttlDays === 365) expect([claim.id, kind]).not.toEqual([claim.id, 'blob'])
    }
  })

  test('quote the source in its own words, which are not blank and not a page', () => {
    for (const { claim } of upstream) {
      const quote = claim.source?.quote ?? ''
      expect([claim.id, quote.trim().length > 8]).toEqual([claim.id, true])
      expect([claim.id, quote.length <= 260]).toEqual([claim.id, true])
      expect(claim.source?.title.trim().length).toBeGreaterThan(8)
    }
  })

  test('say what they claim in a sentence, and carry a number only as a number or a string', () => {
    for (const { claim } of upstream) {
      expect([claim.id, /[.]$/.test(claim.text) || /[.]\s*$/.test(claim.text)]).toEqual([claim.id, true])
      expect(['number', 'string']).toContain(typeof claim.value)
    }
  })

  test('cite the v0.33.0 commit and the SGLang commit as the lockfile pins them', () => {
    const lock = JSON.parse(readDoc('course.lock.json')) as { entries: { key: string; commit?: string }[] }
    expect(lock.entries.find((entry) => entry.key === 'vllm')?.commit).toBe(VLLM_COMMIT)
    for (const file of ['engine', 'graphs', 'kv', 'spec', 'bench', 'release']) expect(readDoc(`content/claims/vllm/${file}.yaml`)).toContain(VLLM_COMMIT)
  })
})

describe('the topics of W1-T01’s goal', () => {
  /** The words of the tracker’s goal that each group answers, and the claims that answer them. */
  const topics: [string, string[]][] = [
    ['async scheduling', ['vllm.async-scheduling.default', 'vllm.async-scheduling.tri-state', 'vllm.async-scheduling.since', 'vllm.async-scheduling.mrv1-limits', 'sglang.overlap.default', 'sglang.overlap.loop']],
    ['MRV2 as the default runner', ['vllm.mrv2.default-since', 'vllm.mrv2.default-rule', 'vllm.mrv2.fallback-reasons', 'vllm.mrv1.deprecated', 'vllm.mrv1.still-ships']],
    [
      'CUDA-graph modes',
      [
        'vllm.cudagraph.modes',
        'vllm.cudagraph.default-mode',
        'vllm.cudagraph.capture-sizes',
        'vllm.cudagraph.mrv1-key',
        'vllm.cudagraph.mrv1-dispatch',
        'vllm.cudagraph.mrv2-key',
        'vllm.cudagraph.mrv2-dispatch',
        'vllm.cudagraph.design-doc-key',
        'sglang.cudagraph.backends',
        'sglang.cudagraph.decode-buckets',
        'sglang.cudagraph.prefill-buckets',
        'sglang.cudagraph.decode-max-bs.small',
      ],
    ],
    ['graph memory reserved before KV sizing', ['vllm.cudagraph.memory-before-kv', 'vllm.cudagraph.memory-subtracted', 'vllm.cudagraph.memory-estimate-default', 'vllm.cudagraph.memory-profiling-since']],
    [
      'KV event shapes',
      [
        'vllm.kv-events.batch',
        'vllm.kv-events.block-stored',
        'vllm.kv-events.block-removed',
        'vllm.kv-events.all-blocks-cleared',
        'vllm.kv-events.zmq-frames',
        'sglang.kv-events.encoding',
        'sglang.kv-events.batch',
        'sglang.kv-events.block-stored',
        'sglang.kv-events.block-removed',
      ],
    ],
    ['hybrid KV groups with N-group lookup', ['vllm.hybrid-kv.single-pool', 'vllm.hybrid-kv.intersection', 'vllm.hybrid-kv.doc-two-groups', 'vllm.hybrid-kv.n-group-lookup']],
    [
      'adapter slots in both engines',
      ['vllm.lora.max-loras-default', 'vllm.lora.slot-count', 'vllm.lora.cpu-cache', 'vllm.lora.admission-cap', 'vllm.lora.s-lora-scope', 'sglang.lora.max-loras-per-batch', 'sglang.lora.pool', 'sglang.lora.slot-search'],
    ],
    ['SupportsHMA', ['vllm.hybrid-kv.supports-hma', 'vllm.hybrid-kv.auto-off-connector']],
    ['speculative methods', ['vllm.spec.methods', 'vllm.spec.medusa-removed', 'vllm.spec.rejection-methods', 'vllm.spec.rejection-sampler.exact', 'sglang.spec.algorithms', 'sglang.spec.pr-35798']],
    ['mask overlap in both engines', ['vllm.mask.overlap', 'vllm.mask.deferred-sampling', 'vllm.mask.fill-parallel-threshold', 'sglang.mask.delayed-sampling', 'sglang.mask.grammar-barrier']],
    [
      '`vllm bench serve` defaults and traps',
      [
        'vllm.bench.request-rate-default',
        'vllm.bench.max-concurrency-closed-loop',
        'vllm.bench.client-queue-time',
        'vllm.bench.num-warmups-default',
        'vllm.bench.metric-percentiles-default',
        'vllm.bench.arrival-rescale',
        'vllm.bench.prefix-cache-reuse',
      ],
    ],
  ]

  const goal = (trackerTasks().get('W1-T01') ?? '').split('\n').slice(0, 30).join('\n')

  test('the tracker’s goal lists each topic, so the table cannot drift from it', () => {
    expect(goal).toContain('A claim for every upstream fact that a W1 module cites')
    for (const [topic] of topics) expect([topic, goal.includes(topic)]).toEqual([topic, true])
  })

  for (const [topic, claims] of topics) {
    test(`has its claims: ${topic}`, () => {
      expect(claims.filter((id) => !ids.has(id))).toEqual([])
    })
  }

  test('has the per-GPU defaults that W1-T12 reads, for the 4090’s tier and the H100’s, in both engines', () => {
    const wanted = [
      ...['small', 'large'].flatMap((tier) => [`vllm.batch-defaults.${tier}.server-tokens`, `vllm.batch-defaults.${tier}.offline-tokens`, `vllm.batch-defaults.${tier}.seqs`]),
      'sglang.cudagraph.decode-max-bs.small',
      'sglang.cudagraph.decode-max-bs.large',
      'sglang.sched.chunked-prefill-size.small',
      'sglang.sched.chunked-prefill-size.large',
    ]
    expect(wanted.filter((id) => !ids.has(id))).toEqual([])
    const value = (id: string) => result.claims.find((record) => record.claim.id === id)?.claim.value
    expect([value('vllm.batch-defaults.small.server-tokens'), value('vllm.batch-defaults.small.offline-tokens'), value('vllm.batch-defaults.small.seqs')]).toEqual([2048, 8192, 256])
    expect([value('vllm.batch-defaults.large.server-tokens'), value('vllm.batch-defaults.large.offline-tokens'), value('vllm.batch-defaults.large.seqs')]).toEqual([8192, 16384, 1024])
    expect([value('sglang.cudagraph.decode-max-bs.small'), value('sglang.cudagraph.decode-max-bs.large')]).toEqual([48, 256])
  })
})

describe('the documents that name a claim', () => {
  const idPattern = /^(?:vllm|sglang|inside-vllm|nano-vllm|mini-sglang)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/
  /** The claim ids that a document writes in backticks. A name with a star, such as `vllm.kv-events.*`, is a family, and vllm.ai is a domain. */
  const named = (file: string): string[] =>
    [...readDoc(file).matchAll(/`([^`\s]+)`/g)].map((match) => match[1]).filter((token) => idPattern.test(token) && token !== 'vllm.ai')

  for (const file of ['docs/ARCHITECTURE.md', 'docs/DECISIONS.md', 'content/claims/README.md']) {
    test(`${file} names only claims that exist`, () => {
      expect(named(file).filter((id) => !ids.has(id))).toEqual([])
    })
  }

  test('ARCHITECTURE §5.4 names the claims that resolve its KV event shapes', () => {
    const architecture = readDoc('docs/ARCHITECTURE.md')
    expect(architecture).not.toContain('[unverified until W1-T01 checks the pin]')
    for (const id of ['sglang.kv-events.encoding', 'vllm.kv-events.adapter-field', 'sglang.kv-events.adapter-field', 'vllm.kv-hash.lora-extra-key']) expect(architecture).toContain(`\`${id}\``)
  })

  test('D-034 no longer says the shapes are unverified', () => {
    expect(readDoc('docs/DECISIONS.md')).not.toContain('[unverified until W1-T01 checks the pin]')
  })
})

describe('content/claims/README.md', () => {
  const readme = readDoc('content/claims/README.md')

  test("has a note on what changed since kernelspace's twins, which sit at vLLM v0.31.0 and SGLang v0.5.21", () => {
    expect(readme).toContain("## What changed since kernelspace's twins")
    for (const word of ['v0.31.0', 'v0.33.0', 'v0.5.21', 'v0.5.23', 'twin.vllm.scheduler', 'twin.sglang.treecore']) expect(readme).toContain(word)
  })

  test('says that the sources were fetched with the generic User-Agent', () => {
    expect(readme).toContain('Mozilla/5.0 (X11; Linux x86_64)')
  })

  test('lists the files of the folder, and the folder has no other claims file', () => {
    for (const path of ['`vllm/`', '`sglang/`', '`readings.yaml`', '`loop.yaml`', '`sample.yaml`']) expect(readme).toContain(path)
    const files = new Set(result.claims.map((record) => record.file.split('/')[2]))
    expect([...files].sort()).toEqual(['loop.yaml', 'readings.yaml', 'sample.yaml', 'sglang', 'vllm'])
  })
})
