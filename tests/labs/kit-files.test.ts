/*
 * W2b-T30: the files a graded lab's page links, read from public/labs/manifest.json by kind (src/labs/kit-files.ts). The committed list has
 * the GPU-lane kit, the grader wheel and the forge labs' crates; an entry that does not say its kind, name, size and hash plainly is passed
 * over, so the page never prints a hash it does not trust.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { checkLineOf, fileFor, parseKitFiles } from '../../src/labs/kit-files'

const root = path.resolve(import.meta.dirname, '../..')
const body = JSON.parse(readFileSync(path.join(root, 'public/labs/manifest.json'), 'utf8')) as { files: Record<string, unknown>[] }
const SHA = 'a'.repeat(64)

describe('the committed list', () => {
  const files = parseKitFiles(body)

  test('gives every entry of the manifest, each with its kind, name, size and hash', () => {
    expect(files).toHaveLength(body.files.length)
    for (const [at, entry] of body.files.entries()) expect(files[at]).toMatchObject({ kind: entry.kind, name: entry.name, bytes: entry.bytes, sha256: entry.sha256 })
  })

  test('finds the file of each kind a graded lab links, and a crate by its lab', () => {
    expect(fileFor(files, { kind: 'gpu-kit' })?.name).toMatch(/^enginespace-gpu-kit-.*\.zip$/)
    expect(fileFor(files, { kind: 'grader-wheel' })?.name).toMatch(/^enginespace_grader-.*\.whl$/)
    expect(fileFor(files, { kind: 'forge-lab', lab: 'hybrid-kv' })?.name).toBe('enginespace-hybrid-kv.zip')
    expect(fileFor(files, { kind: 'forge-lab', lab: 'no-such-lab' })).toBeUndefined()
  })

  test('checks a download with the line sha256sum -c reads', () => {
    const wheel = fileFor(files, { kind: 'grader-wheel' })!
    expect(checkLineOf(wheel)).toBe(`echo '${wheel.sha256}  ${wheel.name}' | sha256sum -c`)
  })
})

describe('an entry that does not say what it is plainly', () => {
  const one = (entry: Record<string, unknown>) => parseKitFiles({ files: [entry] })

  test('is passed over', () => {
    expect(one({ kind: 'gpu-kit', name: 'kit.zip', bytes: 10, sha256: SHA })).toHaveLength(1)
    expect(one({ kind: 'other', name: 'kit.zip', bytes: 10, sha256: SHA })).toEqual([])
    expect(one({ kind: 'gpu-kit', name: '../kit.zip', bytes: 10, sha256: SHA })).toEqual([])
    expect(one({ kind: 'gpu-kit', name: "kit'.zip", bytes: 10, sha256: SHA })).toEqual([])
    expect(one({ kind: 'gpu-kit', name: 'kit.exe', bytes: 10, sha256: SHA })).toEqual([])
    expect(one({ kind: 'gpu-kit', name: 'kit.zip', bytes: -1, sha256: SHA })).toEqual([])
    expect(one({ kind: 'gpu-kit', name: 'kit.zip', bytes: 1.5, sha256: SHA })).toEqual([])
    expect(one({ kind: 'gpu-kit', name: 'kit.zip', bytes: 10, sha256: SHA.toUpperCase() })).toEqual([])
    expect(one({ kind: 'forge-lab', name: 'enginespace-toy.zip', bytes: 10, sha256: SHA })).toEqual([])
  })

  test('and a list that is not one is an error', () => {
    expect(() => parseKitFiles({})).toThrow()
    expect(() => parseKitFiles(null)).toThrow()
  })
})
