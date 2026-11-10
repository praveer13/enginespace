# enginespace: the games

**Status:** a design for the owner's review, dated 2026-11-03. Nothing here is built.

**What this file owns.** It designs every game: the rule, the levels and seeds, scoring, the scenes, the 2D paths, the budgets and the pure session APIs. Three neighbours own the rest:
- [ARCHITECTURE.md](ARCHITECTURE.md) §5-§6 owns the framework the games run on: `packages/sim`, `packages/play`, the scene kit, device tiers, input, accessibility mechanics and bundle budgets. This file uses its game ids and its kit, and §13 lists every place where it proposes a change.
- ASSESSMENT.md (written in parallel) owns credit: provenance weights and final pass bars. The pass conditions below are the games' proposals to it.
- The look is The Pass, a restaurant line kitchen and its expo pass (D-047). Its direction contract sits in the front page's surface brief, `.impeccable/surfaces/src-front-frontpage-tsx.md`; the design system applies it (W0-T05), and DESIGN.md documents it at the end of W0 (W0-T25). This file describes scenes, objects, cameras and interactions, and §2.6 names them in the kitchen. Where a state must stand out it says *emphasis*, and the design system decides what emphasis looks like.

**Sources.**
- `PRODUCT.md` (owner-confirmed 2026-11-03), [DECISIONS.md](DECISIONS.md) D-001 to D-049.
- kernelspace `SPECIALIZATIONS.md` §2, §3.5, §4 and §7 (untracked, dated 2026-10-24).
- kernelspace at `origin/master` d478f91 (2026-10-30): `PLAN-100X.md` §5.4; `docs/100x-evidence/research/games-3d.md`; the plays (`src/lib/world/{play,sched,eplb,tiling}.ts`, `src/lib/world/bands/*`, `src/components/play/*`, `src/components/three/View3D.tsx`); the Fleet exercises (`src/lib/world/fleet-ex/*`); the S5 card (`src/lib/world/physics/{card,types,table}.ts`) and its InferenceX points.
- statespace at 7b6938c (2026-10-27): its receipts and its "no game layer" stance (`docs/WORLD.md`, `docs/EVIDENCE.md`), as a structural precedent.
- Upstream, checked 2026-11-03 unless dated otherwise: vLLM v0.33.0 source and docs; vLLM `main` (connector, events, rejection sampler, engine core); SGLang docs; papers and READMEs named per claim. [research/upstream-sglang.md](../research/upstream-sglang.md) (this workflow's research, checked 2026-11-03) is cited by its row ids, such as "research G3", and [research/upstream-vllm.md](../research/upstream-vllm.md) as "research vllm M7".

**Tags.** As in ARCHITECTURE.md:
- [measured]: read or measured from the named source, with its date.
- [derived]: arithmetic on tagged inputs, reproduced by a test before it ships.
- [estimated]: a judgment or a design target. Every budget, size and threshold here is [estimated] unless marked otherwise.
- [unverified]: not checked against a primary source; never load-bearing.
- *synthetic*: a number of a game's invented world. It claims nothing about a real engine, and the screen labels it so.

A table whose numbers share one tag says so in its header or caption.

---

## 0. The games on one screen

Nine games: six in 3D, three in 2D. The Loop is one game that the front page opens and TR2 continues, so a visitor's first minute and TR2's graded levels run the same model.

| Id | Display name (D-049) | Game | Module | The rule (= the concept) | View | Graded levels (fresh seeds) | Size |
|---|---|---|---|---|---|---|---|
| `loop` | **Service** · *the step loop* | **The Loop** | front page; TR2; TR6's mask lane | Adding a request to a decode step costs the GPU little, so the loop wins by keeping every slot live and never making the GPU wait for the CPU. CUDA graphs pad each step to a captured size or fall back to launches. | 3D, flagship | TR2: capture sizes, modes, "close the bubbles"; TR6: mask lane | L + L |
| `shape-shifter` | **Sheet Pan** · *tensor views and copies* | **Shape Shifter** | TR0 | A tensor is a buffer plus shape and strides: views move nothing, a copy moves everything. | 3D | fewest copies; grid coverage | M |
| `engine-floor` | **Back of House** · *a request's lifecycle* | **The Engine Floor** | TR1 | Data crosses a boundary only through the mechanism that crosses it: a queue between threads, IPC between processes, a copy between host and GPU, a sync before reading an async result. | 3D | the lifecycle map, span-checked | M |
| `gap-hunt` | **The Tape** · *trace attribution* | **Gap Hunt** | TR3; capstone | A GPU gap is an empty launch queue, and every ns of a step belongs to exactly one category. | 2D | attribution of synthetic, then pinned, traces | M |
| `dispatch` | **Line Check** · *attention backend selection* | **Dispatch** | TR4 | The engine takes the first backend in its order whose support covers the model and GPU. | 2D | backend picks on fresh feature cards | S |
| `pool` | **The Reach-In** · *hybrid KV pages and adapters* | **The Pool** | TR5a | One page pool serves every KV group and every adapter. A prefix hit counts only where every group holds it. | 3D, flagship | eviction, adapters, the full manager | L |
| `switchyard` | **The Dumbwaiter** · *KV offload, connector and events* | **The Switchyard** | TR5b | A block may be read only after its load lands, freed only after its save completes, and every move is published in an order a consumer can replay. | 3D | yard master; event conformance | M |
| `verifier` | **The Tasting** · *speculative decoding's verifier* | **The Verifier** | TR6 | Accept a draft with probability min(1, p/q) and recover from (p − q)⁺, and the output is p exactly. | 3D, flagship | make it exact; the chain; how long a draft | M |
| `broken-bench` | **The Inspection** · *benchmark methodology* | **Broken Bench** | TR8 | Latency counts from when a request was due, and a percentile is only as good as its sample. | 2D (optional 3D opener) | the court: five mixed cases | M (+S) |

A learner sees the display name, over its subtitle (D-049; §2.6 puts each game in the kitchen). The Game column keeps the working names, which the design docs use as shorthand, and no id changes.

TR7 and the capstone have no game of their own (§12). Six course games across TR1-TR8 is the brief's floor; this roster has eight in that range, three of them flagship 3D. Each flagship has one moment that carries its idea and stops a scroll:
- **The Loop:** the GPU lane's gaps close as the second tray appears.
- **The Pool:** a page fans into the layers it serves while threads reach across the rack to it.
- **The Verifier:** drafted tokens drop through skylines into depth, and the output skyline settles exactly onto p.

---

## 1. Rules every game keeps

1. **The rule is the concept.** The test is kernelspace's: "if you play well, have you necessarily used the concept?" (games-3d.md F2). No game is a quiz with a game around it.
2. **Seeded and deterministic.** Every level draws its world from a seed with kernelspace's splitmix32. The same seed and the same actions give the same state hash in Bun and in every browser (D-017).
3. **Count, don't time.** Scores are counts of tokens, ticks, µs on the model's clock, pages, launches or correct marks. No score ever reads the player's speed, and no game has a timer (PLAN-100X §10; catalog §7).
4. **Play feeds Predict and Prove.** Each level opens with a prediction committed before the reveal, and each module's Prove-it is a graded level on fresh seeds with the agent closed (§2.2).
5. **Two more paths.** Every 3D game has a reduced-motion path (the same 3D, nothing moves without input) and a 2D path (the same session, drawn flat). Both reach the whole concept (D-018).
6. **Nothing collected.** No analytics, no network calls from games, no device fingerprint. Play results go only to the learner's on-device ledger, and the front page records nothing (D-009, D-038).
7. **The world is a model.** Every game shows its notional-machine card: what it models, what it ignores and what calibrated it. The real engine is the judge (D-012).
8. **The gate holds.** Every 3D scene passes kernelspace's seven-test gate as D-019 amends it (§2.4).

---

## 2. Shared foundations

### 2.1 Seeds, bands and the hidden reference

These reuse kernelspace's shipped pattern (`src/lib/rng.ts`, `src/lib/world/play.ts`, `bands/*`, `fleet-ex/*`, all at d478f91).

- **Draws.** `drawInBand(entropy, make, band)` tries the entropy itself, then its splitmix32 outputs, and keeps the first candidate in band, as kernelspace's EPLB and knee draws do. It gives up after 256 tries [kernelspace's `MAX_DRAWS`, measured at d478f91].
- **Answer first.** Where a learner predicts one of a few answers, the draw picks the answer first and then a scene that yields it, so no constant answer is right on more than about 1/k of banded seeds (kernelspace's D39 rule in `knee.ts`, `pd-split.ts`, `broken-bench.ts`).
- **Bands.** A band rule makes each seed a fair question: the naive strategy visibly loses, the reference passes, and the answer is not a coin flip between neighbours. Each game's band acceptance is measured and printed by its tests, with a floor of 20% of candidates (kernelspace's EPLB floor).
- **Seeds.** The practice seed is the first in-band candidate from 0, pinned in the level. A graded attempt draws `crypto.getRandomValues` at start, bands it, and is stamped `unseen`: unseen, not secret (kernelspace S3; ARCHITECTURE §8.2).
- **The ghost.** The reference policy plays the same seed in lockstep and is read only by the debrief (kernelspace's `LockstepModel`). Scores are `min(1, mine ÷ ghost)` for counts where more is better, or `min(1, ghost ÷ mine)` for costs. A learner may beat the ghost on some seeds; the score caps at 1 and the debrief says so, as EPLB's does.
- **Turns.** A turn exists only where a decision changes something; every other step applies by itself. Turn cap 60, skip offered after 5 turns [kernelspace's `TURN_CAP` and `SKIP_AFTER_TURNS`, measured at d478f91], unless a game says otherwise.
- **The debrief** stops at the first divergence that mattered. kernelspace's rule: with R(i) = "the reference policy, taking over the learner's state before decision i, still reaches the bound", the root cause is the latest learner decision d with R(d) true and R(d + 1) false. Games that are configurations rather than sequences use a counterfactual instead: swap one lever to the reference's value, re-run, and name the lever worth the most.
- **The action log is the record.** A run stores `{seed, level, actions[], rev}` and grading replays it (ARCHITECTURE §6.3).

### 2.2 Predict, Play, Build, Prove, Keep

| Step | What the games supply |
|---|---|
| **Predict** | Each level's opening prediction is generated by the game's model on the session seed and committed before anything is revealed (kernelspace's `predict` block). Examples: "Async scheduling on: what TPOT now?"; "How many pages will this request hold?"; "What p99 should the benchmark have reported?" |
| **Play** | Practice levels on pinned seeds; "New numbers" draws an unseen seed in band. |
| **Build** | Each game names the lab whose behaviour it previews: `hybrid-kv`, `rejection-sampler`, `kv-publisher`, the TR0 forward lab, the TR1 fork. The game's model and the lab's reference share their invariant lists, so the game teaches the properties the lab tests. |
| **Prove (browser)** | The module's Prove-it is a graded level on fresh seeds with the agent closed. |
| **Prove (GPU lane)** | Each game names one prediction its model makes about the learner's real engine run. The GPU lab tests it, and the local grader owns that credit: correctness against references, and performance evidence checked for internal consistency (D-001). The evidence arrives as a receipt (ARCHITECTURE §8.4), the pattern statespace calls Bench receipts. A game never grades a GPU number. |
| **Keep** | Each session exports item generators for Today (D-037), such as "pages held by this request" or "corrected p99 for this log". |

### 2.3 The scene kit, as the games use it

ARCHITECTURE §6.4 defines the kit's parts: `Stage`, `tiers`/`Governor`, `CameraRig`, `SpanInstances`, `BlockGrid`, `Skyline`, `Rails`, `Links`, `LabelLayer`, `TimeAxis`, `Selection`, `PostFX`. This section adds what the games need on top.

#### Shared objects

Every object is a data mark drawn from `packages/play/<id>/layout.ts`. No object is decoration.

| Object | Stands for | Kit primitive | Games |
|---|---|---|---|
| **Slab** | a span of time on one lane: a step, a CPU phase, a kernel, a transfer | `SpanInstances` | loop, switchyard, broken-bench opener |
| **Cell** | one unit: a token, a slot-step, a page, a tensor element | `BlockGrid` | loop, pool, switchyard, shape-shifter |
| **Comb** | many thin slabs in a row: kernel launches, one per tooth | `SpanInstances` | loop |
| **Lane** | a processor's track: a CPU thread, a GPU stream, a copy stream | `TimeAxis` + `SpanInstances` | loop, gap-hunt (2D), switchyard |
| **Rack** | a fixed array of physical pages, each at its own position for its whole life | `BlockGrid` | pool, switchyard |
| **Thread** | a mapping drawn as a line: a block table to its pages, a stride walk through cells | `Links`, `Rails` | pool, switchyard, shape-shifter |
| **Platform, bridge, lift, gate** | a process, IPC, a host-device copy, a sync | `BlockGrid` + `Links` | engine-floor |
| **Skyline** | a distribution's bars | `Skyline` | verifier |
| **Marker** | one sampled event: a drafted token, an arrival | `SpanInstances` (points) | verifier, broken-bench opener |

Rules for objects:
- **Every state has a shape or glyph besides colour** (WCAG 1.4.1): a live cell is solid, an empty slot is an open groove, a ghost token is a hollow cell, a cached page carries a hash glyph, a pinned page a pin glyph.
- **All text is DOM** through `LabelLayer`; nothing is written in the canvas (D-021).
- **One material per object kind**, instanced, no image textures. Per-instance data carries a role index that the design tokens resolve (W0-T05; ARCHITECTURE §6.4).

#### Camera grammar

Four shots, used the same way in every game, so a learner who has played one game can read the next.

| Shot | Purpose | Rule |
|---|---|---|
| **Establish** | the whole machine and its history | the default; perspective, a narrow field of view (about 30°, kernelspace `Cube3D.tsx`) so sizes read nearly true |
| **Focus** | one object fills about 60% of the frame: a tray, a page, a skyline row | opened by selecting the object; Escape returns to Establish |
| **Follow** | keeps one moving object centred: the request capsule, the verifier's walk | always opt-in, off under reduced motion |
| **Compare** | two or three runs side by side, to compare lengths and gaps | orthographic, because a length comparison must not depend on depth |

- The camera moves only on a learner's action or a level beat the learner advances, never on a timer.
- Transitions take at most 400 ms [estimated] and cut under reduced motion.
- Up stays up and nothing rolls. Turns go in 45° steps by buttons (Cube3D's grammar). Free orbit by drag is optional and never needed (WCAG 2.5.7).
- `C` cycles the scene's named presets (ARCHITECTURE §6.8). Each game lists its presets.
- **Portrait framing.** Below 480 px wide, each scene has a portrait layout chosen in `layout.ts`. Long axes run into the screen, away from the camera, so a phone's height shows history.

#### Input

ARCHITECTURE §6.8 sets one action stream and the common keys: `Space` play or pause, `.` and `,` step forward and back, `[` and `]` previous and next level stage, `C` camera preset, `V` 2D or 3D, `?` help. The games add:

- **Picks focus the DOM control.** A 3D pick resolves `instanceId` to an entity and moves focus to that entity's DOM control, so pointer and screen reader meet in one place. A primary action fires only when unambiguous.
- **Native keys win.** A game shortcut never fires when the event's target is a control that uses the key natively: `Space` and `Enter` on a button, arrows in a radio group or listbox. This guards `Space` (play or pause) against double use on a focused button.
- **Shortcuts can be turned off** in Settings, and they act only while focus is inside the game (WCAG 2.1.4).
- **Touch.** A tap is a click. A long press opens Details, which also has a button. Pinch and two-finger drag move the camera only and are never needed. Primary controls are at least 44 px (kernelspace's chip rows).
- **No speed anywhere.** No input is read for timing, and no control expires.
- **Undo** exists in practice levels. Graded levels have none: each decision is final, as in kernelspace's plays.

#### Adaptive quality

ARCHITECTURE §6.6 sets tiers T0 (2D only) to T3 and the governor. Games add one knob, **aggregation**: above a tier's instance cap, a run of identical cells becomes one slab with a count in the mirror and a DOM label. Aggregation is chosen in `layout.ts`, so it is deterministic and tested, and it never hides a mark the level's question needs. Each game's budget names what it aggregates first.

#### WebGL fallback and loading

ARCHITECTURE §6.7 and §6.10 apply unchanged: WebGL2 only (D-020); context loss or a failed compile renders the 2D view in the same box with the session intact; the 2D view paints first and the 3D chunk loads after LCP on the front page, or on opening elsewhere.

#### Accessibility

ARCHITECTURE §6.9 applies. Per game, this file adds the live-region line, which is one sentence per turn, and the mirror's columns. The rule for both: the mirror and the live line carry every number the scene draws, so the canvas holds no unique information.

#### Budgets

Ceilings for every scene, from ARCHITECTURE §11.1: at most 100 draw calls, 50k instances, 200 MB of GPU memory, and 40 KB gz of scene code over the shared `three-vendor` chunk (≤ 245 KB gz) [estimated, from kernelspace's measured 238-242.4 KB]. Frame time p95 is at most 16.7 ms at T2 on the reference laptop and at most 33.3 ms at T1 on the reference phone [derived: 1,000 ÷ 60 and 1,000 ÷ 30]. Each game below sets tighter targets. Frame budgets are checked by hand at each wave's exit, because CI has no GPU; draw calls and instances are read from `renderer.info` in e2e (kernelspace `Cube3D.tsx`'s `frameCounts`).

### 2.4 The seven-test gate, per 3D game

D-019 keeps kernelspace's tests 1, 3, 4, 6 and 7 required, restates 5, and makes test 2 advisory. This table states each 3D game's case, including its axes, so the advisory test is still answered.

| Game | 1 Intrinsic | 2 Axes | 3 Model-backed | 4 Recurs in ≥ 3 sessions | 5 Schematic | 6 Low load | 7 Debriefed |
|---|---|---|---|---|---|---|---|
| The Loop | refilling slots and overlapping is how you win | time × lane × slot | `steploop` | front page, TR2's levels, TR6's mask lane, TR3's synthetic traces, Keep | slabs and cells | turn-based, pausable | counterfactual lever |
| Shape Shifter | the fewest copies is the concept of a view | the tensor's three dims | `tensor` | TR0 levels, Keep, TR4 reads | cells, one thread | turn-based | fewest-copies ghost |
| The Engine Floor | a wrong mechanism cannot move the request | process × thread × rank | `lifecycle` | TR1 levels, TR3 span names, capstone | platforms, links | turn-based | first wrong stage |
| The Pool | a hit or a page saved is the concept | page × group/layer × token | `kv` | TR5a levels, The Switchyard, Keep | rack, threads | turn-based | R(i) rule |
| The Switchyard | an unsafe move corrupts output | tier × block × layer | `tiers`, `kv` | TR5b levels, Keep, capstone reads | decks, cars | turn-based | first violation or R(i) |
| The Verifier | an exact residual is the only way to TV = 0 | token × probability × draft position | `spec` | TR6 levels, the forge lab, Keep | skylines | turn-based | worst token |

### 2.5 The session contract and what CI checks

Every game is a pure session in `packages/play/<id>`, as ARCHITECTURE §6.3 lays out. This file uses one shape:

```ts
// packages/play/types.ts: the shape every game follows (W0-T14 built it from this sketch, and added inBand, grade and Ask)
export interface Session<Level, State, Action, View, Score, Ask = unknown> {
  level(id: string, seed: Seed): Level        // setup(seed), the prediction to commit, KCs, card id; throws for a level the game lacks
  inBand(id: string, seed: Seed): boolean     // the band (§2.1): the naive strategy loses and the reference passes
  init(level: Level): State
  ask(s: State): Ask | null                   // the pending decision, or null when the next step applies by itself
  reduce(s: State, a: Action): State          // pure; throws on an illegal action unless the game allows unsafe moves (§9)
  view(s: State): View                        // what the 3D scene, the 2D view and the mirror all render
  done(s: State): boolean
  score(s: State): Score                      // counts only
  ghost(level: Level): State                  // the reference run; read only by the debrief and the grade
  grade(mine: State, ghost: State): Grade     // { score in [0, 1], ok }: min(1, mine ÷ ghost) for counts where more is better (§2.1)
  debrief(mine: State, ghost: State): Debrief // the sentence and the turn or lever it names
}
```

A run is `{seed, level, actions[], rev}`, and `replay` in `packages/play/replay.ts` grades it from the log alone. The shell around the views is `src/games/kit`.

`verify:games` (ARCHITECTURE §6.2) fails a game without: a 2D view, a mirror, a debrief, a card, a keyboard map, KCs, claims that exist, a practice seed in band, band acceptance ≥ 20%, a keyboard-only e2e walk, a reduced-motion e2e walk, a determinism test (same seed and actions, same state hash in Bun and three browsers), and a display name with its subtitle (D-049).

### 2.6 The Pass: every game in the kitchen

D-047 set the course's visual world: **The Pass**, a restaurant line kitchen and its expo pass, chosen by the owner on 2026-11-03. Its direction contract sits in the front page's surface brief, `.impeccable/surfaces/src-front-frontpage-tsx.md`: continuous batching is a line kitchen, and the learner is the expediter who fires each step. This section carries that world into every game. Each game gets a display name in kitchen vocabulary over its engine concept (D-049), and one vocabulary maps every sim element to a kitchen object. Each game's block then gives its scene, cameras and materials, and what must stay legible.

**The rules do not change.** The rule is still the concept (§1). Every rule, count, level, band, score, pass bar, invariant, id, action and claim in §3-§11 stays as written. The kitchen names the marks those sections draw and adds none. Where a kitchen reading and a rule disagree, the rule wins and the reading is rewritten.

#### How the kitchen applies

1. **A name, never a prop.** Each kitchen object is the §2.3 mark it names, drawn from `layout.ts` by the same kit primitive. Nothing is added for atmosphere: no cooks, food, flames, steam or knives, and no photoreal equipment (D-019's test 5; §2.3, "no object is decoration"). A plate is a cell named and shaped as a plate, not a picture of food.
2. **Two vocabularies, one meaning.** The kitchen word names the object, and the engine term names the concept. A label gives both the first time an object appears in a level ("fire · step"). The engine term leads wherever the learner will meet it again: the mirror's column heads, the debrief, the In-production and Build-this cards, items, Keep, claims and the Markdown export. The live line follows the labels.
3. **Ids stay** (D-049). Game ids, level ids, actions, ledger refs, KCs, claims, routes and file names keep their engine names. The display name and its subtitle are copy in the game registry (W0-T14).
4. **Materials come from roles.** Every surface and scene material is a token role from `src/design/tokens.ts`, resolved by `scene-tokens.ts` (W0-T05). The design system realises the contract's materials: brushed stainless, ticket paper with its two inks, the heat lamp, masking tape and the categorical code. This section only says which object takes which. No colour value, font name or image texture appears here or in a scene (§2.3).
5. **One heat lamp.** The contract's active state falls only on *the present*: the place the learner's next decision acts on. Each block below names its present. History, ghosts and the debrief never take it.
6. **The code is categorical, and never alone.** The contract's categorical code is the only colour code, and every category also has a glyph or a shape (§2.3; WCAG 1.4.1).
7. **Numbers stay DOM.** Every count, tick, µs, ns, probability, id and percentage is DOM text in `LabelLayer`, the mirror, the tape or the controls, set in the numeral role. None is painted in a canvas or baked into a material (D-021). Tickets, tape labels and the printer tape are DOM elements anchored to their marks.
8. **The clock says what it is.** Ticks are labelled synthetic wherever they appear (D-048). µs on the model's clock start with TR2's levels, and a trace's ns carry their trace's source (§6).

#### Vocabulary

| Sim element | Kitchen object | How it reads |
|---|---|---|
| Request | a **ticket** | One table's order. Each output token is one course, and the expo cannot see how many courses a table will want. |
| Admission (prefill) | **hanging a ticket** | The ticket's order lines, its prompt, are prepped in the fire it joins: on the front page, 1 more tick of cooking (synthetic). |
| Batch slot | a **clip on the rail** | The rail has a fixed number of clips, 4 on the front page [estimated] (D-043). A clip without a ticket is paid for and empty. |
| Waiting queue | **tickets curling out of the printer** | Orders not yet on the rail, fed in from the left. The expo hangs the next one. |
| GPU lane | **the line's stations** | Cooking. A lit stretch is the GPU busy, and its length is the cook time. |
| CPU lane | **the expediter's ticket work** | Writing the next call (schedule and prepare), then reading the plates back (sample, stop check, detokenize). |
| Bubble | **stations dark while the expo writes** | The GPU waits on the CPU. |
| Step | **one fire, rung by the bell** | Every live clip sends one course. A fire takes the line about as long for one ticket as for four, so an empty clip is a course the line paid for and nobody ate. |
| Static batching | **firing the rail as a set** | No ticket hangs until every clip has cleared. |
| Overlap (async scheduling) | **the next call, written during this fire**, on a second rail | The expo writes fire N+1 while fire N cooks, so the line need not go dark. |
| Ghost token | a **binned plate** | Writing ahead, the expo fires one more course for a table that has just asked for the check, and it is binned. A set menu (a `max_tokens` stop) never gets one. |
| Launch comb | **calling each dish** | With no drilled routine, the expo calls every dish to the line one by one, one tooth per call. |
| Graph replay | **one word fires a drilled routine** | The line has drilled this fire's size, so one call starts it all, and the comb collapses into one short slab. |
| Capture sizes and padding | the **mold rack** | One ring mold per drilled size, smallest first. A fire drops into the smallest mold that holds it, and the mold's empty places are padding. Above the largest mold, the expo calls each dish. |
| Grammar mask (TR6) | the **allergy card** | Before a course is chosen, the expo strikes the dishes the table may not have. The card is written during the fire, and if it is not done when the fire ends, the line waits. |
| Token out | **a plate down the pass** | One per live clip per fire. Useful tokens are plates that reached a table. |
| KV page | a **hotel pan in the reach-in** | One block's prepped mise, for every layer of a group. A pan keeps its slot for life, and its masking-tape label carries its hash and its group. |
| KV group | a **station's code** on a pan's tape | Each group is one of the line's stations, its layers grouped so that the group's block fills one pan. A full-attention station keeps all its pans; a sliding-window station keeps only those of its last W tokens, its **hold window**. |
| Free queue | **the rotation** | The pans nobody holds, in eviction order, the next to be dumped on the left. A labelled pan still holds its mise; a bare pan holds none. |
| Adapter | a **recipe kit** | A variant's own mise, in pans from the same reach-in, not side by side. A kit stays while any ticket using it is on the rail. |
| Prefix hit | **shared mise** | A ticket whose order opens like an earlier one starts from that one's pans, in whole pans, and only as far as every station still holds them. |
| Eviction | **dumping a pan** | Only a labelled pan nobody holds, from the head of the rotation. Its mise is gone, and the next ticket that needs it re-preps it (recomputed tokens). |
| Preemption | **pulling a ticket** | Its pans go back, and it fires again later. |
| Request lifecycle | the **host stand**, the **ticket window**, the **dumbwaiter** and **"Heard!"** | Where a ticket enters the house (the API server); the only way between floors (IPC); down to the line and back (host-to-GPU and GPU-to-host copies); and the call-back that must come before anyone reads what the line made (a sync). Between two pairs of hands on one floor, a ticket waits on a **spike** (a queue). |
| KV tiers | the **reach-in**, the **cooler** and the **basement** | GPU, CPU and disk, a floor each. A peer is the **sister kitchen**. |
| KV transfer | the **dumbwaiter's car** | A pan in the car cannot be cooked from until the car lands, and the floor it left keeps its copy until the trip is done. |
| KV events | **pan calls** | Every pan in or out is called out to the front of house with its number, so the board at the host stand can be rebuilt from the calls alone. |
| Draft | **the commis's plates** | A junior cook plates the next γ courses ahead of the chef. q is how often the commis plates each dish. |
| Target p | **the chef's tasting** | How often the chef herself would send each dish: what the pass must serve, exactly. |
| Accept | **keeping a commis plate** | A plate of dish x is kept with probability min(1, p(x)/q(x)). |
| Residual | **re-plating** | At the first plate sent back, the chef re-plates from the dishes the commis under-plates, (p − q)⁺, and bins the rest of the run. If every plate is kept, she plates one more course herself (the bonus token). |
| Open loop | **walk-ins** | Guests arrive when they arrive, whatever the kitchen is doing. |
| Closed loop | **a fixed set of tables** | A table orders again only after its last plate lands, so when the kitchen stalls, nobody new orders. |
| Coordinated omission | **the inspector's stopwatch that pauses when the kitchen is slammed** | The worst waits never reach the log. Latency counts from when the guest was due. |
| Backend dispatch | **which station's equipment takes the dish** | The house checks its equipment in a fixed order, and the first piece that covers every requirement takes the dish. |
| Tensor, view, copy | **a sheet pan, relabelled or re-plated** | The label (shape, strides, offset) says how to read the pan. A relabel moves nothing; a re-plate moves every portion. |
| Trace | **the night's tape** | The printer's record of every call, cook and wait, with its time. |
| Reference policy (the ghost) | **the house run** | The same night, worked by the house's standard. Only the debrief reads it; on the front page, its count is par. |

#### Service (`loop`)

*The step loop.* Working name The Loop (§3), on the front page, in TR2 and in TR6's mask lane. The front-page run, "First loop" (§3.1), is billed **First service**, TR2's levels are **the full service**, and the course map, where the run ends, is **the menu**.

- **The present:** the pass, meaning the rail, the fired rail and the fire being called.
- **Scene** (§3, "3D scene"). On the front page, the contract's FIRST VIEWPORT places these objects.
  - **The bay is the pass,** at the near end. The tray of slots is **the rail** above it, one clip per slot. The waiting requests are **tickets curling out of the printer** at the rail's left end. With overlap on, the second tray is **the fired rail**: it holds the fire on the line while the expo fills the rail for the next one. In TR2 the rack of molds is **the mold rack** beside the pass, and the dispatcher's pick is the mold the fire drops into.
  - **The lanes run from the pass into the night.** The CPU lane, on the left, is **the expo's lane**: plan slabs are the expo writing the call, and read slabs are the expo reading the plates back. The GPU lane, on the right, is **the line**: each fire is a lit slab, as long as its cook time and as wide as the rail. TR2's copy lane is **the dumbwaiter's lane**, and TR6's mask lane is **the allergy card**, written on the expo's side during the fire.
  - **Places.** Each fire carries one place per clip: a **plate** (a live slot), an **empty place** (an open groove, paid for and empty), a **binned plate** (hollow: the ghost token) and, in TR2, an **empty mold place** (marked as padding). A clip's places line up along the night.
  - **Dark stretches** on the line are the bubbles.
  - **Combs** are the expo calling each dish, one tooth per call. A graph replay is **one word** and one short slab. Piecewise mode is a comb with fewer teeth: the routine is drilled in pieces, and the expo calls the dishes between them.
  - **The bell** is the step mark. Everything moves on it; between bells only the printer feeds, and only while the clock runs. While the loop waits for a decision, nothing moves (§3).
  - **The printer tape** is the live readout (DOM): the fire's number, the ticks it took, labelled synthetic, and the stations busy (D-048). In TR2 it shows µs on the model's clock and the graph hit.
  - **Compare** sets three services of the same night side by side: firing the rail as a set (static batching), refilling clips (continuous), and refilling while the next call is written during the fire (overlap).
- **First service's copy** (§3.1's beats). Beat 1 reads "Tap a ticket to hang it on the rail" (put a request in the batch). Beat 2's counter reads "clip paid for, empty". Beat 3's switch reads "Write the next call during this fire", with "overlap (async scheduling)" beside it.
- **TR2's levels in the kitchen** (§3.2):
  - `async`: the expo writes during the fire, on both cost cards, which keep their names because they are claims;
  - `graphs` · `comb`: calling each dish against one word;
  - `graphs` · `sizes`: which routines the line drills before service, within the time it has to drill them, with vLLM's ladder beside SGLang's buckets;
  - `graphs` · `modes`: how much of each fire is drilled;
  - `keys`: routines drilled per count of recipe kits, whose space comes out of the reach-in before its pans are counted (graph memory is reserved before the KV cache is sized);
  - `mrv2`: the V2 runner, where the line sets up its next fire from the rail itself (input preparation on the GPU);
  - `close`: everything, on fresh seeds;
  - `mask` (TR6): does the allergy card fit inside the fire?
- **Cameras** (§3's presets):
  - **Over the shoulder** (along time; Establish): from behind the expo, across the pass and down the night, about 25° up. The front page opens here.
  - **Side of the pass** (side; Compare, orthographic): fires as lengths and dark stretches as gaps. `first-4-par` ends here, with the three services stacked.
  - **Under the lamps** (top): straight down on the rail and the fires, where empty clips and empty places are easy to count.
- **Materials.** The pass, the rail, the lanes and the mold rack are stainless. Tickets, the printer tape and every label are ticket paper with its inks (DOM). The line's lit fires take the `gpu` lane role, the expo's lane `cpu`, the dumbwaiter's lane `copy` and dark stretches `idle`. Places differ by shape first: solid, open groove, hollow, marked. The heat lamp falls on the pass alone.
- **Moment** (§0's flagship moment): the dark stretches close as the fired rail appears, and the line lights end to end.
- **Must stay legible at 390 px:** each place's shape; the dark stretches; ticket numbers, as DOM labels on the tickets; and the tape's counters, all DOM: plates, binned plates, empty mold places, busy and dark ticks (or µs), calls and eager fires.

#### Sheet Pan (`shape-shifter`)

*Tensor views and copies.* Working name Shape Shifter (§4), in TR0.

- **The present:** the pan the next operation acts on.
- **Scene** (§4, "3D scene"):
  - The tensor's block of cells is **a speed rack of sheet pans**, and each cell is **a portion**. A rank-2 tensor is one pan of rows and columns; a rank-3 tensor is a rack of pans.
  - The buffer strip below is **the bench row**: every portion in one line along the bench, in the order it was portioned. A portion's place on the row is its address.
  - The stride thread is **butcher's twine**, run through the portions in the order the label says to read them, touching the bench row at each portion's place.
  - Shape, strides and offset are **the pan's tape label** (DOM).
  - A view (`view`, `transpose`, `permute`, `expand`, slicing) is **a relabel**: new tape, the twine re-tied, and nothing on the bench moved. A copy (`contiguous()`, or a `reshape` the strides cannot express) is **a re-plate**: a new bench row is laid, and every portion travels to it.
  - `expand` (stride 0) is **one portion read in several places**: the twine passes it more than once, so writing to it writes them all.
  - In `grid`, the program tiles are **the cutter's stamps** over the pan. Each stamp is one program over a BLOCK of portions, and a stamp place that falls off the pan's edge is a masked lane, drawn hollow.
- **Cameras:** **Three-quarter** (Establish: the rack above the bench), **One pan** (Focus: one slice) and **Before and after** (Compare: start against target).
- **Materials.** Pans, rack and bench are stainless. Portions are cells, and the ones a re-plate moves take emphasis while they travel. The twine is a line mark (`Links`, `Rails`), and the label is masking tape (DOM). Masked places are hollow. The heat lamp falls on the pan under the next operation.
- **Must stay legible:** the label's shape and strides (DOM), which portions move and which stay, the masked places, and the counts of copies, portions moved and operations (DOM).

#### Back of House (`engine-floor`)

*A request's lifecycle.* Working name The Engine Floor (§5), in TR1.

- **The present:** the end of the laid path, where the next hand-off starts.
- **Scene** (§5, "3D scene"):
  - The process platforms, stacked in height, are **the floors of the house**: the dining room and **the host stand** at the top (the client and the API server), **the pass** in the middle (the engine core, where the expo works), **the cooks' floors** below (the workers, one cook per rank) and **the line** at the bottom (the GPU deck), whose burners are the streams.
  - Threads are **pairs of hands**, each in its own spot on a floor.
  - A queue between threads is **a spike**: one pair of hands spikes the ticket, and the next pulls it.
  - IPC is **the ticket window** between floors, and shared memory is **the window shelf** both floors reach.
  - A copy is **the dumbwaiter**, down to the line (host to device) or up from it (device to host). A kernel launch is **calling a dish** to the line, as in Service.
  - A sync is **"Heard!"**: the hands that asked stop until the line calls back, and read nothing the line made before it.
  - TP ranks are **twin cooks**, their floors one behind the other in depth, each cooking half of every dish; a collective is **passing halves across** between them.
  - The capsule is **the ticket** itself. It travels the path the learner laid and waits, visibly, on spikes.
  - The tray of stage tiles holds **hand-off cards**, each with its mechanism's glyph and its engine label, such as "spike · `input_queue` (engine core)".
  - Tokenizing is **writing the order in kitchen shorthand** at the host stand, and detokenizing is **naming each plate** on its way out.
  - The debrief lays **two houses' floor plans** side by side, the learner's engine against the other, with the differences given emphasis.
- **Cameras:** **Cutaway** (Establish: the house at three-quarters, floor by floor), **One floor** (Focus, one per platform) and **Follow the ticket** (Follow: opt-in, and off under reduced motion).
- **Materials.** Floors, the pass and the line are stainless. The ticket and every label are ticket paper (DOM). Each hand-off kind has its glyph: spike, window, shelf, dumbwaiter, call, "Heard!" and halves. Floors differ by height, never by colour alone. The heat lamp falls on the end of the laid path.
- **Must stay legible:** floor and hands names (DOM), every hand-off's glyph, and where the ticket stands. The mirror's stage table keeps mechanism, from, to and source in engine terms.

#### The Tape (`gap-hunt`)

*Trace attribution.* Working name Gap Hunt (§6), in TR3 and the capstone; 2D. The Trace Room keeps its name: it is where the tapes are kept.

- **The present:** the focused event.
- **Board** (§6, "2D design"):
  - A trace is **the night's tape**. A synthetic tape says so, and a pinned tape carries its GPU, engine pin, date and SHA-256.
  - The tracks: the CPU main thread is **the expo's lane**, its Python frames stacked as nested calls; CUDA API calls are **the calls**; GPU streams are **the line**; and copies are **the dumbwaiter**.
  - Step marks are **bells**, and a window runs from one bell to the next.
  - The categories: kernel is **cooking**; copy-only is **the dumbwaiter running with nothing cooking**; CPU-gap is **dark while the expo writes**; and both-idle is **everyone waiting**, on I/O or another process. Overlap, reported beside the partition, is **the expo writing while the line cooks**.
  - The unaccounted counter, **unaccounted ns on the tape**, sits at the top and must reach 0.
  - A gap's cause is **what held the line**: the expo's work covering most of the time from the gap's start to the call that ended it, or a "Heard!" (a blocking sync) ending at or after the gap's start, which drained the line's calls.
  - Correlation links join **a call to its dish**.
  - On phones the tape becomes **a list** of the window's events, with category radios.
- **Camera:** none (2D). Zoom and pan run the tape back and forth.
- **Materials.** The tape is ticket paper. Each category takes the categorical code and its own fill pattern, and dark stretches take the `idle` role. The heat lamp falls on the focused event alone.
- **Must stay legible:** every span's category (pattern and code), the unaccounted counter, the window's ns, the cause mark and the bells. The counter and the mirror carry every number as DOM, and the canvas writes none of its own. At 360 px, list mode carries everything.

#### Line Check (`dispatch`)

*Attention backend selection.* Working name Dispatch (§7), in TR4; 2D.

- **The present:** the row the check has reached.
- **Board** (§7, "2D design"):
  - The feature card is **the dish's spec**: GPU architecture, head dim, KV dtype, MLA, sliding window, speculative decoding and page size. They stay in engine terms, because they are what the engine reads.
  - The rule table is **the line-check sheet**: the house's attention equipment in priority order, one row per backend, each listing what it can take.
  - The walk is **the line check**, row by row. The first piece of equipment whose row covers every line of the spec takes the dish. A wrong prediction stops the check at the first requirement that ruled the predicted piece out.
  - The CUDA-graph consequence is **whether the line can drill a routine on that equipment**: always, only when every ticket sends the same number of courses in a fire, only when each sends exactly one, or never (`ALWAYS`, `UNIFORM_BATCH`, `UNIFORM_SINGLE_TOKEN_DECODE`, `NEVER`). It links to Service's `graphs` · `modes`.
- **Camera:** none (2D).
- **Materials.** The sheet and the spec are ticket paper (DOM tables). A row's verdict is a glyph, covers or excluded, beside its text. The heat lamp falls on the row under check.
- **Must stay legible:** the whole sheet as a DOM table, read as stacked rows at 390 px, with the excluding requirement named in words.

#### The Reach-In (`pool`)

*Hybrid KV pages and adapters.* Working name The Pool (§8), in TR5a.

- **The present:** the candidates of the open ask, the pans or tickets the learner can pick now.
- **Scene** (§8, "3D scene"):
  - The rack is **the reach-in**: a hotel pan in every slot, in rows of 16, each in its slot for its whole life. A pan's state is its form plus its tape. Free is **a bare pan**, an empty frame with no tape. Cached is a frame whose tape is still on, with the hash glyph: the mise is still there, but nobody holds it. In use is **a full pan** (solid), its tape carrying its station's group glyph. Adapter is a full pan whose tape carries the pin glyph: **a recipe kit's pan**.
  - Focus on a pan **fans it into its layers**, one slice per layer of its group, with padding layers hollow: one pan serves every layer of its group.
  - Requests are **tickets laid along the pass** in front of the reach-in, each a ruler with one segment per block. Above each ticket runs **one twine per station** to that station's pans, drawn on Focus only.
  - The sliding window is **the station's hold window**, a frame along the ticket. A segment that leaves it drops its twine, and its pan keeps its tape but is no longer held.
  - The free line is **the rotation**, along the reach-in's base, in eviction order, with the next pan to be dumped on the left.
  - An adapter's pages are **a recipe kit's pans**, joined by their own twine and never drawn side by side, because unified paging stores them apart.
  - A prefix hit is **shared mise**: as far as every station still holds the pans, in whole pans, and nothing when the full-attention station's first pan is gone.
  - The actions: admit is **hanging a ticket**, evict is **dumping a pan** from the head of the rotation, preempt is **pulling a ticket**, and prefetch is **bringing a recipe kit in** before its ticket hangs.
  - The slot baseline is **the kit shelf**: at the pins, vLLM and SGLang keep kits on a shelf of fixed slots, apart from the reach-in (D-042). The `adapters` debrief and the In-production card show it.
- **Cameras:** **Front of the reach-in** (Establish: the rack, with the tickets below), **One pan** or **One ticket's twine** (Focus), **One station** (ARCHITECTURE §6.1's per-group filter: only that station's tapes and twine) and **From above** (Top: the rack as a grid).
- **Motion.** Pans never move, because a moving pan would misteach copying (§8). Twine draws, and a pan changes state where it sits.
- **Materials.** The reach-in, its rack and its pans are stainless. Labels are masking tape and marker (DOM). Pan states take the memory roles (free, used, cached, shared, adapter, evicted) on top of their forms, and stations take the categorical code with their glyphs. The heat lamp falls on the open ask's candidates.
- **Moment** (§0's flagship moment): a pan fans into the layers it serves while twine reaches across the reach-in to it.
- **Must stay legible at 390 px:** each pan's glyph on its tape (16 columns, about 20 px each), the rotation's order (DOM), and the counts, all DOM: recomputed tokens (re-prepped), hit tokens (shared mise), completed tickets, preemptions, kit stall steps and evictions.

#### The Dumbwaiter (`switchyard`)

*KV offload, connector and events.* Working name The Switchyard (§9), in TR5b.

- **The present:** the ticket whose controls are open.
- **Scene** (§9, "3D scene"):
  - The three decks are **three floors**: **the reach-in** on the line at the top (the GPU, with The Reach-In's rack), **the cooler** below (CPU) and **the basement** at the bottom (disk). A peer is **the sister kitchen**, whose pans arrive in the same car.
  - Transfers are **the dumbwaiter's car**, running between floors; its fill shows the pans landed.
  - The layer column is **the build**: the dish assembled layer by layer beside the line. It shows how far cooking has reached and which layers' mise has landed, and cooking stops at a layer whose mise is still in the car.
  - Requests waiting for remote KV wait on **the waiting spike** (`WAITING_FOR_REMOTE_KVS`).
  - A page being saved carries **a lock tag**, the lock glyph: its copy is still riding down, so it may not be dumped.
  - Events are **pan calls**, each with its number, called out to the front of house along the call line: stored, removed and all cleared (`BlockStored`, `BlockRemoved`, `AllBlocksCleared`).
  - The consumer's board is **the board at the host stand**: the front of house's picture of this kitchen's mise, rebuilt from the calls alone. After a gap in the calls, it replays from the buffer.
  - A violation sends out **a wrong plate**: cooking from a pan still in the car, dumping a pan whose copy has not landed, or cooking from a spoiled pan. A spoiled pan from storage can spoil a later ticket too.
  - A failed load is **a spoiled pan**: the ticket is cut back to its last good pan, and the spoiled pan and every later one are dumped and re-prepped.
  - Each step is a bell, as in Service: the car advances once per step, and the build climbs until it reaches a layer whose mise is missing.
- **Cameras:** **The shaft** (Establish: the floors and the car), **The build** and **The board** (Focus) and **The shaft from the side** (Side: the car's progress).
- **Materials.** Floors and the car are stainless, and pans are as in The Reach-In. Calls and the board are ticket paper (DOM), with their numbers. Lock tags carry the lock glyph. A violation takes the `bad` status role with its glyph. The heat lamp falls on the open ticket.
- **Must stay legible:** lock tags, the car's fill count (DOM), the layer the build has reached, and the board's mismatch count (DOM).

#### The Tasting (`verifier`)

*Speculative decoding's verifier.* Working name The Verifier (§10), in TR6.

- **The present:** the row being tasted.
- **Scene** (§10, "3D scene"):
  - The rows into depth are **the commis's run**: one row per course the commis plated ahead (1 to γ), then **the chef's extra course**, the bonus row.
  - Each row's skyline spans **the six dishes** of the vocabulary. Each dish's column stacks an **agreed** base, min(p, q). Where the commis plates the dish more often than the chef would, an **over-plated** cap, q − p, sits on top; where the chef would send it more often, an **under-plated** well, p − q, sits beside it.
  - A drafted token is **a commis plate set down** on its dish's column at a seeded height in [0, q(x)). In the agreed base it is kept; in the over-plated cap it is sent back. On a send-back, a second plate drops into the row's under-plated wells: **the chef re-plates**.
  - The verifier's walk is **the chef tasting down the run**. She stops at the first plate sent back, and the later rows are binned.
  - The output skyline at the front is **what went out**, per dish, settling exactly onto the chef's tasting as plates accumulate.
  - The TV meter is **the distance from the chef's tasting**, exact (DOM).
  - In `greedy-ngram`, temperature 0 is **the chef always sending her favourite**, and the n-gram draft is **a commis copying the night's recent plates**, with no idea how often (q is one-hot). `mutants` is **five tasting rules to audit**, and `gamma` is **how many courses the commis should plate ahead**.
- **Cameras:** **Over the run** (Establish: three-quarters over the rows), **One course** (Focus: one row, front-on) and **Walk with the chef** (Follow: opt-in).
- **Materials.** The rows sit on the stainless pass. The agreed base, the over-plated cap and the under-plated well take the `overlap`, `draft` and `residual` probability roles, each with its own pattern. What went out takes `observed`, and the chef's tasting `target`. Commis plates are markers, told apart from the segments by shape. The heat lamp falls on the row being tasted.
- **Moment** (§0's flagship moment): the commis's plates drop through the rows into depth, and what went out settles exactly onto the chef's tasting.
- **Must stay legible:** which segment each plate landed in (kept or sent back, by shape), the distance meter (DOM, an exact fraction), and each dish's output against the chef's tasting (the mirror).

#### The Inspection (`broken-bench`)

*Benchmark methodology.* Working name Broken Bench (§11), in TR8; 2D, with an optional 3D opener. The court is **the hearing**.

- **The present:** the selected row of the log.
- **Board** (§11, "2D design"):
  - A case is **an inspection report**: a claim about a kitchen's times, its setup and the stopwatch log.
  - The log's rows are **each order's times**: due (when the guest was due to order), sent (when the order was taken), first plate and done.
  - Per-client timelines are **each table's timeline**, and the histogram carries the percentile marker.
  - The flaws, in the kitchen:
    - closed loop past capacity: **a fixed set of tables**, so the rush never arrives;
    - coordinated omission: **the inspector's stopwatch, paused while the kitchen is slammed**;
    - client queue hidden: **a stopwatch started when a seat frees**, not when the guest joined the line;
    - warm-up counted: **the first tables timed while the ovens heat**;
    - warm cache: **every guest ordering what is already prepped**;
    - capped output: **only the first few courses timed**;
    - too few samples: **a "p99" from a handful of tables**;
    - mean reported as a tail: **the average reported as the worst case**;
    - client bottleneck: **the inspector's own runner, the slowest link**;
    - "replay" that ignores timestamps: **last Friday re-run at a steady pace** instead of its rush;
    - none: **a fair inspection**, the control.
  - The reveal recomputes from the rows (from due times, the warm-up cut and the bootstrap) and shows the arithmetic.
- **The 3D opener, `rain-and-relay`: walk-ins and tables.** In the open-loop arena, walk-ins reach the door at their due times. During a stall the door shuts and they queue outside, so the queue's height is the honest latency. In the closed-loop arena, one lane per table runs into depth, and a table orders again only after its last plate lands. During the stall every table freezes, and the orders never placed appear as ghost outlines at their due times, counted.
- **Cameras** (the opener only): **The door** (Establish) and **Side** (Compare).
- **Materials.** The report and the log are ticket paper (DOM tables). Due and sent ticks differ by glyph. In the opener, guests are markers and the ghost outlines are hollow. The heat lamp falls on the selected row.
- **Must stay legible:** every row's due, sent, first-plate and done times (DOM), the percentile marker with its value, and the interval. On phones, everything is a list.

---

## 3. The Loop (`loop`): front page, TR2, TR6's mask lane

**Module and concept.** The engine's step loop. The front-page run teaches one true thing: *a decode step costs the GPU about the same with one request or four, so the loop earns tokens by keeping every slot live (continuous batching) and by planning the next step while this one runs (overlap, which vLLM calls async scheduling).* TR2's levels add what the real loop does on top: CUDA-graph capture sizes and modes; dispatch keys, with MRV2's `BatchExecutionDescriptor` as the pinned default and MRV1's `BatchDescriptor` with `has_lora` as the legacy example (D-041); the V2 model runner; and the host work they hide. TR6 adds the grammar mask's lane.

**Why the rule is the concept.** The session's only rules are the loop's:
- a step emits one token per live slot, and its GPU cost barely depends on how many slots are live;
- a slot frees at a step boundary;
- without overlap, the GPU waits while the CPU plans the next step and reads this one;
- with overlap, the CPU plans step N+1 during step N, so a request that stops on EOS rides one extra step and its token is discarded;
- in TR2, each step's token count is padded up to a captured graph size, or the step falls back to launching kernels one by one.

Playing well means refilling every slot, overlapping, and choosing captures that fit the traffic. That is the concept.

**The real anchor, on the end card.** On 4 H100s running Llama-3.3-70B in FP8 under vLLM, raising concurrency from 4 to 64 stretched each token from 11.8 ms to 19.5 ms (1.66 times), while tokens per second, estimated as concurrency ÷ TPOT, rose about 9.7 times [TPOTs measured: InferenceX official results published 2025-10-29, rows 41187 and 41821, via kernelspace's pinned snapshot; ratios derived].

#### 3.1 The front-page run, "First loop" (60-120 s)

It is practice: a pinned seed, nothing recorded (D-038). Its four beats:

| Beat | About [estimated] | What the visitor does | What they see |
|---|---|---|---|
| 1. Fill the batch | 15 s | Six requests wait beside an empty tray of 4 slots. The prompt reads "Tap a request to put it in the batch." The first tap is possible within the first seconds, in the 2D view if the 3D has not loaded. Then Run. | The first step slab is laid on the GPU lane, one cell per live slot. |
| 2. A slot empties | 20 s | The loop runs until the first request stops. Its slot turns into an open groove, and the loop waits. The visitor refills it or presses Run to leave it empty. | The counters show it plainly: "slot paid for, empty". |
| 3. Mind the gap | 20 s | The GPU lane shows a gap of 3 ticks beside every 4-tick step. The visitor turns on "Plan the next step during this one". | A second tray appears and the gaps close. At the next stop a hollow ghost cell appears: one token computed and thrown away. |
| 4. Your turn | 30-40 s | A burst of 12 requests with both tools. Par is the reference. | Compare: three GPU lanes from the same seed (static batching, continuous, continuous with overlap), with counts. |

The end card then gives:
- the one true thing in a sentence;
- the real anchor above;
- **Open the course map** (primary), **Play the full loop (TR2)** and **New numbers**.

"Skip to the course map" is available from the first second.

**The front-page world** is synthetic, and its card says so. Each step costs 2 ticks of CPU planning (schedule and prepare), 4 ticks of GPU forward with 1 more tick when the step admits a request, and 1 tick of CPU reading (sample, stop check, detokenize). Without overlap a step therefore takes 7 ticks, of which the GPU is busy 4. With overlap it takes the larger of the GPU's 4 and the CPU's 3. Requests stop on EOS after 1-16 tokens, drawn from a heavy-tailed menu, and the scheduler never sees the length. The card adds that this CPU share is within the range the sources describe: SGLang's v0.4 post says an unoptimized engine can spend "as much as half of its time on CPU overhead" (2024-12-04, citing another source; research O2).

#### 3.2 TR2's levels and TR6's mask lane

TR2 runs the same session on ARCHITECTURE §5.3's `steploop` in integer µs, with two cost cards:
- **"70B on H100".** The GPU lane comes from kernelspace's S5 card (H100 FP8 row). Its per-sequence host term t_seq goes on the CPU lane, because S5's own types call it "host work per running sequence per step"; there it replaces the host card's per-sequence schedule and sample phases (D-044). The other host phases come from the host card, [estimated] until W2-T22 fits them to the owner's traces.
- **"Small model".** A synthetic GPU card, since S5 has no small-model row. MRV2's own result shows why the regime matters: moving input preparation to the GPU gave 56% more throughput on Qwen3-0.6B on one GB200 [measured by the vLLM team, published 2026-03-24].

What the 70B card implies: at TP 4 with 64 sequences of 1,024 tokens, S5 puts 3.9 ms of a 17.7 ms step in the host term; at TP 2 with 4 sequences, 0.24 ms of 18.0 ms [derived from S5's H100 FP8 row; fit adopted 2026-10-18, unsigned]. Overlap therefore pays in proportion to the CPU share. Hiding S5's host term under the forward is this game's extrapolation, and the card labels it so, because S5 fitted that term as additive.

#### Core loop (TR2)

1. **Predict.** Read the level's workload card and cost card, and commit a prediction (a TPOT, a bubble share, or which lever matters most).
2. **Play.** In practice, set levers and run, then watch lanes, combs, padding cells and counters, then adjust.
3. **Debrief.** The counterfactual names the lever worth the most.
4. **Compose and In production.** The card maps each lever to the pinned engines' settings:
   - vLLM: `--no-async-scheduling`, `compilation_config.cudagraph_mode`, `cudagraph_capture_sizes`, `max_cudagraph_capture_size`, `cudagraph_specialize_lora`, `VLLM_USE_V2_MODEL_RUNNER`;
   - SGLang: `--disable-overlap-schedule` and its CUDA-graph configuration (research G1).

Graded levels drop the live readouts: the learner chooses the configuration from the cards before a single run.

#### Controls

- **Pointer and touch.**
  - Tap a waiting request to place it in the first free slot, or tap a slot and then a request.
  - Run steps once; Auto runs until the next decision, and Pause stops it.
  - Levers are switches, radios and steppers.
  - Capture sizes are a ladder of toggle buttons, one per candidate size.
- **Keyboard.**
  - Arrows move along the waiting list or the capture ladder; `Enter` places or toggles.
  - `.` runs one step and `Space` toggles Auto: the common keys (§2.3), so nothing new to learn.
  - `O` toggles overlap, `G` cycles the graph mode and `M` toggles the runner.
  - `C`, `V`, `[`, `]` and `?` work as in every game (§2.3).
- **At 390 px.**
  - The canvas takes the top 55% of the viewport, at least 300 px.
  - The waiting requests sit below as a 3-column grid of 44 px chips, with Run and the overlap switch full width.
  - The counters overlay the canvas as DOM.
  - Nothing scrolls sideways.

#### Levels, seeds and difficulty

| Level | Module | New idea | Seed and band | Kind |
|---|---|---|---|---|
| `first-1-fill` … `first-3-gap` | front page | batching, an empty slot, the gap | pinned practice seed; the shortest of the first four requests asks for 2 or 3 tokens, so one stops within 3 steps and not in the first (W0-T16) | practice |
| `first-4-par` | front page | both tools against par | pinned first; "New numbers" draws in band (below) | practice |
| `async` | TR2 | async scheduling on or off, on both cost cards | pinned | practice |
| `graphs` · stage `comb` | TR2 | eager launches against a graph replay (small model) | pinned | practice |
| `graphs` · stage `sizes` | TR2 | choose capture sizes within a capture-time budget for a seeded batch-size histogram; vLLM's ladder beside SGLang's buckets | band: the default list truncated to the budget costs ≥ 1.15 × optimal; runner-up ≥ 1% worse | practice → **graded** |
| `graphs` · stage `modes` | TR2 | choose `cudagraph_mode` for a prefill/decode mix and an attention backend's graph support | answer first: each of the four modes that use graphs is best on about a quarter of seeds; the best ≥ 3% ahead | practice → **graded** |
| `keys` | TR2 | which adapter counts to capture within a memory budget: with `cudagraph_specialize_lora`, powers of two up to `max_loras`, and a batch's active-adapter count rounds up to the smallest captured case | answer first: specializing wins on half the seeds | practice |
| `mrv2` | TR2 | V1 against V2 runner presets on both cost cards | pinned | practice |
| `close` | TR2 | all levers at once; one night per seed, chosen from the cards before a single fire | band: naive bubbles ≥ 20% of the clock; reference ≤ 3%, with no dependency violation; the naive night misses the bar | **graded** (TR2's B artifact) |
| `mask` | TR6 | the grammar mask's CPU lane: fits under the forward, or not | answer first: fits or bubbles, half each | practice → **graded** (TR6's B artifact) |

The ids follow TRACKER.md's W1-T13 (`async`, `graphs`, `keys`, `mrv2`, `mask`), plus `close`, which carries TR2's graded "toggled until bubbles close" (ARCHITECTURE §6.1). `[` and `]` move between a level's stages.

- **Band for `first-4-par`.** Static batching takes ≥ 1.25 × the ticks of continuous batching without overlap, which takes ≥ 1.4 × par. Overlap alone (static batching with overlap) takes ≥ 1.15 × par, and there are ≥ 3 ghost tokens. Both levers are then needed to reach par. In a scratch prototype of the tick world, 80% of 400 candidates were in band; on in-band seeds refill alone took a median 1.55 × par (minimum 1.40) and overlap alone 1.42 × (minimum 1.16) [estimated: a scratch prototype run outside the repo on 2026-11-03 and not kept; the shipped tests re-measure it].
- **Difficulty.** TR2 starts with one lever on a small workload. The capture budget then tightens and histograms turn bimodal (`graphs` · `sizes`). Mixed prefill (`graphs` · `modes`) and adapters (`keys`) follow. `close` draws a burst whose prompts need chunking, on a seeded host card and attention backend, in the band; adapters wait for `keys`.

**As built (W1-T13), "the full service".** `async`, `graphs` (stages `comb`, `sizes`, `modes`), `mrv2` and `mask` are practice levels of `packages/play/loop/full`, on Service's page beside the first service; `keys` waits and `close` is W1-T14's (below). The registry's session is one session over both services (`packages/play/loop/game.ts`); the front page imports the first service's alone.
- **The world.** Each stage is a night of 24 tickets due at once on a rail of 12 clips [estimated], prompts of 8 to 32 tokens and 12 to 28 courses [estimated], served by `runStepLoop` v1 (asked for each step's rows, so every ticket keeps its clip) on a cost card: "70B on H100" (S5 at TP 4, its host term on the CPU lane, D-044 proposed) or the small-model napkin (`SMALL_CARD`, synthetic). The token budget is each card's `vllm serve` default (8,192 and 2,048, claims `vllm.batch-defaults.*`), and every other lever starts at the pinned engine's default: async on, FULL_AND_PIECEWISE, vLLM's own capture sizes, MRV2.
- **A stage** opens on its naive configuration, asks its prediction first, and closes on a night within the house's (the intended configuration's) metric plus 3%, the sizes stage's capture cost within 5% (GAMES.md's pass bar), or on its third night [estimated], so the debrief can name the lever. The level is over when every stage is closed; its score is its weakest stage's best night, house over mine.
- **`modes`, answer first over the four modes that use graphs.** Without a cost for capturing, FULL_DECODE_ONLY never beats FULL_AND_PIECEWISE and no backend draw makes four answers, so the stage gives the routines a room in the reach-in [estimated, MiB], against the graphs' memory of the sim's `memory.ts` (32 MiB for FULL_DECODE_ONLY's four decode graphs at this rail, 93 for FULL's or PIECEWISE's eleven, 125 for FULL_AND_PIECEWISE's fifteen), and a mode whose graphs need more does not serve. Over 200 seeds the answers are FULL 26%, FULL_AND_PIECEWISE 19%, FULL_DECODE_ONLY 29% and PIECEWISE 26% of the in-band seeds; asking always for FULL passes on 45% of them, because on a backend that replays only uniform batches FULL runs as FULL_AND_PIECEWISE [measured 2026-11-05 over wave-1 at 905b782 with this task's tree, tests/play/loop-full-levels.test.ts]. The stage's naive configuration is NONE; it opens on the engine's default.
- **`mask` runs the engine's plain step** (async scheduling off), where vLLM builds the bitmask while the forward runs (claim `vllm.mask.overlap`), and draws the grammar's weight per bitmask row, 40 to 80 µs or 160 to 240 µs [estimated], answer first: the card fits inside the fire, or outlasts it, on 46% and 54% of 200 in-band seeds [measured 2026-11-05 over wave-1 at 905b782 with this task's tree]. Under async scheduling the batch queue defers the card instead (claim `vllm.mask.deferred-sampling`), and the overlap switch moves almost nothing; W1-T30's timeline draws both.
- **The graded reference for `mask` (W1-T30).** The level stays practice: W1-T14 adds only the graded `close`, and ASSESSMENT's `loop/mask` bar (the predicted bubble within ±10% of the model's) has no replay of the level yet. Its graded task is the item family `tr6.mask-fits` (`packages/play/items/families/tr6/mask-fits.ts`), which draws the same model on fresh numbers in all three cases (the fill overlapped, serial, and under async scheduling), with and without drafts, and whose keys are held to `runStepLoop`'s steady-state gap to the µs (tests/play/items-tr6-mask-fits.test.ts). TR6's fifth lesson draws the three cases as one figure (`public/figures/tr6/l5-mask-timeline.svg`, generated from the step loop by `tests/content/tr6-figure.ts`), which is the timeline that the bullet above says W1-T30 draws.
- **`mrv2`'s 70B stage** has no naive configuration that fails: the forward hides both runners' host work, so the runners tie and the stage is its prediction's (what MRV2 saves a course). Its small-model stage carries the lever.
- **Bands** [measured 2026-11-05 over wave-1 at 905b782 with this task's tree, `verify:games` over 400 seeds]: `async` 100%, `graphs` 87%, `mrv2` 100%, `mask` 100%; every practice seed is 0. On the first 50 in-band seeds of each level the naive configuration fails the level's bar and the intended one passes (tests/play/loop-full-levels.test.ts).
- **Predictions:** `async`, the median TPOT with async on (µs, ±10% [estimated]); `comb`, the calls of an eager fire (336: 12 kernels a layer [estimated] times 28 layers); `sizes`, the fires vLLM's own sizes cut to the rack would call eagerly; `modes`, which mode serves when FULL is asked for; `mrv2`, the µs a course MRV2 saves; `mask`, whether the card fits.
- **The comb** draws a tooth for each layer of the card's model, as tall as the calls that layer takes (12 eager, 2 piecewise), and folds into one word on a full graph: a tooth per call would run to hundreds, and per call the comb could not show piecewise against eager. The calls are DOM.

**As built (W1-T14), `close`.** TR2's graded level, "toggled until the bubbles close", is `packages/play/loop/full/close.ts` on the full service: one stage, one night per seed, closed-book. It is a graded level of the registry (`graded: true`), and a graded run draws its seed when it starts, through the level's band (`drawInBand`, a fresh `crypto.getRandomValues` seed), with no undo. Its practice seed is 16, an in-band seed whose house drills a routine.
- **What a seed draws,** each from its own stream so that adding a draw never moves another [estimated]: the card (the 70B on H100 on one seed in ten, the small-model napkin on the rest), the rail (6, 8, 12 or 16 clips), a burst of 2 or 3 tickets for each clip all due at once, a token budget of 64 to 384, prompts between half and twice the budget (so a long one is chunked), courses of 4 to 12, 12 to 28 or 40 to 80, the host card (the runner's schedule, prepare, sync and sample phases scaled to 25% to 130% on the small card and 100% to 300% on the 70B, one kernel's launch of 3 to 12 µs or 12 to 20 µs, 12 or 14 kernels a layer, a replay of 30, 60 or 100 µs), and the attention backend's graph support (`ALWAYS`, `UNIFORM_BATCH` or `UNIFORM_SINGLE_TOKEN_DECODE`). The small card's launch is fast on one seed in eight, so that async scheduling alone hides the host on it.
- **The levers** are the full service's: async scheduling with **where the next call's ids come from** (`inputIds`, the line or the expo's hand), the runner (MRV2 or the legacy V1), the graph mode, and the molds on the rack, a ladder of the sizes up to the budget that has no cap, because the budget is memory. The ids are the model's counterfactual and no flag in either engine names them: with async scheduling on and the ids written by hand, a fire reads a token before it is sampled, the step loop raises `read-before-sample`, and the night scores 0 (ARCHITECTURE §5.3). Compose says so in its notes. The naive configuration is every lever off: V1, the call after the fire, the ids by hand, NONE, and the engine's own capture list behind it.
- **The house is found by the model, not designed.** `kneeHouse` serves a menu of nine configurations (async on, ids on the line, MRV2, and NONE or each of the four graph modes with the rail's mold alone or with the budget's too) and takes of those within 1% of the shortest night [estimated] the one that takes the least graph memory, then the fewest molds. Its mode is the one that runs, so on a backend that cannot replay mixed batches a request for FULL is written as the FULL_AND_PIECEWISE it becomes.
- **The room is the house's memory, to the byte.** The reach-in can spare for routines exactly what the house's take (`GRAPH_MEMORY_MODEL`: 8 MiB a routine and 16 KiB for each token of its size [estimated]), so a configuration that takes more does not start: "everything on" is refused on every seed that the draw serves, and so is the engine's own capture list with the ids on the line. The panel keeps what a lever resolves to and the memory the routines take to itself until the night is served (closed-book), and the cards print every number that the learner needs to work the house out and none of a run: tonight's tickets, what the line charges for a fire, what the expo charges tonight, and the backend with the room.
- **The pass bar is ASSESSMENT §4.3's:** zero dependency violations and useful tokens per GPU-ms at least 97% of the house's (970 out of 1,000, compared in integers with no rounding). One graded run is one fresh seed; "Another graded run" draws the next, so the proposed bar of three fresh seeds is three runs. A night is a pass, slow, a violation or refused, and the debrief names the lever worth the most by setting one lever at a time to the house's (async with its ids, the graph mode with its sizes, the sizes alone, the runner) and re-running the night.
- **The band** keeps a seed when the naive night loses at least 20% of its clock to dark stretches, the house's loses at most 3% and breaks no dependency, the naive clock is at least 5% longer than the house's and misses the bar [estimated], and, where the house drills a routine, the same configuration with none misses the bar too: drilling earns its memory. **The prediction** is the naive night's dark share in whole per cent, ±15% [estimated].
- **Measured** [measured 2026-11-05 over wave-1 at f4c2395 with this task's tree, tests/play/loop-close.test.ts over 200 seeds, and `verify:games` over 400]: 101 of the 200 are in band (50.5%), and `verify:games` prints 51% of the first 400 against a floor of 20%; "everything on" does not start on 101 of the 101 served seeds; the engine's defaults with the ids on the line fail 101 of 101; and the best constant configuration of a library of ninety passes 11.9% of them (FULL with molds of 8 and 128), under ASSESSMENT §4.1's 15%.
- **Bundle** [measured 2026-11-05 over wave-1 at f4c2395 with this task's tree, `verify:bundle`]: `close` adds no 3D object (the rack draws the sizes that are pressed, the first twelve of them, as before), `scene-loop` is 39,870 B gz, 130 B under the frozen 40 KB gate (5 B more than W1-T13's 39,865 B), and the full service's own chunk is 17.1 KB gz.
- **Deferred:** adapters, with `keys` (Q-10: the owner's dispatcher tables).

#### Scoring and pass

All counts on the model's clock:
- useful tokens;
- ghost tokens;
- padded tokens;
- GPU-busy µs;
- bubble µs and the number of bubbles;
- launches and eager steps.

The front page shows its counters while it runs and ticks against par at the end, and it records nothing.

**As built (W0-T16).** The levels of §3.1 are `packages/play/loop/levels.ts`, and each is a practice level on pinned seed 1, the first seed that its band accepts from 0.
- **Openings.** Beats 2 and 3 open where the visitor would be after the beat before. The house hangs the first four tickets, first come first served, and rings the bell once for `first-2-slot` and twice for `first-3-gap`, with overlap off and the clips refilled, and then leaves the bell unrung. `first-1-fill` and `first-4-par` open on the empty rail.
- **What ends a level.** `first-1-fill`: one fire read back. `first-2-slot`: a ticket has ended, its clip has been dealt with and the next fire is read back. `first-3-gap`: a binned plate (a ghost token) has been read back. `first-4-par`: every ticket served. A level also ends when every ticket is served.
- **A table's appetite is settled when its ticket is hung.** The expo cannot see how many courses a table will want, and a ticket's number says nothing about it. So the k-th ticket hung is served by the k-th length of the seed's workload, whatever its number, and the order in which a visitor taps tickets cannot change the night: only whether a clip is refilled and whether overlap is on can. The tickets are exchangeable, so this is the same experiment as drawing every length beforehand. Without it, doing everything right scores a median of 0.99 and a minimum of 0.723 over the first 150 in-band seeds, by luck of the order [measured 2026-11-04 at a5907b1, with a scratch copy of the engine that takes a table's length from its ticket's number]; with it, both tools score 1 on every one of them [measured 2026-11-04 at a5907b1].
- **Score.** Each level scores what its beat is about, as a count against the house's (§2.1): the places filled in the first fire (`first-1-fill`), the places filled in the fire after the first ticket ends (`first-2-slot`), the dark ticks the line sat through, house over mine (`first-3-gap`), and par over the clock (`first-4-par`). The pass mark is 0.9 [estimated]. Over the first 150 in-band seeds the best a visitor does without both tools is 0.714 with refill alone, 0.854 with overlap alone and 0.561 with neither [measured 2026-11-04 at a5907b1], so the mark separates them from both tools with room to spare.
- **Bands.** `first-4-par` is the band above: 159 of the first 400 seeds are in it, 39.8%, against a floor of 20% [measured 2026-11-04 at a5907b1; `verify:games` prints it]. The three beats before it share one band, the shortest of the first four requests asking for 2 or 3 tokens, which 114 of the first 400 seeds meet, 28.5% [measured 2026-11-04 at a5907b1].

Proposed pass bars (ASSESSMENT.md decides):

| Level | Pass on each of 3 fresh seeds |
|---|---|
| `graphs` · `sizes` | capture cost (padded µs + eager µs) ≤ 1.05 × the exact optimum |
| `graphs` · `modes` | the reference's mode |
| `close` | useful tokens per GPU-ms ≥ 97% of the reference's |
| `mask` | the predicted bubble µs within ±10% of the model's |

#### Predict, Prove, Keep

- **Predict.** `async`: "Async on: TPOT on each card?", graded numerically. `close`: "With nothing switched on, what share of the night does the line sit dark?", in per cent, within ±15% [estimated]. The front page asks "Overlap on: how many ticks per step?" as a single tap that is not stored.
- **Prove (browser).** `close` with the agent closed.
- **Prove (GPU lane).**
  - On the learner's 4090 with SGLang v0.5.23's defaults, the decode-graph `max_bs` is 48 for TP < 4 (research G3). The prediction to test: whether, and by how much, decode throughput falls between concurrency 48 and 49, where decode leaves the graph. Research G3 quotes a source comment that an earlier, lower cap "forced eager decode ... and collapsed high-concurrency throughput"; the cliff on a 4090 is [unverified, not run].
  - On vLLM 0.33: predict the TPOT change under `--no-async-scheduling` at batch 8 from the fitted host card.
  - TR2 has no GPU stage of its own, so TR3's lab runs both: `tr3.profile.s4` toggles async scheduling, and the optional `tr3.profile.s5` measures SGLang's cliff. The local grader checks the runs, and the game shows the prediction beside the measured result as practice.
- **Keep.** Generators for step time with and without overlap, the padded size for a token count, and the mode a batch dispatches to.

#### 3D scene

- **Objects.**
  - Two lanes run away from the camera along time: the CPU lane on the left and the GPU lane on the right. A copy lane appears in TR2.
  - Each step is a slab on the GPU lane. Its length is the step's GPU time, and its width is the slot count. Each slot is a lengthwise row of cells: a live slot is a solid cell, an empty slot an open groove, a ghost token a hollow cell, and a padded token (TR2) a cell marked "padding".
  - The CPU lane carries plan and read slabs. In TR2, eager launches form a comb (one tooth per kernel launch), a graph replay is one short slab, and piecewise mode is a comb with fewer teeth.
  - Gaps on the GPU lane are bubbles.
- **The bay.** At the near end of the lanes is the present. The tray of slots holds the step being planned, the waiting requests stand in a line beside it, and, with overlap on, a second tray holds the step in flight. In TR2 a rack of molds stands at the bay, one per captured size in ascending order, and the dispatcher's pick takes emphasis.
- **Axes.**
  - Time runs into the screen.
  - Lane runs across the scene.
  - Slot runs across each slab's width.
- **Camera presets** (ARCHITECTURE §6.1's "along time, side and top"):
  - **Along time** (Establish) looks from behind the bay down the lanes at about 25° elevation.
  - **Side** (Compare) is an orthographic Gantt view for lengths and gaps.
  - **Top** shows slot occupancy, where empty grooves are easy to count.
  - The end of `first-4-par` cuts to Side with the three runs stacked.
- **Motion.** A slab extrudes over 150-300 ms per step [estimated]. Trays hop between the bay's positions, and the history recedes by whole steps. Nothing moves while the loop waits for a decision.
- **Must stay legible at 390 px:**
  - the state of each slot (solid, groove, hollow);
  - the gaps on the GPU lane;
  - request ids, through DOM labels;
  - the counters.

  History beyond about 48 steps [estimated] aggregates into one slab per step, without cells.

#### 2D path and reduced motion

- **2D.** An SVG Gantt with the same two lanes and the same cells, plus the tray and the queue as boxes, and the same controls and counters. It is the front page's first paint (D-023). The poster is its first frame, rendered by `scripts/posters.ts` from the same `layout.ts`.
- **Reduced motion.** Slabs appear whole, trays jump, cameras cut, Auto is off by default, and history steps without scrolling.

#### Budget

All [estimated].

| | T2 (laptop) | T1 (phone) |
|---|---|---|
| Draw calls | ≤ 24 | ≤ 16 |
| Triangles | ≤ 60k | ≤ 25k |
| Instances | ≤ 6k | ≤ 2.5k |
| Frame | p95 ≤ 16.7 ms, scene render ≤ 6 ms | p95 ≤ 33.3 ms |

- **Aggregated first:** history cells, then comb teeth beyond 64 per step (shown as a count).
- **Chunks:** `scene-loop` ≤ 35 KB gz. The front page's 2D game and sim fit ARCHITECTURE's 150 KB gz first-paint closure.
- **Measured** [measured 2026-11-05 over wave-1 at cc1d29d with the finish review's round-2 fixes; the bundle by `verify:bundle`, the draws by `renderer.info` through the scene's test hook]:
  - `scene-loop` (its chunk, its CSS and the chunks only 3D reaches, the scene kit's props among them) is 38,971 B gz. That is 1,029 B under A§11.1's frozen 40 KB gate (D-023) and 3,971 B over this table's 35 KB target, which scene kit v1's props passed before the round-1 fixes. Round 2 added 605 B to it [derived from 38,366 B at cc1d29d before them]: the lamps' light taken off the counter and given back as the steel's sheen, the plates' contact and the room's light.
  - A whole night of `first-4-par` on `/play/loop` (e2e/loop-scene.spec.ts) draws at most 14 scene draw calls at T1 (14 in the frame) and 39 at T2 (53 in the frame with bloom and the final pass), against A§11.1's 100. It draws at most 48 instances at T1 and 80 at T2, and at most 105,460 and 402,836 triangles: a plate's contact shadow is two soft quads in the one draw of every contact shadow, so round 2 added instances and no draw.
  - The front page's pass at 1440 by 900, at T2 with half a rail fired, draws 30 scene draw calls (44 in the frame), in a test build.
  - T1's draw calls are within this table's target. T2's draw calls, and both tiers' triangles, are over it: the heat lamps' shadow passes and the props' turned and swept parts. The draws stay under the frozen gate.
- **Measured with the full service (W1-T13)** [measured 2026-11-05 over wave-1 at 905b782 with this task's tree, against wave-1 at 905b782 alone; the bundle by `verify:bundle`, the draws by `renderer.info` through the scene's test hook, e2e/loop-full.spec.ts]:
  - `scene-loop` is 39,865 B gz, 135 B under the frozen 40 KB gate, from 39,037 B: the full service's tools (one instanced draw of ring molds and one of the comb, each on contact shadows, built the kit's way in Service's own chunk, `src/games/loop/Scene3D.tsx`, so no other scene carries them), the plates scaled to a longer rail, and the tapes that name the tools; the labels' styles load with the full service. The scene kit's own row is 22,973 B, 51 B more for the plates' scale, which the scenes that count it carry: The Tasting's is 39,775 B and Back of House's 39,155 B.
  - A night of `graphs` with the rack and the comb draws at most 16 scene draw calls at T1 and 47 at T2 (61 in the frame with bloom and the final pass), 125 and 157 instances, 142,732 and 551,756 triangles.
  - The full service loads on demand when one of its levels opens, and no gate rows it: its page chunk is 14,027 B gz and 714 B of CSS, its rules (the step loop v1, the cost cards and the levels) 17,013 B, the `keys` card 954 B and the session over both services 398 B. `/play/loop`'s own closure is 196,584 B against 200 KB (from 195,063 B), and the front page's first-paint JavaScript 152,239 B against the gate that D-055 had raised (from 151,805 B: the first service's four levels as a list of their own, the plates' radius on a longer rail, the hook through which the full service draws into the 2D frame, and the list of the keys the first service leaves out); its CSS 18,270 B (from 18,170 B, the page's new layout utilities). D-059 put the front page's gate back to 150 KB.
- **Measured with D-023's budgets restored (D-059)** [measured 2026-11-08 over wave-1 at cb7bc29 with D-059's tree; the bundle by `verify:bundle`]:
  - The front page's first-paint JavaScript is 147,337 B, 2,663 B under the 150 KB gate, from 153,795 B at cb7bc29: the burst of `first-4-par` is drawn without the exponential table (`genFixedWorkload`), the tick card no longer brings S5's fitted rows (`packages/sim/steploop/s5.ts`), the content loader no longer holds every lesson's table (`src/content/load-lessons.ts`), and the entry no longer lists the other pages' chunks (the route table, A§6.10). Its CSS is 18,469 B.
  - `/play/loop` is 180,457 B, 19,543 B under 200 KB, from 196,969 B: the same, and the keys dialog loads when the learner reaches for it.
  - The full service still has no gated row. `verify:bundle` prints it, as `route /play/loop with FullService`: 231,129 B, which would be 31,129 B over the 200 KB that every route has. Fitting it, or a record for it, is the owner's to schedule (D-059).
- **Measured with the lesson blocks' finish fixes, round 1** [measured 2026-11-09 over wave-1b at 017eb46 with this round's tree; the bundle by `verify:bundle`, the draws by `renderer.info` through the scene's test hook, e2e/loop-full.spec.ts]:
  - `scene-loop` is 37,503 B gz, 2,497 B under the frozen 40 KB gate, from 38,231 B at 017eb46: the tapes are the design system's tape in the DOM, so Service draws no tape strips and no longer counts the `SheetInstances` chunk, and the bell's chrome mirrors the room brighter, which the scene kit's row carries (20,914 B, from 20,794 B). With Service no longer drawing sheets, Rollup splits `SceneCanvas` from `SheetInstances`, so each scene that draws sheets counts one chunk more: The Reach-In's row is 39,522 B (from 39,005 B), Back of House's 39,231 B (from 38,717 B), The Tasting's 38,327 B (from 37,806 B) and the /design kitchen's 36,484 B (from 35,973 B), each under the gate. `three-vendor` is unchanged, at 238,647 B.
  - A night of `async`, its first stage with twelve tickets hung and twelve on the fired rail, twelve plates, the rack, the comb and every tape, draws at most 17 scene draw calls at T1 (17 in the frame) and 17 at T2 (31 in the frame with bloom and the final pass), with 127 and 162 instances and 149,516 and 150,420 triangles, against A§11.1's 100. A night of `graphs` measures the same.
- **Measured with the lesson blocks' finish fixes, round 2** [measured 2026-11-09 over wave-1b at d7ea594 with this round's tree; the bundle by `verify:bundle`, the draws by `renderer.info` through the scene's test hook, e2e/loop-scene.spec.ts and e2e/loop-full.spec.ts]:
  - `scene-loop` is 37,548 B gz, 2,452 B under the frozen 40 KB gate, from 37,503 B: the bell's dome and plunger in the palette's polished finish, even and with no roughness map, and its base in a turned tone of deep steel, all in the scene kit's row (20,961 B, from 20,914 B), which the other scenes count too: The Reach-In's row is 39,560 B (from 39,522 B), Back of House's 39,272 B (from 39,231 B), The Tasting's 38,365 B (from 38,327 B) and the /design kitchen's 36,517 B (from 36,484 B), each under the gate. `three-vendor` is unchanged, at 238,647 B.
  - The 2D view's names are the design system's tape in the DOM, so the posters are 35,171 and 26,806 B of SVG (from 35,740 and 27,374 B). The front page's first-paint JavaScript is 148,155 B, 1,845 B under its 150 KB gate (from 147,933 B), its CSS 18,656 B (from 18,473 B), and `/play/loop` 185,399 B (from 184,986 B).
  - A whole night of `first-4-par` on `/play/loop` draws at most 15 scene draw calls at T1 (15 in the frame) and 15 at T2 (29 in the frame), with 52 and 87 instances and 108,920 and 109,824 triangles. A night of `async` or of `graphs` draws at most 17 at T1 (17 in the frame) and 17 at T2 (31 in the frame), with 127 and 162 instances, as round 1 measured: the bell's finish adds no draw.
- **Measured with the close-out round's 2D labels** [measured 2026-11-09 over wave-1b at 7f704f9 with this round's tree; the bundle by `verify:bundle`, the draws by `renderer.info` through the scene's test hook, e2e/loop-scene.spec.ts]:
  - The 2D drawing prints no word and no number: the tickets' numbers, the empty clips' stubs, the printer's count and the molds' sizes are print in the DOM over it, as the tapes are, so the posters are 34,495 and 26,130 B of SVG (from 35,171 and 26,806 B) and the front page's document 21,755 B gz (from 21,802 B). The front page's first-paint JavaScript is 148,129 B, 1,871 B under its 150 KB gate (from 148,140 B), and its CSS 18,843 B (from 18,656 B): the print's styles are the design system's, which every route loads, so `/play/loop` is 185,562 B (from 185,383 B) and the tightest route, `/play/engine-floor`, 191,902 B, 8,098 B under (from 191,708 B).
  - The 3D scene is unchanged. Its rows moved by at most 4 B with the names of the chunks they import (`scene-loop` 37,555 B, `scene-pool` 39,741 B, 259 B under the gate), and a whole night of `first-4-par` draws at most 15 scene draw calls at T1 (15 in the frame) and 15 at T2 (29 in the frame), with 52 and 87 instances, as round 2 measured.
- **Timing:** interactive in 2D before LCP, and 3D visible about 2 s after LCP on the reference phone in ARCHITECTURE's mobile lab profile (a chunk of about 280 KB gz at 1.6 Mbit/s is about 1.4 s of transfer [derived], plus parse).

#### Simulation API

```ts
// packages/play/loop/session.ts (W0-T16 built the front-page part of this sketch: the four `first-` levels, `admit`, `run`, and the `async` and `batching` levers;
// the rest arrives with W1-T13), over packages/sim/steploop (ARCHITECTURE §5.3)
export type LoopLevelId =
  | 'first-1-fill' | 'first-2-slot' | 'first-3-gap' | 'first-4-par'      // front page
  | 'async' | 'graphs' | 'keys' | 'mrv2' | 'close'                        // TR2 (W1-T13); 'graphs' has stages comb, sizes, modes
  | 'mask'                                                               // TR6
export type LoopAction =
  | { t: 'admit'; req: number; slot?: number }        // the front page's manual scheduler
  | { t: 'run'; until: 'step' | 'decision' }
  | { t: 'lever'; name: 'batching' | 'async' | 'runner' | 'graphMode' | 'specializeLora' | 'maskOverlap'; value: string | boolean }
  | { t: 'capture'; sizes: readonly number[] }
  | { t: 'commit'; prediction: number }
export interface LoopCounters {
  usefulTokens: number; ghostTokens: number; paddedTokens: number
  gpuBusyUs: Us; bubbleUs: Us; bubbles: number; launches: number; eagerSteps: number; clockUs: Us
  emptyClipSteps: number                               // W0-T16: places the line paid for and nobody ate ("clip paid for, empty"); the front page's own
}
export function loopLevel(id: LoopLevelId, seed: Seed): LoopLevel
export function loopReduce(s: LoopState, a: LoopAction): LoopState
export function loopView(s: LoopState): LoopView      // lanes, slabs, cells, combs, the bay, counters
export function loopGhost(l: LoopLevel): LoopState     // front page: refill every free slot FCFS, overlap on
export function loopDebrief(mine: LoopState, ghost: LoopState): Debrief   // the counterfactual lever

// Needed from packages/sim/steploop, beyond ARCHITECTURE §5.3's sketch:
export const TICK_CARD: HostCard & GpuCard             // the front page's synthetic ticks: plan 2, forward 4 (+1 on admission), read 1
export function defaultCaptureSizes(max: number): number[]   // [1, 2, 4] + 8…248 step 8 + 256…max step 16
export function paddedSize(sizes: readonly number[], n: number): number | null
// GraphConfig = StepLoopConfig['graphs'] plus { maxCaptureSize, specializeLora, maxLoras, maxNumSeqs, decodeQueryLen }
export interface ExecDescriptor {      // MRV2's BatchExecutionDescriptor, the default runner's key at the pin (D-041)
  cgMode: 'FULL' | 'PIECEWISE' | 'NONE'; numTokens: number; numReqs: number | null
  uniformTokenCount: number | null; maxQueryLen: number | null; numActiveLoras: number; numUbatches: number
}
export function loraCaptureCases(g: GraphConfig, runner?: 'mrv2' | 'v1'): number[]   // 0 and max_loras + 1 when specializeLora is on, plus the powers of two up to maxLoras when specializeActiveLora is; with specializeLora off, MRV2 captures 0 and max_loras + 1, and MRV1 captures max_loras + 1 alone
export function dispatchV2(g: GraphConfig, numReqs: number, numTokens: number, uniformTokenCount: number | null,
                           activeLoras: number, maxQueryLen: number | null): ExecDescriptor
  // look up (padded tokens, the smallest captured adapter case ≥ activeLoras); the first compatible candidate, else NONE
export function dispatchV1(g: GraphConfig, numTokens: number, uniformDecode: boolean, hasLora: boolean,
                           activeLoras: number): { mode: 'FULL' | 'PIECEWISE' | 'NONE'; padded: number }   // legacy, with has_lora
export function optimalCaptureSizes(hist: readonly number[], budgetUs: Us, gpu: GpuCard): number[]  // exact DP: the sizes stage's ghost
```

#### Invariants the tests check

- **Conservation.** Per lane, busy + idle = the clock, and no two spans overlap on one lane.
- **Tokens.** Each finished request emitted exactly its output length. Useful tokens = Σ emitted, and ghost tokens arise only with overlap on and only for EOS stops. In the model a `max_tokens` stop produces none, because its length is known in advance. vLLM v0.33.0 tracks in-flight placeholder tokens (`async_scheduler.py`, `scheduler.py`), and it skips that extra step when the steps in flight are sure to reach `max_tokens` (claim `vllm.scheduler.skip-extra-step`, read by W1-T12). The loop at v1 does not tell the two stops apart yet: every workload length is an EOS stop, so a fixed-length run gets a ghost token that the real engine would not compute (the step-loop card's Ignores).
- **Static batching** admits nothing while any slot of the current batch is live.
- **Without overlap,** a step is plan + forward + read, and plan and read are idle on the GPU lane. With overlap, a step lasts at least max(CPU, GPU) and at most their sum.
- **The reference** never leaves a slot free while a request waits.
- **Dispatch.**
  - `dispatchV2` and `dispatchV1` each agree with a golden table of at least 5,000 cases. The tables are generated once at the pinned tag by an owner-run script, from `vllm/v1/worker/gpu/cudagraph_utils.py` (MRV2, the default) and `vllm/v1/cudagraph_dispatcher.py` (MRV1, legacy), and committed with their SHA-256.
  - `paddedSize(n) ≥ n`, equal exactly when n is captured, and null above the maximum, which dispatches as NONE.
  - A batch's active-adapter count dispatches to the smallest captured adapter case at or above it. When none is, MRV2 clamps to the largest case and MRV1 keeps the count, finds no key and runs eagerly (claims `vllm.cudagraph.mrv2-lora-clamp`, `vllm.cudagraph.mrv1-lora-effective`).
  - In MRV1, FULL requires a FULL key and PIECEWISE uses the relaxed key with `num_reqs` null and uniform false.
- **The default list.** `defaultCaptureSizes(512)` has 51 sizes [derived], matching the pinned source.
- **The DP ghost** is optimal against brute force on every histogram of ≤ 12 candidate sizes.
- **Traces.** `traceFromRun` on any run, attributed by Gap Hunt's reference, recovers the run's own per-µs truth. Gap Hunt shares this test.
- **Determinism.** Integer-only arithmetic in the tick world, and the cross-browser hash.

#### Claims shown

| Claim | Source | Date | Tag |
|---|---|---|---|
| Scheduling at iteration granularity is continuous batching | Yu et al., "Orca", OSDI 2022 | July 2022 | — |
| 4 → 64 concurrency: TPOT 11.8 → 19.5 ms, 9.7× tokens/s | InferenceX official, H100 FP8, vLLM, TP 4, 1,024/1,024 | 2025-10-29 | [measured]; ratios [derived] |
| vLLM turns async scheduling on unless an option conflicts | `vllm/config/vllm.py` at v0.33.0 | read 2026-11-03 | — |
| SGLang's scheduler runs one batch ahead, on by default; `--disable-overlap-schedule` turns it off | LMSYS blog; SGLang docs; research O1 | 2024-12-04; 2026-11-02 | — |
| Overlap "introduces one extra decoding step" | TensorRT-LLM docs; research G6 | updated 2026-10-26 | — |
| Five CUDA-graph modes; the default `-O2` gives FULL_AND_PIECEWISE (pooling models stay PIECEWISE) | vLLM v0.33.0 `config/compilation.py` and `docs/design/optimization_levels.md` (research vllm G1) | tag 2026-11-01, read 2026-11-03 | [measured] |
| MRV2's `BatchExecutionDescriptor(cg_mode, num_tokens, num_reqs, uniform_token_count, max_query_len, num_active_loras, num_ubatches)`; dispatch looks up the padded token count and the effective adapter case, takes the first compatible candidate, else NONE | vLLM v0.33.0 `v1/worker/gpu/cudagraph_utils.py`; D-041 | read 2026-11-03 | — |
| MRV1's legacy `BatchDescriptor(num_tokens, num_reqs, uniform, has_lora, num_active_loras)`; tries FULL, then PIECEWISE, then NONE; above the maximum, eager | vLLM v0.33.0 `forward_context.py`, `v1/cudagraph_dispatcher.py` | read 2026-11-03 | — |
| The default capture list, maximum 512 (1,024 on data-centre Blackwell); `cudagraph_specialize_lora` defaults on and makes the adapter capture cases powers of two up to `max_loras` | vLLM v0.33.0 `config/compilation.py`, `v1/worker/gpu/lora_utils.py` | read 2026-11-03 | [measured] |
| SGLang's decode buckets; a 4090's default decode `max_bs` of 48 at TP < 4 | research G2, G3 | 2026-11-02 | [measured] by research |
| MRV2 prepares step N+1 while the GPU runs N; input prep on the GPU; +56% on Qwen3-0.6B | vLLM blog "Model Runner V2" | 2026-03-24 | [measured] by vLLM; [unverified] here |
| MRV2 is v0.33.0's default when Triton is present and no unsupported feature is set | `vllm/config/vllm.py` at v0.33.0 | read 2026-11-03 | — |
| vLLM computes the grammar bitmask while the forward runs | vLLM v0.33.0 `v1/engine/core.py` (research vllm M7, O2) | tag 2026-11-01, read 2026-11-03 | — |
| SGLang hides grammar work by delayed sampling and a grammar barrier | research O4 | 2026-11-02 | — |
| The 70B card's host-term shares | kernelspace S5 fit on InferenceX points | fit 2026-10-18, unsigned | [derived] |
| Tick costs, request lengths, the small-model card, host-card presets | — | — | synthetic, or [estimated] until W2-T22 |

#### Build size

- **Front-page run: L.** It carries the kit's first cut: `Stage`, the camera rig, labels, selection, tiers, the 2D-first swap, the mirror and `verify:games`.
- **TR2 and TR6 levels: L.** The dispatcher mirror and its golden table, the DP ghost, two cost cards, the comb and mold objects, and the counterfactual debrief.

---

## 4. Shape Shifter (`shape-shifter`): TR0

**Module and concept.** PyTorch for the Rust-first, and reading Triton. A tensor is a buffer plus a shape, strides and an offset. `view`, `transpose`, `permute`, `expand` (stride 0) and slicing change only metadata. `reshape` copies only when strides cannot express the result, and `contiguous()` copies. A Triton program grid with BLOCK sizes covers a tensor, with masks at the edges.

**Why the rule is the concept.** The goal is a target layout with the fewest copies, then a grid that covers every element exactly once. You can only win by knowing which operations are views, and which shapes need a copy, which is exactly what reading vLLM's model code demands.

**Core loop.**
1. Predict the element count a copy will move.
2. Apply operations, one per turn.
3. Watch the stride thread re-weave, or cells move on a copy.
4. Reach the target.
5. Tile it with a grid.
6. The debrief compares with the fewest-copies ghost.

**Controls.**
- Operation buttons with argument steppers. `reshape` and `view` take a shape picker; `permute` takes an order picker built from buttons, never a drag.
- `U` undoes in practice. Grid BLOCK steppers.
- Pointer and touch: every operation is a 44 px button, and tapping a cell in the 3D block or a 2D slice selects that element and shows its address in the strip.
- Keyboard: arrows across the operation bar, `Enter` to apply.

**Levels.**

| Level | New idea | Kind |
|---|---|---|
| `views` | 2D tensors: a transpose is free; `view` on a transposed tensor fails, `reshape` copies | practice |
| `stride-zero` | `expand` and broadcasting; why writing to an expanded tensor is wrong | practice |
| `three-d` | rank-3 tensors such as `[tokens, heads, head_dim]`: permute and then `contiguous()` | practice |
| `fewest` | seeded start and target, fewest copies | **graded** |
| `grid` | a Triton-style grid: programs, BLOCK, masks, and which elements each program covers | practice → **graded** |

- **Band.** The naive path (always `contiguous()` first) costs ≥ 1 extra copy, and the target is reachable within 6 operations.
- **Difficulty.** Rank 2, then rank 3; one copy needed, then two; even sizes, then uneven sizes that need masks.

**Scoring and pass.**
- `fewest`: copies made, elements moved and operations; pass when the copies equal the ghost's on 3 fresh seeds.
- `grid`: programs launched, masked lanes and elements covered; pass when coverage is exact (every element once) with the least waste on 3 fresh seeds.

**Predict, Prove, Keep.**
- Predict: "elements copied by this `reshape`".
- Prove: `fewest` with the agent closed.
- GPU lane: none. The L lane's forward pass (Qwen3-0.6B matching HF to 1e-3) is TR0's Build, and the game previews its reshapes, such as `[B·T, H·D] → [B, T, H, D] → permute`.
- Keep: generators for "strides after this permute" and "is this a view?".

**3D scene.**
- **Objects.** The tensor is a block of cells, up to 16 × 16 × 16. Under it, the buffer is a strip of cells in memory order. A thread runs through the block's cells in stride order and touches the strip at each element's address.
  - A view re-weaves the thread and leaves the strip unchanged.
  - A copy lays a new strip, and cells travel to it.
  - In the grid level, program tiles cover the block, and masked lanes show as hollow cells.
- **Axes.** The tensor's three dims, against the strip as the fourth, 1D memory.
- **Camera.** Establish (3/4), Focus (one slice), Compare (start against target).
- **Motion.** The thread re-weave and the cell travel animate in ≤ 400 ms and cut under reduced motion.
- **Legible:** shape and strides (DOM), which cells move, and masked lanes.

**2D path.** Three linked slice views, as kernelspace's Tiling Cube `Mirror2D` does, plus the strip, with the same controls. The mirror is the stride table and an address list.

**Budget** [estimated].
- Draw calls ≤ 16 at T2 and ≤ 12 at T1. Triangles ≤ 30k and ≤ 15k. Instances ≤ 4.2k at T2 and ≤ 2k at T1.
- At T1 the block shows one slice at a time above 2,048 cells.
- Frame: p95 ≤ 16.7 ms at T2 on the reference laptop, with the scene's own render ≤ 4 ms; p95 ≤ 33.3 ms at T1 on the reference phone.
- `scene-shape-shifter` ≤ 25 KB gz.

**Simulation API.**

```ts
// packages/play/shape-shifter/session.ts, over packages/sim/tensor (ARCHITECTURE §5.8)
export interface TView { offset: number; shape: readonly number[]; strides: readonly number[] }   // in elements
export type ShiftOp =
  | { op: 'view' | 'reshape'; shape: readonly number[] } | { op: 'permute'; order: readonly number[] }
  | { op: 'transpose'; a: number; b: number } | { op: 'expand'; shape: readonly number[] }
  | { op: 'slice'; dim: number; start: number; stop: number; step: number } | { op: 'contiguous' }
export function applyOp(v: TView, o: ShiftOp): { view: TView; copied: number } | { error: 'not-viewable' | 'bad-shape' }
export function isContiguous(v: TView): boolean
export function fewestCopies(start: TView, target: readonly number[]): number   // BFS over ops ≤ 6 deep: the ghost
export function gridCoverage(shape: readonly number[], block: readonly number[]): { programs: number; masked: number; exact: boolean }
```

**Invariants.**
- A view never changes the buffer.
- `contiguous()` on a contiguous tensor copies 0 elements.
- `view` fails exactly where PyTorch's does on the vector set. That set is a golden file generated once at the `cpu` environment's torch, 2.14.0 (ARCHITECTURE §14; W2-T13), the build TR0's lab runs on.
- `expand` gives stride 0.
- Grid coverage counts each element exactly once.
- Determinism.

**Claims.**
- View and copy semantics: PyTorch docs at the pinned torch version [unverified until the `tensor` task checks them].
- The Triton program model and `TRITON_INTERPRET=1`: catalog §3.5, and the Triton docs at the pinned version [unverified until checked].
- Shapes and seeds: synthetic.

**Size.** M.

---

## 5. The Engine Floor (`engine-floor`): TR1

**Module and concept.** Read nano-vllm, Mini-SGLang and "Inside vLLM" (pre-MRV2, commit 42172ad). Outcome 1 is to trace a request from the API server to the model runner, naming every queue, copy and sync.

**Why the rule is the concept.** The learner lays the request's path stage by stage. A stage moves the request only if its mechanism matches the boundary it crosses:
1. A stage starts where the last one ended.
2. A change of process needs IPC (ZMQ) or shared memory.
3. A change of thread inside a process needs a queue.
4. Host to GPU needs a host-to-device copy or a launch, and GPU to host needs a device-to-host copy.
5. Reading a value produced asynchronously (a non-blocking copy, a future, a launched kernel's output) needs a sync first.

These rules hold in every engine. What differs is the engine's architecture, which the pinned lifecycle data supplies. Naming every queue, copy and sync is the only way to finish.

**Core loop.**
1. Read the scenario card (engine, pin and features).
2. Predict: "How many process boundaries does a sampled token cross on its way to the client?"
3. Lay stages from the tray.
4. Run. The capsule travels and stops at the first stage that breaks a rule or departs from the engine's path. The reason names the rule, or cites the pinned source file and symbol.
5. Fix and run again, in practice.
6. Debrief: the full lifecycle map beside the other engine's map, with the differences given emphasis. Where does detokenization run? How many ZMQ hops? How do TP ranks get the batch?

**Controls.**
- The tray is a list of stage tiles, each showing its mechanism and label, such as "queue · `input_queue` (engine core)".
- Tap a tile to append it to the path; tap a platform to filter the tray to its stages.
- `Backspace` removes the last stage, `R` runs, and arrows walk the tray.
- The laid path is also an ordered DOM list with move-up and move-down buttons.

**Levels.**

| Level | Engine (pinned by `course.lock.json`) | New idea | Kind |
|---|---|---|---|
| `nano` | nano-vllm | offline `LLM.generate`, one process: the step as calls; copies to and from the GPU | practice |
| `nano-tp` | nano-vllm, TP 2 | a worker process for rank 1, joined by shared memory (W1-T16 read it at the pin on 2026-11-04: claims `nano-vllm.tp-worker-process`, `nano-vllm.tp-shared-memory`) | practice |
| `mini` | Mini-SGLang | API server, tokenizer, scheduler per rank, detokenizer; ZMQ for control and NCCL for tensors | practice |
| `inside` | vLLM at 42172ad | `AsyncLLM`, ZMQ, the engine core's input and output threads and queues, detokenizing in the frontend | practice |
| `vllm` | vLLM, pinned minor | async scheduling, so the step is planned one ahead with in-flight placeholders; the V2 runner by default | practice |
| `sglang` | SGLang, pinned minor | the overlap event loop; `FutureMap` gathers next inputs on the GPU; a prefix hit in the radix cache | practice |
| `abort` | vLLM, pinned | the client goes away mid-stream; aborts are processed before `update_from_output` | practice |
| `map` | mixed | a fresh scenario (engine × streaming × TP × abort × prefix hit × n=2), checked against a lifecycle trace span by span | **graded** (TR1's B artifact) |

- **Band.** Each scenario has ≥ 1 queue, ≥ 1 copy, ≥ 1 sync and ≥ 1 process boundary. The tray holds ≥ 3 distractors that are real stages of the other engine, so pattern-matching one engine fails. Each engine family appears on ≥ 15% of graded seeds.
- **Difficulty.** One process, then four, then threads and queues, then async planning, then failure paths.

**Scoring and pass.** Stages placed correctly before the first wrong one, over the reference's stage count (kernelspace's survived ÷ ghost). `map` passes when the whole path is right on its first run on 3 fresh scenarios and every stage matches a span of the scenario's lifecycle trace in order (`spanCheck`). The traces are synthetic, generated by `lifecycle`, until W2-T21's owner traces exist.

**As built (W1-T19).** The graded `map` is `packages/play/engine-floor/levels.ts` (`scenarioFor`, `buildLevel`, `inLevelBand`) and `spans.ts` (`spanCheck`), with the page's `LevelRail.tsx`, `TapeCheck.tsx` and debrief. A graded attempt is one scenario on one seed, which a lesson records as one `play` event (ASSESSMENT §3.1; since W1b-T01 the game's own page writes the same event for the same run, `src/games/kit/record.ts`); the bar of 3 fresh scenarios is three attempts, each drawn when it starts (ASSESSMENT §4.3).
- **The draw.** The seed picks the engine first, one in five, and then one of the scenarios that engine can be asked: 86 of the model's 88. The two left out are nano-vllm at one rank, whose path crosses no process, so the band's "≥ 1 process boundary" leaves nano-vllm its two-rank scenarios. The band accepts all of the first 400 seeds (100%, against the floor of 20% [estimated]) [measured 2026-11-04 at d287a14 by `verify:games`], and the pinned practice seed is 0. Each engine is a fifth of the graded seeds: 19.73% nano-vllm, 19.92% Mini-SGLang, 19.55% Inside vLLM, 20.22% vLLM and 20.59% SGLang over 20,000 banded seeds [measured 2026-11-04 at d287a14, with this task's files], against the floor of 15%.
- **The tray holds every stage the engine has, and four of other engines.** That is 14, 25, 34, 36 and 29 stages for the five engines, and 4 more [derived from the pinned lifecycle data]. A tray of only the path's stages would show, by the optional stages it lacked, whether the request has a prefix hit, two samples, two ranks or a client that leaves, and the card would not be needed. A learner who knew an engine's stages in order, with each optional one in its place, and skipped what the tray lacked would then pass every seed of that engine, a fifth of all of them: each engine's paths merge into one order, and `tests/play/engine-floor-map.test.ts` lays it. With the whole vocabulary in, a stage that is the engine's and not this request's is named for what it needs: "only for a request with a prefix hit. This request has no prefix hit."
- **One run, and a secret path.** The level allows one run (`attempts: 1`), because its bar is the whole path right on its first. In a practice run the Undo plate takes the run back; a graded run has none. Until the run is judged the view is `sealed`: the house is drawn only as far as the route has gone, and the mirror does not give the path's length, because the plan of every floor and lane would sort the tray before a stage was laid.
- **`spanCheck(laid, t)`** reads the laid stage ids against the trace's stage spans in start order, and returns `{ matched, firstMismatch, spans, of }`: the i-th laid stage must be the trace's i-th stage span. `matched` is how many agreed before the first that did not, `spans` is the span each matched, and `of` is how many stage spans the trace has, so a path that is a prefix of the tape has no mismatch and is not whole. It reads a trace and nothing else, which is what a real trace (W2-T21) and a learner's fork (W2-T34) are held to. The grade also asks it: a pass is `served`, no run ever found a stage that did not hold, and the path is whole against the tape.
- **Blind strategies** (ASSESSMENT §4.1: at most 15% of single seeds [estimated]), over 20,000 banded seeds [measured 2026-11-04 at d287a14, with this task's files]: the best constant path, nano-vllm at two ranks with a prefix hit, passes 10.03% (the other two-rank nano-vllm path 9.70%, and no other over 1.84%); that is 10% exactly [derived: 1/5 × 1/2]. One constant for each engine, the habit of a learner who reads only the engine off the card, passes 14.71%, and 14.17% exactly [derived: 1/5 × (1/2 + 1/12 + 3/24)]. The tray as it stands and the first card that starts where the ticket is pass none of them. All of the engine's stages in order passes 10.03%, the seeds of the one scenario whose path is every stage (nano-vllm at two ranks with a prefix hit), which is the best constant again.
- **The prediction is the same question as ever and is not graded.** Its answer is the engine's: 0 for nano-vllm, 3 for Mini-SGLang and SGLang, and 2 or 3 for vLLM and Inside vLLM with the scenario. Over 20,000 banded seeds it is 0 on 19.73%, 2 on 19.91% and 3 on 60.37% [measured 2026-11-04 at d287a14, with this task's files], so a learner who always says 3 is right on about 60% of them [derived], and earns nothing by it: a prediction moves no credit (ASSESSMENT §4.7).
- **The debrief reads the path against the tape** (`TapeCheck.tsx`): a row for each laid stage with the span it matched, its track, and its start and length in ns, which are synthetic; the first stage that parted from the tape is marked with a word and a drawn mark; and the lifecycle trace is in the trace viewer, read-only, as a lazy chunk. The viewer takes two optional props for it: `about`, the line under its heading, whose default names the step-loop model, and `marks`, which leaves out the marks ticket and its unaccounted counter.

**Predict, Prove, Keep.**
- Predict: the process-boundary count above.
- Prove: `map`.
- GPU lane (F, W2 per D-039): the learner adds span markers to a nano-vllm fork, and the grader checks that their trace's stage order equals their own map.
- Keep: "Where does detokenization run in engine X?" and "Name the queue between A and B."

**3D scene.**
- **Objects.**
  - Processes are platforms stacked in height: client and API server at the top, the engine core in the middle, workers below. The GPU is a lower deck with streams as lanes.
  - Threads are zones on a platform.
  - Queues are buffers between zones, IPC is a bridge between platforms, copies are lifts down to the GPU deck, and syncs are gates.
  - TP ranks are parallel worker platforms in depth.
  - One capsule, the request, travels the laid path.
- **Axes.** Process (height), thread (across), rank (depth).
- **Camera.** Establish (a 3/4 cutaway), a Focus per platform, and Follow on the capsule (opt-in). Camera stops follow the request (ARCHITECTURE §6.1).
- **Motion.** The capsule moves one stage per 300 ms [estimated] and waits visibly in queues. Under reduced motion it jumps from stage to stage.
- **Legible:** platform and zone names (DOM), each stage's mechanism glyph, and the capsule's position.

**As built (W1-T18, rebuilt by the finish review's round 1 and finished in its round 2, W1b's finish round 1, and W1b's close-out).** The house in cutaway, `src/games/engine-floor/Scene3D.tsx`, drawn from scene kit v1's props and the game's own made the kit's way (`scene-props.ts`), in the house the page lays out of the 2D house's plan (`scene-layout.ts`, so the floors stand in the 2D order and a sealed graded run builds only the floors its route has reached), along the route its laid stages make (`scene-route.ts`).
- **The kitchen it stands in.** The line stands at the house's foot whatever the prediction, because the GPU says nothing of how many floors a token crosses: the kit's burners, griddle and fryer (a station for each stream, and the kitchen's own after them) under a canopy, sloped out from the tile to a lip, its baffle filters inclined inside and its white tubes lit along the lip; a bench of pans and plates and a speed rack stand beside the house. The room's light is baked into the tile and the floor, full over the line and up to its canopy, and dimming toward the far corners and up the tile over the hood, so the lit lamp and its white ticket stand out against the tile behind them; past the house the room falls into a haze of deep steel.
- **Objects.** A storey for each process over the line, a room on a brushed-stainless deck with a rolled front edge, furnished by its floor's kind (§2.6) so that each reads as its place at the cutaway's scale: the dining room's tables under white cloths with their chairs and plates, at the host stand a podium of its own for each pair of hands (bevelled, panelled and narrowing to its foot, on its own footprint) and the night's book open on a lectern past the last, the order desk with its printer and the printer's tape over its front edge, the pass with warm plates along its heated shelf, a stack every half metre, the cooks' bench with its pan, and the whole kitchen's pass and printer. A thread is a pair of hands: a ticket rail on the tile over its furniture, high enough that its ticket hangs clear of the surface, and a heat lamp hung over it. The ticket is a dot-matrix slip 130 by 260 mm in a stock 8 mm thick, the print's own shape [estimated]. Its top rolls forward off the rail's clip, leaving it a quarter turn forward and hanging straight below, and its foot curls away from the tile and up through about 150° [estimated], so it hangs 200 mm [derived], the curl's back stands to the room in the paper's shade, and its cut end, turned up to the tubes, is a lit strip of the stock's thickness, about a pixel and a half across at a low house's cutaway, at 1440 and at 390 px [derived from the framings]. IPC and shared memory go through a ticket window at the furniture's height in a steel partition at the house's left, the chute between floors hidden behind it (a house of one storey has a post there, and no window); a copy rides the dumbwaiter's car in an open shaft at its right, from landing to landing at each storey's work surface; a queue is a spike laid on the furniture, where the ticket waits, on a pedestal of its own between two host stands; a sync is the gate; a launch burns its station while the ticket hangs on the line's rail. Each laid hand-off carries a paper chit of its stage numbers, DOM over the canvas, pinned where the hand-off is (over the spike's point and the gate's arm, on a window's sill, on the shaft's landing, beside the ticket of the hands that work in place) and cut as ticket paper: square, perforated along its top, set askew. The names and the numbers keep to their own bands, a storey's tape on its deck's edge, a pair of hands' on the front of their furniture and every chit at or over the surface its hand-off stands on, and the tapes are drawn over the chits, so no chit covers a name: e2e/engine-floor-scene.spec.ts holds every tape's words clear of every other label at the cutaway of the widest and the tallest houses. On a phone a pair of hands' tape shows only where the camera is close on hands (a low house's cutaway, and the followed hands' in the follow), and the line's strip of tape is cut to its words wherever the camera stands.
- **The one lamp.** Only the present's lamp is lit: its bulb's glow round its shade's lip, and its light at every tier, a cone of warm haze from the shade's mouth straight down to the surface the hands work at and an edgeless warm pool where it lands, wider along the counter than across it, in the kit's soft additive light. It is drawn three times over at T2 and up, where it adds to the scene's light before the tone curve, and once at T1, which draws straight to the screen and adds it to colours already encoded [estimated, on the two tiers' renders]. It falls in front of the ticket, which hangs on the tile behind it, so the paper stays white bond, warmed only at its top by the haze. The round-1 lamp warmed the steel's own sheen and streak through a spot light, Service's way; that pool reads only from a camera that faces the lamp across the counter, and this house's cameras look down from three quarters, so it never showed, while the spot blew the ticket under it out to a peach card (the finish review's round 2). The scene has no spot light now, so T2 draws no shadow pass.
- **Departures.** TP ranks stand as their own storeys and streams, as the 2D house plans them, and not as twins in depth, so the third axis is not drawn (test 2 is advisory under D-019). Bridges between platforms are the ticket windows of GAMES.md §2.6. A hop takes a beat of the bell and 220 ms more for each metre the ticket travels, at most three beats [estimated], rather than 300 ms flat; under reduced motion a run cuts to where the ticket stops, rather than stepping, because every change cuts (A§6.9). The 3D house shows the line before the prediction, and the 2D house does not.
- **The moment.** A run plays only the stages it adds beyond where the ticket stood, one to the bell, and at the first stage that does not hold the ticket balks toward it and stands, and that stage's chit is struck in red. The play starts on its first drawn frame, so a run sent while the house is scrolled away plays when it comes back into view; on a wide screen the 3D view and its switches stay in sight beside the controls (GameShell's sticky stage), so the stub, far down the column, sends a run that is seen.
- **Cameras.** Cutaway (Establish), one stop for each storey (Focus; the line's is low enough to see up under the canopy), and Follow the ticket, close on the hands the ticket is at, which moves with it from hands to hands and cuts under reduced motion. A run sent from the cutaway takes the follow. A low house's cutaway (before the prediction, and nano-vllm's whole kitchen) is framed on its hands, on a laptop with the canopy's lip and its tubes at the foot and on a phone the hands alone, so the ticket under the lit lamp is the first thing found, tens of pixels tall in both; the cutaway of a taller house frames the line from its cooktops up. tests/play/engine-floor-scene.test.ts projects the ticket through each framing.

**2D path.** A swimlane sequence diagram: lanes for processes and threads, numbered arrows, and the same tray. The mirror is the ordered stage table: mechanism, from, to and source.

**Budget** [estimated].
- Draw calls ≤ 30 at T2 and ≤ 20 at T1. Triangles ≤ 50k and ≤ 20k. Instances ≤ 500.
- Frame: p95 ≤ 16.7 ms at T2, scene render ≤ 5 ms; p95 ≤ 33.3 ms at T1. Platforms merge into one mesh per platform kind at T1.
- `scene-engine-floor` ≤ 30 KB gz.
- **Measured** [measured 2026-11-08 with the finish review's round-2 files, over wave-1 at 72f163e and again, the same, at ba2797e; the bundle by `verify:bundle`, the draws by `renderer.info` through the scene's test hook in e2e/engine-floor-scene.spec.ts]:
  - `scene-engine-floor` (its chunk, its CSS and the chunks only 3D reaches, scene kit v1's props among them) is 39,972 B gz: 28 B under A§11.1's frozen 40 KB gate (D-023) and 9,972 B over this table's 30 KB target, from 39,845 B at 72f163e before the round. The round's lamp light, the host stand's lectern and book and the printer's tape cost about 400 B [measured on the round's builds], found in the scene's own code: no spot light, so no shadow pass and no light props; the ticket's sheet and the lamp's light made once for the page; tuples without rounding; and the canopy's and the decks' smallest parts. It added no export to scene kit v1's chunk, which stays at 23,006 B. The house's layout travels with the game's page, and `/play/engine-floor` is 199,938 B, 62 B under 200 KB, from 199,951 B. Content hashes move every 3D game's row by up to about 10 B when any chunk changes [measured on the round's builds]: `scene-verifier` measured 39,991 B, `scene-pool` 39,953 B and `scene-loop` 39,894 B in the same build.
  - A whole level of the tallest practice house (Mini-SGLang, six storeys), from the first frame to the ticket home, draws at most 11 scene draw calls at T1 (11 in the frame) and 11 at T2 (25 in the frame, with bloom and the final pass), against A§11.1's 100: within this table's targets, the furniture merged into the house's draws and the lamp's light one instanced draw. It draws at most 37 instances, and at most 174,058 triangles at T1 and 174,378 at T2, over this table's triangle targets: the kit's turned and swept parts, the line's three stations in every house, the pass's plates and a room wide enough that no framing sees past its ends. Round 1 drew 16 scene calls at T2 (30 in the frame) and 327,852 triangles there, with the lit lamp's shadow pass.
  - The scene draws the line's name on a strip of masking tape through the kit's sheets, as Service and The Tasting draw theirs, so every scene reaches the same 3D core and the bundle keeps it in one chunk: a scene that reached only part of it split the core in two, which cost every other scene about 320 B. Scene kit v1 gained 79 B in round 1 for its custom prop kind and a lamp's own glow channel. Moving the /design specimen's styles out of the Stage's stylesheet took about 1 KB off every 3D game's page: `/play/loop` was 195,063 B then.
- **Measured, W1b's finish round 1** [measured 2026-11-09 with the round's files over wave-1b at 6376174; the same tools]:
  - `scene-engine-floor` is 38,727 B gz, 1,273 B under the frozen 40 KB gate, from 37,568 B before the round: the podiums, the lectern, the pedestal, the rolled sheet and the line's tape cut to its words, in the scene's own code. Scene kit v1's chunk gained 1 B (a sheet's rows, which this scene's ticket raises), and every other scene row moved by no more than about 10 B. `/play/engine-floor` is 190,866 B, from 190,746 B.
  - The line's tape stays a sheet of the kit's, so the 3D core stays in one chunk: drawn as DOM tape it would have split the core and cost every other scene about 390 B [measured on a trial build of the round].
  - A whole level of Mini-SGLang draws at most 11 scene draw calls at T1 (11 in the frame) and 11 at T2 (25 in the frame), at most 40 instances, and at most 177,924 triangles at T1 and 178,244 at T2.
- **Measured, W1b's close-out (the ticket)** [measured 2026-11-09 with the close-out's files over wave-1b at 34c8d17; the same tools]:
  - `scene-engine-floor` is 39,368 B gz, 632 B under the frozen 40 KB gate, from 39,276 B: the ticket's two curls and its lit cut end, in the scene's own code. Scene kit v1's chunk did not change (20,966 B), every other scene row moved by no more than 3 B, and `/play/engine-floor` is 191,708 B, as it was.
  - A whole level of Mini-SGLang draws at most 11 scene draw calls at T1 (11 in the frame) and 11 at T2 (25 in the frame), at most 38 instances at T1 and 40 at T2, and at most 177,924 triangles at T1 and 178,244 at T2: the sheet keeps its rows.

**Simulation API.**

```ts
// packages/play/engine-floor/session.ts, over packages/sim/lifecycle (ARCHITECTURE §5.8)
export type Mechanism = 'call' | 'queue' | 'ipc' | 'shm' | 'h2d' | 'd2h' | 'launch' | 'collective' | 'sync'
export interface Place { process: string; thread: string; device: 'host' | 'gpu'; rank: number }
export interface StageDef { id: string; mechanism: Mechanism; label: string; from: Place; to: Place
                            source: { repo: string; ref: string; path: string; symbol: string } }
export interface Scenario { engine: 'nano-vllm' | 'mini-sglang' | 'inside-vllm' | 'vllm' | 'sglang'
                            streaming: boolean; tp: 1 | 2; abort: boolean; prefixHit: boolean; n: 1 | 2 }
export type FloorAction = { t: 'lay'; stage: string } | { t: 'unlay' } | { t: 'run' } | { t: 'commit'; prediction: number }
export function scenarioFor(seed: Seed, level: string): Scenario
export function referencePath(sc: Scenario): readonly StageDef[]          // pinned lifecycle data
export function tray(sc: Scenario, seed: Seed): readonly StageDef[]       // the reference plus distractors, in seeded order
export function legal(at: Place, next: StageDef): { ok: true } | { ok: false; rule: 'start' | 'process' | 'thread' | 'device' | 'async' }
export function runPath(sc: Scenario, laid: readonly string[]): { reached: number; firstWrong: number | null; reason: string | null }
export function spanCheck(laid: readonly string[], t: EsTrace): { matched: number; firstMismatch: number | null }
```

**Invariants.**
- Every reference path passes `legal` stage by stage and is connected from client to GPU and back.
- Every change of process in a reference is `ipc` or `shm`.
- Every read after an async stage follows a `sync`.
- Each lifecycle file validates against its schema and cites the lockfile's ref.
- Distractors are legal somewhere in another engine.
- `spanCheck` passes the reference on its own synthetic trace.
- Determinism.

**Claims.**

| Claim | Source | Date |
|---|---|---|
| vLLM's request path: `create_completion`, then `AsyncLLM.generate`, then the ZMQ input socket, the input thread and `input_queue`, then `step()`, then `output_queue`, the output thread and the output socket, then `output_handler` | Gordić, "Inside vLLM" (commit 42172ad, 2025-08-09) | 2025-09-05 |
| `EngineCore.step`: schedule, `execute_model` non-blocking with the grammar bitmask computed meanwhile, `future.result()`, `sample_tokens`, aborts, `update_from_output` | vLLM v0.33.0 `vllm/v1/engine/core.py` (research vllm M7; W1-T16 cites each stage) | tag 2026-11-01, read 2026-11-03 |
| Mini-SGLang's processes and path; commit 9a91cfa; 6,461 non-blank non-comment lines (the README says about 5,000) | `docs/structures.md`; research M1-M3 | 2026-05-17; counted 2026-11-03 [measured] |
| nano-vllm is offline-only and "~1,200 lines" | its README | fetched 2026-11-03 [unverified line count] |
| SGLang's `FutureMap` relays the last iteration's sampled tokens to the next forward on the GPU | `python/sglang/srt/managers/overlap_utils.py` | snapshot 2026-11-03 |
| Lifecycle traces for span checks | — | synthetic until W2-T21 |

**Size.** M for code, plus content: one lifecycle file per pinned engine, reviewed against source (W1-T16), re-pinned quarterly.

---

## 6. Gap Hunt (`gap-hunt`): TR3 and the capstone (2D)

**Module and concept.** Profile a real engine with `--profile`, Perfetto and nsys graph traces. Outcome 2 is to split a TPOT into kernels, CPU gaps and overlap. The catalog's line: "find the 300 µs gap, name the sync".

**Why the rule is the concept.** The game accepts only an attribution that is a true partition of the step window W, from one step mark to the next:
- **GPU-busy** is the union of kernel and copy spans on GPU streams within W, split into **kernel** and **copy-only**.
- **CPU-gap** is GPU-idle time while the engine's main thread is busy: the GPU waits on the CPU.
- **Both-idle** is GPU-idle time while the main thread is idle, waiting on I/O or another process.
- TPOT, the step's wall time, is GPU-busy + CPU-gap + both-idle. **Overlap**, the main thread's busy time inside GPU-busy, is hidden CPU work, reported beside the partition rather than inside it.

The "unaccounted ns" counter must reach 0. A gap's **cause** is read off the launch queue:
- The GPU work that ends a gap was launched by a CPU call on the same correlation id.
- The main-thread span that covers most of the time from the gap's start to that launch is the cause.
- If a blocking call ends at or after the gap's start (`cudaStreamSynchronize`, `cudaEventSynchronize`, a blocking device-to-host copy, or `.item()` and `.tolist()` frames), that call is the sync that drained the queue.

So the attribution rule is the concept: the GPU idles only when its queue runs empty.

ARCHITECTURE §5.7, §6.1 and §8.5 now state this partition in place of their earlier "TPOT = kernels + CPU gaps − overlap" (§13, item 5).

**Core loop.**
1. Open a case: a trace, a step and an ask.
2. Predict the largest contributor.
3. Mark spans by snapping from one event edge to another, and assign categories.
4. Name the cause of the largest gap.
5. Submit. The debrief overlays the reference and names the largest misattributed span.
6. Capstone use: the same tool on before-and-after commit-pair traces.

**Controls.**
- Zoom with `+` and `−` (pinch optional); pan with the arrow keys (drag optional).
- `J` and `K` jump to the previous and next event edge on the focused track, `Enter` sets a mark's start or end, and `1`-`4` choose a category.
- `X` marks the focused event as the cause.
- On phones the step's events are a table with category radios, and the timeline is a minimap: marking by list.

**Levels.**

| Level | Traces | Kind |
|---|---|---|
| `read` | synthetic and clean: lanes, launches, correlation | practice |
| `gap` | synthetic with seeded jitter: find the largest gap and name its cause (eager launches, a sync, host scheduling) | practice → **graded** |
| `attribute` | synthetic: partition a step | practice → **graded** |
| `graphs` | graph replay against node-level traces (`--cuda-graph-trace=node`); NVTX is absent inside captured graphs (research T3) | practice |
| `pinned` | the owner's 6-10 SHA-256-pinned traces; trace, step and ask drawn at grade time | **graded** (TR3's B artifact; after W2-T21) |
| `yours` | the learner's own trace, loaded locally | practice in the browser. F-lane credit belongs to the grader (D-001). |

- **Band.** On synthetic seeds, the largest gap is ≥ 1.5 × the second largest, and the cause is one CPU span covering ≥ 60% of the gap's lead-in. On pinned traces, candidate steps are pre-screened by the same rule.
- **Difficulty.** Clean, then jittered, then graph traces, then real traces. The asks go from one gap to a full partition.

**Scoring and pass.** Counted from the trace's own timestamps, in ns: correct ns over window ns, and whether the cause is the right event id. Pass when ≥ 95% of the window is in the right category and the cause is correct, on 3 fresh cases. The trace's ns were measured on the owner's GPU or computed by the model; the learner's pace is never measured.

**Predict, Prove, Keep.**
- Predict: the largest contributor.
- Prove: `attribute` with the agent closed.
- GPU lane: the learner's trace and attribution file go to the local grader, which checks both for internal consistency.
- Keep: attribute a 6-span synthetic step.

**2D design** (the gate's dimensionality test calls for 2D here).
- Tracks: the CPU main thread with Python frames as a nested flame chart, CUDA API calls, GPU streams and copies.
- Step marks; correlation links drawn on focus.
- The **unaccounted** counter sits at the top.
- Reduced motion: zooms cut.

**Budget** [estimated].
- Canvas2D with per-pixel bucketing: ≤ 5,000 rectangles drawn per frame.
- Parsing in a worker. Pinned traces are trimmed to ≤ 10 steps and ≤ 2 MB gz each.
- 60 fps pan and zoom on the reference laptop, with each frame's Canvas2D draw ≤ 8 ms of main thread; on phones, list mode, whose interactions meet ARCHITECTURE's INP ≤ 200 ms.

**Simulation API.**

```ts
// packages/play/gap-hunt/session.ts, over packages/sim/trace (ARCHITECTURE §5.7, trace@1)
export type Category = 'kernel' | 'copy' | 'cpu-gap' | 'both-idle'
export interface Mark { fromNs: number; toNs: number; category: Category }
export interface HuntCase { trace: EsTrace; step: number; ask: 'gap' | 'attribute' | 'both' }
export type HuntAction = { t: 'mark'; from: number; to: number; category: Category }   // event ids; edges snap
                       | { t: 'unmark'; index: number } | { t: 'cause'; event: number } | { t: 'submit' } | { t: 'commit'; prediction: number }
export function huntCase(traces: readonly EsTrace[], seed: Seed, level: string): HuntCase
export function referenceSplit(c: HuntCase): { marks: Mark[]; overlapNs: number
                                               largestGap: { fromNs: number; toNs: number; cause: number } | null }
export function checkHunt(c: HuntCase, marks: readonly Mark[], cause: number | null):
  { unaccountedNs: number; rightNs: number; windowNs: number; causeOk: boolean; problems: string[] }
```

**Invariants.**
- The reference marks partition the window with no overlap and full cover.
- On synthetic traces the reference equals the step-loop run's truth (shared with The Loop).
- Every kernel has a launch before it on its correlation id (`traceChecks`).
- `checkHunt` never reads wall time.
- Determinism.

**Claims.**

| Claim | Source | Date |
|---|---|---|
| `--profiler-config`, `/start_profile` and `/stop_profile`; nsys with `--trace-fork-before-exec=true --cuda-graph-trace=node` | vLLM v0.33.0 `docs/contributing/profiling.md`, served at `docs.vllm.ai/en/v0.33.0/contributing/profiling/` (research vllm P1) | tag 2026-11-01, read 2026-11-03 |
| SGLang's profiler endpoints, `detailed_annotations` step labels, and NVTX absent inside captured graphs | research T1-T3 | 2026-11-02 |
| Every trace shown | its `meta`: synthetic, or owner-captured with GPU, engine pin, date and SHA-256 | per trace |

**Size.** M.

---

## 7. Dispatch (`dispatch`): TR4 (2D)

**Module and concept.** Backends as a consumer: FA2/3/4, FlashInfer and FlashMLA. The engine picks an attention backend by walking its priority order and taking the first whose support covers the model and GPU features. That choice also fixes the CUDA-graph support level (`AttentionCGSupport`: ALWAYS, UNIFORM_BATCH, UNIFORM_SINGLE_TOKEN_DECODE or NEVER) and so the graph modes available to The Loop.

**Why the rule is the concept.** The board is the engine's ordered rule table from the pinned data. Given a feature card (GPU architecture, head dim, KV dtype, MLA, sliding window, speculative decoding, page size), the learner predicts the pick and the fallback chain, then walks the table to the reveal. A wrong pick shows the first feature that excluded the predicted backend.

**Core loop.** Predict the pick → reveal by walking the rules → the graph-mode consequence, linked to The Loop's `graphs` · `modes` stage.

**Controls.** A radio group of backends for the prediction (tap or arrow keys); a Reveal button or `Enter` walks to the next rule; the rule table is a DOM table, readable at 390 px as stacked rows.

**Levels.**
- `one-feature`, `two-features` and `fallback`: practice.
- `pick`: **graded**, on fresh feature cards drawn so each backend is the answer on a similar share of seeds.

**Scoring.** Correct picks and correct fallbacks. Pass on 3 of 3 fresh cards.

**Predict, Prove, Keep.**
- The prediction is the pick.
- GPU lane: TR4's sweeps (F), where the learner's log names the backend the engine chose.
- Keep: the pick for a card.

**2D design.** A feature card beside the rule table, whose rows take emphasis in order as the walk reaches them. Reduced motion: no transitions. Budget: DOM only, ≤ 20 KB gz, and interactions within ARCHITECTURE's INP ≤ 200 ms on the reference phone [estimated].

**Simulation API.**

```ts
// packages/play/dispatch/session.ts, over packages/sim/backends (ARCHITECTURE §5.8)
export interface Features { gpu: 'sm80' | 'sm89' | 'sm90' | 'sm100'; headDim: number; kvDtype: 'bf16' | 'fp8'
                            mla: boolean; slidingWindow: boolean; specDecode: boolean; pageSize: number }
export function pick(rules: BackendRules, f: Features): { backend: string; tried: readonly string[]
  cg: 'ALWAYS' | 'UNIFORM_BATCH' | 'UNIFORM_SINGLE_TOKEN_DECODE' | 'NEVER' }
```

**Invariants.** `pick` follows the table's order exactly. Every backend in the pinned data is reachable by some card. The data validates and cites the pin.

**Claims.**
- `AttentionCGSupport` levels and FULL_AND_PIECEWISE's role: vLLM v0.33.0 `docs/design/cuda_graphs.md` (research vllm G1, G7; tag 2026-11-01, read 2026-11-03).
- The rule table: pinned engine data [unverified until the `backends` task builds it].

**Size.** S. It is the lightest game, and it ships because TR4's predict-then-reveal reads need a rule to walk. If ASSESSMENT.md prefers plain items for TR4, it drops without loss.

---

## 8. The Pool (`pool`): TR5a

**Module and concept.** Hybrid KV groups, and adapter pages in the same pool (S-LoRA). Outcome 3 includes "implement a hybrid KV manager with adapter pages".

The KV groups follow the pinned vLLM. The adapter pages are S-LoRA's design, which the learner builds in `hybrid-kv`, and not the engines' own mechanism at the pins. vLLM keeps adapters in `max_loras` GPU slots with a CPU LRU, and SGLang uses a fixed-slot `LoRAMemoryPool` (D-042). The game says so on its card and its In-production card, and the `adapters` debrief compares the learner's pool with that slot baseline.

The rules, from vLLM's hybrid KV cache manager design (read at v0.33.0, where the doc is stale on the number of groups; research vllm K1, K2) and S-LoRA:
- Layers are grouped so that every group has the same page size in bytes.
- A full-attention group keeps one block per block of tokens (16 tokens by default in vLLM).
- A sliding-window group keeps only the blocks covering its window and frees the rest.
- Freed blocks keep their hashes in one LRU free queue shared by every group.
- A prefix hit is the intersection of the groups' hits: the longest full-attention hit scanning left to right, then the longest sliding-window hit inside it scanning right to left. With more than two groups, the code at v0.33.0 repeats this to a fixed point, full attention first (research vllm K1), and every level with more than two groups uses that form, as TR5a's lab does.
- An adapter of rank r takes pages from the same pool and stays pinned while any running request uses it.

**Why the rule is the concept.** The learner is the KV manager's policy under memory pressure: admit, evict, preempt, prefetch adapters. Each choice pays off only through these rules.
- Evicting a full-attention block near a session's head kills every later hit.
- A sliding-window block deep inside a long prefix is worthless for future hits, but one within the window of a session's last boundary is vital.
- An adapter's pages compete with prefix blocks.

You cannot save recomputed tokens without using the intersection rule, which is what the `hybrid-kv` lab's code must implement.

**Core loop.**
1. Predict the pages a request will hold, per group.
2. Run the seeded agentic workload: sessions whose next turn extends their last prompt.
3. Decide at each turn.
4. Debrief with kernelspace's R(i) rule.
5. Compose: dials (eviction order, sliding-first, protect heads, adapter affinity) that reproduce the reference on the seed.
6. Build this: the `hybrid-kv` forge lab.

**Controls.**
- Turns ask one question at a time.
- **Evict:** pick a cached page from the free line (a DOM list in eviction order), or tap it in the rack.
- **Admit:** pick a waiting request or none. **Preempt:** pick a running request. **Prefetch:** pick an adapter or none.
- Keyboard: arrows within the candidate list, `Enter` to choose.
- On phones, picks go through the lists. The rack is for reading.

**Levels.**

| Level | Preset | New idea | Kind |
|---|---|---|---|
| `one-group` | full attention only | paging and prefix hashing (labs 02 and 07 recap) | practice |
| `two-kinds` | 10 full + 20 sliding layers, block 16, window 32 | sliding frees; the doc's 112-token request holds 7 + 2 + 2 = 11 blocks [derived from the doc's example] | practice |
| `evict` | the same, under pressure | eviction against the intersection rule | practice → **graded** |
| `same-size` | Gemma-3-like: 52 sliding + 10 full → 7 groups, 8 padding layers spread over the six sliding groups (the code at v0.33.0 spreads them; the design doc draws them in the last group) | page-size unification and padding waste | practice |
| `state` | a Mamba-like state group | a fixed number of pages per request; attention blocks inflated to match | practice |
| `adapters` | `two-kinds` + rank-8 and rank-64 adapters | unified paging; all-or-nothing admission; prefetch from the waiting queue; the debrief replays the seed with a fixed-slot baseline, the engines' design at the pins | **graded** |
| `manager` | mixed | everything, fresh seeds | **graded** |

- **Band.**
  - LRU without tail-first freeing loses ≥ 10% more recomputed tokens than the reference.
  - ≥ 2 sessions have a hit bounded by a sliding window.
  - ≥ 5 evictions are needed.
  - `adapters`: two adapters compete and one has ≥ 4 times the other's rank.
- **Difficulty.** One group, then hybrid, then padded groups, then state, then adapters. Pool pressure, as pages needed over pages available, rises from 0.8 to 1.4 [estimated].

**Scoring and pass.**
- Counts: recomputed prompt tokens, hit tokens, completed requests within the step cap, preemptions, adapter stall steps and evictions.
- Score: `min(1, reference cost ÷ your cost)`, where cost is recomputed tokens + a stall weight × stall steps. The weight is the prefill tokens a stall step forgoes, set per preset [estimated].
- Pass: ≥ 0.95 on 3 fresh seeds per graded level.
- The UI offers only legal moves, as kernelspace's EPLB does, so violations are impossible. The invariants below are what the learner's lab must satisfy.

**Predict, Prove, Keep.**
- Predict: pages held per group, and the hit length of an arriving request.
- Prove: `manager` with the agent closed.
- GPU lane: none; TR5a is a B-lane module.
- Keep: "blocks held at L tokens", "hit length given these cached blocks", "pages for a rank-r adapter".

**3D scene.**
- **Objects.**
  - **The rack.** Every physical page sits at a fixed position for its whole life, in rows of 16. Its state is a form plus a glyph: free (empty frame), cached (frame plus hash glyph), in use (solid plus the group's glyph), adapter (solid plus pin glyph).
  - **Focus on a page** fans it into its layer slices: 10 per group, with padding layers hollow, so "one block id serves every layer of its group" is visible.
  - **Requests** stand on a shelf in front as token rulers, one block per segment. Above each ruler is one thread per group to its pages in the rack, drawn on Focus only.
  - **The sliding window** is a frame along the ruler. A block that leaves it drops its thread, and its page becomes cached.
  - **The free line** runs along the rack's base: cached pages in eviction order, the next to go on the left.
  - **An adapter's pages** are linked by their own thread and are not drawn contiguous, because unified paging stores them non-contiguously (S-LoRA).
- **Axes.**
  - Physical page (the rack).
  - Group and layer (the fan, and the threads).
  - Token position (the ruler).
- **Camera.** Establish (the rack with the shelf below), Focus (a page fan, or one request's threads), Top (the rack as a grid).
- **Motion.** Threads draw in 200 ms [estimated], and a page changes state in place. Pages never move, because a moving page would misteach copying.
- **Legible at 390 px:** each page's state glyph (the rack is 16 columns, about 20 px each), the free line's order (DOM), and the counts.
- **As built** (W1-T24): the requests are the kit's tickets, waiting along the pass under its two heat lamps and hung on the line's rail over the reach-in's back, without the ruler's segments or the window's frame, which the 2D view draws. The threads are the focus's, the ticket hung last: one twine per station from its ticket to its pans in the order of its blocks, and the fan over the pan at the head of its order; both grow over the settle duration (640 ms), and appear whole under reduced motion. A landed kit's pans are pinned and strung. The cameras are Front of the reach-in, One station and From above: the Focus shots, and picks on the scene, are not built.
- **As built, after the finish review's first round** (disposition rebuild):
  - A pan's mise is food, one ingredient per memory role, drawn into one atlas and tinted by its role: blueberries for a held pan, corn kernels for a cached one, scallion rings for shared mise, a kit's sauce. It heaps over the pan's middle and climbs its walls at the edge, a meniscus. A dumped pan's well is a hollow tray in its role's red.
  - Each pan's tape is the kit's masking tape, with the marker glyph drawn over it. The reach-in's own strip along its front edge is torn at both ends and carries a marker scrawl, not words.
  - The scene prints no word but the tickets' numbers. The free line's order is the eviction ask's list. What the fan shows is a line on the page beside the scene (`src/games/pool/focus.ts`, held equal to the scene's focus by tests/play/pool-scene.test.ts).
  - The fan is the head pan's mise rising out of it in a splayed stack, a tray for each layer of its station. The padding layers come last, on top, as hollow trays.
  - The two heat lamps hang on rods low over the pass's back half and light it straight down, under the waiting tickets. A ticket that can be pulled from the line rings in the lamp's amber where it hangs.
  - The slots a short last row leaves take bevelled lids. The line stands under its hood at the reach-in's left. The room's light falls away to the sides and up the wall into the haze.
  - The tickets and their clips are 1.6 times the kit's [estimated] (its `Tickets` and `RailClips` take a scale).
  - So that the shades stand between the reach-in and the pass, Front of the reach-in looks down 53° at 1440 px, stood 0.3 to 0.6 m to the left so the line and its hood come in, and 52° on a phone [estimated]. tests/play/pool-scene.test.ts projects every pan, rail clip and waiting ticket past the shades at every pool size.
  - The front row's pans are 33.1 px across at 1440 px up to 64 pans, 27.7 px at 112, 23.9 px at 160, 20.9 px at 208 and 17.4 px at 288. On a phone they are 18.4 to 18.6 px up to 160 pans, 16.6 px at 208 and 14.0 px at 288, and 18.9 to 19.0 px From above up to 208 [derived: the presets projected into the 870 by 557 and 356 by 464 px canvases].
  - At this steeper shot the kit's environment map, which carries the lamps' glow for Service's lower camera, warms the horizontal steel a little, lit or not.
- **As built, after the finish review's second round** (disposition fix):
  - A pan's mise is its role's ingredient in natural values: drawn from the role's colour toward paper at a piece's lit top and toward ink in its body and in the gaps between the pieces, with no role colour laid over the drawing. Dark blueberries with their bloom for a held pan, pale corn kernels for a cached one, green scallion rings over the pale of their whites for shared mise, a kit's sauce with a few bubbles. It lies 20 mm below the pan's rim [estimated], so the pan's wall and rolled rim stand round it as a line of steel, and it darkens where it climbs the wall.
  - Tape lies only on a kit's pans, with the kit's pin, and in the head pan's fan, with its station's glyph; One station leaves the kits' off. The 3D rack draws no tape on the other pans and no hash: a pan's state is its food, and the 2D view and the mirror carry each pan's state and station.
  - The fan is thin steel trays, one for each layer of the head pan's station, rising out of it and splaying round its back edge toward the expo, each a little higher and its front a little more lifted than the one under it. Each holds its layer's mise, the padding layers' trays are empty, and the top one carries the head pan's tape with its station's glyph.
  - The two heat lamps hang over the pass's back half, their mouths 0.26 m over it and under the line's rail, and aim forward at the waiting tickets, which lie along the pass's front half [estimated]. The scene's steel reflects the kitchen's tubes without the lamps' glow (the kit's `SceneCanvas` takes `environment="tubes"`), so the pass is brushed steel while the lamps are off and the amber pools only under a lit lamp. The front shot holds the pass's rolled front lip.
  - One cover with a rolled lip closes the slots a short last row leaves.
  - The room's light falls away to the right of the rack, up the wall over the overshelf and back, into the haze's deep steel: the kit's room light takes a `veil`, the share of the light it no longer gives that falls to the haze's colour.
  - The scene carries no number: the open ask's list and the mirror name the tickets. The tickets are 1.85 times the kit's [estimated]. The rail runs along the overshelf's front edge, so no shelf hides a hung ticket, and a hung ticket tips forward 0.32 rad; every ticket curls 0.24 of its length toward its face and cups across [both estimated] (the kit's `Tickets` takes a `curl`). A hung ticket stands 50.7 px tall at 1440 px on `two-kinds` and `evict` and 41.9 px on `adapters` [derived: the presets projected into the 870 by 557 px canvas; tests/play/pool-scene.test.ts holds it between 40 and 60 px].
  - The scene kit's ticket print is the impact printer's dots for every game: lines of words a few dots long and dotted rules, drawn at once, with no face to wait for and no letter or number in it.
  - Front of the reach-in still looks down 53° at 1440 px and 52° on a phone [estimated], its distances and targets fitted again for the deeper pass and the rail's new place. The front row's pans are 28.4 px across at 1440 px up to 64 pans, 27.3 px at 96, 25.9 px at 104 and 112, 22.4 px at 160, 19.7 px at 208 and 16.5 px at 288; on a phone 18.4 px up to 160 pans, 16.7 px at 208 and 14.4 px at 288 [derived: the presets projected into the 870 by 557 and 356 by 464 px canvases].
- **As built, after W1b's finish reviews** (W1b-T10's lamp light, haze and paper, then two rounds of fixes):
  - The two heat lamps hang over the pass's back half on short stems from a lamp bar across it, a steel rod on two posts that stand on the pass's top (the scene's own prop, `lampBar` in `src/games/pool/cabinet.ts`), their mouths 0.23 m over the pass [estimated]. Nothing over the pass stands higher than the bar, so in the front shot no rod runs up across the rack, as the lamps' rods from a ceiling did (W1b's finish review, round 2). tests/play/pool-scene.test.ts projects the bar and its posts, with the shades, through every preset at every pool size, and no pan lies behind them.
  - Front of the reach-in looks down 35.5° at 1440 px and on a phone [estimated], across the rack rather than down on it, so the pans show their rims, their walls and their heaped mise where the 53° shot drew a grid of tiles. It goes no lower: the lamp bar must stay under the front row's rims in the picture, and the shades over the pass. The front row's pans are 27.3 px across at 1440 px up to 112 pans, 26.3 px at 160, 24.4 px at 208 and 21.8 px at 288, and 18.3 px on a phone at every pool size; a hung ticket stands 48 px tall at 1440 px on `two-kinds` and `evict` and 43 px on `adapters` [derived: the presets projected into the 870 by 557 and 356 by 464 px canvases].
  - A pan's mise is heaped in a dome 16 mm high [estimated], a little higher or lower from pan to pan (0.75 to 1.15 of it; a kit's pan as drawn, its tape on its crown), so its slope toward the tubes is lit and its far slope shaded, and its foot, where it meets the wall, is 0.4 as bright as its crown [estimated]. The corn is cooked toward the kit's brown, each kernel its own share of up to 0.9 of the way [estimated]: an uneven gold rather than the board's yellow, while the berries stay navy.
  - A ticket on the line is a thick slip, 10 mm at the scene's scale, turned 0.37 to 0.53 rad on its clip, so its cut edge stands to the room as a lit strip, the edges 1.6 times as bright as the face [estimated]. No outline is drawn round the paper, and its tooth is two mottles, coarse and strong enough to show on a hung ticket at the front shot's size. A ticket lying on the pass keeps the kit's thickness.

**2D path.** The rack as a grid of glyph cells; rulers as rows with one sub-row per group; the free line as a list; the same controls. The mirror is a page table (id, state, group, hash, refs) and a request table (tokens, blocks per group, hit).

**Budget** [estimated].
- Draw calls ≤ 20 at T2 and ≤ 14 at T1. Triangles ≤ 40k and ≤ 15k. Instances ≤ 3k and ≤ 1.5k: pages ≤ 512, fan slices ≤ 64, threads on Focus only.
- Frame: p95 ≤ 16.7 ms at T2, scene render ≤ 5 ms; p95 ≤ 33.3 ms at T1. Threads aggregate first: at T1 only the focused request's threads draw.
- `scene-pool` ≤ 35 KB gz.
- **Measured** [measured 2026-11-08 over wave-1 at ba2797e with the finish review's round-2 fixes; the bundle by `verify:bundle`, the draws by `renderer.info` through the scene's test hook, e2e/pool-scene.spec.ts]:
  - `scene-pool` (its chunk and the chunks only 3D reaches, the scene kit's props among them; the scene has no stylesheet of its own) is 39,921 B gz: 79 B under A§11.1's frozen 40 KB gate (D-023), and 4,921 B over this list's 35 KB target [derived]. The scene's own chunk is 6,118 B of it, the scene kit's props 22,651 B and the scenes' shared chunk 11,152 B, both counted again for every scene that reaches them. The kit's ticket print is dots drawn at once, with no list of words and no face to load, which took 394 B gz off the kit's props for every scene [measured 2026-11-08: 23,006 B at 72f163e, 22,612 B with the print alone changed]. The pool imports the kit's `SheetInstances` for its kits' tapes, so that the scenes' shared chunk stays one file; without it the chunk splits, and Service's and The Tasting's scenes go over their own gates. `three-vendor` is three's and R3F's code unchanged; Rollup renames one of its exports between this round and the last, which leaves it 238,647 B.
  - The house's whole night on `adapters` draws at most 20 scene draw calls at T1 (20 in the frame) and 34 at T2 (48 in the frame with bloom and the final pass). On `same-size`, which has the most stations and so the most twine, it draws 21 at T1 (21 in the frame) and 35 at T2 (49). That is against A§11.1's 100. It draws at most 422 instances on `adapters` and 468 on `same-size`. It draws at most 236,274 and 292,678 triangles at T1, and 346,882 and 403,086 at T2.
  - The instances are within this list's targets. The draw calls and the triangles are over them at both tiers: the room, the pass, its lamps and the rail are scene kit v1's props, built of turned and swept parts, the fan's trays are the hotel pan's own, and at T2 the heat lamps cast shadow maps. The draws stay under the frozen gate.
  - Under reduced motion each of the first ten decisions on `two-kinds` redraws the scene in at most 3 frames, nine of them move the twine, and the scene's box does not move. After them no animation frame is asked for. One station draws 28 calls where every station's twine draws 30, on the sixth decision of `two-kinds`.
- **Measured at the end of W1b** [measured 2026-11-09 over wave-1b at 1ed97ac by the W1b exit review (docs/waves/W1b-report.md §3); the bundle by `verify:bundle`, the draws by `renderer.info` through the scene's test hook, e2e/lesson-games-scene.spec.ts; the chunks read again over d7ea594, which has the same app code]:
  - `scene-pool` is 39,522 B gz: 478 B under A§11.1's frozen 40 KB gate (D-023) and 4,522 B over this list's 35 KB target [derived], from the 39,921 B above, and from 39,837 B at wave-1's tip (c985c4c) [measured 2026-11-09]. Its chunks are the scene's own, 7,163 B, the scene kit's props, 20,914 B, and the 3D core in two parts, `SceneCanvas`, 10,335 B, and `SheetInstances`, 1,110 B; the last three are counted again for every scene that reaches them. Against the 6,118, 22,651 and 11,152 B above, the kit is 1,737 B smaller, net of the haze, the pool and the paper that W1b-T10 gave it, which merged the kit's geometry itself in place of three's `BufferGeometryUtils` and moved the /design kitchen's spot lamps out of the kit's chunk; the scene's own chunk is 1,045 B larger, about 1 KB of it The Reach-In's own round of haze patches, mise and paper; and the core is 293 B larger for its split [all derived]. Service caused the split, in the lesson blocks' finish round 1: it draws no tape strips now, so `SheetInstances` no longer sits in one chunk with `SceneCanvas`, and the reason given above for the pool's import of `SheetInstances`, to keep the core in one chunk, no longer holds. Each scene that draws sheets counts both chunks. `three-vendor` is unchanged, at 238,647 B.
  - The Reach-In's `one-group` level in TR5a's first lesson draws 11 scene draw calls at T1 (11 in the frame) and 11 at T2 (25 in the frame with bloom and the final pass), against A§11.1's 100, with 57 and 61 instances and 84,738 and 85,378 triangles. T2 draws what T1 draws now, because the kit's lamp light draws no shadow pass (W1b-T10), so the T2 counts above, which have the heat lamps' shadow maps in them, are W1's. The game's own page after W1b's finish round 1 has no figure of draws in the exit review (docs/waves/W1b-report.md §3.2).
- **Measured, W1b's close-out round** [measured 2026-11-09 with the round's files over wave-1b at f014069; the bundle by `verify:bundle`; the draws by `renderer.info` through the scene's test hook, e2e/pool-scene.spec.ts on the game's page and e2e/lesson-games-scene.spec.ts in the lesson, read with the round's files over d7ea594, whose code for the game and the lesson f014069 does not change]:
  - `scene-pool` is 39,686 B gz: 314 B under A§11.1's frozen 40 KB gate (D-023), from 39,522 B. The scene's own chunk is 7,329 B of it, from 7,163 B: the lamp bar, the framings, the dome, the cooked corn, and the hung slips' thickness and lit edges, less the paper's drawn outline [derived]. Scene kit v1's props are unchanged at 20,914 B, and no other scene row moved by more than 9 B. `three-vendor` is unchanged, at 238,647 B.
  - The house's whole night on `adapters` draws at most 20 scene draw calls at T1 (20 in the frame) and 20 at T2 (34 in the frame with bloom and the final pass), with at most 301 and 305 instances and 217,526 and 218,166 triangles; on `same-size` it draws 21 at T1 (21 in the frame) and 21 at T2 (35), with 279 and 283 instances and 258,584 and 259,224 triangles. That is against A§11.1's 100. The lamp bar is merged into the set's steel and adds no draw; its posts' contact shadows are two instances.
  - In TR5a's first lesson, `one-group` draws 11 scene draw calls at T1 (11 in the frame) and 11 at T2 (25), with 59 and 63 instances and 85,722 and 86,362 triangles.
  - Under reduced motion each of the first ten decisions on `two-kinds` redraws the scene in at most 4 frames, nine of them move the twine, and the scene's box does not move; after them no animation frame is asked for. One station draws 15 calls where every station's twine draws 17, on the sixth decision of `two-kinds`.
  - At 390 px on tier 1 the lamps warm 2,123 pixels of the pass with red over blue by more than 20, and at 1440 px the floor left of the line lifts from a luma of 78 at the front of the shot to 142 at the wall's foot.

**Simulation API.**

```ts
// packages/play/pool/session.ts, over packages/sim/kv (ARCHITECTURE §5.4)
export type PoolAsk =
  | { kind: 'admit'; candidates: readonly number[] } | { kind: 'evict'; need: number; candidates: readonly number[] }
  | { kind: 'preempt'; candidates: readonly number[] } | { kind: 'prefetch'; candidates: readonly number[] }
export type PoolAction =
  | { t: 'admit'; req: number | null } | { t: 'evict'; page: number } | { t: 'preempt'; req: number }
  | { t: 'prefetch'; adapter: number | null } | { t: 'commit'; prediction: number }
export interface PoolCounts { recomputedTokens: number; hitTokens: number; completed: number
                              preemptions: number; adapterStallSteps: number; evictions: number }
export function blocksHeld(spec: KvSpec, group: string, tokens: number): number
  // full: ⌈L ÷ B⌉; sliding: the blocks covering tokens max(0, L − W + 1) … L − 1
export function hitLength(s: KvState, prompt: readonly number[], adapter: number | null):
  { perGroup: Readonly<Record<string, number>>; hit: number }
export function poolAsk(s: PoolState): PoolAsk | null
export function poolReduce(s: PoolState, a: PoolAction): PoolState
export function poolReference(s: PoolState, ask: PoolAsk): PoolAction
  // the pinned vLLM's rules: FCFS admission; evict from the LRU free queue head; frees append tail-first;
  // FCFS preempts the last running request; prefetch for the queue head
export function slotBaseline(l: PoolLevel): PoolCounts   // the same seed with adapters in fixed slots, as the engines do (D-042)
```

**Invariants** (shared with the `hybrid-kv` lab's property tests):
- **Conservation.** Every page is in exactly one state, and free + cached + used + adapter = the pool.
- A used page belongs to one group, and every table entry of group g points to a used page of g.
- After every step, a sliding table holds no block wholly outside its window.
- **Hits.** The hit is ≤ every group's own hit, a multiple of the block size, and 0 when the first full-attention block misses.
- An adapter used by a running request is resident and pinned.
- **All or nothing.** A refused admission returns the identical state.
- A page returns to free or cached only when its references reach 0. Eviction takes only cached pages, from the free queue's head.
- The free queue is a permutation of the free and cached pages.
- `blocksHeld` reproduces the doc's examples: 11 blocks at 112 tokens, and Gemma-3-27b's 7 groups.
- Determinism.

**Claims.**

| Claim | Source | Date |
|---|---|---|
| Groups of one attention type, the same page size for every group, sliding blocks freed, one shared LRU free queue, cache keys of (block hash, group id), the intersection algorithm, and the worked examples | vLLM v0.33.0 `docs/design/hybrid_kv_cache_manager.md` (written against commit 458e74; the doc calls the feature "still in its early stage" and is stale on "exactly two" groups; research vllm K1, K2) | tag 2026-11-01, read 2026-11-03 |
| Frees append tail-first ("so that tail blocks are evicted first"); under FCFS the victim is `self.running[-1]` | vLLM v0.33.0 `v1/core/single_type_kv_cache_manager.py`, `v1/core/sched/scheduler.py` | read 2026-11-03 |
| Default block size 16; prefix caching on by default | vLLM v0.33.0 `config/cache.py` (research vllm M9) | tag 2026-11-01, read 2026-11-03 [measured] |
| "A KV cache tensor with a sequence length of S uses up S pages, while a LoRA weight tensor of rank R takes up R pages"; stored non-contiguously; next-batch adapters prefetched from the waiting queue | Sheng et al., S-LoRA, arXiv 2311.03285 v3 | 2024-06-05 |
| At the pins, neither engine pages adapters in the KV pool: vLLM uses `max_loras` GPU slots with a CPU LRU, and SGLang a fixed-slot `LoRAMemoryPool` | D-042 (its research rows vllm K4, sglang X6) | checked 2026-11-03 |
| Pool sizes, workloads, adapter ranks, the stall weight | — | synthetic |

**Size.** L.

---

## 9. The Switchyard (`switchyard`): TR5b

**Module and concept.** Native offload; the engine side of the KV connector contract; the event publisher. The rules come from vLLM's `KVConnectorBase_V1` and its scheduler at v0.33.0 (research vllm K6-K8; first read on `main` on 2026-11-03, where the method set only grows):
- `get_num_new_matched_tokens` returns the external hit and whether it loads asynchronously. An async load parks the request in `WAITING_FOR_REMOTE_KVS` until `get_finished` reports it.
- A sync load waits per layer: attention for layer L calls `wait_for_layer_load(L)`.
- An async save "must retain [its] source blocks until completion is reported", and `request_finished` returning true delays the free.
- A failed load truncates the request's computed tokens at the first failed block, evicting it and every later block, and recomputes.
- Events (`BlockStored`, `BlockRemoved`, `AllBlocksCleared`) carry a monotonic sequence number, and a consumer replays from a buffer after a gap.

**Why the rule is the concept.** This is the one game that lets the learner break the contract. Scheduling a request before its loads land, freeing blocks while a save reads them, or reading a failed block applies the move and records a violation. The step's output for that request is visibly corrupt, a poisoned external block can corrupt a later request, and the level ends with a debrief naming the block and step. The contract is learned as the only way to keep output correct. This departs from kernelspace's legal-moves-only UIs on purpose (§13).

**Core loop.**
1. Predict whether a load beats recomputing, for this hit length and tier.
2. Run the seeded workload: decide load or recompute, set bandwidth order, schedule, free.
3. Publish events each step.
4. The debrief names the first violation, or uses the R(i) rule for cost.
5. Build this: the `kv-publisher` lab; in the F lane, the toy connector.

**Controls.**
- Per request: Load (from CPU, disk or peer; async or sync), Recompute, Schedule, Free.
- A bandwidth-order list with up and down buttons; Step.
- Pointer and touch: tap a request at its platform, or a car, to open its controls; every control is a 44 px button. No drag reorders the list.
- Keyboard: arrows in lists, `L`, `P` (recompute), `S`, `F`, `.` to step.
- In practice an unsafe move asks for a confirm press. Graded levels never ask, because the question would give the answer away.

**Levels.**

| Level | New idea | Kind |
|---|---|---|
| `layer` | a sync load pipelined layer by layer: compute of layer L waits for its KV | practice |
| `not-yet` | async loads; `WAITING_FOR_REMOTE_KVS`; scheduling early corrupts | practice |
| `load-or-recompute` | the break-even between transfer time and prefill compute | practice → **graded** |
| `keep-until-saved` | async saves; delayed frees; vLLM does not preempt while a connector has pending block frees | practice |
| `bad-blocks` | seeded load failures; truncate to the longest valid prefix | practice |
| `publish` | events with sequence numbers; the consumer misses a range and replays | practice → **graded** (event conformance) |
| `yard` | everything, fresh seeds | **graded** |

- **Band.** Load and recompute each win on ≥ 30% of the seed's requests. ≥ 1 failure occurs in `bad-blocks` and `yard`. The consumer's gap lands mid-run.
- **Difficulty.** One tier, then three. Single requests, then interleaved. No failures, then failures.

**Scoring and pass.**
- Counts: violations, steps to drain, recomputed tokens and idle bandwidth steps.
- A run with a violation scores 0 for its level. Otherwise the score is `min(1, reference steps ÷ your steps)`.
- `publish` passes when the consumer's view equals the engine's cache after every step.
- Pass: zero violations and ≥ 0.95 on 3 fresh seeds.

**Predict, Prove, Keep.**
- Predict: the load-or-recompute choice, and a step's extra time under a sync load.
- Prove: `yard`.
- GPU lane: the toy connector (F). On the learner's engine, the grader runs upstream's connector unit tests against it, checks every block's bytes through a probe store, checks output agreement with a no-connector run, and checks recovery from injected load failures (ASSESSMENT §5.9).
- Keep: the break-even hit length, and what to recompute after a failed block.

**3D scene.**
- **Objects.**
  - Three decks stacked by tier: GPU at the top, CPU, then disk (ARCHITECTURE §6.1). The GPU deck is The Pool's rack.
  - Transfers are cars on rails between decks; a car's fill shows pages landed.
  - Beside the GPU deck stands the **layer column**, the model's layers stacked. It shows how far compute has reached and which layers' KV has landed.
  - Requests waiting for remote KV wait at a platform.
  - Pages being saved carry a lock glyph.
  - Events leave as signals along a signal line, each with its sequence number. The consumer's **board** shows its rebuilt view.
- **Axes.** Tier (height), page or block (along the deck), layer (the column).
- **Camera.** Establish (the yard), Focus (the layer column, the board), Side (car progress).
- **Motion.** Cars advance per step. The compute marker climbs the column and stops at a layer whose KV has not landed. Under reduced motion, everything moves in whole steps.
- **Legible:** lock glyphs, car fill counts (DOM), the compute marker's layer, and the board's mismatch count.

**2D path.** A rack grid; a transfer table with pages landed per step; a layer progress list; the event log with sequence numbers; the board as a set difference. Same controls.

**Budget** [estimated].
- Draw calls ≤ 28 at T2 and ≤ 18 at T1. Triangles ≤ 50k and ≤ 20k. Instances ≤ 3k and ≤ 1.5k.
- Frame: p95 ≤ 16.7 ms at T2, scene render ≤ 6 ms; p95 ≤ 33.3 ms at T1. The disk deck aggregates first, into one slab per transfer.
- `scene-switchyard` ≤ 30 KB gz; it reuses The Pool's primitives.

**Simulation API.**

```ts
// packages/play/switchyard/session.ts, over packages/sim/tiers and kv (ARCHITECTURE §5.8, D-034)
export type ReqStatus = 'WAITING' | 'WAITING_FOR_REMOTE_KVS' | 'RUNNING' | 'FINISHED_SAVING' | 'FINISHED'
export type YardAction =
  | { t: 'load'; req: number; tier: 'cpu' | 'disk' | 'peer'; async: boolean } | { t: 'recompute'; req: number }
  | { t: 'schedule'; req: number } | { t: 'free'; req: number } | { t: 'order'; reqs: readonly number[] }
  | { t: 'step' } | { t: 'commit'; prediction: number }
export type Violation = { kind: 'read-before-landed' | 'freed-while-saving' | 'read-failed-block'; step: number; req: number; block: number }
export function matchedTokens(s: YardState, req: number): { tokens: number | null; loadAsync: boolean }  // get_num_new_matched_tokens
export function yardReduce(s: YardState, a: YardAction): YardState   // an unsafe move applies and records its Violation
export function yardStep(s: YardState): YardState                    // loads land; layer-by-layer forward; saves; publish
export function yardReference(s: YardState): readonly YardAction[]
export function consumerView(batches: readonly KvEventBatch[]): ReadonlySet<string>
export function replayFrom(buffer: readonly KvEventBatch[], fromSeq: number): readonly KvEventBatch[]
```

**Invariants.**
- The reference has zero violations on every band seed.
- No reference forward reads a page whose load has not landed, and no page with a save in flight is reallocated.
- A failed receive still finishes, leaving `WAITING_FOR_REMOTE_KVS`. Computed tokens truncate at the first failed block, which is evicted with every later block.
- Sequence numbers rise by exactly 1.
- `consumerView` over all batches equals the engine's cached hashes after every step, and a replay from any gap restores equality.
- The Pool's invariants hold.
- Determinism.

**Claims.**

| Claim | Source | Date |
|---|---|---|
| The connector contract's methods and quoted rules | vLLM v0.33.0 `distributed/kv_transfer/kv_connector/v1/base.py` (research vllm K6, K7) | tag 2026-11-01, read 2026-11-03 |
| `WAITING_FOR_REMOTE_KVS`; truncation to the longest valid prefix with downstream eviction; no preemption while the connector has pending block frees | vLLM v0.33.0 `v1/core/sched/scheduler.py` | read 2026-11-03 |
| Event types and fields; a PUB socket and a ROUTER replay socket; an 8-byte big-endian sequence number; a replay buffer of 10,000 batches by default | vLLM v0.33.0 `distributed/kv_events.py` and `config/kv_events.py` (research vllm K8) | tag 2026-11-01, read 2026-11-03 [measured] |
| SGLang's HiCache tiers and its KV events with a LoRA dimension | research H1, H2 | 2026-11-02 |
| Tier bandwidths, latencies, failure rates | — | synthetic |

`kv-events@1` mirrors the pinned shapes until The Wire's WR3 ships (D-034).

**Size.** M.

---

## 10. The Verifier (`verifier`): TR6

**Module and concept.** In-engine speculation and its exact rejection sampler. In Leviathan's notation, with target p and draft q:
- accept a drafted token x with probability min(1, p(x)/q(x));
- on rejection, sample from the residual (p − q)⁺ normalized, and stop;
- if all γ drafts are accepted, sample a bonus token from the next target distribution.

The output is distributed exactly as p, "without changing the distribution" (Leviathan et al.), or "within hardware numerics" on real hardware (Chen et al.).

**Why the rule is the concept.** In `exact`, the learner sculpts the recovery distribution token by token. The game computes the output distribution exactly, in rationals with no sampling, and shows the total-variation distance to p. TV reaches exactly 0 only when the residual is p's excess over q. Every plausible wrong rule (resample from p, resample from q, renormalize p without x) leaves a visible bias. The chain levels then make acceptance length and the bonus token the score. Exactness is the win condition.

**Core loop.**
1. Predict α = Σ min(p, q) for this pair.
2. Watch seeded drafts drop on the skylines.
3. Sculpt or choose the rule. Graded levels hide the live meter and take one submission.
4. Submit.
5. The debrief names the token with the largest output error.
6. Build this: the `rejection-sampler` forge lab, where the learner's code runs 20,000 seeded draws [estimated] under chi-square (ARCHITECTURE §5.5).

**Controls.**
- Per-token steppers (−, +) and a number field for residual weights. Exact-level distributions are drawn on a grid of 1/64, which divides ARCHITECTURE §5.5's 2^16 total, so every excess p − q is a whole number of grid units from 0 to 64 and an exact answer takes a few presses per token.
- A radio group for the acceptance rule; Draw N; a γ stepper in `gamma`.
- Pointer and touch: tap a token's column, in 3D or 2D, to focus its stepper. The steppers are 44 px buttons, and no bar is dragged to height.
- Keyboard: arrows across tokens, `+` and `−`, `Enter` to submit.

**Levels.**

| Level | New idea | Kind |
|---|---|---|
| `overlap` | γ = 1; the acceptance mass is the overlap min(p, q); predict α | practice |
| `exact` | sculpt the residual until TV = 0 | practice → **graded** |
| `chain` | γ up to 4 with a bonus; tokens per round Σ_{j=0..γ} Π_{i≤j} α_i | practice → **graded** (numeric prediction) |
| `greedy-ngram` | temperature 0: accept exactly when x is p's arg max; an n-gram draft with no draft probabilities: q is one-hot, so accept with p(x) and recover from p without x (vLLM's path) | practice |
| `mutants` | find the bug in five sampler implementations, including a boundary-inclusive CDF (SGLang PR #35798's real bug) | practice |
| `gamma` | choose γ for the best speedup given per-position α and draft cost; kernelspace's push-luck, deepened with decaying α | **graded** |

- **Band.** α in [0.4, 0.9]. ≥ 2 tokens with p > q and ≥ 2 with q > p. Every wrong rule has TV ≥ 0.02. In `gamma`, the best γ is interior and ≥ 0.5% ahead of the runner-up (push-luck's band).
- **Difficulty.** Six tokens, γ = 1; then zeros in p or q; then chains; then economics.

**Scoring and pass.**
- Exact TV as a rational, rejections per round, tokens per round and target passes saved over 1,000 seeded rounds.
- `exact` passes when TV = 0 on 3 fresh pairs.
- `chain` passes when the prediction is within ±1% on 3.
- `gamma` passes on the exact γ, 3 of 3.

**Predict, Prove, Keep.**
- Predict: α, and tokens per round.
- Prove: `exact` with the agent closed.
- GPU lane: TR6's proposer (F). The grader checks that speculative and plain greedy outputs match under tie-aware identity (D-046) and that acceptance counts are consistent with the engine's per-step metrics (ASSESSMENT §5.9). Chi-square stays in the browser, on the `rejection-sampler` forge lab.
- Keep: α, expected tokens per round, the residual for a pair.

**3D scene.**
- **Objects.** One row per draft position, 1 to γ, running into depth, then a bonus row. Each row is a skyline over the 6-token vocabulary. Each token's column stacks:
  - a solid base of height min(p, q);
  - above it, a reject cap of height q − p where q > p;
  - beside it, a recovery well of height p − q where p > q.
- **A drafted token** is a marker dropped on column x at a seeded height u in [0, q(x)): it lands in the base (accepted) or in the cap (rejected). On rejection, a second marker drops on the row's recovery wells to pick the replacement.
- **The verifier's walk** moves into depth and stops at the first rejection, and later rows are marked unused. At the front, the **output skyline** of emitted tokens per position converges on p as draws accumulate.
- This refines ARCHITECTURE §6.1's "three skylines in depth": depth carries the chain, and q, p and the output share each row.
- **Axes.** Token (across), probability (height), draft position (depth).
- **Camera.** Establish (3/4 over the rows), Focus (one row, front-on), Follow (the walk, opt-in).
- **Motion.** Markers drop in ≤ 300 ms [estimated]. Under reduced motion they appear at their heights, and nothing animates during batch draws, which only update counts.
- **Legible:** which segment a marker hit, the TV meter (DOM), and per-token output against p in the mirror.

**2D path.** Small multiples: per-position bar charts with base, cap and well segments, markers as dots, and the output histogram. Same controls. The mirror is a per-token table of p, q, min, excess, output and error.

**Budget** [estimated].
- Draw calls ≤ 16 at T2 and ≤ 12 at T1. Triangles ≤ 30k and ≤ 12k. Instances ≤ 2.5k and ≤ 1k; markers beyond 200 aggregate into the output skyline.
- Frame: p95 ≤ 16.7 ms at T2, scene render ≤ 4 ms; p95 ≤ 33.3 ms at T1. Batch draws update counts without animating, so a 20,000-draw run costs no frames.
- `scene-verifier` ≤ 25 KB gz.
- **Measured** [measured 2026-11-09 over wave-1b at d7ea594 with the files of W1b's finish fixes for The Tasting, round 2; the bundle by `verify:bundle`, the draws by `renderer.info` through the scene's test hook]:
  - `scene-verifier` (its chunk and the chunks only 3D reaches, the scene kit's props among them) is 38,642 B gz: 1,358 B under A§11.1's frozen 40 KB gate (D-023) and 13,642 B over this list's 25 KB target, which predates scene kit v1. The chunks it shares with every dressed scene are 32,360 B of it, and its own chunk is 6,282 B [derived from 10,332 + 20,918 + 1,110]; the print over it is styled by the game's own stylesheet. The round's stacks of what went out, steel shades and haze cost 315 B, from 38,327 B at d7ea594.
  - Every level played with its draws on `/play/verifier` (e2e/verifier-scene.spec.ts) draws at most 15 scene draw calls at T1 (15 in the frame) and 15 at T2 (29 in the frame with bloom and the final pass), against A§11.1's 100: the pulled plates take a draw for each part their edge band can be, what went out one, and the lamps' light one. It draws at most 402 instances at T1 and 408 at T2, and at most 338,830 triangles at T1 and 339,790 at T2, all in `chain`'s run of four courses, where what went out stands on side plates beside each of her stacks, an instance a plate.
  - T1's draw calls and both tiers' triangles are over this list's targets, which predate scene kit v1: every plate of every stack is turned with its own edge band and the gap under it. The kit's lamp light draws no shadow pass (W1b-T10), so T2's draws are within this list's 16. The draws stay under the frozen gate.
  - A draw moves the scene once, on the bell, whatever its size: the new rounds' plates drop and what went out settles, in about a second [derived from the drop's 300 ms, its stagger of 70 ms a course and 16 ms a round, and the settle's 640 ms after a 160 ms wait, all estimated], and a hundred rounds took one move of 10 frames at T1, on a machine other runs shared. Under reduced motion a draw cuts to its end. A 20,000-round run is one move a draw, never one a round.

**Simulation API.**

```ts
// packages/play/verifier/session.ts, over packages/sim/spec (ARCHITECTURE §5.5: integer weights, total 2^16)
export type AcceptRule = 'min-ratio' | 'p-at-least-q' | 'always'
export type Recovery = { kind: 'excess' } | { kind: 'weights'; w: readonly number[] }
export interface Ratio { num: bigint; den: bigint }                         // exact; reduced; den > 0
export type VerifierAction =
  | { t: 'sculpt'; token: number; delta: number } | { t: 'rule'; accept: AcceptRule }
  | { t: 'draw'; n: number } | { t: 'gamma'; k: number } | { t: 'submit' } | { t: 'commit'; prediction: number }
export function outputExact(p: Dist, q: Dist, accept: AcceptRule, r: Recovery): Ratio[]
export function tvExact(out: readonly Ratio[], p: Dist): Ratio
export function alphaExact(p: Dist, q: Dist): Ratio                                 // Σ min(p, q) ÷ total
export function expectedTokensExact(alphas: readonly Ratio[]): Ratio                 // Σ_{j=0..γ} Π_{i≤j} α_i
export function ngramCase(p: Dist, x: number): { accept: Ratio; recovery: Ratio[] }  // q one-hot
export function greedyAccept(p: Dist, x: number): boolean                           // bands exclude ties
```

**Invariants.**
- `outputExact(p, q, 'min-ratio', excess)` equals p exactly on 10,000 seeded pairs.
- Every bestiary rule differs on every band seed.
- `ngramCase` equals `outputExact` with q one-hot.
- The integer accept step (u uniform in [0, q_x), accept when u < p_x) gives min(1, p/q).
- Seeded Monte Carlo of 20,000 rounds stays under the generated χ² critical value at 10⁻³ for the reference on band seeds, and the boundary-inclusive mutant exceeds it.
- `expectedTokensExact` matches Monte Carlo within 1%.
- BigInt only in exact paths, and no `**`.

**Claims.**

| Claim | Source | Date |
|---|---|---|
| Speculative decoding samples "without changing the distribution"; 2X-3X on T5-XXL | Leviathan, Kalman and Matias, arXiv 2211.17192 (ICML 2023) | 2022-11-30 (v1) |
| The scheme "preserves the distribution of the target model within hardware numerics"; 2-2.5x on a 70B model | Chen et al., arXiv 2302.01318 | 2023-02-02 |
| vLLM's sampler "strictly follows" 2211.17192; accepts when `target_prob / draft_prob >= uniform_prob`; recovers from max(p − q, 0); greedy rejects when the draft differs from the target's arg max; n-gram drafts have no draft probabilities | vLLM v0.33.0 `vllm/v1/sample/rejection_sampler.py` (MRV1; MRV2's is under `vllm/v1/worker/gpu/spec_decode/`; research vllm S2, S3) | tag 2026-11-01, read 2026-11-03 |
| A real exactness bug: `coin <= cumulative_probability` with coins in [0, 1) | SGLang PR #35798; research P3 | 2026-08-21 |
| MRV2 speculation: Eagle, Eagle3 and MTP; rejection results feed GPU input prep | vLLM blog "Model Runner V2" | 2026-03-24 |
| The acceptance-length model and its band | kernelspace `fleet-ex/push-luck.ts` | d478f91 |
| All distributions and costs | — | synthetic |

**Size.** M.

---

## 11. Broken Bench (`broken-bench`): TR8 (2D, with an optional 3D opener)

**Module and concept.** Benchmark like you mean it: open against closed loop, coordinated omission, warmup, and bootstrap intervals on p99. Each case is a published claim with its harness and raw log, and the claim is wrong because of one flaw. The learner names the flaw and predicts the corrected p99 with an interval. This extends kernelspace's broken-bench (closed loop, capped output, warm cache, counted warm-up; `fleet-ex/broken-bench.ts`).

**Why the rule is the concept.** The court's rules of evidence are benchmark methodology:
- a latency counts from when the request was due, not when a stalled client got round to sending it;
- a percentile needs enough samples beyond it, so a p99 from 100 requests rests on one;
- a warm-up window is excluded and reported apart;
- a rate the harness never achieved is not the rate.

The only way to rule correctly is to apply the rule to the log.

**Core loop.**
1. Read the claim and the setup.
2. Inspect the log: rows, per-client timelines and a histogram.
3. Name the flaw.
4. Predict the corrected p99 and an interval.
5. The reveal: the court recomputes from the rows (from the due time, the warm-up cut, the bootstrap) and shows the arithmetic.
6. In production: the flags that would have produced an admissible number (`vllm bench serve --request-rate` with `--burstiness`, `--max-concurrency` with `client_queue_time`; SGLang's `bench_serving` with `--goodput`).

**Controls.** A radio group of flaws, numeric inputs for p99 and its bounds, and view tabs (rows, timeline, histogram). Pointer and touch: tapping a row or a timeline bar selects that request and shows its due, sent, first-token and done times. Keyboard throughout: arrows in the radio group and the row table, `Tab` between views. On phones, everything is a list.

**Cases.** Each is drawn answer first, so the flaw label never gives the number away.

| Flaw | What the log shows | Grounded in |
|---|---|---|
| closed loop past capacity | in flight never exceeds the clients | kernelspace broken-bench |
| coordinated omission | sends slip behind due times during a stall | wrk2 README; Schroeder et al. 2006 |
| client queue hidden | the timer starts after a concurrency semaphore | SGLang `bench_serving` (research T5); vLLM's `client_queue_time` (research T7) |
| warm-up counted | the first window is slow | kernelspace broken-bench |
| warm cache | prompts share a cached prefix | kernelspace broken-bench |
| capped output | replies are cut at `max_tokens` | kernelspace broken-bench |
| too few samples | p99 from n ≤ 200 | ARCHITECTURE §5.6 |
| mean reported as a tail | the claimed "p99" equals the log's mean | ARCHITECTURE §5.6 |
| client bottleneck | the client saturates first | sglang-bench README (research T8) [unverified, vendor-reported] |
| "replay" that ignores timestamps | arrivals come from the rate flag, not the trace | vLLM's BurstGPT loader (research D3) [derived from source, not executed] |
| none | a control case | so that rejecting everything fails |

**Levels.**

| Level | New idea | Kind |
|---|---|---|
| `rain-and-relay` | optional 3D opener: the same stall under open and closed loops | practice |
| `due` | re-time a log from due times | practice → **graded** |
| `warm` | find the warm-up cut by the course's rule | practice → **graded** |
| `sure` | the bootstrap interval on p99, and the minimum n | practice → **graded** |
| `court` | five mixed cases, fresh seeds | **graded** (TR8's B corpus) |

- **Band.** The flaw moves the number by ≥ 1.5 times (kernelspace's `BB_MIN_RATIO`). Outside `too-few-samples`, the corrected p99 rests on ≥ 1,000 requests, so at least 10 lie beyond it. A scene-blind constant per flaw label passes ≤ 15% of rounds, which ASSESSMENT.md bounds. Each flaw appears on 1/11 ± 3% of seeds.
- **Difficulty.** Obvious stalls, then subtle client-side flaws, then intervals.

**Scoring and pass.**
- Per case: the flaw is right; the p99 falls within ±15% of the recomputed value [estimated]; the interval contains it and is no wider than 2 times the bootstrap interval.
- Each `court` session includes at least one latency-from-due case and one small-sample case. It passes at ≥ 4 of 5 cases with both the flaw and the number right.

**Predict, Prove, Keep.**
- The p99 prediction is the Predict step.
- Prove: `court`.
- GPU lane: the BurstGPT replay (F). The learner's own log goes before the same rules of evidence. The receipt's raw rows are recomputed by the browser (D-028) and its correctness by the grader.
- Keep: "corrected p99 for this 20-row log" and "n needed for a p99 interval this tight".

**The 3D opener, `rain-and-relay`** (a stretch, built after `court` ships). The scene has two arenas along one time axis.
- **Open loop:** requests fall as drops at their due times onto the server's intake. During a stall the gate closes and the drops pile up, so queue height is the honest latency.
- **Closed loop:** one runner lane per client in depth. A runner waits for its reply before sending again, so during the stall every runner freezes and the requests never sent appear as ghost outlines at their due times. The ghosts are the omitted requests, counted on screen.
- **Axes.** Time, client, queue height.
- **Camera.** Establish, then Compare (side).
- **Reduced motion:** drops and runners appear per step.
- **2D twin:** two timelines with queue length and per-client bars.
- **Budget:** ≤ 14 draw calls, ≤ 30k triangles, ≤ 2k instances and ≤ 20 KB gz; frame p95 ≤ 16.7 ms at T2 with scene render ≤ 4 ms, and ≤ 33.3 ms at T1 [estimated].

**2D design.** Row tables, per-client timelines with due and sent ticks, and a latency histogram with the percentile marker. SVG at ≤ 2,000 marks and Canvas2D above that (ARCHITECTURE §6.3). Under reduced motion there are no transitions. Budget ≤ 40 KB gz, a histogram redraw ≤ 8 ms on the reference laptop, and interactions within ARCHITECTURE's INP ≤ 200 ms on the reference phone [estimated].

**Simulation API.**

```ts
// packages/play/broken-bench/session.ts, over packages/sim/bench (ARCHITECTURE §5.6)
export type Flaw = 'closed-loop' | 'coordinated-omission' | 'client-queue-hidden' | 'warm-up-counted' | 'warm-cache'
  | 'capped-output' | 'too-few-samples' | 'mean-as-tail' | 'client-bottleneck' | 'replay-without-timestamps' | 'none'
export interface BenchRow { id: number; client: number | null; dueUs: Us; sentUs: Us; firstUs: Us; doneUs: Us }
export interface BenchCase { claim: { metric: 'ttft-p99' | 'tpot-p99' | 'goodput'; value: number; n: number }
                             setup: BenchSpec; rows: readonly BenchRow[] }        // the flaw stays hidden in the session
export type BenchAction = { t: 'flaw'; flaw: Flaw } | { t: 'predict'; p99Us: Us; loUs: Us; hiUs: Us }
                        | { t: 'view'; v: 'rows' | 'timeline' | 'histogram' } | { t: 'submit' }
export function benchCase(seed: Seed, level: string): { c: BenchCase; flaw: Flaw }   // answer first
export function fromDue(rows: readonly BenchRow[]): Us[]                              // latency from the due time
export function warmupCut(rows: readonly BenchRow[]): number                          // the course's fixed rule
export function corrected(c: BenchCase, flaw: Flaw): { p99Us: Us; ci: readonly [Us, Us] }  // seeded bootstrap, B = 1,000
export function judge(c: BenchCase, flaw: Flaw, a: { p99Us: Us; loUs: Us; hiUs: Us }):
  { flawOk: boolean; numberOk: boolean; intervalOk: boolean }
```

**Invariants.**
- In a closed loop, in flight ≤ clients at every instant. In an open loop without a cap, sent = due.
- `fromDue` ≥ the sent-based latency for every row.
- Percentiles are nearest-rank and monotone.
- The bootstrap is deterministic per seed and contains its point estimate.
- With no stall and load ≤ 70% of capacity, open and closed p99 agree within 10% (the control).
- Poisson gaps come from the committed exponential-quantile table, never `Math.log` (D-017).
- Integer µs.

**Claims.**

| Claim | Source | Date |
|---|---|---|
| In a closed model, new arrivals are triggered only by completions; in an open model, jobs arrive independently of completions | Schroeder, Wierman and Harchol-Balter, NSDI 2006 | 2006 |
| Measuring "from the time the transmission should have occurred"; p99 1.27 s corrected against 6.04 ms uncorrected after a 1.4 s stall | wrk2 README | fetched 2026-11-03 [measured by its author; unverified here] |
| `--request-rate inf` sends everything at time 0; finite rates use Poisson or gamma arrivals; with `--max-concurrency` the achieved rate can fall below the requested one | vLLM v0.33.0 `vllm/benchmarks/serve.py` and `docs/benchmarking/cli.md` (research vllm B1, B2) | tag 2026-11-01, read 2026-11-03 |
| The four rules (traffic, warm-up, samples, identical stacks) | kernelspace T7.L2 | d478f91 |
| All logs, servers and stalls | — | synthetic |

**Size.** M, plus S for the optional opener.

---

## 12. Modules without a game of their own

- **TR7, Contribute honestly** (DCO, RFCs, "Do not submit 'pure agent' PRs"). A game would trivialize judgment about people and process. Its evidence is a filed issue and a reproduced number (F).
- **Capstone.** It reuses Gap Hunt (attribution of the commit pairs' traces) and Broken Bench's rules (goodput at SLO measured by TR8's rules) as instruments, with no new game. The Loop's 70B card gives the roofline context.

TR0 and TR4 have the small games of §4 and §7.

---

## 13. Where this departs from kernelspace, and from ARCHITECTURE.md

**From kernelspace's pattern** (PLAN-100X §5.4.0, OD9; the plays at d478f91):

1. **3D is a default, not an opt-in.** kernelspace allows 3D only in `GATE_3D = ['tiling-cube', 'device-mesh']`, behind a button, with 2D the default (OD9). The owner's D-005 makes six games 3D on capable devices. The 2D view stays first-class: it paints first, it is the poster, and it is the T0 path.
2. **A clock with lanes.** kernelspace's Fleet is a flat 50 ms tick. The step-loop games run integer µs with separate CPU and GPU lanes, like S5's EngineV2, because overlap is invisible at tick granularity. The front page keeps ticks, labelled synthetic.
3. **Unsafe moves in one game.** kernelspace UIs offer only legal moves ("a decision outside the rules throws", `eplb.ts`). The Switchyard lets the learner break the connector contract and see the corruption, because the contract is the lesson.
4. **Exact rationals.** The Verifier's main check is an exact output distribution, not a statistical test, so the check needs no critical values and cannot flake. Chi-square stays for the forge lab and the visual convergence.
5. **Watch segments animate.** kernelspace applies non-decision ops instantly. Here they animate cosmetically, are never timed, and become instant under reduced motion.
6. **GPU-lane predictions.** kernelspace's field evidence carries weight 0. Here each game's model makes a prediction that the GPU lab tests, while the local grader owns that credit (D-001).
7. **The front page records nothing.** kernelspace's Boot writes ledger events. This front page is a demo for visitors who have not started the course (D-038).

**From ARCHITECTURE.md.** The design review of 2026-11-03 settled all eight. Items 1, 2 and 4 became proposed decisions D-043, D-044 and D-045, and ARCHITECTURE.md and TRACKER.md now follow every item:

1. **§6.11, the front-page levers.** Its levers are async scheduling, CUDA graphs and a batch cap, with a win at a GPU-busy bar. This file's brief asks the visitor to *schedule a batch* and learn *continuous batching and overlap*. So the front page has the visitor place requests in slots by hand, its levers are refill and overlap, and the win is par in ticks, which needs both levers (the `first-4-par` band in §3). CUDA graphs move to TR2's levels of the same game. One true thing in 60-120 s is easier than three.
2. **§5.3, double-counted host work.** "The GPU step time is the S5 card's `us`" includes S5's `seqs × t_seq` term, which S5's `types.ts` defines as "host work per running sequence per step". The host card then adds per-sequence CPU work again. The proposal: the GPU lane takes S5's `us` minus `seqs × t_seq`, and t_seq goes on the CPU lane, where async scheduling can hide it, labelled as an extrapolation.
3. **§6.1, The Pool's shelves.** "One shelf per group" draws a partitioned pool, which is what unified paging removes. Pages should keep fixed physical positions with the group as a glyph (§8). "Adapters are multi-page slabs" implies contiguity, but S-LoRA stores adapter pages non-contiguously, so they are drawn as linked pages.
4. **§5.4, `pageUnits`.** Pages holding blocks of different sizes is S-LoRA's idea at a finer grain. vLLM's hybrid manager instead makes every group's page the same size by grouping layers, padding layers, or inflating the attention block size (the doc's "core challenge"). The Pool follows vLLM for KV groups and S-LoRA only for adapters, which take ⌈adapter bytes ÷ page bytes⌉ pages.
5. **§6.1, Gap Hunt's formula.** "TPOT = kernels + CPU gaps − overlap" is better stated as a partition: TPOT = GPU-busy + CPU-gap + both-idle, with overlap reported beside it as hidden CPU work (§6).
6. **§6.8, `Space` on focused buttons.** `Space` is play or pause on the game container, and a focused button also uses it. The proposal: shortcuts never fire when the event's target uses the key natively (§2.3).
7. **§6.1, The Verifier's skylines.** "Three skylines in depth" (draft, target, output) is refined so that depth carries the draft chain and each row holds q, p and their overlap (§10).
8. **§6.1, Broken Bench's flaws.** Two flaws grounded in the engines' own tools are added: the client queue hidden by `bench_serving`'s timer, and a "replay" that ignores timestamps (§11).

---

## 14. Build order

The front-page run comes first. Then the no-GPU modules, TR1, TR2, TR5a, TR6 and TR8 (D-002). Waves and task ids are TRACKER.md's, and this order matches its dependencies.

| # | Build | TRACKER tasks | Wave | Size here | Why here |
|---|---|---|---|---|---|
| 1 | Scene kit v0; The Loop's session, 2D view, mirror and poster; its 3D scene; the front page | W0-T15, W0-T16, W0-T17, W0-T18 | W0 | L | D-004. It builds `Stage`, the camera rig, labels, selection, tiers, the 2D-first swap, the poster, the mirror and `verify:games`, which every later game reuses. The TR2 spike is W0-T13's acceptance (D-040). |
| 2 | The Loop: TR2's levels and TR6's `mask` level | W1-T13, after W1-T12 | W1 | L | The cheapest next game: the same session and scene. The dispatcher golden tables come first. |
| 3 | The Engine Floor | W1-T17, W1-T18, after W1-T16 | W1 | M | TR1, no-GPU. A new scene, with rules carried by data. |
| 4 | The Verifier | W1-T28, W1-T29, after W1-T26 | W1 | M | TR6, no-GPU. Exact math, a small scene. Pairs with the `rejection-sampler` lab. |
| 5 | The Pool | W1-T23, W1-T24, after W1-T21 | W1 | L | TR5a, no-GPU. The largest new scene. Its invariants are the `hybrid-kv` lab's property tests. |
| 6 | Broken Bench | W1-T33, after W1-T32 | W1 | M | TR8, no-GPU. 2D, extends kernelspace's corpus. |
| 7 | The Trace Room and Gap Hunt, on synthetic traces first | W2-T20 | W2 | M | TR3's tool before real traces. Shares its attribution test with The Loop. |
| 8 | The Switchyard | W2-T30, W2-T31, after W2-T28 | W2 | M | TR5b. Reuses The Pool's rack. |
| 9 | Shape Shifter | W2-T14, W2-T15, after W2-T13 | W2 | M | TR0, beside the L-lane forward lab. |
| 10 | Dispatch | W2-T25 | W2 | S | TR4. |
| 11 | Gap Hunt on pinned traces | after W2-T21 | W2 or later | S | Real cases once the owner's traces exist (O-5). |
| 12 | `rain-and-relay`; a pre-registered 3D-against-2D comparison (D-005's revisit) | not in TRACKER yet | W3, stretch | S + S | Attention, then evidence. |

**Review cost.** The catalog's code-QA rates (catalog §9, from PLAN-100X §8) price artifacts, not task sizes: 20 h per world or capstone harness, 8 h per browser-graded artifact and 4 h per local or field lane [estimated rates]. By that method the course's review estimate is PLAN.md §12's 160-180 h [derived], and the games sit inside it as the world and its browser-graded artifacts. Applying the same rates to task sizes instead is not the catalog's method, but it flags a real risk: this file's sizes would come to 3 L + 6 M + 4 S ≈ 124 h, and TRACKER's game tasks (9 L and 9 M, W0-T15 to W2-T31) to about 252 h [derived, under that misuse of the rates], mostly because each 3D scene is its own L task. The owner should weigh that when answering O-8.

---

## 15. Open questions

1. **Front-page levers.** Settled: this file's version (place requests by hand; refill and overlap) is proposed decision D-043, and ARCHITECTURE §6.11 and TRACKER W0-T16 follow it. The owner confirms it with O-11.
2. **The host term.** Settled: moving S5's `seqs × t_seq` from the GPU lane to the CPU lane is proposed decision D-044, which the owner confirms before W1-T12.
3. **The dispatcher golden table.** It needs an owner run of vLLM's dispatchers at the pinned tag (CPU-only Python is enough [unverified]). W1-T12's acceptance now includes the script and the run; who runs it, and on what host, is Q-10 in DECISIONS.md.
4. **Gap Hunt on phones.** Answered: ASSESSMENT §4.3 counts graded marking by list on phones the same, and ARCHITECTURE §3.1 now keeps only the timeline viewer laptop-first.
5. **Unsafe moves.** Answered yes: ASSESSMENT §4.3 lets a violation happen in a graded level and scores that attempt 0.
6. **The 3D evaluation.** Should W3 run kernelspace's dormant pre-registration pattern (`docs/prereg/tiling-cube-3d.md`) on one flagship, opt-in and on-device, to answer D-005's "revisit when"? Open as Q-12; TRACKER has no task for it yet.
7. **Dispatch's place.** Keep it as a game, or fold TR4 into plain items (§7)? Open as Q-11.

---

## 16. Sources

Read 2026-11-03 unless a date is given.

**Course and family**
- `PRODUCT.md`; [ARCHITECTURE.md](ARCHITECTURE.md); [DECISIONS.md](DECISIONS.md); [research/upstream-sglang.md](../research/upstream-sglang.md) (rows O1-O5, G1-G6, H1-H2, P1-P4, T1-T9, M1-M3, D1-D5); [research/upstream-vllm.md](../research/upstream-vllm.md) (rows R5, M7, M9, G1, G7, K1, K2, K6-K8, S2, S3, B1, B2, P1, T1), cited as "research vllm …".
- The front page's surface brief, `.impeccable/surfaces/src-front-frontpage-tsx.md` (2026-11-03), whose direction contract §2.6 follows (D-047).
- kernelspace `SPECIALIZATIONS.md` (2026-10-24), §2, §3.5, §4, §7, §9.
- kernelspace at d478f91 (2026-10-30):
  - `PLAN-100X.md` §5.4.0, §7.3, §10;
  - `docs/100x-evidence/research/games-3d.md` (2026-10-03), §2.3 and §3.1;
  - `src/lib/rng.ts`, `src/lib/world/play.ts`, `sched.ts`, `eplb.ts`, `bands/*.ts`;
  - `fleet-ex/{index,knee,broken-bench,push-luck,straggler,timing-oracle,pd-split}.ts`;
  - `src/components/play/{scheduler,tiling-cube}/*`, `src/components/three/View3D.tsx`;
  - `src/lib/world/physics/{card,types,table}.ts`;
  - `src/data/physics/points/inferencex-l70-2025-10-29.json` and its `ATTRIBUTION.md`;
  - lessons t5.l7 and t7.l2, and t6.l9's S-LoRA section.
- statespace at 7b6938c (2026-10-27): `docs/WORLD.md`, `docs/EVIDENCE.md`, `docs/ASSESSMENT.md` (receipts, "no game layer").

**vLLM**
- v0.33.0 source: `vllm/config/{vllm,scheduler,compilation}.py`, `vllm/forward_context.py`, `vllm/v1/cudagraph_dispatcher.py`, `vllm/v1/core/sched/{scheduler,async_scheduler}.py`, `vllm/v1/core/{kv_cache_manager,single_type_kv_cache_manager,block_pool}.py`.
- `main`, first read on 2026-11-03: `vllm/v1/engine/core.py`, `vllm/distributed/kv_transfer/kv_connector/v1/base.py`, `vllm/distributed/kv_events.py`, `vllm/v1/sample/rejection_sampler.py`, `vllm/config/cache.py`. The claims tables above cite these files at v0.33.0 instead, through the research rows that verified them at the tag (vllm M7, M9, K6-K8, S2, S3), because the course pins v0.33.0 and `main` moves.
- Docs pages, first read under `/en/latest/` and dated by their footers; `/en/latest/` moves (vllm R5), so the claims cite the same pages at `/en/v0.33.0/` or as source files at the tag:
  - https://docs.vllm.ai/en/latest/design/cuda_graphs/ (2026-10-12);
  - https://docs.vllm.ai/en/latest/design/hybrid_kv_cache_manager/ (2026-10-30);
  - https://docs.vllm.ai/en/latest/contributing/profiling/ (2026-10-24);
  - https://docs.vllm.ai/cli/bench/serve.html.
- Blogs:
  - https://vllm.ai/blog/2026-03-24-mrv2 (2026-03-24);
  - https://vllm.ai/blog/2025-09-05-anatomy-of-vllm (Gordić, 2025-09-05, commit 42172ad; the canonical dated URL, vllm T1).

**SGLang and others**
- https://lmsys.org/blog/2024-12-04-sglang-v0-4/ (2024-12-04).
- SGLang docs snapshot of 2026-11-03: speculative decoding, breakable CUDA graph, `overlap_utils.py`.
- Mini-SGLang `docs/structures.md` and `features.md`; nano-vllm's README.
- TensorRT-LLM's overlap scheduler, https://nvidia.github.io/TensorRT-LLM/latest/features/overlap-scheduler.html (updated 2026-10-26).

**Papers and tools**
- Yu et al., "Orca", OSDI 2022.
- Kwon et al., arXiv 2309.06180 (2023-09-12).
- Sheng et al., "S-LoRA", arXiv 2311.03285 v3 (2024-06-05).
- Leviathan, Kalman and Matias, arXiv 2211.17192 (2022-11-30; ICML 2023).
- Chen et al., arXiv 2302.01318 (2023-02-02).
- Schroeder, Wierman and Harchol-Balter, "Open Versus Closed: A Cautionary Tale", NSDI 2006.
- wrk2's README, https://github.com/giltene/wrk2.
- InferenceX official results, Llama-3.3-70B-Instruct-FP8 (2025-10-29), via kernelspace's snapshot.
- WCAG 2.2 (W3C Recommendation, 2023-10-05): 1.4.1, 1.4.10, 1.4.11, 2.1.1, 2.1.4, 2.2.2, 2.3.1, 2.3.3, 2.4.11, 2.5.7, 2.5.8.
