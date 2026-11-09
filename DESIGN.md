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
- Heat-lamp amber appears only where the present is: the active ticket, the current page, the focused control, the lit station and the switch that is on.
- One face per kitchen object: Big Shoulders Display, Doto, Permanent Marker, Atkinson Hyperlegible and its Mono, all self-hosted.
- The HACCP board colours are the only categorical code, and every category also carries a drawn shape.
- Motion runs on the bell (240ms) and the printer's stepped feed; nothing drifts between bells.

## Colors

Cool stainless greys under a warm amber pool, with paper white, two ribbon inks, and the six cutting-board colours held in reserve for meaning.

### Primary
- **Heat-Lamp Amber** (lamp): the active state and only that. It pools as an edgeless radial light behind the ticket under the lamp, warms the top of that ticket's paper, glows above a focused control, fills the current page's link on the board, backs text selection, and is the colour of the 3D heat lamps, of a lit station's element on the line and of the pilot light of a switch that is on.
- **Lamp Filament** (lamp-ring): the hard edge of the active state, at 3:1 on every ground. It is the focus ring (focus refers to it), the bar under the current page, the caret, the bell's sound waves, the rim of a lit lens, and the dashed edge round the pass while a ticket is dragged.

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
- **Tube Glint** (glint): the white of the tubes' reflection on steel, laid on only at part strength: the lit top edge of a plate, the sheen along the board, the crepe ridges of masking tape. Never a surface and never a mark; a gradient or a shadow takes it through `color-mix`.
- **Text on Steel** (text-1, text-2, text-3): primary, secondary and quiet text. Quiet text is not used on surface-2.

### Named Rules
**The One Lamp Rule.** Amber marks the present, the place the next decision acts on, and nowhere else. A lit station on the line and a switch that is on burn in the lamp's amber, not in a code colour. A lane's colour may say which lane a light belongs to, as a category mark beside it, and never whether it is on.

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
- **Size ramp** (`--es-size-*`): the sizes that a component's own lines take, and the only ones. Print and below: micro (0.6875rem), stamp (0.75rem), caption (0.8125rem), note (0.875rem), print (0.9375rem, the mono and label size) and base (1rem). Reading and plates: body (1.0625rem, the body and ticket size), plate (1.125rem, the numeric size), title (1.25rem), action (1.375rem) and large (1.5rem). Fluid, for display lettering: count (clamp(2rem, 1.4rem + 2.4vw, 3rem), the biggest readout), page (clamp(2rem, 1.2rem + 3.4vw, 3.75rem), a page's title) and course (clamp(2.5rem, 1.8rem + 3vw, 4.5rem), the front page's section titles).

### Named Rules
**The One Face Per Object Rule.** A face is chosen by the object that carries it: stamped steel takes Big Shoulders, print takes Doto, tape takes Permanent Marker, reading takes Atkinson. A generic family is never first in a stack, and a single-weight face is declared across the weight range so no bold is faked.

**The Dots For Numbers Rule.** Every number a learner compares prints in the dot matrix with tabular figures, and carries its provenance (synthetic, measured, derived, estimated) beside it.

**The Ramp Rule.** A size is a step of the ramp: `font-size` takes a `--es-size-*` token or a type role's own size, and a size outside the ramp is a one-off that keeps a one-line comment saying why.

## Layout

The shell's main column holds an 80rem maximum with a 1rem gutter on a phone and 2rem from 48rem; the board across the top and the kick-plate at the foot run full width. The front page gives up that measure and runs edge to edge with its own gutter (clamp(1rem, 3.2vw, 2.75rem)) and a 66rem measure for the sections below the pass.

The front page has two layouts in one document. Below 80rem it stacks in kitchen order: the order ticket on its rail, then the printer with its tape, its strip of waiting tickets and the bell, then the pass, then the deck, so on a phone the scene, a ticket to hang and the bell share the first screen. From 80rem the pass fills the first viewport and the DOM objects stand in front of the 3D scene, positioned on the scene's own landmarks through container units. Other observed breakpoints are 56rem (an order line gains its side column) and 64rem (the night's table widens). Components switch on container queries where their own width matters: the stub under 17rem, the mirror table under 36rem.

Spacing runs on a 4px step (the spacing scale): 1rem gutters on a phone, 1.5rem inside a ticket and between items of a group, 3rem between groups and section paddings, 4rem above a section heading, 6rem between sections at desktop width.

