# Wave 2b's tasks

> This is section 5.1 of the wave 2 plan, as written on 2026-11-22: the full text of wave 2b's 53 tasks. It is a plan, not a record. `docs/TRACKER.md`'s section "Wave 2 of the second build plan: 2a and 2b" holds one line for each of these tasks under "Wave 2b: one line each" until W2b-T126 writes their bodies; this copy holds their own text in full. Its references to files kept with the build are replaced by plain words, and nothing else is changed. It was copied in on `wave-2m2`, whose tip was `e221dc72` when the copy was made.

Where a task says "as W2b-Tnn", it takes that task's Read, Files pattern, Accept and e2e lines with the module's or game's id changed, and adds what its own line says.

**W2b-T126 · Wave 2b's headings get their bodies** · sonnet · M · deps: W2b-T125 · lane: Open · visible: no
- Goal: Write the Goal, Read, Files and Accept of every 2b heading, from the task list the coordinator hands over with private paths removed, checked against wave 2a's report and, if it is finished, W2b-T118's branch. W2b-T118 writes the bodies of TR5b's own block when it merges. Add a heading for anything a 2a fix round left to 2b. No marker moves: 2a's were set by W2b-T125.
- Read: docs/TRACKER.md, wave 2's section; docs/waves/W2m2a-report.md; W2b-T118's branch (the rewritten TR5b brief); the task list (kept with the build, not in the repository).
- Files: docs/TRACKER.md; tests/ci/task-ids.test.ts; tests/content/pending.test.ts.
- Accept: bun test tests/ci tests/kc tests/docs; bun run verify:kc; The set of heading ids equals the handed-over list; Allow file for each moved line; no private path in the diff.
- e2e: smoke, by G0. Owner default: none.

