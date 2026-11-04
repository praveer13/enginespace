/*
 * W1-T11: the zip codec of the lab packer (scripts/labs/zip.ts). The writer must be deterministic and byte-exact, because a lab's zip is
 * committed and hashed, and the reader must refuse an archive it cannot vouch for, because the tests unpack what the packer writes.
 *
 * The writer's output was also checked once with Python's zipfile (`testzip()` found no bad CRC, and every entry read back with its mode
 * and date), and the reader reads an archive that zipfile wrote with DEFLATE, embedded below.
 */
import { describe, expect, test } from 'bun:test'
import { crc32, nameProblem, readZip, writeZip, ZIP_DATE, type ZipEntry } from '../../scripts/labs/zip'

const enc = (value: string) => new TextEncoder().encode(value)
const dec = (value: Uint8Array) => new TextDecoder().decode(value)

const entries: ZipEntry[] = [
  { name: 'lab/Cargo.toml', data: enc('[package]\nname = "lab"\n'), mode: 0o644 },
  { name: 'lab/hooks/guard.sh', data: enc('#!/bin/sh\nexit 2\n'), mode: 0o755 },
  { name: 'lab/empty', data: new Uint8Array(0), mode: 0o644 },
  { name: 'lab/bytes.bin', data: Uint8Array.from({ length: 300 }, (_, i) => i % 256), mode: 0o600 },
]

/** The same bytes with every occurrence of `from` replaced by `to`, which must have the same length. */
function patch(bytes: Uint8Array, from: string, to: string): Uint8Array {
  expect(to.length).toBe(from.length)
  const out = Uint8Array.from(bytes)
  const needle = enc(from)
  let hits = 0
  for (let at = 0; at + needle.length <= out.length; at++) {
    if (needle.every((byte, i) => out[at + i] === byte)) {
      out.set(enc(to), at)
      hits++
    }
  }
  expect(hits).toBeGreaterThan(0)
  return out
}

