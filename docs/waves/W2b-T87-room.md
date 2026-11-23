# Room on `/today`: what the page holds, and what a family and a game cost it

Every figure is gzip bytes, one file at a time, as `bun scripts/verify.ts bundle` counts them. Measured 2026-11-22 at f6386fdf (the wave's tip) [measured], on a build of the unchanged tree and then on builds with throwaway additions, none committed.

## What `/today` holds before this task

The row was 195,740 B against a gate of 200,000 B: 4,260 B of room. Its closure:

| Part | gzip bytes |
|---|---|
| React and its stores (`react-vendor`) | 62,228 |
| The entry chunk (`index`) | 38,293 |
| The compiled course map (`refs`) | 20,064 |
| Stylesheets (index, Today, Frame, content, panels) | 24,262 |
| The ledger hook (`useEvidence`) | 14,016 |
| The Today page's own file | 5,066 |
| The item families' faces (`catalog`, 33 families' worth of rows) | 3,138 |
| Six game entries (title, subtitle, keys, claims, levels with seeds, loader of each game) | 5,827 |
| The registry that lists them | 311 |
| The other shared chunks (hooks, the item attempt, the scheduler, the frame, small parts) | 22,535 |
| Total | 195,740 |

`/today` reads a game for three things: the KCs it exercises (`src/progress/sources.ts`, `src/items/today/kcs.ts`), its home module, and a level's title with the game's title (`src/progress/useProgress.ts`, for "Last time"). The six entries carried subtitles, keys, claims, card ids, level seeds and loaders for nothing.

## What one family and one game cost it

| Addition (before this task) | `/today` | Cost |
|---|---|---|
| one family's catalog row (a title, three variants, four KC ids) | 195,859 | 119 B |
| four such rows | 196,152 | 103 B each |
| one registered game (seven levels, 18 claims, two keys, two KCs) | 196,567 | 827 B |

The target is (119 B x 19 families) + (827 B x 2 games) + 400 B = 4,315 B for the wave's 19 families [estimated: 8 for TR3, 5 for TR0, 6 for TR5b] and two games. `/today` had 4,260 B. It did not hold the wave.

## The change

`packages/play/rows.ts` holds one lean row for each game: id, modules, title, KCs, levels (id, title, graded) and the Prove level. Today, the progress code, the Evidence page, the Games index, a module page's game line and About read rows and no longer import `GAMES`, so their closures carry none of the entries. The entries and the registry are unchanged and are read by a game's own page and by the pages that need a game's keys or claims.

A row repeats fields of its entry, as the roster does, and `tests/play/registry.test.ts` holds each row to its entry. Two arrangements that avoid the repeat were built and measured, and both failed ROWS's stop rule:

- A row in a module of each game that the entry imports (single source): 175 to 190 B on each game's route and 271 B on the front page, because the build cuts a chunk of each row wherever two pages import it.
- All the rows in one module that the entries import: 1,380 B on each game's route, because a game's page then carries every game's row.

## After

| Row | Before | After | Change |
|---|---|---|---|
| `/today` | 195,740 | 190,891 | -4,849 |
| `/map` | 179,759 | 174,921 | -4,838 |
| `/evidence` | 185,591 | 180,755 | -4,836 |
| `/play` | 166,626 | 161,793 | -4,833 |
| `/m/:module` | 185,075 | 180,223 | -4,852 |
| `/about` | 137,773 | 132,940 | -4,833 |
| `/receipts` | 197,556 | 197,541 | -15 |
| front page, first paint | 148,871 | 148,536 | -335 |
| `/play/broken-bench` | 195,353 | 195,361 | +8 |

The cost of one game on `/today` is now 98 B (a throwaway seven-level row, measured on this tree); one family is still 103 to 119 B. The target is (119 x 19) + (98 x 2) + 400 = 2,857 B. `/today` has 9,109 B of room: the target is covered with 6,252 B to spare, and 2a's 13 families and one game take 1,645 B of it [derived].
