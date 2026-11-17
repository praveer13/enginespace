---
name: enginespace
description: The Engine Internals course, drawn as the engine's own data book on flat paper, with one amber mark that means now.
colors:
  surface-0: "#e9ece6"
  surface-1: "#f4f5f0"
  surface-2: "#d9ddd4"
  surface-3: "#2b3138"
  edge: "#5f666d"
  paper: "#fafaf6"
  paper-ink: "#1d1b22"
  paper-ink-2: "#a30f1a"
  paper-rule: "#c2c8bd"
  lamp: "#ffb547"
  lamp-ring: "#9a3d00"
  tape: "#e6d6ad"
  tape-ink: "#1a1a1c"
  light-fluorescent: "#eef4f8"
  glint: "#ffffff"
  text-1: "#17191d"
  text-2: "#3b4148"
  text-3: "#4b525a"
  cat-red: "#c8102e"
  cat-red-edge: "#9b0d1a"
  cat-blue: "#1b5faa"
  cat-blue-edge: "#18509a"
  cat-yellow: "#f5c400"
  cat-yellow-edge: "#685000"
  cat-green: "#237a37"
  cat-green-edge: "#185e2c"
  cat-white: "#f3f3ef"
  cat-white-edge: "#5f666d"
  cat-brown: "#7b4a26"
  cat-brown-edge: "#5a361b"
typography:
  display:
    fontFamily: "'Big Shoulders Display', sans-serif"
    fontSize: "clamp(2rem, 1.2rem + 3.4vw, 3.5rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.005em"
  heading:
    fontFamily: "'Big Shoulders Display', sans-serif"
    fontSize: "clamp(1.625rem, 1.3rem + 1.4vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "0.005em"
  body:
    fontFamily: "'Atkinson Hyperlegible', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0em"
  mono:
    fontFamily: "'Atkinson Hyperlegible Mono', 'Atkinson Hyperlegible', monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  numeric:
    fontFamily: "'Atkinson Hyperlegible Mono', 'Atkinson Hyperlegible', monospace"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0em"
    fontFeature: "'tnum'"
  ticket:
    fontFamily: "'Atkinson Hyperlegible Mono', 'Atkinson Hyperlegible', monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0em"
  label:
    fontFamily: "'Atkinson Hyperlegible', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0em"
rounded:
  paper: "0px"
  trim: "2px"
  plate: "3px"
  shoulder: "8px"
  pan: "10px"
  round: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
  "16": "4rem"
  "24": "6rem"
components:
  button-primary:
    backgroundColor: "{colors.lamp}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.plate}"
    padding: "0.5rem 1rem"
    height: "2.75rem"
  button-primary-disabled:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-3}"
  button-outline:
    textColor: "{colors.text-1}"
    rounded: "{rounded.plate}"
    padding: "0.5rem 1rem"
    height: "2.75rem"
  button-outline-active:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
  button-ink:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.paper}"
    rounded: "{rounded.plate}"
    padding: "0.5rem 1rem"
    height: "2.75rem"
  button-quiet:
    textColor: "{colors.text-1}"
    rounded: "{rounded.plate}"
    padding: "0.5rem 1rem"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.paper}"
    padding: "1.5rem 1.5rem 1rem"
    width: "24rem"
  label:
    textColor: "{colors.text-1}"
    typography: "{typography.label}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.paper}"
    height: "2.75rem"
    width: "28rem"
  readout:
    textColor: "{colors.text-1}"
    typography: "{typography.numeric}"
  readout-strip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    padding: "0.75rem 1rem"
  switch:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.plate}"
    width: "4.5rem"
    height: "2.5rem"
  switch-on:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.paper}"
  header:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-2}"
    padding: "0.75rem 1rem"
  header-link-current:
    textColor: "{colors.text-1}"
  footer:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.paper}"
    padding: "0.75rem 1rem"
  stamp:
    textColor: "{colors.text-2}"
    rounded: "{rounded.trim}"
    padding: "0.0625rem 0.25rem"
  stamp-unverified:
    textColor: "{colors.paper-ink-2}"
  callout:
    backgroundColor: "{colors.text-1}"
    textColor: "{colors.paper}"
    rounded: "{rounded.round}"
    size: "1.625rem"
  callout-pressed:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text-1}"
  note:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.paper}"
    padding: "1rem"
  delta-chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.trim}"
    padding: "0 0.25rem"
  popover-trigger:
    textColor: "{colors.text-1}"
    rounded: "{rounded.plate}"
    padding: "0 0.75rem"
    height: "2.75rem"
  course-mark:
    backgroundColor: "{colors.lamp}"
    rounded: "{rounded.round}"
    size: "1.125rem"
