---
version: 1
slug: "src-pages-today-tsx"
primary_target: "src/pages/Today.tsx"
related_targets: ["src/items/today"]
---

# Review (`/today`)

## Scope

- **Surface:** Review (`/today`), spaced review of the ideas a learner has passed, in Operate mode (REDESIGN §3.10; A§3.1, ASSESSMENT §8 and D-037 specify it).
- **Visitor:** a learner on a phone, with ten minutes at the start of the day, who passed some ideas in a lesson or a game earlier in the week.
- **Task:** see which ideas are due, answer one question on fresh numbers for each, say how sure they are, read why, and know when each idea comes back.
- **Proof:** every question is a new draw (its seed is on the foot line), graded on the page and written to the ledger as a `review` with the FSRS grade. Nothing about the schedule is stored: the due list is read back from the ledger each time the page draws.
- **Constraints:**
  - the PRODUCT.md and DESIGN.md constraints;
  - phone-first: 360 px, one column, controls at 44 px, no sideways scroll, every action by keyboard;
  - a session holds 10-12 nominal minutes [estimated] and nothing is timed;
  - the page never says how much is overdue and never locks anything: a learner can always review ahead.

## Direction contract

THESIS: Review is one sheet of questions with the way on beside it. Each row is an idea the learner passed and is about to lose, named by its own sentence from the course map; a question on new numbers keeps it, and the row says the day it comes back. It refuses the flashcard app's backlog badge, the streak flame and the card flip.

OWN-WORLD: Data Book (REDESIGN §2.8): flat paper cut square with one soft sheet shadow and no texture; ink text in Atkinson Hyperlegible, titles in Big Shoulders Display 800 in sentence case; counts and dates in the tabular mono face, a tag as a dotted underline; each question's state a word (now, next, right, missed), never a colour alone; one amber marker that means "now", only on the control to act on now.

STORY: The learner understands that these are ideas they passed, not tasks piling up, that every question is new numbers so recall cannot be faked, and that a miss is not a debt: it comes back sooner. They believe the schedule because every done row says its return day. They start, finish in about ten minutes, and read on the last question when the next review is, with no count of what they did not do.

FIRST VIEWPORT:
- **At 390 px:** the h1 "Review", then one sheet: its head "2 questions today, about 2 min" with the amber Start review in it, a row per idea (its sentence, its module code, when it was last seen). In a session the set folds to a strip of boxes over the question, and Check answer is the foot bar (from 600 px of height only).
- **At 1440 px:** the sheet at reading width with a quiet column beside it ("Next after this", the count of ideas passed and its legend). In a session the set's questions stand at the right, each state a word.
- **The primary action** is Start review, or, when nothing is due, the Continue that `nextStep` gives, with Review ahead quiet beside it.

FORM: Data Book's question sheet, the same question frame as a lesson's Test (REDESIGN §3.10). seed: none (a specified surface inside the established world, which the owner confirmed at the look gate; no roll)

FINISH: unreviewed and undocumented is unfinished; this surface ends with wave R's finish review (R-T50), its material fixes, and DESIGN.md written from the built world

## Memorable moment

The done sheet: "5 of 6 right.", the day of the next review, one amber Continue, and under it what became of each idea and when it comes back.

## Unresolved

- **Idea names:** a row names the idea by its sentence from the compiled map. The confusable sets are in `content/kc/graph.yaml` and the page hands the session none, so it interleaves only inside a set it is given. The interleave is built and tested.
- **Predictions:** a prediction may reschedule a passed idea (ASSESSMENT §4.7), but its ideas come from the compiled lessons, so the page does not read them yet.
- **Past the due ones:** Review ahead serves the ideas nearest to fading once the due ones are done. Whether a longer set deserves its own control waits for more question families.

## The Pass's contract, superseded

Until wave R this surface was specified in The Pass (D-047), the kitchen world: a prep list pinned up at the start of a shift. D-062 replaced it with Data Book, which the owner confirmed at the look gate on 2026-11-16, and stage 4 took the kitchen's files out of the tree. The superseded contract is in this file's git history; none of it applies to the built surface.
