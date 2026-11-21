/*
 * The file a receipt came back in, held for this tab (ASSESSMENT §7.2). The ledger keeps the parsed receipt and never its raw artifacts, which stay in the
 * learner's bundle file (src/receipts/keep.ts); the questions of "Defend your receipt" are worked out from those artifacts. So when a receipt is kept, the
 * importer leaves the file here by the receipt's hash, and the receipt's page finds it without asking the learner to choose it again. Nothing is written
 * anywhere: a reload, or another tab, has no file, and the page asks for it then.
 */

/** The most files held at once [estimated]: a learner brings back a receipt or two at a sitting, and each file is a bundle of up to 32 MB. */
const HELD = 4

const files = new Map<string, File>()

/** Leaves the file of a kept receipt for its page, the newest last; the oldest is let go past `HELD`. */
export function holdBundle(sha256: string, file: File): void {
  files.delete(sha256)
  files.set(sha256, file)
  while (files.size > HELD) {
    const oldest = files.keys().next().value
    if (oldest === undefined) break
    files.delete(oldest)
  }
}

/** The file of this receipt, if it came back in this tab. */
export const heldBundle = (sha256: string): File | undefined => files.get(sha256)