---

# Design System: enginespace

## Overview

**Creative North Star: "Data Book"**

The engine's own data book, printed on flat paper, with one amber mark. The site draws the engine as its engineers already draw it: timing diagrams, page maps, distribution bars and latency plots, on paper over a flat ground. The look names nothing on screen: every object carries the engine's own name, and the picture is the engine's own diagram.

The system is a bright one. It ships a single light scheme, paper under daylight, plus a more-contrast variant and a forced-colours mapping; there is no dark scheme. Density is a reference book's: a calm reading column on one sheet, diagrams on a faint graticule, tables and readouts in tabular figures, a run-in head beside its first paragraph. Colour is spent as meaning only: amber for now, the second ink for what must not be missed, and six fills, each with its glyph or hatch, as the one colour code.

Motion keeps to the action. Things move when the learner acts and are still between actions, and every duration is 0 under reduced motion, with the state drawn at its end. Data Book replaced The Pass, the kitchen world the course was first drawn in, on 2026-11-16 (D-062); nothing of that world is drawn any more.

**Key Characteristics:**
- A flat ground with no texture, and paper cut square with one soft sheet shadow.
- Amber means now: it has three carriers, always with its dark edge, a shape and a word.
- Focus is ink: 3 px of text-1 at a 2 px offset, with a paper halo.
- Three faces: Big Shoulders Display for titles, Atkinson Hyperlegible for reading and labels, Atkinson Hyperlegible Mono for code and every number.
- Sentence case everywhere: nothing is transformed to upper case, so vLLM, SGLang and v0.33.0 keep their casing.
- Six fills with their glyphs are the one colour code, and appear only where the model's state is drawn.
- One instrument frame for every game and one template for every lesson, so the way on is always in the same place.
- 3D is a model of the same diagram: matte solids on a pale plate, with every word and number in DOM over it.

## Colors

Pale paper greys, paper white, two inks, one amber mark, and six fills held in reserve for the model's state.

### Primary
- **The Marker** (lamp): now, and only now. It has three carriers: the control to act on now (one amber-filled button per viewport, or one amber ring on the control an intro points at), the "now" cursor on a diagram (a 2 px line with the word "now", and the ring on the object the next move acts on), and the current-position mark in the rail and on the course track. On paper it is 1.68:1 [derived], so it never carries anything alone.
- **The Marker's Edge** (lamp-ring): amber's dark edge, 6.60:1 on paper and 3.93:1 on the marker [derived]. Every amber fill draws it at 2 px. Alone, as a bar at a row's start with a faint tint and the word "Next", it marks the next lesson in a list without spending a second amber fill.

### Secondary
- **The Second Ink** (paper-ink-2): errors, "Not yet", "unverified". It is never the colour of an action.

