---
version: 1
slug: "src-front-frontpage-tsx"
primary_target: "src/front/FrontPage.tsx"
related_targets: ["src/front"]
---

# Front page

## Scope

- **Surface:** the front page (`/`), in Persuade mode.
- **Visitor:** a kernelspace graduate, a backend engineer who has finished T5, deciding whether to start enginespace.
- **Action:** run one step of the step loop by hand, in about a minute, then start the course at TR1 lesson 1. A returning learner sees where they left off and Continue.
- **Proof:** the visitor runs a real step-loop model and sees what it does; it is not a description of one. All demonstration numbers are labelled synthetic.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - the first paint is a static shell plus the 2D game, and the 3D scene loads after LCP on a desk; a phone stays in 2D, since the time track's scene has no legible layout in a 358 px box (REDESIGN §3.1 as amended at the finish review, 2026-11-17);
  - the page works at 360-390 px and by keyboard, with reduced motion;
  - the front page's first-paint gates (150 KB of JavaScript, 30 KB of CSS) are unchanged.

## Direction contract

Data Book (D-062), which the owner chose at the look gate on 2026-11-16 in the words "data book for sure" (`docs/waves/WR-look.md` §6). The brief is `docs/REDESIGN.md`: §1 for the decision, §2.8 for the visual system and §3.1 for this page's geometry. This contract says what the world is; the brief says how it is built.

THESIS: An inference engine is already drawn by the people who build it: timing diagrams, page maps, distribution bars, latency plots. The front page is one of those drawings, live, and the visitor runs one step of the loop it shows. The page names nothing with a metaphor, and it refuses the category's dark GPU-render landing and its row of feature cards.

OWN-WORLD:
- **Ground and surfaces:** flat paper, cut square, with no texture; one soft shadow for a sheet and one for a popover.
- **Text you read:** ink on paper, in a face drawn for legibility.
- **Active state:** one amber marker that means "now", always with its dark edge, a shape and a word, and only on its three carriers: the control to act on now, the "now" cursor on a diagram, and the current position in a rail or on the course track.
- **Categorical code:** six colours, each with its glyph (blue circle, green hexagon, yellow diamond, red triangle, white hollow ring, brown square), the only code, and only where the model's state is drawn.
- **Drawing:** the graticule inside diagrams, ink slabs on lanes, idle as a dashed hollow box, and dimension lines with end ticks and a value, as in an engineering drawing.
- **Headlines:** a heavy condensed grotesk in sentence case, so `vLLM` and `SGLang` keep their casing.
- **Numbers:** a tabular mono face for every number the visitor compares, with its delta beside it for a second after it changes.

STORY: The visitor learns that an engine's speed is the scheduler's job: fill every slot, and never make the GPU wait for the CPU. They come to believe that enginespace teaches vLLM and SGLang by having them run each mechanism, read the code that implements it, and then prove it on a real GPU. They run one step, see why batching pays, and start TR1 lesson 1.

FIRST VIEWPORT:
- **The headline:** "Run one step of an LLM inference engine.", over one paragraph that says what the course is, and a line that says the panel beside it is live and takes about a minute.
- **The instrument:** a paper sheet beside it, in the one game frame: "Step loop", its role line "You are the scheduler.", the demo level, the goal line, the waiting queue, the lanes on the graticule (the CPU row, then one row per batch slot) with the "now" line at tick 0, the readout strip with one "synthetic" stamp, the dock with Step, and the title block.
- **The parts:** five ink callouts on the queue, the slot labels, the CPU row, the GPU rows and Step, which are also the parts list.
- **The primary action:** at first paint, the amber ring on the first waiting request; once a slot is filled, Step is the one amber-filled control.
- **The way on:** the header's Continue, as an outline, reads "Start: TR1 lesson 1" on a first visit, and the link "Skip the demo and see the course" sits under the paragraph.
- **On a phone:** the headline, a request to tap, the slots and Step are on the first screen, and the coach line steps through the parts one at a time.

