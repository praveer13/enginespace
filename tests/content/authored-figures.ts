/*
 * The figures that are drawn by hand rather than from a model: TR1's five and TR8's one. Each is a drawing of an idea (a request crossing
 * a boundary, a loop of threads, a log against its due times), so it has a function here, in the diagram language of
 * `tests/content/figure-kit.ts`, and `tests/content/figures.test.ts` holds the file to the function. TR8's figure takes its ticks and
 * its bars from the toy log of lesson 1, so a change to the log moves the figure.
 *
 *   bun tests/content/authored-figures.ts      writes public/figures/tr1/*.svg and public/figures/tr8/l1-slip.svg
 *
 * Each figure's title and description are the words of its lesson's block, which the lesson's own test holds them to.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Fig, CODE } from './figure-kit.ts'
import { toyLog } from './tr8-demos.ts'

const BROWN = CODE.brown.edge

/** A dashed frame round a set of marks: a thing that is one process, one machine. */
const frame = (fig: Fig, x: number, y: number, w: number, h: number): void => {
  fig.rule(`M${x} ${y}h${w}v${h}h${-w}Z`, true)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* TR1 lesson 1: a request crossing the boundaries                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export function tr1Boundaries(): string {
  const fig = new Fig(
    190,
    `A request crossing a thread boundary, a process boundary, the host-to-GPU boundary and back, with a sync before the read`,
    `Three host threads in a row. Thread A hands the request to thread B through a queue, and thread B hands it to thread C in another process over IPC. A dashed line marks the process boundary between B and C. Thread C copies the request down to a GPU box, where a launch runs the work, and a second arrow copies the result back up. A bar across the upward arrow, marked sync, is the gate: nothing on the host reads the result before it.`,
  )
  fig.text(98, 12, 'process 1', { anchor: 'middle', bold: true })
  fig.text(266, 12, 'process 2', { anchor: 'middle', bold: true })
  fig.rule('M214 2V142', true)
  fig.mark('blue', 8, 22, 68, 30, { label: 'thread A', kind: 'box' })
  fig.mark('blue', 120, 22, 68, 30, { label: 'thread B', kind: 'box' })
  fig.mark('blue', 232, 22, 68, 30, { label: 'thread C', kind: 'box' })
  fig.arrow(76, 37, 118, 37)
  fig.arrow(188, 37, 230, 37)
  fig.text(98, 31, 'queue', { anchor: 'middle', mono: true })
  fig.text(201, 31, 'IPC', { anchor: 'middle', mono: true })
  fig.mark('green', 224, 98, 84, 32, { label: 'GPU launch', kind: 'box' })
  fig.arrow(250, 54, 250, 96, false, BROWN)
  fig.arrow(290, 96, 290, 56, false, BROWN)
  fig.mark('yellow', 280, 72, 20, 8, { kind: 'gate', noGlyph: true })
  fig.text(244, 70, 'copy down', { anchor: 'end' })
  fig.text(298, 62, 'copy up', { anchor: 'start' })
  fig.text(304, 82, 'sync', { anchor: 'start', bold: true })
  fig.text(8, 156, 'the gate: no read before the sync')
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'thread' },
      { slot: 'green', word: 'GPU' },
      { slot: 'brown', word: 'copy' },
      { slot: 'yellow', word: 'sync' },
    ],
    4,
    166,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* TR1 lesson 3: Mini-SGLang's processes                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export function tr1MiniSglang(): string {
  const fig = new Fig(
    196,
    `Mini-SGLang's processes and the sockets between them`,
    `Four boxes in a row: the client, the API server, a box for the tokenizer and the detokenizer, and a scheduler. Between each pair, one arrow runs to the right on the way in and one runs to the left on the way out. The client and the API server are joined by HTTP in and a server-sent event stream out, and the other pairs by ZeroMQ. The tokenizer and the detokenizer share one dashed box, because by default they are one process. Under the scheduler, a GPU box has an arrow down for the copy of the step's inputs and an arrow up for the copy of the sampled tokens.`,
  )
  const Y = 30
  const H = 42
  const boxes = [
    { x: 4, w: 60, label: 'client' },
    { x: 84, w: 60, label: 'API\nserver' },
    { x: 164, w: 92, label: 'tokenizer\ndetokenizer' },
    { x: 276, w: 80, label: 'scheduler\nper rank' },
  ]
  for (const b of boxes) fig.mark('blue', b.x, Y, b.w, H, { label: b.label, kind: 'box' })
  frame(fig, 161, Y - 3, 98, H + 6)
  const gaps = [
    { from: 64, to: 84, in: 'HTTP', out: 'SSE' },
    { from: 144, to: 164, in: 'ZMQ', out: 'ZMQ' },
    { from: 256, to: 276, in: 'ZMQ', out: 'ZMQ' },
  ]
  for (const g of gaps) {
    fig.arrow(g.from, Y + 12, g.to - 2, Y + 12)
    fig.arrow(g.to, Y + 30, g.from + 2, Y + 30)
    fig.text((g.from + g.to) / 2, Y - 8, g.in, { anchor: 'middle', mono: true })
    fig.text((g.from + g.to) / 2, Y + H + 14, g.out, { anchor: 'middle', mono: true })
  }
  fig.text(210, 10, 'one process by default', { anchor: 'middle' })
  fig.mark('green', 276, 120, 80, 32, { label: 'GPU', kind: 'box' })
  fig.arrow(294, Y + H, 294, 118, false, BROWN)
  fig.arrow(338, 118, 338, Y + H + 2, false, BROWN)
  fig.text(288, 100, 'down', { anchor: 'end' })
  fig.text(344, 100, 'up', { anchor: 'start' })
  fig.text(4, 166, 'copy down, launch, copy up:')
  fig.text(4, 180, "one turn of the scheduler's loop")
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'process' },
      { slot: 'green', word: 'GPU' },
      { slot: 'brown', word: 'copy' },
    ],
    4,
    192,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* TR1 lesson 5: vLLM's API server and engine core                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export function tr1VllmThreads(): string {
  const fig = new Fig(
    228,
    `vLLM's API server and engine core, with their tasks, threads, sockets and queues`,
    `Two large boxes side by side. The API server on the left holds three asyncio tasks, a handler task above an output handler task above a socket task, joined upward by the outputs queue and the collector. The engine core on the right holds an input thread, a main thread and an output thread, joined downward by input_queue and output_queue, with a GPU box beside the main thread. A ZMQ arrow runs from the handler task to the input thread, and another from the output thread to the socket task. A caption notes that the busy loop also keeps batch_queue and aborts_queue.`,
  )
  fig.rule('M4 18h156v118h-156Z')
  fig.rule('M186 18h170v118h-170Z')
  fig.text(82, 12, 'API server', { anchor: 'middle', bold: true })
  fig.text(271, 12, 'engine core', { anchor: 'middle', bold: true })
  const rows = [28, 66, 108]
  ;['handler task', 'output handler task', 'socket task'].forEach((label, i) => fig.mark('blue', 10, rows[i], 144, 22, { label, kind: 'box' }))
  ;['input thread', 'main thread', 'output thread'].forEach((label, i) => fig.mark('blue', 192, rows[i], 104, 22, { label, kind: 'box' }))
  fig.mark('green', 310, 66, 40, 22, { label: 'GPU', kind: 'box', noGlyph: true })
  fig.arrow(154, 39, 190, 39)
  fig.arrow(192, 119, 156, 119)
  fig.text(172, 32, 'ZMQ', { anchor: 'middle', mono: true })
  fig.text(174, 113, 'ZMQ', { anchor: 'middle', mono: true })
  fig.arrow(40, 66, 40, 52)
  fig.arrow(40, 108, 40, 90)
  fig.text(48, 62, 'collector', { mono: true })
  fig.text(48, 102, 'outputs_queue', { mono: true })
  fig.arrow(210, 50, 210, 64)
  fig.arrow(210, 90, 210, 106)
  fig.text(218, 62, 'input_queue', { mono: true })
  fig.text(218, 102, 'output_queue', { mono: true })
  fig.arrow(296, 74, 308, 74)
  fig.arrow(308, 80, 296, 80)
  fig.text(180, 154, 'ROUTER to DEALER on the way in, PUSH to PULL on the way out', { anchor: 'middle' })
  fig.text(180, 170, 'the busy loop also keeps batch_queue and aborts_queue', { anchor: 'middle' })
  fig.text(180, 186, 'asyncio tasks on the left, threads on the right', { anchor: 'middle' })
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'task or thread' },
      { slot: 'green', word: 'GPU' },
    ],
    4,
    198,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* TR1 lesson 6: SGLang's overlap loop                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