## Elevation & Depth

Depth is physical: paper lifts off steel, plates are stamped with a lit top edge and a shaded foot, things you press go in. Shadows are offset and softly blurred, cast by the tubes above, and the steel itself carries depth through gradients (a polished rail rod, a domed bezel, a recessed well). Glow belongs only to light sources: the heat lamp's pool, a lit station, the lamp's glow above a focused control.

### Shadow Vocabulary
- **Paper** (`box-shadow: 0 1px 1px rgb(23 25 29 / 0.16), 0 8px 18px -8px rgb(23 25 29 / 0.38)`): paper lifted off the steel: a standalone stub, a field slip, the menu board.
- **Lift** (`box-shadow: 0 2px 3px rgb(23 25 29 / 0.16), 0 16px 28px -12px rgb(23 25 29 / 0.42)`): paper or a plate picked up, and the printer standing in front of the pass.
- **Plate** (`box-shadow: inset 0 1px 0 color-mix(in srgb, var(--es-glint) 70%, transparent), inset 0 -1px 0 rgb(23 25 29 / 0.12), 0 1px 2px rgb(23 25 29 / 0.3)`): a stamped steel plate at rest.
- **Press** (`box-shadow: inset 0 2px 4px rgb(23 25 29 / 0.32), inset 0 0 0 1px rgb(23 25 29 / 0.08)`): a plate or stub pressed in.
- **Shelf** (`box-shadow: 0 1px 0 color-mix(in srgb, var(--es-glint) 55%, transparent), 0 6px 12px -6px rgb(23 25 29 / 0.35)`): the board's lip over the ground.
- **Ticket sheet** (`filter: drop-shadow(0 1px 1px rgb(23 25 29 / 0.22)) drop-shadow(0 9px 10px rgb(23 25 29 / 0.2))`): a ticket's shadow is a drop-shadow on the sheet, so its punched hole and torn edges cast too.

### The Kitchen in 3D
Scene kit v1 gives every 3D game the same line kitchen, built in code with no image or model asset, and every value in it traces to a role.
- **Materials:** each part takes a tone of a kitchen material, coloured from a colour role and only ever darkened from it: brushed steel in the three stainless tones (surface-1, surface-2, surface-3), spun aluminium, chrome, cast iron and the seasoned griddle (deep steel darkened), bakelite knobs and oil, glazed ceramic and subway tile (paper, with paper-rule grout), the sealed floor (deep steel), ticket paper, ribbon ink and masking tape. A metal differs from brushed stainless only by its finish, a factor on roughness, grain and metalness: chrome carries no grain, cast iron almost none.
- **Light:** the fluorescent tubes' hemisphere light and a procedural reflected room (tubes overhead, steel-grey walls, and the lamps' glow in front where a scene keeps it) give the steel something to mirror; a scene whose amber belongs to its lamps alone reflects the tubes only, so its steel warms under a lit lamp and nowhere else. A heat lamp's light is no spot light: under each lit lamp hangs a cone of warm haze from inside its shade's lip down to the surface, and where it lands an edgeless pool, a counter's depth across and longer along the grain, lit in its middle and gone at its rim. The pool brightens the steel and its grain under it and lays no colour of its own; it lies under paper, so a ticket in it stays white bond. The light is drawn at every tier, three times over from T2, where it goes through the tone curve with the frame, and at a little over half its strength at T1. A scene's lamps burn only while the present lies under them. The kitchen specimen on /design keeps scene kit v1's spot lamps, whose soft shadow maps start at T2 (three lights at T2, four at T3, none at T1).
- **Glow:** only the heat lamp's amber glows: a lit station's element, a lamp's bulb, the heat strip over the pass. Each glowing part sits on a channel and a scene lights channels by a mask, so a station fires without new geometry. The hood's tubes glow in tube white below bloom's threshold: light, but not the present. Bloom (T2 and up, at half resolution) catches only what glows, holds a constant strength, and is off under more contrast and forced colours.
- **Atmosphere:** the room's light is baked into its tile and floor, full behind the line's worktops and falling away to the sides, up the tile to the hood and behind into a veil of deep steel, so the wall over the line and the far corners recede rather than only darkening. Fog begins past the camera's focus, so the far end of the line and the floor beyond the subject soften from every shot: the games haze into deep steel (surface-3), the /design kitchen into the ground (surface-0). Steam is a few soft puffs of pale steel off a lit station when a fire lands, at T2 only and never under reduced motion.
- **Contact:** every prop, static or moving, stands on a soft rounded contact shadow in the shadows' own ink over its baked ambient occlusion, at every 3D tier. T1 keeps the props, their occlusion, their contact shadows and the lamps' light, and gives up shadow maps, bloom and steam.
- **Print:** every word and number a learner reads in a scene is DOM over the canvas: marker on strips of masking tape and Doto on paper tags, sized from the scene's box (a size container) and never below the ramp's smallest step. A prop's ticket carries only a texture of generic order lines in dots that nobody needs to read, on bond paper with its tooth (a soft mottle of fibres, and a normal that catches a raking light), a shade darker toward its cut edges, a millimetre thick at a scene's scale [estimated] so its edge reads, curled at its foot and cupped across as paper off a roll is.

