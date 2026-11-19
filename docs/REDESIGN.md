# enginespace redesign brief: You Are Here

Date: 2026-11-15. Revision 2, after the skeptic's review of revision 1. This is the one brief the team builds. The plan is `docs/waves/wr-tasks.json` (50 tasks, R-T01 to R-T50), and the diagnosis it answers is `docs/waves/WR-diagnosis.md`.

Build it applies to: branch `wave-2` at 727167e.

## How far to trust this

- I read the diagnosis, the three directions, the three judges' scores, revision 1 and the skeptic's review.
- For this revision I checked the skeptic's claims in the worktree. I ran two read-only scripts (the skeptic's session probe and lesson lister) and read the files named below. The worktree was clean before and after.
  - **Predictions.** `packages/play/predictions/plan.ts` answers 17 of 39 predictions from a run. 14 of the 27 lessons have none that a run answers, TR2 lesson 1 among them.
  - **Graded game blocks.** Ten blocks carry `mode: graded`, in eight lessons (the skeptic counted nine). Three of those lessons have no question set.
  - **What the session state holds.** Besides `level.title` and `level.prompt`: the pool's `level.predict.ask` and `.unit`, and the step loop's `level.stages[].title`, `.prompt`, `.prediction.question`, `.unit` and `.options[]`.
  - **First asks.** The pool's `commit` is legal only as the first action (`packages/play/pool/engine.ts:524`). The step loop's five full levels and every Request path level open on a prediction. The four demo levels do not.
  - **The ledger.** Ten event kinds, none for reading. A play ref is `play:<game>/<level>` with no lesson in it. A play event carries the lesson's `rev` when a lesson played it (`src/games/kit/record.ts`). `map.json` holds KCs and prediction refs, and no per-lesson table.
  - **The kitchen layout's importers.** 25 files import `packages/play/loop/layout.ts`, `kitchen.ts` or their `full/` twins, across the 2D views, the 3D scene, the front page and the posters.
  - **Labs.** Titles and leads are in `src/forge/labs.ts`. Check labels are in `packages/sim/forge/*.ts`, which `verify:labs` holds to the crates. The crate header names the file to edit, and `labs/forge/rust-toolchain.toml` pins Rust 1.96.0 and the `wasm32-unknown-unknown` target.
  - **Page and block.** TR5a's lessons define both on purpose: a block is a block of tokens in one group's layers, and a page is the pool's unit, one per block per group (D-045). The prediction's unit is "pages".
- Not done: no build, gate or browser run. Bundle sizes are the diagnosis's W1 figures or a judge's gzip of an existing `dist`, and say so. R-T03 measures them.
- The evidence under all of this is thin in two places. Four of the eight audits are not on disk, and C3 rests mostly on their summaries. No learner was observed by anyone. Section 5.5 is the only real test, and section 6 puts the least evidenced decision (the look) in front of the owner as two built things before anything is deleted.

## What changed in this revision

Each row is one point of the review, what changed and where.

| # | The review said | What changed | Where |
|---|---|---|---|
| U1 | Graded game blocks have no place in the lesson | The third section is **Test**. It holds the question set and every graded game block. Three lessons have a Test that is a graded level alone. TR8 lesson 4 opens on Read | 2.5 |
| U2 | Hoisting every game above the prose makes cold first runs | P3 no longer hoists by rule. Each lesson has one of three openers, tabled for all 27. A vocabulary test (R-T12) and the cold test check the first run | 2.1, 2.5, 5.5 |
| U3 | The brief only hides the 22 locks | W2-T43 is in this wave as R-T09, ahead of every content task. A prediction is revealed after its run or at commit. The reference lesson is TR5a lesson 1, whose prediction a run answers | 2.5, R-T09, R-T10 |
| U4 | `nextStep` cannot be derived as specified | Rewritten: what "done" means with no read event, how an event maps to a lesson, the compiler table R-T06 writes, and a bookmark that is not progress | 2.4 |
| U5 | P2 leaves no "next level" and no plain "next lesson" | The word Continue is reserved for `nextStep`. Local ways on are named for their target. One table says which control is amber | 2.4 |
| U6 | Lab titles, check labels and crates have no engine name and no owner | Titles tabled. R-T26 owns `src/forge/labs.ts`, the check labels in `packages/sim/forge`, and the crates' prose | 2.7, 4, R-T26 |
| U7 | Prediction reveal and wait sentences have no owner | R-T09 owns `packages/play/predictions/*` | R-T09 |
| U8 | The banned list would fail on ordinary words, and misses the pool's terms | Two lists: words banned everywhere, and phrases banned in the kitchen sense with allowed contexts. The pool's conversation, shared system prompt and cost are tabled | 2.7 |
| U9 | New collisions: Key and Keys, check and question, step and step | The object list is **Parts**, the shortcut list is **Keyboard**. An item is a **question** everywhere. A lesson has **sections**. "Step" means the engine's step only | 2.7 |
| U10 | One prediction can still be asked three times | A table of same-quantity pairs (R-T09). At most two prompts before a run's first move. "Say it first" is removed | 2.5 |
| U11 | The lab page never says what to edit | R-T26 takes the file, the command and the target from the crate header, the labs gate and the toolchain file, and a test holds them | 3.9, R-T26 |
| U12 | Nothing checks "delightful", and the owner sees the result only at the end | A look gate after stage 2 shows the owner two builds. The felt moments are a keep-list in e2e. The cold test asks three delight questions | 5.4, 6, 8 |
| U13 | Repeated questions, no legend for provenance words, "No picture yet" | A set never repeats a stem. Every stamp opens the tag legend. The Games index is a list with no picture boxes | 2.4, 3.8 |
| K1 | The state-hash guard moves only title and prompt | R-T02 moves every display string, by a list of paths, and checks that no action carries display text | R-T02 |
| K2 | "The pool has no prediction action" is false | Corrected. On the pool the order is parts, look, the level's own guess, then the first move | 2.6, 3.5 |
| K3 | The kitchen layout cannot be deleted where the plan said | Deletion is its own task at the end (R-T44). R-T17 owns the pure lane layouts for demo and full levels | 8 |
| K4 | Dependency holes and unordered pairs sharing files | Fixed. A script checked that every two tasks that share a file are ordered and that the graph has no cycle | 8 |
| K5 | The dock and popover are built for one game | Each game task owns its dock view and parts table against one interface. The reference screen is now the pool | 2.6, 3.4 |
| K6 | The intro is scripted for level 1 only | The parts list is per level. The pointed first move is the reference run's first action. Parts already met are not shown again | 2.6 |
| K7 | Two L tasks had no screen spec | Specs added for the step loop's full levels and for Request path. Request path goes to opus | 3.6, 3.7 |
| K8 | Front page: seven amber marks, two instruction lists, a goal that prints the answer, no parts at 390 | Callouts are ink. One instruction source. No guess on demo level 1. The phone steps through the parts in the coach line | 3.1 |
| K9 | No short-viewport rule, 81 focus popovers, focus ring like the button edge | Nothing is sticky under 600 px of height. Marks open on activation. The focus ring is ink | 2.8, 5.2 |
| K10 | Only the front page had a measured budget | R-T03 measures every route class first. Each pattern task has an allowance and a cut order. The intro and parts table are lazy chunks | 4 |
| K11 | "KV block pool" fights 500 uses of "page" | Reverted to **KV page pool**. Block keeps its lesson meaning | 2.2, 2.7 |
| K12 | "Part credit" was mapped to the wrong thing | Attempts and skills have separate words. A practice pass reads "passed in practice" | 2.4 |
| K13 | Reordered prose is only checked for structure | 17 lessons move a game, not 26. Each gets an order-word scan and a second reader | 2.5, 8 |
| K14 | Thin evidence, and models that differ from D-036 | Said above. D-068 records the model choice | 6 |
| Style | Replacing The Pass is the least evidenced decision | The decision stands, and is staged: names, spine, lesson and frame land first under the current look, Data Book lands on four screens, the owner compares, and the kitchen is deleted last | 1, 6, 8 |

---

## 1. The decision in ten lines

1. **Thesis.** The learner is lost because the site makes them translate and gives them no path. So every object carries the engine's own name, every page shows one way on, a lesson starts with a run wherever that run can succeed cold, and the picture on screen is the engine's own diagram.
2. **Direction.** You Are Here (two of three judges), with Live Trace's live dock and source popover and One More Step's role line and replay reasons grafted on.
3. **Visual world: replace The Pass** with **Data Book**: the engine drawn as engineers already draw it (timing diagrams, page maps, distribution bars, latency plots) on flat paper, with one amber mark that means "now". Data Book is a look. It names nothing on screen.
4. **Why replace, and how the risk is held.** The owner's complaint names metaphors as well as names. Once the engine term names everything, the kitchen survives as one scene among nine games, and it is the first thing a new learner must decode. Against that, the diagnosis says the look is not a cause and three audits call the kitchen scene a delight. So the look is built in a stage of its own, the owner compares two builds at a gate, and nothing of the kitchen is deleted before it.
5. **Naming policy.** The engine's term is the only name of anything the learner reads, chooses, presses or is graded on. No kitchen word survives in rendered text, alt text, spoken lines, the Markdown export or the lab crates' prose. Ids, routes, ledger refs and code identifiers do not change.
6. **Lesson format.** One scrolling page in up to four sections, nothing collapsed and nothing locked: Run, Read, Test, Keep. A lesson opens on a run only where a cold reader can finish it. Every prediction can be committed and gets a reveal.
7. **The learner's path.** One function, `nextStep`, answers "what next" for every page. It shows as Continue in the header, as the amber button where a page has no move in hand, and as a sentence: "Last time you ... Next: ...".
8. **Game onboarding.** One frame for every game, with a role line and a goal line that carries its number. The first run names the parts on the live diagram, lets the learner look or move, and only then asks for a guess.
9. **Feedback.** The thing touched answers where it was touched, the change travels to the number, a rule is named the first time it is felt, and the reference run is drawn under the learner's own.
10. **Reward.** True statements only: the rail filling with your own answers, "you will be able to" becoming "you can", your best against the reference, and "kept" growing in Review. No points, streaks, badges or confetti.

---

## 2. The design contract

### 2.1 Principles

Seven, each with the test that holds it.

| # | Principle | Test |
|---|---|---|
| P1 | **The engine's name is the name.** One term, one meaning, course-wide. | The copy guard (section 2.7) finds no banned word or phrase in any rendered route (text, `alt`, `aria-label`, live-region lines), in the compiled lessons, the Markdown export, `llms.txt`, the item stems over the test seeds, or the lab crates' prose. |
| P2 | **One way on.** | Every control labelled Continue or Start has the `href` that `nextStep` returns for the same events. No other control uses those words. Each viewport has at most one amber-filled control, chosen by the table in section 2.4. A grep finds no other derivation of "next". |
| P3 | **Do first, where the doing can succeed.** | Each built lesson's opener equals its row in section 2.5's table (`tests/content/openers.test.ts`). Opener A: at most 60 words before the run, and its first control inside the first viewport at 1440 x 900. Opener B: at most 200 words, and the instrument's top edge inside the first viewport. Opener C: the first part ends in something to do, within 450 words. On a module page the lesson list starts within 700 px. |
| P4 | **Name, then ask.** | No game shows a prediction before its parts list has been on screen. Every level shows a goal line with an aim, what the learner controls, the number to beat or the pass rule, and when it ends. Every engine term in an opener level's controls and prompts appears in its parts list or the lesson's setup. The scripted first run of each game finishes in under 60 s. |
| P5 | **Action, state and result share one screen.** | At 1440 x 900 and 390 x 844, the diagram's current region, the current control and the readout are inside the viewport without page scroll, at the start of a level and at its result. A list of options may scroll inside the dock. |
| P6 | **Provenance is present and quiet.** | No bordered chip sits inside a sentence. An instrument, a table or a figure carries at most one stamp, and every stamp opens the tag legend. `verify:numbers` and `verify:claims` still pass, so nothing was dropped. |
| P7 | **The picture is the engine's own diagram, and amber means now.** | At the wave's end no file imports `src/scene/props`. Amber appears only on the carriers of section 2.8. For the step loop, a tick has the same x in the 2D diagram and in the 3D scene's Side camera (a layout test). |

### 2.2 Where the judges, the directions and the review disagreed, and what is decided

| Question | Decision | Why |
|---|---|---|
| Which direction | You Are Here as the spine | The owner's complaint is being lost. It is the direction built around always knowing what a thing is and what to do next. |
| Keep, evolve or replace The Pass | Replace, decided at a look gate on two built things | Section 1, line 4. One More Step's "evolve" keeps a kitchen on the first screen and two visual languages. The review is right that this is the least evidenced call, so it is the one the owner sees built before it is final. |
| Game first, in every lesson | No. Three openers, chosen per lesson | The review is right: 14 tiles and 4 decoys after 60 words is a guessing game. A run opens a lesson only where it can be finished from what the screen says. |
| Collapsed accordion, or a scroll | A scroll, nothing collapsed | Judge 1 wanted prose that can be scanned and searched. Judge 3 named the accordion as the riskiest renderer change. |
| Thumbnail of the run, or a live dock | A live dock from 80rem | A second view of the same run state (D-018), so it needs no schema change. |
| Doto for readouts | Dropped, with Handjet and Permanent Marker | It is the face behind the "full0" run-on. Numbers go in Atkinson Hyperlegible Mono, tabular. Role names stay. |
| Rename token roles | No. Role names stay and values change | Keeps `verify:tokens` and every component's structure. |
| Move before guess | Only where the session allows it | The demo levels of the step loop have no prediction, so the first move is real. Every other built level's first ask is its prediction (required, or legal only first), so there the learner looks first and guesses second. No rule changes. |
| Front page: time into depth, or flat | The 2D timing diagram at first paint. On a capable desktop it tilts into 3D after LCP with time still left to right | Judge 1 found time into depth harder to read. Judge 2's point that the side camera is the 2D diagram becomes the opening shot. |
| Request path in 3D | Cut, at the last stage | Three audits found the room barely shows the path. |
| "KV page pool" or "KV block pool" | **KV page pool** | Revision 1 chose "block" for vLLM's `BlockPool`. The lessons define the pool's unit as a page (D-045), say it about 150 times, and the item families about 370. The game follows the lessons, and its parts list says once that vLLM's class is `BlockPool`. |
| Predictions with no run | Fix them in this wave | A lock is the hardest block on the site. R-T09 gives each a reveal. |
| Pacing: a gate rule, or a warning | A compiler warning and an ordinary `bun test` | No gate may be added or raised. |
| Split long lessons | Not here | The built lessons claim 21 to 110 minutes. Splitting is the author's call. The rail shows minutes by section. |
| Sound, scrubbing a run | Not in this wave | No audit finding behind either. |

