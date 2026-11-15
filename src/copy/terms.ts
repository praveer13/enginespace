/**
 * The course's terms, one meaning each (REDESIGN §2.7, D-063): the one table that a definition comes from. A parts list, a popover, a
 * glossary line or a lesson's first use of a word reads it here, so a term cannot mean two things on two pages.
 *
 * A term's source is, in order, the pinned engine's code and docs, the paper, and kernelspace. Where the course coins a word (bubble,
 * ghost token, and page as the pool's unit), the row says so, and a page's first use of it says so in one clause (policy 3). Where vLLM
 * and SGLang differ, vLLM's word leads and SGLang's follows (policy 1). There is no second vocabulary, so nothing here maps a kitchen word
 * to an engine one: GAMES.md §2.6 keeps that history, and nothing a learner reads does.
 *
 * Every definition is 6 to 12 words, so it fits a popover's one line, and tests/copy/terms.test.ts counts them. The copy guard reads this
 * file's words like any other rendered text.
 */

/** Where a term comes from: the pinned engine (or a profiler or a library it uses), a paper, kernelspace, or the course itself. */
export type TermSource = 'engine' | 'paper' | 'kernelspace' | 'course'

export interface Term {
  /** The term as the screen prints it. */
  readonly term: string
  /** What it means, in 6 to 12 words. */
  readonly definition: string
  readonly source: TermSource
  /** The course's own word, which its first use on a page says it is (REDESIGN §2.7, policy 3). Set exactly when `source` is `course`. */
  readonly coined?: true
  /** The engine's own name where the course's differs, as the pinned source spells it. */
  readonly engine?: string
  /** SGLang's word, where it differs from vLLM's: it follows vLLM's in brackets once per page. */
  readonly sglang?: string
}

const engine = (term: string, definition: string, more: Partial<Pick<Term, 'engine' | 'sglang'>> = {}): Term => ({ term, definition, source: 'engine', ...more })
const paper = (term: string, definition: string): Term => ({ term, definition, source: 'paper' })
const coined = (term: string, definition: string, more: Partial<Pick<Term, 'engine' | 'sglang'>> = {}): Term => ({ term, definition, source: 'course', coined: true, ...more })