export function tr1Overlap(): string {
  const fig = new Fig(
    224,
    `SGLang's overlap loop: the host launches the next batch before it reads the last one`,
    `Two lanes against time, the host above and the GPU below, in three turns of the loop. In each turn the host lane has a schedule block and a launch block, and from the second turn on a dashed wait block and a process block for the batch before. The GPU lane has three forward blocks end to end with no gap. An arrow runs from each launch block to the start of its forward, and the arrow from the second launch is labelled queued, because the first forward is still running. Each wait block ends where the forward it waits for ends. The copy back to the host is not drawn, and nothing is to scale.`,
  )
  const HY = 28
  const GY = 92
  const H = 24
  fig.text(4, HY + 16, 'host', { bold: true })
  fig.text(4, GY + 16, 'GPU', { bold: true })
  const host: { x: number; w: number; label: string; slot: 'blue' | 'yellow' }[] = [
    { x: 34, w: 22, label: 'S1', slot: 'blue' },
    { x: 56, w: 18, label: 'L1', slot: 'blue' },
    { x: 74, w: 22, label: 'S2', slot: 'blue' },
    { x: 96, w: 18, label: 'L2', slot: 'blue' },
    { x: 114, w: 50, label: 'W1', slot: 'yellow' },
    { x: 164, w: 22, label: 'P1', slot: 'blue' },
    { x: 186, w: 22, label: 'S3', slot: 'blue' },
    { x: 208, w: 18, label: 'L3', slot: 'blue' },
    { x: 226, w: 28, label: 'W2', slot: 'yellow' },
    { x: 254, w: 22, label: 'P2', slot: 'blue' },
  ]
  for (const b of host) fig.mark(b.slot, b.x, HY, b.w, H, { label: b.label, kind: 'box', noGlyph: true })
  ;[74, 164, 254].forEach((x, i) => fig.mark('green', x, GY, 90, H, { label: `forward ${i + 1}`, kind: 'box' }))
  fig.text(34, HY - 6, 'turn 1')
  fig.text(74, HY - 6, 'turn 2')
  fig.text(186, HY - 6, 'turn 3')
  fig.arrow(65, HY + H, 65, GY - 2)
  fig.arrow(105, HY + H, 105, GY - 2)
  fig.arrow(217, HY + H, 217, GY - 2)
  fig.text(111, GY - 8, 'queued')
  fig.text(4, 150, 'S schedule, L launch, W wait for the copy, P process')
  fig.text(4, 166, 'the number is the batch; a sketch, not to scale')
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'host work' },
      { slot: 'yellow', word: 'wait' },
      { slot: 'green', word: 'forward' },
    ],
    4,
    178,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* TR1 lesson 7: an abort in vLLM                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export function tr1Abort(): string {
  const fig = new Fig(
    230,
    `An abort in vLLM at the pin: it arrives during a step and is handled before the update`,
    `Three lanes against time. The API server lane has a cancel block and then an abort block. A ZMQ arrow runs from the abort block to the input thread's lane, where one block puts the abort on both queues. The main thread's lane has a long block for the forward of step N, and after it an aborts block and an update block. An arrow labelled aborts_queue runs from the queues block to the aborts block, which begins where the forward ends. The abort arrives while the step runs, and it is handled after the forward and before the update.`,
  )
  const X0 = 88
  const H = 26
  fig.text(4, 36, 'API server', { bold: true })
  fig.text(4, 86, 'input thread', { bold: true })
  fig.text(4, 130, 'main thread', { bold: true })
  fig.mark('blue', X0, 20, 60, H, { label: 'cancel', kind: 'box' })
  fig.mark('blue', X0 + 64, 20, 54, H, { label: 'abort', kind: 'box' })
  fig.mark('blue', 190, 68, 92, H, { label: 'both queues', kind: 'box' })
  fig.mark('green', X0, 112, 162, H, { label: 'forward of step N', kind: 'box' })
  fig.mark('blue', X0 + 162, 112, 60, H, { label: 'aborts', kind: 'box' })
  fig.mark('blue', X0 + 222, 112, 46, H, { label: 'update', kind: 'box', noGlyph: true })
  fig.rule(`M${X0 + 91} 46V81`)
  fig.arrow(X0 + 91, 81, 188, 81)
  fig.text(X0 + 97, 62, 'ZMQ', { mono: true })
  fig.arrow(268, 94, 268, 110)
  fig.text(274, 106, 'aborts_queue', { mono: true })
  fig.text(4, 168, 'the abort arrives while step N runs')
  fig.text(4, 184, 'it is handled after the forward, before the update')
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'thread work' },
      { slot: 'green', word: 'forward' },
    ],
    4,
    196,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* TR8 lesson 1: the due times against the send times                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Pixels a millisecond: 500 ms is one major line of the graticule. */
