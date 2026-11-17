---
version: 1
slug: "src-games-engine-floor-game-tsx"
primary_target: "src/games/engine-floor/Game.tsx"
related_targets: ["src/games/engine-floor","packages/play/engine-floor"]
---

# Request path (`/play/engine-floor`)

## Scope

- **Surface:** the Request path's game page and its frame, in Operate mode, and the same instrument in TR1's lessons. 2D only.
- **Visitor:** a learner tracing one request through nano-vllm, vLLM and SGLang, process by process.
- **Task:** predict how many process boundaries a sampled token crosses, then lay the path stage by stage from the stage list, each stage's mechanism and where it runs; the run stops at the first stage that departs from the engine's own path, and says why.
- **States that matter:** the swimlane's columns (processes and their threads, the GPU's streams), each laid row with its hop's mechanism, the now cursor on the last node, a stopped row, the stage list with its filters, and the readout (stages laid, boundaries crossed, copies, syncs).
- **Constraints:** the PRODUCT.md constraints; by keyboard (the rows are a list the arrows walk); at 390 the columns are 72 px and scroll sideways inside the box; the path's length is never shown in a graded run.

## Direction contract

THESIS: The request's path drawn as a swimlane: processes as columns, time running down, each laid stage a node in its column with an arrow labelled by its mechanism. The learner traces one request.

OWN-WORLD: Data Book (REDESIGN §2.8), as the front page's contract states it:
- **Ground and surfaces:** flat paper, cut square, with no texture; one soft shadow for a sheet and one for a popover, never a sheet inside a sheet.
- **Active state:** one amber marker that means "now", always with its dark edge, a shape and a word, and only on its three carriers: the control to act on now (the amber button, or the ring an intro points at), the "now" cursor on a diagram, and the current position in a rail.
- **Categorical code:** six colours, each with its glyph (blue circle, green hexagon, yellow diamond, red triangle, white hollow ring, brown square), only where the model's state is drawn; a cached page and a draft are hatched, so no yellow field reads as the marker.
- **Drawing:** the graticule inside the diagram as its axis or its cell grid, ink marks in the code, empty and idle as dashed hollow boxes, dimension lines with end ticks and a value.
- **Provenance:** one stamp per instrument, on its readout strip; a tag inside prose is a dotted underline, never a chip.
- **3D:** a model of the same diagram: matte solids on a pale plate engraved with the graticule, empty as dashed wire outlines, the "now" cursor a thin amber sheet; every word and number stays DOM. Offered only where depth carries something, and from desk width.

STORY: Every hop that changes column crosses a process boundary and needs IPC or shared memory; the count the learner predicted is the count the path crosses.

FIRST VIEWPORT: At 1440 the swimlane at the left and the dock at the right with the scenario, the stage list and Run the path. Before the guess no column of the level is drawn, as the brief asks, so the first run draws an example under the request instead: two dashed process columns and one hop between them, marked "An example, not this path", and the discs for processes and a hop stand level with it. At 390 the process names wrap whole in their columns, and each readout delta stands after its number.

FORM: Data Book's instrument frame. There is no 3D view (REDESIGN §2.9: cut). seed: none (a specified surface inside the established world, which the owner confirmed at the look gate; no roll)

FINISH: unreviewed and undocumented is unfinished; this surface ends with wave R's finish review (R-T50), its material fixes, and DESIGN.md written from the built world

## The frame

The instrument frame (REDESIGN §2.6, §3.5): the title strip (title, role line, level menu, Diagram and 3D where offered, Parts, How to play, Keyboard), the goal line, the diagram with its legend under it and a gutter at its left for the first run's callout discs, the dock beside it at a desk and pinned to the foot of a phone that is 700 px or taller, the foot strip, the title block and State as a table. The dock holds the coach strip during the first run, the decision, the readout strip with the instrument's one stamp, and at the end the result: the verdict, the amber way on straight under it, then the sentence and what the game adds. At the result the dock takes its content's height, never cutting a line or a button, and the readout stands at the screen's foot.

## Memorable moment

A hop crosses a column, and the dock names it once: "That hop crosses a process boundary: it is IPC, not a function call."

## Unresolved

- At 390 a hop between two stages in the same column has no slot of its own for its label (the finish review's open item).
- Marking the counted stages on the drawing at the result is not built.

## The Pass's contract, superseded

Until wave R this surface was specified in The Pass (D-047), the kitchen world. D-062 replaced it with Data Book, which the owner confirmed at the look gate on 2026-11-16, and stage 4 took the kitchen's files out of the tree. The superseded contract and its finish-review adaptations are in this file's git history; none of it applies to the built surface.
