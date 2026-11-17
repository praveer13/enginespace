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
---

# Design System: enginespace

## Overview

**Creative North Star: "Data Book"**

The engine's own data book, printed on flat paper, with one amber mark. The site draws the engine as engineers already draw it: timing diagrams, page maps, distribution bars and latency plots, on paper over a flat ground. The look names nothing on screen: every object carries the engine's own name, and the picture is the engine's own diagram (REDESIGN 2.8).

The system is a bright one. It ships a single light scheme, paper under daylight, plus a more-contrast variant and a forced-colours mapping; there is no dark scheme. Density is a reference book's: a calm reading column, diagrams with a faint graticule, tables in tabular figures. Colour is spent as meaning only: amber for now, the second ink for what must not be missed, and six fills, each with its glyph, as the one colour code.

Motion keeps to the action. Things move when the learner acts and are still between actions, and every duration is 0 under reduced motion, with the state drawn at its end.

This body describes the values R-T16 built. It is rewritten in full from the built world at the wave's finish (R-T50); until the owner's look gate (R-T20), the kitchen scene and its files stay in the tree, and the roles it reads (tape, tape ink, glint, the fluorescent light) stay in tokens.ts for it alone.

**Key Characteristics:**
- A flat ground with no texture, and paper cut square with one soft sheet shadow.
- Amber means now: it has three carriers, always with its dark edge, a shape and a word.
- Focus is ink: 3 px of text-1 at a 2 px offset, with a paper halo.
- Three faces: Big Shoulders Display for titles, Atkinson Hyperlegible for reading and labels, Atkinson Hyperlegible Mono for code and every number.
- Sentence case everywhere: nothing is transformed to upper case, so vLLM, SGLang and v0.33.0 keep their casing.
- Six fills with their glyphs are the one colour code, and appear only where the model's state is drawn.

## Colors

Pale paper greys, paper white, two inks, one amber mark, and six fills held in reserve for the model's state.

### Primary
- **The Marker** (lamp): now, and only now. It has three carriers: the control to act on now (one amber-filled button per viewport, or one amber ring on the control an intro points at), the "now" cursor on a diagram (a 2 px line with the word "now", and the mark on the object the next move acts on), and the current-position mark in the rail and on the course track. On paper it is 1.68:1 [derived], so it never carries anything alone.
- **The Marker's Edge** (lamp-ring): amber's dark edge, 6.60:1 on paper and 3.93:1 on the marker [derived]. Every amber fill draws it.

### Secondary
- **The Second Ink** (paper-ink-2): errors, "Not yet", "unverified". It is never the colour of an action.

### Tertiary
The one colour code, shown in every diagram's legend. Each slot has a fill, an edge for outlines and text in the code's colour, and an ink that reads on the fill.
- **Blue, circle** (cat-blue, edge cat-blue-edge): CPU work; a page in use; the target p.
- **Green, hexagon** (cat-green, edge cat-green-edge): GPU work; a page shared by a prefix hit; the accepted overlap min(p, q).
- **Yellow, diamond** (cat-yellow, edge cat-yellow-edge): a sync; a cached page; the draft q. Its marks carry the edge.
- **Red, triangle** (cat-red, edge cat-red-edge): evicted; the residual (p - q)+; a violation.
- **White, hollow ring** (cat-white, edge cat-white-edge): idle; free; observed. Its marks carry the edge.
- **Brown, square** (cat-brown, edge cat-brown-edge): a copy between host and GPU; an adapter's page.

### Neutral
- **Ground** (surface-0): the page, flat.
- **Raised** (surface-1): the header, the frame round an instrument.
- **Well** (surface-2): an empty slot, a pressed control, a selected row, the 3D base plate.
- **Dark** (surface-3): the footer and a selected tab, with paper-white text on it.
- **Paper** (paper): everything read, and every diagram.
- **Ink** (paper-ink): text on paper.
- **Graticule** (paper-rule): faint lines inside diagrams and figures, and a sheet's rules; never the only carrier of anything.
- **Edge** (edge): hairlines, control borders, dimension lines, at 3:1.
- **Text** (text-1, text-2, text-3): primary, secondary and quiet text. text-1 is also the focus ring.
- **Retired** (tape, tape-ink, glint, light-fluorescent): no stylesheet draws with them; the kitchen scene reads them until stage 4.

### Named Rules
**The One Marker Rule.** Amber means now. It has three carriers and no others: the control to act on now, the "now" cursor on a diagram, and the current-position mark in the rail and on the course track. The header's Continue is an outline, and an intro's callouts are ink discs.