FORM:
- **Chosen form:** Data Book, the visual world of wave R's brief ("You Are Here", `docs/REDESIGN.md`), which replaces The Pass (D-047). The brief's judges, directions and review chose it (REDESIGN §2.2), and the owner confirmed it at the look gate on 2026-11-16 (D-062).
- **Seed:** none. No concept roll was dealt for Data Book. The look gate put that deviation in front of the owner, with the choice of accepting the brief's direction in place of a roll or asking for a roll before DESIGN.md is written. On 2026-11-16 the owner chose Data Book ("data book for sure", `docs/waves/WR-look.md` §6, D-062). The owner did not ask for a roll, and the brief's choice stands in place of one. The Pass's seed below belongs to The Pass and is not Data Book's.
- **Signature interaction:** put a waiting request into a slot (tap it, drag it or press its key), then Step. The step draws its slabs across the lanes, the readout steps to its new value with its delta, and the first time the rule is felt it is named once beside the drawing: a step costs the GPU about the same for one request as for four.
- **The authored moment:** on demo level 3, async scheduling goes on and the dashed idle boxes on the GPU rows close.
- **Motion grammar:** things move on an action and are still between actions; 120 ms for the hand, 240 ms for a step and 640 ms for the one authored moment, and every duration is 0 under reduced motion.
- **On a capable desktop, after LCP:** the lanes' box becomes the 3D time track at its Lifted camera, in the same box, with time still running left to right. Every word and number stays in the DOM, and the strips, the dock and the callouts do not move.
- **Disciplines kept from The Pass:**
  - every readout is also the control that changes it, or sits beside it;
  - the model's state is drawn, never decorated;
  - no neutral template regions.

FINISH: unreviewed and undocumented is unfinished; this build ends with the look gate's comparison (held on 2026-11-16), the finish review and its verdict (R-T50, recorded under D-062), DESIGN.md written from the built world, and every shipping raster carrying its provenance

## Memorable moment

The first step. The visitor puts four waiting requests into the four slots and presses Step, and the GPU rows fill for the cost of one: that is batching. Two levels later async scheduling goes on, and the idle boxes close.

## The Pass's contract, superseded

The Pass (D-047) was this page's world from W0 to wave R. D-062 replaced it: the owner chose Data Book at the look gate (R-T20) on 2026-11-16, and stage 4 took the kitchen's files out of the tree. None of what follows applies to the built page. It is kept here as it stood, as history, with the record of its roll and its adaptations.

THESIS: Continuous batching is a line kitchen, and the front page is the pass in the middle of service. You are the expediter firing each step; you are not a visitor reading about one. The page refuses the category's dark GPU-render landing and its row of feature cards.

OWN-WORLD:
- **Ground and surfaces:** brushed stainless steel.
- **Text you read:** kitchen impact-printer tickets: white bond paper, dot-matrix black with a red second colour.
- **Active state:** heat-lamp amber pooled over the pass, and only there.
- **Categorical code:** the HACCP cutting-board colours (red, blue, yellow, green, white, brown), the only code; nothing is coloured for decoration.
- **Labels:** masking tape and marker on hotel pans, which are the KV blocks.
- **Headlines:** a heavy condensed grotesk, like stamped equipment plates.
- **Numbers:** dot-matrix numerals for every count, timestamp and microsecond.

STORY: The visitor learns that an engine's speed is the expediter's job: fill every fire, keep every station hot, never leave a ticket sitting. They come to believe that enginespace teaches vLLM and SGLang by having them run it, and then makes them prove it on a real GPU. They play one service, then open the menu.

FIRST VIEWPORT:
- **The scene:** a full-bleed 3D pass seen over the expediter's shoulder.
  - The ticket rail runs across the top third, with the printer feeding tickets in from the left.
  - The stainless pass runs across the middle under three heat lamps.
  - The line's stations glow beyond it.
- **The headline:** "Fire the next step.", printed large on a ticket clipped to the rail.
- **The primary action:** "Start service", printed on that ticket's tear-off stub.
- **The menu link:** on the printer.
- **Live readout:** the printer tape shows the step number, the step clock in ticks per step (labelled synthetic, not microseconds; D-048), and stations busy.

FORM:
- **Chosen form:** The Pass, the kitchen expo line. It was candidate 1 on my ordered list, the IMPECCABLE'S PICK card; the owner chose it over the roll's candidate 3.
- **Seed:** seed:631f6361e61b6b7b
- **Signature interaction:** drag a ticket onto the rail (or tap it, or press 1-9). The bell rings each step, and one course per fired ticket slides down the pass.
- **Motion grammar:** everything moves on the bell, the step clock. Between bells, only the printer feeds.
- **Disciplines kept from the declined hand:**
  - every readout is also the control that changes it;
  - each fire previews its step time before you commit;
  - no neutral template regions.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

### The roll behind FORM's seed

