# enginespace UX diagnosis

Date: 2026-11-15. Build audited: branch `wave-2` at 727167e, served at http://127.0.0.1:4390.

## Verdict in one paragraph

The learner is lost for two separate reasons, and unhappy for a third. First, the naming policy makes the kitchen word the primary name of everything the learner has to think with, and nothing teaches the mapping. Second, the site has no spine: no page says what the one next step is, and the pages disagree. Third, the reward is real but late: the best teaching (debriefs, item feedback, the one-toggle "aha" moments) sits behind thousands of pixels of reference prose, locked predictions and results below the fold. The kitchen as a look is not the cause. The kitchen as the course's vocabulary is.

## How far to trust this

- Eight audits were commissioned. Four reports are on disk and I read them in full: `lesson-tr1-tr5a`, `games`, `wayfinding`, `language`. Four are not on disk (`first-visit`, `lesson-tr2`, `precedent`, `benchmarks`): I had only their summaries, plus the screenshots and text dumps the first three left in their folders.
- I checked the summaries' main claims and every disagreement in the browser myself (scripts and screenshots in `ux/design/probe/`). Results are in the "Disagreements settled" list below.
- No real learner was observed. Every walk was an auditor scripting a browser under a software renderer on a loaded host, so claims about 3D smoothness, crashes and dark phone canvases are not established for a real GPU.
- The owner's complaint was formed on the older live build, where lessons showed "Not built yet" for games, predictions and item sets. This build fixes games and items in lessons. It does not fix any of the four concept causes below.

### Disagreements settled

1. **What START SERVICE does.** The wayfinding report calls it a link to `/m/tr1`. It is a button: the page stays at `/`, the scene switches to 3D, and the hero card stays over the middle of the kitchen. The only link into the course is "START TR1" at 3,927 px of a 4,116 px page.
2. **Where the lesson's Predict sits.** The precedent study says about 20,000 px down; the lesson-tr2 walk says the game is 7,700 px down. Measured on tr2.l1 at 1440: PREDICT at 6,299 px, PLAY at 7,324 px, then the notional-machine card from 10,160 to 24,642 px (55% of the 26,253 px page), then EXIT CHECK at 25,061 px. The lesson-tr2 figure is right. What sits 25,000 px down is the exit items.
3. **What is next.** Confirmed: the map says "NEXT TICKET TR1", Today says "Start with TR2", the front page's bottom button says "START TR1", and the front page's game is TR2's.
4. **Which predictions are locked.** tr1.l1: both work. tr1.l2: both locked. tr2.l1: locked (COMMIT ANSWER disabled, "Its reveal waits on W2-T43"). The tracker says 22 of the 39 predictions wait on W2-T43.
5. **Where a module's lessons are.** TR1: the LESSONS heading is at 12,113 of 14,895 px. TR2: 20,512 of 23,118 px. There is no start button above them.

## 1. Root causes

Six causes explain the findings: four in the concept, two in the execution.

The "findings" column counts the 46 ranked findings in the four reports on disk, each assigned to one cause. It is a count of findings, not of learner time, and it is biased by the briefs: the language audit inflates C1, and C3 is undercounted because the lesson-format evidence sits mostly in the three reports I have only as summaries. The "share" column is my judgment after correcting for that. It is an estimate, not a measurement.

| # | Cause | Kind | Findings (of 46) | Share of the trouble | Owner's words it explains |
|---|---|---|---|---|---|
| C1 | The kitchen word is the primary name | concept: metaphor and naming policy | 15 | about a third | "kitchen names hide the real concepts" |
| C2 | No spine | concept: information architecture | 6 | about a sixth | "unclear what to do next" |
| C3 | The lesson is a reference document with the doing buried in it | concept: lesson format | 2 | about a sixth, and most of the hours | "not delightful to learn" |
| C4 | Games open cold and spread over several screens | concept: game onboarding | 10 | about a fifth | "unclear ... why"; "not delightful to use" |
| E1 | Provenance and status drawn as loudly as the teaching | execution: density, visual noise | 5 | about a tenth | "not delightful" |
| E2 | Unfinished and unedited surface | execution: copy, missing pieces | 8 | about a tenth, but it holds the hardest single block | "lost" |

### C1. The kitchen word is the primary name (concept)

