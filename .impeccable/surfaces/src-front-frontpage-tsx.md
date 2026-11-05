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
- **Action:** play one service, then open the menu (the course map, `/map`) and start TR1.
- **Proof:** the visitor runs a real step-loop model and sees what it does; it is not a description of one. All demonstration numbers are labelled synthetic.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - the first paint is a static shell plus the 2D game, and the 3D scene loads after LCP;
  - the page works at 360-390 px and by keyboard, with reduced motion.

## Direction contract

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

## The roll behind FORM's seed

The seed reference in FORM is the one impeccable's concept roll printed for this direction round. Its roll output is local runtime state, which git never holds (`.impeccable/questions/`, written by impeccable): the main checkout keeps it as `.impeccable/questions/roll.json` and `.impeccable/questions/seeds/631f6361e61b6b7b.json`. The record never enters a committed file, since it holds the raw seed key. What it says:

- **The roll:** `seed:631f6361e61b6b7b`, scope `direction`, mode `persuade`, source `api`, pool revision `c3b204a1eed6`, hand `96d5b1c56c6d4dfb3d5c09ccdbdd4579`, re-roll 0, written 2026-11-03 20:05 (local time).
- **The worlds it dealt** (the six catalog worlds the round declined, D-047): `medium-native-hypercard-stack-shoebox`, `signals-instruments-darkroom-safelight-bay`, `digital-design-canon-mondo-tech-utopian-spread`, `pop-culture-shelf-lowbrow-gallery-panel`, `cinema-cinematography-editing-hand-processed-film-bloom`, `dream-surreal-impossible-worlds-alphabet-storm`.
- **The seed's record:** round 0 of that hand, the same six dealt, recorded by the agent at 21:33 the same evening.
- **The check:** `impeccable concept-seed --check-seed seed:631f6361e61b6b7b` exits 0 (SEED KNOWN) in a checkout that holds the record, and 1 (SEED UNKNOWN) in a worktree that does not, which is what a capture worktree is. The check reads the record's presence, so the roll output above is what corroborates it.

## Memorable moment

The first service. A visitor fires two tickets; the stations sit half dark and the printer shows the bubble. They fill the rail, and the line lights end to end.

## Adaptations (finish review, round 2)

- **The lamps light the steel.** Under each heat lamp the counter's own sheen and streak brighten in the lamp's warm light and fall off softly. They take the place of the smooth amber lobe that three draws for a spot light off brushed steel, which was bright enough to clip and read as a coloured decal. The 2D pass draws each pool as a lit gradient over the brushed top's grain, never as a blur.
- **The room falls away.** The room's light is baked into its tile and its floor: full over the line, dimming toward the far corner and up the wall over the hood. The haze is deep steel, darker than the pale tile it fogs.
- **The plates sit on the steel.** Each plate on the pass has a dark contact ring tight about its rim and a softer shade past it, over its underside's own occlusion against the counter, as the shelf's stacks have.
- **The printer is a housing.** It is a box seen from the expo's side: the cover faces the pass with the menu link printed on it (from 80rem the link's words take a line of their own), its top recedes above it, its side falls back into shade, the roll shows in a recessed window, the feed button stands proud, and the mouth's teeth run along its foot. DESIGN.md's Printer ("rounded upper corners (8px 8px 3px 3px)") still describes the flat panel this replaces: raised with the documenter.
- **The 2D side wall is tiled.** The 2D view tiles the side wall as it tiles the back wall, every course with its joints, and shades it toward the far corner.

## Unresolved

- **Faces:** the exact faces (sourced and self-hosted) are chosen at build time.
- **Game name:** chosen: the front-page game (`loop`) is "Service", subtitled "the step loop" (D-049), and its front-page run is "First service".
