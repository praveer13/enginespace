/*
 * The zip codec of the lab packer (W1-T11, scripts/pack-labs.ts) and of the tests that read what it writes. It adds no dependency
 * (ARCHITECTURE §14) and does what a lab archive needs: plain files, in one disk, with Unix modes.
 *
 * The writer is deterministic by construction, because a lab's zip is committed and its SHA-256 is published (the manifest):
 *
 *   STORE, never DEFLATE   A deflate stream depends on the zlib that wrote it, and on the CPU for zlib builds that hash with SIMD
 *                          instructions, so two machines could write two archives from one set of sources. A stored archive depends
 *                          on its entries alone, so anyone can recompute the hash. A lab is a few dozen KB, so nothing much is lost.
 *   one modification time  Every entry carries ZIP_DATE and no extra field, so nothing of the clock, the machine or the user reaches
 *                          the archive. (DOS time is local time with no zone, and the 1980 epoch is the edge of the format, so the
 *                          date sits in the middle of the range.)
 *   modes from the caller  The mode of an entry is the caller's (0644, or 0755 for a script), never the file system's.
 *   names                  ASCII only, with no `..`, no leading `/` and no `\`, so that an archive cannot write outside its folder.
 *
 * The reader takes STORE and DEFLATE, so that it also reads an archive another tool wrote. It checks every size and CRC-32, refuses
 * encryption, zip64, a second disk, a duplicate name and an unsafe name, and bounds what a DEFLATE entry may inflate to by the size
 * its own header declares.
 */

import { inflateRawSync } from 'node:zlib'

/** The instant of every entry, as the zip format stores it (MS-DOS date and time). */
export const ZIP_DATE = { year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 } as const

export interface ZipEntry {
  /** The entry's path in the archive, with `/` separators and no leading `/`. */
  name: string
  data: Uint8Array
  /** The Unix permission bits, such as 0o644. */
  mode: number
}

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
/** Version 2.0 is the oldest that has STORE and DEFLATE with directories. The host byte 3 says that `mode` is a Unix mode. */
const VERSION = 20
const UNIX = 3
const REGULAR_FILE = 0o100000
const MAX_NAME = 255

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** The CRC-32 of the bytes, as the zip format and gzip define it. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = (CRC_TABLE[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Why an archive path is refused, or null when it is a plain relative path of safe characters. */
export function nameProblem(name: string): string | null {
  if (name === '' || name.length > MAX_NAME) return `a name is 1 to ${MAX_NAME} characters`
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) return 'a name holds letters, digits, dot, dash, underscore and slash only'
  if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) return 'a name is a relative path of files, with no empty part'
  if (name.split('/').some((part) => part === '.' || part === '..')) return 'a name has no . or .. part'
  return null
}

const dosTime = () => (ZIP_DATE.hour << 11) | (ZIP_DATE.minute << 5) | (ZIP_DATE.second >> 1)
const dosDate = () => ((ZIP_DATE.year - 1980) << 9) | (ZIP_DATE.month << 5) | ZIP_DATE.day

