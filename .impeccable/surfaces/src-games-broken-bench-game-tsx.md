---
version: 1
slug: "src-games-broken-bench-game-tsx"
primary_target: "src/games/broken-bench/Game.tsx"
related_targets: ["src/games/broken-bench","packages/play/broken-bench"]
---

# The Inspection

## Scope

- **Surface:** the game `broken-bench` (`/play/broken-bench`), in Operate mode. A specified surface inside the established world: GAMES.md §11 and §2.6 and A§6 specify it, so there is no concept roll.
- **Visitor:** a kernelspace graduate in TR8 who has read that a benchmark can quote a wrong number, and who now has to find out why on a log, under the rules of evidence.
- **Task:** read a published claim and its setup, inspect the stopwatch log, name the one flaw, predict the corrected p99 with an interval, and read the court's ruling, which re-runs the corrected benchmark.
- **Proof:** every case is drawn answer first by `packages/sim/bench`, recomputed from its own rows at the reveal, and graded on a seed drawn when the attempt starts. Every number is synthetic and says so.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - completable by keyboard alone, usable at 360-390 px, no transitions under reduced motion;
  - 2D only: the 3D opener `rain-and-relay` is a later stretch (GAMES.md §11).

## Direction contract

THESIS: The inspection is the health inspector's visit to a kitchen that quotes its own times. The learner is the inspector, and the evidence is the inspector's own objects laid on the steel: a clipboard, the stopwatch's log on printer tape, a plot penciled on graph paper. It refuses the benchmark dashboard: a row of metric cards, a legend of swatches, a verdict badge.

OWN-WORLD:
- **The clipboard:** deep stainless with a spring clip holding a ticket-paper form. The kitchen's claim is printed large in dots, the setup is printed lines, and the flaws are a checklist of violations where one box is inked.
- **The log:** the printer's tape, one printed line for each order, the selected order under the lamp.
- **The plot:** graph paper pinned to the pass. Each order is a slip, the wait the stopwatch never saw is the ribbon's red, and the histogram is stacks of slips with the claim and the ruler as masking-tape flags.
- **Numbers:** dots, each with its tag. Amber falls only on the present, the selected order.

STORY: The learner comes to see that a percentile is only as honest as its clock, its sample and its setup. They read a log for the signature of a flaw, apply the rule of evidence that corrects it, commit a number and an interval before the court reads the real one, and see their ruling beside a re-run of the corrected benchmark.

FIRST VIEWPORT:
- **At 1440 px:** under the game's name and its level tape, the task in a line across the top, then two columns. Left: the pass, with its three tabs (Rows, Timeline, Histogram, opening on the Histogram), the sheet of graph paper, and the selected order's ticket under it. Right: the inspector's clipboard (the claim stamped large, the setup and the notes beneath it) over the tail, the slowest orders ranked. The desk's two instruments, the checklist and the answer slip follow under the pass.
- **At 390 px:** one column, in the order task, clipboard, the pass with its tabs, the tail, then the desk, the checklist and the answer slip.
- **The primary action:** "File the ruling", the stub at the foot of the answer slip.

FORM: The Pass, as GAMES.md §2.6 ("The Inspection") and DESIGN.md specify it. seed: none (specified surface, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The ruling. The court reads the number the report should have had: on the histogram the claim's flag stands near the left, the corrected flag far to its right, and in the learner's own case the omitted waits are printed in red between each due tick and its sent tick.

- **Built:** the ruling's exhibits stand beside it. The corrected run is a histogram sheet with the report's flag, the court's and the learner's, and a second sheet is the stretch of the learner's own log around its longest wait, each order's due tick, its wait in the ribbon's red and its sent tick, as on the Timeline sheet. A log that sent no order late has no such stretch.
- **Adaptation, cited (finish review, round 1):** the histogram's ruler runs up the sheet, on the same logarithmic scale as the board's own histogram, so "near the left" and "far to its right" are drawn as low on the ruler and far above it. One ruler on both sheets keeps the corrected run comparable with what the learner read on the board.

## Unresolved

- **The 3D opener** (`rain-and-relay`) is a stretch built after `court` ships; its camera presets and the kitchen words for its arenas are in GAMES.md §2.6.
- **Pass bars** are the proposals of GAMES.md §11 and ASSESSMENT §4.3 [estimated]; the owner confirms them with the rest of ASSESSMENT.
- **Raised with the documenter (finish review, round 1):**
  - DESIGN.md's Ticket ("a Doto head line over a dotted rule, a heading-face title") puts a kicker over every titled ticket. This game drops the head line wherever a title follows and prints what it said on the foot line.
  - DESIGN.md's Toggle lights a switch that is on in the lamp's amber. Here amber falls only on the selected order, so the desk's switch shows an inked pilot when it is on.
