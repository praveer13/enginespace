---
version: 1
slug: "src-trace-traceview-tsx"
primary_target: "src/trace/TraceView.tsx"
related_targets: ["src/trace"]
---

# Trace viewer

## Scope

- **Surface:** the trace viewer, the instrument of The Tape (`gap-hunt`, GAMES.md §2.6), in Operate mode. It is a component and not a page. Its first host is `/trace-room/:trace`; Gap Hunt (W2-T20) and the Engine Floor's graded map (W1-T19) embed it.
- **Visitor:** a kernelspace graduate, a backend engineer reading a trace to find where a step's time went. They know Perfetto and Chrome's trace viewer, so the affordances must be the familiar ones: zoom, pan, select, a list of what is in view.
- **Action:** read the lanes, step from one event edge to the next, stamp a stretch of the tape with a category, label it, name the cause, and export the marks as evidence.
- **Proof:** the tape draws a real `trace@1`. A synthetic one says so on its face; a captured one carries its GPU, engine pin, date and SHA-256. Every number is an integer ns read off the trace.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected; a practice mark writes nothing);
  - Canvas2D for the lanes, 100k spans panned at 30 fps or better, and a DOM mirror that carries every fact the canvas draws;
  - every action by keyboard, axe clean, 360 px and up, reduced motion cuts.

## Direction contract

THESIS: A trace is the night's tape, the printer's record of every call, cook and wait, and the viewer is that strip of bond paper feeding past a fixed reading line. Every ns on it is printed, nothing is painted. The surface refuses the profiler default: a dark flame-chart canvas of grey lane bars, a tick axis and a swatch legend.

OWN-WORLD:
- **The paper:** white bond with tractor-feed holes along both edges. The top rail of holes is the time axis: a small hole at each minor tick, a larger one and a Doto number at each major tick, all moving with the tape.
- **The lanes:** printed rows split by dotted perforation. A span is a block of printer dots in its board colour with a 1px edge in the code's edge colour: dense dots for kernels and frames, sparse dots for copies, hatching for syncs, an open outline for stations dark. Bells are perforation rules down every lane.
- **The gutter:** brushed stainless at the left, each lane named on masking tape with its engine term beside the kitchen word.
- **Marks:** masking tape stuck across the lanes, snapped to event edges, with the category's glyph and the learner's marker text.
- **The lamp:** the focused event alone takes heat-lamp amber, an edgeless pool on the paper and a filament ring, with the reading line down the lanes at its edge.
- **Print and tickets:** numbers in Doto with the provenance stamp; the cursor on a printer tape; the span table and the marks on tickets.

STORY: The learner comes to see that every ns of a step belongs to exactly one thing, and that a gap is where the line's calls ran out. They believe the tape is evidence, because it names its source and prints its numbers from the trace itself. They walk the tape edge to edge, stamp a stretch, tag it, name the cause, and leave with marks the ledger can hold.

FIRST VIEWPORT:
- **At 1440 px:**
  - the tape's name stamped as a heading, the line that says what it is, and the window's length with its provenance stamp and the step it is on at the right;
  - a raised steel strip under it, with the plates in groups: zoom out and in, pan back and on, this step, the whole tape, the step before and after, the edge before and after, then Mark, Cancel, Cause and Remove, and the four category plates, each with its glyph;
  - the tape itself, about 260px tall and full width: a 164px stainless gutter with the lane names on masking tape (the kitchen's word, and the engine's term under it) and "your marks" beside the rail, the feed-hole rail with its numbers, three lanes, the bells, and the third step's window filling the paper, where the line is dark while the expo writes;
  - the cursor's printer tape on the left (event, lane, kind, the cursor's ns, how long it lasts, correlation id), the marks ticket on the right, and the table of spans below them, a lane at a time, with a button under a lane that lists more.
- **At 390 px:** the same order, stacked. The plates wrap into compact rows (five at this width), the tape follows with each lane's name on a strip above its lane, the printer and the marks ticket print one under the other, and each table row prints as a block of its own.
- **Primary action:** Mark, a deep steel plate, with the lamp on the first block of the window it will start from.

FORM: The Tape as GAMES.md §2.6 specifies it: the night's tape, with zoom and pan running the tape back and forth. Form 1 of 1, because the surface is specified. seed: none (specified surface, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The learner steps along the line lane with J and K, and the lamp walks from kernel to kernel until it reaches the dark stretch between two cooks. M stamps a strip of masking tape across the lanes, snapped to exactly that stretch, and the marks ticket prints its length in ns.

## Unresolved

- **Gap Hunt's session:** levels, the `checkHunt` grade, the unaccounted counter and the hidden reference are W2-T20's. The viewer never computes or shows the true partition, so it cannot give the answer away.
- **Pinned traces:** none exist before W2-T21. The viewer reads any valid `trace@1`, and the specimen on the Trace Room route is synthetic.
