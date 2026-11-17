---
version: 1
slug: "src-games-pool-game-tsx"
primary_target: "src/games/pool/Game.tsx"
related_targets: ["src/games/pool","packages/play/pool"]
---

# KV page pool (`/play/pool`)

## Scope

- **Surface:** the KV page pool's game page and its frame, in Operate mode, and the same instrument inside TR5a's lessons.
- **Visitor:** a kernelspace graduate who has met paged attention and prefix caching, learning how one page pool serves several KV cache groups and adapters.
- **Task:** play the KV allocator on a seeded run: admit a waiting request or none, choose cached pages to evict when the pool is full, preempt when it must, and recompute as few tokens as the reference run.
- **States that matter:** each page's state (free, in use, cached, shared by a prefix hit, an adapter's, about to be evicted), the free queue's order, the running batch, the waiting queue, the open decision and its candidates, and the readout (served, prefix hits, recomputed, evictions, preemptions).
- **Constraints:** the PRODUCT.md constraints; the whole level by keyboard; at 390 px sixteen 20 px cells to a row with nothing scrolling sideways; numbers stay in the DOM; the scene's chunk under its frozen 40 KB.

## Direction contract

THESIS: The pool is drawn as a page map: 44 square cells in rows of sixteen, each a page with its state's colour and glyph, the free queue as a strip in eviction order, and the running batch as dashed slots. The learner is the KV allocator.

OWN-WORLD: Data Book (REDESIGN §2.8), as the front page's contract states it:
- **Ground and surfaces:** flat paper, cut square, with no texture; one soft shadow for a sheet and one for a popover, never a sheet inside a sheet.
- **Active state:** one amber marker that means "now", always with its dark edge, a shape and a word, and only on its three carriers: the control to act on now (the amber button, or the ring an intro points at), the "now" cursor on a diagram, and the current position in a rail.
- **Categorical code:** six colours, each with its glyph (blue circle, green hexagon, yellow diamond, red triangle, white hollow ring, brown square), only where the model's state is drawn; a cached page and a draft are hatched, so no yellow field reads as the marker.
- **Drawing:** the graticule inside the diagram as its axis or its cell grid, ink marks in the code, empty and idle as dashed hollow boxes, dimension lines with end ticks and a value.
- **Provenance:** one stamp per instrument, on its readout strip; a tag inside prose is a dotted underline, never a chip.
- **3D:** a model of the same diagram: matte solids on a pale plate engraved with the graticule, empty as dashed wire outlines, the "now" cursor a thin amber sheet; every word and number stays DOM. Offered only where depth carries something, and from desk width.

STORY: Admitting a request fills its pages where they stand; a prefix hit reuses pages and computes nothing for them; an eviction takes the free queue's head, and the cost of a bad choice shows as recomputed tokens against the reference.

FIRST VIEWPORT: At 1440 the page map at the left with its legend (free, in use, cached hatched, a prefix hit waits on it), the dock at the right with the level's guess and then the admit list, the readout under it. At 390 the map takes the width and the pinned dock holds the decision and its options over one readout line; the wide dock's explaining sentence is left to Parts and How to play. 3D is offered from desk width only.

FORM: Data Book's instrument frame. The 3D view is the rack from kit primitives: a page stands in its cell for its whole life, free pages as dashed wire outlines, cached ones hatched, and threads run from a request's slot to its pages. The regions' names stand at the sheet's left, clear of every thread. seed: none (a specified surface inside the established world, which the owner confirmed at the look gate; no roll)

FINISH: unreviewed and undocumented is unfinished; this surface ends with wave R's finish review (R-T50), its material fixes, and DESIGN.md written from the built world

## The frame

The instrument frame (REDESIGN §2.6, §3.5): the title strip (title, role line, level menu, Diagram and 3D where offered, Parts, How to play, Keyboard), the goal line, the diagram with its legend under it and a gutter at its left for the first run's callout discs, the dock beside it at a desk and pinned to the foot of a phone that is 700 px or taller, the foot strip, the title block and State as a table. The dock holds the coach strip during the first run, the decision, the readout strip with the instrument's one stamp, and at the end the result: the verdict, the amber way on straight under it, then the sentence and what the game adds. At the result the dock takes its content's height, never cutting a line or a button, and the readout stands at the screen's foot.

## Memorable moment

Request 1 admitted: its pages take their cells, and the dock names it once: "Request 1 took 6 pages: 96 tokens at 16 a page, in 1 group." On request 2 a prefix hit reuses two pages.

## Unresolved

- At 1440 the 3D scene uses about half of its box at the default camera.
- The graticule behind the page cells runs at its own pitch; drawing it as the cell grid is open.

## The Pass's contract, superseded

Until wave R this surface was specified in The Pass (D-047), the kitchen world. D-062 replaced it with Data Book, which the owner confirmed at the look gate on 2026-11-16, and stage 4 took the kitchen's files out of the tree. The superseded contract and its finish-review adaptations are in this file's git history; none of it applies to the built surface.
