---
version: 1
slug: "src-items-itemblock-tsx"
primary_target: "src/items/ItemBlock.tsx"
related_targets: ["src/items"]
---

# Item block

## Scope

- **Surface:** the `item` block of a lesson (A§4.3), drawn by `src/items/ItemBlock.tsx` inside the lesson page's run of tickets. A whole surface inside the established world, specified by GAMES.md §2.6 (a request is a ticket) and A§6.3 and A§8.2 (a fresh seed when an attempt starts). In Operate mode: the learner completes a task, so the controls are the standard ones (a text field, radios, buttons) drawn in the Pass's materials.
- **Visitor:** a kernelspace graduate partway through a lesson, who has just read the idea and now answers on numbers they have not seen.
- **Action:** write one answer, say how sure they are, pull the stub, read why, and ask for new numbers.
- **Proof:** the numbers on the ticket are drawn when the attempt starts, the key is computed from them on submit and stored nowhere, and every figure on the ticket carries its tag. The sample family's world is synthetic and says so.
- **Constraints:**
  - the PRODUCT.md and DESIGN.md constraints (one lamp, only code, dots for numbers, no dark scheme);
  - a ticket reads at 360-390 px and by keyboard alone, and every duration is 0 under reduced motion;
  - nothing is timed, and the confidence tap never gates.

## Direction contract

THESIS: An item is a ticket the learner fills in. The kitchen hands over a printed ticket with a scenario on it, you write one answer on its slip, and the ticket is read back to you with its why. The block refuses the category's quiz card: a question, four radio rows, a green or red banner and a Next button.

OWN-WORLD:
- **Paper:** one bond-paper ticket under the heat lamp while it waits for an answer, its dotted head line carrying the lesson and the family, its dotted foot line carrying the seed and `unseen`.
- **Numbers:** every figure of the scenario is a dot-matrix readout with its tag (synthetic) beside it; the learner's own number is printed the same way, untagged.
- **Answer:** a tape-labelled slip with the unit stuck beside it, or ruled lines with a tick box each.
- **Confidence:** three stamped steel plates, the chosen one pressed in, never amber and never coloured.
- **Verdict:** ribbon black with a drawn tick, or ribbon red with a drawn strike. Never the board green or red.
- **Why:** printed below the perforation, in steps, as the printer feeds.

STORY: The learner understands that these are their own numbers on a seed drawn the moment they started, so the answer cannot be looked up, and that "guess" is an honest thing to tap. They read why in the ticket's own figures, and they leave wanting new numbers rather than the next lesson. They believe the course checks the skill and not the click.

FIRST VIEWPORT: Inside a lesson, the item ticket stands under the lamp at 36rem (full width at 390 px). Top to bottom: the head line (lesson, family), the stamped title, the counter and level on a Doto line, the scenario sentence, the givens as printed lines, the answer slip with its unit, the three confidence plates, the stub "Check the ticket" at the foot, and the foot line with the seed. At 390 px the same order stacks, the plates stay on one row at 44 px, and the stub is the last thing in reach.

FORM: The Pass's order ticket with an answer slip (GAMES.md §2.6: a request is a ticket; the learner is the expediter). Specified surface, so the form was not rolled. seed: none (specified surface, no roll). Signature interaction: pulling the stub feeds the reveal out below the perforation in printer steps and takes the ticket from under the lamp; the stub becomes "Next ticket". Motion grammar: nothing moves until the stub is pulled, then one stepped feed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The reveal. A learner who wrote 380 sees the ticket print "Right" and then, line by line, the two steps that make 380 from the figures they were given.

## Unresolved

- **Title:** the stamped title reads "Items" for now, as the placeholder did. W1-T05 (Today) may want a different head line for an item served outside a lesson.
- **Claims in a prompt:** the sample family is synthetic, so a prompt part that cites a claim (a sourced number as a chip) waits for the first family that needs one (W1-T14).
- **Stamps in sentences:** a number prints its tag where it comes onto the ticket (the givens, the worked example, the key). A sentence of the reveal that restates a synthetic number does not stamp it again on screen, and the stamp stays for assistive tech. The finish review may overrule this against DESIGN.md's rule that a number carries its provenance beside it.
- **Unit on the slip:** the unit is printed under the slip as a hint, not on its tape, because the marker face has no micro sign.
- **Worked example:** level 0 shows a whole solution with other numbers above the slip. At 390 px that is a long ticket, and a fold behind a disclosure may serve it better.