### Tertiary
The one colour code, shown in every diagram's legend. Each slot has a fill, an edge for outlines and text in the code's colour, and an ink that reads on the fill.
- **Blue, circle** (cat-blue, edge cat-blue-edge): CPU work; a page in use; the target p.
- **Green, hexagon** (cat-green, edge cat-green-edge): GPU work; a page shared by a prefix hit; the accepted overlap min(p, q).
- **Yellow, diamond** (cat-yellow, edge cat-yellow-edge): a sync; a cached page; the draft q. Its marks carry the edge, and a cached page is hatched.
- **Red, triangle** (cat-red, edge cat-red-edge): evicted; the residual (p - q)+; a violation.
- **White, hollow ring** (cat-white, edge cat-white-edge): idle; free; observed. Its marks carry the edge, dashed where the thing is empty.
- **Brown, square** (cat-brown, edge cat-brown-edge): a copy between host and GPU; an adapter's page.

### Neutral
- **Ground** (surface-0): the page, flat.
- **Raised** (surface-1): the header, a lesson's foot bar, a panel's head; mixed into paper, the ground of a code block.
- **Well** (surface-2): an empty slot, a pressed control, a selected row, a delta's chip; at about half strength, a hover.
- **Dark** (surface-3): the footer, the chosen view or camera, a switch that is on, a text selection; paper-white text sits on it.
- **Paper** (paper): everything read, every diagram, and the dock beside it.
- **Ink** (paper-ink): text on paper.
- **Graticule** (paper-rule): faint lines inside diagrams and figures, and a sheet's rules; never the only carrier of anything.
- **Edge** (edge): hairlines, control borders, dimension lines and dashed outlines, at 3:1.
- **Text** (text-1, text-2, text-3): primary, secondary and quiet text. text-1 is also the focus ring and a callout's disc.
- **Scene light** (light-fluorescent): the cool white of the 3D model's sky and key light. It colours no surface.
- **Left from The Pass** (tape, tape-ink, glint): three roles tokens.ts still declares and nothing draws with.

### Named Rules
**The One Marker Rule.** Amber means now. It has three carriers and no others: the control to act on now, the "now" cursor on a diagram, and the current-position mark in the rail and on the course track. The header's Continue is an outline wherever the page has a move in hand, and an intro's callouts are ink discs.

**The Ink Focus Rule.** The focus ring is 3 px of text-1 at a 2 px offset, with a paper halo. It is never amber, so focus is not mistaken for now, and it reads against the amber button's own edge.

**The Colour Is State Rule.** A code colour appears only where the model's state is drawn, and always with its glyph or hatch.

**The Declared Pair Rule.** A foreground goes on a background only through a pair tokens.ts declares and verify-tokens checks: 4.5:1 for text, 3:1 for marks and edges, in both shipped schemes.

## Typography

**Display Font:** Big Shoulders Display (with sans-serif)
**Body Font:** Atkinson Hyperlegible (with sans-serif)
**Label/Mono Font:** Atkinson Hyperlegible Mono (code, identifiers and every number), Atkinson Hyperlegible 700 (labels)

**Character:** A condensed grotesk for titles in sentence case, over a reading face drawn for legibility, with its mono for every number the learner compares. Three faces, all self-hosted.

