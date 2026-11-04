---
version: 1
slug: "src-pages-map-tsx"
primary_target: "src/pages/Map.tsx"
related_targets: ["src/map","src/progress","src/pages/Module.tsx"]
---

# Course map

## Scope

- **Surface:** the course map (`/map`), which the front page's menu opens out into, in Operate mode. Its related targets are the module pages' loop and progress sections and the progress model they read.
- **Visitor:** a learner who has played the front page's service, or comes back with evidence on this device, and wants to know which module to open next, what it leans on in kernelspace and whether it needs a GPU.
- **Action:** open a module.
- **Proof:** every fact is the course's own: hours [estimated], lanes, kernelspace lessons, artifacts. The evidence line is counted from the learner's ledger when the page draws, and nothing about it is stored.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - 320 px with no sideways scroll, keyboard, reduced motion;
  - prerequisites advise and never lock, so every ticket opens;
  - an accessible ordered list sits behind the drawing.

## Direction contract

THESIS: The course is the night's order rail: one ticket per module, hung in the order a learner meets them, so the map is a rail with a lamp over the next ticket. The page refuses the roadmap with progress rings, the grid of same-size cards and the chart of lane bars.

OWN-WORLD:
- **Ground and rail:** brushed stainless, with the rail's polished rod and spring clips; each row of tickets hangs from its own stretch of rod.
- **Tickets:** white bond paper, dot-matrix print with the red second ink; lanes are masking tape and marker, never a code colour.
- **Evidence:** printed pips, an open ring until a knowledge component is practised, a solid dot once it is earned, always beside the count in words.
- **Active state:** heat-lamp amber over the next ticket only.

STORY: The learner sees the whole course at once, how much of it needs a GPU, and what each module leans on in kernelspace. They find the next ticket by the lamp, believe that nothing is locked, and open it.

FIRST VIEWPORT:
- The stamped heading "Course map" with a short lede at the left, and the printer's tape at the right (hours by lane, knowledge components earned, the next ticket).
- Under them the first rail runs the full width with four tickets hung from it, the next ticket under the lamp, and each ticket's stub is its link.
- On a phone the tape comes first and the tickets hang one to a row from the same rod.

FORM:
- **Chosen form:** the menu, which GAMES.md §2.6 names as the course map, set out on the pass's ticket rail: Rail, Ticket, Stub, TapeLabel and PrinterTape from src/design/components. It is the specified surface, with no concept roll.
- seed: none (specified surface, no roll)
- **Signature move:** the lamp follows the learner's evidence: it hangs over the first open module that is not yet earned.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The first visit with an empty ledger: three rails of open pips, and one lamp over TR1. After a first earned knowledge component the pip fills, and the lamp stays where the course should go on.

## Unresolved

- **Module completion:** ASSESSMENT.md §9's "browser-complete" and "complete" need exit-ticket events and Prove-it events, which no W1 task has written yet. This surface counts knowledge components (practised, earned, kept) and says what it counts.
- **Planned modules:** TR0, TR3, TR4, TR5b, TR7 and the capstone have a ticket from the first day, marked planned, with the prerequisites and artifacts that their curriculum files give.