This is policy, not accident. D-049 says "the display name leads, over its subtitle". GAMES.md §2.6 says the kitchen word names the object, and its vocabulary table maps 38 sim elements to kitchen objects, several words to a row. Rule 2 of §2.6 (give both words the first time) is kept on the tapes and scene labels and nowhere else.

- **The metaphor moved from the skin into the nouns.** Game names (Service, The Reach-In, The Tasting), level names ("Mind the gap", "The allergy card", "Drilled routines"), controls ("Hang a ticket", "Dump the pans"), prediction stems ("How many pans will ticket No. 01 hold, across every station, once it hangs?"), nav and page tags (the menu, the specials, on the board). kernelspace and statespace keep personality in the chrome and name concepts plainly (precedent).
- **Nothing teaches the mapping.** No glossary. The only full statement is one paragraph mid-way through tr2.l1 and one on each module page. Rail, clip, bell, pass, comb, mold, dish, recipe kit and mise are never glossed on the site (language F2). Later lessons use the words without re-glossing them, and "any ticket opens" invites jumping in.
- **The words are not stable.** "Ticket" means a request, a module, a review item and an exit check. Pan, station, pass, course, service and KEYS carry two or three meanings each. A request is a ticket, an order, a guest and a table; a token is a plate, a course and a dish (language F1, F4, F5).
- **Some mappings teach the wrong thing.** Shared mise is consumed and a KV page is not; pulling a ticket cancels it and a preempted request resumes; "Heard!" acknowledges and a sync blocks (language F8).
- **The density is inconsistent.** Lessons are about 6% kitchen words. Game screens run from Back of House at 8 kitchen to 13 engine terms to The Tasting at 23 to 9, and The Tasting never shows "draft" or "target" (language). So the learner reads engine words in the lesson and must translate to play.
- **The metaphor points the wrong way for this learner.** A metaphor helps when the source is familiar and the target is not. A kernelspace graduate already knows batch, slot, prefix hit, eviction and preemption (T5 is a hard prerequisite). They do not know expo, mise, commis, hotel pan or reach-in. The front-page game costs them a new vocabulary to learn "batching", which they knew.