export const SLIP_SCALE = 0.08
export const SLIP_X0 = 24

export function tr8Slip(): string {
  const rows = toyLog().slice(0, 8)
  const x = (ms: number): number => Number((SLIP_X0 + SLIP_SCALE * ms).toFixed(2))
  const fig = new Fig(
    250,
    `Eight requests, when each was due and when each was sent, with the client blocked on the third reply`,
    `Two timelines on one time axis. The top one marks when each of eight requests was due, evenly spaced. The bottom one marks when the client sent each, and how long each took. The third request takes most of the width, and the four after it are sent one after another at the end, each joined by a line back to its due tick.`,
  )
  fig.grid(SLIP_X0, 18, 320, 152)
  fig.text(SLIP_X0 + 2, 12, 'due', { bold: true })
  fig.text(SLIP_X0 + 40, 12, 'the time each request was meant to go', {})
  rows.forEach((r) => fig.text(x(r.dueMs), 34, String(r.n), { mono: true, anchor: 'middle' }))
  fig.rule(`M${SLIP_X0 - 8} 52H${SLIP_X0 + 320}${rows.map((r) => `M${x(r.dueMs)} 38V52`).join('')}`)
  fig.text(SLIP_X0 + 2, 84, 'sent, and the time each took', { bold: true })
  rows.forEach((r) => {
    if (r.sentMs > r.dueMs) fig.rule(`M${x(r.dueMs)} 52L${x(r.sentMs)} 96`, true)
  })
  rows.forEach((r) => fig.rule(`M${x(r.sentMs)} 92V100`))
  rows.forEach((r) => fig.mark('blue', x(r.sentMs), 100, SLIP_SCALE * r.fromSentMs, 14, { kind: 'bar', noGlyph: false }))
  rows.forEach((r) => fig.text(x(r.sentMs) + (SLIP_SCALE * r.fromSentMs) / 2, 128, String(r.n), { mono: true, anchor: 'middle' }))
  const blocked = rows[2]
  fig.dim(x(blocked.sentMs), x(blocked.replyMs), 146, `blocked on reply 3: ${blocked.fromSentMs.toLocaleString('en-US')} ms`, { below: true })
  fig.axis(SLIP_X0, 180, SLIP_SCALE, 3500, 500, 'ms from the first due time')
  const bottom = fig.legend([{ slot: 'blue', word: 'a request, sent to its reply' }], 4, 222)
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The files                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The figures that are not drawn from a model, by the file that holds each under public/. */
export const AUTHORED: Readonly<Record<string, () => string>> = {
  'figures/tr1/l1-boundaries.svg': tr1Boundaries,
  'figures/tr1/l3-mini-sglang.svg': tr1MiniSglang,
  'figures/tr1/l5-vllm-threads.svg': tr1VllmThreads,
  'figures/tr1/l6-overlap.svg': tr1Overlap,
  'figures/tr1/l7-abort.svg': tr1Abort,
  'figures/tr8/l1-slip.svg': tr8Slip,
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dirname, '../..')
  for (const [file, draw] of Object.entries(AUTHORED)) {
    writeFileSync(path.join(root, 'public', file), draw())
    console.log(`wrote public/${file}`)
  }
}
