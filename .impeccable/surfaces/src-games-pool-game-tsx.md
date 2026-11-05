---
version: 1
slug: "src-games-pool-game-tsx"
primary_target: "src/games/pool/Game.tsx"
related_targets: ["src/games/pool","packages/play/pool"]
---

# The Reach-In

## Scope

- **Surface:** the game page of The Reach-In (`/play/pool`, working name The Pool): the 3D reach-in (W1-T24), its 2D twin (the cabinet drawn flat, W1-T23), the controls, the printer's tape and the mirror. Experience mode since W1-T24: the scene leads the page in the shell's `stage` layout, as Service's does, and the controls beside it stay the standard ones. A specified surface inside the established world: GAMES.md §8 and §2.6 and A§6 specify it, so there is no concept roll.
- **Visitor:** a kernelspace graduate who has met paged attention and prefix caching in T5, now learning how one page pool serves several kinds of attention layer and a rack of LoRA adapters.
- **Task:** play the KV manager's policy on a seeded agentic night. Hang a waiting ticket or wait, say which pans to dump when a ticket needs room, pull a ticket when the line cannot grow, bring a recipe kit in before its ticket hangs. Read what each choice cost in tokens that had to be prepped again, then read the debrief that names the turn that mattered.
- **Frequency and states:** a level runs a few dozen decisions. The states that matter are a pan's form (bare, held, cached, spoken for, a kit's), a ticket's place (waiting, hung, served), the open ask and its candidates, and the counters.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - the whole level can be played by keyboard; the scene is for reading, and the dump is chosen in the controls (or on the 2D view's pans);
  - at 390 px the rack is 16 pans to a row, about 19 px each in the front shot, and nothing scrolls sideways;
  - numbers stay in the DOM; the scene carries no text a learner must read to play;
  - reduced motion: every change cuts, and pans never move at all;
  - D-023's frozen budgets: the scene's chunk at most 40 KB gz and at most 100 draw calls, three-vendor untouched.

## Direction contract

THESIS: The page is a reach-in in the middle of service, and the scene leads it: a prep cabinet whose cold rail holds every pan in its slot for life, the line's ticket rail over its back and the pass in front. A ticket's twine is its block table and a pan is one page for every layer of its station. It refuses the memory heatmap with a legend, and a grid of grey boxes standing in for a kitchen.

OWN-WORLD: The Pass as scene kit v1 builds it: tile, hood and the line falling into haze; brushed steel with moving highlights; a bevelled cabinet with reach-in doors and bar handles; 1/9 hotel pans on adapter bars; mise in the memory roles; masking tape with marker glyphs; pushpins on a kit's pans; butcher's twine; bond tickets with dot print; heat lamps over the pass that burn only when the present lies there.

STORY: A hung ticket is carried over the rack to the rail, and its twine, one string per station, drops to the pans it holds, skipping what a window let go; its head pan fans into the layers it serves. When room is needed, the pans the engine would dump next glow under the lamp's ring.

FIRST VIEWPORT: At 1440 the 3D reach-in leads under the game's name: the rail of running tickets across the top, the rack in rows of sixteen in the middle, the pass with the waiting tickets under two heat lamps at the bottom, the line under its hood at the side. Beside it the controls: camera plates, the open ask's ticket and its list, the stub. Under the scene the view switch, keys and stages, then the mirror. At 390 the scene comes first, the rack across the width, then the ask.

FORM: The Reach-In's stage, specified by GAMES.md §2.6 and §8 and A§6; the first and only form on the list. seed: none (specified surface, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

A ticket is hung: it is carried over the rack to its clip, its twine reaches across the reach-in to the pans it holds, one string per station, and the pan at the head of its order fans into the layers it serves, the padding layers hollow. The first dump that costs something still prints "re-prepped" where it would have printed "shared", and the debrief puts that pan, its table and the ticket it hurt on one line.

## Unresolved

- **The Focus shots** of GAMES.md §2.3 (One pan, One ticket's twine) open by selection in the sketch. Here the scene's focus is the ticket hung last; the presets are Front of the reach-in, One station (A§6.1's per-group filter, whose name the first level shares; its plate sits in the camera's group) and From above.
- **Picks in the scene** (a pan tapped to choose it for the dump, a ticket pointed at to draw the twine it would start from) are not built: the controls and the 2D view do both.
- **The kit shelf** (D-042's slot baseline) is the `adapters` debrief's, in the DOM; the scene draws only the pool's own kits, whose pans are pinned and joined by their own twine.
- **Compose, In production and Build this** arrive with the TR5a content (W1-T25). The page has Play and Debrief now.
