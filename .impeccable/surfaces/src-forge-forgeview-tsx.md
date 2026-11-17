---
version: 1
slug: "src-forge-forgeview-tsx"
primary_target: "src/forge/ForgeView.tsx"
related_targets: ["src/forge","src/pages/Lab.tsx"]
---

# A lab (`/labs/:lab`)

## Scope

- **Surface:** a browser lab's page (`/labs/:lab`; A§3.1 and A§8.3 specify it), in Operate mode (REDESIGN §3.9). Its title is the lab's engine title, "Build ..." (`src/forge/titles.ts`).
- **Visitor:** a learner who builds a lab's Rust crate to `wasm32-unknown-unknown` on their laptop and wants to know whether it is right.
- **Task:** download the crate, edit the one file it names, build it, drop the `.wasm`, and read each check's result, the seed it ran on, and why a failed one failed; run again on new seeds; know whether the run counted.
- **Proof:** the checks are the site's. The page sends the module seeded commands and compares every reply with its own model, in a worker, with a time limit per check. Nothing about the module is taken on trust, and the file never leaves the tab.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - laptop-first and read-only on a phone (A§3.1), but no sideways scroll at 390 px, and every control reachable by keyboard;
  - reduced motion cuts every change;
  - the toy lab (`/labs/toy`) is the first lab on it, and the real labs reuse the view unchanged.

## Direction contract

THESIS: The lab page is a numbered procedure that ends in a verdict the learner can audit: five steps, then the checks, each saying what it catches. The learner's module is read back against the site's own model, command by command. It refuses the test runner's wall of green and red badges, and the upload card with a cloud on it.

OWN-WORLD: Data Book (REDESIGN §2.8): flat paper cut square with one soft sheet shadow and no texture; ink text in Atkinson Hyperlegible, titles in Big Shoulders Display 800 in sentence case; the module's SHA-256, the seeds, the counts and the commands in the tabular mono face; a check's result a mark and a word, the second ink only for a failed reply; the step numbers dark squares, not amber; one amber marker that means "now", on the control to act on now.

STORY: The learner trusts a verdict because they can see how it was reached: which bytes, which commands, which reply was wrong and what it should have been. They come to believe that a pass is earned: fresh seeds, a fresh instance for each check, a spin stopped at its limit. They drop, read the first failed check, fix, rebuild and drop again. When the run passes on fresh seeds, the page says plainly that it was written to the ledger on this device.

FIRST VIEWPORT:
- **At 1440 px:** the h1 (the lab's title) over its two-sentence lead, then one ordered list of five steps: 1 Download the crate (its link, size and SHA-256, the check line behind a disclosure), 2 Edit one file, 3 Build (the command with Copy, and the toolchain it needs), 4 Drop the .wasm here, 5 The checks, with the run's readout beside them.
- **At 390 px:** the same five steps in one column, the readout above the checks.
- **The primary action:** choosing the file in step 4. The run starts when the module has loaded, and "Run on new seeds" stands beside the result.

FORM: Data Book's numbered procedure (REDESIGN §3.9). seed: none (a specified surface inside the established world, which the owner confirmed at the look gate; no roll)

FINISH: unreviewed and undocumented is unfinished; this surface ends with wave R's finish review (R-T50), its material fixes, and DESIGN.md written from the built world

## Memorable moment

The first failed check. Its row prints the reply the module gave beside the reply it should have given, with the seed that drew the commands and the line "Catches ..." that names the mistake it was written for.

## Adaptations

- **The slot readout** (`hybrid-kv` only). After the checks, a panel, "Measured against the slots", plays one run of adapter churn on the learner's module and the same run on a model with fixed slots, as vLLM and SGLang keep adapters at their pins, and counts the requests each admitted and the adapters each loaded. It is a readout and not a check: it carries no marker and no verdict, says that it earns nothing and is not written to the ledger, and tags every figure as synthetic.

## Unresolved

- The page does not say at its top that a lab needs a laptop with Rust, or about how long it takes, and has no breadcrumb back to its module (the phone walk of 2026-11-17).

## The Pass's contract, superseded

Until wave R this surface was specified in The Pass (D-047), the kitchen world: the pass inspection, with tickets and the printer's tape. D-062 replaced it with Data Book, which the owner confirmed at the look gate on 2026-11-16, and stage 4 took the kitchen's files out of the tree. The superseded contract is in this file's git history; none of it applies to the built surface.
