---
version: 1
slug: "src-games-broken-bench-game-tsx"
primary_target: "src/games/broken-bench/Game.tsx"
related_targets: ["src/games/broken-bench","packages/play/broken-bench"]
---

# Broken benchmark (`/play/broken-bench`)

## Scope

- **Surface:** the Broken benchmark's game page and its frame, in Operate mode, and the same instrument in TR8's lessons. 2D only.
- **Visitor:** a learner auditing a benchmark report: coordinated omission, warm-up, defaults and the goodput denominator.
- **Task:** read the claim, the latency histogram and the request timeline, flip where latency counts from, name the flaw, and file a corrected p99 with a range that must hold the corrected value.
- **States that matter:** the reported p99, the histogram on a log axis, the timeline of due and sent times, the switch, the report form and its range rule, and the readout (reported p99, corrected p99, requests, omitted waits).
- **Constraints:** the PRODUCT.md constraints; by keyboard; 360 px with no sideways scroll; the route is close under its frozen 200 KB gate.

## Direction contract

THESIS: The benchmark drawn as the latency plots an engineer reads: a histogram and a timeline under one claim. The learner audits it.

OWN-WORLD: Data Book (REDESIGN §2.8), as the front page's contract states it:
- **Ground and surfaces:** flat paper, cut square, with no texture; one soft shadow for a sheet and one for a popover, never a sheet inside a sheet.
- **Active state:** one amber marker that means "now", always with its dark edge, a shape and a word, and only on its three carriers: the control to act on now (the amber button, or the ring an intro points at), the "now" cursor on a diagram, and the current position in a rail.
- **Categorical code:** six colours, each with its glyph (blue circle, green hexagon, yellow diamond, red triangle, white hollow ring, brown square), only where the model's state is drawn; a cached page and a draft are hatched, so no yellow field reads as the marker.
- **Drawing:** the graticule inside the diagram as its axis or its cell grid, ink marks in the code, empty and idle as dashed hollow boxes, dimension lines with end ticks and a value.
- **Provenance:** one stamp per instrument, on its readout strip; a tag inside prose is a dotted underline, never a chip.
- **3D:** a model of the same diagram: matte solids on a pale plate engraved with the graticule, empty as dashed wire outlines, the "now" cursor a thin amber sheet; every word and number stays DOM. Offered only where depth carries something, and from desk width.

STORY: Flipping latency from send time to due time moves the p99 on the chart and turns the hidden waits red: the worst waits never reached the log.

FIRST VIEWPORT: At 1440 the chart and the timeline at the left with the switch beside them, the dock at the right with the parts list, then the report form with its range rule printed over it. At 390 the chart's box is about 250 px tall and the dock is pinned to the foot.

FORM: Data Book's instrument frame. There is no 3D view. seed: none (a specified surface inside the established world, which the owner confirmed at the look gate; no roll)

FINISH: unreviewed and undocumented is unfinished; this surface ends with wave R's finish review (R-T50), its material fixes, and DESIGN.md written from the built world

## The frame

The instrument frame (REDESIGN §2.6, §3.5): the title strip (title, role line, level menu, Diagram and 3D where offered, Parts, How to play, Keyboard), the goal line, the diagram with its legend under it and a gutter at its left for the first run's callout discs, the dock beside it at a desk and pinned to the foot of a phone that is 700 px or taller, the foot strip, the title block and State as a table. The dock holds the coach strip during the first run, the decision, the readout strip with the instrument's one stamp, and at the end the result: the verdict, the amber way on straight under it, then the sentence and what the game adds. At the result the dock takes its content's height, never cutting a line or a button, and the readout stands at the screen's foot.

## Memorable moment

The switch flipped to due time: the p99 jumps, and the dock names it once: "Coordinated omission: the worst waits never reached the log."

## Unresolved

- At 390 the chart shows only its top until the learner scrolls inside its box (the R-T31 follow-up).
- Part popovers with sources for the histogram and the timeline are not wired.

## The Pass's contract, superseded

Until wave R this surface was specified in The Pass (D-047), the kitchen world. D-062 replaced it with Data Book, which the owner confirmed at the look gate on 2026-11-16, and stage 4 took the kitchen's files out of the tree. The superseded contract and its finish-review adaptations are in this file's git history; none of it applies to the built surface.
