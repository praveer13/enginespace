---
version: 1
slug: "src-pages-playindex-tsx"
primary_target: "src/pages/PlayIndex.tsx"
related_targets: ["src/games"]
---

# Games

## Scope

- **Surface:** the games index (`/play`), in Operate mode.
- **Visitor:** a learner who wants to play one rule of the engine, or to see which game goes with the module they are on.
- **Action:** open a game.
- **Proof:** each game's picture is its own 2D view's first frame, drawn by the same pure layout. A game that is not built yet shows nothing it does not have.
- **Constraints:**
  - the PRODUCT.md constraints;
  - 320 px with no sideways scroll, keyboard, reduced motion;
  - a game that is not built yet is never a link, and says which wave brings it.

## Direction contract

THESIS: The games are the specials on the line's board: each a named line with its picture in a steel well and one stub to play it. The page refuses the grid of game cards, and a game that is not built hangs as a bare pan and not as a dead link.

OWN-WORLD:
- **Board:** a sheet of raised brushed stainless with a plate edge, its lines divided by machined grooves.
- **Lines:** the display name stamped on a plate over its subtitle on masking tape; the module and the view (2D or 3D) on tape beside it.
- **Wells:** recessed steel that holds the poster; an empty pan where the game is not built.
- **Active state:** amber only on the control the keyboard is on.

STORY: The learner sees which games they can play now, which module each belongs to and whether it has a 3D view. They see what arrives with the next wave without being sent to a page that is not there, and they open Service or the game that matches their module.

FIRST VIEWPORT:
- The stamped heading "Games" and a lede.
- Under them the board: Service first, with its poster in the well, its name over "the step loop", TR2 and 3D on tape, and the Play stub at the right.
- Below it, one line to a game that is built, then the lines of the games that arrive, each with a bare pan.
- On a phone each line stacks: the well on top, then the name, the tape, and the stub.

FORM:
- **Chosen form:** the specials board of the line kitchen, with the display names and subtitles of D-049 and the objects of GAMES.md §2.6. It is the specified surface, with no concept roll.
- seed: none (specified surface, no roll)
- **Signature move:** a game that is not built yet is a bare pan in its well, labelled with the wave that brings it.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

Service's poster in its well: the same picture as the front page's first frame, now a line on the board with a stub beside it.

## Unresolved

- **Posters of the other games:** each game's task adds its poster file to scripts/posters.ts and a line to the table in src/games/specials/posters.ts, and the board shows a bare pan until it does. The board fetches the file and never imports a game's layout code, which would cost the front page's first-paint budget.