/** The archive of the entries, in the order given. It throws on an unsafe or repeated name, and on a mode that is not 0..0o7777. */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length >= 0xffff) throw new Error('zip: more than 65534 entries needs zip64, which this writer does not write')
  const seen = new Set<string>()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  const encoder = new TextEncoder()
  let offset = 0
  for (const { name, data, mode } of entries) {
    const problem = nameProblem(name)
    if (problem !== null) throw new Error(`zip: "${name}": ${problem}`)
    if (seen.has(name)) throw new Error(`zip: "${name}" appears twice`)
    seen.add(name)
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) throw new Error(`zip: "${name}": the mode ${mode} is not a set of permission bits`)
    if (data.length >= 0xffffffff || offset >= 0xffffffff) throw new Error('zip: an archive over 4 GiB needs zip64, which this writer does not write')

    const nameBytes = encoder.encode(name)
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30 + nameBytes.length))
    local.setUint32(0, LOCAL, true)
    local.setUint16(4, VERSION, true)
    local.setUint16(6, 0, true) // flags: no encryption, no data descriptor; the name is ASCII, so bit 11 is not needed
    local.setUint16(8, 0, true) // method 0: stored
    local.setUint16(10, dosTime(), true)
    local.setUint16(12, dosDate(), true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)
    new Uint8Array(local.buffer).set(nameBytes, 30)

    const central = new DataView(new ArrayBuffer(46 + nameBytes.length))
    central.setUint32(0, CENTRAL, true)
    central.setUint16(4, (UNIX << 8) | VERSION, true)
    central.setUint16(6, VERSION, true)
    central.setUint16(8, 0, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, dosTime(), true)
    central.setUint16(14, dosDate(), true)
    central.setUint32(16, crc, true)
    central.setUint32(20, data.length, true)
    central.setUint32(24, data.length, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint16(30, 0, true) // extra field length
    central.setUint16(32, 0, true) // comment length
    central.setUint16(34, 0, true) // disk number
    central.setUint16(36, 0, true) // internal attributes
    central.setUint32(38, ((REGULAR_FILE | mode) << 16) >>> 0, true)
    central.setUint32(42, offset, true)
    new Uint8Array(central.buffer).set(nameBytes, 46)

    locals.push(new Uint8Array(local.buffer), data)
    centrals.push(new Uint8Array(central.buffer))
    offset += local.byteLength + data.length
  }

  const directorySize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, END, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, directorySize, true)
  end.setUint32(16, offset, true)

  const out = new Uint8Array(offset + directorySize + 22)
  let at = 0
  for (const part of [...locals, ...centrals, new Uint8Array(end.buffer)]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** The entries of an archive, in the order of its central directory. It throws, naming the entry, on anything it cannot vouch for. */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder('utf-8', { fatal: true })

  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === END) {
      end = at
      break
    }
  }
  if (end < 0) throw new Error('zip: no end-of-central-directory record, so this is not a zip archive')
  const count = view.getUint16(end + 10, true)
  const directorySize = view.getUint32(end + 12, true)
  const directoryAt = view.getUint32(end + 16, true)
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 || view.getUint16(end + 8, true) !== count) throw new Error('zip: an archive on more than one disk')
  if (count === 0xffff || directorySize === 0xffffffff || directoryAt === 0xffffffff) throw new Error('zip: zip64 archives are not supported')
  if (directoryAt + directorySize > end) throw new Error('zip: the central directory runs past its end record')

  const entries: ZipEntry[] = []
  const seen = new Set<string>()
  let at = directoryAt
  for (let n = 0; n < count; n++) {
    if (at + 46 > end || view.getUint32(at, true) !== CENTRAL) throw new Error(`zip: entry ${n} of the central directory is malformed`)
    const hostByte = view.getUint16(at + 4, true) >>> 8
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const compressed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const attributes = view.getUint32(at + 38, true)
    const localAt = view.getUint32(at + 42, true)
    if (at + 46 + nameLength > end) throw new Error(`zip: entry ${n} runs past the central directory`)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extraLength + commentLength

    const problem = nameProblem(name)
    if (problem !== null) throw new Error(`zip: "${name}": ${problem}`)
    if (seen.has(name)) throw new Error(`zip: "${name}" appears twice`)
    seen.add(name)
    if ((flags & 1) !== 0) throw new Error(`zip: "${name}" is encrypted`)
    if (compressed === 0xffffffff || size === 0xffffffff) throw new Error(`zip: "${name}" needs zip64, which is not supported`)

    if (localAt + 30 > end || view.getUint32(localAt, true) !== LOCAL) throw new Error(`zip: "${name}" has no local header where the directory says`)
    const localName = decoder.decode(bytes.subarray(localAt + 30, localAt + 30 + view.getUint16(localAt + 26, true)))
    if (localName !== name) throw new Error(`zip: the local header of "${name}" names "${localName}"`)
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true)
    if (dataAt + compressed > directoryAt) throw new Error(`zip: "${name}" runs into the central directory`)
    const raw = bytes.subarray(dataAt, dataAt + compressed)

    let data: Uint8Array
    if (method === 0) {
      if (compressed !== size) throw new Error(`zip: "${name}" is stored, and its two sizes differ`)
      data = raw
    } else if (method === 8) {
      // The declared size bounds the output, so a header cannot ask for more memory than it says it will fill.
      try {
        data = new Uint8Array(inflateRawSync(raw, { maxOutputLength: Math.max(1, size) }))
      } catch {
        throw new Error(`zip: "${name}" does not inflate to the ${size} bytes its header declares`)
      }
    } else {
      throw new Error(`zip: "${name}" uses compression method ${method}, and only 0 (stored) and 8 (deflate) are read`)
    }
    if (data.length !== size) throw new Error(`zip: "${name}" holds ${data.length} bytes, and its header says ${size}`)
    if (crc32(data) !== crc) throw new Error(`zip: "${name}" fails its CRC-32`)
    const mode = hostByte === UNIX ? (attributes >>> 16) & 0o7777 : 0o644
    entries.push({ name, data: Uint8Array.from(data), mode })
  }
  return entries
}