/** The engine's terms that the games, the lessons and the items use, grouped by the instrument that draws them first. */
export const TERMS: readonly Term[] = [
  // The step loop
  engine('request', 'One prompt sent to the engine, and the tokens it generates.'),
  engine('waiting queue', 'Requests the engine has received but not yet scheduled.', { engine: 'waiting' }),
  engine('running batch', 'The requests the scheduler runs in the current step.', { engine: 'running' }),
  engine('batch slot', 'One of the places in the running batch, up to max_num_seqs.'),
  engine('step', 'One round of scheduling and one model forward over the batch.'),
  engine('continuous batching', 'Refilling a freed batch slot at the next step boundary.'),
  engine('static batching', 'Admitting no new request until the whole batch has finished.'),
  engine('async scheduling', 'Scheduling the next step on the CPU while this one runs.', { sglang: 'overlap scheduling' }),
  coined('bubble', 'Time the GPU sits idle while the CPU prepares the next step.'),
  engine('GPU lane', "The diagram's row for the GPU's work: each step's forward."),
  engine('CPU lane', "The diagram's row for the engine core thread's work."),
  engine('output token', 'One token a step generates for one running request.'),
  coined('ghost token', 'A token computed one step ahead, then discarded because its request stopped.'),
  engine('eager launch', 'Launching each kernel of a step from the CPU, one by one.'),
  engine('CUDA graph replay', 'Launching a whole captured sequence of kernels with one call.'),
  engine('capture size', 'A batch size for which the engine captured a CUDA graph.', { engine: 'cudagraph_capture_sizes' }),
  engine('padding', 'Empty batch entries added so a step fits a capture size.'),
  engine('graph mode', 'Which parts of a step run as replayed CUDA graphs.', { engine: 'cudagraph_mode' }),
  engine('model runner', 'The worker code that prepares the inputs and runs the forward.'),
  engine('grammar mask', 'A bitmask of the tokens the output grammar allows next.'),
  // The KV page pool
  coined('page', "The pool's unit: one block of tokens' keys and values.", { engine: 'KVCacheBlock' }),
  coined('KV page', 'A fixed number of tokens of KV for one KV group.', { engine: 'KVCacheBlock' }),
  engine('KV page pool', 'Every KV page on the GPU, shared by every KV group.', { engine: 'BlockPool' }),
  engine('KV group', 'Layers that share one block table and one page size.'),
  engine('block table', "A request's list of physical pages, in token order, per group."),
  engine('full attention', 'Attention over every earlier token of the request.'),
  engine('sliding window', 'Attention over only the last W tokens before the current one.'),
  engine('state group', "Pages holding a recurrent layer's fixed-size state, not per-token KV."),
  engine('free queue', 'The pages nobody holds, in the order they will be evicted.', { engine: 'FreeKVCacheBlockQueue' }),
  engine('cached page', 'A page nobody holds that still keeps reusable KV.'),
  engine('free page', 'A page that holds no KV and belongs to no request.'),
  engine('prefix hit', 'Leading tokens whose KV is already cached, so prefill skips them.'),
  engine('evict', 'Reclaim a cached page, discarding the KV it still held.'),
  engine('preempt', "Take back a running request's pages; it is recomputed later."),
  engine('recompute', 'Run prefill again for tokens whose KV was dropped.'),
  engine('LoRA adapter', 'Low-rank weights that specialize the base model for some requests.'),
  coined('conversation', 'Requests that share a growing prefix, one turn after another.'),
  engine('shared system prompt', 'A prefix that several conversations begin with.'),
  coined('cost', 'Recomputed tokens plus weighted steps spent waiting for an adapter.'),
  coined('reference run', "The same seed played by the course's own reference policy."),
  // The request path
  engine('client', 'Whatever sends the request and reads the streamed tokens back.'),
  engine('API server', 'The process that receives HTTP requests and streams results back.'),
  engine('engine core', 'The process that runs the scheduler loop and drives the workers.', { engine: 'EngineCore' }),
  engine('process', 'An operating-system process, with memory no other process shares.'),
  engine('thread', 'One line of execution inside a process, sharing its memory.'),
  engine('queue', 'A buffer one thread puts work into and another takes from.'),
  engine('IPC', 'Messages between processes, such as over ZMQ sockets.'),
  engine('shared memory', 'Memory that two processes map, so both read it without copying.'),
  engine('host-to-device copy', 'Moving bytes from CPU memory into GPU memory.'),
  engine('device-to-host copy', 'Moving bytes from GPU memory back into CPU memory.'),
  engine('sync', "A blocking wait until the GPU's earlier work has finished."),
  engine('tensor-parallel rank', "One GPU's process, holding a slice of every layer's weights."),
  engine('collective', 'One operation in which every rank exchanges data, such as all-reduce.'),
  engine('stage', "One hop of a request's path, named by its mechanism."),
  engine('tokenize', "Turn the prompt's text into the model's token ids."),
  engine('detokenize', 'Turn generated token ids back into text for the client.'),
  // The rejection sampler
  paper('draft model', 'A smaller, faster model that proposes the next γ tokens.'),
  paper('draft tokens', 'The tokens the draft model proposes, drawn from its distribution q.'),
  paper('target model', 'The model whose output distribution p must come out exactly.'),
  paper('target distribution', 'p: how likely the target model is to emit each token.'),
  paper('accept', 'Keep a draft token x with probability min(1, p(x)/q(x)).'),
  paper('residual', 'Where p exceeds q, normalized: what a rejected position resamples from.'),
  paper('bonus token', 'The extra token the target samples when every draft is accepted.'),
  paper('γ', 'The draft length: how many draft tokens one round proposes.'),
  paper('acceptance rate', 'The share of draft tokens accepted: the overlap of p and q.'),
  engine('n-gram draft', 'A draft that copies the tokens after a matching earlier n-gram.'),
  // The broken benchmark
  paper('open loop', 'Requests arrive on their schedule, whatever the server is doing.'),
  paper('closed loop', 'Each client sends its next request only after its last returns.'),
  paper('coordinated omission', 'Timing from the send, which hides the waits a stalled server caused.'),
  engine('due time', 'When the schedule said a request should have been sent.'),
  engine('warm-up', 'The first requests, served while caches and kernels are still cold.'),
  paper('bootstrap interval', 'A range for a statistic, found by resampling the measured sample.'),
  // The games still to come
  engine('backend dispatch', 'Choosing the first attention backend that supports the model and GPU.'),
  engine('tensor', 'A buffer read through a shape, strides and an offset.'),
  engine('element', 'One value of a tensor, at one index of its shape.'),
  engine('buffer', "The flat memory that holds a tensor's elements."),
  engine('stride', 'How far in the buffer one step along a dimension moves.'),
  engine('view', "A tensor that reads another's buffer through a new shape."),
  engine('copy', 'A new buffer, with every element moved into it.'),
  engine('trace', "A profiler's timed record of every kernel, copy and CPU call."),
  engine('CPU tier', 'KV pages offloaded from the GPU into CPU memory.'),
  engine('disk tier', 'KV pages offloaded further, onto local disk or storage.'),
  engine('page in transit', 'A KV page being copied between tiers, not yet readable.'),
  engine('KV events', 'Messages the engine publishes when a KV block is stored or removed.'),
]

