---
name: enginespace
description: The Engine Internals course, set on the pass of a line kitchen in the middle of service.
colors:
  surface-0: "#ccd1d4"
  surface-1: "#dde1e4"
  surface-2: "#b2b9be"
  surface-3: "#59616a"
  edge: "#5f666d"
  paper: "#fafaf6"
  paper-ink: "#1d1b22"
  paper-ink-2: "#a30f1a"
  paper-rule: "#bcb9b1"
  lamp: "#ffb547"
  lamp-ring: "#9a3d00"
  tape: "#e6d6ad"
  tape-ink: "#1a1a1c"
  light-fluorescent: "#eef4f8"
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
    fontSize: "clamp(2.75rem, 1.5rem + 5vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.88
    letterSpacing: "0.004em"
  heading:
    fontFamily: "'Big Shoulders Display', sans-serif"
    fontSize: "clamp(1.75rem, 1.35rem + 1.6vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "0.01em"
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
    fontFamily: "'Doto', 'Handjet', monospace"
    fontSize: "1.125rem"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.02em"
    fontFeature: "'tnum'"
  ticket:
    fontFamily: "'Doto', 'Handjet', monospace"
    fontSize: "1.0625rem"
    fontWeight: 900
    lineHeight: 1.45
    letterSpacing: "0.02em"
  label:
    fontFamily: "'Permanent Marker', cursive"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  paper: "0px"
  plate: "3px"
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
  button-plate:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.plate}"
    padding: "0.55rem 1.15rem 0.45rem"
    height: "2.75rem"
  button-plate-active:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
  button-plate-disabled:
    backgroundColor: "{colors.surface-0}"
    textColor: "{colors.text-3}"
  button-ink:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.paper}"
    rounded: "{rounded.plate}"
    padding: "0.55rem 1.15rem 0.45rem"
    height: "2.75rem"
  button-quiet:
    textColor: "{colors.text-1}"
    rounded: "{rounded.plate}"
    padding: "0.55rem 1.15rem 0.45rem"
  button-quiet-active:
    textColor: "{colors.paper-ink-2}"
  stub:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink-2}"
    typography: "{typography.ticket}"
    rounded: "{rounded.paper}"
    padding: "1.15rem 1.5rem 1rem"
    height: "3.5rem"
  stub-disabled:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text-3}"
  ticket:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.paper}"
    padding: "1.5rem 1.5rem 1rem"
    width: "24rem"
  ticket-lamp:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
  tape-label:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.tape-ink}"
    typography: "{typography.label}"
    padding: "0.28em 0.85em 0.2em"
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
  board:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-2}"
    padding: "0.75rem 1rem"
  board-link-current:
    textColor: "{colors.text-1}"
  board-plate:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.plate}"
    padding: "0.3rem 0.95rem 0.2rem"
    height: "2.5rem"
  kickplate:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.paper}"
    padding: "0.75rem 1rem"
  printer-housing:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.paper}"
    padding: "0.75rem 0.75rem 1.35rem"
  pan:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.pan}"
    width: "4.75rem"
    height: "3.4rem"
---

# Design System: enginespace

## Overview

**Creative North Star: "The Pass"**

The site is the expo pass of a line kitchen in the middle of service, lit by fluorescent tubes overhead and heat lamps over the one place the next decision acts on. Every surface is a kitchen object, and each object brings its own material and its own face: the ground and every panel are brushed stainless, the text you read is printed on white bond ticket paper in the ribbon's black and red, labels are marker on torn masking tape, headings are stamped equipment plates, and every number comes out of the impact printer in dots. The learner is the expediter, not a reader: the components are things you pick up, hang, tear and ring.

The system is a bright one. It ships a single light scheme, the line under its tubes, plus a more-contrast variant and a forced-colours mapping; there is no dark scheme. Density is a working kitchen's: objects sit close on the steel and stack on a phone, but every object stays a whole object with its own edge and shadow, and nothing is a neutral template region. Colour is spent sparingly and always as meaning: amber for the active state, the ribbon red for what must not be missed, and the six HACCP cutting-board colours as the only categorical code.

Motion keeps the kitchen's clock. Everything moves on the bell, the step; between bells only the printer feeds, in line steps rather than a glide. Under reduced motion every duration token is 0 and the scene cuts.

