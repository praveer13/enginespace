// The oracle's side of the invoke protocol (ARCHITECTURE §8.3, D-025): what a host check sends to a learner's module, and what it
// expects back.
//
// The site drives a module through `ks_invoke`, one text command per call, and an oracle outside the module's code judges every
// reply. Everything the oracle knows is in this package: the model that says what a right module answers, and the plan that turns a
// seed into commands. The runner that sends them (src/forge/invoke.ts) only carries commands to a worker and replies back, so a plan
// is pure and seeded like every model here (D-017): the same seed draws the same commands in Bun and in every browser, and a
// failed run can be told again on its seed.
//
// A plan is a conversation in batches. The runner asks for a batch with `next`, sends its commands to one fresh instance of the
// module, one `ks_invoke` call each, and hands the replies to `judge`. A batch may depend on every reply before it, though the plans
// of this package draw their commands from the seed alone, and the model alone decides what the replies should be.

/** A whole run of a check, as a sequence of batches. */
export interface CheckPlan {
  /** The next batch of commands, or null when there is nothing more to send. A batch is never empty. */
  next(): readonly string[] | null
  /**
   * The module's replies to the batch that `next` returned last, one per command and in the same order. It returns what went wrong,
   * as a sentence that names the command and both replies, or null when every reply was right. The check stops at the first wrong one.
   */
  judge(replies: readonly string[]): string | null
  /** What a pass established, once every batch was judged right and `next` has nothing left. */
  passed(): string
}

/** One command and the reply a right module gives. */
export interface Exchange {
  send: string
  expect: string
  /** What a wrong reply means, when the reply alone does not say. */
  note?: string
}

/** How many characters of a module's reply a message shows. A reply is the module's own text, so it is cut and quoted. */
export const SHOWN_CHARS = 80

/** A reply for a message: quoted so that spaces and control characters show, and cut. */
export function shown(reply: string): string {
  const cut = reply.length > SHOWN_CHARS ? `${reply.slice(0, SHOWN_CHARS)}…` : reply
  return JSON.stringify(cut)
}

/** The sentence for a reply that is not the expected one. */
export function wrongReply(send: string, expect: string, got: string, note?: string): string {
  return `${send} should answer ${shown(expect)}, and the module answered ${shown(got)}${note === undefined ? '' : `: ${note}`}`
}

/** The most commands a batch holds. A batch is one message to the worker, and the budget of a check is spent between batches. */
export const BATCH = 100

/**
 * A plan from a fixed list of exchanges, sent in batches. It stops at the first wrong reply, and says which command it was.
 * `passed` is the sentence for a green check.
 */
export function scripted(exchanges: readonly Exchange[], passed: string, batch: number = BATCH): CheckPlan {
  if (!Number.isInteger(batch) || batch < 1) throw new RangeError(`a batch holds at least one command, got ${batch}`)
  let sent = 0
  let last: readonly Exchange[] = []
  return {
    next() {
      if (sent >= exchanges.length) return null
      last = exchanges.slice(sent, sent + batch)
      sent += last.length
      return last.map((exchange) => exchange.send)
    },
    judge(replies) {
      if (replies.length !== last.length) return `the module answered ${replies.length} of the ${last.length} commands sent`
      for (let i = 0; i < last.length; i++) {
        if (replies[i] !== last[i].expect) return wrongReply(last[i].send, last[i].expect, replies[i], last[i].note)
      }
      return null
    },
    passed: () => passed,
  }
}