/** One of the product's own words: what it means here, and the words it replaces, which the screen no longer uses for it. */
export interface ProductWord {
  readonly word: string
  readonly means: string
  readonly not: readonly string[]
}

/** The product's own words, one meaning each (REDESIGN §2.7, "The product's own words"). */
export const PRODUCT_WORDS: readonly ProductWord[] = [
  { word: 'step', means: "The engine's step, and the Step button that runs one.", not: ['a part of a lesson'] },
  { word: 'section', means: "Run, Read, Test or Keep: one of a lesson's four.", not: [] },
  { word: 'part', means: "One headed piece of a lesson's Read section.", not: [] },
  { word: 'question', means: "One item, in a lesson's Test and in Review.", not: ['check', 'ticket'] },
  { word: 'Test', means: "A lesson's third section: its questions and graded levels.", not: ['Check', 'exit check'] },
  { word: 'checks', means: "A lab's automated checks, which is the crates' own word.", not: [] },
  { word: 'Parts', means: 'The list of the objects a diagram draws, by engine name.', not: ['Key'] },
  { word: 'Keyboard', means: "The list of a page's keyboard shortcuts.", not: ['Keys'] },
  { word: 'legend', means: 'The colour and glyph code for the states a diagram draws.', not: [] },
  { word: 'guess', means: 'A prediction, committed before the run that answers it.', not: [] },
  { word: 'diagram', means: 'What an instrument draws: the engine as its engineers draw it.', not: ['board'] },
]

/** A word for a state, a verdict or a provenance, and what it says. */
export interface StateWord {
  readonly word: string
  readonly means: string
}

/** The words for where a learner stands (REDESIGN §2.4): a skill, an attempt and a lesson each have their own. */
export const STATE_WORDS: Readonly<Record<'skill' | 'attempt' | 'lesson', readonly StateWord[]>> = {
  skill: [
    { word: 'not started', means: 'No question or level of this skill tried yet.' },
    { word: 'tried', means: 'Attempted at least once, and not yet passed in full.' },
    { word: 'passed', means: 'Passed at full weight on a seed drawn at the start.' },
    { word: 'kept', means: 'Passed, and answered again in Review when it came due.' },
  ],
  attempt: [
    { word: 'not yet', means: 'This attempt did not meet its pass rule.' },
    { word: 'passed in practice', means: 'Met the pass rule on a practice seed or part weight.' },
    { word: 'passed', means: 'Met the pass rule at full weight on a fresh seed.' },
  ],
  lesson: [
    { word: 'not started', means: 'Nothing in this lesson has been run or answered yet.' },
    { word: 'started', means: 'Something is run or answered, and its Test is not passed.' },
    { word: 'done', means: "The lesson's Test is passed, at full weight." },
  ],
}

/** The two verdicts a run or an answer gets. Nothing else is printed as a verdict. */
export const VERDICT_WORDS: readonly StateWord[] = [
  { word: 'Passed', means: 'The run or the answer met its pass rule.' },
  { word: 'Not yet', means: 'The run or the answer missed its pass rule this time.' },
]

/** How a number is known (ARCHITECTURE's tags, and the course's synthetic worlds), and what a part with no engine source says. */
export const PROVENANCE_WORDS: readonly StateWord[] = [
  { word: 'measured', means: 'Read or measured from a named source, on a stated date.' },
  { word: 'derived', means: 'Arithmetic on numbers that carry their own tags.' },
  { word: 'estimated', means: 'A judgment or a design target, not a measurement.' },
  { word: 'unverified', means: 'Not yet checked against a primary source; never load-bearing.' },
  { word: 'synthetic', means: "A number of the course's invented world, claiming nothing real." },
  { word: 'model object', means: 'Drawn by the course model, with no engine source behind it.' },
  { word: 'Not published yet', means: 'What an unbuilt module, game or lab says instead of a date.' },
]

/** The row for a term, by the term as printed, or undefined. Case matters: `Test` is a section, and `test` is not a term. */
export const termOf = (term: string): Term | undefined => TERMS.find((row) => row.term === term)