**Key Characteristics:**
- Brushed stainless ground with a generated grain texture and a fluorescent sheen, never a flat fill.
- Ticket paper cut square (0px) for everything you read; sheet metal at 3px; hotel pans at 10px.
- Heat-lamp amber appears only where the present is: the active ticket, the current page, the focused control, the lit station.
- One face per kitchen object: Big Shoulders Display, Doto, Permanent Marker, Atkinson Hyperlegible and its Mono, all self-hosted.
- The HACCP board colours are the only categorical code, and every category also carries a drawn shape.
- Motion runs on the bell (240ms) and the printer's stepped feed; nothing drifts between bells.

## Colors

Cool stainless greys under a warm amber pool, with paper white, two ribbon inks, and the six cutting-board colours held in reserve for meaning.

### Primary
- **Heat-Lamp Amber** (lamp): the active state and only that. It pools as an edgeless radial light behind the ticket under the lamp, warms the top of that ticket's paper, glows above a focused control, fills the current page's link on the board, backs text selection, and is the colour of the 3D heat lamps and of a lit station's element on the line.
- **Lamp Filament** (lamp-ring): the hard edge of the active state, at 3:1 on every ground. It is the focus ring (focus refers to it), the bar under the current page, the caret, the bell's sound waves, and the dashed edge round the pass while a ticket is dragged.

### Secondary
- **Ribbon Red** (paper-ink-2): the impact printer's second colour, for what must not be missed: the primary action's stub label, a voided ticket, errors and their marks, the "synthetic" provenance stamp, the line that says a level is over. Status-bad refers to it.

### Tertiary
The HACCP cutting boards, the system's only categorical code. Each slot has a fill, an edge for outlines and text in the code's colour, and an ink that reads on the fill (paper on red, blue, green and brown; paper-ink on yellow and white). Lanes, memory states, probability parts and status all point at these slots; nothing else gets a colour of its own.
- **Board Red** (cat-red, edge cat-red-edge): an evicted pan, the residual well.
- **Board Blue** (cat-blue, edge cat-blue-edge): the CPU's lane, a used pan, the target distribution; its edge is status-info.
- **Board Yellow** (cat-yellow, edge cat-yellow-edge): a sync, a cached pan, the draft; too light to stand alone on steel, so its marks always carry the edge, which is status-warn.
- **Board Green** (cat-green, edge cat-green-edge): the GPU's lane as a category, a shared pan, the overlap; its edge is status-ok.
- **Board White** (cat-white, edge cat-white-edge): idle, a free pan, what was observed, drawn hollow; its marks carry the edge.
- **Board Brown** (cat-brown, edge cat-brown-edge): copies, an adapter's pan.

### Neutral
- **Ground Stainless** (surface-0): the page, the pass, the line, under the brushed texture and the tubes' sheen.
- **Raised Stainless** (surface-1): the board, panels, the top of the pass, a plate button, a pan's rim.
- **Shaded Stainless** (surface-2): the underside of the rail, the name plate, a pressed plate, a pan's empty well.
- **Deep Stainless** (surface-3): the printer's housing, the kick-plate, rail clips, a dark station; paper-white text sits on it.
- **Boundary Grey** (edge): a control's edge on steel or paper, at 3:1.
- **Bond Paper** (paper): tickets, stubs, the printer's tape, field slips.
- **Ribbon Black** (paper-ink): print on a ticket, and text under the lamp.
- **Perforation** (paper-rule): dotted rules, feed marks and the stub's perforation; never the only carrier of anything.
- **Masking Tape** (tape) with **Marker** (tape-ink): labels stuck on pans and objects.
- **Tube White** (light-fluorescent): the 3D scene's ambient sky light; not used in the DOM.
- **Text on Steel** (text-1, text-2, text-3): primary, secondary and quiet text. Quiet text is not used on surface-2.

### Named Rules
**The One Lamp Rule.** Amber marks the present, the place the next decision acts on, and nowhere else. A lit station on the line burns in the lamp's amber, not in a code colour.

**The Only Code Rule.** The six board colours are the only categorical code, every category also carries its drawn glyph (triangle, circle, diamond, square, ring, hexagon), and no element is coloured for decoration.

**The Declared Pair Rule.** A foreground goes on a background only through a pair tokens.ts declares and verify-tokens checks: 4.5:1 for text, 3:1 for marks and edges, in both shipped schemes.

## Typography

**Display Font:** Big Shoulders Display (with sans-serif)
**Body Font:** Atkinson Hyperlegible (with sans-serif)
**Label/Mono Font:** Doto with Handjet for µ and ± (numerals and print), Permanent Marker (tape labels), Atkinson Hyperlegible Mono (code)

