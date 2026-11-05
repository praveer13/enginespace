---
version: 1
slug: "src-games-loop-game-tsx"
primary_target: "src/games/loop/Game.tsx"
related_targets: ["src/games/loop","src/pages/Game.tsx"]
---

# Service's own page: the pass in the middle of service

## Scope

- **Surface:** `/play/loop`, Service (`loop`) on its own page: the 3D pass, its 2D twin (the same pass drawn from above), the controls, the printer's tape and the mirror. Experience mode: the game is the page.
- **Player:** a kernelspace graduate who has met Service on the front page, or is sent here from TR2, and plays the four levels of "First service" (TR2's levels join later).
- **Job:** hang tickets on the rail and ring the bell until the level's beat lands: fill the rail, refill a clip, close the dark stretches with overlap, match par.
- **Proof:** the session is the sim's step loop on its synthetic tick card; every number is DOM, printed in dots and stamped synthetic once per tape; the mirror carries every figure the scene draws.
- **Constraints:** The Pass (DESIGN.md) is inherited; One Lamp and Only Code hold; the scene draws from scene kit v1 only; numbers never enter the canvas; usable at 360 px, by keyboard and under reduced motion; D-023's frozen budgets (the scene chunk at most 40 KB gz, at most 100 draw calls).

## Direction contract

THESIS: Service's page is the pass in the middle of service, and the scene leads it: a real line under heat lamps where each bell is one step of the engine's loop, and the plates, the dark stations and the fired rail are the batch, the bubble and overlap. It refuses the category's game page: a small canvas in a card beside a stats sidebar, and a lane chart standing in for the world.

OWN-WORLD: The Pass as built: the kit's room (subway tile, hood, quarry floor, haze), brushed and spun steel with moving highlights, glazed plates, bond tickets with dot print and curl, masking tape and marker for names; heat-lamp amber only over the pass and on a burning station; the 2D twin is the same pass from above in steel, paper and hotel pans; the tape stamped SYNTHETIC once; every number in Doto, in the DOM.

STORY: The player hangs tickets and rings the bell. Each bell, the stations with a ticket burn and the empty ones stay dark, one plate per live clip slides onto the pass, and without overlap the line drops dark while the expo writes. They switch overlap on, see the fired rail hold the fire while the line stays lit, and read the tape to confirm it.

FIRST VIEWPORT: At 1440 the 3D pass leads under the game's name, whole in the first screen: lamps at the top, the rail across the upper part with clips and tickets, the line glowing beyond, the pass and its plates across the lower middle, the printer and waiting tickets at the left. Beside it, the controls a hand needs without losing sight of the scene: camera plates, the prompt, 44 px paper tickets, the bell, Auto and the overlap switch. Under the scene, the view switch, the keys and the stages. Below: the mirror's table under the scene and the tape under the controls. At 390 the scene comes first, then the controls.

FORM: Service's stage, the pass over the expediter's shoulder, specified by GAMES.md §2.6 and §3 and A§6; the first and only form on the list. seed: none (specified surface, no roll).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The bell with overlap off: the line drops dark while the expo writes, then every hung clip's station burns amber and one plate per ticket slides onto the pass. With overlap on the fired rail takes the fire, and the line never goes dark.

## Adaptations (finish review, round 2)

- **The lamps light the steel.** On the counter, three's own spot-light reflection (one smooth lobe in the lamp's full amber, clipped) is taken off, and the steel's own sheen and streak are brightened and warmed in its place, falling off softly. The 2D twin draws each pool as a lit gradient over the brushed top's grain.
- **The room falls away beyond the line.** Its light is baked into the tile and the floor, dimming toward the corners and over the hood, and its haze is deep steel.
- **The plates sit on the steel.** Each plate on the pass has a dark contact ring at its rim and a softer shade past it, and its underside is occluded against the counter.

## Unresolved

- GAMES.md §3's "3D scene" and "2D path" still describe lanes along time (a Gantt). This page draws the present instead (the rail, the fired rail, the last fire's plates, the stations), and the night's timeline lives in the tape and the mirror, and in the debrief's compare strips. The docs need the owner's amendment.
- The steam over a lit station departs from GAMES.md §2.6 rule 1 (no steam), as scene kit v1 already noted.
