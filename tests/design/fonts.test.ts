/*
 * W0-T05, accept 5 (the part a unit test can hold; W0-T21's e2e checks the network): the faces are self-hosted.
 *   - Every file under public/fonts is pinned in fonts.json by SHA-256, with its source package, version and URL.
 *   - src/design/fonts.css declares exactly those files, each on the site's own origin.
 *   - Every font role starts with one of those faces.
 *   - Each face's licence file sits beside it, and NOTICE carries each licence.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { ROLE_NAMES, roleOf } from '@/design/tokens'

const root = path.resolve(import.meta.dirname, '../..')
const FONTS = path.join(root, 'public/fonts')

interface Face {
  family: string
  roles: string[]
  file: string
  weight: string
  style: string
  unicodeRange: string | null
  sha256: string
  bytes: number
  source: { package: string; version: string; path: string; url: string; sha256: string }
  transform: string[] | null
  licence: { id: string; file: string; copyright: string; source: string; sha256: string }
}

const manifest = JSON.parse(readFileSync(path.join(FONTS, 'fonts.json'), 'utf8')) as { faces: Face[]; userAgent: string; fetched: string }
const fontsCss = readFileSync(path.join(root, 'src/design/fonts.css'), 'utf8')
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

interface Declared {
  family: string
  url: string
  weight: string
  style: string
  unicodeRange: string | null
}

const declared: Declared[] = []
postcss.parse(fontsCss).walkAtRules('font-face', (rule) => {
  const get = (prop: string) => {
    let value: string | null = null
    rule.walkDecls(prop, (decl) => {
      value = decl.value
    })
    return value as string | null
  }
  const src = get('src') ?? ''
  declared.push({
    family: (get('font-family') ?? '').replace(/['"]/g, ''),
    url: /url\(['"]?([^'")]+)['"]?\)/.exec(src)?.[1] ?? '',
    weight: get('font-weight') ?? '',
    style: get('font-style') ?? '',
    unicodeRange: get('unicode-range'),
  })
})

describe('the self-hosted faces', () => {
  test('every woff2 under public/fonts is in the manifest, pinned by its SHA-256', () => {
    const files = readdirSync(FONTS).filter((name) => name.endsWith('.woff2'))
    expect(files.sort()).toEqual(manifest.faces.map((face) => face.file).sort())
    for (const face of manifest.faces) {
      expect(sha256(path.join(FONTS, face.file))).toBe(face.sha256)
      expect(face.source.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(face.source.url).toBe(`https://cdn.jsdelivr.net/npm/${face.source.package}@${face.source.version}/${face.source.path}`)
      expect(face.source.package).toMatch(/^@fontsource(-variable)?\//)
      // An unchanged file is the package's own; a derived one says how it was made.
      if (face.transform === null) expect(face.sha256).toBe(face.source.sha256)
      else expect(face.transform.length).toBeGreaterThan(0)
    }
  })

  test('the fetch used the generic User-Agent and no personal identifier', () => {
    expect(manifest.userAgent).toBe('Mozilla/5.0 (X11; Linux x86_64)')
  })

  test('fonts.css declares exactly the manifest’s files, each on the site’s own origin', () => {
    expect(declared.map((face) => face.url).sort()).toEqual(manifest.faces.map((face) => `/fonts/${face.file}`).sort())
    for (const face of declared) {
      expect(face.url.startsWith('/fonts/')).toBe(true)
      expect(face.url).not.toMatch(/^(https?:)?\/\//)
    }
    expect(fontsCss).not.toMatch(/https?:\/\/|@import/)
  })

  test('each declaration matches its manifest entry: family, style and range', () => {
    for (const face of manifest.faces) {
      const match = declared.find((candidate) => candidate.url === `/fonts/${face.file}`)
      expect(match?.family).toBe(face.family)
      expect(match?.style).toBe(face.style)
      expect(match?.unicodeRange ?? null).toBe(face.unicodeRange)
    }
  })

  test('every font role starts with a self-hosted face', () => {
    const families = new Set(declared.map((face) => face.family))
    for (const name of ROLE_NAMES) {
      const role = roleOf(name)
      if (role.kind === 'font') expect(families.has(role.family[0])).toBe(true)
    }
  })

  test('each licence file sits beside its face, unchanged, and NOTICE carries every licence', () => {
    const notice = readFileSync(path.join(root, 'NOTICE'), 'utf8')
    for (const face of manifest.faces) {
      expect(sha256(path.join(FONTS, face.licence.file))).toBe(face.licence.sha256)
      expect(notice).toContain(face.family)
      expect(notice).toContain(face.licence.copyright)
      expect(notice).toContain(`public/fonts/${face.licence.file}`)
      expect(notice).toContain(face.licence.id === 'OFL-1.1' ? 'SIL Open Font License, Version 1.1' : 'Apache License, Version 2.0')
    }
  })
})