### 2.3 Information architecture

Routes do not change. Labels do.

| Route | Label | What it is for |
|---|---|---|
| `/` | (home) | First visit: run the step loop by hand in a minute, then start the course. Returning: where you left off, and Continue. |
| `/map` | Course | The path. Every module in order, what each needs, your state in words, and the way on. |
| `/m/:module` | (module title) | Start or continue the module. Its lessons first, then what you will be able to do, its game, lab and review rows, then reference. |
| `/m/:module/:lesson` | (lesson title) | One lesson in up to four sections. |
| `/play` | Games | Every game by its engine name, with its levels marked practice or graded and with the learner's best attempt in words. |
| `/play/:game` | (game title) | One game at full size, any level. |
| `/labs/:lab` | (lab title, as "Build ...") | A numbered procedure: download, edit the named file, build, drop the file, the checks. |
| `/trace-room`, `/trace-room/:trace` | Traces | The trace viewer and the list of pinned and synthetic traces. Reached from Games and from TR3. |
| `/today` | Review | What is due, on new numbers. |
| `/evidence` | Progress | What you did, as dated rows in words, then counts, export and import. |
| `/receipts` | GPU lab results | Issue a challenge, import a receipt. Reached from a GPU lab and from Progress. "Receipt" stays as the name of the grader's file. |
| `/settings` | Settings | 3D, tier cap, reduced motion, game keys. |
| `/about` | About | What the course is, what each model leaves out (each card in full), how numbers are tagged, privacy. |
| `/changes` | Sources and changes | Pins, claims and what moved. |
| `/design` | (not linked from the learner's chrome) | The design system's specimens, for builders. |
| `*` | Page not found | One sentence and Continue. |

- **Header:** wordmark, then Course, Games, Review, Progress, then **Continue** at the right. On a phone the links sit behind a button labelled "Navigation".
- **Footer:** About, Sources and changes, Settings.
- **Breadcrumbs** use titles: "Course / TR2 The step loop / Lesson 1 of 7". An id such as "tr2.l1" is never shown as a title. A KC is shown as its sentence.

### 2.4 The way on

**Three things, kept apart.**

| Thing | Where it lives | What it is |
|---|---|---|
| Evidence | the ledger | What the learner did that wrote an event: a prediction, a run, a question, a lab check, a review. Progress and "done" are read from this alone. |
| The bookmark | `localStorage`, `es:here` | The lesson, section and part last in view. A lesson page writes it when a part's heading has been in view for two seconds, and on any action. It is a place, not progress. It is never shown as an achievement, and deleting it loses the place only. |
| The pointer | `localStorage`, `es:next` | A copy of `nextStep`'s last answer, so the header and the front page can label Continue without opening IndexedDB (D-038, D-051). Every page that opens the ledger rewrites it. |

Both keys are read inside `try`/`catch`. They need a record that extends D-051 (D-066).

**What the compiler writes.** `map.json` gains a `lessons` table (R-T06 owns the compiler change). For each lesson, in page order:

```
{ route, title, minutes, needs, opener: "run" | "primer" | "read",
  run:         ["play:pool/one-group", ...]     // the opener's game blocks
  inline:      ["play:loop/graphs", ...]        // practice game blocks inside Read
  predicts:    ["predict:tr5a.l1#tr5a.l1.p1", ...]
  checkpoints: [{ family, count }]
  test:        { questions: [{ family, count }], graded: ["play:pool/evict", ...] } }
```

**What "done" means.** Reading writes no event, so reading is never done or not done.

| Section | State, from events |
|---|---|
| Run | Done when a play event exists for each opener ref. |
| Read | No state. The rail marks the parts seen on this visit and the bookmark's part. |
| Test | Passed when the last `count` attempts at each question family were right at full weight, and each graded ref has a passing graded run. Tried when any attempt exists. |
| Keep | No state. |
| The lesson | Not started, started, or **done**. Done is "Test passed". Every lesson has a Test: all 27 built lessons do, it is an authoring rule, and the compiler warns on one that does not. |

**Which lesson an event belongs to.** A predict ref names its lesson. A play or item event belongs to the lessons whose table lists its ref or family. Where several do (`loop/graphs` in TR2 lessons 5 and 6, `broken-bench/court` in TR8 lessons 3 and 4), it belongs to the one whose current `rev` equals the event's `rev`. If none matches (an older `rev`, or a run on `/play`), it counts as evidence for each of them, because the learner did run that level. For "last worked on", such an event goes to the bookmark's lesson if that is one of them, and otherwise to the earliest of them that is not done.

**The function.** `nextStep(events, lessons, bookmark)` in `src/progress/next.ts`, pure and tested. It returns `{ href, label, minutes, needs, reason, skipped }`.

1. No events and no bookmark: the first section of the first published lesson (today TR1 lesson 1).
2. `current` is the lesson last worked on: the later of the most recent event and the bookmark.
3. If `current` is not done, the answer is inside it:
   - its Run, if it has an opener and Run is not done;
   - else the bookmark's part, if the bookmark is in `current`;
   - else the first part of Read, if no Test attempt exists (label: "read why, then 3 questions");
   - else its Test.
4. If `current` is done: the next lesson **after it** in course order that is not done. A learner who finishes lesson 5 out of order is offered lesson 6, not lesson 2. `skipped` counts the lessons before the target that are not done, and Course shows it as one quiet line: "2 earlier lessons not finished".
5. Nothing left after `current`: the first lesson in course order that is not done. If none, Review when something is due, else Course.

Reviews due never replace the answer. They show beside it as a second, quiet line: "3 reviews due, about 4 min".

**Three kinds of onward control.**

| Kind | Label | Where |
|---|---|---|
| **Continue** (it is `nextStep`) | "Continue: TR2 lesson 1, read why" or, with no events, "Start: TR1 lesson 1" | The header, always, as an outline button. In content: the top of Course, of a module, of Review and of Progress, every empty state, the end of a review session, the foot of a lesson whose Test is passed, the front page after the demo. |
| **The move in hand** | The control's own verb: Step, Admit, Commit, Check answer | Inside a run or a question. |
| **A local way on** | It names its target and never says Continue: "Read why", "Next part: The gap, and its name", "Next level: Refill a freed slot", "Run again", "New numbers", "Next: lesson 6, Dispatch keys", "Go to the 3 questions" | Inside a lesson, at a level's result, between demo levels. |

**Which control is amber.** One amber fill per viewport, by this order:

1. The move in hand, while a run or a question waits for it.
2. In a lesson, the way to this page's next section. After a run: "Read why". At a part's end: the next part. In Keep with Test passed: "Next: lesson N+1", which is `nextStep`. In Keep with Test not passed: "Go to the 3 questions", with "Next: lesson N+1" beside it as an outline.
3. At a result on `/play/:game` or in the front-page demo: "Next level: ...". "Continue the course: ..." sits beside it as an outline. After the last demo level the amber button is "Start the course".
4. Otherwise Continue.

**Progress told back.** At the top of Course and of a module: "Last time: you ran KV page pool, One KV group (passed in practice) and tried 3 questions in TR5a lesson 1. Next: retry the questions, about 5 min." It is a reading of ledger events (`lastTime(events, lessons)`), and stores nothing.

**Words for state.** Two small vocabularies, each with one legend line wherever its words appear.

| For | Words | Meaning |
|---|---|---|
| A skill (`KC_STATES`: `none`, `practised`, `earned`, `kept`) | not started · tried · passed · kept | Tried: you answered or played, and have not passed on new numbers. Passed: a question set on new numbers, or a graded level, gave credit. Kept: passed again in Review, 30 days or more later. |
| One attempt | not yet · passed in practice · passed | A practice pass is a pass at part weight (`partial` in `src/progress/derive.ts`). It is said as what it is, and the legend says it does not count toward a skill. |
| A lesson | not started · started · done | Done is "Test passed". |

"Practised", "earned", "credited" and "part credit" leave the screen. Every level shows "practice" or "graded" as a word.

**Verdict words.** "Passed", "Not yet" or "Finished (practice)", chosen from the grade's own data, then the sentence that says why.

**Provenance words.** Measured, derived, estimated, synthetic, and "unverified" in the alert colour. Every stamp is a button that opens one legend: four lines, one per word. The same legend is on About as "How numbers are tagged". A count of the learner's own events carries no tag.

**No build-log words in learner copy.** No task, decision or wave id, no SHA, no document section, no "arriving with W2". An unbuilt thing says "Not published yet".

**A question set never repeats itself.** When a draw gives a stem already in the set, the set takes the next seed. Keys and grading do not change.

### 2.5 The lesson template

A lesson is one scrolling page. Every word is in the DOM and visible, so find-in-page, anchors and the Markdown export keep working. A pure function, `groupSections(blocks)` in `src/content/render/sections.ts`, derives the sections from the blocks. No front-matter key and no block type is added.

**Sections**

| Section | Holds | Derived from |
|---|---|---|
| **Run** | The setup or the primer, the guesses this run answers, the instrument at full content width, then the debrief. Two adjacent opener blocks play one after the other. | The game blocks before the first `##`. A lesson whose first game sits after its first `##`, or that has none, has no Run section. |
| **Read** | The prose, one part per `##`, with its figures and code. Practice game blocks render where they sit as "Run: <level title>". A guess with a reveal sits where it was written. An `item` block before the last heading is a checkpoint. | Everything from the first `##` to the Test. |
| **Test** | The lead-in, the question set on new numbers, and each graded level under the label "Graded level", with its pass rule before the run. | The file's last `##` part when it holds an `item` block or a `mode: graded` game block. Every graded block belongs here. |
| **Keep** | What to carry (the lesson's KC sentences), the Build row if there is a lab, the lesson record, the way on. | Generated. |

The Test's tally reads "3 of 3: passed" or "1 of 3: not yet. New numbers when you retry." A graded level's row reads "Passed on 1 of 3 new scenarios".

**The ten graded game blocks, all in Test**

| Lesson | Graded level | Question set |
|---|---|---|
| TR1 lesson 7 | Request path, `map` (moved below its last heading by R-T35) | 3 |
| TR2 lesson 6 | Step loop, `close` | 3 |
| TR5a lesson 3 | KV page pool, `evict` | 3 |
| TR5a lesson 4 | KV page pool, `adapters` and `manager` | 3 |
| TR6 lesson 2 | Rejection sampler, `exact` | none: the rail reads "Test · graded level" |
| TR8 lesson 1 | Broken benchmark, `due` | none |
| TR8 lesson 2 | Broken benchmark, `warm` and `sure` | none |
| TR8 lesson 4 | Broken benchmark, `court` | 3 |

**Openers.** A lesson opens in one of three ways. The opener is read from the file's shape, and a test holds each lesson to its row.

| Opener | Shape in the file | On the page |
|---|---|---|
| **A. Run first** | At most 60 words, then guesses and the game, before the first `##` | The setup states the question in the engine's words and does not explain the answer. The instrument's first control is in the first viewport. |
| **B. Primer, then run** | 61 to 200 words, then guesses and the game, before the first `##` | The words render under the fixed label "Before you run": the three to six facts the level needs, as a list or a small table, taken from the lesson's own prose. No new claim. |
| **C. Read first** | The first game is after the first `##`, or there is none | The lesson opens on Read. Its first part ends in something to do within 450 words: a guess with a reveal, or a one-question checkpoint. Its runs sit where the author put them. |

| Lesson | Opener | First level | Why |
|---|---|---|---|
| TR1 l1 Five mechanisms | B | Request path `nano` | 14 stages and 4 decoys. The primer gives the five mechanisms and that nano-vllm is one process. |
| TR1 l2 nano-vllm in one sitting | C | `nano-tp`, in part 6 | A code reading. The level needs the reading. |
| TR1 l3, l4, l5, l6 | B | `mini`, `inside`, `vllm`, `sglang` | The game is known by now. The primer names the engine's processes and what is new. |
| TR1 l7 Abort inside the engine | B | `abort` | As above. `map` is the Test. |
| TR2 l1 One step, five calls | A | Step loop `first-3-gap` | A front-page demo level, built to be played cold. |
| TR2 l2 One token budget | C | `first-2-slot`, in part 3 | The level teaches slot refill, not the budget (section 9). It must not open the lesson. |
| TR2 l3 Async scheduling closes the bubble | A | `first-4-par`, then `async` | A demo level. |
| TR2 l4 The MRV2 delta | B | `mrv2` | A full level with cost cards. The primer says what the two runners move. |
| TR2 l5, l6, l7 | C | `graphs`, `close`; none in l7 | The levels sit deep in the reading on purpose. |
| TR5a l1 Why one model needs several KV caches | A | KV page pool `one-group`, then `two-kinds` | Level 1, with the first-run intro. |
| TR5a l2, l3, l4 | B | `same-size`, `evict`, `adapters` | The primer states the one new rule. |
| TR6 l1 Where speculation lives | C | Rejection sampler `chain`, in part 5 | The first meeting with this game, mid-lesson. The intro runs there. |
| TR6 l2 The rejection sampler, exactly | A | `overlap` | Bars to look at and rounds to draw. |
| TR6 l3 Testing exactness | B | `mutants` | The primer restates the accept rule under test. |
| TR6 l4, l5 | C | `greedy-ngram`; Step loop `mask` | Deep in the reading. |
| TR8 l1 Due time, not send time | B | Broken benchmark `due` (practice) | The primer defines due time and send time. |
| TR8 l2 Warm-up, samples and an interval | C | `warm`, in part 3 | |
| TR8 l3 The tools' defaults | B | `court` (practice) | 178 words precede it today. |
| TR8 l4 Replay in time | C | none before the Test | |

That is 4 A, 13 B and 10 C. Seventeen lessons put a run in the first screen or two. Ten open on reading that now has a thing to do at the end of its first part, has no inlined model card, and has a rail.

**Predictions.** A lesson's `predict` block is a **guess**, and every guess gets a reveal (R-T09 brings W2-T43 into this wave).

| Kind | `reveal` | How many | Where it sits | The reveal |
|---|---|---|---|---|
| Guess, then run | `after-game` | 18: today's 17, and TR2 lesson 1's, reworded onto its level's ticks | In the guess slot of the instrument whose run answers it. If that run is further down, where it was written, and after commit it says "Locked in. The run in part 4 answers it." | In that run's debrief: the guess beside the model's answer. |
| Guess, then reveal | `at-commit` (a new value of the schema's reveal enum) | 21 | Where it was written, in Read | At once: the guess, the answer, and the working. The answer is computed from the question's own numbers by the lesson's demo function, or read from the claim the question is about. |

- The level's own opening prediction belongs to the instrument and is labelled "The level's opening guess".
- `packages/play/predictions/same.ts` (R-T09) lists the pairs where a lesson's guess and the level's opening guess ask for the same quantity. For those, one prompt writes the `predict` event and dispatches the session's commit with the same value.
- At most two prompts come before a run's first move. A third guess waits in Read.
- After commit: "Locked in: 300 pages, think so. It does not change now." The confidence picker stays.
- "Say it first" is removed. A row that R-T09 cannot give a reveal keeps a plain **question to hold** (the stem, no input, no lock, no task id), and each such row has a record.

**Frame**

- **Head.** Breadcrumb in titles. The title in sentence case. One promise line built from the lesson's KC sentences in `map.json`: "After this you can say how many pages a request holds in each KV group. 95 min, in the browser." One quiet line: "Builds on kernelspace T5.L5, T5.L4". The metadata receipt is gone. "Status: review" is not shown.
- **Rail** (left, sticky, from 64rem). The sections this lesson has, each with its state and the learner's own answers ("you said 300 pages", "recomputed 93 tokens, reference 93"). Under Read: its parts by title, with inline runs as entries. The minutes left. The current section under the amber mark with the word "now". It is a `nav` with an ordered list, and the current entry carries `aria-current="step"`.
- **Below 64rem** the rail is a 44 px sticky strip under the header ("Lesson 1 · Read 2 of 6" over a segmented bar; a tap opens the list), and a 56 px sticky bar at the foot carries the amber control. `scroll-padding` matches both.
- **Dock** (right, sticky, from 80rem wide and 44rem tall). A compact, live 2D view of the learner's most recent run in this lesson: the diagram, the readout, and Step, Undo and Reset in practice. It reads the same run state as the instrument. Before any run it shows the level's opening state. In an opener C lesson it is empty until the first run and says "Your run appears here". Below 80rem there is no dock and no sheet: a "Back to my run" link returns to the instrument.
- **Short viewports.** Under 600 px of height (a phone on its side, or 400% zoom) nothing is sticky: the strip, the foot bar and the dock flow with the page.

**The lesson record** closes Keep: lines in the mono face that can be copied as text. "TR5a lesson 1 · guess 300 pages (think so), model 260 · KV page pool: recomputed 93 tokens, reference 93 · questions 3 of 3 passed · review in 2 days". It is a reading of ledger events and stores nothing.

**Block by block.** The eight block types and the compiler's parsing do not change (D-016).

| Block | Becomes |
|---|---|
| prose | Parts of Read at a 66ch measure. A claim is a small numbered mark after its phrase. The mark is a link to its entry under "Sources" at the lesson's end, and on activation (click, Enter or Space, never on focus alone) it opens a popover with the value, the tag word, the source, the file and symbol, and the date checked. A tagged number carries a dotted underline and its tag as hidden text for a screen reader. It is not a tab stop. Code blocks scroll sideways with a visible cue. A table may break out of the measure. |
| `predict` | A guess, as tabled above. |
| `game`, practice, in the opener | The Run section. It opens in 2D inside a lesson, with 3D one switch away. One live 3D scene per page, as now. |
| `game`, practice, later | An inline "Run: <level title>" in the same frame. The dock follows the most recent run. |
| `game`, graded | A graded level in Test. |
| `item` | The question set in Test, or a checkpoint in Read. Feedback keeps its shape exactly: you wrote, the key, you said, why. Radios are drawn as radios. Buttons say "Check answer" and "Next question". |
| `figure` | In its part, at the column's width, captioned with the sentence it proves, drawn in the six-colour code. With the optional `replay` field (R-T45, a stretch) it gains "Show on the machine". |
| `card`, notional-machine | One line in the instrument's title block: "Model of the KV page pool: one pool, pages of one size, no network · What this model leaves out", which opens the full card in a panel. Never inlined. This removes about 14,400 px from every lesson at 1440 [diagnosis]. |
| `card`, warning | An inline note headed "Watch out", with a drawn mark, ink text and no coloured side stripe. |
| `card`, isomorphism | An inline note, "The same idea in the OS", with "where it breaks". This is the one sanctioned home of an analogy, and it points from what this learner knows. |
| `card`, in-production | "In vLLM today", at the end of the debrief. |
| `card`, build-this, and `lab` | The Build row in Keep: the lab's name, what it needs, the checks this lesson prepares, "Open lab". |
| `trace` | A Run-style block that uses the trace viewer in the same frame. |
| next | Keep's way on. |

**Authoring rules** (for the content tasks and for every W2 lesson):

1. Choose the opener by one question: can a reader who has finished the earlier lessons finish this level from its parts list, its goal line and at most 200 words? If yes, A or B. If no, C.
2. A setup states the question. A primer states facts the level needs. Neither explains the answer.
3. A part aims for 600 words or fewer between two things the learner does. A C lesson's first part ends in one.
4. Graded game blocks and the question set close the file, under its last `##`. Every lesson has a Test.
5. No kitchen sentence, no build-log id.
6. After moving a block, re-read the prose for words that assume the old order ("above", "below", "you just", "the level that follows").
7. Moving blocks changes a lesson's `rev`, so earlier evidence for it shows "re-check". Nothing is lost.
8. Open every Read on what the reader just ran or, where there is no Run, on what the last lesson left them unable to do. A back-reference to kernelspace comes after that.
9. A module's first lesson names three or four things to ask of every later lesson. Each later lesson carries one small plain table of them, after its Run: what changed since the last lesson and what did not, where "unchanged" is a legal cell. No new block type. A module whose lessons are separate subjects says so and carries no table unless the owner asks.
10. A table that sets two times side by side has a column for what else changed and a column for the bound the numbers are read against. A cell the course has no number for is a dash. In prose, the sentence that makes a comparison names what else differs.
11. Where a module has one relation at its centre, write it once, in at most a line, as a `text` block, and keep its words in later lessons, goal lines and question stems. The owner settles "bubble" against "CPU gap" before TR3's form is written (policies 1 and 5 below).
12. Four sentence rules: say what the lesson's change does not buy yet; say that an arbitrary number is arbitrary, in the next sentence; one fact to a sentence with the point first and each claim mark after its own sentence, save a number the sentence needs; do not list in prose what a table can carry.

Rules 8 to 12 were added on 2026-11-18, for lessons written from that day on, after a reading of an outside book on GPU kernel programming; `content/README.md` carries them with an example each and the book's name. They have no compiler warning.

### 2.6 The game shell: one instrument frame

Every game, on the front page, in a lesson and on `/play/:game`, sits in the same frame.

**Parts of the frame, top to bottom**

1. **Title strip.** The game's title, its role line ("You are the scheduler."), a **level menu** as one control ("Level 2 of 9 · Refill a freed slot · practice"), the view switch (Diagram, 3D), **Parts**, **How to play**, **Keyboard**.
2. **Goal line**, always visible, one sentence in three parts: the aim, what you control, and the number to beat or the pass rule, then when the level ends. "Goal: serve all 15 requests and recompute as few tokens as you can. You choose which request to admit and which page to evict. The reference's cost is the number to beat. Ends when all 15 are served."
3. **Diagram.** 2D or 3D. Directly under it, the **legend**: the colour and glyph code for the states drawn.
4. **Dock.** Beside the diagram at desktop width, pinned to the foot on a phone that is at least 700 px tall. It holds, in turn: the parts list during the intro, the guess slot, the current decision's controls, the **readout strip** (three to five numbers in the mono face, with one stamp for the strip), and the result.
5. **Title block.** One quiet line: what this is a model of, its clock, and "What this model leaves out".
6. **State as a table.** A disclosure under the diagram that holds the DOM mirror, unchanged and always in the DOM (D-018).

**What each game gives the frame.** One interface, so the lesson's dock and the popover work for all five: `{ Diagram2D, DockView, parts, moments, firstMove }`. `DockView` is the compact 2D view. `parts` is the table of drawn objects: an id, the engine name, one sentence, the levels it appears on, and the claim that sources it. The parts list and the popover read the same rows, in `packages/play/<game>/copy.ts`.

**Role lines** (from PRODUCT.md's positioning):

| Game | Role line |
|---|---|
| Step loop | You are the scheduler. |
| Request path | You trace one request. |
| KV page pool | You are the KV allocator. |
| Rejection sampler | You are the verifier. |
| Broken benchmark | You audit a benchmark. |

**The first run, under a minute.** Laid on the live diagram. Not a modal: nothing is disabled, focus is not trapped, Escape and "Skip intro" end it at any point. It is a lazy chunk, loaded when it shows.

1. **What you are looking at.** Up to five numbered callouts on the diagram's objects, as ink discs. The same lines are an ordered list in the dock. That list is the parts list, and **Parts** reopens it at any time.
2. **Look, or move.** Where the session has no prediction to ask first, the learner makes one real move, and the amber ring sits on its control. Elsewhere the learner selects one part and reads its popover, which holds what the guess needs.
3. **The level's first ask**, phrased with the nouns just used. "Skip the guess" sits beside Commit only where the session allows a skip, and where it does not, the dock says why. Then the first move is pointed at.

| Game | The session's first ask | Order of the first run |
|---|---|---|
| Step loop, the four demo levels | none | parts, first move (a session action), play. A view-only guess appears on demo level 3. It is stored nowhere. |
| Step loop, the five full levels | the stage's prediction, required | parts, look at the cost card's row, the prediction, play |
| Request path | the prediction, required | parts, look at one stage in the stage list, the prediction, lay the first stage |
| KV page pool | `commit`, optional, legal only as the first action | parts, look at request 1, the level's guess (Commit or Skip, and either one uses the chance), then Admit is pointed at |
| Rejection sampler | the level's own ask (a prediction on `overlap` and `chain`) | parts, look at one token's bars, the ask, play |
| Broken benchmark | the report | parts, flip the "Latency from" switch (a view change that files nothing), the report form with its range rule |

- **The pointed first move** is the first action of the level's reference run, so it exists for every level and is always legal. Its sentence comes from the action kind's row in `copy.ts`.
- **On any level.** The parts list shows the parts drawn on that level. The intro flag (`es:intro`) keeps the part ids already shown, per game. Parts not yet met come first. When every part has been met, the intro does not open by itself. So a learner who meets the sampler at `chain` gets the whole intro there, and one who played the demo gets one new line at `first-3-gap`.
- **Before the pool's guess**, a waiting request's row shows its tokens and its prefix, and not its page count, which is the answer.
- The intro shows when the ledger holds no `play` event for the game and the flag does not cover the level's parts. "How to play" replays it. On the front page, which never opens the ledger, only the flag is read. Under reduced motion nothing pulses.

**Levels begin and end out loud.**
- A level that opens mid-run says so in its first line: "This run starts at step 2, with 8 tokens already out."
- A change of decision is announced in the dock, with the amber ring on the candidates: "New decision: the pool is full. Choose one cached page to evict." In practice each option shows its cost before the choice. In a graded level it does not, as today, and the dock says so.
- The end condition is in the goal line, and the dock says when it is met.
- A graded level states its pass rule before the run, tolerance included. Broken benchmark shows its range rule before filing.

**Feedback**
- The thing touched answers where it was touched, within 120 ms.
- The change travels to the number: the readout steps to its new value and a delta ("+4 tokens", "idle +3 ticks") sits beside it for one second.
- **Named moments.** The first time a rule is felt in a level it is named once, beside the object: "That gap is a bubble: the GPU waited 3 ticks for the CPU." One table of named moments per game.
- **Touch a part, get its source.** Selecting a slab, page, bar or stage opens a popover: its engine name (as code when it is an identifier), one sentence, its value with its tag, and the file and symbol at the pinned commit as a link out. A part with no engine source says "model object". The source table is a lazy chunk.
- **You against the reference, drawn.** When a run ends, the reference run appears as a hollow outline under the learner's own, on the same axis.
- **The reveal.** The guess's pin and the result's pin land on one number line.

**The debrief** keeps its shape, because it is the best thing on the site: the verdict word, one plain sentence that names the engine term in bold, your guess beside the model's answer, yours against the reference, "In vLLM today", the source file and symbol, and one amber control. It is a component of its own, so a lesson can place it under the instrument and the game page inside the dock.

**A reason to run again.** "1 token short of the reference." Your best per level, read from the ledger's play events. "Run again" and "New numbers" are local ways on. The amber control at a result follows section 2.4's table. A front-page run still earns and stores nothing (D-038).

### 2.7 Naming and glossary policy

**Policy**

1. The engine's term is the only name. Its source is, in order: the pinned engine's code and docs, the paper, kernelspace. Where the course's own lessons define a term (page, bubble, ghost token), the games use the lessons' term. Where vLLM and SGLang differ, vLLM's term leads and SGLang's follows in brackets once per page.
2. An identifier is set as code and spelled as the pinned source spells it (`scheduler.schedule()`, `max_num_seqs`).
3. Where the course coins a term, its first use on a page says so in one clause.
4. One term, one meaning. A request is a request everywhere. A module is a module.
5. There is no glossary of a mapping, because there is no second vocabulary. Each instrument has a parts list. A term's definition comes from one table, `src/copy/terms.ts`.
6. Kitchen words survive only in a history table in GAMES.md §2.6 and in decision records.
7. **Ids do not change**: game ids, level ids, actions, enum values inside state (`plate`), ledger refs, KCs, claims, routes, file names, lab ids, a crate's file names, Rust identifiers, wire commands and wasm exports. Where an identifier is a kitchen-era word (`Rotation`, `src/rotation.rs`), the prose beside it says once what it is.
8. The roster keeps two fields, so `verify:games` still finds a display name and a different subtitle.

**Games**

| Id | Was | Title | Subtitle (the rule in one line) |
|---|---|---|---|
| `loop` | Service | **Step loop** | Keep every slot live, and never make the GPU wait for the CPU. |
| `engine-floor` | Back of House | **Request path** | Every queue, IPC hop, copy and sync between the API server and the GPU. |
| `pool` | The Reach-In | **KV page pool** | One page pool serves every KV group and every adapter. |
| `verifier` | The Tasting | **Rejection sampler** | Accept with min(1, p/q), resample from (p - q)+, and the output is exactly p. |
| `broken-bench` | The Inspection | **Broken benchmark** | Latency counts from when a request was due. |
| `shape-shifter` | Sheet Pan | **Tensor views** | A view relabels the buffer. A copy moves every element. |
| `gap-hunt` | The Tape | **Trace attribution** | Every nanosecond of a step belongs to a kernel, a copy, a CPU gap or idle. |
| `dispatch` | Line Check | **Backend dispatch** | The first attention backend that meets every requirement takes the call. |
| `switchyard` | The Dumbwaiter | **KV offload** | A page in transit cannot be read, and every move is published as an event. |

**Labs.** A lab's title says what the learner builds, so it cannot be mistaken for a game.

| Id | Was | Title |
|---|---|---|
| `toy` | The Rotation | **Build an LRU free queue** (the practice lab) |
| `rejection-sampler` | Keep or Re-plate | **Build the rejection sampler** |
| `hybrid-kv` | The Reach-In Manager | **Build a hybrid KV cache manager** |

**Levels.** Default titles. R-T04 checks each against its level's rule in GAMES.md and may adjust a wording, never the policy.

| Game | Level id | Was | Becomes |
|---|---|---|---|
| Step loop | `first-1-fill` | Fill the rail | Fill the batch |
| | `first-2-slot` | A clip empties | Refill a freed slot (continuous batching) |
| | `first-3-gap` | Mind the gap | The GPU waits: overlap the CPU work (async scheduling) |
| | `first-4-par` | Your turn | Both levers, against the reference |
| | `async` | Write during the fire | Async scheduling on two cost cards |
| | `graphs` | Drilled routines | CUDA graphs: launches against replay |
| | `graphs` · `comb` | The comb | Eager launches against graph replay |
| | `graphs` · `sizes` | The mold rack | Capture sizes and padding |
| | `graphs` · `modes` | The modes | Graph modes |
| | `mrv2` | The V2 runner | The V2 model runner |
| | `mask` | The allergy card | The grammar mask inside a step |
| | `close` | Close the bubbles | Every lever, on new numbers |
| KV page pool | `one-group` | One station | One KV group |
| | `two-kinds` | Two kinds of station | Full attention and a sliding window |
| | `evict` | Dump the right pans | Choose what to evict |
| | `same-size` | One pan size | One page size for every group |
| | `state` | A station of state | A state group |
| | `adapters` | Recipe kits | LoRA adapters in the same pool |
| | `manager` | The whole manager | The whole manager |
| Rejection sampler | `overlap` | What the chef keeps | Acceptance rate: the overlap of p and q |
| | `exact` | Make it exact | Resample from the residual |
| | `chain` | A run of plates | Tokens per round with γ drafts |
| | `greedy-ngram` | The favourite and the copier | Greedy target, n-gram draft |
| | `mutants` | Five rules to audit | Five broken accept rules |
| | `gamma` | How far ahead | Choose γ |
| Request path | `nano`, `nano-tp`, `mini`, `inside`, `vllm`, `sglang` | (engine names already) | unchanged |
| | `abort` | vLLM, the client leaves | vLLM: the client disconnects |
| | `map` | The lifecycle map | Map the request path |
| Broken benchmark | `due` | From the due time | Coordinated omission |
| | `warm` | The warm-up cut | Where to cut the warm-up |
| | `sure` | How sure | An interval on p99 |
| | `court` | The court | Five mixed reports |

**Objects, actions and places: every in-world name, and what the screen says instead**

| In-world name | The screen says |
|---|---|
| ticket; order; guest (a request) | request |
| ticket (a module, a review item, an exit check) | module; question; question |
| hanging a ticket | admit (a request) |
| tickets curling out of the printer; the printer | waiting queue |
| the rail | running batch |
| a clip on the rail; clip paid for, empty | batch slot; empty slot (a wasted slot-step) |
| the fired rail; the second rail | the step in flight (with async scheduling on) |
| a fire; the bell; ring the bell | a step; Step |
| the line; the stations; lit | GPU lane; forward; busy |
| the expo; the expediter; the expo's lane; the pass | CPU lane (the engine core thread) |
| writing the call; reading the plates back | `schedule`, `prepare`, `launch`; `sync`, `sample` |
| stations dark; dark stretch | bubble (the course's word: the GPU idle while the CPU prepares the next step) |
| firing the rail as a set | static batching |
| the next call, written during this fire | async scheduling (overlap); the "Async scheduling" switch |
| plate; course; dish (an output token) | output token |
| binned plate | ghost token (the course's word: computed, then discarded) |
| empty place; open groove | empty slot |
| calling each dish; the comb | eager kernel launches |
| one word; a drilled routine | CUDA graph replay |
| the mold rack; a mold; empty mold place | capture sizes; a captured size; padding |
| the allergy card | grammar mask (structured output) |
| a set menu | a `max_tokens` stop |
| hotel pan; pan; the reach-in | KV page; KV page pool |
| a station's code; station (a KV group) | KV group |
| table (the pool: "table A · 1/3") | conversation ("conversation A · turn 1 of 3"): requests that share a growing prefix |
| standing order | shared system prompt (a prefix that several conversations open with) |
| price (of a run, of an eviction) | cost: recomputed tokens plus weighted waits for an adapter |
| hold window | sliding window |
| the rotation | free queue (eviction order) |
| a labelled pan; a bare pan | cached page; free page |
| recipe kit | LoRA adapter |
| shared mise; mise | prefix hit; cached KV |
| dumping a pan; "Dump the pans" | evict; "Evict" |
| pulling a ticket | preempt |
| re-prep | recompute |
| the house; the house run; par | reference run; the reference |
| the night | run |
| the host stand | API server |
| the dining room | client |
| floors of the house; a floor | processes; a process |
| pairs of hands | threads |
| a spike | queue |
| the ticket window | IPC |
| the window shelf | shared memory |
| the dumbwaiter, down and up | host-to-device copy; device-to-host copy |
| "Heard!" | sync (a blocking wait on the GPU) |
| twin cooks; passing halves across | tensor-parallel ranks; a collective |
| hand-off cards; the tray | stages; stage list |
| writing the order in shorthand; naming each plate | tokenize; detokenize |
| two houses' floor plans | two engines' paths, side by side |
| the cooler; the basement; the sister kitchen | CPU tier; disk tier; peer |
| the dumbwaiter's car | a page in transit |
| pan calls | KV events |
| the commis; the commis's plates | draft model (proposer); draft tokens, q |
| the chef; the chef's tasting | target model; target distribution, p |
| keeping a commis plate; the coins | accept, with probability min(1, p/q); the probability mass |
| re-plating; the recipe | resample from the residual (p - q)+; residual weights |
| a run of plates | γ draft tokens |
| the favourite and the copier | greedy target; n-gram draft |
| walk-ins | open loop |
| a fixed set of tables | closed loop |
| the inspector's stopwatch | coordinated omission |
| the clipboard; the ruling; the court | report form; verdict; graded set |
| which station's equipment takes the dish | backend dispatch |
| sheet pan; portion; bench row; twine; relabel; re-plate | tensor; element; buffer; stride order; view; copy |
| the night's tape | trace |
| First service; the full service | the demo; TR2's levels |
| the menu; the specials; on the board | Course; Games; (removed) |
| prep list; start the prep; check the ticket; next ticket | review set; Start review; Check answer; Next question |
| the Order Window; chit | GPU lab results; challenge |
| the Mirror | Progress |
| START SERVICE | (removed: the instrument is live at first paint) |
| Well fired; The ruling falls | Passed; Not yet |
| Over the shoulder; Side of the pass; Under the lamps | Along time; Side; Top |

**The product's own words, one meaning each**

| Word | Means | Not |
|---|---|---|
| step | the engine's step, and the Step button | a part of a lesson |
| section | Run, Read, Test or Keep. The word is rarely printed: the rail shows the four names | |
| part | one `##` piece of Read | |
| question | one item, in a lesson and in Review | "check", "ticket" |
| Test | a lesson's third section | "Check", "exit check" |
| checks | a lab's automated checks (the crates' own word) | |
| Parts | the list of objects drawn on a diagram | "Key" |
| Keyboard | the list of shortcuts | "Keys" |
| legend | the colour and glyph code under a diagram; also the one-line key to state words and to tags | |
| guess | a prediction, in the learner's copy | |
| diagram | what an instrument draws | "board" |

**The copy guard.** Data in `src/copy/banned.ts`, read by `tests/copy/no-kitchen.test.ts` and by the e2e scan. It checks rendered text and the compiled sources of rendered text, never raw source files, so ids and enum values are untouched. Code spans are skipped. Paths not yet converted sit in `tests/copy/allow/`, one file per area, and each task deletes the file for the area it clears.

- **Words banned everywhere** (whole word, any case): allergy, basement, bell, binned, burner, chef, chit, clip, clips, clipboard, comb, commis, cook, cooks, cooler, copier, court, dish, dishes, dumbwaiter, expediter, expo, fire, fired, fires, firing, fryer, griddle, groove, guest, guests, inspector, kitchen, lamp, lamps, mise, mold, molds, oven, ovens, pan, pans, par, plate, plated, plates, printer, rail, reach-in, recipe, re-plate, re-plating, ruling, specials, station, stations, stopwatch, stove, tape, tasting, ticket, tickets, tray, twine, walk-in, walk-ins.
- **Phrases banned in the kitchen sense**, with what stays allowed:

| Banned | Allowed |
|---|---|
| "the pass", "at the pass", "The Pass" | pass, passed, passes at, forward pass, pass rule |
| "the line ·", "on the line", "the line's", "line cook" | every other "line" |
| "the house", "house run", "two houses" | |
| "a floor", "floors of", "floor plan" | noise floor |
| "table A" (any capital), "each table", "a table's", "set of tables" | block table, "as a table", "the table below" |
| "standing order", "Order Window", "the order was taken", "writing the order" | in order, eviction order, stride order |
| "ticket window", "window shelf", "hold window" | sliding window, context window |
| "First service", "the full service", "START SERVICE", "serve the night" | serving, served |
| "each course", "a course takes", "per course", "courses out" | the course, Course |
| "on the board" | |
| "the menu", "set menu" | |
| "the night", "a night" | |
| "dark stretch", "go dark" | |
| "hang a", "it hangs", "hung on the" | |
| "dump the", "dumps the", "dumping a" | core dump |
| "a spike", "the spike" | latency spike, traffic spike, load spike |
| "prep list", "re-prep", "start the prep" | |
| "the Mirror" | |
| "Heard!" | |

The guard cannot catch a kitchen sentence that uses none of these ("while the room warms up"). Each content task ends with a second reader, and W3-T13's copy audit reads every lesson again.

### 2.8 The visual system: changes to DESIGN.md and `src/design`

DESIGN.md's North Star becomes "Data Book": the engine's own data book, printed on flat paper, with one amber mark. Token role names stay. DESIGN.md's front matter moves with `tokens.ts` in the same change (a test holds them together), and its body is rewritten at the finish from the built world.

Stage 1 of the plan builds the new components on the current token values, so they work under either look. Stage 2 changes the values, the faces and the old components' drawing.

**Palette roles**

| Role | Now | Becomes | Use |
|---|---|---|---|
| `surface-0` | #ccd1d4 under a brushed texture | **#e9ece6, flat** | the page |
| `surface-1` | #dde1e4 | #f4f5f0 | the header, instrument frames |
| `surface-2` | #b2b9be | #d9ddd4 | a well, an empty slot, a pressed control, the 3D base plate |
| `surface-3` | #59616a | #2b3138 | the footer, a selected tab; paper-white text on it |
| `paper` | #fafaf6 | unchanged | everything read; every diagram |
| `paper-rule` | #bcb9b1 | #c2c8bd | the graticule inside diagrams and figures, never the only carrier |
| `edge` | #5f666d | unchanged | hairlines, control borders, dimension lines |
| `text-1`, `text-2`, `text-3`, `paper-ink` | | unchanged | text. `text-1` is also the focus ring |
| `paper-ink-2` | #a30f1a | unchanged | errors, "Not yet", "unverified". No longer a primary action's colour |
| `lamp` | #ffb547 | unchanged; documented as **the marker** | now |
| `lamp-ring` | #9a3d00 | unchanged; the marker's edge | |
| `cat-*`, six fills with edges | | unchanged | the one colour code |
| `tape`, `tape-ink`, `glint`, `light-fluorescent` | | **retired** | |

Contrast on the new values [my arithmetic; `verify:tokens` is the judge]: `text-1` on the ground 14.75:1, `text-3` on the ground 6.63:1, `text-3` on `surface-2` 5.74:1, `edge` on the ground 4.88:1, paper on `surface-3` 12.55:1, `text-1` on the marker 10.02:1, the marker's edge on paper 6.60:1 and on the marker 3.93:1. The marker on paper is 1.68:1, so amber never carries anything alone: it always comes with its edge, a shape and a word.

**The one colour code**, shown in every diagram's legend:

| Colour, glyph | Always means |
|---|---|
| blue, circle | CPU work; a page in use; the target p |
| green, hexagon | GPU work; a page shared by a prefix hit; the accepted overlap min(p, q) |
| yellow, diamond | a sync; a cached page; the draft q |
| red, triangle | evicted; the residual (p - q)+; a violation |
| white, hollow ring | idle; free; observed |
| brown, square | a copy between host and GPU; an adapter's page |

**Named rules** (replace DESIGN.md's)

- **The One Marker Rule.** Amber means now. It has three carriers and no others. (1) The control to act on now: one amber-filled button per viewport, chosen by section 2.4, or one amber ring on the control an intro points at. (2) The "now" cursor on a diagram, a 2 px line with the word "now". (3) The current-position mark in the rail and on the course track. The header's Continue is an outline. Intro callouts are ink discs, not amber. (`tests/design/one-lamp.test.ts` becomes the test of this rule.)
- **The Ink Focus Rule.** The focus ring is 3 px of `text-1` at a 2 px offset, with a paper halo. It is never amber, so focus is not mistaken for "now", and it reads against the amber button's own edge.
- **The Colour Is State Rule.** A code colour appears only where the model's state is drawn, and always with its glyph or hatch.
- **The Flat Paper Rule.** No texture anywhere. One shadow for a sheet and one for a popover. Paper is cut square.
- **The Quiet Provenance Rule.** One stamp per instrument, table or figure. A tag inside prose is a dotted underline.
- **The Moves On Step Rule.** Things move on an action and are still between actions. One authored moment per instrument.
- **The Short Viewport Rule.** Under 600 px of viewport height nothing is sticky or pinned.
- **The Words Are DOM, Declared Pair and Ramp Rules** stand as written.

**Type.** Three faces, down from five.

| Role | Face | Rule |
|---|---|---|
| `display`, `heading` | Big Shoulders Display 800 | Page, lesson and game titles only. **Sentence case, never transformed to upper case**, so `vLLM`, `SGLang` and `v0.33.0` keep their casing. Page title clamp(2rem, 1.2rem + 3.4vw, 3.5rem), line-height 1.0. |
| section heads | Atkinson Hyperlegible 700 | 1.5rem and 1.25rem, sentence case |
| `body` | Atkinson Hyperlegible 400 | 1.0625rem on 1.6; 66ch measure |
| buttons, labels, lane and axis names | Atkinson Hyperlegible 700 | sentence case, 0.8125rem to 1rem. A button says what it does: "Step", "Check answer", "Start: TR1 lesson 1". |
| `mono` | Atkinson Hyperlegible Mono | code and identifiers |
| `numeric`, `ticket` | **re-pointed to** Atkinson Hyperlegible Mono, tabular, falling back to Atkinson Hyperlegible for µ and ± | every number the learner compares |
| `label` | **re-pointed to** Atkinson Hyperlegible 700 | |

Doto, Handjet and Permanent Marker leave `public/fonts/`, `fonts.json`, `fonts.css` and NOTICE. This supersedes D-050's faces.

**Spacing and shape.** The spacing scale stays. Radii: paper 0, small parts 2 px, controls 3 px. The `shoulder` and `pan` radii are retired with their components. Shadows: `paper` for a sheet and `lift` for a popover. `plate`, `press`, `shelf` and the ticket-sheet filter go. A pressed control is a `surface-2` fill.

**Materials**

- **Paper**: flat, square, with the soft sheet shadow. Lessons, sheets, diagrams.
- **The graticule**: faint lines in `paper-rule`, 8 px minor and 40 px major, only inside diagrams and figures, where it is the time axis or the cell grid.
- **Ink**: lanes, slabs, cells and bars in the code colours, each with its glyph or hatch. An idle stretch is a dashed hollow box.
- **Dimension lines**: an interval is marked with end ticks and its value, as in an engineering drawing: "bubble 764 µs".
- **The marker**: amber with its dark edge.
- **The stamp**: a small bordered word for provenance.
- **The title block**: one quiet line that says what a drawing is.
- **3D is a model of the same diagram**: matte, flat-shaded solids in the code colours on a pale base plate engraved with the graticule, each on a soft contact shadow, lit by one directional light and a hemisphere. Idle and empty are dashed wire outlines. The "now" cursor is a thin amber sheet and the only thing that glows. No steel, environment map, lamps, haze, bloom or steam. Every word and number stays DOM.

**Motion.** 120 ms for the hand, 240 ms for a step, 640 ms for the one authored moment. The printer's stepped feed is retired. A readout changes at once and shows its delta for one second. No scroll-triggered entrances. Every duration is 0 under reduced motion and the state is drawn at its end.

**Components**

| Now | Becomes |
|---|---|
| Ticket | Sheet: a plain paper panel with a title, no hole, no torn edge, no foot line of ids |
| Stub | Primary button: amber fill, `text-1` label, 2 px marker edge, 44 px or taller |
| Button (plate, ink, quiet) | Button (outline, ink, quiet): flat, 1 px edge, 3 px radius |
| PrinterTape | Readout strip |
| Readout | Readout, in the mono face, with a delta slot |
| TapeLabel | Label (plain) and Stamp (provenance, opens the tag legend) |
| Rail (the rod and clips) | removed; SectionRail is new and unrelated |
| Bell, Pan, StationLight, PrintingDots | removed. A KV page is a square cell with its glyph. Loading is a line of text. |
| Board, kick-plate | Header, Footer |
| Toggle | Switch: flat track, the state as a word, no pilot lamp |
| Field | Field: paper slip, 2 px foot line, plain label |
| new (stage 1) | Marker, Callout, PartsList, Legend, Note, Popover, Stamp, TitleBlock, SectionRail, LevelMenu, GoalLine, DeltaChip, NumberLine, NextStep |

Components keep their file and export names until R-T46, a mechanical rename, so the pattern tasks do not churn 400 files.

### 2.9 What happens to each 3D scene

| Game | 2D | 3D | Default view |
|---|---|---|---|
| Step loop | **Rebuilt** as a timing diagram: a waiting-queue row, then lanes over time. On the demo levels the GPU lane is one row per batch slot, and each slot's label holds the request in it. A "now" cursor. | **Rebuilt** from the specimen's time track with no kitchen props, as a new scene file beside the kitchen scene. Cameras: **Side** (exactly the 2D diagram), **Lifted** (Side, tilted, so slots recede and time still runs left to right; the opening shot), **Along time**, **Top**, **Compare** (static batching, continuous batching and async scheduling stacked, so the gaps visibly close), **Scale** (4 slots to 64, one step to a thousand). | 3D Lifted on the front page and `/play/loop` on a capable desktop. 2D in lessons and on phones. |
| KV page pool | **Kept**, relabelled: the page grid, its legend, the free queue, the running batch. | **Re-skinned** from kit primitives: a rack of page cells. A selected page fans into the layers it serves, and threads run from a request's block table to its pages. | 2D |
| Rejection sampler | **Kept**, relabelled: the p and q bars, with "target p", "draft q", "accepted min(p, q)", "residual (p - q)+". The six "dishes" become tokens 0 to 5. | **Re-skinned** as skylines: one row per draft position into depth, and the output skyline settling onto p. | 2D |
| Request path | **Re-framed**: the swimlane that today appears only in the debrief becomes the play surface (section 3.6). | **Cut.** `Scene3D.tsx` and its `scene-*.ts` files leave the tree. | 2D only |
| Broken benchmark | **Kept**. The switch and the report form move beside the chart they change. | none, as now | 2D only |

- **What this gives up.** The diagnosis lists "the Service kitchen as an image of a batch" under what must survive, and three audits call that scene a delight. The timing diagram shows the same things without words (slots, a CPU side, a GPU side, and idle as dashed boxes), and it is the picture this learner will read in a profiler. Whether it is as good a first sight is a judgment, and the look gate is where the owner makes it.
- **Until the look gate**, the kitchen scene, `src/scene/props` and the kitchen layout stay in the tree, untouched and working. The pool's and the sampler's re-skins, the Request path cut and every deletion come after the gate (stage 4).
- Each scene's closure must come in under its unchanged 40 KB gate. R-T03 measures how much room dropping the props chunk frees before any scene is rebuilt.

---

## 3. Screens

Common geometry.
- **1440 x 900:** header y 0 to 56. Side margins 48 px, so content runs x 48 to 1392 (1,344 wide).
- **390 x 844:** header y 0 to 48. Gutters 16 px, so content is 358 wide. No page ever scrolls sideways.
- Sample words and numbers are illustrative. Each level prints its own numbers.

### 3.1 Front page

**1440 x 900, first visit**

- **Header.** Wordmark at x 48. Course, Games, Review, Progress from x 220. At the right, an outline button: "Start: TR1 lesson 1".
- **Left column, x 48 to 488.** It holds no procedure. The instrument's goal line and coach strip are the only instructions on the page.
  - y 104 to 296: the h1 in Big Shoulders 800 at 64 px, three lines: "Run one step of an LLM inference engine."
  - y 320 to 416: one paragraph at 18 px / 1.5: "enginespace is a course on the internals of vLLM and SGLang, for engineers who finished kernelspace's serving track. You run each mechanism, read the code that implements it, then prove it on a real GPU."
  - y 448: one line at 18 px: "The panel on the right is live. It takes about a minute."
  - y 496: one quiet line at 15 px: the module range and the hours by lane, from the course index.
  - y 544: a text link, "Skip the demo and see the course".
- **The instrument, x 536 to 1392, y 80 to 860**, a paper sheet.
  - y 80 to 128, title strip: "Step loop", "You are the scheduler.", "Demo 1 of 4 · Fill the batch". At the right: Diagram | 3D, Parts.
  - y 128 to 176, goal line: "Goal: fill the four batch slots, then run one step. You choose which waiting request goes in which slot. Ends after 1 step." It does not say how many tokens come out.
  - y 192 to 248, **Waiting queue**: a 164 px label column, then six chips, R1 to R6, each 64 x 48. R1 carries the amber ring.
  - y 264 to 600, **the lanes**, on the graticule. A 164 px label column (x 552 to 716), then the time track (x 716 to 1376) with an axis in ticks, 0 to 28, labelled "synthetic ticks". Rows: "CPU · engine core thread" (56 px, blue, circle), then "slot 1" to "slot 4" (44 px each, green, hexagon). Each slot's label cell is a dashed box that reads "empty" until a request sits in it. The "now" line stands at tick 0. A step draws its slabs here, and a gap on the GPU rows is a dashed box labelled "idle".
  - y 616 to 664, readout strip: one "synthetic" stamp, then STEP 0 · TOKENS OUT 0 · GPU BUSY 0 · GPU IDLE 0.
  - y 680 to 828, dock. At the left: Step, 160 x 56, an outline that reads "fill a slot first" until a slot holds a request, then the amber-filled button. Undo and Auto-step are quiet. At the right, x 960 to 1376: the coach strip. On a first visit it holds the parts list's five lines, then "Put R1 in a slot." After each step it holds the result sentence.
  - y 836 to 860, title block: "Model of the step loop · synthetic ticks, not a measurement · What this model leaves out".
  - **Callouts:** five 24 px ink discs with a paper numeral: 1 on the waiting queue, 2 on the slot labels, 3 on the CPU row's label, 4 on the GPU rows' labels, 5 on Step.
  - **Amber at first paint:** the ring on R1 and the 2 px "now" line. No amber fill until a slot is filled.
- **No guess on demo level 1.** Its payoff is the named moment after the first step: "A step costs the GPU about the same for one request as for four. That is batching." The first guess is on demo level 3, in the view only: "Async scheduling is off. Of the next 7 ticks, for how many is the GPU busy?"
- **After each demo level:** the dock holds its result sentence, the amber "Next demo level: Refill a freed slot", and beside it the outline "Start the course: TR1 lesson 1 (35 min, browser only)".
- **After the fourth:** one sentence and one amber button. "You just ran the step loop by hand. The course starts one layer out, by following one request through the engine (TR1), then comes back to this loop with a real clock (TR2)." "Start the course: TR1 lesson 1, Five mechanisms (35 min, browser only)".
- **After LCP** on a capable desktop the lanes' box becomes the 3D scene at the Lifted camera, in the same box, with the same left-to-right time axis. The strips, the dock and the callouts are DOM and do not move.
- **Below the fold**, plain HTML, about one more screen: "What you will be able to do" (the four outcomes), "The path" (one row per module, the first marked "Start here"), "How credit works" (three lines), and the same Start button.
- **Returning:** the left column reads "You left off in TR2 lesson 1, at the questions." with an amber "Continue" button, from the pointer. The instrument opens on the demo as before, with no intro.

**390 x 844, first visit**

- y 0 to 48: header. Wordmark, a compact outline "Start", the Navigation button.
- y 64 to 140: the h1 at 36 px, two lines.
- y 152 to 200: two lines at 16 px: "A course on vLLM and SGLang internals, for kernelspace graduates. Try the first mechanism here."
- y 216 to 760: the instrument, 358 wide.
  - y 216 to 256: "Step loop · demo 1 of 4", Parts.
  - y 256 to 304: the goal line, two lines.
  - y 312 to 356: six request chips, 52 x 44.
  - y 368 to 560: the lanes. A 72 px label column; the CPU row at 36 px and four slot rows at 32 px; the axis. The track scrolls sideways inside its box and keeps "now" in view. Five 20 px ink discs sit on the queue, the slot labels, the two lane labels and Step.
  - y 568 to 616: the readout, two rows.
  - y 624 to 680: Step, full width, 56 px, with Undo beside it.
- y 688 to 752: the coach line. It steps through the parts one at a time: "1 of 5 · Waiting queue: requests not yet in the batch.", with Next and Skip. After the fifth: "Tap R1 to put it in a slot."
- y 764 to 808: "Start the course" as a text link.

The headline, a request to tap, the slots and Step are on the first screen. It opens in 2D and stays in 2D: the time track's 3D scene has no legible layout in a 358 px box, so the view switch is offered from desk width (64rem) only, on this page and on `/play/loop` alike (amended at the finish review, 2026-11-17).

### 3.2 Course (`/map`)

**1440 x 900**

- y 80 to 136: the h1, "Course".
- y 152 to 232: the next-step block, a paper sheet the full width. At the left, the amber position mark and the sentence. First visit: "You have not started. Next: TR1 lesson 1, Five mechanisms (35 min, browser only)." Returning: "Last time: ... Next: ...". At the right, the amber Continue. Under the sentence, quiet, when they apply: "3 reviews due, about 4 min" and "2 earlier lessons not finished".
- y 248 to 280: one line of hours in all and by lane, then the legend line: "not started · started · done" for lessons and "tried · passed · kept" for skills. Then one sentence: "Nothing is locked. Prerequisites advise."
- y 296 onward: **one column of module rows**, in course order, joined at the left by a vertical track line with a node per module. The amber mark sits on the node of the module `nextStep` points into.
  - A row, 72 px closed: "TR2 · The step loop · 10 h · browser only", one sentence of what you will be able to do, and its state in words at the right ("2 of 7 lessons done · 2 of 11 skills passed").
  - What a module needs is said outright: "browser only", or "7.5 h in the browser, then 2.5 h on a GPU".
  - **The module you are in is open** and lists its lessons (number, title, minutes, state), the next one under the amber mark.
  - An unpublished module is grey and says "Not published yet". It is not a link.
  - One quiet line per module: "Builds on kernelspace T5.L7, T0.L6".

**390 x 844:** the same order in one column. The next-step block is first, with its button full width (y 120 to 260). Module rows are 88 px closed, with the hours and needs on a second line. The track line and nodes sit in the left 24 px.

### 3.3 A module (`/m/tr2`)

**1440 x 900**

- y 72: breadcrumb, "Course / TR2 The step loop".
- y 96 to 160: the h1, "The step loop", with "TR2 · 10 h · browser only" beside it in secondary text.
- y 176 to 240: two sentences of what and why, at 18 px, x 48 to 848.
- y 256 to 312: the amber button. It is Continue when `nextStep` points into this module: "Continue: lesson 3, Async scheduling closes the bubble (50 min)". Otherwise it is a local way on that names its target: "Open lesson 1, One step, five calls (35 min)".
- y 336 to 700, left column x 48 to 848: **Lessons**, seven rows of 52 px: number, title, minutes, what it needs, state. The next one carries the amber mark.
- y 336 onward, right column x 896 to 1392: **You will be able to**, the outcome sentences. Each gains a drawn tick when its KCs are passed, and the heading reads "You can" for those.
- Under the lessons: four rows, **Game** ("Step loop: 9 levels, 2 passed", linking to the level list), **Build** (the lab), **Prove** (the GPU lab, where there is one), **Keep** (Review).
- Last: **Reference**, four closed disclosures: what the module says about the engines, credit and hours, "What the step-loop model leaves out", sources.

**390 x 844:** breadcrumb, h1 at 32 px, the two sentences, the amber button full width (within y 330), then the lessons at 64 px a row, starting within y 420. Then "You will be able to", the four rows, and Reference.

### 3.4 A lesson (`/m/tr5a/l1-why-one-model-needs-several-kv-caches`)

The reference lesson. Opener A. Its guess is answered by its second run.

**1440 x 900, on arrival**

- **Rail, x 48 to 224,** sticky from y 80: "1 Run", under the amber mark with "now", with two entries under it: "One KV group", "Full attention and a sliding window". "2 Read", with its five part titles in secondary text. "3 Test · 3 questions". "4 Keep". Under a rule: "About 95 min".
- **Content, x 256 to 1392.**
  - y 80: breadcrumb, "Course / TR5a Hybrid KV groups, and adapter pages in one pool / Lesson 1 of 4".
  - y 104 to 200: the title at 44 px, sentence case, up to two lines: "Why one model needs several KV caches".
  - y 212 to 244: the promise line.
  - y 268 to 340: "Run", then the setup, at most 60 words, x 256 to 896.
  - y 356 onward: the instrument, x 256 to 1392 (1,136 wide): the title strip, the goal line, the diagram at 760 wide and the dock at 344 wide beside it, the title block. Its first control is inside the first viewport. On a first meeting with the game, the dock holds the parts list.
  - Under it, after the first run: the debrief, x 256 to 896, with the amber "Next level: Full attention and a sliding window".
  - Then the second run. Its guess slot holds the lesson's guess: "A request holds 4,096 tokens. The model has one full-attention group and two sliding-window groups, with 16 tokens in a block and a 32-token window. How many pages does the request hold across the three groups?" After that run, the debrief shows the guess beside the model's answer and ends in the amber "Read why".

**1440 x 900, mid-way, in Read, part 2 of 5**

- **Rail:** "1 Run" ticked, with "you said 300 pages" and "recomputed 93 tokens, reference 93" under it. "2 Read" under the amber mark: the first part ticked as seen, the second in bold, three to come. "3 Test" and "4 Keep" with hollow rings. "About 70 of 95 min left".
- **Prose, x 256 to 896:** the part's title at 24 px bold, with "Part 2 of 5, about 4 min" in secondary text. Body at 17 px / 1.6. A table of the three group rules that breaks out of the measure, code spans in the mono face, three small numbered marks and no boxes. At the part's end, a checkpoint as radio buttons, with "Check answer". Then the part's amber control: "Next part: ...".
- **Dock, x 928 to 1392,** sticky at y 80, about 560 tall:
  - "Your run · KV page pool · Full attention and a sliding window".
  - The page grid at 464 x 240, in the state the learner left.
  - The readout: prefix-hit tokens · recomputed tokens · evictions.
  - Step, Undo, Reset.
  - A selected page's popover: "KV page", "One page holds one block of 16 tokens for one KV group. vLLM's class is `BlockPool`.", its owner and state, and the file and symbol at the pinned vLLM commit as a link out.
  - The title block.

**390 x 844, mid-way**

- y 0 to 48: header.
- y 48 to 92: the sticky strip: "Lesson 1 · Read 2 of 5" over a four-segment bar. A tap opens the list.
- y 108 onward: the part's title at 22 px, then the text at 17 px, one column 358 wide. A numbered mark opens its source as a popover anchored to the mark, with a close button.
- y 788 to 844: the sticky bar at the foot, "Next part: ...", 56 px, amber.
- No dock and no sheet. A "Back to my run" link sits under each part's title.

**An opener C lesson on arrival** (TR2 lesson 5): the rail reads "1 Read", "2 Test", "3 Keep", with "Run: CUDA graphs" as an entry inside Read. The first screen is the head and the first part. That part ends in the lesson's guess, and after commit: "Locked in. The run in part 4 answers it."

### 3.5 Each game's first run

**The frame at 1440 x 900** (on `/play/:game`; no page scroll)

- y 72 to 144, title strip: breadcrumb "Games / <title>". The title at 40 px with its role line. At x 760 the level menu. At the right: Diagram | 3D (where there is 3D), Parts, How to play, Keyboard.
- y 152 to 200: the goal line.
- y 216 to 760: the diagram, x 48 to 944 (896 wide), paper with the graticule, its legend in one row at its foot.
- y 216 to 760: the dock, x 976 to 1392 (416 wide): the coach strip (y 216 to 392, paper with the marker's edge: "What you are looking at", the parts list, "Next" in amber, "Skip intro" as a text link), then the decision area (y 408 to 600), then the readout strip (y 616 to 760).
- y 776 to 836, foot strip: Undo, Restart level, New numbers; "Practice: fixed numbers, undo allowed"; at the right, the title block and "State as a table".

**The frame at 390 x 844**

- y 48 to 148: the title at 28 px, the level menu as one full-width 44 px control, and a row with Parts, How to play and the view switch. Keyboard is in How to play.
- y 156 to 204: the goal line, two lines, with "more" for the rest.
- y 212 to 556: the diagram, with callout discs on it and its legend in two rows.
- y 568 to 844: the dock, pinned to the foot. In the intro it holds the coach strip, one part at a time. In play it holds the current decision as a row of 44 px controls over one readout line.
- Under 700 px of height the dock is not pinned and follows the diagram.

**Per game: the first level, first visit**

| | Step loop (`first-1-fill`) | Request path (`nano`) | KV page pool (`one-group`) | Rejection sampler (`overlap`) | Broken benchmark (`due`, practice) |
|---|---|---|---|---|---|
| **Goal line** | Fill the four batch slots, then run one step. You choose which waiting request goes in which slot. Ends after 1 step. | Lay the path one sampled token takes out of nano-vllm. You choose the next stage. In practice a wrong stage stops the run and says why. Ends when the token reaches the caller. | Serve all 15 requests and recompute as few tokens as you can. You choose which request to admit and which page to evict. The reference's cost is the number to beat. | Predict how many of 64 draft tokens the target accepts, then draw rounds and watch. You choose how many rounds to draw. Ends when you file your count. | Find what is wrong with this p99 and correct it. You name the flaw and write the corrected p99 with a range. Passes when your range holds the corrected value. |
| **Diagram** | The waiting queue, then the CPU row and four slot rows over ticks | The swimlane of section 3.6, empty, with the request at the top left. Beside it, the stage list. | The pool as 44 page cells in rows of 16, the free queue as a strip, the running batch as three dashed slots. A running request is a ruler with one segment per block. | Two rows of bars over tokens 0 to 5: draft q (yellow, diamond) and target p (blue, circle), with the overlap min(p, q) in green | The latency histogram on a log axis and the request timeline under it, with the switch "Latency from: send time / due time" beside the chart |
| **1. Parts** | 1 Waiting queue. 2 Batch slots: 4. 3 CPU lane: the engine core thread. 4 GPU lane: one forward per step. 5 Step: every live slot gets one token. | 1 The request. 2 Processes: one column each. 3 Stage list: what can happen next. 4 A hop: an arrow with its mechanism. 5 Boundaries crossed: the count you will predict. | 1 Page pool: 44 KV pages. One page holds one block of 16 tokens for one KV group. 2 A page is free, in use, cached or shared by a prefix hit. 3 Waiting requests: admit one each step. 4 Running batch: 3 slots. 5 Cost: recomputed tokens, lower is better. | 1 Draft q: what the draft model proposes. 2 Target p: what must come out. 3 The overlap min(p, q): what is accepted. 4 Rounds drawn. 5 Accepted so far. | 1 The claim: the reported p99. 2 The histogram. 3 The timeline: when each request was due and sent. 4 The switch: where latency counts from. 5 The report form. |
| **2. Look, or move** | Move: put R1 in slot 1 (a session action). "R1 is in slot 1. A slot with a request gets one token per step." | Look: select the stage "tokenize" in the list. Its popover names its mechanism, compute, and the process it runs in. | Look: select request 1 in the waiting list. Its popover: "96 tokens, no cached prefix." | Look: select token 3's bars. The popover reads p, q and min(p, q) for that token. | Move: flip the switch to "due time" (a view change that files nothing). The p99 on the chart moves, and the dashes that mark waiting turn red. |
| **3. The first ask** | None on this level. | "How many process boundaries does one sampled token cross on its way out of nano-vllm?" Required by the session, so there is no skip, and the dock says so. | The level's own guess: "How many pages will request 1 hold, across every KV group, once it is admitted?" Commit, or Skip the guess. Then Admit request 1 carries the ring. | "Of 64 draft tokens, how many does the target accept?" Required before the level is filed. | "Name the flaw, then write the corrected p99 and the range you stand behind." The range rule is printed above the form. |
| **Readout** | step · tokens out · GPU busy · GPU idle | stages laid · boundaries crossed · copies · syncs | prefix-hit tokens · recomputed tokens · evictions · preemptions · served 0 of 15 | rounds · accepted · rejected · acceptance rate | reported p99 · corrected p99 · requests · omitted waits |
| **Named moment** | "A step costs the GPU about the same for one request as for four. That is batching." | "That hop crosses a process boundary: it is IPC, not a function call." | "Request 1 took 6 pages: 96 tokens at 16 a page, in 1 group." Then, on request 2: "A prefix hit: request 2 reuses 2 pages and computes nothing for them." | "The accepted share settles on the overlap of p and q. That is the acceptance rate." | "Coordinated omission: the worst waits never reached the log." |

At 390 the KV page pool draws 16 columns of 20 px cells, so the request and page lists in the dock are the way to select and the grid is the picture, as today.

### 3.6 Request path: the swimlane

The 2D view is rebuilt on what the session's view state already exposes. It shows nothing the current 2D view does not show at the same moment.

**1440 x 900**

- **Diagram, x 48 to 944.** Columns are processes (client, API server, engine core, workers, GPU), each 150 to 170 px wide, with the process name at the head and its threads as thin sub-columns. Time runs down. Each laid stage is a row of 36 px: a node in its column with the stage's name as code, and an arrow from the previous node labelled with its mechanism as a glyph and a word (queue, IPC, copy, sync, compute). The amber cursor sits on the last node. Fourteen rows fit without scrolling. A longer path scrolls inside the diagram and keeps the last six rows and the cursor in view.
- **What is drawn when.** Before the prediction, no column, as in today's 2D view. In practice, the engine's columns once the prediction is committed. In a graded (sealed) run a column appears when the route first reaches it, and the path's length is never shown. A test compares the processes and stages named on the diagram with those the old 2D view named, for the same states.
- **Dock, x 976 to 1392.** The scenario card (engine, pin, features), 96 px. Then "Stages": a row of filter chips, one per process, a type-to-filter field, and a scrolling list of 44 px tiles, six or seven visible, each "queue · `input_queue` (engine core)". Under the list: "Lay stage", "Remove last", and "Run the path" as the amber control once a stage is laid. Then one readout line.
- **A stopped run.** The row that broke is marked with a red triangle and the word "stopped". The dock states the rule in engine terms, "A change of process needs IPC or shared memory. This stage is a queue.", or cites the pinned file and symbol when the stage is not on this engine's path.
- **The graded `map` level.** No undo and no live readout, as today, and the dock says so. The goal line carries the pass rule: "Passes when the whole path is right on its first run, on 3 new scenarios."

**390 x 844.** The diagram is y 212 to 480. Columns are 72 px and scroll sideways inside the box, with the current column in view. The last five rows show. The dock holds the filter chips in one scrolling row, three tiles of the list, a row with "Run the path" and "Remove last", and one readout line. For this game P5 means: the current row, three tiles, the run control and the readout are in the viewport, and the list scrolls inside the dock.

### 3.7 Step loop: the five full levels

`async`, `graphs` (stages `comb`, `sizes`, `modes`), `mrv2`, `close` and `mask` use the same frame and the pure layout `packages/play/loop/full/lanes.ts`. The clock is microseconds on the model's clock.

**1440 x 900**

- **Level menu.** A level with stages shows them: "Level 6 of 9 · CUDA graphs · stage 2 of 3: Capture sizes and padding · practice".
- **Diagram, x 48 to 944.**
  - A 56 px strip at the top: the cost card as one row, by its own name ("70B on H100", "Small model"), with its forward and host times and one stamp. The cards keep their names, because they are claims.
  - The lanes on the graticule, with an axis in µs. A CPU row with `schedule`, `prepare`, `launch`, `sync` and `sample` as labelled slabs. A copy row in brown where the level has host and device copies. One GPU row, "forward", with the batch size on each slab, and under it a thin strip "slots live 48 of 64". On `mask`, a grammar-mask row.
  - Idle on the GPU row is a dashed box with a dimension line: "bubble 764 µs".
  - Eager launches are a comb of thin ticks. A graph replay is one slab labelled "replay, size 8". Padding is a hatch on the padded part of a forward, labelled "padding 3 of 8".
  - The view shows the last three steps at a fixed scale. "Fit run" zooms out to the whole run.
- **Dock, x 976 to 1392.** The stage's prediction first, as the session requires. Then the levers this stage has, each one row: the "Async scheduling" switch, "Graph mode" as radios, capture sizes as a row of toggle buttons, "Runner: V1 | V2". Then Step, Auto and "Run to the end". Then the readout: median TPOT · GPU busy · bubble per step · padding waste · ghost tokens, led by the stage's own metric.
- **At the result** the learner's lanes sit above the reference's hollow outline on one axis, and the debrief names the lever worth the most.
- **The graded `close` level** hides the live readout, as today, says so, and shows its pass rule in the goal line.

**390 x 844.** The lanes scroll sideways inside their box and keep "now" in view. The dock shows one lever group at a time over Step and one readout line, and scrolls inside itself if it must.

### 3.8 Games index (`/play`)

A plain list, with no picture boxes. Each of the nine games is a row: title, role line, the rule in one line, and its levels, each with "practice" or "graded" and the learner's best attempt in words. An unpublished game says "Not published yet". Traces is linked at the foot.

### 3.9 A lab (`/labs/hybrid-kv`)

An ordered list of five steps. The facts come from the crate.

1. **Download the crate.** The file, its size and its hash.
2. **Edit one file.** "`src/manager.rs` is the only file with `TODO(you)`. Do not edit `src/lib.rs`: it is the test harness." The file's name comes from the crate header's "YOU EDIT" line.
3. **Build.** The command that `verify:labs` itself runs for the crate, and one line from the toolchain file: "Rust 1.96.0 with the `wasm32-unknown-unknown` target. `rustup` installs both from `rust-toolchain.toml`."
4. **Drop the `.wasm` here.**
5. **The checks.** Each with its id, its label in engine terms and the bug it catches.

### 3.10 Review (`/today`)

The rules of this page stand: it never counts what is overdue, never scolds, and names a number only as a readout.

**1440 x 900**

- y 80 to 136: the h1, "Review". One line: "What you have passed, brought back before it fades. New numbers every time. Nothing is timed."
- **Nothing passed yet:** one sheet, x 48 to 848. "Nothing to review yet. Review brings back what you have passed: answer a lesson's questions or pass a graded level." Then the amber Continue.
- **Due:** the sheet's head reads "6 questions today, about 8 min", with the amber "Start review". Under it, one row per idea: the KC's sentence, its module, and when it was last seen. At x 896 to 1392, a quiet column: "Next after this: Fri 20 Nov", and "kept" as a count with its legend.
- **In a session:** one question at a time in the question frame, x 48 to 848: "Question 3 of 6", the stem, the answer field, the confidence picker, "Check answer". Feedback as in lessons. The list of the set's questions sits at the right with each one's state as a word.
- **Done:** "5 of 6 right. Next review: Fri 20 Nov." Then the amber Continue, and "Review ahead" as a quiet button.
- **Nothing due:** "Nothing is due today. Your next review is Fri 20 Nov." Then Continue.

**390 x 844:** the same states in one column. The primary button is full width and inside the first screen in every state. In a session, "Check answer" is the sticky bar at the foot.

---

## 4. What is kept, changed and removed in the code

Paths are relative to the repository.

### Kept untouched

- `packages/ledger`, `packages/verify`. `packages/sim`, but for the display strings of the lab checks (below). `packages/schema`, but for one value of the reveal enum, the `lessons` table of the compiled map, and one optional field in R-T45.
- In `packages/play`: every reducer, level definition's numbers, band, score, pass bar, seed, reference run, blind probe and `replay.ts`.
- `scripts/verify*.ts` and every budget in `scripts/verify-bundle.ts`. `tests/bundle/budgets.test.ts`.
- The content compiler's parsing, the eight block types, every claim, pin and KC, and the engine prose.
- The scene kit's machinery: `src/scene/Stage.tsx`, `SceneCanvas.tsx`, `CameraRig.tsx`, `camera-rig.ts`, `tiers.ts`, `governor.ts`, `LabelLayer.tsx`, `SpanInstances.tsx`, `BlockGrid.tsx`, `MarkInstances.tsx`, `SheetInstances.tsx`, `TimeAxis.tsx`, `selection.ts`, `lease.ts`.
- `src/games/kit/useRun.ts`, `useRecorder.ts`, `useGameInput.ts`, `record.ts`, `announcer.ts`, `LiveRegion.tsx`, `MirrorTable.tsx`.
- `src/evidence` (the store, export, import), `src/receipts` (the pipeline), the forge host, workers and invoke protocol, `src/items/today/fsrs.ts` and the scheduling, `src/settings`.
- `src/trace`, which becomes the model for every lane diagram.
- Routes, ids, ledger refs, file names of games, levels and labs, and every identifier in a crate.

### Changed

| Area | Files | Change |
|---|---|---|
| Records and the brief | `docs/DECISIONS.md`, `docs/TRACKER.md`, `AGENTS.md`, `.impeccable/surfaces/src-front-frontpage-tsx.md` | D-062 to D-068; rule 9 ("Look"); a wave R section; the new direction contract |
| Display copy in state | `packages/play/*/levels.ts`, `full/levels.ts`, `*/session.ts`, `*/types.ts`, new `packages/play/<game>/copy.ts` | Every display string leaves the state for a table keyed by level and stage id. Goldens are regenerated once, with a proof that nothing else moved |
| Names | `packages/play/roster.ts`, each `entry.ts`, new `src/copy/terms.ts` and `banned.ts`, `docs/GAMES.md` §0 and §2.6, `docs/ARCHITECTURE.md` §6.1, new `tests/copy/` | Section 2.7 |
| Spine | new `src/progress/next.ts`, `src/progress/derive.ts` (display words only), `scripts/content/build.ts` (the `lessons` table), `src/App.tsx`, `src/routes.tsx` (titles), `src/settings/store.ts` | Section 2.4 |
| Predictions | `packages/play/predictions/*`, `packages/schema/content.ts` (the reveal enum), the `predict` blocks' prompts in `content/modules`, `tests/content/tr*-demos.ts`, `tests/play/predictions.test.ts` | Every prediction gets a reveal. Wait and reveal sentences in engine terms |
| Lesson | `src/pages/Lesson.tsx`, `src/content/render/*`, new `sections.ts`, `Dock.tsx` | Section 2.5 |
| Compiler | `scripts/content/directives.ts`, new `scripts/content/pacing.ts` | Opener and pacing warnings only |
| Game frame | `src/games/kit/GameShell.tsx`, `ViewSwitch.tsx`, `KeysDialog.tsx` (its label), new `Intro.tsx`, `Debrief.tsx`, `PartPopover.tsx`, `RunContext.tsx` | Section 2.6 |
| Tokens and type | `src/design/tokens.ts`, `tokens.css`, `fonts.css`, `base.css`, `components.css`, `specimens.css`, `scene-tokens.ts`, `public/fonts/`, `NOTICE`, `DESIGN.md` (front matter), `tests/design/*` | Section 2.8 |
| Step loop | new `packages/play/loop/lanes.ts` and `full/lanes.ts`, `svg.ts`, `src/games/loop/*`, `src/games/loop/full/*`, `scripts/posters.ts`, `public/posters/` | A lane layout replaces the kitchen drawn through a camera. The 3D time track is a new scene file built from `src/scene/specimen-layout.ts` |
| Front page | `src/front/*`, `src/pages/Front.tsx`, `index.html` | Rebuilt around the instrument, inside the 150 KB and 30 KB gates |
| Pages | `src/pages/*`, `src/map/*`, `src/games/specials/*`, `src/unbuilt/*`, `src/items/**` (views and `copy.ts`), `src/evidence/*View*.tsx`, `src/receipts/*.tsx` (views and `copy.ts`), `src/trace/*` (views) | Sections 2.3, 3.2, 3.3, 3.8, 3.10 |
| Labs | `src/pages/Lab.tsx`, `src/forge/*.tsx`, `src/forge/labs.ts`, `words.ts`, the `label` and `catches` strings in `packages/sim/forge/*.ts`, the prose of `labs/forge/**` (doc comments, READMEs) | Titles, leads, labels and the numbered procedure. No check id, plan, seed, identifier or wire command changes, and `verify:labs` still holds the two sides together |
| Games | `src/games/pool/*`, `src/games/verifier/*`, `src/games/engine-floor/*`, `src/games/broken-bench/*`, and each game's view strings in `packages/play/<game>/` | Frame, copy, first run, dock view, parts table, 2D as default, re-skinned 3D |
| Question copy | `packages/play/items/families/**` | Engine terms. Keys and seeds unchanged |
| Content | `content/modules/*/lessons/*.md`, `content/modules/*/module.md`, `content/cards/*.md`, `content/claims/worlds/`, `public/figures/`, `tests/content/*` | Authoring rules of section 2.5 |
| Tests | about 60 to 100 test and e2e files match kitchen copy [the diagnosis's and the directions' greps; both over-match]; `e2e/screenshots.spec.ts-snapshots/` | Each task updates the tests of what it changes. New baselines need the owner's eye |
| Docs | `DESIGN.md`, `.impeccable/design.json`, `docs/GAMES.md`, `docs/WORLD.md` §7, `docs/ARCHITECTURE.md` §3.3, §6.1, §6.6, `PRODUCT.md`, `README.md` | Written from the built world |

**Generated files.** `public/md/`, `public/llms.txt`, `public/claims.json` and `src/content/generated/` are compiler output. No task merges them by hand: the merge gate recompiles them on the merged tree.

### Removed, at stage 4, after the look gate

- `src/scene/props/` (16 files, about 3,750 lines), `KitchenScene3D.tsx`, `KitchenSpecimen.tsx`, `kitchen-specimen.ts`, `KitchenNote2D.tsx`, `kitchen.css`, `spot-lamps.tsx`, `spot-pools.ts`, `textures.ts`, `environment.ts`, and the lamp parts of `Lights.tsx` and `materials.ts`.
- `packages/play/loop/layout.ts`, `kitchen.ts`, `full/layout.ts`, `full/kitchen.ts`, and the step loop's kitchen scene files, once none of their 25 importers is left.
- `src/games/engine-floor/Scene3D.tsx`, `scene-layout.ts`, `scene-presets.ts`, `scene-props.ts`, `scene-route.ts`, `scene-stops.ts`, `scene3d.css`; `e2e/engine-floor-scene.spec.ts`.
- `src/front/anchors.ts` with its test, and the menu board's drawing. `src/front/menu.ts` stays.
- `src/design/components/Bell.tsx`, `Pan.tsx`, `Rail.tsx`, `StationLight.tsx`, `PrintingDots.tsx`.
- Three font files and their licences from `public/fonts/` (at stage 2, with the look).
- `tests/scene/kitchen.test.ts`, `lamp-light.test.ts`, `props.test.ts`; `e2e/kitchen.spec.ts`.

### Budgets

No gate is raised or added, and no task edits `BUDGETS` or `tests/bundle/budgets.test.ts`. If a row cannot pass without a change to a gate script, the task stops and reports.

**R-T03 measures first.** It writes a budget ledger into the wave report: every route class on `wave-2`, each figure [measured] with its date and SHA. Every later task reports against that ledger.

| Budget | Last known | Allowance in this wave | If it does not fit, cut in this order |
|---|---|---|---|
| Front page JS, 150 KB | 147,337 B [diagnosis, W1] | Must end at or under the gate. The lane layout replaces the kitchen drawing and the landmark code goes | The returning state moves below the fold; the parts list becomes static HTML; demo levels 2 to 4 load with the 3D upgrade; hatches become CSS backgrounds |
| First-paint CSS, 30 KB | 18,635 B [a direction's gzip of the existing dist] | Falls: textures, tape and plates leave | none expected |
| Game routes, 200 KB | 180,381 to 187,702 B [diagnosis, W1] | The frame replaces the shell at no more than +2 KB. The intro and the source table are lazy chunks and add nothing to the route | The number line becomes a text line; the reference outline loads at the result; named moments move into the lazy intro chunk |
| Lesson route, 200 KB | not measured | The rail and popovers at no more than +3 KB, and the claim chips' code leaves. The dock loads with the game chunk | The dock loses its controls and is view-only; then the dock is cut to the "Back to my run" link |
| Each scene, 40 KB | 39,468 to 39,839 B, of which 20,711 B is the shared props chunk [judge 3's gzip] | Schematic scenes from kit primitives, with 30 KB as the target | The Scale camera; then Compare |
| Entry, 110 KB | about 10.8 KB under [a direction's reading of the W1 report] | The header reads one `localStorage` key. `nextStep` loads with the ledger | none expected |

---

## 5. Acceptance: how we will know a learner is no longer lost

### 5.1 The scripted first-visit walk

One Playwright spec, `e2e/first-visit.spec.ts`, runs this walk with an empty ledger at 1440 x 900 and 390 x 844, by pointer and again by keyboard. The same script is the sheet for the human cold test.

| # | Checkpoint | Passes when |
|---|---|---|
| CP1 | Land on `/` | The h1, one waiting request and Step are inside the first viewport. No banned word is in the DOM. One amber ring and no amber fill. |
| CP2 | The parts | At 1440: five ink callouts, each with an engine name, and the same five lines as a list in the dock. At 390: the discs are on the diagram, the coach line shows part 1 of 5, and Parts opens the whole list. |
| CP3 | First move | Activating R1 puts it in slot 1, and the dock names what happened. Step is then the one amber-filled control. |
| CP4 | First step | After Step, the readout shows the tokens out and a sentence that contains "batching" is visible. |
| CP5 | Into the course | The result offers "Next demo level" in amber and "Start the course" beside it. The Start control names TR1 lesson 1, its minutes and what it needs. |
| CP6 | Lesson, first screen (TR1 lesson 1, opener B) | The breadcrumb shows titles. The primer is under "Before you run" and is 200 words or fewer. At 1440 the instrument's top edge is in the first viewport. |
| CP7 | Game, cold | The role line and the goal line are visible before any prediction. The prediction appears only after the parts list. |
| CP8 | Guess and run | No more than two prompts come before the first move. After the run the debrief shows the guess beside the model's answer and one sentence with the engine term. |
| CP9 | Told back | The rail's Run entry shows the learner's own answer. |
| CP10 | Read | One part is in view with its title and "Part n of m". No notional-machine card is inlined. No claim box sits inside a sentence. |
| CP11 | Test | The tally reads "n of 3" with "passed" or "not yet". |
| CP12 | Keep | The lesson record lists what was done. With the Test passed, the one amber control names lesson 2 and equals the header's Continue. |
| CP13 | Course | `/map` opens with a sentence that names what was just done and the same Continue as the header. |
| CP14 | Agreement | The header, `/`, `/map`, `/m/tr1`, `/today` and `/evidence` all give the same Continue. |
| CP15 | Return | After a reload, `/` says where the learner left off and offers Continue to the same place. |
| CP16 | Out of order | Open TR2 lesson 3 directly and run its opener: Continue names TR2 lesson 3. Pass its Test (scripted): Continue names TR2 lesson 4, and Course shows "earlier lessons not finished" as a quiet line. |
| CP17 | A guess with no run | In TR2 lesson 7, the guess can be committed and its reveal shows the answer with its working or its source. No lock, no disabled button and no task id is anywhere on the page. |

### 5.2 Per-screen checks

| Screen | Checks |
|---|---|
| Every route | The header's Continue equals `nextStep`, and so does every control labelled Continue or Start. At most one amber fill per viewport. No banned word or phrase. No build-log id (`W\d-T\d+`, `D-\d+`, `Q-\d+`, a 7 to 40 digit hex SHA outside a source link). No sideways scroll at 320, 360 and 390. Zero serious or critical axe findings. At 844 x 390 and at 320 x 256 (400% zoom) nothing is sticky and no focused control is covered. |
| Front page | LCP element is the h1. The instrument's box is reserved, so CLS stays at or under 0.1. The 3D upgrade does not move a DOM strip. The page's length is at most 2,000 px at 1440 (today 4,116). |
| Course | The first lesson link is within 700 px. Unpublished modules are not links. |
| Module | The lesson list starts within 700 px at 1440 (today 12,113 and 20,512). |
| Lesson | Its opener matches its row. Opener A: first control in the first viewport at 1440. Opener B: the instrument's top edge in the first viewport at 1440, and within two screens at 390. Opener C: something to do within 450 words. TR2 lesson 1 is at most 12,000 px long at 1440 (today 26,253). Find-in-page reaches every word. Focus is never under a sticky bar. Every prediction has a commit control that is enabled. |
| Game | At 1440 x 900 and 390 x 844, the diagram's current region, the current control and the readout are in the viewport at start and at result. The level menu is one control. Every graded level shows its pass rule before the run. |
| Review | The page's copy test still passes: no overdue count, no scolding. |
| Step loop | A tick's x in the 2D layout equals its x in the Side camera's projection, within 1 px. |

### 5.3 Gates that must still pass, unchanged

`npm run lint`, `npm run typecheck`, `bun test`, `npm run build`, and `npm run verify:all`: `verify:content`, `verify:claims`, `verify:numbers`, `verify:kc`, `verify:items`, `verify:games`, `verify:determinism`, `verify:tokens`, `verify:bundle`, `verify:routes`, `verify:boundaries`, `verify:schema`, `verify:vectors`, `verify:pins`, `verify:labs`, `verify:vendor`. Then `npm run e2e`: the a11y, keyboard, reduced-motion, network and performance specs.

Every gate table on the redesign branch holds `wave-2`'s values or stricter.

### 5.4 Delight

The owner's first sentence was that the site does not feel delightful. No script can pass that, so the checks are of two kinds.

**What a script can hold: the moments are kept, and they come early.**

| Check | Passes when |
|---|---|
| The keep-list | e2e reaches each moment the diagnosis lists as felt: the benchmark's p99 moving from 90.1 ms to 5,073.6 ms on the switch; the sampler's draws of 10, 100 and 1,000 settling on 19/32; the pool's eviction with each option's cost and the other requests' shared counts changing; the step loop's idle boxes closing when async scheduling goes on; the debrief's "yours against the reference". |
| Time to the first payoff | From landing on `/`, the first named moment appears within six actions. In each game's scripted first run, its first named moment appears before the run ends. |
| Nothing dead | No screen in the walk shows a disabled primary control with no reason beside it, a lock, or an empty box. |

**What only a person can judge.** Three questions, asked at the look gate and again in the cold test, answered in the reader's own words: "Which of these would you rather spend an hour in?", "Name one moment you would show someone.", "Where did it feel like work with no payoff?" No agent answers them.

### 5.5 The human cold test

The owner, or two or three kernelspace graduates, before the redesign merges to `main`. Agents never simulate it.

1. On each game's first screen, the reader states its goal in engine terms within 15 seconds.
2. In a lesson, the reader's first action comes within 60 seconds.
3. **The reader finishes the first run** of TR1 lesson 1, TR2 lesson 1, TR5a lesson 1, TR6 lesson 2 and TR8 lesson 1 without scrolling into Read. A lesson that fails moves one opener down (A to B, B to C) before the merge.
4. At any checkpoint, asked "what is next?", the reader points at the amber control.
5. The three delight questions.

---

## 6. What the owner should decide, and the default if they do not

The owner said "your call after an audit", and then that they are not sure which style suits this course. So the style is decided here, built in a stage of its own, and shown to the owner as two builds before anything is deleted. Nothing reaches `main` without the owner's merge.

| # | Decision | Default we take |
|---|---|---|
| 1 | **The look: Data Book replaces The Pass** (D-047 is owner-decided; D-062 supersedes it). At the look gate (R-T20) the owner sees the same five screens in two builds: stage 1 (the new names, path, lesson and frame under The Pass) and stage 2 (the same under Data Book). | Data Book. Stage 3, which does not depend on the look, goes on meanwhile. Stage 4, the deletions, starts when the owner answers or when stage 3 has merged, whichever comes first. |
| 2 | **One fewer 3D game.** Request path loses its 3D scene. Three built 3D games remain, and W2 adds two (D-005 asks for "several"). | Cut it, at stage 4. |
| 3 | **Phones open the front page in 2D**, with 3D one tap away. This narrows D-004 and answers O-11 for coarse pointers. | Yes. |
| 4 | **Three faces leave** (Doto, Handjet, Permanent Marker). D-050 is a proposed record. | Drop them, with the look. |
| 5 | **Titles.** "Rejection sampler"; "KV page pool"; "Request path"; labs titled "Build ...". | As tabled in section 2.7. |
| 6 | **Predictions revealed at commit**, from the question's own numbers or from the claim it is about. This is W2-T43's third way, and it relaxes the rule that a reference is read from a run (D-067). A prediction earns no credit. | Take it. Without it, 21 predictions stay questions to hold. |
| 7 | **Lesson edits change `rev`,** so evidence earned since the site went live on 2026-11-09 shows "re-check" for the edited lessons. | Accept it. Nothing is deleted. |
| 8 | **Three keys in `localStorage`**: the pointer, the bookmark and the intro flag (D-066, extending D-051). | Add them. Without them the front page's Continue is a link to Course, and a return lands at the start of a section. |
| 9 | **The human cold test** before the merge to `main`. | The finish review hands the owner the script and a sheet. The merge waits for it. |
| 10 | **Models.** D-036 gives build tasks to sonnet. This plan gives 16 pattern-setting and design-critical tasks to opus and 2 mechanical ones to haiku (D-068). | As planned. Without it, those 16 run on sonnet, each with an opus review before it merges. |

**If the owner chooses The Pass at the gate.** The wave continues from stage 1. Stage 2's token values, faces, 3D time track and front page are not merged. The timing diagram stays as the step loop's 2D view. The kitchen stays as the step loop's 3D scene only, with engine words on every label, under the six conditions of the diagnosis's section 3. The pool and the sampler keep their current 3D behind the switch, with 2D as the default. Sections 2.8 and 2.9 are replaced by a one-page amendment under D-047, and stage 4 shrinks to R-T43, R-T45 and R-T46.

Two things the owner will be asked to look at, by existing rules: the re-shot screenshot baselines, and the finish review's verdict.

---

## 7. How the W2 and W3 work still in the tracker is built under this design

**Sequencing.** Wave R runs on `wave-r`, stacked on `wave-2`. W2's grader and receipts track (W2-T01 to T12) is independent and continues. W2's module, game and content tasks start only after stage 1 (R-T15), so nothing is built twice. R-T13 rewrites the affected tracker tasks.

| Tracker task | Under the new design |
|---|---|
| W2-T43 (predictions with no run) | **Done in this wave as R-T09**, by its second and third ways. The tracker task closes when R-T09 merges, and any row left over keeps its record. |
| W2-T14, W2-T15 (`shape-shifter`) | Titled **Tensor views**. 2D: the shape and stride table beside the buffer strip, in the frame. 3D: a block of cells over its buffer with a stride-order thread, from kit primitives, with no props chunk. Role line: "You plan the reshape." It supplies the frame's five exports. |
| W2-T20 (`gap-hunt`, `/trace-room`) | Titled **Trace attribution**, on a page labelled Traces. Built on `src/trace` inside the frame. The span categories use the one colour code. List mode on phones stays. |
| W2-T25 (`dispatch`) | Titled **Backend dispatch**. A rule table and predict-then-reveal questions, in the frame. |
| W2-T30, W2-T31 (`switchyard`) | Titled **KV offload**. 2D: lanes per tier. 3D: three decks with pages in transit as dashed outlines, from kit primitives. No dumbwaiter. |
| W2-T18, T24, T27, T33, T37 (content) | Written to section 2.5's authoring rules from the start: an opener chosen by rule 1, guesses with a reveal, a Test that closes the file, engine terms only. Each new lesson adds its row to the openers table. |
| W2-T42 (trace block, two cards) | The trace block is a Run-style block in the frame. In-production renders as "In vLLM today" in the debrief. Build-this renders as the Build row in Keep. Claims are numbered marks, not chips, so its second check reads "cites its claims as marks". |
| W2-T44 (prediction readers) | The calibration view goes on Progress, as rows in words before counts. Review reschedules from predictions as specified. It reads both reveal kinds. |
| W2-T29, T16, T23 and the other lab tasks | A lab's title is "Build ...", its page is the numbered procedure, and its check labels are in engine terms from the start. |
| W2-T39 (e2e) | Extends `e2e/first-visit.spec.ts`'s per-screen checks to every W2 route and game. |
| W3-T03, T04 (capstone) | The capstone's browser part uses the frame and the lesson template. |
| W3-T07 (search) | Indexes `src/copy/terms.ts` as well as the lessons. |
| W3-T08, W3-T09 (identity across pages and scenes) | Largely discharged by wave R. They shrink to a check that every W2 and W3 surface follows DESIGN.md, plus the owner's review of baselines. |
| W3-T10, W3-T11 | Unchanged. R-T48 covers only the surfaces wave R touched. |
| W3-T13 (claims and copy audit) | Adds the copy guard and the build-log scan to its list, and one read of every lesson for kitchen sentences the guard cannot see. |
| W3-T15 (About) | Prints each model's card in full, since lessons no longer inline it, and the tag legend. |

The agent brief's rule 9 becomes: "The visual identity is Data Book (D-062). Use only the token roles in `src/design/tokens.ts` and the components in `src/design/components`. Put no literal colour or font name outside `src/design`. Names follow GAMES.md §2.6: the engine's term is the only name."

---

## 8. The plan

`tasks.json` holds 50 tasks in six stages. Sizes follow the tracker: S is about 2 agent-hours, M about 6, L about a day with a plan as the PR's first comment. There are 8 S, 28 M and 14 L. Sixteen go to opus, 32 to sonnet and 2 to haiku.

| Stage | Tasks | What lands | What the owner can see |
|---|---|---|---|
| 0. Records and safety | R-T01 to R-T03 | The decisions, display copy out of the state, the budget ledger and the lane spike with its go or stop | |
| 1. Patterns that do not depend on the look | R-T04 to R-T15 | The naming table and guard, the new components on the current tokens, `nextStep`, the frame on KV page pool, the intro and feedback kit, every prediction with a reveal, the lesson template on TR5a lesson 1, the dock and popover, the compiler's warnings, the tracker rewritten, the step loop and front page in engine words, and a tagged build | Build A: the new structure under The Pass |
| 2. Data Book on the pattern screens | R-T16 to R-T19 | The tokens and faces, the step loop's timing diagram, its 3D time track beside the kitchen scene, the front page | Build B |
| The look gate | R-T20 | Five screens in both builds at 1440 and 390, with the three questions | The owner compares two built things |
| 3. Roll-outs, which fan out | R-T21 to R-T40 | Course, module, Games, Review, Progress, labs, Traces; the other four games in the frame; question copy, figures, the five modules' lessons, the cards | |
| 4. The kitchen leaves | R-T41 to R-T46 | The pool's and the sampler's 3D, the Request path cut, the kitchen deleted, the component rename, "Show on the machine" (a stretch) | |
| 5. Sweep | R-T47 to R-T50 | The first-visit walk and baselines, accessibility, docs, the finish review and the cold-test pack | The pull request |

Stage 3 does not wait for the owner's answer at the gate. Stage 4 starts when the owner answers, or when every stage 3 task has merged, whichever comes first. By then the owner has had the two builds for the whole of stage 3.

**How the plan was checked.** A script read `tasks.json` and confirmed that every dependency exists, that the graph has no cycle, and that any two tasks whose file lists overlap in the worktree are ordered by a chain of dependencies. Generated files and the per-area allowlist files are exempt, for the reasons in section 4 and section 2.7.

**Risks, and what guards each**

- **The state-hash trap.** Any rename of a display string moves golden hashes while it sits in the state. R-T02 lands first, moves every such string by a list of paths, and proves that nothing else moved.
- **Budgets.** R-T03 measures every route class before anything is built. Each pattern task carries an allowance and a cut order (section 4).
- **A cold first run.** The opener table is a set of judgments made from the files, not from watching anyone. The vocabulary test catches missing words, and only the cold test catches a level that cannot be worked out. Its failure rule is cheap: the lesson moves one opener down.
- **Reordered prose.** Seventeen lessons move a game. Each content task runs an order-word scan, and a second agent that did not write the edit reads each lesson top to bottom before the merge.
- **Sticky bars and focus.** The short-viewport rule, `scroll-padding`, and the keyboard walks in R-T10 and R-T48.
- **Less spectacle.** A timing diagram is quieter than a lit kitchen, and the owner first asked for "impressive 3D games to catch attention". The bet is that the diagram lifting into depth, the gaps closing across a thousand steps, a page fanning into its layers and the output settling onto p impress this learner more than steel does. The look gate tests the bet on the owner before the kitchen goes.
- **A default-looking chart.** Slabs on a grid can ship looking like a stock chart. The finish is in the dimension lines, the one marker, the source popover and the model-like 3D. R-T50 reviews exactly those.
- **Two looks in the tree for a while.** Between stage 2 and stage 4 the kitchen scene and the time track both exist. The kitchen files are untouched in that window, so nothing has to be kept in step.
- **Wide, mechanical test churn.** Each task updates the tests of what it touches. The guard's allowlist shrinks one file at a time and is empty at R-T50.

## 9. What this knowingly does not fix

- **Whether a cold reader can finish each first run** is untested until section 5.5. Opener B's primer is a hedge, not a proof.
- **Ten lessons still open on reading.** They are shorter, paced and told back, and they do not put the doing first. Doing so needs levels written for those lessons.
- **A game that teaches something other than its lesson** (TR2 lesson 2's level teaches slot refill, not the token budget). The level no longer opens the lesson. It still needs a new level or a different pairing, and levels are frozen here.
- **Kitchen sentences the guard cannot see.** The guard holds a list. A sentence that uses none of it passes. The second reader and W3-T13 are the cover.
- **Lesson length.** The page gets shorter. The prose is not cut, and lessons that claim 50 to 110 minutes still need their author's decision on splitting.
- **3D on a real GPU.** Every walk in this round used a software renderer.
- **Kitchen-era identifiers in the crates** (`Rotation`, `src/rotation.rs`, the `touch` command). They are an API that learners may have built against. They are glossed once, not renamed.
- **Proof.** With no analytics and no observed learner, nothing here is validated until the look gate and the cold test are run.
