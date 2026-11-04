---
version: 1
slug: "src-forge-forgeview-tsx"
primary_target: "src/forge/ForgeView.tsx"
related_targets: ["src/forge","src/pages/Lab.tsx"]
---

# The forge view

## Scope

- **Surface:** a forge lab's page (`/labs/:lab`), in Operate mode. A specified surface inside the established world: A§3.1 and A§8.3 specify it, so there is no concept roll.
- **Visitor:** a kernelspace graduate who has built a lab's Rust crate to `wasm32-unknown-unknown` on their laptop and wants to know whether it is right.
- **Task:** drop the `.wasm`; see which module was graded (its SHA-256); read each check's result, the seed it ran on, and why a red one is red; run again on new seeds, or tell the same seeds again; know whether the run counted.
- **Proof:** the checks are the site's. The page sends the module seeded commands and compares every reply with its own model, in a worker, with a time limit per check. Nothing about the module is taken on trust, and the file never leaves the tab.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - laptop-first and read-only on a phone (A§3.1), but no sideways scroll at 390 px, and every control reachable by keyboard;
  - reduced motion cuts the printer's feed;
  - the toy lab (`/labs/toy`) is the first lab on it, and the real labs reuse the view unchanged.

## Direction contract

THESIS: The forge is the pass inspection, and the page is a tool before it is a picture of one. The learner's module is the dish sent up; the page is the expo reading it back against the house recipe, command by command. It refuses the test runner's wall of green and red badges, and the upload card with a cloud on it.

OWN-WORLD:
- **Controls:** plates and a stub on a brushed-stainless deck.
- **What is read:** white bond ticket paper in the printer's dots, with the ribbon's red for what must be seen.
- **The module's name:** its SHA-256 on masking tape, in marker.
- **Numbers:** counts and seeds in the dot matrix, each with its tag.
- **Status:** a drawn mark and a word, never a board colour.
- **The one lamp:** amber falls only on the place the next decision acts on, which is the drop slip before a file and the first red check after a run.

STORY: The learner trusts a verdict because they can see how it was reached: which bytes, which commands, which reply was wrong and what it should have been. They come to believe that a pass is earned: fresh seeds, a fresh instance for each check, a spin stopped at its limit. They drop, read the first red check, fix, rebuild and drop again. When the run is green and fresh, the page says plainly that it was written to the ledger on this device.

FIRST VIEWPORT:
- **At 1440 px:** two columns under the page's plate.
  - Left, 44rem: the lab's name over its lead, then the drop slip (tape label "your .wasm", a plate button to choose a file, the file's name and size once chosen), then the checks as one ticket, a printed line each with its stage, its label and its result.
  - Right, 20rem: the printer's tape, "the run, printed": lab, module hash, seeds, and whether the run counted.
- **At 390 px:** one column in the order slip, checks, tape.
- **The primary action:** choosing a file. The run starts when the module has loaded, and "Run on new seeds" is the plate beside the result.

FORM: The Pass, as GAMES.md §2.6 and DESIGN.md specify it: tickets for what is read, the printer's tape for the live readout, tape labels for names and plates for controls. seed: none (specified surface, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The first red check. The ticket prints the reply the module gave beside the reply it should have given, in the ribbon's red, with the seed that drew the commands, and the lamp falls on that line.

## Unresolved

- **The kit's download:** the packer (W1-T11) makes the zip, and the page links to it then.
- **The learner's module has no kitchen word.** GAMES.md §2.6 names the engine's objects and not the learner's code, so the page says "your module".