**W2b-T118 · TR5b's design: the brief rewritten, the KCs, the game against GAMES 9, the camera table, the lab's stage list, and each lesson's levels and first act** · opus · M · deps: W2b-T96, W2b-T180 · merges after: W2b-T126 · lane: TR5b · visible: no
- Goal: As W2b-T96, for TR5b. Early start: it may be built during wave 2a and merges first in 2b. It settles: N1 (GAMES 9's connector game, the tracker's 'publishes each move' as the `publish` level, the role line 'You publish the events.'). A camera-by-camera table of the 3D scene against the 2D in the form of GAMES 4.2, ending in a proposed D- record (N3). The eight KCs and what earns each: a named family, graded level or credit-bearing stage; `tr5b.supports-hma` and `tr5b.connector-contract` get an item family or variant, since the lab that would grade them is wave 3's. `kv-publisher`'s stage list (N10 default: the curriculum's six). The yard model's state, and the five invariants as violations. How Undo, the practice confirm and a result treat an unsafe move. A table of each of the seven levels with the lesson and opener it sits in, at most two new levels in a lesson; if lesson 2 would need four, the contract is split: sync and async loads in lesson 2, save-before-free and failed blocks with `OffloadingConnector` in lesson 3. Each lesson's first act and its control (lesson 3: a guess on what `OffloadingConnector` does at one method). Each lesson's own KCs and the terms no earlier lesson gives (a connector, an external hit, ZeroMQ's sockets, msgpack, a high-water mark). The tier presets as `[estimated]`. The plain waiting lines (WAIT). The exact files W2b-T119 reads.
- Read: curriculum/TR5b-offload-connector-events.md; docs/GAMES.md 4.2 and 9; packages/sim/tiers/; docs/REDESIGN.md 2.5 and 5.4; the modules map 2.2 and 3.2, the games map 2.2, the labs map 1.E (kept with the build, not in the repository).
- Files: curriculum/TR5b-offload-connector-events.md; docs/GAMES.md (section 9); packages/play/roster.ts; content/kc/graph.yaml; tests/kc/graph.test.ts; docs/DECISIONS.md (the records W2b-T180 reserved for it); the TR5b block of docs/TRACKER.md.
- Accept: As W2b-T96; Every KC has a family, a graded level or a credit-bearing lab stage named; The level-to-lesson table has at most two new levels in any lesson; Every `planned:` line names a heading that exists.
- e2e: smoke, by G0. Owner default: N1, N3, N10, O-13, O-14, Q-5, Q-6.

**W2b-T119 · TR5b's sources at the pins, as claims** · sonnet · L · deps: W2b-T76 · soft: W2b-T118 · merges after: W2b-T118 · lane: TR5b · visible: no · fetches upstream
- Goal: `content/claims/tr5b.yaml` (40 to 60 rows [estimated]; the 25 event rows that exist are cited by id). It fetches exactly, as raw files: of vLLM at commit 4ba787ec, `vllm/distributed/kv_transfer/kv_connector/v1/base.py`, `offloading_connector.py` and the spec files it imports, `example_connector.py`, the connector registry file, the connector paths of `vllm/v1/core/sched/scheduler.py`, `vllm/distributed/kv_events.py`, `vllm/config/kv_events.py`, the files that define `--kv-offloading-size`, `--kv-offloading-backend` and `VLLM_USE_SIMPLE_KV_OFFLOAD`, and the file list of `tests/v1/kv_connector/unit/` with line counts; of SGLang at commit 297e54fd, `docs/docs/advanced_features/hicache_design.mdx`, `python/sglang/srt/disaggregation/kv_events.py` and `sgl-router/sgl-kv-indexer/README.md`. The post `vllm.ai/blog/2026-01-08-kv-offloading-connector` is read once, and each claim from it is `[unverified]`.
- Read: the modules map 2.2, the claims table (kept with the build, not in the repository); content/claims/vllm/kv.yaml; the rewritten brief.
- Files: content/claims/tr5b.yaml; course.lock.json if a pin is added; a notional-machine card if the design asks for one; public/labs/* (a repack, if the lock changed).
- Accept: A plan is the first comment; SRC; The two CLI arguments, the environment variable and the registration keys are each read at the pin or left `[unverified]` and listed; No link-speed claim is invented: the presets stay `[estimated]`.
- e2e: none. Owner default: O-4, O-21.

**W2b-T136 · The tiers model gains sequence numbers, a replay buffer, the adapter field, a faulty transport and a restart** · sonnet · M · deps: none · soft: W2b-T119 · merges after: W2b-T119 · lane: TR5b · visible: no
- Goal: What `kv-publisher`'s stages s2, s3, s5 and s6 and the game's `publish` level need: a strictly increasing sequence number per batch; the last `buffer_steps` batches kept, a replay from k, the end marker -1; the adapter on `BlockStored`; repeated stores in chunk mode; a transport that drops, duplicates and reorders; a publisher restart, whose first announcement is the course's own rule and marked so (D-034).
- Read: packages/sim/tiers/; the rewritten brief, section 5; content/claims/vllm/kv.yaml, content/claims/tr5b.yaml.
- Files: packages/sim/tiers/*.ts; tests/sim/tiers*.test.ts; tests/fixtures/sim/.
- Accept: Every existing golden is byte-identical at the defaults; The consumer rebuilt with replays equals the truth on 200 seeds in chunks of 100; Each judge check still catches its bestiary member; Every upstream rule the model encodes cites a claim id of `tr5b.yaml` or `vllm/kv.yaml`, or is marked as the course's own rule; a test lists those ids; bun run verify:labs and `cargo test --offline` pass with `RUSTUP_AUTO_INSTALL=0`.
- e2e: features: forge, forge-hybrid-kv. Owner default: N10.

**W2b-T137 · The yard model, first half: a clock, transfers in flight, request states, layers, the cost of a load against a recompute** · sonnet · L · deps: none · soft: W2b-T136 · merges after: W2b-T136 · lane: TR5b · visible: no
- Goal: `YardState`, `yardReduce`, `yardStep` of GAMES 9 over `tiers` and `kv`, in integers: a transfer with a bandwidth and a landing step, a request's states with `WAITING_FOR_REMOTE_KVS` and saving, a layer-by-layer forward, the asynchronous and synchronous load, the cost model from presets tagged `[estimated]`.
- Read: docs/GAMES.md 9; the rewritten brief; content/claims/tr5b.yaml; the games map 2.2 (kept with the build, not in the repository).
- Files: packages/sim/yard/**; tests/sim/yard*.test.ts; tests/fixtures/sim/.
- Accept: A plan is the first comment; `tiers`' and `kv`'s invariants hold on 200 seeds; Goldens; Every upstream rule cites a claim id or is marked as the course's own; a test lists them; DC-H, with the HEAVY run by the coordinator.
- e2e: none. Owner default: none.

**W2b-T138 · The yard model, second half: violations, failed loads, the reference, the consumer's view** · sonnet · L · deps: none · soft: W2b-T137 · merges after: W2b-T137 · lane: TR5b · visible: no
- Goal: An unsafe move applies and is recorded (read before it landed, freed while saving, read of a failed block). A seeded load failure truncates to the first failed block. A poisoned block reaches a later request, whose output is marked wrong. The bandwidth-order action. `yardReference`, `matchedTokens`, `consumerView`, `replayFrom`.
- Read: as W2b-T137.
- Files: packages/sim/yard/**; tests/sim/yard*.test.ts; tests/fixtures/sim/.
- Accept: A plan is the first comment; The reference has zero violations on 200 seeds; Each violation is reachable and names its block and step; 'The first violation' equals a brute-force recomputation; DC-H, with the HEAVY run by the coordinator.
- e2e: none. Owner default: none.

**W2b-T139 · KV offload's pure session, seven levels** · sonnet · L · deps: none · soft: W2b-T138 · merges after: W2b-T138 · lane: TR5b · visible: no
- Goal: As W2b-T100 for `packages/play/switchyard/**`: `layer`, `not-yet`, `keep-until-saved`, `bad-blocks` in practice; `load-or-recompute`, `publish`, `yard` graded; `prove: 'yard'`; `seedInPage: false`; a graded run with a violation scores 0; practice asks a confirm, a graded level never does.
- Read: packages/play/shape-shifter/ and packages/play/gap-hunt/ (the models); the rewritten brief; docs/ASSESSMENT.md 4.1.
- Files: packages/play/switchyard/**; scripts/games/blind.ts; packages/play/predictions/ (the game's block); tests/play/switchyard-*.test.ts; tests/copy/game-copy.test.ts; tests/copy/no-kitchen.test.ts.
- Accept: A plan is the first comment; As W2b-T100; The blind strategies 'always load', 'always recompute' and 'publish every event in order' each pass at most 15%, measured in the first commit.
- e2e: none yet. Owner default: O-14, O-17.

**W2b-T140 · KV offload's 2D parts, unregistered: lanes per tier, the transfer table, the event log, the consumer's board, the dock** · opus · L · deps: W2b-T86 · soft: W2b-T138 · merges after: W2b-T138 · lane: TR5b · visible: no
- Goal: The components and the phone layout before the game registers: per-request controls (Load with its tier and mode, Recompute, Schedule, Free), the bandwidth order moved by buttons, Step, in a dock that is pinned on a phone. The request row whose output an unsafe move made wrong is drawn visibly wrong, and so is a later request a poisoned block reaches.
- Read: docs/GAMES.md 9; src/games/pool/, src/games/shape-shifter/, src/games/gap-hunt/; the games map 2.2 and section 4 (kept with the build, not in the repository).
- Files: src/games/switchyard/** (no `Game.tsx` yet); component tests; a dev-only specimen; e2e/switchyard-sizes.spec.ts (on the specimen).
- Accept: A plan is the first comment; DC-A and DC-B on the specimen at the twelve sizes; DC-G: with reduced motion everything moves in whole steps, checked after a Step, a load, a free and a result; No kit or design file changes; no route grows.
- e2e: features: switchyard-sizes, on the dev specimen. Owner default: none.

**W2-T30 · KV offload (`switchyard`) in the frame, 2D: the registration, the walkers, `yard` as the Prove level** · opus · L · deps: W2b-T139, W2b-T140 · lane: TR5b · visible: yes
- Goal: As W2-T20, for `src/games/switchyard/` and `e2e/switchyard.spec.ts`. The game's named moments join `e2e/keep-list.spec.ts` (REDESIGN 5.4): an unsafe move shows the affected request's output visibly wrong in the 2D view, and a poisoned block's damage shows on a later request.
- Read: the rewritten brief; docs/GAMES.md 2.6 and 9; src/games/gap-hunt/ (the model); the games map sections 1 and 4 (kept with the build, not in the repository).
- Files: src/games/switchyard/**; packages/play/registry.ts, src/games/registry.ts; src/pages/About.tsx; src/content/render/model.ts; tests/content/pending.test.ts; e2e/switchyard.spec.ts, e2e/switchyard-sizes.spec.ts; e2e/levels.ts, e2e/support/walks.ts, e2e/walks.spec.ts, e2e/keep-list.spec.ts, e2e/routes.ts, e2e/a11y.spec.ts, e2e/network.spec.ts; tests/play/roster.test.ts and the other `tests/play/*` counts, in the allow file.
- Accept: A plan is the first comment; the first commit is a skeleton that measures the route; The tracker's three checks; DC-A to DC-G and DC-H; `.` is Step and is the frame's common step key (`keyProblems`); After an unsafe move the debrief names the block and the step; both named moments are reached by the scripted first run; How Undo treats an applied unsafe move is tested; `has3d` and the roster count follow W2b-T118's record; DC-D with `seedInPage: false`; ROWS with the stop rule; `src/games/kit` and `src/design` are unchanged.
- e2e: features: switchyard, switchyard-sizes, keep-list, lesson-games, prove-mode; smoke: walks, a11y, screens, network, reduced-motion; nightly width: walks (switchyard), all seven levels at 360 and 1280 px. Owner default: N1, N3, N11, Q-5.

**W2b-T141 (check) · Check: KV offload** · opus · L · deps: W2-T30 · lane: TR5b · visible: no
- Goal: CHK as W2b-T103: DC-B's twelve sizes, every level played whole, rotation mid-level and 200% zoom, Prove mode attacked as in DC-D, every unsafe move made on purpose in practice and in a graded run, and whether the wrong output is seen without being told where to look.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T142 · Fix round for KV offload** · opus · M · deps: W2b-T141 · merges after: W2b-T202 · lane: TR5b · visible: yes
- Goal: FIX: every broken row of W2b-T141 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- Read: the check's report, handed over as a file inside the worktree.
- Files: src/games/switchyard/; packages/play/switchyard/; packages/sim/yard/.
- Accept: FIX (section 3): a test that failed before each fix, no bar moved, KIT LOCK if the kit changes, ROWS, SHOTS.
- e2e: features: switchyard, switchyard-sizes, keep-list; nightly width: walks (switchyard). Owner default: none.

**W2b-T202 (confirm) · Confirm W2b-T142** · opus · S · deps: none · soft: W2b-T142 · lane: TR5b · visible: no
- CONFIRM: before W2b-T142 merges, a fresh context re-runs the rows it says it fixed and the DC-A to DC-G sweep of KV offload at DC-B's twelve sizes, on a built site of the fix branch, and reports any new broken row. Accept: Each fixed row is re-run and marked holds or does not hold, with the measured value; A new broken row is reported to the coordinator, who adds a second round from the reserve; It changes no file.

**W2b-T143 · TR5b's item families, first half** · sonnet · M · deps: W2b-T138, W2b-T118 · lane: TR5b · visible: yes
- Goal: As W2b-T105 for the families the design names for lessons 1 and 2's own KCs (`tr5b.load-or-recompute`, `tr5b.which-invariant` and the contract's), keys from the yard model and a rule table whose every row is a claim.
- Read: packages/play/items/families/tr3/ (the model); the rewritten brief; content/claims/tr5b.yaml.
- Files: packages/play/items/families/tr5b/*.ts; packages/play/items/registry.ts, catalog.ts; src/items/families.ts; tests/play/items-tr5b-*.test.ts; tests/fixtures/items/vectors.json; content/kc/graph.yaml (its `planned:` lines).
- Accept: As W2b-T105; ROWS (`/today`), inside W2b-T87's room or the room task the coordinator added; it stops and reports otherwise.
- e2e: features: items, today. Owner default: O-14.

**W2b-T144 · TR5b's item families, second half** · sonnet · M · deps: W2b-T143 · lane: TR5b · visible: yes
- Goal: As W2b-T106 for `tr5b.next-event`, `tr5b.replay-from`, an adapter variant and the `tr5b.supports-hma` variant, with a Test-level test for each lesson's own KCs.
- Read: as W2b-T143.
- Files: as W2b-T143; tests/play/items-tr5b-test-level.test.ts.
- Accept: As W2b-T106.
- e2e: features: items, today. Owner default: O-14.

**W2b-T145 · TR5b lesson 1 and the module page** · opus · M · deps: W2-T30, W2b-T143, W2b-T119 · lane: TR5b · visible: yes
- Goal: As W2b-T107 for `content/modules/tr5b/`: tiers inside one engine and the load-or-recompute line, with the course's presets `[estimated]` and the vendor's speedups `[unverified]`, each with its claim. The module page shows the connector lab as not published and the forge lab as it stands.
- Read: as W2b-T107, for TR5b; the modules map 3.2 (kept with the build, not in the repository).
- Files: content/modules/tr5b/module.md; content/modules/tr5b/lessons/l1-*.md; tests/content/tr5b-module.test.ts, tr5b-demos.ts; tests/content/openers-table.ts, module-counts.ts; packages/play/predictions/{plan,truth,commit-tr5b,tr5b}.ts; e2e/routes.ts, e2e/support/lessons.ts, e2e/lesson-games.spec.ts; e2e/first-visit.spec.ts and e2e/support/screens.ts (its own routes' rows); public/md/tr5b/**, public/llms.txt.
- Accept: LES; DC-F on the lesson; The first action comes within 60 seconds of reading.
- e2e: features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (switchyard) for the lesson's levels. Owner default: N5, N8 as answered; O-21.

**W2b-T146 (check) · Check: TR5b's lesson 1 and module page** · opus · M · deps: W2b-T145 · lane: TR5b · visible: no
- Goal: As W2b-T108, as a learner who has done TR1 and skipped TR5a.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T147 · Fix round for TR5b's lesson 1** · sonnet · S · deps: W2b-T146 · merges after: W2b-T203 · lane: TR5b · visible: yes
- Goal: FIX: every broken row of W2b-T146 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- Read: the check's report, handed over as a file inside the worktree.
- Files: content/modules/tr5b/; public/md/tr5b/**.
- Accept: FIX (section 3): a test that failed before each fix, no bar moved, KIT LOCK if the kit changes, ROWS, SHOTS.
- e2e: features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (switchyard) for the lesson's levels. Owner default: none.

**W2b-T203 (confirm) · Confirm W2b-T147** · opus · S · deps: none · soft: W2b-T147 · lane: TR5b · visible: no
- CONFIRM: before W2b-T147 merges, a fresh context re-runs the rows it says it fixed and DC-F on the lesson and a terms-before-use read of the touched parts, on a built site of the fix branch, and reports any new broken row. Accept: Each fixed row is re-run and marked holds or does not hold, with the measured value; A new broken row is reported to the coordinator, who adds a second round from the reserve; It changes no file.

**W2b-T148 · TR5b lesson 2, the connector contract** · opus · M · deps: W2b-T147, W2b-T144 · lane: TR5b · visible: yes
- Goal: The module's hardest lesson. A connector, an external hit and the scheduler and worker sides are given before they are used. The invariants this lesson holds by the design's table are stated 'in the course's model', each with a worked pass and a worked refusal. At most two new levels.
- Read: as W2b-T145.
- Files: content/modules/tr5b/lessons/l2-*.md; tests/content/tr5b-module.test.ts, tr5b-demos.ts; tests/content/openers-table.ts, module-counts.ts; packages/play/predictions/{plan,truth,commit-tr5b,tr5b}.ts; e2e/routes.ts, e2e/support/lessons.ts, e2e/lesson-games.spec.ts; e2e/first-visit.spec.ts and e2e/support/screens.ts (its own routes' rows); public/md/tr5b/**, public/llms.txt.
- Accept: LES; The lesson's levels are exactly the design's row for it; No real number.
- e2e: features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (switchyard) for the lesson's levels. Owner default: none.

**W2b-T185 (check) · Check: a cold read of TR5b's lessons 1 and 2** · opus · S · deps: W2b-T148 · lane: TR5b · visible: no
- Goal: A fresh reader takes TR5a and then TR5b's lessons 1 and 2 in order and looks for a term used before it is given, a Test question the lesson did not teach, and an invariant with no worked refusal. It plays lesson 2's levels on a phone.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T186 · Fix round for TR5b's lesson 2** · opus · S · deps: W2b-T185 · merges after: W2b-T204 · lane: TR5b · visible: yes
- Goal: FIX: every broken row of W2b-T185 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- Read: the check's report, handed over as a file inside the worktree.
- Files: content/modules/tr5b/; public/md/tr5b/**.
- Accept: FIX (section 3): a test that failed before each fix, no bar moved, KIT LOCK if the kit changes, ROWS, SHOTS.
- e2e: features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (switchyard) for the lesson's levels. Owner default: none.

**W2b-T204 (confirm) · Confirm W2b-T186** · opus · S · deps: none · soft: W2b-T186 · lane: TR5b · visible: no
- CONFIRM: before W2b-T186 merges, a fresh context re-runs the rows it says it fixed and a terms-before-use read of lessons 1 and 2 and DC-F on each, on a built site of the fix branch, and reports any new broken row. Accept: Each fixed row is re-run and marked holds or does not hold, with the measured value; A new broken row is reported to the coordinator, who adds a second round from the reserve; It changes no file.

**W2b-T149 · TR5b lessons 3 and 4** · sonnet · M · deps: W2b-T186, W2-T29 · lane: TR5b · visible: yes
- Goal: As W2b-T110: reading `OffloadingConnector` at the pin, opening on the design's first act, with the rest of the contract if the design split it; events a consumer can replay, with ZeroMQ's sockets, msgpack and the high-water mark given first. Lesson 4 sends the learner to `kv-publisher`, and its Build row names exactly the stages the lab page has.
- Read: as W2b-T145; content/claims/tr5b.yaml.
- Files: content/modules/tr5b/lessons/l3-*.md and l4-*.md; tests/content/tr5b-module.test.ts, tr5b-demos.ts; tests/content/openers-table.ts, module-counts.ts; packages/play/predictions/{plan,truth,commit-tr5b,tr5b}.ts; e2e/routes.ts, e2e/support/lessons.ts, e2e/lesson-games.spec.ts; e2e/first-visit.spec.ts and e2e/support/screens.ts (its own routes' rows); public/md/tr5b/**, public/llms.txt.
- Accept: LES; The Build row's stage list equals the lab page's (a test).
- e2e: features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (switchyard) for the lesson's levels; features: forge. Owner default: O-21.

**W2-T33 · TR5b lesson 5, and the module closed in the browser** · sonnet · M · deps: W2b-T149 · lane: TR5b · visible: yes
- Goal: As W2-T24: HiCache and its events, and what the indexer's README says it does not do. The module page complete for the browser part.
- Read: as W2b-T145.
- Files: content/modules/tr5b/lessons/l5-*.md; tests/content/tr5b-module.test.ts, tr5b-demos.ts; tests/content/openers-table.ts, module-counts.ts; packages/play/predictions/{plan,truth,commit-tr5b,tr5b}.ts; e2e/routes.ts, e2e/support/lessons.ts, e2e/lesson-games.spec.ts; e2e/first-visit.spec.ts and e2e/support/screens.ts (its own routes' rows); public/md/tr5b/**, public/llms.txt; content/modules/tr5b/module.md.
- Accept: LES; `bun run verify:kc`: every KC has a family, a graded level or a credit-bearing lab stage, and only the connector lab's KCs still carry `planned: W2-T32`; The minutes sum is within 10% of the brief's.
- e2e: features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (switchyard) for the lesson's levels. Owner default: Q-5; the connector lab waits for wave 3.

**W2b-T150 · TR5b end to end: the first-visit and screen checks on its routes** · haiku · S · deps: W2-T33 · lane: TR5b · visible: no
- Goal: As W2b-T112, for `/m/tr5b`, its five lessons, `/play/switchyard` and `/labs/kv-publisher`. It does not close W2-T39.
- Read: as W2b-T112.
- Files: e2e/first-visit.spec.ts; e2e/screens.spec.ts; e2e/support/screens.ts.
- Accept: As W2b-T112.
- e2e: smoke: first-visit, screens, at nightly width. Owner default: none.

**W2b-T151 (check) · Check: TR5b's lessons 3 to 5 and the whole module as a learner** · opus · M · deps: W2-T33 · lane: TR5b · visible: no
- Goal: As W2b-T113, from `/m/tr5b`, with the way from lesson 4 into the forge lab and back.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T152 (check) · Check: TR5b's technical check** · opus · M · deps: W2-T33 · lane: TR5b · visible: no · fetches upstream
- Goal: As W2b-T114, for `content/claims/tr5b.yaml`; its report is `docs/waves/W2m2b-tr5b-technical.md`, the first commit of W2b-T154's branch.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T153 (check) · Check: TR5b's cold-reader check** · opus · M · deps: W2-T33 · lane: TR5b · visible: no
- Goal: As W2b-T115, reading TR5a and then TR5b; its report is `docs/waves/W2m2b-tr5b-cold-read.md`, the first commit of W2b-T155's branch.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T154 · TR5b's fixes from the learner check and the technical check** · sonnet · M · deps: W2b-T151, W2b-T152 · lane: TR5b · visible: yes
- Goal: FIX: every broken row of W2b-T151, W2b-T152 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- Read: the check's report, handed over as a file inside the worktree.
- Files: content/modules/tr5b/; content/claims/tr5b.yaml; packages/play/items/families/tr5b/; docs/waves/W2m2b-tr5b-technical.md; public/md/tr5b/**.
- Accept: It is split in two if the rows pass twelve; FIX (section 3): a test that failed before each fix, no bar moved, KIT LOCK if the kit changes, ROWS, SHOTS.
- e2e: features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (switchyard) for the lesson's levels. Owner default: none.

**W2b-T155 · TR5b's teaching fixes and a re-read of W2b-T154** · opus · M · deps: W2b-T153, W2b-T154 · merges after: W2b-T205 · lane: TR5b · visible: yes
- Goal: As W2b-T117, for TR5b.
- Read: both reports; content/modules/tr5b/.
- Files: content/modules/tr5b/; docs/waves/W2m2b-tr5b-cold-read.md; public/md/tr5b/**.
- Accept: LES for the touched lessons; Every row is closed; FIX (section 3): a test that failed before each fix, no bar moved, KIT LOCK if the kit changes, ROWS, SHOTS.
- e2e: features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (switchyard) for the lesson's levels. Owner default: none.

**W2b-T205 (confirm) · Confirm W2b-T155** · opus · S · deps: none · soft: W2b-T155 · lane: TR5b · visible: no
- CONFIRM: before W2b-T155 merges, a fresh context re-runs the rows it says it fixed and a terms-before-use read of every rewritten passage and DC-F on each touched lesson, on a built site of the fix branch, and reports any new broken row. Accept: Each fixed row is re-run and marked holds or does not hold, with the measured value; A new broken row is reported to the coordinator, who adds a second round from the reserve; It changes no file.

**W2-T29 · Build a KV events publisher (forge lab `kv-publisher`), stages s1 to s4** · sonnet · L · deps: W2b-T136, W2b-T118 · lane: G · visible: yes
- Goal: The crate (a harness marked DO NOT EDIT, the learner's `TODO(you)` file, `reference/`, `bestiary/`, `tests/checks.rs`), the oracle and its wire, the committed wasm, the page as the numbered procedure, for `store_remove`, `batches`, `replay` and `reset`.
- Read: the labs map 1.E and section 5 (kept with the build, not in the repository); labs/forge/README.md; labs/forge/hybrid-kv/; the rewritten brief, section 5.
- Files: labs/forge/kv-publisher/**; labs/forge/Cargo.toml, Cargo.lock; packages/sim/forge/kv-publisher.ts, check-kcs.ts, kcs.ts; src/forge/{ids,labs,titles,kits,words}.ts; tests/fixtures/forge/kv-publisher/; tests/forge/*; src/unbuilt/copy.ts, src/content/render/model.ts, tests/pages/unbuilt.test.ts, tests/content/roster.test.ts; content/kc/graph.yaml (its `planned:` lines); the forge zip.
- Accept: A plan is the first comment; The tracker's three checks; Each named bestiary member fails its check in at least 99% of 50 fresh runs; `cargo test --offline --workspace --features reference` and `bun run verify:labs` with `RUSTUP_AUTO_INSTALL=0`; bun scripts/pack-labs.ts --check; No new crate dependency; The page says nothing of vLLM's real stream, whose transport is `[unverified]`; DC-A, DC-B and DC-F on the lab page; ROWS.
- e2e: features: forge, lab-kits, forge-kv-publisher (new); nightly width: a11y on the lab page. Owner default: N10.

**W2b-T156 · `kv-publisher`, stages s5 and s6** · sonnet · M · deps: W2-T29 · lane: G · visible: yes
- Goal: `chunks_and_adapters` and `gauntlet` (the faulty transport and a restart), with their bestiary members. If W2b-T118's record kept only the tracker's three checks, this task is closed as not run, the report says so, and a dependency on it counts as met.
- Read: as W2-T29.
- Files: as W2-T29.
- Accept: As W2-T29, for the two stages.
- e2e: features: forge, lab-kits, forge-kv-publisher. Owner default: N10.

**W2b-T157 · Prove-it on a forge lab, for `hybrid-kv`, `rejection-sampler` and `kv-publisher`** · opus · L · deps: W2-T29, W2b-T156, W2b-T78 · lane: G · visible: yes
- Goal: ASSESSMENT 7.2's second kind: one seeded template of at most 12 `ks_invoke` calls told in words; the learner predicts their own module's replies; `proved` needs the answer right, the module's SHA-256 equal to the one just graded, and no attempt that counted in the last 24 hours; the attempt is written when it starts. `kv-publisher`'s template covers the stages the lab has.
- Read: docs/ASSESSMENT.md 7.2 and 7.3; src/prove/; src/forge/protocol.ts, record.ts, sha256.ts; the labs map 1.F (kept with the build, not in the repository).
- Files: src/forge/prove/**; a template registry under `packages/sim/forge/`; tests on the committed wasm through the real worker; e2e/prove-forge.spec.ts (new).
- Accept: A plan is the first comment; DC-A and DC-B on the panel at the twelve sizes; DC-C and DC-D as tests on all three labs; DC-E: the foot after a proved run, a miss and a left attempt each says what happened; The chunk loads on demand; ROWS on the forge lab pages.
- e2e: features: forge, forge-hybrid-kv, rejection-sampler, prove-forge, ledger-conformance. Owner default: Q-5, O-18.

**W2b-T158 (check) · Check: the `kv-publisher` page and Prove-it on the three forge labs** · opus · M · deps: W2b-T157 · lane: G · visible: no
- Goal: CHK: the page followed as printed with the pinned toolchain; a wrong module dropped; Prove-it attacked as in DC-D on each lab; the panel on a phone.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: OFFLINE: `cargo` only with `--offline` and `RUSTUP_AUTO_INSTALL=0`; a line that would download is read, not run, and reported so; CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T159 · Fix round for the forge lab and Prove-it** · opus · M · deps: W2b-T158 · merges after: W2b-T206 · lane: G · visible: yes
- Goal: FIX: every broken row of W2b-T158 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- Read: the check's report, handed over as a file inside the worktree.
- Files: labs/forge/kv-publisher/; src/forge/; packages/sim/forge/.
- Accept: FIX (section 3): a test that failed before each fix, no bar moved, KIT LOCK if the kit changes, ROWS, SHOTS.
- e2e: features: forge, forge-kv-publisher, prove-forge, ledger-conformance. Owner default: none.

**W2b-T206 (confirm) · Confirm W2b-T159** · opus · S · deps: none · soft: W2b-T159 · lane: G · visible: no
- CONFIRM: before W2b-T159 merges, a fresh context re-runs the rows it says it fixed and DC-C and DC-D on Prove-it for all three labs, on a built site of the fix branch, and reports any new broken row. Accept: Each fixed row is re-run and marked holds or does not hold, with the measured value; A new broken row is reported to the coordinator, who adds a second round from the reserve; It changes no file.

**W2b-T170 · TR7's design** · opus · S · deps: W2b-T180 · merges after: W2b-T126 · lane: TR7 · visible: no
- Goal: The brief's 'Before you write'; the seven KCs with `planned: W2-T37` or `planned: W2-T38` (the TR7 lab, never W2b-T38, the runbook); the policy block quote becomes a claim's quote with its double quotes; 'exit tickets' and '2 of 3' replaced by N5's rule. Early start: it may be built during wave 2a.
- Read: curriculum/TR7-contribute-honestly.md; the modules map 2.3 and 3.3 (kept with the build, not in the repository).
- Files: curriculum/TR7-contribute-honestly.md; content/kc/graph.yaml; tests/kc/graph.test.ts.
- Accept: bun run verify:kc; No banned word; Nothing says the owner chose.
- e2e: none. Owner default: Q-1, O-21.

**W2b-T171 · TR7's sources at the pins, and a census script** · sonnet · M · deps: W2b-T76 · soft: W2b-T170 · merges after: W2b-T170 · lane: TR7 · visible: no · fetches upstream
- Goal: `content/claims/tr7.yaml` (25 to 35 rows [estimated]). It fetches exactly, as raw files: of vLLM at commit 4ba787ec, `docs/contributing/README.md`, `AGENTS.md`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/750-RFC.yml`, `700-performance-discussion.yml`; of SGLang at commit 297e54fd, `docs/docs/developer_guide/contribution_guide.mdx`, `.github/pull_request_template.md`. The census is a committed script that reads GitHub's public API with no token and a generic User-Agent for the pull requests merged in the four weeks before its run, stops at the rate limit and reports the window it covered; it is run again when wave 3 writes TR7's lessons, so the figure a lesson prints is that run's.
- Read: the modules map 2.3, the claims table (kept with the build, not in the repository); the rewritten brief.
- Files: content/claims/tr7.yaml; scripts/census/prs.ts and its test.
- Accept: SRC; The absence of AI-disclosure text in SGLang's guide is a claim that names the search; The two-week figures stay labelled as two weeks unless the four are covered; No test and no workflow imports or runs the census script (a test asserts it); The script keeps only counts, the window and the run date: no login, name or pull request title reaches a committed file.
- e2e: none. Owner default: O-4, O-21.

**W2b-T172 · TR7's targets, as a draft for the owner** · sonnet · S · deps: none · soft: W2b-T171 · merges after: W2b-T171 · lane: TR7 · visible: no
- Goal: `content/claims/tr7-targets.yaml`, 5 to 8 candidates, each with its source, configuration, hardware, engine version, estimated hours and the words 'not yet reproduced'.
- Read: curriculum/TR7-contribute-honestly.md sections 5 and 11; docs/TRACKER.md W2-T37.
- Files: content/claims/tr7-targets.yaml; tests/content/tr7-targets.test.ts.
- Accept: Each candidate states its hardware and estimated hours, and is on a 4090 or within 6 to 8 H100 hours [estimated]; others (a GB200 result among them) are listed as excluded with the reason; A test that no lesson, page or lab reads the file; Its header says no target ships until the owner has reproduced it.
- e2e: none. Owner default: the brief's rule: the owner reproduces a target before it ships.

**W2b-T135 · 'In vLLM today' and Build cards in TR1, TR2, TR5a, TR6 and TR8** · sonnet · M · deps: W2b-T129, W2b-T126 · lane: Cards · visible: yes
- Goal: Cards written from claims that exist, placed in their lessons.
- Read: content/cards/in-vllm-prefix-cache.md, build-tr0-forward.md; the report of W2-T42 (kept with the build, not in the repository).
- Files: content/cards/*.md; the lessons of the five modules; public/md/**.
- Accept: Every card cites existing claim ids; bun run verify:content, verify:claims; Lesson JSON under 40 KB; A Build card names only a lab that is published, or says it is not; Count edits are in the allow file.
- e2e: features: lesson-games, titles; nightly width: a11y, screens on one lesson of each module. Owner default: O-19: as built; if TR1 lesson 1 is edited, guess 2 of 2 is not moved.

**W2b-T187 (check) · Check: the cards in the five older modules** · opus · S · deps: W2b-T135 · lane: Cards · visible: no
- Goal: Each card's sentences against the claims it cites, as a technical check does; each card at 320, 390 and 1440 px; a card that says more than its claim.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T188 · Fix round for the cards** · sonnet · S · deps: W2b-T187 · merges after: W2b-T207 · lane: Cards · visible: yes
- Goal: FIX: every broken row of W2b-T187 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- Read: the check's report, handed over as a file inside the worktree.
- Files: content/cards/; the touched lessons; public/md/**.
- Accept: FIX (section 3): a test that failed before each fix, no bar moved, KIT LOCK if the kit changes, ROWS, SHOTS.
- e2e: features: lesson-games, titles. Owner default: none.

**W2b-T207 (confirm) · Confirm W2b-T188** · opus · S · deps: none · soft: W2b-T188 · lane: Cards · visible: no
- CONFIRM: before W2b-T188 merges, a fresh context re-runs the rows it says it fixed and each fixed card against its claim, on a built site of the fix branch, and reports any new broken row. Accept: Each fixed row is re-run and marked holds or does not hold, with the measured value; A new broken row is reported to the coordinator, who adds a second round from the reserve; It changes no file.

**W2b-T173 (check) · Final check: KV offload, Trace attribution, Tensor views, and every Prove level and Prove-it** · opus · L · deps: W2b-T142, W2b-T150, W2b-T155, W2b-T159, W2b-T172, W2b-T188 · lane: Exit · visible: no
- Goal: As W2b-T120, for these three games and the three forge labs' Prove-it.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T189 (check) · Final check: the five other games** · opus · L · deps: W2b-T142, W2b-T150, W2b-T155, W2b-T159, W2b-T172, W2b-T188 · lane: Exit · visible: no
- Goal: As W2b-T184, for the Step loop, KV page pool, Request path, Rejection sampler and Broken benchmark.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T174 (check) · Final check: TR5b and TR3 walked as a learner, and the forge lab** · opus · L · deps: W2b-T142, W2b-T150, W2b-T155, W2b-T159, W2b-T172, W2b-T188 · lane: Exit · visible: no
- Goal: As W2b-T121: from `/` to a passed Test in each lesson of TR5b, a Prove run, the forge lab finished and proved, Review the next day, and TR3 once more from its module page.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: OFFLINE, as W2b-T158; CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T175 (check) · Final check: every page at 320, 390 and 1440 px** · opus · L · deps: W2b-T142, W2b-T150, W2b-T155, W2b-T159, W2b-T172, W2b-T188 · lane: Exit · visible: no
- Goal: As W2b-T122, with the cards of the five older modules.
- Read: the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report.
- Files: none: the report goes to the coordinator, outside the repository.
- Accept: CHK (section 3), ending with what it did not check.
- e2e: none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed. Owner default: none.

**W2b-T176 · Fix round for the final checks of the games** · opus · M · deps: W2b-T173, W2b-T189 · merges after: W2b-T208 · lane: Exit · visible: yes
- Goal: FIX: every broken row of W2b-T173, W2b-T189 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- Read: the check's report, handed over as a file inside the worktree.
- Files: the game folders the rows name; src/prove/, src/forge/prove/; src/games/kit/ (a separate commit).
- Accept: FIX (section 3): a test that failed before each fix, no bar moved, KIT LOCK if the kit changes, ROWS, SHOTS.
- e2e: features: every game's spec and sizes spec; nightly width: walks of every game. Owner default: none.

**W2b-T208 (confirm) · Confirm W2b-T176** · opus · S · deps: none · soft: W2b-T176 · lane: Exit · visible: no
- CONFIRM: before W2b-T176 merges, a fresh context re-runs the rows it says it fixed and the DC-A to DC-G sweep of each touched game at DC-B's twelve sizes, on a built site of the fix branch, and reports any new broken row. Accept: Each fixed row is re-run and marked holds or does not hold, with the measured value; A new broken row is reported to the coordinator, who adds a second round from the reserve; It changes no file.

**W2b-T177 · Fix round for the final walk and the final pages check** · sonnet · M · deps: W2b-T174, W2b-T175 · merges after: W2b-T209 · lane: Exit · visible: yes
- Goal: FIX: every broken row of W2b-T174, W2b-T175 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- Read: the check's report, handed over as a file inside the worktree.
- Files: content/modules/; src/pages/; the page CSS; public/md/**.
- Accept: FIX (section 3): a test that failed before each fix, no bar moved, KIT LOCK if the kit changes, ROWS, SHOTS.
- e2e: nightly width: a11y and screens; the touched lessons' specs. Owner default: none.

**W2b-T209 (confirm) · Confirm W2b-T177** · opus · S · deps: none · soft: W2b-T177 · lane: Exit · visible: no
- CONFIRM: before W2b-T177 merges, a fresh context re-runs the rows it says it fixed and DC-F on each touched page and lesson at 320, 390 and 1440 px, on a built site of the fix branch, and reports any new broken row. Accept: Each fixed row is re-run and marked holds or does not hold, with the measured value; A new broken row is reported to the coordinator, who adds a second round from the reserve; It changes no file.

**W2b-T178 · Wave 2's exit report, with the markers and the merged list** · opus · M · deps: W2b-T176, W2b-T177 · lane: Exit · visible: no
- Goal: As W2b-T125, as `docs/waves/W2m2b-report.md`, for wave 2b's tasks: the report, the markers and `MERGED` in one commit.
- Read: docs/waves/W2m2a-report.md; every check's and fix round's report (kept with the build, not in the repository).
- Files: docs/waves/W2m2b-report.md; docs/TRACKER.md (markers); tests/ci/workflows.test.ts.
- Accept: As W2b-T125; After it merges the coordinator dispatches `nightly.yml` on that tip and reads all five jobs before the description is written.
- e2e: as W2b-T125. Owner default: lists every row of section 8 of the plan.
