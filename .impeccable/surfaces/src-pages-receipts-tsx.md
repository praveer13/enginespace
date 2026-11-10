---
version: 1
slug: "src-pages-receipts-tsx"
primary_target: "src/pages/Receipts.tsx"
related_targets: ["src/receipts"]
---

# Receipts

## Scope

- **Surface:** `/receipts` (A§3.1, A§8.4), in Operate mode. A whole surface inside the established world, specified by A§3.1, A§8.4, A§9.6 and ASSESSMENT §5, so there is no concept roll.
- **Visitor:** a kernelspace graduate on a laptop, about to run a lab on their own GPU or a rented one, who needs a token to take there and, later, to find the receipt that came back.
- **Task:** choose a lab and a stage; get a challenge; copy its token, or the command that takes it, to the machine that will run it; see which challenges are still open, which a receipt used and which expired; open a receipt and read what the grader reported.
- **Proof:** the token is the shared codec's (packages/schema), so the grader reads it as the page wrote it, and the challenge is one `challenge` event in the ledger. Nothing is asked of the network and nothing leaves the tab. A receipt is read from the ledger through its own schema and printed as text.
- **Constraints:**
  - the PRODUCT.md and DESIGN.md constraints (one lamp, only code, dots for numbers, no dark scheme);
  - phone-first at 360 px: one column, no sideways scroll at 320 px, every action by keyboard, targets of 24 px at least;
  - the importer is W2-T07's, so the page says in the ribbon's red where it will stand and that it is not built;
  - a number is a readout with its tag, and a figure on a receipt carries `unverified` until the browser has recomputed it.

## Direction contract

THESIS: Receipts is the order window: a chit goes out, and a slip comes back. The learner takes a numbered chit for a stage, carries it to the machine that cooks, and later reads the slip that returns against the chit they sent. The page refuses the licence-key generator's grey box with a copy icon, and the certificate gallery.

OWN-WORLD:
- **The deck:** two slips, masking tape over bond paper, each the platform's own select (a lab, then its stages), and one deep-steel plate that asks for a chit. A choice that is missing is said at the plate, and focus goes to the slip to fix.
- **The chit:** a ticket under the lamp. The stage's name is stamped over its id and its life in dots; the token is printed in the dots, breaks at its colons and is selected whole by a click; the grader's command sits in a recessed slip; a plate copies the command and the stub copies the token.
- **The held challenges:** ruled lines on a ticket. The state is a word on masking tape, open, used or expired, and never a board colour; a lapsed day is in the ribbon's red; an open line carries its own copy.
- **A receipt:** one long ticket, stamped once in the red as the grader's own report, with the figures in the dot matrix and their tags kept for a reader. Its lists are tables that print each row as a block on narrow paper.
- **The tape:** the printer counts the challenges by state and the receipts held. It stands beside the panels from 64rem, and at the foot of the page on a phone, where the task comes first.
- **The one lamp:** amber falls on the chit that has just been printed, the place the next decision acts on. Nothing else on the page is lit.

STORY: The learner trusts the token because they can see what it is: one use, a life of days, seeds drawn from it that cannot be prepared ahead. They take it, run the stage, and come back to find the challenge used and the receipt held. They read what the grader said, and see plainly that this browser has not yet checked it.

FIRST VIEWPORT:
- **At 1440 px:** two columns under the page's plate. Left, 44rem: the lead, the deck with its two slips and the plate, then the lists. Right, 20rem: the printer's tape.
- **At 390 px:** one column: the lead, the deck with its slips stacked and the plate under them, the chit as it prints, then the lists, and the tape at the foot (it counts what the lists say, and its arrival after the ledger opens moves nothing that was read).
- **The primary action** is the plate that asks for a chit; the chit's stub copies the token.

FORM: The Pass, as DESIGN.md specifies it: stainless for the controls, bond paper for what is read, masking tape for names and states, the printer's dots for every number, ribbon red for what must be seen. Specified surface, so the form was not rolled. seed: none (specified surface, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The chit. Choose a lab and a stage, press the plate, and a ticket prints under the lamp with the token in the dots. Pull the stub to copy it, and the line of the list under it already says open.

## Unresolved

- **The importer:** a panel for the grader's bundle (a drop slip and a file picker), the worker that checks it, and the report that fills "How this browser checked it" are W2-T07's and W2-T08's. Until they land the page says so and prints each figure as unverified.
- **A lab's own page:** it will offer its challenge too (LAB_HOLDS), and may link here with `?stage=` to open this page on its stage.
- **A challenge for a stage that already has an open one:** the page issues another and lists both. Whether it should say so first waits for a learner to be confused by it.