### Hierarchy
- **Display** (Big Shoulders Display 800, clamp(2rem, 1.2rem + 3.4vw, 3.5rem), 1.0): a page's title, on Course, the panels and the document pages. The front page's title alone is larger, 2.25rem on a phone and 4rem at a desk, because it is the only words beside the live instrument.
- **Heading** (Big Shoulders Display 800, clamp(1.625rem, 1.3rem + 1.4vw, 2.25rem), 1.05): a title one step under a page's. In the same face a lesson's and a module's title run from 2rem to 2.75rem, a game's from 1.75rem to 2.5rem, and an instrument's title inside a lesson from 1.375rem to 1.75rem, so two display titles never compete on one screen.
- **Section heads** (Atkinson Hyperlegible 700, 1.5rem and 1.25rem): h2 and h3, and a sheet's title. A lesson's Run head is set run-in, beside its setup.
- **Body** (Atkinson Hyperlegible 400, 1.0625rem, 1.6): reading, at a 66ch measure. A lesson's promise and the front page's lede step up to 1.125rem.
- **Label** (Atkinson Hyperlegible 700, 0.875rem, 1.25): buttons, labels, lane and axis names, from 0.8125rem to 1rem. A button says what it does: "Step", "Check answer", "Start: TR1 lesson 1".
- **Numeric** (Atkinson Hyperlegible Mono 500, 1.125rem, tabular): every number the learner compares, falling back to Atkinson Hyperlegible for µ and ±.
- **Ticket** (Atkinson Hyperlegible Mono 400, 0.9375rem, 1.45): a readout strip's values, a sheet's numbered lines.
- **Mono** (Atkinson Hyperlegible Mono 400, 0.9375rem, 1.55): code from vLLM and SGLang, and identifiers.
- **Size ramp** (`--es-size-*`): the sizes that a component's own lines take. Small: micro (0.6875rem), stamp (0.75rem), caption (0.8125rem), note (0.875rem), print (0.9375rem, the mono size) and base (1rem). Reading and controls: body (1.0625rem, the body size), plate (1.125rem, the numeric size), title (1.25rem), action (1.375rem) and large (1.5rem). Fluid: count (clamp(2rem, 1.4rem + 2.4vw, 3rem), the biggest readout), page (clamp(2rem, 1.2rem + 3.4vw, 3.5rem), a page's title) and course (clamp(2.5rem, 1.8rem + 3vw, 4.5rem), declared and taken by no stylesheet).

### Named Rules
**The Sentence Case Rule.** No text is transformed to upper case, anywhere. Engine names keep their own casing.

**The Ramp Rule.** A size is a step of the ramp: `font-size` takes a `--es-size-*` token or a type role's own size, and a size outside the ramp is a one-off that keeps a one-line comment saying why.

## Layout

The shell's main column holds an 80rem maximum with a 1rem gutter on a phone and 2rem from 48rem; the header across the top and the footer at the foot run full width. Reading holds a 66ch measure. Spacing runs on a 4px step: 1rem gutters on a phone, 1.5rem inside a sheet and between items of a group, 3rem between groups, 4rem above a section head, 6rem between sections at desktop width.

A lesson is a head (breadcrumb, title, promise), then the section rail beside one sheet of paper from 64rem; the reading measure sits inside the sheet and an instrument takes the sheet's full width. Below 64rem the rail folds to a strip under the header and the way on moves to a bar at the foot. From 80rem wide and 44rem tall, Read's parts gain a 24rem dock beside them.

Every game sits in one instrument frame: a title strip (title, role line, level menu, the views and the tools), the goal line between two hairlines, the diagram with its dock beside it, a foot strip, and the title block. From 64rem the diagram and the dock share one row at one height, between 26rem and 44rem, sized so the diagram's current region, the current control and the readout are on the first screen together; a long list of options scrolls inside the dock. Narrower, they stack, and the dock is pinned to the foot over one readout line. An intro's callout discs stand in a gutter at the diagram's left, level with the parts they name.

### Named Rules
**The Short Viewport Rule.** Under 600 px of viewport height nothing is sticky or pinned. An instrument's dock on a narrow screen is pinned only from 700 px.

## Elevation & Depth

