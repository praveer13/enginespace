---
version: 1
slug: "src-pages-map-tsx"
primary_target: "src/pages/Map.tsx"
related_targets: ["src/map","src/progress","src/pages/Module.tsx"]
---

# Course (`/map`)

## Scope

- **Surface:** Course, the course map, in Operate mode (REDESIGN §3.2). Its related targets are the module pages and the progress model they read.
- **Visitor:** a learner deciding what to open next, first time or returning, who wants to know where they are, what each module needs (browser, laptop or GPU) and how long it takes.
- **Action:** Continue to the lesson `nextStep` names, or open any module: nothing is locked, and prerequisites advise.
- **Proof:** every fact is the course's own: hours [estimated] with totals [derived], lanes, kernelspace lessons it builds on, and the learner's states counted from their own ledger on this device.
- **Constraints:** the PRODUCT.md constraints; 320 px with no sideways scroll; keyboard; reduced motion; an ordered list a screen reader walks.

## Direction contract

THESIS: The course drawn as one track: a vertical line with a node per module in course order, the module the learner is in open with its lessons, and one way on above it all. It refuses the roadmap of progress rings and the grid of same-size cards.

OWN-WORLD: Data Book (REDESIGN §2.8): flat paper cut square with one soft sheet shadow and no texture; ink text in Atkinson Hyperlegible, titles in Big Shoulders Display 800 in sentence case; every number the learner compares in the tabular mono face with its tag; one amber marker that means "now", only on the control to act on now, a diagram's now cursor and the current position in a rail or on the course track; the code colours only where the model's state is drawn.

STORY: The learner sees where they are and what comes next in one sentence and one amber Continue; the track tells them what each module needs and what they will be able to do, so the course reads as a path and not a menu.

FIRST VIEWPORT: At 1440 the h1 "Course", the next-step block (the amber position mark, the sentence "You have not started. Next: TR1 lesson 1 ..." or "Last time ... Next ...", and the amber Continue or Start at its right), the hours line and the legend of states, then the track with TR1 open and its next lesson marked. At 390 the next-step block comes first with its button full width, and the track's line and nodes sit in the left 24 px.

FORM: Data Book's course track (REDESIGN §3.2). seed: none (a specified surface inside the established world, which the owner confirmed at the look gate; no roll)

FINISH: unreviewed and undocumented is unfinished; this surface ends with wave R's finish review (R-T50), its material fixes, and DESIGN.md written from the built world

## Memorable moment

A returning learner lands on the sentence that says where they left off, the amber Continue beside it, and the open module's next lesson under the amber mark: one look, one press.

## Unresolved

- An unpublished module's title is underlined like a link though it is not one (the finish review's fidelity table).
- "n reviews due" beside Continue needs the review deck in this route's closure (the R-T24 follow-up).

## The Pass's contract, superseded

Until wave R this surface was specified in The Pass (D-047), the kitchen world. D-062 replaced it with Data Book, which the owner confirmed at the look gate on 2026-11-16, and stage 4 took the kitchen's files out of the tree. The superseded contract and its adaptations are in this file's git history; none of it applies to the built surface.
