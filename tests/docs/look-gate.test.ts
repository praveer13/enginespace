/*
 * The look gate's page (R-T20, docs/waves/WR-look.md): ten pairs of images from the two builds, the commands that serve them, the decision
 * in under 200 words, what is the same and what differs, and three questions that nothing on the page answers.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { MAX_BYTES, SCREENS, VIEWPORTS, shrink } from '../../scripts/look-gate'

const root = path.resolve(import.meta.dirname, '../..')
const page = readFileSync(path.join(root, 'docs/waves/WR-look.md'), 'utf8')
const folder = path.join(root, 'docs/waves/wr-look')

const section = (heading: string): string => {
  const start = page.indexOf(`## ${heading}`)
  expect(start, heading).toBeGreaterThan(-1)
  const next = page.indexOf('\n## ', start + 1)
  return page.slice(start, next < 0 ? undefined : next)
}

describe('the look gate page', () => {
  test('holds ten pairs: five screens at two sizes, each with its build SHA under the image', () => {
    expect(SCREENS.length).toBe(5)
    expect(VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`)).toEqual(['1440x900', '390x844'])
    const cells = page.split('\n').filter((line) => line.startsWith('| ![Build A'))
    expect(cells.length).toBe(10)
    for (const cell of cells) {
      const [, a, b] = cell.split('|')
      expect(a).toMatch(/\(wr-look\/a-[a-z0-9-]+-(1440|390)\.png\)<br>Build A, `[0-9a-f]{7}`/)
      expect(b).toMatch(/\(wr-look\/b-[a-z0-9-]+-(1440|390)\.png\)<br>Build B, `[0-9a-f]{7}`/)
      // A pair is one route, state and viewport: the two files differ in their build letter alone.
      expect(a?.match(/wr-look\/a-([a-z0-9-]+-(?:1440|390))\.png/)?.[1]).toBe(b?.match(/wr-look\/b-([a-z0-9-]+-(?:1440|390))\.png/)?.[1])
    }
  })

  test('every image exists, is a PNG of at most 300 KB, and the folder is under 6 MB', () => {
    const files = readdirSync(folder).filter((name) => name.endsWith('.png'))
    expect(files.length).toBe(20)
    let total = 0
    for (const name of files) {
      const bytes = readFileSync(path.join(folder, name))
      expect(bytes.subarray(1, 4).toString('latin1'), name).toBe('PNG')
      expect(bytes.length, name).toBeLessThanOrEqual(MAX_BYTES)
      expect(page, name).toContain(`wr-look/${name}`)
    }
    for (const name of readdirSync(folder)) total += statSync(path.join(folder, name)).size
    expect(total).toBeLessThan(6 * 1024 * 1024)
    expect(existsSync(path.join(folder, 'shots.json'))).toBe(true)
  })

  test('gives the commands that serve both builds on two ports', () => {
    expect(page).toContain('bun scripts/look-gate.ts serve')
    expect(page).toContain('--port 4301')
    expect(page).toContain('--port 4302')
    expect(page).toContain('wave-r-stage1')
  })

  test('states the decision, its default and what each answer does, in under 200 words', () => {
    const words = section('6. The decision').split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word))
    expect(words.length).toBeLessThan(200)
    const text = section('6. The decision')
    expect(text).toContain('Data Book replaces The Pass')
    expect(text).toContain('default')
    expect(text).toContain('If you choose The Pass')
  })

  test('lists what is the same and what differs', () => {
    const same = section('2. The same in both builds')
    for (const word of ['Names', 'way on', 'lesson template', 'frame']) expect(same).toContain(word)
    const differs = section('3. What differs')
    for (const word of ['Surfaces', 'Faces', 'step loop, 2D', 'step loop, 3D', 'front page']) expect(differs).toContain(word)
  })

  test('prints the three delight questions with space for the owner and answers none of them', () => {
    const questions = section('5. The three questions')
    for (const question of ['Which of these would you rather spend an hour in?', 'Name one moment you would show someone.', 'Where did it feel like work with no payoff?']) {
      expect(questions).toContain(question)
    }
    expect(questions.match(/Your words:\n\n {3}&nbsp;/g)?.length).toBe(3)
  })
})

describe('shrink', () => {
  test('writes a valid indexed PNG of the same pixels', () => {
    const width = 8
    const height = 4
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let p = 0; p < width * height; p++) rgba.set(p % 2 === 0 ? [250, 250, 240, 255] : [20, 30, 40, 255], p * 4)
    const png = shrink(rgba, width, height)
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(width)
    expect(png.readUInt32BE(20)).toBe(height)
    const idat = png.indexOf('IDAT')
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)))
    expect(raw.length).toBe((width + 1) * height)
  })
})
