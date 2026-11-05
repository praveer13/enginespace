---
version: 1
slug: "src-games-pool-game-tsx"
primary_target: "src/games/pool/Game.tsx"
related_targets: ["src/games/pool","packages/play/pool"]
---

# The Reach-In

## Scope

- **Surface:** the game page of The Reach-In (`/play/pool`, working name The Pool), in Operate mode. A specified surface inside the established world: GAMES.md §8 and §2.6 and A§6 specify it, so there is no concept roll. This task builds its 2D view, its controls, its mirror and its debrief; W1-T24 adds the 3D scene over the same session.
- **Visitor:** a kernelspace graduate who has met paged attention and prefix caching in T5, now learning how one page pool serves several kinds of attention layer and a rack of LoRA adapters.
- **Task:** play the KV manager's policy on a seeded agentic night. Hang a waiting ticket or wait, say which pans to dump when a ticket needs room, pull a ticket when the line cannot grow, bring a recipe kit in before its ticket hangs. Read what each choice cost in tokens that had to be prepped again, then read the debrief that names the turn that mattered.
- **Frequency and states:** a level runs a few dozen decisions. The states that matter are a pan's form (bare, held, cached, spoken for, a kit's), a ticket's place (waiting, hung, served), the open ask and its candidates, and the counters.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - the whole level can be played by keyboard, and the rack is for reading: on a phone every pick goes through a list;
  - at 390 px the rack is 16 pans to a row, about 20 px each, and nothing scrolls sideways;
  - reduced motion: nothing moves in the 2D view at all, since pans never move and the state changes where it sits.

## Direction contract

THESIS: The reach-in is a cabinet of hotel pans, and the page is the expediter deciding which pans the kitchen can afford to throw out. A page is a pan, a ticket is a ruler of the pans its order holds, and a hit is shared mise that counts only as far as every station still holds it. It refuses the memory heatmap with its colour legend and the hit-rate dashboard.

OWN-WORLD:
- **The cabinet:** brushed stainless with a lit top edge and the shelf shadow, its door plate stamped THE REACH-IN. Hotel pans in rows of sixteen, each in its slot for life, drawn with the 10px rim and a recessed well.
- **A pan's state** is its form plus its fill pattern: bare, solid, hatched with a hash mark, a kit's pan with its pin. A station is a glyph at the pan's corner and a marker word on its tape.
- **Marker on masking tape** names a pan by its table and its block (C·5), a kit by its number, a lane of tickets by its place.
- **Tickets** are bond paper in the printer's dots, each with a ruler of segments, one row per station; the counts come off the printer's tape with their tags.
- **The one lamp** falls on the pans or tickets the open ask can act on, and nowhere else.

STORY: The learner sees that dumping a pan is a choice that costs tokens somebody must prep again, and that a station that has let a pan go can hold back a whole ticket's hit. They come to believe that the rotation's order is not an accident: the tail of an order goes first so that its head, which every later hit starts from, stays. They finish a level with a count of tokens they saved, and a debrief that names the dump or the hanging that cost the most.

FIRST VIEWPORT:
- **At 1440 px:** two columns under the game's plate.
  - Left, about 46rem: the level's own line in body type, and under it the reach-in cabinet, whose door plate carries the count of bare, held and cached pans in the printer's dots; under it, along its base, the rotation, the pans in dumping order with the next on the left; then the pass, with the waiting tickets and the hung tickets as rulers; then the open ask, whose list is the way to act.
  - Right, about 30rem: the printer's tape (tokens re-prepped, tokens shared, tickets served, tickets pulled, kit stall steps, pans dumped) over the mirror's two tables.
- **At 390 px:** one column in the order the page reads: the level's line, the rack at sixteen to a row, the rotation, the pass, the open ask, the mirror.
- **The primary action:** the open ask's own plate: "Hang this ticket", "Dump these pans", "Pull this ticket" or "Bring this kit in". It sits under the drawing it acts on, below a first screen, so the page brings it into view whenever a decision opens it, and focus goes into its list.

FORM: The Reach-In, as GAMES.md §2.6 and §8 specify it: the rack, the rotation, the tickets, the kits and the tape. seed: none (specified surface, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The first dump that costs something. A ticket is waiting on shared mise, the learner dumps the pan its hit stood on, and the next hanging prints "re-prepped" where it would have printed "shared". The debrief puts that pan, its table and the ticket it hurt on one line.

## Unresolved

- **The 3D scene** is W1-T24's: the rack of fixed pans, the fan into layers on Focus, and the twine. This surface keeps its names and its states.
- **The ask and the rack are not on one screen.** At 1440 px the open ask sits under the cabinet, the rotation and the pass, so choosing a pan in its list rings that pan where the learner is not looking, and the first screen of a level shows the drawing and no way to act. The page brings each new ask into view, and the list says everything the rack would. W1-T24 builds the scene that leads the page, and should take the shell's `stage` layout (the view first, the controls beside it, the counters across the foot) as Service does, so that the rack, the rotation and the ask are on the screen together.
- **Compose, In production and Build this** arrive with the TR5a content (W1-T25). The page has Play and Debrief now.
- **The recipe kit's shelf baseline** (D-042) shows in the `adapters` debrief now, and in the In-production card when that card exists.
