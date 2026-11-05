---
version: 1
slug: "src-pages-today-tsx"
primary_target: "src/pages/Today.tsx"
related_targets: ["src/items/today"]
---

# Today

## Scope

- **Surface:** `/today` (A§3.1: "Keep: spaced review of the KCs earned so far"), in Operate mode. A whole surface inside the established world, specified by A§3.1, ASSESSMENT §8 and D-037, so there is no concept roll.
- **Visitor:** a kernelspace graduate on a phone, with ten minutes at the start of the day, who earned some ideas in a lesson or a game earlier in the week.
- **Task:** see which of the ideas they earned are worth keeping today, work through them one ticket at a time on fresh numbers, say how sure they are, read why, and know when each idea comes back.
- **Proof:** every ticket is a new draw (its seed is on the foot line), graded on the page and written to the ledger as a `review` with the FSRS grade. Nothing about the schedule is stored: the due list is read back from the ledger each time the page draws.
- **Constraints:**
  - the PRODUCT.md and DESIGN.md constraints (one lamp, only code, dots for numbers, no dark scheme);
  - phone-first: 360 px, one column, controls at 44 px, no sideways scroll, every action by keyboard;
  - a session holds 10-12 nominal minutes [estimated] and nothing is timed;
  - the page never says how much is overdue and never locks anything: a learner can always review ahead.

## Direction contract

THESIS: Today is the prep list pinned up at the start of a shift. Each line is an idea the learner has earned and is about to lose: they prep it on a fresh ticket, tick it off, and the list prints the day it will be needed again. The page refuses the flashcard app's backlog badge, the streak flame and the card flip.

OWN-WORLD:
- **The list:** one bond-paper strip ruled in dots, a drawn tick box on every line, the idea's id on masking tape. On a phone, once the prep starts, it folds to a row of boxes under "about 6 min left" in the dot matrix.
- **The work:** the same order ticket as a lesson's items, with an answer slip and three stamped plates for how sure.
- **Numbers:** the minutes left and every count in the dot matrix, each with its tag.
- **After an answer:** the box takes a tick drawn in ribbon black, or a strike in the second ink for a miss, and the line prints the day the idea comes back.
- **The close:** the printer prints the prep's counts beside the ticket, as it prints the night's tape.
- **The one lamp:** amber falls on the ticket the next decision acts on: the list until the prep starts, then the ticket being prepped. The finished list is history and takes none.

STORY: The learner understands that these are ideas they earned, not tasks piling up, that every ticket is new numbers so recall cannot be faked, and that a miss is not a debt: it comes back sooner. They believe the schedule because every line prints its return day. They start, finish in about ten minutes, and read on the last ticket when the list will be pinned up again, with no count of what they did not do.

FIRST VIEWPORT:
- **At 390 px:** under the board, the stamped title "Today" and one lead sentence; then the prep list as one ticket, its day on the head line and four to eight ruled lines (a tick box, the item's title, the idea on tape); the foot line says about how long it takes, tagged estimated; the stub "Start the prep" closes the ticket, inside thumb reach, and the lamp falls on it. Once the prep starts the lead goes, and the strip and the first ticket take the screen.
- **At 1440 px:** two columns under the title. The list on the left at 24rem, its lines printing their tick and return day as the prep goes, and the ticket being prepped on the right at 36rem. Before the prep, a blank ticket stands where the first will print.
- **The primary action** is the stub. The ticket that follows it takes focus.

FORM: The Pass's prep list: a ticket of ruled lines with tick boxes, and the order ticket with an answer slip for the line being prepped (GAMES.md §2.6: a request is a ticket and the learner is the expediter; A§3.1: `/today` is Keep). Specified surface, so the form was not rolled. seed: none (specified surface, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The tick. Pull the stub on the last ticket: the box on the list takes its drawn tick, the line prints "back Thu 6 Nov", and the done ticket says what was kept and when the list is pinned up again.

## Unresolved

- **Idea names:** a line names the idea by its id and its family's title. The compiled map (W1-T06) now carries each KC's description, so a line can say what the learner can do once the page reads the map. It does not carry the confusable set (that is in `content/kc/graph.yaml`), so the session can interleave only inside a set it is handed, and the page hands it none. The interleave is built and tested.
- **Predictions:** a prediction may reschedule an earned idea (ASSESSMENT §4.7), but its KCs come from the compiled lessons, so the page does not read them yet.
- **Past the due ones:** "Review ahead" serves the ideas nearest to fading once the due ones are done. Whether a longer "keep going" set deserves its own control waits for more families.