### Named Rules
**The Paper Lifts Rule.** Under the hand, paper rises (translateY(-3px), a slight turn, a deeper drop-shadow) and plates brighten; on press, both go down 1-2px into the press shadow.

**The Edgeless Pool Rule.** The lamp's light is a radial gradient that fades out inside its own box, so it reads as light falling on steel and never as a coloured panel.

**The Nothing Floats Rule.** Every prop in a scene stands on its contact shadow and its baked occlusion at every 3D tier; shadow maps, bloom and steam are what a lower tier gives up, never the contact.

**The Still Kitchen Rule.** A prop moves only on a duration token, starting on the bell or the printer's feed, and holds the frame loop only while it moves: between bells the kitchen draws nothing, and under reduced motion a move is never started and the change is drawn at its end.

**The Words Are DOM Rule.** Every word or number a learner reads in a 3D scene is DOM over the canvas; a texture carries only print nobody needs to read.

## Shapes

Shapes follow the material. Paper is cut square (0px): tickets, stubs, the tape, field slips. Sheet metal takes a 3px edge: buttons, the name plate, toggles, the rail rod, the menu board. Small parts, a lever, a stamp, a bar, a slot, take a 2px trim edge, and the shoulders of large sheet-metal parts, the printer's housing and a clip's heel, take 8px. Hotel pans have drawn 10px corners with a well 4px tighter inside. Lights, bells, rivets and printing dots are round (999px). Paper edges are drawn as the paper is: a punched hole at a ticket's top (a radial mask), a perforated stub (a dotted repeat in paper-rule), a torn foot of teeth on the printer's tape, dotted 2px rules between a ticket's head, body and foot, and jagged torn ends masked onto masking tape, which sits tilted (-1.2deg by default, 0.9deg or 0 as variants). Small icons and category glyphs are drawn SVG on one 24-unit grid with one stroke weight, inheriting currentColor; Unicode stand-ins are not used.

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
- **Numeric:** a number is typed on the slip in Doto and never spun: the browser's spinner is removed.

### Toggle
An equipment switch: a recessed brushed-steel well (5.25rem by 2.5rem, 3px edge), a polished lever that throws side to side on the quick duration, the word in force (ON or OFF) stamped in the open half in Big Shoulders 800 at 0.1em, and a pilot light at the well's end: a hollow ring of deep steel when off, burning the heat lamp's amber with the filament's edge when on.

### Station Light
A pilot light in a stainless bezel, with the station's name and the word for its state beside it (busy, dark or fault).
- **Lit / dark:** lit, the lens burns the heat lamp's amber with a solid core and the filament's edge; dark, it is a hollow ring of deep steel. A fault prints in ribbon red with its drawn mark. The state is the shape and the word as well as the colour.
- **Lane:** the lane a station belongs to rides beside its name as a category mark, the lane's board colour and its glyph, the same lit or dark. The name says the lane in words and the mark is a second carrier. It is never the lens's colour.
- **Under the lamp:** the station the next decision acts on takes the filament ring and the amber glow round its bezel.