Depth is paper on a flat ground. There are two shadows and no more, each with an offset and a soft blur, never a glow. A ring drawn as a spread (focus's paper halo, the marker's ring, a callout's paper gap) is an edge, not a shadow. In 3D the same holds: each solid sits on a soft contact shadow with occlusion baked into its sides, there is no shadow map, and the "now" cursor is the only thing that glows.

### Shadow Vocabulary
- **Paper** (`box-shadow: 0 1px 2px rgb(23 25 29 / 0.12), 0 6px 14px -8px rgb(23 25 29 / 0.28)`): a sheet on the ground.
- **Lift** (`box-shadow: 0 2px 4px rgb(23 25 29 / 0.14), 0 16px 32px -12px rgb(23 25 29 / 0.36)`): a popover over the page, a dock pinned over it, and a sheet under the hand.

### Named Rules
**The Flat Paper Rule.** No texture anywhere. One shadow for a sheet and one for a popover. Paper is cut square.

**The Moves On Step Rule.** Things move on an action and are still between actions: 120 ms for the hand, 240 ms for a step, 640 ms for the one authored moment of an instrument. A readout changes at once and shows its delta for one second. Every duration is 0 under reduced motion, and the state is drawn at its end.

**The Words Are DOM Rule.** Every word or number a learner reads in a 3D scene is DOM over the canvas; a texture carries only marks nobody needs to read.

## Shapes

Paper is cut square (0px): sheets, diagrams, fields, notes, the readout strip. Small parts take 2px: a stamp, a chip, a page cell, a rail's segment. Controls take 3px: buttons, switches, menus, a popover's trigger. Dots, discs and pills are round. The shoulder (8px) and pan (10px) steps are declared and drawn by nothing.

Inside a diagram the graticule runs in paper-rule: on a timing diagram a rule on every tick of the time axis and one at the top of each row, on a page map a 2.5rem square grid at under half strength. An interval is marked as an engineering drawing marks it, with end ticks and its value; an idle stretch or an empty slot is a dashed hollow box with its word in it; a fill that would read as its neighbour takes a hatch. A label on a drawing sits on a slip of paper so no line crosses its words. Icons and category glyphs are drawn SVG on one 24-unit grid with one stroke weight, inheriting currentColor.

The 3D scenes are a model of the same diagram: matte, flat-shaded solids in the code's colours on a pale plate engraved with the graticule, lit by one directional light and a hemisphere. Idle and empty are dashed wire outlines, and "now" is a thin amber sheet with its edge. A game offers 3D only where depth shows something the diagram cannot, and a phone opens in the diagram.

## Components

Each component is drawn as its Data Book part, under the name it has in src/design/components.

### Buttons
- **Primary** (PrimaryButton, and the way on in NextStep and a lesson's foot bar): amber fill, a 2 px marker edge, a text-1 label in Atkinson Hyperlegible 700, 44 px or taller, 3 px corners, and an arrow that leans forward under the hand. Hover deepens the amber toward its edge; held down, with nothing to act on, it is a well with a dashed edge and no amber.
- **Outline** (Button, the default): flat, a 1 px edge, a 3 px radius, a text-1 label. Hover lays a half well; pressed is the well. Disabled, the edge is dashed.
- **Ink**: the dark surface with a paper-white label: the chosen view (Diagram or 3D), the chosen camera.
- **Quiet**: the label alone, underlined under the hand: Undo, Restart level, Skip intro.

### Sheet
Sheet is a plain paper panel with a title in Atkinson Hyperlegible 700, no hole and no torn edge, a quiet head line and foot line over hairline rules, 24rem wide by default. The sheet the next decision acts on takes an ink rule across its top. A guess to commit is a paper panel with a 1 px edge, doubled while it asks.

### Readout and readout strip
A readout sets its number in the mono face with tabular figures, its unit at 0.8em and its tag as a quiet word under a dotted line; only "unverified" takes the second ink. A change's delta is DeltaChip, a small well beside the number that holds for a second. ReadoutStrip is terms and values on one paper strip, a hairline between rows, with one provenance stamp at its head.

### Label and stamp
Label is the plain label: Atkinson Hyperlegible 700 in sentence case, still and unlit, with a slot's glyph when it names a category. Provenance is the Stamp: a small bordered word (0.75rem, 700, tracked 0.04em, 2 px corners) in secondary text, which opens the tag legend. Inside a sentence a tag is a dotted underline, never a chip.

### Inputs
- **Field**: a plain label over a paper slip with a 2 px foot line at 3:1; a number field types in the mono face and is never spun.
- **Switch** (Toggle): a flat track with a square thumb, and the state as a word, Off or On, in the open half. On, the track is dark. No light.
- **Level menu** (LevelMenu): one bordered select that reads "Level 1 of 9", the level's name and its kind.

### Navigation
- **Header**: the raised surface over a hairline, the site's name in the display face at 1.5rem, the places in Atkinson Hyperlegible 700, the page you are on in ink with an ink bar under it, and the way on at the right: Start or Continue with its target, as an outline, and as the amber fill only where the page has no move in hand. On a phone the name, the way on and a Navigation button share one row and the places fold below.
- **Footer**: the dark surface with paper-white links.
- **Section rail** (SectionRail): a lesson's numbered sections with their parts under a hairline; the current one carries the marker's shape and the word "now", and a segmented bar fills in secondary text behind it.
- **Course mark**: a round amber dot with its edge at the learner's position on the course track.

### The parts of an instrument
- **Marker**: the amber shape with its edge and a word. As a cursor it is a 2 px amber line with "now" on a paper slip; as a ring it is three bands, edge, amber, edge, round the control an intro points at.
- **Callout**: a 1.625rem ink disc with a paper numeral and a 2 px paper gap, inside a 44 px target. Pressed, it inverts to paper with an ink edge. Never amber.
- **Parts list** (PartsList) and **Legend**: the numbered names of what is on the drawing, and the colour code's glyphs with their meanings.
- **Goal line** (GoalLine): one sentence at up to 72ch that says the aim, what the learner controls, the number to beat in 700, and when it ends.
- **Note**: a square paper slip with a 1 px edge and a drawn mark by its title.
- **Popover**: a bordered trigger that opens a paper sheet on the lift shadow; on a phone it is a bottom sheet between the gutters.
- **Title block** (TitleBlock): one quiet line over a hairline that says what a drawing is, what its clock is and what the model leaves out.
- **Number line** (NumberLine): pins on an axis, each label starting with its pin's shape.
- **Busy mark, step control and loading dots** (BusyMark, StepControl, PrintingDots): a solid ink disc for busy and an open ring for idle, a flat step control, and still dots beside a line of text that says what is loading.

### Named Rules
**The Quiet Provenance Rule.** One stamp per instrument, table or figure. A tag inside prose is a dotted underline.

## Do's and Don'ts

### Do:
- **Do** take every colour, face, shadow, radius and duration from a token role in src/design/tokens.ts; tokens.css is generated from it and verify-tokens fails when they disagree.
- **Do** keep amber for now alone, on its three carriers, always with its dark edge, a shape and a word.
- **Do** draw focus as 3 px of text-1 at a 2 px offset, with a paper halo.
- **Do** set every number the learner compares in the mono face with tabular figures, with its tag.
- **Do** give every category its fill and its glyph, and carry yellow and white marks on their edge colour.
- **Do** give every `font-size` a step of the size ramp and every radius a step of the rounded scale; a deliberate one-off keeps a one-line comment saying why.
- **Do** put a game in the instrument frame and a lesson in the lesson template, with the diagram, the current control and the readout on one screen.
- **Do** give every target 44 px on its short side, and draw a small mark small inside it.

### Don't:
- **Don't** add a dark scheme; the system ships light and more-contrast only.
- **Don't** transform text to upper case.
- **Don't** lay a texture, a glint or a gradient sheen on any surface; a gradient draws a graticule or a hatch and nothing else.
- **Don't** colour anything for decoration, or make a selected, current or focused thing amber.
- **Don't** fade text with opacity to show a state; use the quiet text role, which keeps 4.5:1.
- **Don't** use Unicode characters or an icon font as icons; draw them on the 24-unit grid.
- **Don't** put a word or a number a learner reads into a 3D texture, or light a scene with anything but its one key and its hemisphere.
- **Don't** pin or stick anything under 600 px of viewport height.