**The Ink Focus Rule.** The focus ring is 3 px of text-1 at a 2 px offset, with a paper halo. It is never amber, so focus is not mistaken for now, and it reads against the amber button's own edge.

**The Colour Is State Rule.** A code colour appears only where the model's state is drawn, and always with its glyph or hatch.

**The Declared Pair Rule.** A foreground goes on a background only through a pair tokens.ts declares and verify-tokens checks: 4.5:1 for text, 3:1 for marks and edges, in both shipped schemes.

## Typography

**Display Font:** Big Shoulders Display (with sans-serif)
**Body Font:** Atkinson Hyperlegible (with sans-serif)
**Label/Mono Font:** Atkinson Hyperlegible Mono (code, identifiers and every number), Atkinson Hyperlegible 700 (labels)

**Character:** A condensed grotesk for titles in sentence case, over a reading face drawn for legibility, with its mono for every number the learner compares. Three faces, all self-hosted.

### Hierarchy
- **Display** (Big Shoulders Display 800, clamp(2rem, 1.2rem + 3.4vw, 3.5rem), 1.0): page, lesson and game titles only.
- **Heading** (Big Shoulders Display 800, clamp(1.625rem, 1.3rem + 1.4vw, 2.25rem), 1.05): a title one step under a page's.
- **Section heads** (Atkinson Hyperlegible 700, 1.5rem and 1.25rem): h2 and h3, and a sheet's title.
- **Body** (Atkinson Hyperlegible 400, 1.0625rem, 1.6): reading, at a 66ch measure.
- **Label** (Atkinson Hyperlegible 700, 0.875rem, 1.25): buttons, labels, lane and axis names, from 0.8125rem to 1rem. A button says what it does: "Step", "Check answer", "Start: TR1 lesson 1".
- **Numeric** (Atkinson Hyperlegible Mono 500, 1.125rem, tabular): every number the learner compares, falling back to Atkinson Hyperlegible for µ and ±.
- **Ticket** (Atkinson Hyperlegible Mono 400, 0.9375rem, 1.45): a readout strip's values, a sheet's numbered lines.
- **Mono** (Atkinson Hyperlegible Mono 400, 0.9375rem, 1.55): code from vLLM and SGLang, and identifiers.
- **Size ramp** (`--es-size-*`): the sizes that a component's own lines take, and the only ones. Small: micro (0.6875rem), stamp (0.75rem), caption (0.8125rem), note (0.875rem), print (0.9375rem, the mono size) and base (1rem). Reading and controls: body (1.0625rem, the body size), plate (1.125rem, the numeric size), title (1.25rem), action (1.375rem) and large (1.5rem). Fluid: count (clamp(2rem, 1.4rem + 2.4vw, 3rem), the biggest readout), page (clamp(2rem, 1.2rem + 3.4vw, 3.5rem), a page's title) and course (clamp(2.5rem, 1.8rem + 3vw, 4.5rem), the front page's section titles).

### Named Rules
**The Sentence Case Rule.** No text is transformed to upper case, anywhere. Engine names keep their own casing.

**The Ramp Rule.** A size is a step of the ramp: `font-size` takes a `--es-size-*` token or a type role's own size, and a size outside the ramp is a one-off that keeps a one-line comment saying why.

## Layout

The shell's main column holds an 80rem maximum with a 1rem gutter on a phone and 2rem from 48rem; the header across the top and the footer at the foot run full width. Reading holds a 66ch measure. Spacing runs on a 4px step: 1rem gutters on a phone, 1.5rem inside a sheet and between items of a group, 3rem between groups, 4rem above a section head, 6rem between sections at desktop width. Under 600 px of viewport height nothing is sticky or pinned.

## Elevation & Depth

Depth is paper on a flat ground. There are two shadows and no more, each with an offset and a soft blur, never a zero-offset halo.

### Shadow Vocabulary
- **Paper** (`box-shadow: 0 1px 2px rgb(23 25 29 / 0.12), 0 6px 14px -8px rgb(23 25 29 / 0.28)`): a sheet on the ground.
- **Lift** (`box-shadow: 0 2px 4px rgb(23 25 29 / 0.14), 0 16px 32px -12px rgb(23 25 29 / 0.36)`): a popover over the page, and a sheet under the hand.

### Named Rules
**The Flat Paper Rule.** No texture anywhere. One shadow for a sheet and one for a popover. Paper is cut square.

**The Moves On Step Rule.** Things move on an action and are still between actions: 120 ms for the hand, 240 ms for a step, 640 ms for the one authored moment of an instrument. A readout changes at once. Every duration is 0 under reduced motion, and the state is drawn at its end.

**The Words Are DOM Rule.** Every word or number a learner reads in a 3D scene is DOM over the canvas; a texture carries only marks nobody needs to read.

## Shapes

Paper is cut square (0px): sheets, diagrams, fields, the readout strip. Small parts take 2px: a stamp, a chip, a page cell. Controls take 3px: buttons, switches, menus. Dots, discs and pills are round. The shoulder (8px) and pan (10px) radii are retired with the components that used them. Inside diagrams and figures the graticule runs in paper-rule, 8 px minor and 40 px major; an interval is marked as an engineering drawing marks it, with end ticks and its value; an idle stretch is a dashed hollow box. Icons and category glyphs are drawn SVG on one 24-unit grid with one stroke weight, inheriting currentColor.

## Components

Each component is drawn as its Data Book part, under the name it has in src/design/components.

### Buttons
- **Primary** (PrimaryButton): amber fill, a 2 px marker edge, a text-1 label in Atkinson Hyperlegible 700, 44 px or taller, and an arrow. Hover deepens the amber; held down it is a well with a dashed edge and no amber.
- **Outline** (Button, the default): flat, a 1 px edge, a 3 px radius, a text-1 label. Hover lays a faint well; pressed is the well.
- **Ink**: the dark surface with a paper-white label, for the control an instrument leans on.
- **Quiet**: the label alone, underlined under the hand.

### Sheet
Sheet is the sheet: a plain paper panel with a title in Atkinson Hyperlegible 700, no hole and no torn edge, a quiet head line and foot line over hairline rules. The sheet the next decision acts on takes an ink rule across its top.

### Readout and readout strip
A readout sets its number in the mono face with tabular figures, its unit at 0.8em and its tag as a quiet word under a dotted line; only "unverified" takes the second ink. A change's delta is DeltaChip, beside it. ReadoutStrip is the readout strip: terms and values on one paper strip, a hairline between rows, with one provenance stamp at its head.

### Label and stamp
Label is the plain label: Atkinson Hyperlegible 700 in sentence case, still and unlit, with a slot's glyph when it names a category. On a drawing it sits on a slip of paper so the lines never cross its words. Provenance is the Stamp: a small bordered word, one per instrument, table or figure, which opens the tag legend.

### Inputs
- **Field**: a plain label over a paper slip with a 2 px foot line at 3:1; a number field types in the mono face and is never spun.
- **Switch** (Toggle): a flat track with a square thumb, and the state as a word, Off or On, in the open half. On, the track is dark. No light.

### Header and footer
Header is the header: the raised surface over a hairline, the site's name in the display face, the places in Atkinson Hyperlegible 700, the page you are on in ink with an ink bar under it, and Continue at the right as an outline. The kick-plate is the footer: the dark surface with paper-white links.

### The parts of a lesson and an instrument
Marker, Callout, PartsList, Legend, Note, Popover, Stamp, TitleBlock, SectionRail, LevelMenu, GoalLine, DeltaChip, NumberLine and NextStep (stage 1, src/design/parts.css) draw in the same roles. Callouts are ink discs with a numeral; the marker and the rail's current section are the only amber among them.

### Retired with the kitchen
Rail and Pan have left the tree. StationLight, Bell and PrintingDots still draw the live controls and the loading dots: a solid ink disc for busy and an open ring for idle, a flat step control, and still dots beside a line of text that says what is loading.

## Do's and Don'ts

### Do:
- **Do** take every colour, face, shadow, radius and duration from a token role in src/design/tokens.ts; tokens.css is generated from it and verify-tokens fails when they disagree.
- **Do** keep amber for now alone, on its three carriers, always with its dark edge, a shape and a word.
- **Do** draw focus as 3 px of text-1 at a 2 px offset, with a paper halo.
- **Do** set every number the learner compares in the mono face with tabular figures, with its tag.
- **Do** give every category its fill and its glyph, and carry yellow and white marks on their edge colour.
- **Do** give every `font-size` a step of the size ramp and every radius a step of the rounded scale; a deliberate one-off keeps a one-line comment saying why.

### Don't:
- **Don't** add a dark scheme; the system ships light and more-contrast only.
- **Don't** transform text to upper case, or track a label out as if it were.
- **Don't** lay a texture, a glint or a gradient sheen on any surface.
- **Don't** colour anything for decoration, or make a selected, current or focused thing amber.
- **Don't** fade text with opacity to show a state; use the quiet text role, which keeps 4.5:1.
- **Don't** use Unicode characters or an icon font as icons; draw them on the 24-unit grid.