### Navigation
- **Board links:** Big Shoulders 800 uppercase at 1.125rem and 0.08em in text-2, at least 2.75rem tall; hover darkens to text-1 and underlines at 2px; the current page sits under the heat lamp, with an amber pool above it and a 3px filament bar below.
- **Name plate:** the house's name stamped into a flat shaded-steel plate at 1.3125rem and 0.1em.
- **Text link:** underlined at 0.08em with a 0.24em offset, thickening under the hand; active prints in ribbon red; external links carry a drawn mark, and a link to a file of the site itself (a document that is not a page) opens in the same tab and carries none.

### Rail
A polished stainless rod lit from the tubes, with deep-steel spring clips that grip each ticket through its punched hole. An empty clip shows a 2px dashed edge box with Doto print. The rail can sit under the lamp.

### Printer Tape
The live readout: bond paper fed from the printer's mouth, Doto 900 lines of term and value, uppercase terms, a torn foot. It feeds on the feed duration with the stepped easing. The provenance stamp ("synthetic ticks") is a small bordered stamp in Atkinson 700 uppercase in ribbon red. With a stamp, it prints once at the tape's head and each line's own tag is kept for a screen reader and left off the paper.

### Readout
Doto with tabular figures, four sizes, an optional unit at 0.8em, and a provenance tag: a 1px-bordered Atkinson 700 uppercase stamp at 0.75rem (synthetic in ribbon red, measured in status-ok; derived and estimated print without the border).

### Hotel Pan
A KV block: a raised-steel rim with 10px drawn corners around a recessed well. The well is empty steel when free, filled with the memory role's board colour when used, cached, shared or the adapter's, hatched or dotted as a second carrier, and a dashed red outline when evicted, with the category's glyph at its centre and a tape label below. Pans never move: hover and press change only the rim's line, and the lamp falls on the active pan as a filament ring and an amber glow from above.

### Bell
The step clock: a drawn chrome bell on deep steel. A strike drops the plunger and rings the dome on the bell duration with the strike easing (no overshoot), and filament sound waves expand on 2.5 times that.

### Tape Label
Masking tape torn off the roll: tape fill with faint crepe ridges and a top light, Permanent Marker in tape-ink, jagged masked ends, tilted -1.2deg by default.

### Scene Kit Props
The line's equipment, built from the kit's shape helpers (rounded boxes, lathes, sweeps round a rounded rectangle, bent tubes) and listed as data for one static set: the pass with its heat strip, heat lamps, the ticket rail and its spring clips, the impact printer, the bell's base, a ticket spike, hotel pans (full, half and third) with tape slots, plate stacks, the griddle, burner and fryer stations, the hood with its tube lights, the subway-tile wall, the sealed floor, a speed rack and worktops. A later game's prop joins as a custom piece of the same set: coloured through the palette's tones, its glowing parts on a channel, a footprint for its contact shadow, and its label on tape in a slot, in DOM.
- **Moving props:** tickets that print, tear and hang on the rail's clips; the printer's feed, in six line steps; lathe-turned plates that slide down the pass and come to rest on the settle curve, their contact shadows sliding with them; the service bell, whose strike drops the plunger and rings the chrome dome on the bell duration and the strike curve.
- **Specimen:** /design shows each piece alone and the whole pass assembled, at T1 and T2, each beside its 2D note; a rail of equipment tickets (bond paper cut square, a number in dots over a name) picks the piece, the one in view under the lamp, and the bell runs one fire.

### Game Shell
The frame round every game's views: its display name stamped over its engine concept, its mode or its own docket, the 2D and 3D switch (two plates in a labelled group, the current one pressed, and a disabled 3D plate that says why in words beside it), and the Keys button, which opens the key list on a ticket. Levels are a row of plates that wraps, and the way into a graded run is a line of words and one button.
- **Mirror table:** the whole state as a DOM table on a ticket, its name on the printed foot line, engine terms for column heads and every figure a readout with its tag. On narrow paper each row prints as a block of its own; selectable rows form one roving tab stop.
- **Debrief:** where the next level's title outruns the stub's line at 320px, the stub's label wraps beside its arrow.

### Specials Board
The Play index: the page's name stamped on a plate with the kitchen's word for it on tape beside it, and a sheet of steel holding each game's line, its poster in a recessed well that keeps the drawing's shape before the file arrives and says so in words if it never does.

