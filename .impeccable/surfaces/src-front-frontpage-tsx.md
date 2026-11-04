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
- **Live readout:** the printer tape shows the step number, microseconds per step, and stations busy.

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

## Memorable moment

The first service. A visitor fires two tickets; the stations sit half dark and the printer shows the bubble. They fill the rail, and the line lights end to end.

## Unresolved

- **Faces:** the exact faces (sourced and self-hosted) are chosen at build time.
- **Game name:** the front-page game is "The Loop" in the architecture draft. In this world it is a service, and its name changes to match.
