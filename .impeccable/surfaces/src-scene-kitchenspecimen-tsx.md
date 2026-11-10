---
version: 1
slug: "src-scene-kitchenspecimen-tsx"
primary_target: "src/scene/KitchenSpecimen.tsx"
related_targets: ["src/scene/props","src/scene/KitchenScene3D.tsx","src/pages/Design.tsx"]
---

# The kitchen on /design: scene kit v1's specimens

## Scope

- **Surface:** the scene section of `/design` (`#scene-kit`), below the W0 kit specimen: the kitchen's equipment, each piece alone and the assembled pass, at tier 1 and tier 2, each beside its 2D note. Read mode: a design-system reference whose figure is live.
- **Reader:** whoever builds a 3D game of the course (an agent or the owner) and the learner who opens the design page. They come to see what the kitchen is made of before a game re-dresses with it.
- **Job:** pick a piece of equipment, see it in 3D and in its 2D note, ring the bell to see its one motion, and switch tier 1 and tier 2 to see what a phone keeps and what a laptop adds.
- **Proof:** every piece is drawn by `src/scene/props` in metres, in its own material, grounded by contact shadow and baked occlusion; the tape prints the draw calls the browser measures, tagged measured; every size is tagged estimated.
- **Constraints:** the world of DESIGN.md (The Pass) is inherited, not restated; One Lamp and Only Code hold; numbers stay DOM; one live canvas per page (the W0 specimen keeps it until this one is opened or scrolled to); reduced motion cuts every change; usable at 360 px and by keyboard; the scene chunks stay inside D-023's frozen budgets.

## Direction contract

THESIS: The scene kit is the line's own equipment, shown the way a kitchen receives it: each piece on the bench with its spec sheet, then the whole pass assembled under its lamps. It refuses the category default for a 3D kit page, a grid of grey primitive thumbnails on a neutral canvas with an orbit gizmo.

OWN-WORLD: The Pass as DESIGN.md built it: brushed stainless ground and benches; equipment in its own metals (brushed steel, spun aluminium, chrome, cast iron), glazed white ceramic, bond paper with dot-matrix print and curl, masking tape and marker; heat-lamp amber only on what is lit and on the present; the board colours only for a pan's category; every count in Doto dots with its provenance; spec sheets are tickets, the picker is a rail of tickets.

STORY: The reader sees each piece alone, then sees the pieces become one kitchen under heat lamps, and believes every 3D game will read as the same real line at first glance. They pick a piece, ring the bell for its one moment, and flip T1 and T2 to see what each tier keeps.

FIRST VIEWPORT: At 1440 the section opens on the live bench, about two thirds wide: the assembled pass under three amber lamps, the line glowing beyond it, tile and hood behind in haze. To its right hangs the spec-sheet ticket of the piece in view: kitchen name over engine term, modelled size in dots tagged estimated, and what T1 keeps and T2 adds. Under the bench runs the rail of equipment tickets (the picker), the bell, and the T1/T2 switch. At 390 the bench comes first at full width, then the rail wrapping in rows, the bell and switch, then the spec sheet.

FORM: The equipment rail and spec sheet, specified by GAMES.md §2.6, A§6.4 and the scene kit v1 task; first and only form on the list. seed: none (specified surface, no roll).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The bell on the assembled pass: the chrome dome wobbles and flashes amber, the plates slide down the pass and settle, a ticket whose course went out is spiked, steam lifts off the lit stations, and then the kitchen is calm until the next bell.

## Unresolved

- **W1b-T10** carried Back of House's lamp into the kit: every game's lamp is a cone of warm haze and an edgeless pool with no spot light. The kitchen here keeps scene kit v1's spot lamps (src/scene/spot-lamps.tsx, outside the kit's props, so no game counts them), whose shadow maps at T2 its spec holds, until the owner rules on O-13; it shows the kit's new paper and merge.

- The heat lamps' shadow maps at T2 depart from A§6.6 (real-time shadows off at T1 and T2) and steam departs from GAMES.md §2.6 rule 1 (no steam): the task asks for both, and the docs need the owner's amendment.
- The ticket print is a texture of generic order lines in dots; it carries no number a reader needs (GAMES.md §2.6 rule 7), and the ticket's number stays a DOM label.