**Character:** A heavy condensed grotesk stamped like an equipment plate over a reading face drawn for legibility, with the printer's round dot matrix for every number and line of print and a marker hand for labels. Each face belongs to one kitchen object, so the face tells you what the thing is.

### Hierarchy
- **Display** (800, clamp(2.75rem, 1.5rem + 5vw, 6rem), 0.88, uppercase): the h1, the headline printed on the order ticket (where it sizes to the paper up to 6rem), and the menu's title.
- **Heading** (800, clamp(1.75rem, 1.35rem + 1.6vw, 2.5rem), 0.95, uppercase): h2 and a ticket's title: a section's plate.
- **Title** (Atkinson Hyperlegible 700, 1.25rem, 1.3): h3.
- **Body** (400, 1.0625rem, 1.6): long reading on steel and paper; prose holds a 68ch measure.
- **Numeric** (Doto 900, 1.125rem, 1.2, tabular): every count, tick, timestamp and microsecond in a readout; readouts step to 0.9375rem, 1.5rem and clamp(2rem, 1.4rem + 2.4vw, 3rem).
- **Ticket** (Doto 900, 1.0625rem, 1.45): ticket lines and the printer's tape; head, foot and tape lines print at 0.9375rem, captions at 0.8125rem uppercase with 0.04em tracking.
- **Label** (Permanent Marker 400, 0.9375rem, 1.2): marker on masking tape, and the engine term written beside a kitchen word.
- **Mono** (Atkinson Hyperlegible Mono 400, 0.9375rem, 1.55): code from vLLM and SGLang, and identifiers.
- **Plate lettering** (Big Shoulders Display 800, uppercase, 0.07em to 0.1em tracking): button labels at 0.9375rem, 1.125rem and 1.375rem, board links at 1.125rem, the name plate at 1.3125rem, toggle words at 0.875rem.

### Named Rules
**The One Face Per Object Rule.** A face is chosen by the object that carries it: stamped steel takes Big Shoulders, print takes Doto, tape takes Permanent Marker, reading takes Atkinson. A generic family is never first in a stack, and a single-weight face is declared across the weight range so no bold is faked.

**The Dots For Numbers Rule.** Every number a learner compares prints in the dot matrix with tabular figures, and carries its provenance (synthetic, measured, derived, estimated) beside it.

## Layout

The shell's main column holds an 80rem maximum with a 1rem gutter on a phone and 2rem from 48rem; the board across the top and the kick-plate at the foot run full width. The front page gives up that measure and runs edge to edge with its own gutter (clamp(1rem, 3.2vw, 2.75rem)) and a 66rem measure for the sections below the pass.

The front page has two layouts in one document. Below 80rem it stacks in kitchen order: the order ticket on its rail, then the printer with its tape, its strip of waiting tickets and the bell, then the pass, then the deck, so on a phone the scene, a ticket to hang and the bell share the first screen. From 80rem the pass fills the first viewport and the DOM objects stand in front of the 3D scene, positioned on the scene's own landmarks through container units. Other observed breakpoints are 56rem (an order line gains its side column) and 64rem (the night's table widens). Components switch on container queries where their own width matters: the stub under 17rem, the mirror table under 36rem.

Spacing runs on a 4px step (the spacing scale): 1rem gutters on a phone, 1.5rem inside a ticket and between items of a group, 3rem between groups and section paddings, 4rem above a section heading, 6rem between sections at desktop width.

## Elevation & Depth

Depth is physical: paper lifts off steel, plates are stamped with a lit top edge and a shaded foot, things you press go in. Shadows are offset and softly blurred, cast by the tubes above, and the steel itself carries depth through gradients (a polished rail rod, a domed bezel, a recessed well). Glow belongs only to light sources: the heat lamp's pool, a lit station, the lamp's glow above a focused control.

