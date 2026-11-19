# The finish review, as the reviewer returned it

impeccable's finish review of wave R's finished build ran three times on wave R's own branch and a fourth time on the polish that stacks on it (wave-r2), each on captures of the built site at 1440 x 900 and 390 x 844. This page keeps what the reviewer returned, so that no verdict is softened or summed into a better one in `docs/waves/WR-report.md` §6.2 or under D-062. Round 1 and round 2 are copied as returned, with the paths of the machine that ran them cut to the folder under it. Round 3, which followed the polish on wave-r2, is copied as returned, at the end of this page. Round 2b is copied from the reviewer's report as it reached the record: the end of its fidelity table was cut off there, and what follows `TYPE` in it is not on the page.

The capture names (`front-first-paint-390.png` and the rest) name images that are not in the repository.

## Round 1, on the tip `3c70861` (disposition: fix)

Disposition: fix

#### Per surface
##### Front page (/), 1440 and 390
Verdict: Close at 1440; cramped and partly off-contract at 390. Fix.
Open findings:
- 1440 front-first-paint-1440.png: first paint's focal element is an empty graticule; no ink appears until the fifth action, so the first viewport reads as an empty plot beside a headline. The reference run is not drawn as dashed outlines although that device exists in the 3D (walk capture 15-demo3-step2.png).
- 1440 front-after-step-2d-1440.png and front-after-step-3d-1440.png: the yellow sync slab sits flush against the amber now line; the two read as one amber mark. In 3D the four slot slabs fuse into one green block and the now label moves from above the track (2D) to under the axis.
- 1440 front-first-paint-1440.png: Auto-step wraps alone onto a second dock row, misaligned with Step and Undo.
- 1440 front-returning-1440.png: left column is empty from y 480 to 850; the 3D opening shot is an empty tilted plate.
- 390 front-first-paint-390.png: callout discs 3, 2 and 4 sit on top of the lane glyphs (the colour code's circle and hexagons); 'synthetic ticks' runs into the axis 0; the role line is pushed right of the Parts button.
- 390 front-first-paint-390.png: goal line is truncated behind 'more', hiding the number to beat and the end condition (P4); the phone walk reports 'more' pushes Next off screen.
- 390: no Diagram/3D control (section 3.1 says 3D is one tap away); the 'Start the course' text link is below the first screen (spec y 764 to 808).

##### TR1 lesson 1 (/m/tr1/l1-five-mechanisms), 1440 and 390
Verdict: Read sections sound; the Run is where a first-time learner trips. Fix.
Open findings:
- 1440 tr1-l1-top-1440.png: no instrument edge in the first viewport; a primer, a code block and 'Guess 1 of 2' come first (P3 opener test; P4: a guess is asked before the game's parts list has been on screen). Phone walk trip 8: the guess uses 'stages of the lifecycle model's path' before either word is taught.
- 1440 and 390 tr1-l1-run-1440.png, tr1-l1-run-390.png: Request path intro is a blank sheet with one node; parts 2, 3 and 4 are named but not drawn; disc 1 covers the note; at 1440 disc 5 covers the copies readout; part 5's heading is sliced by the Next bar.
- 1440 tr1-l1-read-midway-1440.png, tr1-l1-keep-1440.png: 'you said 1 stages' and 'guess 1 stages' (plural); the five rules are unnumbered though the text refers to 'the first four' and 'the fifth'.
- 390 tr1-l1-prediction-revealed-390.png: 'Read why' is an outline while the same control is amber at 1440; the viewport has no amber way on.
- 1440 tr1-l1-keep-1440.png and the Sources block: every claim is set in bold at small size; hierarchy is inverted against the source links.
- Phone walk trips 2, 3 and 12 (Request path diagram cannot be scrolled by thumb; hop labels squashed; delta chip over its number) were found at an older tip; floor-midlevel-2d-390.png shows the label and chip defects still present.

##### TR5a lesson 1 (/m/tr5a/l1-why-one-model-needs-several-kv-caches), 1440 and 390
Verdict: Readable; two visible defects in Read and one unverified blocker. Fix.
Open findings:
- 1440 tr5a-l1-read-source-popover-1440.png: the Your-run dock's readout prints '15 of 151296' ('15 of 15' and '1296' collide).
- 390 tr5a-l1-read-source-popover-390.png: the source popover runs past the viewport bottom and over the pinned Next-part bar; 'In the list of sources' is cut off and the amber bar shows behind the popover's corner.
- 1440 tr5a-l1-top-1440.png: the embedded game title is set at the lesson h1's scale; two display titles compete in one viewport.
- 1440 tr5a-l1-game-result-1440.png: three 'synthetic' stamps on one instrument; way on is an ink button; the result panel sits under the diagram so diagram, control and readout no longer share the viewport (P5).
- 1440 tr5a-l1-game-result-1440.png and tr5a-l1-read-source-popover-1440.png: shadowed sheets (diagram, result, Questions) sit inside the lesson's paper sheet: nested sheets against the Flat Paper Rule and the floor.
- 390 tr5a-l1-game-midlevel-390.png: the pinned dock covers the page pool being changed and shows 1.3 of the admit options; 390 tr5a-l1-top-390.png: breadcrumb wraps to three slash-led lines.
- Unverified in this packet: phone walk trip 1 (lesson-to-lesson navigation into this lesson crashes with React error 185, 3 of 3, at tip 87c2bb0). No capture at 3c70861 shows it fixed.

##### Step loop (/play/loop), 1440 and 390, 2D and 3D
Verdict: The strongest instrument; intro and phone result need repair. Fix.
Open findings:
- 1440 loop-intro-1440.png: disc 4 covers the 'empty' label of slot 2 ('mpty'); disc 3 clips the CPU lane label; a 135 px band of blank paper sits under the axis.
- 1440 and 390 loop-intro-*.png: an amber triangle and the word 'now' sit between Next and Skip intro and read as a third control, while the legend defines now as 'the CPU's clock'.
- 390 loop-result-390.png: the heading 'Your run against the reference run's' has nothing under it (the table is missing or below the dock's fold); the diagram is scrolled out at the result (P5).
- 390 loop-midlevel-2d-390.png: axis label 16 is clipped at the right edge; no 3D control is offered at 390.
- 1440 loop-result-1440.png: the level-1 table lists 'Ghost tokens' and 'Bubble' before either is named.
- 1440 loop-midlevel-3d-1440.png: the scene uses about half its box, with empty ground above and below; queue chips are duplicated in the dock. Walk captures 103-loop-3d-compare.png and 103-loop-3d-scale.png (older tip): Compare earns the 3D; lane labels overprint slabs in Compare and Scale.

##### KV page pool (/play/pool), 1440 and 390, 2D and 3D
Verdict: 2D clear; result dock and 3D below the bar. Fix.
Open findings:
- 1440 pool-result-1440.png: dock text is sliced mid-line by the readout strip; the heading touches the sheet's top edge; two 'synthetic' stamps; 'Next level' is ink, not amber.
- 1440 pool-result-1440.png, pool-midlevel-2d-1440.png: cached pages are solid yellow in 2D but hatched in the 3D legend; a pool of 43 solid yellow cells reads as a field of the marker colour.
- 1440 pool-intro-1440.png, pool-midlevel-2d-1440.png: the graticule runs behind the page cells at a different pitch (it is neither the cell grid nor an axis) and stops in an open comb at y 657.
- 1440 pool-midlevel-3d-1440.png: free cells are solid dark grey frames, heavier than pages in use (2.8: empty is a dashed wire outline); the DOM labels 'KV page pool, 44 pages' and 'Running batch' are crossed by the thread arcs; the page field's placeholder is clipped to '1 to'.
- 390 pool-midlevel-3d-390.png: the scene is too small to read (R6, R2, R4 overprint their boxes); the third camera, the selector and the caption are under the dock.
- 390 pool-result-390.png: text sliced by the readout; diagram out of view at the result; a 160 px band of bare ground under the footer.
- 390 pool-midlevel-2d-390.png: the dock shows 1.3 of four options; 'Admit none this step' is hidden.

##### Rejection sampler (/play/verifier), 1440 and 390, 2D and 3D
Verdict: Best 2D drawing of the set; unfinished at 390 and in 3D. Fix.
Open findings:
- 390 verifier-midlevel-2d-390.png, verifier-midlevel-3d-390.png: 'Draw 1,000' is sliced by the readout and Finish, the control that ends the level, is hidden in the dock (P5).
- 390 verifier-result-390.png: no 'Next level' control in the viewport; text sliced; diagram out of view; bare ground under the footer.
- 1440 verifier-intro-1440.png and 390 verifier-intro-390.png: callouts sit in the legend and caption, not on the bars; disc 1 covers the target-p glyph; disc 3 splits the sentence 'Each token ... has two bars', and at 390 the hole remains with no disc.
- 1440 verifier-result-1440.png: a stamp inside a sentence ('synthetic The figures below are of a made-up world.') plus a second stamp in the readout; 'Next level' is ink; dock body is set at reading size here and at small size in the other games.
- 1440 verifier-midlevel-3d-1440.png: at level 1 there is one draft position, so depth carries nothing and the scene is the bar chart in perspective; pink caps and floating black outline frames are not in the legend; the scene fills about a quarter of its box.
- 390 verifier-midlevel-3d-390.png: value labels overprint each other; the third camera is under the dock; 390 verifier-midlevel-2d-390.png: the caption is sliced by the dock.
- 1440 verifier-intro-1440.png: bars have no value axis, the graticule is not their scale, and 180 px of blank paper sits under them.

##### Tensor views (shape-shifter) and KV offload (switchyard)
Verdict: Not built; nothing to review.
Open findings:
- Neither is in the registry; REDESIGN.md section 7 defers them to W2-T14/15 and W2-T30/31. Only three games carry 3D today. The Games index lists 'Tensor views. Not published yet' first (phone walk trip 16).

##### Request path (/play/engine-floor), 1440 and 390, 2D only
Verdict: The result drawing is good; the intro and the phone play surface are not ready. Fix.
Open findings:
- 1440 floor-intro-1440.png and 390 floor-intro-390.png: a blank sheet with one node and a full-width amber line; the list says 'The numbers on the drawing match this list' while parts 2, 3 and 4 are not drawn (P4); disc 1 covers the note; the request node carries a second amber ring beside the one on Next.
- 390 floor-midlevel-2d-390.png: hop labels between same-column stages are squashed to slivers (the mechanism words are the lesson); column head reads 'One pr…'; '+1' chips sit over the numbers; the legend's last row and the stage list's first row are sliced by the dock.
- 1440 floor-midlevel-2d-1440.png: the swimlane uses the left 40 percent of the sheet; the dock is scrolled so the filter field and tabs are cut at the top; the last tab is clipped at the right.
- 1440 floor-result-1440.png: two 'derived' stamps; dock text sliced at the bottom; 'Next level' is ink; body at reading size against small size elsewhere.
- Phone walk trip 10: 'Finished (practice)' opens with 'The first stage that did not hold' on a run that reached the client (older tip; floor-result captures here show a first-run pass only).

##### Course (/map), 1440 and 390
Verdict: Holds. One contract miss.
Open findings:
- 1440 course-map-1440.png and 390 course-map-390.png: the unpublished TR0 title is underlined like a link (3.2: 'It is not a link'); the front page's path table does not underline unpublished rows.
- Three amber position marks in one viewport (next-step block, the TR1 node, lesson 1's 'Next') plus the amber button: one meaning, repeated three times.
- Phone walk trip 4 (older tip): 'Last time: you tried 6 questions in TR1 lesson 3' for a lesson never opened; lessons marked started without a visit. Not shown fixed in this packet; it breaks 'true statements only'.

#### Material fixes
- P5, docks slice the action and the result. Rejection sampler 390 (verifier-midlevel-2d-390.png, verifier-result-390.png: Finish and Next level hidden), Step loop 390 (loop-result-390.png: comparison heading with no table), KV page pool 390 and 1440 (pool-result-390.png, pool-result-1440.png: text cut mid-line), Request path 1440 and 390 (floor-result-1440.png, floor-midlevel-2d-390.png). Put the primary control first in the dock, pin only the readout, let the dock take its content height on phones, and never cut a line or a button in half.
- P4, Request path intro names parts that are not drawn. Request path and TR1 lesson 1, 1440 and 390 (floor-intro-1440.png, floor-intro-390.png, tr1-l1-run-1440.png, tr1-l1-run-390.png). Draw the process columns and one sample hop during the intro so discs 2 to 4 land on the drawing; move disc 1 off the note. At 390 (floor-midlevel-2d-390.png) give same-column hops a label slot, un-truncate 'One process', and place delta chips after their numbers.
- One Marker Rule. (a) The way on at a result is ink in KV page pool, Rejection sampler, Request path and the TR5a embed, and amber in Step loop (pool-result-1440.png, verifier-result-1440.png, floor-result-1440.png, tr5a-l1-game-result-1440.png and their 390 pairs, against loop-result-1440.png): make it the amber control wherever no move is in hand. (b) Solid code-yellow reads as the marker: hatch cached pages in the pool's 2D as its 3D legend already says (pool-result-1440.png) and separate the sync slab from the now line (front-after-step-2d-1440.png, front-after-step-3d-1440.png). (c) 'Read why' is amber at 1440 and outline at 390 (tr1-l1-prediction-revealed-390.png).
- Quiet Provenance Rule: one stamp per instrument, none in a sentence. Rejection sampler 1440 (verifier-result-1440.png: stamp inside a sentence plus a second), KV page pool 1440 (pool-result-1440.png: two), Request path 1440 (floor-result-1440.png: two), TR5a lesson 1 1440 (tr5a-l1-game-result-1440.png: three).
- 3D must be the same diagram and earn its box. KV page pool 1440 (pool-midlevel-3d-1440.png): draw free cells as dashed wire outlines per 2.8 and keep labels clear of the threads. Rejection sampler 1440 (verifier-midlevel-3d-1440.png): withhold 3D on levels with one draft position, and put the pink caps and outline frames in the legend or remove them. Both at 390 (pool-midlevel-3d-390.png, verifier-midlevel-3d-390.png): scale the scene to its box and uncover the camera row, or do not offer 3D on phones. Front page and Step loop 390: either offer the 3D control 3.1 promises or amend 3.1. Front 1440 (front-after-step-3d-1440.png): keep a gap between slot slabs and keep 'now' where the 2D puts it.
- Contract check 4: Data Book has no concept seed. .impeccable/surfaces/src-front-frontpage-tsx.md line 49 discloses that no roll was dealt. Record the owner's acceptance from the 2026-11-16 look gate in that brief's FORM, or deal and record a roll, before DESIGN.md is final; and rewrite the game, map and lesson surface briefs, which still specify The Pass.
- Callout and readout collisions. Step loop 1440 (loop-intro-1440.png: disc 4 over 'empty'), front page 390 (front-first-paint-390.png: discs over the lane glyphs; 'synthetic ticks' into the axis 0), Rejection sampler 1440 and 390 (verifier-intro-1440.png, verifier-intro-390.png: discs in the legend, a hole in the caption sentence), TR1 lesson 1 1440 (tr1-l1-run-1440.png: disc 5 over the copies readout), TR5a lesson 1 1440 (tr5a-l1-read-source-popover-1440.png: readout prints '15 of 151296'). Give discs a gutter of their own, as the front page does at 1440, and give readout cells a fixed gap.
- Source popover on a phone. TR5a lesson 1 390 (tr5a-l1-read-source-popover-390.png): the popover runs past the viewport and over the pinned Next-part bar, cutting off 'In the list of sources'. Present it as a bottom sheet above the bar, or cap its height and scroll inside it; set the claim at regular weight so the source link leads (also tr5a-l1-read-source-popover-1440.png).

#### Report
disposition: fix

Inputs and coverage: review-wr/walk-final-first/report.md is missing (the folder holds screenshots and driver logs only; I used three of its screenshots). Tensor views and KV offload are not built, so three games carry 3D, not five. Broken benchmark has no capture and was not reviewed. Not opened: design-page-*, header-focus-*, front-focus-main-control-390, loop-focus-step-390, tr5a-l1-game-intro-390, tr5a-l1-game-midlevel-1440; REDESIGN.md sections 2.2, 2.3, 2.5 to 2.7, 3.3 to 3.10 and most of 2.4; PRODUCT.md body; surface briefs beyond a seed grep. No pixel tooling here, so colour was judged by eye. The phone walk ran at tip 87c2bb0, the captures at 3c70861; walk findings not visible in a capture are marked unverified.

Check 0, evidence: every capturable required capture exists at 1440x900 and 390x844 and shows what its name claims. pool-result-390.png and verifier-result-390.png show 160 px of bare ground under the footer; it is ground colour under a rendered footer, so I read it as a page defect and list it, not as a broken capture. Front and Step loop have no 3D capture at 390 because the build offers no 3D control there.

#### persistence
Fail, two items.
- Seed: .impeccable/surfaces/src-front-frontpage-tsx.md line 49 states Data Book has no seed reference because no roll was dealt. The only seed on file (seed:631f6361e61b6b7b) belongs to The Pass. The roll was skipped and disclosed; the brief leaves it to the owner to accept or ask for a roll, and no acceptance is recorded in FORM.
- Surface briefs: 13 of 14 files in .impeccable/surfaces/ are dated 2026-11-15 and still specify The Pass (the Request path brief describes a house in cutaway). Only the front page brief was rewritten.
- Pass: PRODUCT.md exists. Code-led build, so no state.json, spec.json, mocks or diff are owed. DESIGN.md exists and is judged after this review.

#### fidelity
No approved comp. Judged against REDESIGN.md 2.8 (OWN-WORLD), 2.9, 3.1, 3.2 and principles P1 to P7.

| Element | State | Evidence |
|---|---|---|
| TYPE | match | Big Shoulders Display 800 in sentence case on page, lesson and game titles; Atkinson Hyperlegible body; mono tabular numerals. |
| TYPE, scale relationship | contradicted | tr5a-l1-top-1440.png: the embedded game title is as large as the lesson h1. |
| MATERIAL, 2D | match | Flat paper, square corners, one soft sheet shadow, no faked physicality. |
| MATERIAL, nested sheets | contradicted | Shadowed sheets inside the lesson's paper sheet (tr5a-l1-game-result-1440.png); Flat Paper Rule allows one shadow for a sheet. |
| MATERIAL, 3D Step loop | match | Matte slabs on an engraved pale plate, amber now sheet. |
| MATERIAL, 3D KV page pool | contradicted | Free cells are solid dark grey frames; 2.8 says dashed wire outlines (pool-midlevel-3d-1440.png). |
| MATERIAL, 3D Rejection sampler | added without approval | Pink caps and floating black outline frames, absent from the legend (verifier-midlevel-3d-1440.png). |
| GROUND | match, by eye | OWN-WORLD names #e9ece6 flat; the field reads as a cool pale grey-green with no texture and no warm drift. Not pixel-sampled. |
| One amber marker, amber only 'now' | contradicted in part | Ring on R1 and the now line hold at first paint. Breaks: solid code-yellow beside or in place of amber; ink way-on at three games' results; a second amber ring on the Request path node; amber/outline mismatch for 'Read why' across sizes. |
| Dimension lines | missing outside Step loop | Present on idle intervals in the loop ('3 ticks' with end ticks, walk capture 15-demo3-step2.png, older tip). None in any round-1 capture; none in pool, sampler or Request path. |
| Graticule | contradicted in pool and sampler | It is neither the cell grid nor a value axis there, and it ends in an open comb (pool-intro-1440.png, verifier-intro-1440.png). Match in Step loop. |
| Legend with glyphs, title block | match | Every instrument. |
| Stamp, one per instrument | contradicted | Two or three at results; one inside a sentence (verifier-result-1440.png). |
| Callouts as ink discs | match in form, contradicted in placement | Collisions listed in material fix 7; Request path names undrawn parts. |
| Source popover | match at 1440, contradicted at 390 | Square, lift shadow, claim, quote, tag, link, checked date at 1440; overflows the viewport and the pinned bar at 390. |
| Front page topology, 1440 | match | Left column, instrument, strips, five discs, amber at first paint as 3.1 specifies. Uncited deviations: Auto-step wraps to its own row; goal line runs three lines. |
| Front page topology, 390 | contradicted in part | No 3D control (3.1: one tap away); goal line truncated; 'Start the course' link below the first screen. |
| Course topology | match | Next-step block, track line, nodes, open module. Unpublished TR0 title is underlined like a link: contradicted. |
| 3D is the same diagram | Step loop match, pool partial, sampler contradicted at level 1 | Loop keeps the axis and lanes (slabs fuse; now label moves). Sampler's depth axis is empty at level 1. Compare camera earns its place (walk capture 103-loop-3d-compare.png). |
| P5, action, state and result on one screen | contradicted at 390 results and in docks | Material fix 1. Holds at level start at both sizes and on the front page. |
| P4, name then ask | contradicted on Request path and TR1 lesson 1 | Material fix 2; goal line truncated at 390. |
| P1, engine names only | match in captures | Walk reports 'this level's own night' and the id engine-floor (older tip, unverified). |

Contract blocks. THESIS (engine names, one way on, run first, the engine's own diagram): kept on the front page and Course; partly kept in lessons (TR1 opens on a primer and a guess). STORY (way on as header Continue, amber button and a sentence): kept ('You left off in TR2 lesson 1. Next: read why.'). FIRST VIEWPORT: the memory is a condensed headline beside an empty timing grid with one ringed chip; the grid carries no ink until the fifth action. FORM: no seed (see persistence).

Truth: synthetic and derived stamps present; hours marked estimated and derived; unpublished modules marked. Unverified from the walk: the Course states facts about the learner that are false ('you tried 6 questions in TR1 lesson 3').

Floor: no eyebrows, gradient text, hard shadows, glass or glyph icon sets. Nested sheets in lessons. The 'State as a table' disclosure uses the browser's default triangle. Detector: 12 advisory font-size findings, all off-ramp sizes against the old DESIGN.md.

#### ceiling
- Dimension lines stop at the Step loop. The sampler's overlap, the pool's prefix-hit run and the Request path's boundary count are not dimensioned.
- The reference run drawn under the learner's own appears only as result bars and a table, and as outlines in one 3D level. It is absent from the 2D diagrams and from first paint.
- The sampler has no value axis; its graticule is not its scale.
- The 3D scenes use a quarter to a half of their boxes; only the loop's Compare camera shows something the 2D cannot.
- Motion and the one authored moment cannot be judged from stills.

#### material_fixes
1. P5, docks slice the action and the result: sampler 390 (verifier-midlevel-2d-390.png, verifier-result-390.png), loop 390 (loop-result-390.png), pool 390 and 1440 (pool-result-390.png, pool-result-1440.png), Request path (floor-result-1440.png, floor-midlevel-2d-390.png).
2. P4, Request path intro names undrawn parts: floor-intro-1440.png, floor-intro-390.png, tr1-l1-run-1440.png, tr1-l1-run-390.png; phone labels in floor-midlevel-2d-390.png.
3. One Marker Rule: amber way-on at every result; hatch or separate code-yellow from the marker; 'Read why' consistent across sizes (pool-result-1440.png, verifier-result-1440.png, floor-result-1440.png, front-after-step-2d-1440.png, tr1-l1-prediction-revealed-390.png).
4. Quiet Provenance Rule: one stamp per instrument, none in a sentence (verifier-result-1440.png, pool-result-1440.png, floor-result-1440.png, tr5a-l1-game-result-1440.png).
5. 3D is the same diagram and earns its box: pool empty cells, sampler level 1, both at 390, front and loop 390 control (pool-midlevel-3d-1440.png, verifier-midlevel-3d-1440.png, pool-midlevel-3d-390.png, verifier-midlevel-3d-390.png, front-after-step-3d-1440.png).
6. Seed and briefs: record the owner's acceptance or deal a roll; rewrite the stale surface briefs.
7. Callout and readout collisions (loop-intro-1440.png, front-first-paint-390.png, verifier-intro-1440.png, verifier-intro-390.png, tr1-l1-run-1440.png, tr5a-l1-read-source-popover-1440.png).
8. Source popover on a phone (tr5a-l1-read-source-popover-390.png).

Outside the eight, to confirm before shipping: phone walk trip 1 (React error 185 on lesson-to-lesson navigation into TR5a lesson 1) and trip 4 (false facts about the learner) have no capture at 3c70861 showing them fixed.

#### keep
The Step loop's timing diagram with its glyph legend, the single amber now line, the ringed first control, and the plain named sentences ('That is batching.', 'You left off in TR2 lesson 1. Next: read why.').

## Round 2, on the tip `3e516ed` (disposition: recapture; no surface judged)

Disposition: recapture

#### Per surface
##### Front page (1440 and 390)
Verdict: unjudged
Open findings:
- front-focus-main-control-1440.png is byte-identical to front-first-paint-1440.png and shows no keyboard focus on R1; retake with focus kept.
- front-focus-main-control-390.png is byte-identical to front-first-paint-390.png; retake with focus kept.
- header-focus-continue-1440.png is byte-identical to front-returning-1440.png; the header Continue shows a 1 px outline and no focus ring; retake with focus kept.
- header-focus-continue-390.png is byte-identical to front-returning-390.png; retake with focus kept.
- No capture shows a dimension line in the diagram; add a state with a bubble (demo level 2 after the step that leaves the gap), Diagram at 1440 and 390 and 3D at 1440.

##### TR1 lesson 1 (1440 and 390)
Verdict: unjudged
Open findings:

##### TR5a lesson 1 (1440 and 390)
Verdict: unjudged
Open findings:
- tr5a-l1-game-intro-390.png and tr5a-l1-game-midlevel-390.png show the dock over the KV page pool grid with cells cut at half height; retake at the scroll position the frame itself sets, and say so in capture-list.md, so the cut can be attributed to the page or to the driver.

##### Step loop (1440 and 390)
Verdict: unjudged
Open findings:
- loop-result-390.png shows the result with no diagram on screen; retake at the scroll position the page itself leaves after the last step, with no driver scroll.

##### KV page pool (1440 and 390)
Verdict: unjudged
Open findings:
- pool-result-390.png shows the result with no diagram on screen; retake at the page's own scroll position.

##### Rejection sampler (1440 and 390)
Verdict: unjudged
Open findings:
- verifier-result-390.png shows the result with no diagram on screen; retake at the page's own scroll position.

##### Request path (1440 and 390)
Verdict: unjudged
Open findings:
- floor-result-390.png shows the result with no diagram on screen; retake at the page's own scroll position.

##### Shape-shifter and Switchyard
Verdict: not built, no capture
Open findings:

##### Course (1440 and 390)
Verdict: unjudged
Open findings:

#### Material fixes

#### Report
disposition: recapture

Missing or unusable inputs: review-wr/walk-final-first/report.md does not exist (the folder holds 121 screenshots and no report); the phone walk report describes tip 87c2bb0, not 3e516ed; `impeccable` is not on PATH in this shell, so `concept-seed --check-seed` could not run. Not opened: design-page-*, loop-intro-390, loop-focus-step-390, pool-intro-390, tr1-l1-keep-390, tr1-l1-read-midway-390, tr5a-l1-game-intro-1440, verifier-midlevel-2d-1440, loop-midlevel-2d-1440, front-full-page-390.

No verdict is given on the eight round-1 fixes or on any surface. Four captures in the packet do not show what their names claim, so check 0 fails and the build is owed a full re-review on valid captures.

#### recapture

All paths are under review-wr/final/.

**Invalid: content does not match the filename**

| File (round-2/) | What it is | What a valid capture shows |
|---|---|---|
| front-focus-main-control-1440.png | Byte-identical to front-first-paint-1440.png (md5 a127c044...) | R1 holding keyboard focus: the ink focus ring (3 px, 2 px offset, paper halo) drawn together with R1's amber intro ring and distinguishable from it |
| front-focus-main-control-390.png | Byte-identical to front-first-paint-390.png (md5 78b31556...) | The same, at 390 |
| header-focus-continue-1440.png | Byte-identical to front-returning-1440.png (md5 75f0b749...); the header's "Continue: TR2 lesson 1, read why" has a 1 px outline and no ring | The ink focus ring on the header's Continue, with the amber Continue in the left column unfocused |
| header-focus-continue-390.png | Byte-identical to front-returning-390.png (md5 4610cc7a...) | The ink focus ring on the compact header "Continue" |

Cause, in the capture driver: `shot()` in drv2/lib.ts line 22 blurs `document.activeElement` unless its fifth argument `keepFocus` is true. drv2/capA.ts lines 19 and 22 call it without that argument:

```
await L.shot(p,'front-focus-main-control',w)
await L.shot(p,'header-focus-continue',w)
```

drv2/capE.ts line 11 passes `{},true`, and loop-focus-step-1440.png does show the ring, so that capture is valid. Passing `{},true` at the two capA call sites is the whole correction.

**Retake in the same pass, so the re-review can decide what it was asked**

- **Phone results:** loop-result-390.png, pool-result-390.png, verifier-result-390.png, floor-result-390.png each show the result with no diagram on screen. wr/reports/fix-finish-1.md line 18 says the capture script scrolls `[data-result]` to block start and the page itself does not. I did not find that scroll in the driver, so this rests on the builder's statement. Round-1 fix 1 (P5 at the result on a phone) cannot be scored from a scroll position the learner never gets. A valid capture is taken where the frame itself leaves the page after the run's last action.
- **TR5a lesson 1 at 390:** tr5a-l1-game-intro-390.png and tr5a-l1-game-midlevel-390.png show the dock lying over the KV page pool grid, with cells cut at half height. I cannot tell whether that position is the page's or the driver's. A valid capture is taken at the position the frame sets when the intro opens and when the level starts, and capture-list.md says so.
- **Dimension lines:** the packet asks for the hardest look at them, and no capture shows one in a diagram. A valid capture is a step loop state with a bubble (demo level 2, "Refill a slot", after the step that leaves the gap), in Diagram at 1440 and 390 and in 3D at 1440, showing the interval with its end ticks and value.
- **Broken benchmark:** the fix batch changed it (debrief order, stamp, body height at the result) and neither round holds a capture of it. Add intro, mid-level and result at both sizes if the verdict is meant to cover it.

The captures not listed above are well-formed: 1440x900 and 390x844 as named, no blank regions, content matching their names.

## Round 2b, the second review on valid captures, on the tip `4a41050` (disposition: fix)

The captures were retaken after round 2 and are all valid (check 0 passes: 84 viewport captures, 1440 x 900 or 390 x 844, no two byte-identical, the four focus captures show the ink ring). The reviewer had no pixel tooling, so colours were judged by eye. It did not open `design-page-*` (4 files), `loop-focus-primary-390`, `pool-focus-primary-390`, `verifier-focus-primary-1440` and `-390`, the phone walk report, the first walk report beyond its trip headings, `fix-final-walk.md` beyond trip 11, REDESIGN.md outside sections 2.8, 2.9, 3.1, 3.2 and 5.4 (read by search, not in full), the bodies of PRODUCT.md and DESIGN.md, or the surface briefs beyond their FORM lines. Motion and the one authored moment cannot be judged from stills. Tensor views and KV offload are not built.

### Per surface

#### Front page (`/`), 1440 and 390

Verdict: Close. Holds at 1440 in Diagram; the phone's first screen still hides the goal and swaps out the lane glyphs.

Open findings:

- 390 front-first-paint-390.png: callout discs 3, 2 and 4 stand in place of the CPU circle and the slot 1 and slot 2 hexagons, so the rows read '2 1' and '4 2' and the colour code's glyphs are gone exactly while the list explains them; slots 3 and 4 keep theirs.
- 390 front-first-paint-390.png, front-returning-390.png: the goal line is cut behind 'more', hiding the number to beat and the end condition (P4); the role line still sits to the right of the Parts button.
- 1440 front-first-paint-1440.png: the focal element is still an empty graticule until the fifth action; the reference run is not drawn; Auto-step still wraps alone onto a second dock row (section 3.1 puts Step, Undo and Auto-step on one row).
- 1440 front-returning-1440.png: the 3D opening shot is an empty tilted plate; the word 'now' overprints the lower edge of the R1 chip; the queue chips R1 to R6 are drawn twice (scene and dock); the left column is empty from y 480 to 850.
- 1440 front-after-step-2d-1440.png and 390 front-after-step-2d-390.png: the yellow sync slab is now parted from the now line by about 2 px; at 390 the two still read as one yellow-and-amber mark.
- 1440 front-demo2-dimension-diagram-1440.png: the dimension line is present (end ticks, '3 ticks'), but the value fills the whole interval so no line shows between the ticks; in 3D (front-demo2-dimension-3d-1440.png) the 'idle' word is clipped by the CPU slab.
- 1440 front-after-step-2d-1440.png: the page's own scroll (y 36) leaves the header cut through its text.

#### TR1 lesson 1 (`/m/tr1/l1-five-mechanisms`), 1440 and 390

Verdict: Reads well; the Run is better but its intro still breaks the marker rule and the phone path loses its mechanism words. Fix.

Open findings:

- 1440 and 390 tr1-l1-run-game-intro-1440.png, tr1-l1-run-game-intro-390.png: two amber rings (the request node and Next), a full-width amber now line and a '▷ now' mark between Next and Skip intro in one viewport; the list says 'The numbers on the drawing match this list' and disc 3 (Stage list) has nothing drawn; at 1440 part 5's disc shows as a sliver behind the Next bar; about 300 px of blank sheet under the example.
- 390 tr1-l1-after-run-390.png: hop labels between stages in one column are slivers; only the last two rows of the path are on screen with the result.
- 1440 tr1-l1-after-run-1440.png, tr1-l1-keep-1440.png and 390 tr1-l1-keep-390.png: 'you said 1 stages' and 'guess 1 stages'.
- 1440 tr1-l1-read-midway-1440.png: the five rules are still unnumbered while the text says 'the first four' and 'the fifth'; the Your-run dock's column head reads 'One proce…'.
- 1440 tr1-l1-top-1440.png: still no instrument edge in the first viewport (a primer, a code block, then Guess 1 of 2). The guess now defines 'stages' before asking, which answers the walk's trip.
- 1440 tr1-l1-after-run-1440.png: the swimlane uses the left 40 percent of its sheet.
- Not shown by any capture: lesson-to-lesson navigation (React error 185). fix-final-walk.md reports it fixed with an e2e test; every lesson capture here is a direct load.

#### TR5a lesson 1 (`/m/tr5a/l1-why-one-model-needs-several-kv-caches`), 1440 and 390

Verdict: Near. Result and source popover are right at both sizes; the intro on a phone covers the part it names.

Open findings:

- 390 tr5a-l1-game-intro-390.png: the 'What you are looking at' panel lies over the KV page pool grid, leaving half-height cell tops under the disc that names the pool (driver-scrolled, but the panel is pinned by the page's own layout).
- 1440 tr5a-l1-top-1440.png, tr5a-l1-game-intro-1440.png: the Next bar slices a line of the parts list ('Every KV page on the GPU, in rows of 16. A', 'The admitted requests, one to a slot. Each'); disc 2 (KV page) stands at the end of the legend, not on a page.
- 1440 tr5a-l1-game-result-1440.png, tr5a-l1-game-midlevel-1440.png: the diagram sheet and the dock sheet each carry a shadow inside the lesson's own paper sheet (Flat Paper Rule: one shadow for a sheet).
- 1440 tr5a-l1-read-source-popover-1440.png: in the Your-run dock the graticule runs behind the readout's words and numbers, where it is neither axis nor cell grid.
- 390 tr5a-l1-top-390.png: the breadcrumb still wraps to three slash-led lines.
- 390 tr5a-l1-game-midlevel-390.png: holds (pool whole, two options whole, readout); the running-batch row is cut under the lesson bar and 'Admit none this step' is below the dock's fold.

#### Step loop (`/play/loop`), 2D and 3D, 1440 and 390

Verdict: Holds in 2D at both sizes; the strongest instrument. The 3D opening shot adds nothing yet.

Open findings:

- 1440 loop-midlevel-3d-1440.png: the scene uses about half its box, with bare ground above and below; the word 'now' overprints the lower edge of the R3 chip; the queue chips are drawn twice (scene and dock). At the Lifted camera with two requests admitted the scene shows nothing the diagram does not; Compare, the camera that earns the 3D, is not captured this round.
- 390 loop-intro-390.png, loop-midlevel-2d-390.png, loop-result-390.png: the axis label 16 is clipped at the right edge ('1('); at the intro the sixth queue chip is off the edge with no '+1' count (the front page shows '+2').
- 1440 and 390 loop-intro-1440.png, loop-intro-390.png: the '▷ now' mark still stands between Next and Skip intro and reads as a third control; about 120 px of blank paper under the axis at 1440.
- 1440 loop-result-1440.png: the level 1 table still lists 'Ghost tokens' and 'Bubble' before either is named.

#### KV page pool (`/play/pool`), 2D and 3D, 1440 and 390

Verdict: Close. Result and hatched cache are right; the phone dock and the grid behind the cells are not.

Open findings:

- 390 pool-midlevel-2d-390.png: the third admit option ('Admit R4') is cut through its text by the readout and 'Admit none this step' is hidden; the fix report says the three options show whole.
- 1440 pool-intro-1440.png, pool-midlevel-2d-1440.png: the graticule runs behind the page cells at a pitch that is not the cells' (REDESIGN 2.8: the graticule is the time axis or the cell grid) and stops in an open comb at about y 655, over roughly 190 px of blank paper.
- 1440 pool-intro-1440.png: disc 2 (KV page) stands at the end of the legend row, not on a page.
- 1440 pool-midlevel-3d-1440.png: free cells are now dashed wire outlines and the labels are clear of the threads, but the scene uses about half its box, the thread arcs run through the 'R1' label on its tile, and the 3D legend uses square texture swatches where the 2D legend uses the circle, diamond and hexagon glyphs.

#### Rejection sampler (`/play/verifier`), 2D and 3D, 1440 and 390

Verdict: 2D holds at both sizes and is the best drawing of the set; the chain's 3D scene is not legible yet.

Open findings:

- 1440 verifier-midlevel-3d-1440.png (level 3, chain): depth now carries the draft positions, but value tags overprint one another in the middle rows (16, 20, 26, 21, 18, 17), the black collar frames stand tilted and detached, some with no bar inside them (right of token 5 in rows 1 and 3, left of token 1 in row 2), and the collar and the pale grooved top are explained only in a four-line caption, not in the legend row.
- 390 verifier-result-390.png: at the page's own resting scroll the 'Run again' and 'New numbers' row is cut in half by the readout.
- 1440 verifier-intro-1440.png and 390 verifier-intro-390.png: the Next bar slices the parts list (part 5's heading at 1440, a line of part 1 at 390); the bars still have no value axis and the graticule is not their scale; about 180 px of blank paper under the bars at 1440.
- 1440 verifier-result-1440.png: the dock sets its first paragraphs at note size and the closing paragraph at reading size.
- 390 verifier-intro-390.png: two readout labels wrap to two lines and their values sit off the others' baseline.

#### Request path (`/play/engine-floor`), 2D only, 1440 and 390

Verdict: The result is good at both sizes; the intro and the phone play surface still need work. Fix.

Open findings:

- 390 floor-midlevel-2d-390.png, floor-result-390.png: hop labels between stages in one column are still slivers; the mechanism words are the lesson. The fix report lists this as left.
- 390 floor-midlevel-2d-390.png: the dock cuts the legend's last row and the stage list's first row; readout cells touch ('stages laid' runs into the next 0, 'copies' into the next 0).
- 1440 floor-midlevel-2d-1440.png: the dock is scrolled so the filter field and the tabs are cut at the top and the last tab is clipped at the right, at the page's own scroll; the swimlane uses the left 45 percent of the sheet; the row number 04 touches the 'now' word.
- 1440 and 390 floor-intro-1440.png, floor-intro-390.png: two amber rings (request node and Next), the full-width now line and the '▷ now' mark by Next; disc 3 (Stage list) has no drawn target while the list says the numbers match; about 350 px of blank sheet under the example at 1440; at 390 the IPC label straddles both example boxes.
- Not shown by any capture: a run that stopped and was run again (the walk's 'first stage that did not hold' on a run that reached the client). fix-final-walk.md reports it reworded.

#### Broken benchmark (`/play/broken-bench`), 2D only, 1440 and 390

Verdict: Not ready. First time under review; action, state and result do not share the screen at either size.

Open findings:

- 390 bench-midlevel-2d-390.png, bench-intro-390.png: the chart is cut to a strip about 65 px tall (its title tags and the first tick marks) between the tabs and the legend, so the state is not on screen while the flaw is chosen.
- 1440 bench-midlevel-2d-1440.png: the report form's three number fields are cut in half by the readout, the flaw list is cut through its fourth row, the Setup table is cut at 'Requests', and the control that files the report is not in view.
- 1440 bench-result-1440.png and 390 bench-result-390.png: the readout strip shows its heading and stamp only; its values are below the viewport's foot. At 390 the corrected-run chart is cut at the 1 s line by the legend.
- 1440 bench-intro-1440.png: discs 4, 1, 2 and 3 are stacked in the gutter; disc 1 (Claim) is about 450 px from the reported p99 it names and disc 3 (Timeline) stands beside nothing.
- 1440 bench-result-1440.png: three boxed 'synthetic' stamps in one viewport (one under each chart, one in the readout); 'Passed' is set in the display face where every other game sets its verdict in the bold text face.
- All bench captures: the charts carry tan upper-case tape labels ('TIME TO FIRST TOKEN', 'CUT', 'REPORTED', 'MEASURED') and a grey circle in each top corner. The tan is outside the palette seen on every other surface, and the circles read as pins on a plate; if they are controls they carry no label.

#### Course (`/map`), 1440 and 390

Verdict: Holds. One contract miss.

Open findings:

- 1440 course-map-1440.png and 390 course-map-390.png: the unpublished TR0 title is still underlined like a link (section 3.2: 'It is not a link').
- Withdrawn from round 1: the three amber position marks (next-step block, TR1 node, lesson 1) are each specified by section 3.2 and are one carrier of the One Marker Rule.
- Not shown by any capture: the returning Course ('Last time: ...'). fix-final-walk.md reports the false lesson states fixed (placeEvents); only the first-visit Course is captured.

### Material fixes it listed

1. Broken benchmark, P5 (action, state and result on one screen), 1440 and 390: bench-midlevel-2d-390.png (chart cut to a 65 px strip), bench-midlevel-2d-1440.png (report fields cut in half by the readout, flaw list cut mid-row, Setup table cut, no filing control in view), bench-result-1440.png and bench-result-390.png (readout shows its heading only, values below the viewport foot). Give the chart a floor height on a phone, let the form take its content height as the other docks now do at a result, and pin the readout whole.
2. Remaining dock slices, P5. Request path 1440 floor-midlevel-2d-1440.png (filter field and tabs cut at the top, last tab clipped); Request path 390 floor-midlevel-2d-390.png (legend's last row and the stage list's first row cut); KV page pool 390 pool-midlevel-2d-390.png (third option cut, 'Admit none this step' hidden); Rejection sampler 390 verifier-result-390.png ('Run again' and 'New numbers' cut in half at rest); intros where the Next bar cuts a line of the parts list: tr5a-l1-top-1440.png, tr5a-l1-game-intro-1440.png, verifier-intro-1440.png, verifier-intro-390.png; TR5a lesson 1 390 tr5a-l1-game-intro-390.png (the intro panel covers the pool it names).
3. Request path and TR1 lesson 1 at 390, P4: same-column hop labels are still slivers (floor-midlevel-2d-390.png, floor-result-390.png, tr1-l1-after-run-390.png). Give a hop inside one column a label slot. Same captures: readout cells touch at 390 (floor-midlevel-2d-390.png); 'One proce…' in the lesson's Your-run dock at 1440 (tr1-l1-read-midway-1440.png).
4. One Marker Rule in the intros. Request path and TR1 lesson 1, 1440 and 390 (floor-intro-1440.png, floor-intro-390.png, tr1-l1-run-game-intro-1440.png, tr1-l1-run-game-intro-390.png): two amber rings in one viewport where the rule allows one. Every game intro, 1440 and 390 (loop-intro-*, pool-intro-*, verifier-intro-*, bench-intro-*, floor-intro-*): the '▷ now' mark between Next and Skip intro is not one of the rule's three carriers and reads as a third control. Front page and Step loop 390 (front-after-step-2d-390.png, loop-result-390.png): the sync slab and the now line still read as one mark; a 2 px gap moved the position without separating them.
5. Callout placement. Front page 390 front-first-paint-390.png (discs replace the lane glyphs; give them a gutter as at 1440 or step them one at a time as the other phone intros do); Broken benchmark 1440 bench-intro-1440.png (discs 1 to 3 stacked in the gutter away from their parts); KV page pool and TR5a lesson 1 1440 pool-intro-1440.png, tr5a-l1-game-intro-1440.png (disc 2 in the legend, not on a page); Request path 1440 floor-intro-1440.png (disc 3 has no target while the list says the numbers match).
6. 3D reads as the same diagram and earns its box. Rejection sampler 1440 verifier-midlevel-3d-1440.png: stop value tags overprinting, seat each collar on its bar or drop the ones with no bar, and put the collar and the pale residual top in the legend row. Step loop and front page 1440 loop-midlevel-3d-1440.png, front-returning-1440.png: move 'now' clear of the first queue chip, draw the queue once, and fill the box. KV page pool 1440 pool-midlevel-3d-1440.png: fill the box, keep threads off the 'R1' label, and use the 2D legend's glyphs.
7. First viewport and name-then-ask, P4. Front page, Step loop, KV page pool, Rejection sampler, Request path, Broken benchmark at 390 (front-first-paint-390.png, loop-intro-390.png, pool-intro-390.png, verifier-intro-390.png, floor-intro-390.png, bench-intro-390.png): the goal line is cut behind 'more', hiding the number to beat. Front page 1440 front-first-paint-1440.png: Auto-step wraps to its own row against section 3.1, and the plot is empty until the fifth action with no reference run drawn. TR1 lesson 1 1440 tr1-l1-top-1440.png: no instrument edge in the first viewport.
8. Finish and truth, small. TR1 lesson 1: 'you said 1 stages', 'guess 1 stages' (tr1-l1-after-run-1440.png, tr1-l1-keep-1440.png, tr1-l1-keep-390.png) and the unnumbered five rules (tr1-l1-read-midway-1440.png). Course: TR0 title underlined like a link (course-map-1440.png, course-map-390.png). Step loop 390: axis label 16 clipped (loop-midlevel-2d-390.png); level 1 table names 'Ghost tokens' and 'Bubble' untaught (loop-result-1440.png). Broken benchmark 1440: tan tape labels and corner circles on the charts, verdict in the display face, three stamps in view (bench-result-1440.png, bench-midlevel-2d-1440.png). TR5a lesson 1 1440: shadowed sheets inside the lesson's sheet (tr5a-l1-game-result-1440.png). KV page pool and Rejection sampler 1440: graticule that is neither cell grid nor value axis (pool-intro-1440.png, verifier-intro-1440.png).

### Round 1's eight fixes, as scored by round 2b

1. P5, docks slice the action and the result: PARTIAL. Done at every result named (loop-result-390.png, pool-result-390.png, pool-result-1440.png, verifier-result-390.png, floor-result-1440.png and floor-result-390.png show diagram, verdict and the amber way on together, and verifier-midlevel-2d-390.png shows Finish whole). Not done: floor-midlevel-2d-1440.png (filter field and tabs cut), floor-midlevel-2d-390.png (legend and first stage row cut), pool-midlevel-2d-390.png (third option cut, fourth hidden), verifier-result-390.png (secondary row cut in half).
2. P4, Request path intro names undrawn parts: PARTIAL. The example ('a process', 'another process', one IPC hop) is drawn at both sizes and disc 1 is off the note; 'One process' no longer truncates on the game page; delta chips stand after their numbers. Not done: same-column hop labels at 390 (the fix report lists it as left); disc 3 has no target; readout cells touch at 390.
3. One Marker Rule: PARTIAL. (a) done: the way on is amber at every result (pool, sampler, Request path, Broken benchmark, TR1 and TR5a embeds). (c) done: 'Read why' under the run is an outline at both sizes. (b) cached pages are hatched; the sync slab is parted from the now line by 2 px, which moves the position but at 390 they still read as one mark.
4. Quiet Provenance Rule: DONE. One boxed stamp on the pool, sampler, Request path and TR5a results; the sampler's in-sentence tags are dotted underlines, as the rule allows.
5. 3D is the same diagram and earns its box: PARTIAL. Done: pool free cells are dashed wire outlines, its labels are clear of the threads, its page field reads '1 to 44'; the sampler offers 3D only on the chain; no 3D on phones, with REDESIGN 3.1 amended; the front page's slot slabs keep a gap and 'now' stands over the lanes. Not done: the sampler's chain scene is not legible (verifier-midlevel-3d-1440.png); the loop and pool scenes still use about half their boxes; 'now' overprints the first queue chip.
6. Seed and briefs: DONE on round 1's terms. The front brief's FORM records the owner's choice ('data book for sure', `docs/waves/WR-look.md` line 162, made with the no-roll disclosure at line 46), and all 13 briefs under `.impeccable/surfaces/` now specify Data Book.
7. Callout and readout collisions: PARTIAL. Done: loop-intro-1440.png (disc 4 clear of 'empty'), verifier-intro-1440.png and -390 (discs on the bars, no hole in the caption), tr1-l1-run-game-intro-1440.png (disc 5 over boundaries crossed), tr5a-l1-read-source-popover-1440.png ('15 of 15' and '1296' apart), 'synthetic ticks' clear of the axis 0. Not done: front-first-paint-390.png answers the collision by hiding the lane glyphs under the discs.
8. Source popover on a phone: DONE. tr5a-l1-read-source-popover-390.png is a bottom sheet above the Next-part bar, whole, with the claim at regular weight and the source link in bold; the same weights hold at 1440.

Round 1's two items outside the eight (React error 185 between lessons; false lesson states on Course) are reported fixed in `fix-final-walk.md` with tests. No capture in this packet shows either, so both stay unverified by eye.

### Persistence

Pass, with one disclosure. PRODUCT.md and DESIGN.md exist; DESIGN.md names the built world (surface-0 #e9ece6, the One Marker, Flat Paper, Quiet Provenance and Short Viewport rules). It is a code-led build, so no state.json, spec.json, mocks or diff are owed. Seed: `impeccable concept-seed --check-seed none` exits 1 on the reviewer's machine ("none means the roll was skipped"). The roll for Data Book was skipped. It was put to the owner at the look gate as a named disclosure and the owner chose Data Book with it, so the reviewer does not list it as a fix. The Pass's seed (`seed:631f6361e61b6b7b`) is kept in the front brief as history and is not Data Book's.

### Fidelity

No approved comp. The reviewer judged against REDESIGN.md 2.8, 2.9, 3.1, 3.2 and principles P4 and P5. Its table begins "TYPE | match | Big Shoulders Display in sentence case on page, lesson and game titles; a hyperlegible text face; mono tabular numerals. The embedded game title now sits a step under the lesson h1 (tr5a-l1" and the rest of it did not reach the record.

## Round 3, the review that followed the polish on wave-r2, on the tip `936f7cd` (disposition: fix)

This round judged the polish branch `wave-r2` at `936f7cd` (the merge of the Broken benchmark task, the eighth of the polish round's first batch). Its captures were of `936f7cd`; the worktree it ran in stood at `991beb5`, four commits later (authoring rules and the simulation-numbers fix), and nothing after `936f7cd` was under review. The fix batch that answered it (`p09`, merged at `deb11d8`) came after this verdict; `docs/waves/WR-report.md` section 7 says what it closed. The text below is as the reviewer returned it, with one cut: its line naming the folder of captures on the machine that ran it is replaced by this sentence, as in rounds 1 and 2.

Disposition: fix

### Per surface

#### Front page (`/`), 1440 and 390

Verdict: Holds at both sizes. Goal, reference run, one-row dock and phone callouts are all in; what is left is finish.

Open findings:
- 1440 front-demo2-dimension-diagram-1440.png, front-demo2-dimension-3d-1440.png: after Next demo level a 3 px ink ring boxes the whole Step loop panel, so the panel reads as a different component state.
- 1440 front-after-step-3d-1440.png: the ink ring round the result hugs 'Passed.' and the paragraph with no inset; the text touches the ring's left edge and the block reads as a text field.
- 1440 front-first-paint-1440.png: a first visit opens in Diagram, while REDESIGN 2.9 gives 3D Lifted as the front page's default on a capable desktop (the same browser opens a returning learner in 3D by itself, front-returning-3d-1440.png). If section 3.1 was amended to open the intro in Diagram, cite it; otherwise the first sight the owner asked to 'catch attention' is the flat one.
- 1440 front-first-paint-1440.png: the left column is empty from about y 660 to 850 beside the panel (the page continues below; small).
- Scored as closed from round 2b: phone callouts stand in a gutter beside the lane glyphs (front-first-paint-390.png); the goal line shows the number to beat at 390; the reference run is drawn before the first move; Step, Undo and Auto-step share one row; 'now' is clear of the queue and the queue is drawn once in 3D; the sync slab is hatched and parted from the now line (front-after-step-2d-390.png); the '3 ticks' dimension and 'idle' are whole in both views.

#### TR1 lesson 1 (`/m/tr1/l1-five-mechanisms`), 1440 and 390

Verdict: Close. The run, the result and the read all hold; one wrong word and one contract miss stay open.

Open findings:
- 1440 and 390 tr1-l1-run-intro-1440.png, tr1-l1-run-intro-390.png: the committed guess reads 'Locked in: 1 stages. It does not change now.' (src/content/render/Predict.tsx line 169). The rail and the lesson record now read '1 stage'; this string was missed.
- 1440 tr1-l1-top-1440.png: still no instrument edge in the first viewport (primer, code block, then the top of Guess 1 of 2 at y 795). REDESIGN 3.4 puts the instrument's first control inside the first viewport. Report p06 left this for the owner with a recommendation; it is an owner decision, and it is still open.
- Scored as closed: hop labels read whole at 390 with the whole path and the result on one screen (tr1-l1-after-run-390.png); the five rules are numbered and 'One process' is whole in the Your-run dock (tr1-l1-read-midway-1440.png); the embedded intro draws the example with discs 1, 2 and 4 on it and one amber ring (tr1-l1-run-intro-1440.png); the record reads 'guess 1 stage' (tr1-l1-keep-1440.png).
- Not shown by any capture: lesson-to-lesson navigation; every lesson capture is a direct load.

#### TR5a lesson 1 (`/m/tr5a/l1-why-one-model-needs-several-kv-caches`), 1440 and 390

Verdict: Near. Intro, result and inner sheets are right; the phone's mid-level rest position loses the pool.

Open findings:
- 390 tr5a-l1-game-midlevel-390.png: at the page's own scroll (y 1144) the pool is cut to its last row and a half under the lesson bar while the admit options and readout are on screen, and the lower 55 percent of the viewport is footer matter (Undo, the model line, State as a table). Round 2b saw the pool whole here.
- 1440 tr5a-l1-game-midlevel-1440.png: the readout's fifth cell ('preemptions') wraps alone to a second row in the lesson's narrower dock.
- Scored as closed: the intro panel no longer covers the pool at 390 (tr5a-l1-game-intro-390.png; Next is now below the fold at the #run anchor, which is ordinary flow); the parts list is not sliced and disc 2 stands on a page (tr5a-l1-game-intro-1440.png); the inner sheets carry a hairline and no shadow (tr5a-l1-game-result-1440.png); the breadcrumb is one line at 390 (tr5a-l1-top-390.png).

#### Step loop (`/play/loop`), 2D and 3D, 1440 and 390

Verdict: 2D holds at both sizes and is still the strongest instrument. 3D earns its box at Lifted, Side and Compare; Along time, Top and Scale are not finished.

Open findings:
- 1440 loop-3d-camera-along-time-1440.png: lane labels pile onto one another ('Reference run' over 'CPU' over 'slot 1'; 'Your run' over 'CPU, engine core thread' over 'slot 1, R1'), the top third of the box is bare and the axis shows only 0 and 2.
- 1440 loop-3d-camera-top-1440.png: the plate is turned about 35 degrees and cropped at the top and the foot; 'slot 1' is cut by the legend, and the axis runs off the box at 16. A Top view of a timing diagram should be square to the box.
- 1440 loop-3d-camera-scale-1440.png: the 'CPU, engine core thread' label is overprinted by the CPU bars, and the 64 by 160 field is a moire of green with no slot or step readable; only the caption carries the point.
- 1440 every loop-3d-* capture: a pale frame about 7 px wide stands round the whole page column (x 105 to 1335, from y 78), absent on the other games.
- 1440 loop-3d-midlevel-1440.png, loop-3d-opening-shot-1440.png: the dock is blank paper from about y 430 to 700, and the practice note ('Practice: fixed numbers, undo allowed...') is set a step larger than the same note on the other games.
- 1440 loop-result-1440.png: the ink ring hugs 'Passed.' with no inset.
- Scored as closed: 'now' is clear of the queue, the queue is drawn once, and the Lifted scene fills its box with the reference run above your run; Compare shows the three policies stacked with the gaps closing (loop-3d-camera-compare-1440.png; 'Continuous batching' touches its first bars, small); the phone axis reads 0, 5, 10, 15 whole and the queue shows '+2' (loop-intro-390.png, loop-midlevel-2d-390.png); the level 1 table lists only Clock and Output tokens; the intro's stray now mark is gone.

#### KV page pool (`/play/pool`), 2D and 3D, 1440 and 390

Verdict: Holds in 2D at both sizes. The 3D is the same diagram and is now lettered and keyed like it, but it is still small in its box.

Open findings:
- 1440 pool-3d-opening-shot-1440.png: the pool plate is about 575 by 95 px in a 780 by 295 box, with bare ground above, below and around; report p03 itself gives about 60 percent down. An empty rack this small does not earn the box at level start.
- 1440 pool-3d-midlevel-1440.png: a thread crosses the '8 layers' slip, and a short stray thread stub stands left of the pool at about x 280.
- 1440 pool-3d-camera-from-above-1440.png: the 'R1' label touches the box's top edge, and the opened page's fan throws a blurred dark smear over the cells beneath it (Flat Paper Rule: matte solids, one shadow for a sheet).
- 1440 pool-3d-opening-shot-1440.png: the first admit row is cut through its box by the More below bar.
- Scored as closed: three admit options whole with 'Admit none this step' in the header row at 390 (pool-midlevel-2d-390.png); no graticule behind the cells and disc 2 on a page (pool-intro-1440.png, pool-midlevel-2d-1440.png); the 3D legend uses the circle, diamond and hexagon glyphs; threads clear the 'R1' label.

#### Rejection sampler (`/play/verifier`), 2D and 3D, 1440 and 390

Verdict: 2D holds at both sizes and is still the best drawing of the set. The chain's 3D is now readable from Over the run before a draw; after a draw the collars are still loose.

Open findings:
- 1440 verifier-3d-midlevel-chain-1440.png: black collar frames float tilted and detached (above the 23 bar in the back row, beside the 4 at the right of the third row, the 11 above and to the right of token 5 in front); the legend says 'dashed up to it', and no dash is visible at this camera.
- 1440 verifier-3d-camera-from-the-side-1440.png, verifier-3d-camera-one-draft-position-1440.png: four or more flat frames hang in the air with no riser to a bar, and read as stray artefacts.
- 1440 verifier-3d-midlevel-chain-1440.png: the middle rows (about x 460 to 620, y 380 to 440) are still crowded: collars, pale tops, the '21' tag on a collar, and tags of one row standing at the feet of the row behind.
- 1440 verifier-intro-1440.png: part 5's heading ('Residual, (p - q)+') is still cut through its letters by the More below bar.
- 1440 and 390 verifier-midlevel-2d-1440.png, verifier-intro-390.png: the 2D bars still have no printed value scale (report p04 left it because its brief froze 2D); each bar carries its value, so this is a ceiling point and not a defect.
- Scored as closed: 'Run again' and 'New numbers' are whole at the phone's rest scroll (verifier-result-390.png); the collar, the accepted part and the pale grooved residual are in the legend row; a value scale (0, 16, 32) stands at the 3D scene's right; the phone readout's values share a baseline; the graticule is gone.

#### Request path (`/play/engine-floor`), 2D only, 1440 and 390

Verdict: Play and result hold at both sizes and the phone path now reads its mechanism words. The 1440 intro has gone backwards. Fix.

Open findings:
- 1440 floor-intro-1440.png: the diagram sheet is a strip about 120 px tall (the request node and the now line) over roughly 500 px of bare ground; no example is drawn, and parts 2, 3 and 4 have nothing on the drawing. Report p06's own after-capture (review-wr/polish/p06-request-path-tr1/after-floor-intro-1440.png) shows the example drawn with discs 2 and 4, and the lesson embed (tr1-l1-run-intro-1440.png) and the phone (floor-intro-390.png) still draw it. It was lost at the standalone 1440 frame between p06 and the reviewed tip.
- 390 floor-midlevel-2d-390.png: in the readout, 'copies' runs into the next cell's 0 when the delta chips show; at the result (floor-result-390.png) 'copies' touches its divider.
- 390 floor-midlevel-2d-390.png: the focus ring on a stage row is clipped by the list's scroller to two corner marks.
- 1440 floor-midlevel-2d-1440.png: the filter field and tabs are whole and pinned, but the list's top row ('IPC, socket stream_output') is sliced through its first line under them; the page rests at y 521 with the title and the goal off-screen; blank paper from row 04 to the legend.
- 1440 floor-result-1440.png: the ink ring hugs 'Finished (practice)' with no inset.
- Scored as closed: same-column hop labels have their slot and read whole (floor-midlevel-2d-390.png, floor-result-390.png); legend and first stage row whole at 390; one amber ring in the intro and no stray now mark; the swimlane spans about 65 percent of its sheet at the result.

#### Broken benchmark (`/play/broken-bench`), 2D only, 1440 and 390

Verdict: Much better: action, state and result share the screen at 1440 and at both results. The phone's report form is still a peephole, and the charts are the least designed drawing on the site.

Open findings:
- 390 bench-midlevel-2d-390.png, bench-focus-primary-390.png: the Report form is a window about 130 px tall between the legend and the readout: two flaw rows, a third cut by More below, and neither the three number fields nor File the report on screen. In the focus capture the 'Report form' heading is sliced by the legend. The chart is whole now, so state is on screen; the action is not.
- 1440 bench-midlevel-2d-1440.png: the flaw list shows three rows in an inner scroller (the third cut by More below) while about 170 px of paper stands blank under the chart in the same viewport.
- 1440 bench-intro-1440.png, bench-result-1440.png and 390 bench-result-390.png: chart lettering is about 6 to 8 px ('cut', 'reported', 'measured', the bin counts; on 'Your log, around its longest wait' the row numbers and the key 'due, sent, wait never timed' cannot be read), and each chart uses a little over half its sheet's width.
- 1440 bench-intro-1440.png, bench-result-1440.png: figures in prose and in the reported p99 are set in the mono face, so points and commas take a full cell: '90 . 1', '1 , 000', '21 , 155 ms', '5 , 073 . 6 ms'.
- 1440 bench-result-1440.png: the dock's last paragraph ('Coordinated omission means a timer started at the send, so') is cut by the readout with no More below cue; the ink ring hugs 'Passed' with no inset.
- 1440 bench-intro-1440.png: the wait between due and sent, the one quantity this game is about, is a dashed rule in the key and has no dimension line on the chart, where the Step loop's idle gap has one.
- Scored as closed: the phone chart is whole with its axis (bench-midlevel-2d-390.png); at 1440 the three fields, the range rule and File the report are in view; the readout is whole at both results; discs 1, 2 and 4 stand on their parts and 3 and 5 are plain numerals where nothing is drawn yet; one stamp; the verdict is in the bold text face; the tan labels and corner circles are gone.

#### Course (`/map`), 1440 and 390

Verdict: Holds. Clear.

Open findings:
- None open. TR0's title is grey and not underlined (course-map-first-1440.png), and the returning Course opens with 'Last time: you ran Request path, nano-vllm (passed in practice) and made 2 guesses in TR1 lesson 1. Next: read why, then 3 questions.' (course-map-returning-390.png), which round 2b could not see.

### Material fixes

1. Request path, 1440, floor-intro-1440.png (P4, name then ask; round 2b fix 5): the standalone intro draws one node and the now line on a 120 px strip over about 500 px of bare ground, and parts 2, 3 and 4 have nothing drawn. Restore the worked example (two processes, an IPC hop, a call in one column) that p06's after-capture, the lesson embed (tr1-l1-run-intro-1440.png) and the phone (floor-intro-390.png) all show, and hold it with a test at 1440 x 900.
2. Broken benchmark, 390 and 1440, bench-midlevel-2d-390.png, bench-focus-primary-390.png, bench-midlevel-2d-1440.png (P5; round 2b fix 1): on a phone the Report form is a 130 px inner window with two flaw rows, no number field and no File the report, and its heading is sliced by the legend. Let the form take its content height in the page's own scroll under the chart, as the other docks do. At 1440 give the flaw list its full height in place of a three-row scroller beside 170 px of blank paper.
3. Step loop 3D, 1440, loop-3d-camera-along-time-1440.png, loop-3d-camera-top-1440.png, loop-3d-camera-scale-1440.png (REDESIGN 2.9; round 2b fix 6): Along time piles its lane labels onto one another and leaves a third of the box bare; Top is turned about 35 degrees and cropped with 'slot 1' cut by the legend; Scale overprints the CPU label and shows a moire. Frame each named camera to the box with its labels laid clear, or withdraw the camera. Same captures: remove the pale frame round the page column.
4. Rejection sampler 3D, 1440, verifier-3d-midlevel-chain-1440.png, verifier-3d-camera-from-the-side-1440.png, verifier-3d-camera-one-draft-position-1440.png (REDESIGN 2.9; round 2b fix 6): collar frames still float tilted and detached from their bars, with no riser visible. Seat each collar square on its bar's axis, draw the dashed riser at a weight the camera keeps, and drop tags at the cameras that cannot hold them.
5. KV page pool 3D, 1440, pool-3d-opening-shot-1440.png, pool-3d-midlevel-1440.png, pool-3d-camera-from-above-1440.png (REDESIGN 2.9, Flat Paper Rule; round 2b fix 6): the plate is about 575 by 95 px in a 780 by 295 box at level start. Fit the camera to the rack or shorten the box to the scene; keep threads off the '8 layers' slip, remove the stray thread stub at the pool's left, clear 'R1' from the box's top edge, and take the blurred shadow off the opened page.
6. TR1 lesson 1 and TR5a lesson 1 (truth; REDESIGN 3.4; round 2b fixes 7 and 8): tr1-l1-run-intro-1440.png and tr1-l1-run-intro-390.png read 'Locked in: 1 stages.' (src/content/render/Predict.tsx line 169); tr1-l1-top-1440.png still has no instrument edge in the first viewport, left for the owner by p06, so put the recommendation to the owner and record the answer; tr5a-l1-game-midlevel-390.png rests with the pool cut to a row and a half under the lesson bar.
7. Dock and readout residue (P5; round 2b fixes 2 and 3): Request path 390 floor-midlevel-2d-390.png ('copies' runs into the next cell's 0 beside a delta chip; the focus ring is clipped to corner marks); Request path 1440 floor-midlevel-2d-1440.png (the list's top row sliced under the pinned tabs); Rejection sampler 1440 verifier-intro-1440.png (part 5's heading cut through by More below); TR5a lesson 1 1440 tr5a-l1-game-midlevel-1440.png (one readout cell wraps alone); Broken benchmark 1440 bench-result-1440.png (last paragraph cut with no cue).
8. Finish that still reads as a default chart (craft floor: type, browser surfaces; Ink Focus Rule): Broken benchmark 1440 and 390 bench-intro-1440.png, bench-result-1440.png, bench-result-390.png (chart lettering at 6 to 8 px, charts on half their sheet, mono points and commas floating in '90 . 1' and '5 , 073 . 6 ms', no dimension line on the due-to-sent wait); every result at 1440 (bench-result-1440.png, loop-result-1440.png, floor-result-1440.png, tr5a-l1-game-result-1440.png, front-after-step-3d-1440.png) where the ink ring hugs the verdict with no inset; front page 1440 front-demo2-dimension-diagram-1440.png where the ring boxes the whole panel.

### Report

disposition: fix

Inputs and limits. Check 0 passes for every capture I opened: right viewport size, the content the list claims, no blank regions. About 62 of the 102 files were opened. Not opened: design-* (4), every *-focus-primary-* except bench-focus-primary-390, header-focus-continue-*, front-focus-main-control-*, front-returning-2d-*, front-after-step-2d-1440, front-demo2-dimension-diagram-390, course-map-first-390, course-map-returning-1440, loop-result-390, pool-result-*, pool-focus-*, verifier-result-1440, verifier-focus-*, bench-intro and bench-result beyond those cited, tr1-l1-keep-390, tr1-l1-prediction-revealed-*, tr1-l1-read-midway-390, tr1-l1-top-390, tr5a-l1-top-1440, tr5a-l1-game-result-390, tr5a-l1-read-source-popover-*, manifest.jsonl. The eight polish reports were read by search only (their 'left' lines and p06's intro lines), REDESIGN.md by section (2.9, 5.4, part of 3.4), DESIGN.md by its named rules, PRODUCT.md and the surface briefs not beyond the front brief's seed lines. No pixel tooling on this machine (no PIL), so colour is judged by eye. Motion cannot be judged from stills. The captures are of 936f7cd; the worktree's HEAD is 991beb5, four commits later (authoring rules and 'fix-sim-numbers' merges), and nothing after 936f7cd is under review. The detector's 13 findings are all advisory font sizes off the DESIGN.md ramp; none is a floor item.

#### Round 2b's eight material fixes, scored against these captures

1. Broken benchmark, action, state and result on one screen: PARTIAL. Done at 1440 (bench-midlevel-2d-1440.png: three fields, the range rule and File the report in view, readout whole) and at both results (bench-result-1440.png, bench-result-390.png: readout whole); the phone chart is whole (bench-midlevel-2d-390.png). Not done: on a phone the Report form is a 130 px window with two flaw rows and no field or filing control (bench-midlevel-2d-390.png, bench-focus-primary-390.png).
2. Remaining dock slices: DONE, with residue carried into fix 7. Done: floor-midlevel-2d-390.png (legend and first row whole), pool-midlevel-2d-390.png (three options whole, Admit none in the header), verifier-result-390.png (secondary row whole), tr5a-l1-game-intro-1440.png and verifier-intro-390.png (list not sliced), tr5a-l1-game-intro-390.png (panel off the pool), floor-midlevel-2d-1440.png (filter and tabs whole). Residue: verifier-intro-1440.png (part 5's heading cut by More below), floor-midlevel-2d-1440.png (the list's top row sliced under the pinned tabs).
3. Hop labels at 390, touching readout cells, 'One proce...': PARTIAL. Hop labels are whole (floor-midlevel-2d-390.png, floor-result-390.png, tr1-l1-after-run-390.png) and 'One process' is whole (tr1-l1-read-midway-1440.png). The readout has dividers now, but 'copies' still runs into the next cell's 0 beside a delta chip (floor-midlevel-2d-390.png).
4. One Marker Rule in the intros: DONE. One amber ring (Next) and the now line in floor-intro-390.png and tr1-l1-run-intro-1440.png; the request node is ink; the now mark between Next and Skip intro is gone from loop, pool, sampler, benchmark and Request path intros; the sync slab is hatched and stands apart from the now line (front-after-step-2d-390.png, loop-result-1440.png).
5. Callout placement: PARTIAL. Done on the front page at 390 (gutter beside the glyphs), the benchmark (discs on the switch, the claim and the histogram; plain numerals where nothing is drawn), the pool and TR5a (disc 2 on a page). Not done: floor-intro-1440.png, where the example the discs stood on is no longer drawn.
6. 3D reads as the same diagram and earns its box: PARTIAL. Step loop: done at Lifted, Side and Compare ('now' clear, queue once, box filled, reference run over your run); Along time, Top and Scale, captured for the first time, are not finished. Sampler: tags and the legend are fixed, a value scale is added; collars still float. Pool: glyph legend and thread clearance done; the scene is still small in its box.
7. First viewport and name-then-ask: PARTIAL. Done: every phone goal line shows the number to beat (front-first-paint-390.png, loop-intro-390.png, floor-intro-390.png, verifier-intro-390.png, bench-intro-390.png, pool-midlevel-2d-390.png); the front page has Auto-step on the dock row and the reference run drawn before the first move. Not done: tr1-l1-top-1440.png has no instrument edge in the first viewport (left for the owner by p06).
8. Finish and truth, small: PARTIAL. Done: '1 stage' in the rail and the record, the five rules numbered, TR0 not underlined, the phone axis whole, 'Ghost tokens' and 'Bubble' gone from level 1, the benchmark's tan labels, corner circles, display-face verdict and extra stamps gone, no shadow on sheets inside the lesson sheet, no stray graticule on the pool or the sampler. Not done: 'Locked in: 1 stages.' (tr1-l1-run-intro-1440.png, tr1-l1-run-intro-390.png).

#### persistence

Pass, with the same disclosure as round 2b and one new one. PRODUCT.md and DESIGN.md exist; DESIGN.md names the built world (surface-0 #e9ece6, One Marker, Ink Focus, Flat Paper, Quiet Provenance, Short Viewport). Code-led build, so no state.json, spec.json, mocks or diff are owed. Seed: 'impeccable concept-seed --check-seed none' exits 1 here ('none means the roll was skipped'). The front brief records that no roll was dealt for Data Book, that this was put to the owner at the look gate, and that the owner chose Data Book with it; I do not list it as a fix. New: the reviewed tip (936f7cd) is four commits behind the worktree HEAD (991beb5).

#### fidelity

No approved comp. Judged against DESIGN.md's named rules and REDESIGN 2.8, 2.9, 3.4 and P4, P5.
- TYPE: match. A condensed display face in sentence case on page, game and lesson titles, a hyperlegible text face, mono figures with a slashed zero. One defect inside the match: mono points and commas in prose and in the benchmark's large figure ('90 . 1', '5 , 073 . 6 ms').
- MATERIAL: match. Flat paper, hairlines, hatching for cached and sync, matte flat-shaded solids in 3D; no bevel, emboss or imitation material anywhere. One exception: the blurred shadow under the opened page in pool-3d-camera-from-above-1440.png.
- GROUND: match by eye to the named #e9ece6, a pale cool grey-green with whiter sheets on it; no drift toward warm cream seen. Not sampled (no pixel tooling).
- One Marker Rule: match. Amber stands only on the control to act on, the now cursor and its ring, and the position marks; focus is ink.
- Quiet Provenance Rule: match. One stamp per instrument in every capture opened.
- Flat Paper Rule: match, bar the pool shadow above.
- P5, action, state and result on one screen: match at every result at both sizes and at 1440 mid-level; contradicted on the benchmark at 390 mid-level; weakened at tr5a-l1-game-midlevel-390.png.
- P4, name then ask: match on six of seven intros; contradicted at floor-intro-1440.png, where three of five named parts are not drawn.
- REDESIGN 2.9, Step loop cameras: Lifted, Side, Compare match; Along time, Top, Scale are present and unfinished.
- REDESIGN 2.9, pool rack, fan and threads: match in kind, under-scaled in its box.
- REDESIGN 2.9, sampler skylines by draft position: match before a draw; the output collar 'settling onto p' is contradicted by collars that float off their bars.
- REDESIGN 3.4, instrument's first control in the first viewport: missing on TR1 lesson 1 at 1440 (owner decision pending).
- REDESIGN 2.9, front page default view 3D Lifted on a capable desktop: a first visit opens in Diagram (front-first-paint-1440.png). Adaptation only if 3.1 as amended says so; uncited in this packet.
- 5.4 keep-list moments seen in stills: the benchmark's 90.1 ms against 5,073.6 ms (bench-result-1440.png), the sampler's draws, yours against the reference (loop-result-1440.png), Compare's closing gaps. The pool's eviction costs were not in any capture I opened.
- Floor: no kicker, gradient text, side stripe over 1 px, hard offset shadow, glyph icon set or system display face seen. The 'State as a table' disclosure triangle looks like the browser's own marker; check it.

#### ceiling

The world is a data book, and what it leaves unused is mostly the book's own lettering and measure:
- Printed scales and dimension lines. The dimension line appears once (the Step loop's idle gap). The benchmark's wait between due and sent, the pool's prefix hit and the sampler's overlap are each the quantity their game is about, and none is dimensioned on the drawing; the sampler's 2D bars have no scale.
- Figures at display scale. Only the benchmark's reported p99 is set large; every other readout is one small size, so no instrument has a number that looks like its answer.
- Plate lettering. Chart and diagram heads are a small bold text face, and on the benchmark they shrink to 6 to 8 px; the display face never reaches a drawing.
- The sheet as a composed plate. Several sheets print on half their paper (benchmark charts, the Request path mid-level and result, the Step loop's dock in 3D, the pool's 3D opening), which is where the result still reads as a default chart dropped on a page and not a drawn plate.
- Depth. Three of the Step loop's six cameras and the pool's opening shot do not yet show anything the diagram does not, or show it less clearly.
- Motion: not judged.

#### material_fixes

1. Request path 1440, floor-intro-1440.png: restore the worked example at the standalone frame; three named parts are undrawn (P4).
2. Broken benchmark 390 and 1440, bench-midlevel-2d-390.png, bench-focus-primary-390.png, bench-midlevel-2d-1440.png: give the Report form its content height; on a phone it is a 130 px window (P5).
3. Step loop 3D 1440, loop-3d-camera-along-time-1440.png, loop-3d-camera-top-1440.png, loop-3d-camera-scale-1440.png: frame and letter the three cameras or withdraw them; remove the pale page frame (2.9).
4. Rejection sampler 3D 1440, verifier-3d-midlevel-chain-1440.png, verifier-3d-camera-from-the-side-1440.png, verifier-3d-camera-one-draft-position-1440.png: seat the collars and show their risers (2.9).
5. KV page pool 3D 1440, pool-3d-opening-shot-1440.png, pool-3d-midlevel-1440.png, pool-3d-camera-from-above-1440.png: fit the scene to its box; clear the label, thread and shadow faults (2.9, Flat Paper).
6. TR1 lesson 1 and TR5a lesson 1, tr1-l1-run-intro-1440.png, tr1-l1-run-intro-390.png, tr1-l1-top-1440.png, tr5a-l1-game-midlevel-390.png: 'Locked in: 1 stages.'; the instrument edge decision for the owner (3.4); the phone's mid-level rest position.
7. Dock and readout residue, floor-midlevel-2d-390.png, floor-midlevel-2d-1440.png, verifier-intro-1440.png, tr5a-l1-game-midlevel-1440.png, bench-result-1440.png (P5).
8. Finish, bench-intro-1440.png, bench-result-1440.png, bench-result-390.png, loop-result-1440.png, floor-result-1440.png, front-demo2-dimension-diagram-1440.png: benchmark chart lettering and scale, floating mono punctuation, the verdict's focus ring with no inset, the ring round the whole front panel.

#### keep

The 2D instruments exactly as they stand (the Step loop's timing diagram with its reference run and hatched sync, the pool's hatched page grid, the sampler's bars, the Request path's lettered swimlane), with amber spent only on now and one quiet stamp per instrument; fix around them, not through them.
