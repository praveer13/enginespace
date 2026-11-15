/*
 * W1b-T08, acceptance 1 and 2: each forge lab's page hands over its crate. The page links `/labs/enginespace-<lab>.zip` with the size and the
 * SHA-256 that `public/labs/manifest.json` gives it, and prints a line that checks a download against that hash. A real browser fetches the
 * link and hashes the bytes it gets in e2e/lab-kits.spec.ts; this file holds the pieces without one:
 *
 *   - the manifest, the registry and the packer's names agree, so that no zip is left without a page and no page without a zip;
 *   - what the page prints is the manifest's, and the manifest's is the file's (the zip on disk is the size and the hash that it says);
 *   - the line is a line that works: run in a shell, over the real zip, it prints OK, and over a zip with one byte changed it does not;
 *   - the manifest is read as the data it is: other kinds of file and entries that do not say their name, size and hash are passed over;
 *   - the crate stands under the slip while the slip waits for a module, and under the lamp's rule it carries no lamp and no heading.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterAll, describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { checkLine, kitName, kitUrl, parseKits, type KitState, type LabKit } from '../../src/forge/kits'
import { FORGE_LABS } from '../../src/forge/labs'
import { FORGE_LAB_IDS } from '../../src/forge/ids'
import { ForgeView } from '../../src/forge/ForgeView'
import type { LoadedModule } from '../../src/forge/host'
import type { ForgeState } from '../../src/forge/useForge'
import { zipName } from '../../scripts/pack-labs'

const root = path.resolve(import.meta.dirname, '../..')
const labs = path.join(root, 'public/labs')
const manifest: unknown = JSON.parse(readFileSync(path.join(labs, 'manifest.json'), 'utf8'))
const kits = parseKits(manifest)
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

const decode = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
const noop = () => undefined
const render = (labId: string, state: ForgeState, kit?: KitState) =>
  renderToString(createElement(ForgeView, { lab: FORGE_LABS[labId], state, ...(kit === undefined ? {} : { kit }), onChoose: noop, onRunAgain: noop, onReplay: noop })).replaceAll('<!-- -->', '')

const IDLE: ForgeState = { step: 'idle' }
const ready = (labId: string): KitState => ({ status: 'ready', kit: kits.get(labId) as LabKit })

describe('the manifest, the registry and the packer agree', () => {
  test('every forge lab has a zip in the manifest, named as the packer names it, and every forge-lab file of the manifest has a lab', () => {
    expect([...kits.keys()].sort()).toEqual([...FORGE_LAB_IDS].sort())
    for (const id of FORGE_LAB_IDS) {
      expect(kitName(id), id).toBe(zipName(id))
      expect(kits.get(id)?.name, id).toBe(zipName(id))
      expect(kits.get(id)?.lab, id).toBe(id)
    }
  })

  test('what the page prints is the zip on disk: the size and the SHA-256 that the manifest gives are the file\'s', () => {
    for (const kit of kits.values()) {
      const bytes = readFileSync(path.join(labs, kit.name))
      expect(bytes.length, kit.name).toBe(kit.bytes)
      expect(sha256(bytes), kit.name).toBe(kit.sha256)
    }
  })

  test('the link is the file\'s place under the site\'s base, so that it is followed from /labs/<lab> as from anywhere', () => {
    expect(kitUrl('enginespace-toy.zip')).toBe('/labs/enginespace-toy.zip')
  })
})

describe('the manifest is read as data', () => {
  const entry = { name: 'enginespace-toy.zip', kind: 'forge-lab', lab: 'toy', bytes: 10, sha256: 'a'.repeat(64) }

  test('an entry of another kind is not a forge lab\'s, and an entry that does not say its name, size and hash plainly is passed over', () => {
    const body = {
      files: [
        entry,
        { ...entry, lab: 'gpu', kind: 'gpu-kit', name: 'enginespace-gpu-kit-1.zip' },
        { ...entry, lab: 'a', name: '../escape.zip' },
        { ...entry, lab: 'b', name: 'b.tar' },
        { ...entry, lab: 'c', bytes: -1 },
        { ...entry, lab: 'd', bytes: 1.5 },
        { ...entry, lab: 'e', bytes: '10' },
        { ...entry, lab: 'f', sha256: 'A'.repeat(64) },
        { ...entry, lab: 'g', sha256: 'a'.repeat(63) },
        { ...entry, lab: 7 },
        null,
        'enginespace-toy.zip',
      ],
    }
    expect([...parseKits(body).keys()]).toEqual(['toy'])
  })

  test('a body that is not a manifest is an error, so that the page says it cannot read it', () => {
    for (const body of [null, 'x', [], {}, { files: 'no' }]) expect(() => parseKits(body)).toThrow('no list of files')
  })
})

describe('the line that checks a download', () => {
  const sh = spawnSync('sh', ['-c', 'command -v sha256sum'], { encoding: 'utf8' })
  const run = test.skipIf(sh.status !== 0)
  const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-crate-'))
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))

  test('is the hash, two spaces and the name, in the form that sha256sum -c reads', () => {
    for (const kit of kits.values()) expect(checkLine(kit)).toBe(`echo '${kit.sha256}  ${kit.name}' | sha256sum -c`)
  })

  run('prints OK over the real zip and fails over a zip with one byte changed', () => {
    for (const kit of kits.values()) {
      const good = path.join(scratch, kit.name)
      writeFileSync(good, readFileSync(path.join(labs, kit.name)))
      const ok = spawnSync('sh', ['-c', checkLine(kit)], { cwd: scratch, encoding: 'utf8' })
      expect(ok.stdout.trim(), kit.name).toBe(`${kit.name}: OK`)
      expect(ok.status, kit.name).toBe(0)

      const bytes = readFileSync(good)
      bytes[bytes.length - 1] ^= 1
      writeFileSync(good, bytes)
      const bad = spawnSync('sh', ['-c', checkLine(kit)], { cwd: scratch, encoding: 'utf8' })
      expect(bad.status, kit.name).not.toBe(0)
      expect(bad.stdout, kit.name).toContain('FAILED')
    }
  })
})

describe('the crate on the page', () => {
  test.each([...FORGE_LAB_IDS])('%s: the link, the size and the hash are the manifest\'s, and the line to copy is the check line', (id) => {
    const kit = kits.get(id) as LabKit
    const html = render(id, IDLE, ready(id))
    expect(html).toContain(`<a href="/labs/${kit.name}" class="es-link">${kit.name}</a>`)
    expect(html).toContain(`<data class="es-readout__value" value="${kit.bytes}">`)
    expect(html).toMatch(new RegExp(`<code class="es-forge-crate__digits">${kit.sha256}</code>`))
    // The line is one piece of text, whatever the markup that keeps the tail of it whole when it wraps.
    expect(decode((/<code data-check-line="">(.*?)<\/code>/.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ''))).toBe(checkLine(kit))
    expect(html).toContain('<span class="es-forge-crate__tail">| sha256sum -c</span>')
    expect(text(html)).toContain('Take the crate')
    expect(text(html)).toContain('Copy the line')
  })

  test('while the manifest is on its way, the link is there and the page says that the size and the hash are coming', () => {
    const html = render('toy', IDLE)
    expect(html).toContain('<a href="/labs/enginespace-toy.zip" class="es-link">enginespace-toy.zip</a>')
    expect(text(html)).toContain("Reading the crate's size and SHA-256 from the site.")
    expect(html).not.toContain('es-forge-crate__digits')
    expect(html).not.toContain('data-check-line')
  })

  test('when the manifest cannot be read, the link still works and the page says what it cannot print', () => {
    const html = render('toy', IDLE, { status: 'unavailable' })
    expect(html).toContain('<a href="/labs/enginespace-toy.zip" class="es-link">enginespace-toy.zip</a>')
    expect(text(html)).toContain("The crate's size and SHA-256 could not be read from labs/manifest.json")
    expect(html).not.toContain('es-forge-crate__digits')
  })

  test('it stands under the slip while the slip waits for a module, and goes once a module is accepted', () => {
    const file = { name: 'toy.wasm', bytes: 7 }
    const crate = (state: ForgeState) => render('toy', state, ready('toy')).includes('es-forge-crate')
    expect(crate(IDLE)).toBe(true)
    expect(crate({ step: 'reading', file })).toBe(true)
    expect(crate({ step: 'refused', file, message: 'no.' })).toBe(true)
    const module: LoadedModule = { sha256: 'b'.repeat(64), bytes: 7, lab: 'toy', reference: false, version: 1, list: { lab: 'toy', version: 1, abi: 2, checks: [] } }
    expect(crate({ step: 'running', file, module, seeds: 'fresh', results: [], current: null })).toBe(false)
    expect(crate({ step: 'done', file, module, run: { lab: 'toy', reference: false, version: 1, wasmSha256: module.sha256, seeds: 'fresh', complete: true, checks: [] }, recorded: { kind: 'saved', durable: true } })).toBe(false)
    // And it comes after the slip in the page, so that the chooser stays in a phone's first screen.
    const html = render('toy', IDLE, ready('toy'))
    expect(html.indexOf('Choose a file')).toBeLessThan(html.indexOf('es-forge-crate'))
  })

  test('it is paper and no lamp, and it adds no heading to the page: the slip keeps the lamp and the outline', () => {
    for (const id of FORGE_LAB_IDS) {
      const html = render(id, IDLE, ready(id))
      expect((html.match(/data-lamp="true"/g) ?? []).length, id).toBe(1)
      expect(html).toMatch(/class="es-ticket"[^>]*data-lamp="true"/)
      expect((html.match(/<h1[ >]/g) ?? []).length, id).toBe(1)
      // The slip's title and the checks' are the h2s; a lab with a readout has a third, for the readout.
      expect((html.match(/<h2[ >]/g) ?? []).length, id).toBe(FORGE_LABS[id].readout === undefined ? 2 : 3)
      expect(html, id).not.toMatch(/<h3[ >]/)
    }
  })

  test('the module\'s hash and the crate\'s are not one element, so that a refusal names the module\'s alone', () => {
    const file = { name: 'x.wasm', bytes: 7 }
    const html = render('toy', { step: 'refused', file, message: 'no.', sha256: 'c'.repeat(64) }, ready('toy'))
    expect((html.match(/es-forge-hash__digits/g) ?? []).length).toBe(1)
    expect((html.match(/es-forge-crate__digits/g) ?? []).length).toBe(1)
    expect(html.match(/class="es-ticket__void"/g) ?? []).toHaveLength(1)
  })
})
