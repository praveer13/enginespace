/**
 * receipt.worker: where a receipt bundle is read and checked (ARCHITECTURE §8.5, §12). The file is untrusted. It is decompressed under the caps
 * of rule 1, parsed and held to the schema of rule 2, hashed against the receipt (rule 3), and bound, identified and pinned (rules 4 to 6)
 * here and nowhere else, so a file that inflates without end can only stall this worker, and the page stops it at the time it allows (src/receipts/protocol.ts).
 * A JSON that would run the parser out of memory (a hundred million levels deep, a quarter of a gigabyte of `[],`, or a quarter of a gigabyte of `-0,`, which parses and then runs the canonical form out of memory) is
 * refused before it is parsed, by a scan of its shape in rule 2 (packages/verify/shape.ts, which counts the commas as well): a worker that runs out of memory takes the tab with it, and the caps of rule 1 bound a file's bytes and not its parse.
 * Then the schema's own lists are counted before the schema sees them (schema.ts), because zod makes an issue for every invalid entry of a list before it applies the list's bound, and a throw from the schema is a refusal at rule 2.
 *
 * The rules are packages/verify's and are pure; this file carries a request in and an outcome out (src/receipts/protocol.ts), and nothing
 * else. It fetches nothing, reads no ledger and no clock, and renders nothing.
 */
import { verifyBundle } from '@es/verify'
import type { ReceiptReply, ReceiptRequest } from '../receipts/protocol'

/* The app tsconfig has the DOM lib, not WebWorker: type just what is used. */
const scope = self as unknown as { // `self` is a Window to this program, and a worker's onmessage and postMessage are not a Window's
  onmessage: ((event: MessageEvent<ReceiptRequest>) => void) | null
  postMessage(message: ReceiptReply): void
}

scope.onmessage = async (event) => {
  const request = event.data
  try {
    const outcome = await verifyBundle(request.file, request.context)
    scope.postMessage({ type: 'verified', id: request.id, outcome })
  } catch (error) {
    // `verifyBundle` answers for every file, so this is the check itself breaking: a browser that cannot hash, or memory that ran out.
    scope.postMessage({ type: 'failed', id: request.id, message: error instanceof Error ? error.message : String(error) })
  }
}

scope.postMessage({ type: 'ready' })
