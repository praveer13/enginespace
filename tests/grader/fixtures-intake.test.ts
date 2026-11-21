/*
 * W2b-T37: scripts/fixtures-intake.ts on throwaway bundles in temporary folders. The bundles are made from the grader's synthetic sample by changing the receipt's
 * notes (so that it no longer says "synthetic") and, for the refusals, by putting one personal thing into the log. Nothing is written under tests/fixtures/receipts/:
 * the committed manifest stays empty until the owner's runs (W2-T12) are taken in.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { fixtureName, FIXTURES_DIR, intake, main, Refused, sweepText } from '../../scripts/fixtures-intake'
import { root } from '../ci/support'

const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const scratch = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'es-intake-'))
  made.push(dir)
  return dir
}

type Doc = { receipt: { notes: string; stage: string; environment: { gpus: { name: string }[] } }; artifacts: Record<string, { encoding: string; data: unknown }> }

/** A bundle file in `dir`: the sample, with notes that do not say "synthetic", and `edit` applied. */
function bundleIn(dir: string, edit: (doc: Doc) => void = () => {}, name = 'in.es.json.gz'): string {
  const doc = JSON.parse(gunzipSync(readFileSync(path.join(root, 'tests/fixtures/grader/sample.es.json.gz'))).toString('utf8')) as Doc
  doc.receipt.notes = 'A throwaway bundle for the intake test.'
  doc.receipt.environment.gpus[0].name = 'NVIDIA GeForce RTX 4090'
  edit(doc)
  const file = path.join(dir, name)
  writeFileSync(file, gzipSync(JSON.stringify(doc)))
  return file
}

/** Built from pieces, so that this file holds no path of the kind that the publication sweep looks for. */
const HOME = ['/ho', 'me'].join('')
const MACHINE = { host: 'gpu-box-17', user: 'quentin', home: `${HOME}/quentin` }
const refusal = (run: () => unknown): string => {
  try {
    run()
  } catch (e) {
    if (e instanceof Refused) return e.message
    throw e
  }
  throw new Error('the intake took the bundle in')
}
/** The log artifact's text becomes `text`. */
const withLog = (text: string) => (doc: Doc) => {
  doc.artifacts.log = { encoding: 'text', data: text }
}

