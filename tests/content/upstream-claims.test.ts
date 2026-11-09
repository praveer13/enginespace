/*
 * W1-T01's upstream claims (ARCHITECTURE §4.4, D-035): the claims about vLLM, SGLang and the reading targets that W1's modules cite.
 *
 *   - Every claim names a pin of course.lock.json, and cites a file at that pin's tag or commit, or a release page, a pull request, a
 *     PyPI page or the post it reads, with the lines of its quote, and with the day it was read. None cites main, latest or stable.
 *   - Every topic that W1-T01's goal lists has its claims, so a claim cannot be dropped without this test saying which topic lost it.
 *   - The documents that name a claim name one that exists, and content/claims/README.md carries the note on kernelspace's twins.
 *
 * The tests read the pins from the lockfile and never hold a version, a commit or a day of their own, so a re-pin that moves the lockfile,
 * the claims and their URLs together stays green, and a claim that still cites the old tag fails. They read the files that W1-T01 wrote
 * and ignore the files that other tasks add beside them. That each quote is the source's own text was checked when the claims were
 * written, against the tag's tarball and the pages; the README says how. The sources are on the network, and nothing here fetches them.
 */
import { describe, expect, test } from 'bun:test'
import { lockFileSchema } from '@es/schema/lock'
import type { LockEntry } from '@es/schema/lock'
import { compileContent } from '../../scripts/content/build.ts'
import { between, read as readDoc } from '../ci/support.ts'
import { LOCK_KEYS, repo } from './support.ts'

/** The files that W1-T01 wrote. A claims file that another task adds, in these folders or beside them, is that task's, and is not read here. */
const FILES = [
  'content/claims/readings.yaml',
  ...['engine', 'graphs', 'kv', 'spec', 'bench', 'release'].map((name) => `content/claims/vllm/${name}.yaml`),
  ...['engine', 'graphs', 'kv', 'spec', 'bench'].map((name) => `content/claims/sglang/${name}.yaml`),
]

const result = compileContent({ root: repo })
const upstream = result.claims.filter((record) => FILES.includes(record.file))
const ids = new Set(result.claims.map((record) => record.claim.id))

const lock = lockFileSchema.parse(JSON.parse(readDoc('course.lock.json')))
const entryOf = (pin: string): LockEntry => {
  const found = lock.entries.find((one) => one.key === pin)
  if (found === undefined) throw new Error(`course.lock.json has no ${pin}`)
  return found
}
const commitOf = (pin: string): string => entryOf(pin).commit ?? ''

/** The GitHub repository of each pin whose files a claim may cite. */
const REPOS: Record<string, string> = {
  vllm: 'vllm-project/vllm',
  sglang: 'sgl-project/sglang',
  'nano-vllm': 'GeeeekExplorer/nano-vllm',
  'mini-sglang': 'sgl-project/mini-sglang',
}

/** The one ref a file of this pin may be cited at: the tag of an engine's pinned version, or the commit of a reading target. */
const refOf = (pin: string): string => {
  const one = entryOf(pin)
  return one.kind === 'pypi' ? `v${one.version}` : commitOf(pin)
}

type Kind = 'blob' | 'release' | 'pull' | 'pypi' | 'post'

/** What kind of page a claim of this pin may cite at this URL, or null when none. */
function classify(pin: string, url: string): Kind | null {
  const one = entryOf(pin)
  const repoName = REPOS[pin]
  if (repoName !== undefined) {
    const base = `https://github.com/${repoName}`
    if (url.startsWith(`${base}/blob/`)) return url.startsWith(`${base}/blob/${refOf(pin)}/`) ? 'blob' : null
    if (one.kind === 'pypi' && url.startsWith(`${base}/releases/tag/`)) return /^v\d+\.\d+\.\d+(?:rc\d+)?$/.test(url.slice(`${base}/releases/tag/`.length)) ? 'release' : null
    if (url.startsWith(`${base}/pull/`) && /^\d+$/.test(url.slice(`${base}/pull/`.length))) return 'pull'
  }
  if (one.kind === 'pypi' && url === `https://pypi.org/pypi/${one.name}/${one.version}/json`) return 'pypi'
  if (one.kind === 'blog' && (url === one.url || url === `https://github.com/vllm-project/vllm/commit/${one.commit}.patch`)) return 'post'
  return null
}