### Shadow Vocabulary
- **Paper** (`box-shadow: 0 1px 1px rgb(23 25 29 / 0.16), 0 8px 18px -8px rgb(23 25 29 / 0.38)`): paper lifted off the steel: a standalone stub, a field slip, the menu board.
- **Lift** (`box-shadow: 0 2px 3px rgb(23 25 29 / 0.16), 0 16px 28px -12px rgb(23 25 29 / 0.42)`): paper or a plate picked up, and the printer standing in front of the pass.
- **Plate** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.7), inset 0 -1px 0 rgb(23 25 29 / 0.12), 0 1px 2px rgb(23 25 29 / 0.3)`): a stamped steel plate at rest.
- **Press** (`box-shadow: inset 0 2px 4px rgb(23 25 29 / 0.32), inset 0 0 0 1px rgb(23 25 29 / 0.08)`): a plate or stub pressed in.
- **Shelf** (`box-shadow: 0 1px 0 rgb(255 255 255 / 0.55), 0 6px 12px -6px rgb(23 25 29 / 0.35)`): the board's lip over the ground.
- **Ticket sheet** (`filter: drop-shadow(0 1px 1px rgb(23 25 29 / 0.22)) drop-shadow(0 9px 10px rgb(23 25 29 / 0.2))`): a ticket's shadow is a drop-shadow on the sheet, so its punched hole and torn edges cast too.

### Named Rules
**The Paper Lifts Rule.** Under the hand, paper rises (translateY(-3px), a slight turn, a deeper drop-shadow) and plates brighten; on press, both go down 1-2px into the press shadow.

**The Edgeless Pool Rule.** The lamp's light is a radial gradient that fades out inside its own box, so it reads as light falling on steel and never as a coloured panel.

## Shapes

Shapes follow the material. Paper is cut square (0px): tickets, stubs, the tape, field slips. Sheet metal takes a 3px edge: buttons, the name plate, toggles, the rail rod, the menu board. Hotel pans have drawn 10px corners with a well 4px tighter inside. Lights, bells, rivets and printing dots are round (999px). Paper edges are drawn as the paper is: a punched hole at a ticket's top (a radial mask), a perforated stub (a dotted repeat in paper-rule), a torn foot of teeth on the printer's tape, dotted 2px rules between a ticket's head, body and foot, and jagged torn ends masked onto masking tape, which sits tilted (-1.2deg by default, 0.9deg or 0 as variants). Small icons and category glyphs are drawn SVG on one 24-unit grid with one stroke weight, inheriting currentColor; Unicode stand-ins are not used.

## Components

### Buttons
A stamped steel plate you press.
- **Shape:** sheet-metal edge (3px), a 1px edge-coloured border, minimum height 2.75rem (2rem small, 3.25rem large).
- **Plate:** raised stainless under its brushed grain and a top-light gradient, plate shadow, text-1 lettering in Big Shoulders 800 uppercase at 0.07em.
- **Hover / Focus:** hover brightens the plate toward paper and adds a soft drop; focus draws the 2px filament ring at 2px offset with the lamp's glow above it; active drops 1px into the press shadow on shaded stainless.
- **Ink:** deep stainless with paper-white lettering and a paper-ink border.
- **Quiet:** the lettering without its plate; hover underlines at 2px, active prints in ribbon red.
- **Disabled / Error:** disabled is ground stainless with a dashed border, no grain and quiet text; error takes a ribbon-red border and inner line, with the message and its drawn mark printed beside it in ribbon red.

### The Stub
The primary action, printed on a ticket's tear-off stub.
- **Style:** bond paper with a perforated top edge, label in Doto 900 uppercase at 1.375rem and 0.04em in ribbon red, a drawn arrow at the end, minimum height 3.5rem.
- **States:** hover starts to tear (the perforation darkens to edge, the stub turns -0.8deg and the arrow moves 3px); active presses in; focus draws the filament ring inset 5px and warms the paper with 32% lamp; disabled prints in quiet text with a faint perforation and no arrow.

### Cards / Containers
Containers are kitchen objects, never generic cards.
- **Ticket:** bond paper cut square, up to 24rem wide (36rem wide, or full), 1.5rem padding, ribbon-black print; a Doto head line over a dotted rule, a heading-face title, an Atkinson body, a Doto foot line. Under the lamp it gains the edgeless amber pool behind it and warmed paper at its top. Loading prints faint in quiet text; voided prints a ribbon-red line under a red dotted rule.
- **Board (top) and kick-plate (foot):** the board is raised brushed stainless with an edge line and the shelf shadow; the kick-plate is deep brushed stainless with paper-white text.
- **Menu board:** a flat sheet of raised brushed stainless with a 3px edge and the paper shadow.
- **Printer:** a deep-stainless housing with rounded upper corners (8px 8px 3px 3px), the menu link printed on its face in paper white, a dark mouth, and the tape feeding from it in steps.

### Inputs / Fields
- **Style:** masking tape over a paper slip: the label is a tape label overlapping the slip's top-left, the slip is bond paper with the paper shadow and a 2px edge-coloured foot line; the input is Atkinson at 1.0625rem (Doto 900 for numeric fields), placeholder in quiet text.
- **Focus:** the foot line turns filament, the slip takes the 2px filament ring and the lamp's glow.
- **Error / Disabled:** error turns the foot line ribbon red with the message below; disabled dashes the foot line on raised stainless with no shadow.

### Toggle
An equipment switch: a recessed brushed-steel well (5.25rem by 2.5rem, 3px edge), a polished lever that throws side to side on the quick duration, and the word in force (ON or OFF) stamped in the open half in Big Shoulders 800 at 0.1em.

### Navigation
- **Board links:** Big Shoulders 800 uppercase at 1.125rem and 0.08em in text-2, at least 2.75rem tall; hover darkens to text-1 and underlines at 2px; the current page sits under the heat lamp, with an amber pool above it and a 3px filament bar below.
- **Name plate:** the house's name stamped into a flat shaded-steel plate at 1.3125rem and 0.1em.
- **Text link:** underlined at 0.08em with a 0.24em offset, thickening under the hand; active prints in ribbon red; external links carry a drawn mark.

### Rail
A polished stainless rod lit from the tubes, with deep-steel spring clips that grip each ticket through its punched hole. An empty clip shows a 2px dashed edge box with Doto print. The rail can sit under the lamp.

### Printer Tape
The live readout: bond paper fed from the printer's mouth, Doto 900 lines of term and value, uppercase terms, a torn foot. It feeds on the feed duration with the stepped easing. The provenance stamp ("synthetic ticks") is a small bordered stamp in Atkinson 700 uppercase in ribbon red.

### Readout
Doto with tabular figures, four sizes, an optional unit at 0.8em, and a provenance tag: a 1px-bordered Atkinson 700 uppercase stamp at 0.75rem (synthetic in ribbon red, measured in status-ok; derived and estimated print without the border).

### Hotel Pan
A KV block: a raised-steel rim with 10px drawn corners around a recessed well. The well is empty steel when free, filled with the memory role's board colour when used, cached, shared or the adapter's, hatched or dotted as a second carrier, and a dashed red outline when evicted, with the category's glyph at its centre and a tape label below. Pans never move: hover and press change only the rim's line, and the lamp falls on the active pan as a filament ring and an amber glow from above.

### Bell
The step clock: a drawn chrome bell on deep steel. A strike drops the plunger and rings the dome on the bell duration with the strike easing (no overshoot), and filament sound waves expand on 2.5 times that.

### Tape Label
Masking tape torn off the roll: tape fill with faint crepe ridges and a top light, Permanent Marker in tape-ink, jagged masked ends, tilted -1.2deg by default.

## Do's and Don'ts

### Do:
- **Do** take every colour, face, shadow, radius and duration from a token role in src/design/tokens.ts; tokens.css is generated from it and verify-tokens fails when they disagree.
- **Do** keep amber for the present alone: the ticket under the lamp, the current page, the focused control, a lit station on the line.
- **Do** print every number in Doto with tabular figures and its provenance tag; the front page's readouts are synthetic ticks.
- **Do** give every category its board colour and its drawn glyph, and carry yellow and white marks on their edge colour.
- **Do** put the brushed grain (texture-brushed) on the ground and on stainless panels, plates and housings, sized to the full width so no tile edge shows.
- **Do** move on the bell: the quick duration (120ms) for the hand, the bell (240ms) for a step, the feed (420ms, steps(6, end)) for the printer, the settle (640ms) for a course coming to rest, all 0 under reduced motion.
- **Do** draw focus as the 2px filament ring at 2px offset with the lamp's glow above it.

### Don't:
- **Don't** add a dark scheme; the line is lit by its tubes, and the system ships light and more-contrast only.
- **Don't** colour anything for decoration, or give a lane, a state or a status a colour outside the six boards and the ribbon red.
- **Don't** move a hotel pan; a moving pan would misteach copying.
- **Don't** round paper, or set a ticket's body in the dot matrix; Doto is for print lines and numbers, Atkinson for reading.
- **Don't** fade text with opacity to show a state; use the quiet text role, which keeps 4.5:1.
- **Don't** use Unicode characters or an icon font as icons; draw them on the 24-unit grid.
- **Don't** print a small label above a headline to introduce a section; a tape label names an object, not a section.