describe('crc32', () => {
  test('matches the standard answers', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
    expect(crc32(enc('123456789'))).toBe(0xcbf43926)
    expect(crc32(enc('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })
})

describe('writeZip', () => {
  const zip = writeZip(entries)
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)

  test('writes the same bytes every time', () => {
    expect(writeZip(entries)).toEqual(zip)
    expect(writeZip(entries.map((entry) => ({ ...entry, data: Uint8Array.from(entry.data) })))).toEqual(zip)
  })

  test('stores, in order, with one fixed date, Unix modes, and nothing else in a header', () => {
    expect(readZip(zip).map((entry) => [entry.name, dec(entry.data.subarray(0, 8)), entry.mode])).toEqual(
      entries.map((entry) => [entry.name, dec(entry.data.subarray(0, 8)), entry.mode]),
    )
    // The local header of every entry: method 0 (stored), the DOS time and date of ZIP_DATE, and no extra field.
    const date = ((ZIP_DATE.year - 1980) << 9) | (ZIP_DATE.month << 5) | ZIP_DATE.day
    let at = 0
    for (const entry of entries) {
      expect(view.getUint32(at, true)).toBe(0x04034b50)
      expect(view.getUint16(at + 8, true)).toBe(0)
      expect(view.getUint16(at + 10, true)).toBe(0)
      expect(view.getUint16(at + 12, true)).toBe(date)
      expect(view.getUint16(at + 28, true)).toBe(0)
      at += 30 + entry.name.length + entry.data.length
    }
    // The end record: the count, and no comment.
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(entries.length)
    expect(view.getUint16(end + 20, true)).toBe(0)
  })

  test('is a date inside the range the format holds, in the year of the repository', () => {
    expect(ZIP_DATE).toMatchObject({ year: 2026, month: 1, day: 1 })
  })

  test('refuses what could write outside the folder, and what repeats', () => {
    for (const name of ['', '/etc/passwd', '../x', 'a/../x', 'a//b', 'a\\b', 'a/', './a', 'é.txt', 'a b']) {
      expect(() => writeZip([{ name, data: enc('x'), mode: 0o644 }]), name).toThrow()
    }
    expect(() => writeZip([entries[0] as ZipEntry, entries[0] as ZipEntry])).toThrow(/appears twice/)
    expect(() => writeZip([{ name: 'a', data: enc('x'), mode: 0o10000 }])).toThrow(/mode/)
  })

  test('nameProblem accepts plain relative paths', () => {
    for (const name of ['a', 'a/b.c-d_e', '.claude/hooks/es-guard.sh', 'enginespace-toy/toy/src/lib.rs']) expect(nameProblem(name), name).toBeNull()
  })
})

describe('readZip', () => {
  const zip = writeZip(entries)

  test('reads what writeZip wrote, to the byte', () => {
    expect(readZip(zip)).toEqual(entries)
  })

  test('reads an archive that Python wrote with DEFLATE, a mode and a stored empty file', () => {
    const base64 =
      'UEsDBBQAAAAIAAAAIVxd1p2SEgAAAAQBAAAJAAAAaGVsbG8udHh0y0jNycnXUUjLL0pP5coYmRwAUEsDBBQAAAAIAAAAIVwoTqPeFAAAABIAAAAKAAAAZGlyL3J1bi5zaFNW1E/KzNMvzuBKTc7IV8jP5gIAUEsDBBQAAAAAAAAAIVwAAAAAAAAAAAAAAAAFAAAAZW1wdHlQSwECFAMUAAAACAAAACFcXdadkhIAAAAEAQAACQAAAAAAAAAAAAAApIEAAAAAaGVsbG8udHh0UEsBAhQDFAAAAAgAAAAhXChOo94UAAAAEgAAAAoAAAAAAAAAAAAAAO2BOQAAAGRpci9ydW4uc2hQSwECFAMUAAAAAAAAACFcAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAgIF1AAAAZW1wdHlQSwUGAAAAAAMAAwCiAAAAmAAAAAAA'
    const read = readZip(Uint8Array.from(Buffer.from(base64, 'base64')))
    expect(read.map((entry) => [entry.name, entry.data.length, entry.mode])).toEqual([
      ['hello.txt', 260, 0o644],
      ['dir/run.sh', 18, 0o755],
      ['empty', 0, 0o600],
    ])
    expect(dec((read[0] as ZipEntry).data)).toBe('hello, forge\n'.repeat(20))
    expect(dec((read[1] as ZipEntry).data)).toBe('#!/bin/sh\necho ok\n')
  })

  test('refuses a flipped byte (CRC-32), a cut archive and a file that is not an archive', () => {
    const flipped = Uint8Array.from(zip)
    flipped[30 + (entries[0] as ZipEntry).name.length + 3] ^= 1
    expect(() => readZip(flipped)).toThrow(/CRC-32/)
    expect(() => readZip(zip.subarray(0, zip.length - 10))).toThrow(/no end-of-central-directory/)
    expect(() => readZip(enc('not a zip'))).toThrow(/not a zip archive/)
    expect(() => readZip(new Uint8Array(0))).toThrow(/not a zip archive/)
  })

  test('refuses a duplicate name and a name that would leave the folder', () => {
    const two = writeZip([
      { name: 'a.txt', data: enc('1'), mode: 0o644 },
      { name: 'b.txt', data: enc('2'), mode: 0o644 },
    ])
    expect(() => readZip(patch(two, 'b.txt', 'a.txt'))).toThrow(/appears twice/)
    const one = writeZip([{ name: 'ab/c.txt', data: enc('1'), mode: 0o644 }])
    expect(() => readZip(patch(one, 'ab/c.txt', '../c.txt'))).toThrow(/\.\./)
    expect(() => readZip(patch(one, 'ab/c.txt', '/b/c.txt'))).toThrow(/relative path/)
  })

  test('refuses encryption and a method it does not read', () => {
    const one = writeZip([{ name: 'a.txt', data: enc('1'), mode: 0o644 }])
    const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const central = one.length - 22 - (46 + 5)
    const encrypted = Uint8Array.from(one)
    view(encrypted).setUint16(central + 8, 1, true)
    expect(() => readZip(encrypted)).toThrow(/encrypted/)
    const bzip2 = Uint8Array.from(one)
    view(bzip2).setUint16(central + 10, 12, true)
    expect(() => readZip(bzip2)).toThrow(/method 12/)
  })

  test('bounds a DEFLATE entry by the size its header declares', () => {
    const base64 =
      'UEsDBBQAAAAIAAAAIVxd1p2SEgAAAAQBAAAJAAAAaGVsbG8udHh0y0jNycnXUUjLL0pP5coYmRwAUEsDBBQAAAAIAAAAIVwoTqPeFAAAABIAAAAKAAAAZGlyL3J1bi5zaFNW1E/KzNMvzuBKTc7IV8jP5gIAUEsDBBQAAAAAAAAAIVwAAAAAAAAAAAAAAAAFAAAAZW1wdHlQSwECFAMUAAAACAAAACFcXdadkhIAAAAEAQAACQAAAAAAAAAAAAAApIEAAAAAaGVsbG8udHh0UEsBAhQDFAAAAAgAAAAhXChOo94UAAAAEgAAAAoAAAAAAAAAAAAAAO2BOQAAAGRpci9ydW4uc2hQSwECFAMUAAAAAAAAACFcAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAgIF1AAAAZW1wdHlQSwUGAAAAAAMAAwCiAAAAmAAAAAAA'
    const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
    // The central directory entry of hello.txt starts at offset 0x62 + ...: find it by its signature, then lower its declared size.
    const view = new DataView(bytes.buffer)
    let central = -1
    for (let at = 0; at + 4 <= bytes.length; at++) {
      if (view.getUint32(at, true) === 0x02014b50) {
        central = at
        break
      }
    }
    view.setUint32(central + 24, 10, true)
    expect(() => readZip(bytes)).toThrow(/hello\.txt/)
  })
})