Evidence across reports: language F1-F5, F8, F9, F11; games 1-2; lesson-tr1-tr5a 5, 6, 14; wayfinding 4, 6, 9; first-visit (kitchen terms never defined on the first screen; engine terms appear only after the game); lesson-tr2 (L3's receipt puts kitchen words first and leaks molds and padding); precedent.

### C2. No spine (concept)

The site is organised as a set of reference pages, each computing "next" its own way, with no object that carries the learner from step to step.

- **The next step is contradictory** (settled above, item 3), and the first-screen button does not enter the course (item 1).
- **Module pages are spec sheets.** Lessons sit at the bottom of 14,895 and 23,118 px pages, behind essays and a card of citation rows (wayfinding 1; lesson-tr1-tr5a 8; first-visit).
- **Progress is not told back.** After a level and three items, the map shows ringed dots, Today is unchanged, Evidence shows counts, and Play and the front page look like a first visit. Nothing says "you did X, next is Y" (wayfinding 2). Six words name progress (practised, earned, credited, part credit, kept, tried), and a wrong answer makes an idea "practised" (wayfinding 3).
- **Lessons give no orientation.** No contents, no promise sentence, no position, and Next is at the end of 26,000 px (wayfinding 7; precedent). The breadcrumb shows ids ("tr2.l1"), not titles.
- **The lab page puts the upload before the download** and never says which file to edit (lesson-tr1-tr5a 2).
- **Nothing marks which levels are graded**, though Today asks the learner to "play a graded level" (wayfinding 4).

### C3. The lesson is a reference document with the doing buried in it (concept)

PRODUCT.md's first principle is "play the mechanism before reading it". The built lesson inverts it.

- On tr2.l1 the learner reads 6,300 px before the first Predict and 7,300 px before the first game. The exit items are 25,000 px down.
- An identical notional-machine card is inlined in every lesson: about 14,400 px at 1440 (55% of the page) and 22,681 px on a phone (lesson-tr2; measured). The same card sits on each module page.
- Lessons run about 7,000 words against 34 to 50 claimed minutes (lesson-tr2). On a phone tr2.l1 is 39,057 px.
- The same prediction is asked up to three times (page, game door, "Say it first"), and the answer is printed in the prose below the game (lesson-tr1-tr5a 4).
- A game inside a lesson can teach something other than the lesson: L2's game teaches slot refill, not the token budget, and its debrief reuses generic copy with a button that leaves the lesson (lesson-tr2).
- The prose itself is excellent and engine-first (lesson-tr2, language, lesson-tr1-tr5a). The format is the problem, not the writing.

### C4. Games open cold and spread over several screens (concept)

- **A question before an object model.** Back of House, The Reach-In and The Tasting open on a prediction about nouns the screen has not introduced, with no goal, no "why" and no stated win condition (games 1, 8). Predict-first is applied at the door of every game, before the learner can know what the nouns are.
- **The 3D scene gets the viewport and does not carry the state.** Numbers must stay in the DOM (D-021), so the state lives in tapes and tables below the scene. Results sit below the fold; a laid tile lands in a list off-screen; toggles are far from the chart they change (games 3, 6; lesson-tr1-tr5a 7). In The Reach-In and The Tasting the 2D view reads better than 3D; in Service the 2D view is the same drawing, flatter; in Back of House the 3D close-up barely shows the path (games 7).
- **Levels start and end without warning.** "Fill the rail" ends after one bell; "Mind the gap" opens at fire 2; The Reach-In switches to a dump panel silently (games 4; first-visit).
- **On a phone the scene, the tickets and the bell are spread over two or more screens**, behind 11 level chips 32 px tall (games 9; first-visit; lesson-tr2).
- **The Inspection is the counter-example.** The engine term leads, the goal is one plain sentence, the chart is the real artefact, and it is the clearest game (games; language).

### E1. Provenance and status drawn as loudly as the teaching (execution)

The evidence discipline (D-012) is right. Its rendering competes with the sentence it supports.

- Evidence chips are inline blocks inside sentences. tr2.l1 carries 81 tags, and the chip cuts the one paragraph that states the kitchen mapping (language F6, F10; lesson-tr1-tr5a 3; lesson-tr2; precedent).
- A red SYNTHETIC stamp sits on every counter. MEASURED is stamped on a count of zero. ESTIMATED, DERIVED, review, planned and waiting have no legend (language F6; wayfinding 8).
- Pages open with a metadata receipt, and on a phone it fills the first screen (lesson-tr1-tr5a 8).
- The prose column is 576 px on a 1440 screen with the rest empty, code lines clip with no scroll cue, and table cells break identifiers (lesson-tr1-tr5a 9).

### E2. Unfinished and unedited surface (execution)

- **Locked predictions.** The tracker counts 22 of 39 predictions with no run to answer them. Each one I opened shows a lock, a disabled COMMIT ANSWER and "Its reveal waits on W2-T43", while the prose beside them says "commit to one prediction before you read the rule". This is the hardest single block on the site (lesson-tr1-tr5a 1; lesson-tr2; precedent).
- **Build-log language in learner copy.** W1-T21, D-042, Q-10, SHAs, "ASSESSMENT §4.2", "arriving with W2", "No picture yet", "[estimated]" inside question stems, a DESIGN link in the footer, an About stub (language F7; wayfinding 10; lesson-tr1-tr5a 10; games 10).
- **Result copy that contradicts itself.** "THE RULING FALLS." above a body that reads as a pass; "Well fired" for a run worse than the house; a range rule stated only after filing (games 5). Items can repeat one question, and the tally never says pass or fail (lesson-tr2).
- **Small defects.** The "full0" glyph run-on, radios drawn as checkboxes, unlinked "lab 02" references, an empty second BUILD card.

### What the causes share

C2, C3, E1 and E2 have one thing in common: the pages face the build and its evidence rules (trackers, claims, model cards, status), not the learner's next twenty minutes. That would be true under any skin. C1 and C4 are what the chosen world added on top.

## 2. What works and must survive

**The learning loop and its rules**
- Predict, play, debrief, items on fresh seeds, spaced review in Today. Nothing locks, nothing is timed, nothing is sent.
- The confidence picker (GUESS / THINK SO / SURE) and "It does not change now" after a commit.

**The debrief** (the best moment on the site in three reports)
- One plain sentence that states the concept and names the engine term ("That is batching").
- "Yours vs the house" table, the learner's own prediction beside the derived answer, source file and line.
- The diagrams that appear there: Back of House's two swimlanes and "how the two houses differ"; The Inspection's corrected run and red wait dashes.

**Item feedback**
- "You wrote / the key / you said SURE / why", with the arithmetic and the reason each wrong option is wrong.

**The moments where the rule is felt**
- The Inspection's toggle: p99 from 90.1 ms to 5,073.6 ms.
- The Tasting's draw of 10, 100, 1,000 converging on 19/32.
- The Reach-In's "dump the pans" with the cost of each option, and the other requests' shared counts changing at once.
- Service's dark stretches closing when overlap is switched on.
- The bubble figure; tr5a's formulas and its 112 / 1,024 / 4,096 table (260 pages against 768).

**Language that already works**
- The pairing pattern: "FIRE · STEP", "the line · gpu", "BINNED PLATES · GHOST TOKENS", "dumbwaiter down · h2d", "overlap (async scheduling)".
- The one-sentence mapping placed right before the tr5a game.
- Engine-first, sourced, dated lesson prose; pinned citations to real engine lines.
- The honest tone: "this world is a model of the loop, and the real engine is the judge".

**Structure worth keeping**
- The module's "You will be able to" list and its PLAY / BUILD / PROVE / KEEP rows.
- The map's hours by lane (browser, laptop, GPU).
- The lab's six named checks, each with the bug it catches, and the download hash.
- Today's and Evidence's empty states.

**The look, where it is a picture of the concept**
- The Service kitchen as an image of a batch: slots, a CPU side, a GPU side, lamps that show the bubble without words.
- The 2D pool grid and its legend; the 2D bars in The Tasting.

**Floor that must not regress**
- No horizontal overflow at 390 px; a DOM mirror table for every scene; a 2D path beside every 3D one.

## 3. Verdict on The Pass

**The kitchen world is not a root cause. How it is used is.**

- Where the kitchen is a set and the engine word is on the label, auditors call it a delight (Service's scene, the tapes).
- Where the kitchen is the vocabulary, it is the main source of confusion (C1).
- The metaphor is structurally true for one concept. D-047's own contract says "continuous batching is a line kitchen". D-049 and GAMES.md §2.6 then stretched it into an ontology for every game. The strain shows in order of distance from the step loop: The Reach-In (station and pan collide with Service's meanings; mise misleads), The Tasting (the heaviest kitchen on the most abstract idea), Back of House (almost no kitchen left), The Inspection (a third setting, a court).
- Removing the kitchen would not fix C2, C3, E1 or E2. A plain-skinned site with 26,000 px lessons, three answers to "what next" and locked predictions would feel the same.

**For The Pass to stay, all of this would have to be true:**

1. **The engine term is the name** wherever the learner reads, chooses, acts or is graded: game titles, level names, nav, controls, question stems, progress words. The kitchen word may follow it in the pair, and only where a drawn object exists.
2. **A closed, small vocabulary.** About a dozen kitchen nouns for the whole course, one meaning each, shown in a legend on the screen that uses them. "Ticket" means a request and nothing else. The mappings that mislead are dropped.
3. **The kitchen is confined to where the mapping is structural**: the step loop. Other games draw the real artefact (the page pool, the p and q bars, the swimlane, the latency histogram), as their 2D views already do.
4. **Chrome and navigation use plain words.** The world lives in materials, type and voice, as kernelspace's terminal and statespace's paperback do.
5. **It passes a cold test.** A graduate who has never seen the site states each game's goal in engine terms within about 15 seconds of its first screen, and can play it without having read the lesson. D-049's own "revisit when" is a learner test showing that a display name misleads about its concept.
6. **No new kitchen is coined for the four unbuilt games** (Sheet Pan, The Tape, Line Check, The Dumbwaiter). Now is the cheapest moment to stop.

If these cannot be met, the world should be reduced to a look. D-047 and D-049 are the records to supersede, and D-047 is owner-decided, so that is the owner's call to confirm.

**What this asks of whichever style is chosen**
- It names things as the engines name them.
- It gives one next step on every page and tells progress back in words.
- It puts the doing in the first screen of a lesson and keeps the action, the state and the result on one screen.
- It lets provenance be present and quiet.
- It does not depend on a per-concept metaphor or a bespoke 3D scene to teach.

## 4. Constraints a redesign must hold

**Content and claims**
- The engine prose, the pins (D-011, D-035) and every claim stay. Every number keeps its tag, source and date; synthetic data stays labelled (D-012, D-048). The redesign may move and quieten these, not drop them.
- Content is Markdown with eight directive types, compiled to JSON, with no HTML from content (D-016). Lesson JSON is at most 40 KB gz each.
- `verify:content`, `verify:claims`, `verify:numbers`, `verify:kc` and `verify:items` must pass.

**Pure sims and graded mechanics**
- Every game is a pure seeded session shared by its 3D, 2D and DOM views (D-017, D-018). The redesign changes views and copy. It does not change a rule, level, band, score, pass bar, invariant or seed (GAMES.md §2.6, "the rules do not change"; `verify:games`, `verify:determinism`).
- Credit comes only from deterministic checks: no LLM grading, no server, no graded browser timing (D-010). A front-page run earns nothing (D-038).

**The ledger**
- Ids stay: game ids, level ids, actions, ledger refs (`play:<game>/<level>`), KCs, claims, routes and file names (D-049, D-024). Renaming is display copy only, so stored evidence survives.
- Progress is derived from events in this browser at read time. "Telling progress back" must be a new reading of existing events, not new stored state.

**Static site, no server, no telemetry**
- Zero servers, no accounts, nothing collected, no third-party request, self-hosted fonts, a `default-src 'self'` CSP (D-003, D-009, D-033).
- Consequences: "continue where you left off" can only come from the local ledger; a first visit has no state; the redesign cannot be validated by analytics or A/B tests, only by walks and e2e.

**Frozen bundle budgets (D-023, restored by D-059)**
- Entry at most 110 KB gz. Front-page first-paint JavaScript at most 150 KB. First-paint CSS at most 30 KB. Every other route at most 200 KB. `three-vendor` at most 245 KB. Each scene at most 40 KB. `postfx` at most 25 KB. LCP at most 2.5 s, INP at most 200 ms, CLS at most 0.1.
- The front page paints a playable 2D loop from static HTML and upgrades to 3D after LCP.
- Headroom is thin. At the W1 gates restore the front page was 147,337 B (2,663 B under), module and Today pages about 179,800 B, game routes 180,381 to 187,702 B, and all four scenes 39,468 to 39,839 B against 40,000. I did not re-measure on `wave-2`.
- No gate may be raised or added: the merge guard refuses it and the owner's rule is that no gate is weakened. A redesign has to pay for new code by removing code.

**Accessibility gates**
- WCAG 2.2 AA; every core surface usable at 360 px and by keyboard; zero serious or critical axe violations (D-013).
- Every 3D game keeps reduced motion, a 2D path and a DOM mirror (D-018, D-019). Colour is never the only code; numbers stay DOM text (GAMES.md §2.6 rules 6 and 7, D-021).
- One light scheme with a more-contrast variant and no dark scheme; five self-hosted faces pinned by hash; token roles only, no literal colour or font outside `src/design` (D-050, `verify:tokens`).

**Owner decisions the redesign cannot drop on its own**
- The front page opens on a playable 3D step loop (D-004). The course has games, several of them impressive 3D, each rule the concept (D-005). The visual world is The Pass (D-047).
- Changing the naming policy needs a record that supersedes D-049 and edits GAMES.md §2.6.

**Cost already visible**
- About 60 test and e2e files match kitchen copy (my grep for eight kitchen phrases), and four front-page screenshot baselines exist. Renaming is wide but mechanical, and baselines need the owner's review (W3-T08).

**Work still to build** (docs/TRACKER.md: every W2 and W3 task is open; the branch so far carries the grader track)
- **W2, 44 tasks.** The grader and receipts (T01-T12). TR0 with Sheet Pan in 2D and 3D. TR3 with the Trace Room and The Tape. TR4 with Line Check. TR5b with The Dumbwaiter in 2D and 3D. The GPU parts of TR1, TR6 and TR8. TR7. Then:
  - W2-T42: the trace block and the In-production and Build-this cards, which print pending tickets today.
  - W2-T43: the 22 predictions with no run. This one task removes the hardest block in E2.
  - W2-T44: Today's rescheduling from predictions and the calibration view.
- **W3, 17 tasks.** The capstone, the Evidence Pack, change cards, search, then the tasks that already own parts of a redesign: W3-T08 and T09 (identity across pages and scenes), T10 (performance), T11 (accessibility sweep), T13 (claims and copy audit), T15 (About, privacy, licences).
- **Sequencing consequence.** Four games, five modules of content and every W2 lesson are still to be written. Whatever the redesign decides about names, lesson shape and game doors should land before they are, or the same findings will be built five more times.