describe('the intake of a bundle', () => {
  test('takes a clean bundle in: copies its bytes, and lists its SHA-256, stage, GPU and date', () => {
    const dir = scratch()
    const source = bundleIn(dir)
    const target = scratch()
    const { entry, written } = intake(source, { dir: target, machine: MACHINE })
    expect(written).toBe(true)
    expect(entry.file).toBe('tr3-profile-s2-rtx-4090.es.json.gz')
    expect(readFileSync(path.join(target, entry.file))).toEqual(readFileSync(source))
    expect(entry.sha256).toBe(createHash('sha256').update(readFileSync(source)).digest('hex'))
    expect(entry).toMatchObject({ stage: 'tr3.profile.s2', gpu: 'NVIDIA GeForce RTX 4090', dated: '2026-11-05' })
    const manifest = JSON.parse(readFileSync(path.join(target, 'manifest.json'), 'utf8'))
    expect(manifest).toEqual({ schema: 'enginespace/receipt-fixtures@1', fixtures: [entry] })
  })

  test('refuses a bundle that holds a host name, and writes nothing', () => {
    const dir = scratch()
    const target = scratch()
    const source = bundleIn(dir, withLog('worker started on gpu-box-17 at noon\n'))
    const message = refusal(() => intake(source, { dir: target, machine: MACHINE }))
    expect(message).toContain('a host name at /artifacts/log/data')
    expect(message).not.toContain('gpu-box-17')
    expect(readdirSync(target)).toEqual([])
  })

  test('refuses a host name that has a domain, whoever the machine is', () => {
    const source = bundleIn(scratch(), withLog('connected to ip-10-0-0-5.ec2.internal\n'))
    expect(refusal(() => intake(source, { dir: scratch(), machine: {} }))).toContain('a host name')
  })

  test('refuses a name that --forbid lists, such as the pod\'s own host name, in a key as well as a value', () => {
    const source = bundleIn(scratch(), (doc) => {
      doc.artifacts['pod-4f3a9c1e7b02'] = { encoding: 'text', data: 'x' }
    })
    expect(refusal(() => intake(source, { dir: scratch(), machine: {}, forbid: ['pod-4f3a9c1e7b02'] }))).toContain('a name that --forbid lists')
  })

  test('refuses a user name, an absolute path, a UUID and an IP address', () => {
    const cases: [string, string, string][] = [
      ['a user name', 'run by quentin\n', 'a user name'],
      ['a path', 'weights in /workspace/models/qwen\n', 'an absolute path'],
      ['a home path', `cache at ${HOME}/someone/.cache/x\n`, 'an absolute path'],
      ['a windows path', 'cache at C:\\Users\\someone\\x\n', 'an absolute path'],
      ['a UUID', 'GPU-5a1c9e30-7b2d-4f68-9c41-e0d3a8b7f215\n', 'a UUID'],
      ['an IP', 'bound to 10.2.3.4\n', 'an IP address'],
    ]
    for (const [label, log, kind] of cases) {
      const source = bundleIn(scratch(), withLog(log))
      expect(refusal(() => intake(source, { dir: scratch(), machine: MACHINE })), label).toContain(kind)
    }
  })

  test('looks inside a base64 artifact', () => {
    const data = Buffer.from(`\x00\x01 opened ${HOME}/someone/trace.db \x02`, 'latin1').toString('base64')
    const source = bundleIn(scratch(), (doc) => {
      doc.artifacts.blob = { encoding: 'base64', data }
    })
    expect(refusal(() => intake(source, { dir: scratch(), machine: {} }))).toContain('/artifacts/blob/data (decoded)')
  })

  test('refuses a bundle that says it is synthetic, a file that is not a bundle, and one that lists no GPU', () => {
    const dir = scratch()
    const synthetic = bundleIn(dir, (doc) => {
      doc.receipt.notes = 'Synthetic: made by a test. No machine ran it.'
    })
    expect(refusal(() => intake(synthetic, { dir: scratch(), machine: {} }))).toContain('synthetic')
    const text = path.join(dir, 'text.es.json.gz')
    writeFileSync(text, 'not gzip')
    expect(refusal(() => intake(text, { dir: scratch() }))).toContain('not gzip')
    const json = path.join(dir, 'json.es.json.gz')
    writeFileSync(json, gzipSync('{"a":1}'))
    expect(refusal(() => intake(json, { dir: scratch() }))).toContain('not a bundle')
    const noGpu = bundleIn(dir, (doc) => {
      doc.receipt.environment.gpus.length = 0
    }, 'nogpu.es.json.gz')
    expect(refusal(() => intake(noGpu, { dir: scratch(), machine: {} }))).toContain('lists no GPU')
  })

  test('never overwrites a fixture and never lists a file twice', () => {
    const dir = scratch()
    const target = scratch()
    const first = bundleIn(dir)
    intake(first, { dir: target, machine: {} })
    expect(refusal(() => intake(first, { dir: target, machine: {} }))).toContain('already a fixture')
    const other = bundleIn(dir, withLog('another log\n'), 'other.es.json.gz')
    expect(refusal(() => intake(other, { dir: target, machine: {} }))).toContain('a fixture is never edited')
    intake(other, { dir: target, machine: {}, name: 'second.es.json.gz' })
    expect(JSON.parse(readFileSync(path.join(target, 'manifest.json'), 'utf8')).fixtures).toHaveLength(2)
  })

  test('--dry takes nothing in', () => {
    const target = scratch()
    const { written } = intake(bundleIn(scratch()), { dir: target, machine: {}, dry: true })
    expect(written).toBe(false)
    expect(readdirSync(target)).toEqual([])
  })

  test('the command line: 0 for a bundle taken in, 1 for a refusal with a message that names no text, 2 for a usage error', () => {
    const lines: string[] = []
    const errors: string[] = []
    const run = (...argv: string[]) => main(argv, (line) => lines.push(line), (line) => errors.push(line))
    const dir = scratch()
    const target = scratch()
    expect(run(bundleIn(dir), '--dir', target)).toBe(0)
    expect(lines[0]).toContain('took in tr3-profile-s2-rtx-4090.es.json.gz')
    const dirty = bundleIn(dir, withLog('on pod-4f3a9c1e7b02\n'), 'dirty.es.json.gz')
    expect(run(dirty, '--dir', target, '--forbid', 'pod-4f3a9c1e7b02')).toBe(1)
    expect(errors.join('\n')).not.toContain('pod-4f3a9c1e7b02')
    expect(run()).toBe(2)
    expect(run(dirty, '--nope')).toBe(2)
  })
})

describe('the sweep', () => {
  test('knows the shapes, and lets the things a receipt does hold through', () => {
    expect(sweepText('FULL_AND_PIECEWISE', [])).toEqual([])
    expect(sweepText('Qwen/Qwen3-0.6B at 6.0.0-example, sha 9693b60fa489e3718aeaf2b0bdbc3104af2625dbf9ad15294c3926ba73edef0d', [])).toEqual([])
    expect(sweepText('https://huggingface.co/models/x', [])).toEqual([])
    expect(sweepText('ann', [{ kind: 'a user name', value: 'ann' }])).toEqual(['a user name'])
    expect(sweepText('the channel', [{ kind: 'a user name', value: 'ann' }])).toEqual([])
    expect(sweepText('root', [])).toEqual([])
  })

  test('names a fixture from the stage and the GPU', () => {
    expect(fixtureName('tr8.replay.s2', 'NVIDIA H100 80GB HBM3')).toBe('tr8-replay-s2-h100-80gb-hbm3.es.json.gz')
  })
})

describe('the committed fixtures folder', () => {
  test('stays empty: its manifest lists no fixture until the owner\'s runs are taken in', () => {
    expect(JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'manifest.json'), 'utf8'))).toEqual({ schema: 'enginespace/receipt-fixtures@1', fixtures: [] })
    expect(existsSync(path.join(root, 'tests/fixtures/receipts'))).toBe(true)
    expect(readdirSync(FIXTURES_DIR).filter((name) => name.endsWith('.es.json.gz'))).toEqual([])
  })
})
