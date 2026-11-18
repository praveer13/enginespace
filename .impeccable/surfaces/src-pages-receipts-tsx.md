---
version: 1
slug: "src-pages-receipts-tsx"
primary_target: "src/pages/Receipts.tsx"
related_targets: ["src/receipts"]
---

# GPU lab results (`/receipts`)

## Scope

- **Surface:** GPU lab results (`/receipts`; A§3.1, A§8.4, A§9.6 and ASSESSMENT §5 specify it), in Operate mode. It is linked from Progress and from each lab page whose stages run off the browser, and not from the header.
- **Visitor:** a learner on a laptop, about to run a lab on their own GPU or a rented one, who needs a token to take there and, later, to find the result that came back.
- **Task:** choose a lab and a stage; get a challenge; copy its token, or the command that takes it, to the machine that will run it; see which challenges are still open, which a result used and which expired; open a result and read what the grader reported.
- **Proof:** the token is the shared codec's (packages/schema), so the grader reads it as the page wrote it, and the challenge is one `challenge` event in the ledger. Nothing is asked of the network and nothing leaves the tab. A result is read from the ledger through its own schema and printed as text. "Receipt" stays only as the name of the grader's file.
- **Constraints:**
  - the PRODUCT.md and DESIGN.md constraints;
  - phone-first at 360 px: one column, no sideways scroll at 320 px, every action by keyboard, targets of 24 px at least;
  - the importer is W2-T07's: the last panel takes a result back, and what comes of a file is printed with the rules it was checked by;
  - a number is a readout with its tag, and a figure in a result is unverified until the browser has recomputed it.

## Direction contract

THESIS: A challenge goes out and a result comes back. The learner asks for a one-use token for a stage, carries it to the machine that runs the stage, and later reads the result that returns against the challenge they sent. The page refuses the licence-key generator's grey box with a copy icon, and the certificate gallery.

OWN-WORLD: Data Book (REDESIGN §2.8): flat paper cut square with one soft sheet shadow and no texture; ink text in Atkinson Hyperlegible, titles in Big Shoulders Display 800 in sentence case; the token, the seeds and every count in the tabular mono face; a challenge's state a word (open, used, expired), never a colour alone; the second ink only for what must be seen (a lapsed day, not counted); one amber marker that means "now", on the control to act on now.

STORY: The learner trusts the token because they can see what it is: one use, a life of days, seeds drawn from it that cannot be prepared ahead. They take it, run the stage, and come back to find the challenge used and the result held. They read what the grader said, and see plainly that this browser has not yet checked it.

FIRST VIEWPORT:
- **At 1440 px:** the h1 and the lead, the two selects (a lab, then its stages) and the button that asks for a challenge, then the lists; the counts by state stand beside the panels from 64rem.
- **At 390 px:** one column: the lead, the selects stacked with the button under them, the challenge as it is issued, then the lists, and the counts at the foot.
- **The primary action** asks for a challenge; the issued challenge offers Copy for the token and for the grader's command.

FORM: Data Book's sheets and tables (REDESIGN §2.8). seed: none (a specified surface inside the established world, which the owner confirmed at the look gate; no roll)

FINISH: unreviewed and undocumented is unfinished; this surface ends with wave R's finish review (R-T50), its material fixes, and DESIGN.md written from the built world

## Memorable moment

The challenge. Choose a lab and a stage, press the button, and the token is on the page, whole and selectable, with the command that takes it; the list under it already says open.

## Unresolved

- **The rest of the verdict:** the slip, the worker and the report of rules 1 to 6 are W2-T07's. Rules 7 to 10 (the re-checks, the recomputation, the floors and the verdict) are W2-T08's, and until they land every result is held as not counted, and each figure in a result is printed as unverified.
- **A challenge for a stage that already has an open one:** the page issues another and lists both. Whether it should say so first waits for a learner to be confused by it.
- **Result tables:** a result's tables still tag each figure; one stamp per table (the Quiet Provenance Rule) is a later receipts pass.

## The Pass's contract, superseded

Until wave R this surface was specified in The Pass (D-047), the kitchen world: an order window with chits and slips. D-062 replaced it with Data Book, which the owner confirmed at the look gate on 2026-11-16, and stage 4 took the kitchen's files out of the tree. The superseded contract is in this file's git history; none of it applies to the built surface.