The seed reference in FORM is the one impeccable's concept roll printed for this direction round. Its roll output is local runtime state, which git never holds (`.impeccable/questions/`, written by impeccable): the main checkout keeps it as `.impeccable/questions/roll.json` and `.impeccable/questions/seeds/631f6361e61b6b7b.json`. The record never enters a committed file, since it holds the raw seed key. What it says:

- **The roll:** `seed:631f6361e61b6b7b`, scope `direction`, mode `persuade`, source `api`, pool revision `c3b204a1eed6`, hand `96d5b1c56c6d4dfb3d5c09ccdbdd4579`, re-roll 0, written 2026-11-03 20:05 (local time).
- **The worlds it dealt** (the six catalog worlds the round declined, D-047): `medium-native-hypercard-stack-shoebox`, `signals-instruments-darkroom-safelight-bay`, `digital-design-canon-mondo-tech-utopian-spread`, `pop-culture-shelf-lowbrow-gallery-panel`, `cinema-cinematography-editing-hand-processed-film-bloom`, `dream-surreal-impossible-worlds-alphabet-storm`.
- **The seed's record:** round 0 of that hand, the same six dealt, recorded by the agent at 21:33 the same evening.
- **The check:** `impeccable concept-seed --check-seed seed:631f6361e61b6b7b` exits 0 (SEED KNOWN) in a checkout that holds the record, and 1 (SEED UNKNOWN) in a worktree that does not, which is what a capture worktree is. The check reads the record's presence, so the roll output above is what corroborates it.

### Memorable moment

The first service. A visitor fires two tickets; the stations sit half dark and the printer shows the bubble. They fill the rail, and the line lights end to end.

### Adaptations (finish review, round 2)

- **The lamps light the steel.** Under each heat lamp the counter's own sheen and streak brighten in the lamp's warm light and fall off softly. They take the place of the smooth amber lobe that three draws for a spot light off brushed steel, which was bright enough to clip and read as a coloured decal. The 2D pass draws each pool as a lit gradient over the brushed top's grain, never as a blur.
- **The room falls away.** The room's light is baked into its tile and its floor: full over the line, dimming toward the far corner and up the wall over the hood. The haze is deep steel, darker than the pale tile it fogs.
- **The plates sit on the steel.** Each plate on the pass has a dark contact ring tight about its rim and a softer shade past it, over its underside's own occlusion against the counter, as the shelf's stacks have.
- **The printer is a housing.** It is a box seen from the expo's side: the cover faces the pass with the menu link printed on it (from 80rem the link's words take a line of their own), its top recedes above it, its side falls back into shade, the roll shows in a recessed window, the feed button stands proud, and the mouth's teeth run along its foot. DESIGN.md's Printer ("rounded upper corners (8px 8px 3px 3px)") still describes the flat panel this replaces: raised with the documenter.
- **The 2D side wall is tiled.** The 2D view tiles the side wall as it tiles the back wall, every course with its joints, and shades it toward the far corner.

### Adaptations (W1b's finish review of Service, round 1)

- **The printer fits a phone's first screen.** Below 30rem the housing is as short as what it carries: a foot that just holds the mouth, a narrower band over the menu, and the menu's lines set close, so the whole housing, its mouth included, stands above the fold of a 390 by 844 screen.

### Adaptations (W1b's finish review of the lesson blocks, round 2)

- **The 2D pass's names are tape in the DOM.** The posters and the 2D view hold no word but a ticket's: the line's and the expo's names are the design system's masking tape over the drawing, stuck on the last station and on the pass's front edge, at the size of the pass's box and never under the size ramp's smallest step, as the 3D pass prints its own. The static HTML prints them beside each inlined poster.

### Adaptations (W1b close-out, the 2D view's labels)

- **The 2D pass prints no number or word at all.** The tickets' numbers and the empty clips' stubs are print in the DOM over the drawing, as its tapes are: each hung ticket's number in Doto on its paper, each empty clip's stub hung from the clip's jaw with its word in the ribbon's red, at the size of the pass's box and never under the size ramp's smallest step; a fired copy's number shows on a pass 520 px wide or wider [estimated]. The static HTML prints the first frame's four stubs beside each inlined poster, and the posters hold no print. The four front-page screenshot baselines are re-blessed for it at the unchanged 1%.

## Unresolved

- **The look gate, settled:** the owner chose Data Book on 2026-11-16 (D-062), and the kitchen's files have left the tree (stage 4).
- **Game name:** settled by D-063, which supersedes D-049: the front-page game (`loop`) is "Step loop", with the subtitle "Keep every slot live, and never make the GPU wait for the CPU." Its front-page levels are demo levels 1 to 4.
