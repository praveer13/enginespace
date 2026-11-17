---
version: 1
slug: "src-games-loop-game-tsx"
primary_target: "src/games/loop/Game.tsx"
related_targets: ["src/games/loop","src/pages/Game.tsx","packages/play/loop"]
---

# Step loop's own page (`/play/loop`)

## Scope

- **Surface:** the Step loop's game page and its frame, in Operate mode: the four demo levels and the five full levels of TR2 and TR6.
- **Visitor:** a learner who has met the step loop on the front page, or comes from a TR2 lesson, and plays the scheduler on a seeded run.
- **Task:** admit waiting requests into batch slots and run steps; on the full levels, decide what the step does (budget, async scheduling, padding) and beat the reference run's clock.
- **States that matter:** the waiting queue, each slot's request, the CPU's calls and the GPU's forwards over time, idle stretches, the now cursor, the readout's step, tokens out, GPU busy and GPU idle.
- **Constraints:** the PRODUCT.md constraints; every action by keyboard; 360 px with no sideways scroll (the track scrolls inside its box); reduced motion draws each state at its end; the scene's chunk under its frozen 40 KB.

## Direction contract

THESIS: The step loop drawn as an engineer draws it in a profiler: a timing diagram with a waiting-queue row, a CPU lane and one row per batch slot over synthetic ticks. The learner is the scheduler, and every gap they leave is drawn as idle.

OWN-WORLD: Data Book (REDESIGN §2.8), as the front page's contract states it:
- **Ground and surfaces:** flat paper, cut square, with no texture; one soft shadow for a sheet and one for a popover, never a sheet inside a sheet.
- **Active state:** one amber marker that means "now", always with its dark edge, a shape and a word, and only on its three carriers: the control to act on now (the amber button, or the ring an intro points at), the "now" cursor on a diagram, and the current position in a rail.
- **Categorical code:** six colours, each with its glyph (blue circle, green hexagon, yellow diamond, red triangle, white hollow ring, brown square), only where the model's state is drawn; a cached page and a draft are hatched, so no yellow field reads as the marker.
- **Drawing:** the graticule inside the diagram as its axis or its cell grid, ink marks in the code, empty and idle as dashed hollow boxes, dimension lines with end ticks and a value.
- **Provenance:** one stamp per instrument, on its readout strip; a tag inside prose is a dotted underline, never a chip.
- **3D:** a model of the same diagram: matte solids on a pale plate engraved with the graticule, empty as dashed wire outlines, the "now" cursor a thin amber sheet; every word and number stays DOM. Offered only where depth carries something, and from desk width.

STORY: A slot left empty is a dashed box on the GPU's row, a CPU that is late is a bubble with its dimension line, and async scheduling closes the bubbles. The result sets the learner's run against the reference run's.

FIRST VIEWPORT: At 1440 the frame fills the screen under the header: the timing diagram at the left (queue chips, CPU lane, four slot rows, the axis in synthetic ticks, now at tick 0), the dock at the right with the parts list on a first visit and then the queue's admit controls and Step, the readout under it. At 390 the diagram scrolls sideways inside its box with now in view, and the dock is pinned to the foot with the decision over one readout line. 3D is offered from desk width only.

FORM: Data Book's instrument frame. The 3D view is the time track at the Lifted camera, the same diagram on a plate: slot slabs with a clear gap between rows, the sync parted from the now sheet, and the word now over the lanes where the 2D view puts it. Compare stacks static batching, continuous batching and async scheduling. seed: none (a specified surface inside the established world, which the owner confirmed at the look gate; no roll)

FINISH: unreviewed and undocumented is unfinished; this surface ends with wave R's finish review (R-T50), its material fixes, and DESIGN.md written from the built world

## The frame

The instrument frame (REDESIGN §2.6, §3.5): the title strip (title, role line, level menu, Diagram and 3D where offered, Parts, How to play, Keyboard), the goal line, the diagram with its legend under it and a gutter at its left for the first run's callout discs, the dock beside it at a desk and pinned to the foot of a phone that is 700 px or taller, the foot strip, the title block and State as a table. The dock holds the coach strip during the first run, the decision, the readout strip with the instrument's one stamp, and at the end the result: the verdict, the amber way on straight under it, then the sentence and what the game adds. At the result the dock takes its content's height, never cutting a line or a button, and the readout stands at the screen's foot.

## Memorable moment

The first step with four slots full: the GPU's rows fill for the cost of one forward, and the dock names it once: "A step costs the GPU about the same for one request as for four. That is batching."

## Unresolved

- The full levels' lanes and the demo's could share one drawing pass (the R-T28 follow-up).
- The 3D scene uses about half of its box at the Lifted camera; Compare is where depth earns its place.

## The Pass's contract, superseded

Until wave R this surface was specified in The Pass (D-047), the kitchen world. D-062 replaced it with Data Book, which the owner confirmed at the look gate on 2026-11-16, and stage 4 took the kitchen's files out of the tree. The superseded contract and its finish-review adaptations are in this file's git history; none of it applies to the built surface.
