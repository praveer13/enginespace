# Room on `/today`: what the page holds, and what a family and a game cost it

Every figure is gzip bytes, one file at a time, as `bun scripts/verify.ts bundle` counts them. Measured 2026-11-22 at f6386fdf (wave-2m2 tip), a build of the unchanged tree, then builds with throwaway additions. Tags: [measured] unless a line says otherwise.

## What `/today` holds (before this task)

The row is 195,740 B against a gate of 200,000 B: 4,260 B of room. The page's closure, grouped:

| Part | gzip bytes | Note |
|---|---|---|
| React and its stores (`react-vendor`) | 62,228 | every page |
| The entry chunk | 38,293 | every page |
| The compiled course map (`refs`) | 20,064 | |
| Stylesheets (index, Today, Frame, content, panels) | 24,3xx | the row counts CSS |
| The ledger hook (`useEvidence`) | 14,016 | |
| The Today page's own file | 5,066 | |
| `useLocalDay`, `Attempt`, `next`, `model`, `Frame` | 14,0xx | |
| The item families' faces (`catalog`) | 3,138 | 33 families at the time of the build |
| Six game entries (`entry-*`) and the registry | 6,138 | title, subtitle, keys, claims, levels and loader of each game |
| The rest (ten small shared chunks) | about 6,500 | |

The six game entries are read by `/today` for three things only: a game's knowledge components (`src/progress/sources.ts`, `src/items/today/kcs.ts`), its home module and a level's title (`src/progress/useProgress.ts`). Their subtitles, keys, claims, card ids and loaders are carried for nothing.

## The measured cost of one family and of one game on `/today`

Throwaway additions to a build of the unchanged tree, not committed:

| Addition | `/today` | Cost |
|---|---|---|
| one family's catalog row (a title, 3 variants, 4 KC ids) | 195,859 | 119 B |
| four such rows | 196,152 | 103 B each |
| one registered game (7 levels, 18 claims, 2 keys, 2 KCs) | 196,567 | 827 B |

`/receipts` moved by at most 6 B and the front page by at most 24 B for these additions.

## The target

(119 B x 19 families) + (827 B x 2 games) + 400 B = 4,315 B, for the wave's 19 families [estimated: 8 for TR3, 5 for TR0, 6 for TR5b] and two games. `/today` had 4,260 B: less than the target. The page needs a lean rows export.