### Back of House
A request's path through the kitchen. Hand-off cards are small tickets you pick up, tighter than the order's, in two columns where the tray is wide enough. The laid path is an ordered list on paper, one row per stage with a dotted rule between: the selected row prints bold and underlined, never with a stripe down its side; a stage laid and not run is pencilled in quiet text; the stage that stopped the ticket prints in ribbon red with its drawn mark, and the run's finding as a voided ticket's red line. A run's new stops ink in one after another on the printer's line steps.

### The Reach-In
The cabinet of hotel pans: rows of sixteen at every width, the cabinet a size container so the pans scale with it (about 20px each on a phone), the rotation along its base and the pass in front. A pan's state is its form (bare, solid, hatched with a hash mark, shared, or a kit's with its pin), and the station that keeps it is a marker glyph at its corner (circle, square or hexagon), matched in the key. A ticket's ruler draws one row per station: held is solid, shared mise dotted, to prep a dashed hollow outline, let go an open groove. Pans never move and nothing in the cabinet animates; the lamp falls on the pans an open eviction would dump, and on nothing else.

### The Tasting
The dishes are keyed on masking tape, each with the drawn shape that carries its colour; the recipe sets a column per dish as wide as the dish in the drawing, and each weight is typed on a ticket-paper slip in Doto. The audit's cards are tickets, in as many columns as fit. In the scene, dish and course names are marker on tape strips and counts are Doto on paper tags.

### The Inspection
The clipboard: a steel board with a drawn spring clip (a riveted plate, a barrel wound with its spring, a jaw with a rolled lip) holding a form of ticket paper, the clip casting a soft drop-shadow onto the paper. The claim on trial is stamped large in Doto, and one synthetic stamp covers every figure on the form. Graph-paper sheets are pinned to the pass, cut square and lifted; the selected order's times sit on a small ticket under the lamp, the board's only amber.

### The Unbuilt Page
A page whose task has not landed: Receipts, Changes, the Trace Room, the part of About that is still to come, and the labs that the later waves build. Its name is stamped on a plate over one line that says what the page is for, and one ticket lists what it will hold in square bullets of Atkinson. The ticket says in the ribbon's red, with a drawn lock, that the page is not built, prints the wave it arrives with and the task that builds it on its foot line, and ends in one stub that leads to a page that is built. A lab's lane and module ride under the lead on masking tape. Nothing on it is lit, because the lamp has nothing to act on.

## Do's and Don'ts

### Do:
- **Do** take every colour, face, shadow, radius and duration from a token role in src/design/tokens.ts; tokens.css is generated from it and verify-tokens fails when they disagree.
- **Do** keep amber for the present alone: the ticket under the lamp, the current page, the focused control, a lit station on the line, a switch that is on.
- **Do** print every number in Doto with tabular figures and its provenance tag; the front page's readouts are synthetic ticks.
- **Do** give every category its board colour and its drawn glyph, and carry yellow and white marks on their edge colour.
- **Do** put the brushed grain (texture-brushed) on the ground and on stainless panels, plates and housings, sized to the full width so no tile edge shows.
- **Do** move on the bell: the quick duration (120ms) for the hand, the bell (240ms) for a step, the feed (420ms, steps(6, end)) for the printer, the settle (640ms) for a course coming to rest, all 0 under reduced motion.
- **Do** draw focus as the 2px filament ring at 2px offset with the lamp's glow above it.
- **Do** give every `font-size` a step of the size ramp and every radius a step of the rounded scale; a deliberate one-off keeps a one-line comment saying why.
- **Do** build a new 3D prop from the kit's shape helpers and the palette's tones, with its glow on a channel, a footprint for its contact shadow, and its label on tape in DOM.

### Don't:
- **Don't** add a dark scheme; the line is lit by its tubes, and the system ships light and more-contrast only.
- **Don't** colour anything for decoration, or give a lane, a state or a status a colour outside the six boards and the ribbon red.
- **Don't** light an on state in a board colour: a switch or a station that is on burns in the lamp's amber, and a lane's colour only says which lane.
- **Don't** move a hotel pan; a moving pan would misteach copying.
- **Don't** round paper, or set a ticket's body in the dot matrix; Doto is for print lines and numbers, Atkinson for reading.
- **Don't** fade text with opacity to show a state; use the quiet text role, which keeps 4.5:1.
- **Don't** use Unicode characters or an icon font as icons; draw them on the 24-unit grid.
- **Don't** print a small label above a headline to introduce a section; a tape label names an object, not a section.