describe('the upstream claims', () => {
  test('are many, and in every file that W1-T01 wrote', () => {
    expect(upstream.length).toBeGreaterThan(150)
    expect(FILES.filter((file) => !upstream.some((record) => record.file === file))).toEqual([])
  })

  test('each names a pin of the lockfile, and begins its id with the area of that pin', () => {
    for (const { claim } of upstream) {
      expect(claim.pin).toBeDefined()
      expect([claim.id, LOCK_KEYS.has(claim.pin ?? '')]).toEqual([claim.id, true])
      expect([claim.id, claim.id.startsWith(`${claim.pin}.`)]).toEqual([claim.id, true])
    }
  })

  test('name the commit of the pin in the header of their file, as the lockfile pins it', () => {
    for (const file of FILES) {
      const text = readDoc(file)
      for (const pin of new Set(upstream.filter((record) => record.file === file).map((record) => record.claim.pin ?? ''))) {
        expect([file, pin, text.includes(commitOf(pin))]).toEqual([file, pin, true])
      }
    }
  })

  test('are read from a source, and carry the day it was read, and are measured, or unverified where the source gives a number nobody has checked', () => {
    for (const { claim } of upstream) {
      expect(['measured', 'unverified']).toContain(claim.tag)
      expect(claim.source).toBeDefined()
      expect([claim.id, /^\d{4}-\d{2}-\d{2}$/.test(claim.source?.accessed ?? '')]).toEqual([claim.id, true])
      expect([claim.id, (claim.source?.accessed ?? '') <= claim.verifiedAt]).toEqual([claim.id, true])
      expect(claim.synthetic).toBeUndefined()
      if (claim.tag === 'unverified') expect([claim.id, /not been checked|unverified/i.test(claim.text)]).toEqual([claim.id, true])
    }
  })

  test('have a TTL of at most a year, and of at most a quarter when they cite a file at the pin', () => {
    for (const { claim } of upstream) {
      expect([claim.id, claim.ttlDays >= 1 && claim.ttlDays <= 365]).toEqual([claim.id, true])
      if (classify(claim.pin ?? '', claim.source?.url ?? '') === 'blob') expect([claim.id, claim.ttlDays <= 90]).toEqual([claim.id, true])
    }
  })

  test('cite a page at the pin, or a release, a pull request, a PyPI page or the post, and never main, latest or stable', () => {
    const bad = upstream.filter(({ claim }) => classify(claim.pin ?? '', claim.source?.url ?? '') === null).map(({ claim }) => `${claim.id} ${claim.source?.url}`)
    expect(bad).toEqual([])
    for (const { claim } of upstream) expect(claim.source?.url).not.toMatch(/\/(?:main|master|latest|stable|HEAD)(?:\/|#|$)/)
  })

  test('cite a file with the lines of the quote', () => {
    for (const { claim } of upstream) {
      const url = claim.source?.url ?? ''
      if (classify(claim.pin ?? '', url) !== 'blob') continue
      const lines = /#L(\d+)(?:-L(\d+))?$/.exec(url)
      expect([claim.id, lines !== null]).toEqual([claim.id, true])
      expect([claim.id, Number(lines?.[2] ?? lines?.[1]) >= Number(lines?.[1])]).toEqual([claim.id, true])
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
      expect([claim.id, /[.]\s*$/.test(claim.text)]).toEqual([claim.id, true])
      expect(['number', 'string']).toContain(typeof claim.value)
    }
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

  for (const [topic, claims] of topics) {
    test(`has its claims: ${topic}`, () => {
      expect(claims.filter((id) => !ids.has(id))).toEqual([])
    })
  }

  test('has the per-GPU defaults that W1-T12 reads, for the 4090’s tier and the H100’s, in both engines, each a number', () => {
    const wanted = [
      ...['small', 'large'].flatMap((tier) => [`vllm.batch-defaults.${tier}.server-tokens`, `vllm.batch-defaults.${tier}.offline-tokens`, `vllm.batch-defaults.${tier}.seqs`]),
      'sglang.cudagraph.decode-max-bs.small',
      'sglang.cudagraph.decode-max-bs.large',
      'sglang.sched.chunked-prefill-size.small',
      'sglang.sched.chunked-prefill-size.large',
    ]
    expect(wanted.filter((id) => !ids.has(id))).toEqual([])
    for (const id of wanted) {
      const value = result.claims.find((record) => record.claim.id === id)?.claim.value
      expect([id, typeof value === 'number' && Number.isInteger(value) && value > 0]).toEqual([id, true])
    }
  })
})

describe('the documents that name a claim', () => {
  const idPattern = /^(?:vllm|sglang|inside-vllm|nano-vllm|mini-sglang)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/
  /** The claim ids that a text writes in backticks. A name with a star, such as `vllm.kv-events.*`, is a family, and vllm.ai is a domain. */
  const named = (text: string): string[] => [...text.matchAll(/`([^`\s]+)`/g)].map((match) => match[1]).filter((token) => idPattern.test(token) && token !== 'vllm.ai')

  const architecture = readDoc('docs/ARCHITECTURE.md')
  const decisions = readDoc('docs/DECISIONS.md')
  /** The parts of the documents that W1-T01 wrote claim ids into: other parts may name Python modules, which look the same. */
  const events = between(architecture, '- **Events.**', '- **Invariants.**')
  const d034 = between(decisions, '### D-034 ·', '### D-035 ·')

  const sections: [string, string][] = [
    ['ARCHITECTURE §5.4’s events', events],
    ['D-034', d034],
    ['content/claims/README.md', readDoc('content/claims/README.md')],
  ]
  for (const [name, text] of sections) {
    test(`${name} names only claims that exist`, () => {
      expect(named(text).filter((id) => !ids.has(id))).toEqual([])
    })
  }

  test('ARCHITECTURE §5.4 names claims of both engines that resolve its KV event shapes, and no longer calls them unverified', () => {
    expect(architecture).not.toContain('[unverified until W1-T01 checks the pin]')
    expect(events).not.toContain('[unverified')
    const claims = named(events)
    expect(claims.some((id) => id.startsWith('vllm.kv-events.'))).toBe(true)
    expect(claims.some((id) => id.startsWith('sglang.kv-events.'))).toBe(true)
  })

  test('D-034 no longer says the shapes are unverified', () => {
    expect(d034).not.toContain('[unverified until W1-T01 checks the pin]')
  })
})

describe('content/claims/README.md', () => {
  const readme = readDoc('content/claims/README.md')

  test("has a note on what changed since kernelspace's twins, which sit at vLLM v0.31.0 and SGLang v0.5.21", () => {
    expect(readme).toContain("## What changed since kernelspace's twins")
    for (const word of ['v0.31.0', 'v0.5.21', 'twin.vllm.scheduler', 'twin.sglang.treecore']) expect(readme).toContain(word)
  })

  test('says that the sources were fetched with the generic User-Agent', () => {
    expect(readme).toContain('Mozilla/5.0 (X11; Linux x86_64)')
  })

  test('lists the folders and files that W1-T01 wrote', () => {
    for (const path of ['`vllm/`', '`sglang/`', '`readings.yaml`']) expect(readme).toContain(path)
  })
})
