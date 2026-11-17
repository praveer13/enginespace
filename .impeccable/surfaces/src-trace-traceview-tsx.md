---
version: 1
slug: "src-trace-traceview-tsx"
primary_target: "src/trace/TraceView.tsx"
related_targets: ["src/trace"]
---

# Trace viewer (Traces)

## Scope

- **Surface:** the trace viewer, the instrument of Trace attribution (`gap-hunt`, GAMES.md §2.6), in Operate mode. It is a component and not a page. Its first host is the Traces page's synthetic specimen, `/trace-room/synthetic-<seed>`, which the dev server and test builds show until W2-T20 ships the game; Trace attribution (W2-T20) and Request path's graded map embed it.
- **Visitor:** a backend engineer reading a trace to find where a step's time went. They know Perfetto and Chrome's trace viewer, so the affordances must be the familiar ones: zoom, pan, select, a list of what is in view.
- **Action:** read the lanes, step from one event edge to the next, mark a stretch of the trace with a category, label it, name the cause, and export the marks as evidence.
- **Proof:** the viewer draws a real `trace@1`. A synthetic one says so on its face; a captured one carries its GPU, engine pin, date and SHA-256. Every number is an integer ns read off the trace.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected; a practice mark writes nothing);
  - Canvas2D for the lanes, 100k spans panned at 30 fps or better, and a DOM mirror that carries every fact the canvas draws;
  - every action by keyboard, axe clean, 360 px and up, reduced motion cuts.

## Direction contract

THESIS: A trace is the engine's own lane diagram, the kind its engineers read in a profiler, drawn on flat paper: every ns on it belongs to one span, and the cursor is the one "now". It refuses the profiler default: a dark flame-chart canvas of grey lane bars and a swatch legend.

OWN-WORLD: Data Book (REDESIGN §2.8):
- **The paper:** flat paper with the graticule inside the diagram, a label column at the left and ruler ticks along the time axis.
- **The lanes:** "CPU lane", "CUDA calls", "GPU lane" and "Notes", each label with its glyph. A span is its code colour with the code's glyph repeated across it, in the ink that reads on it; a note is a dashed outline. A legend under the diagram shows the code and the cursor.
- **The cursor:** the marker, a 2 px amber line with a 1 px dark edge on each side down the lanes, the word "now" in the foot (DOM), and an amber ring with its dark edge round the span it is on.
- **Marks:** a stretch across the lanes, snapped to event edges, with the category's glyph and the learner's label.
- **Numbers:** in the tabular mono face, with one stamp for the trace's provenance; the span table's cursor row is a well fill, not amber.

STORY: The learner comes to see that every ns of a step belongs to exactly one thing, and that a gap is where the engine's calls ran out. They believe the trace is evidence, because it names its source and prints its numbers from the trace itself. They walk it edge to edge, mark a stretch, tag it, name the cause, and leave with marks the ledger can hold.

FIRST VIEWPORT:
- **At 1440 px:** the h1 "Traces" and the trace's heading ("A synthetic trace" or "A captured trace") with its provenance stamp; the toolbar in groups (zoom, Earlier and Later, Previous and Next step, Previous and Next edge, Mark and its controls, the categories each with its glyph, Keyboard); the lane diagram, full width; the readout strip "The event at the cursor", the marks, and the span table below them, a lane at a time.
- **At 390 px:** the same order, stacked: the toolbar wraps, each lane's name stands on a strip above its lane, and each table row prints as a block of its own.
- **Primary action:** Mark.

FORM: Data Book's lane diagram (REDESIGN §2.8; GAMES.md §2.6 names the game Trace attribution). seed: none (a specified surface inside the established world, which the owner confirmed at the look gate; no roll)

FINISH: unreviewed and undocumented is unfinished; this surface ends with wave R's finish review (R-T50), its material fixes, and DESIGN.md written from the built world

## Memorable moment

The learner steps along the GPU lane with J and K, and the now cursor walks from kernel to kernel until it reaches the empty stretch between two forwards. M marks exactly that stretch across the lanes, snapped to its edges, and the marks list prints its length in ns.

## Unresolved

- **Trace attribution's session:** levels, the `checkHunt` grade, the unaccounted counter and the hidden reference are W2-T20's. The viewer never computes or shows the true partition, so it cannot give the answer away.
- **Pinned traces:** none exist before W2-T21. The viewer reads any valid `trace@1`, and the specimen on the Traces route is synthetic.
- **Narrow widths:** the mark labels truncate ("C."), and the "Left" and "Right" key caps use the mono face unlike the others (R-T27's follow-ups).

## The Pass's contract, superseded

Until wave R this surface was specified in The Pass (D-047), the kitchen world: the night's tape, feeding past a reading line. D-062 replaced it with Data Book, which the owner confirmed at the look gate on 2026-11-16, and stage 4 took the kitchen's files out of the tree. The superseded contract is in this file's git history; none of it applies to the built surface.
