# content/

The course's words and data. Nothing reads this folder at run time: `scripts/content/` compiles it (ARCHITECTURE §4), and the app reads what the compiler writes.

```sh
bun scripts/content/build.ts   # compile, and write src/content/generated/, public/md/, public/llms.txt and public/claims.json
npm run verify:content         # schemas, ids, links, sizes
npm run verify:claims          # the claims files, derived values, dates and pins
npm run verify:numbers         # every number in prose carries a tag
npm run verify:kc              # the KC graph: a DAG, and a graded reference or a planned task behind every KC
```

`npm run dev` compiles at start and again on every save in this folder, and the browser reloads. A problem is printed as `file:line`, and the dev server shows it on the page. `npm run build` stops when the compile finds an error.

## Layout

| Path | What |
|---|---|
| `course.yaml` | the modules in order, each with its title, hours and lanes |
| `modules/<id>/module.md` | a module: front matter, then an introduction |
| `modules/<id>/lessons/l<number>-<words>.md` | a lesson. The file name is its route (`/m/tr2/l3-async-overlap`) and fixes its id (`tr2.l3`) |
| `claims/**/*.yaml` | dated, sourced facts, each a list of claims |
| `kc/graph.yaml` | the knowledge components (KCs) that lessons and predictions name, with the edges between them (see "The KC graph") |
| `kc/kernelspace.json` | the ids of kernelspace's KCs at the vendored pin, which the `ks:` edges of the graph may name. `scripts/kc/kernelspace.ts` writes and checks it |
| `cards/<id>.md` | the cards that a block or a module's `worlds` names |

A figure's `src` is a path under `public/`, such as `figures/tr2/bubble.svg`.

## A lesson

Front matter, then Markdown with `:::name … :::` directives (ARCHITECTURE §4.2). The schemas in `packages/schema/content.ts` say which keys each takes, and a key they do not know is an error. `tr2/lessons/l0-sample.md` uses every block.

- **Blocks.** Prose, and the seven directives `predict`, `item`, `game`, `trace`, `lab`, `card` and `figure`. A ninth type needs a change to D-016.
- **Prose** is paragraphs, headings (`##` to `####`, one level deeper at a time), lists, tables, code blocks, emphasis, code spans and links to https, to a route of the site or to an anchor. Raw HTML, an HTML entity, an image, a quote, a rule, a hard line break and a task list are errors. Put code, including `Vec<T>`, in backticks.
- **References.** `{{claim:vllm.async-scheduling.default}}` shows a claim as a chip. `{{ks:T5.L7}}` links to a kernelspace lesson.
- **Links out of a block.** A `game` names a game of ARCHITECTURE §6.1, a `lab` names a lab of §9.2, a KC is in `kc/graph.yaml`, a card that lives in a file is in `cards/`, and a figure's file is under `public/`.
- **Minutes.** The compiler adds up the words at a reading speed and what each block takes (`scripts/content/directives.ts`), and warns when `minutes` is further from the sum than a fifth.
- **`rev`** is added by the compiler: a SHA-256 over the authored fields, the blocks and the claims the page cites. It does not change when the Markdown is rewrapped, and it leaves out `status` and `minutes`.

## Numbers

Every number is a claim or carries a tag (ARCHITECTURE §4.4). In prose, a digit run needs one of `[measured]`, `[derived]`, `[estimated]` or `[unverified]` in its sentence, written before the full stop. In a table, a tag in a column's header tags the column. The tag is the word in brackets and nothing else: the source and the date belong in a claim.

A number does not need a tag in code, inside a reference, in an identifier (`H100`, `p99`, `tr2.l3`, `v0.33.0`, `§4.2`), or in an ISO date. Anything else does, including a version without its `v`, a size with its unit (`80GB`) and a year. When a number is a fact about an engine, make it a claim, give it a source with the source's own words, and cite it.

## Claims

A claim has an id of dotted words, a value, a sentence, a tag, a source with a quote and the day it was read, the day it was checked and a TTL in days (ARCHITECTURE §4.4). A synthetic claim, from the course's own invented world, needs no source and says `synthetic: true`. A derived claim carries `derived: {formula, inputs}`, and `verify:claims` recomputes it: the formula is arithmetic (`+ - * /`, parentheses, `ceil`, `floor`, `round`, `min`, `max`, `abs`) over the ids it lists. An old claim is reported as stale and never fails a build.

## The KC graph

`kc/graph.yaml` is a list of knowledge components (ARCHITECTURE §4.5). Its header says what each key means, and `npm run verify:kc` holds it to the rules below. A KC takes an id of the form `<module>.<words>`, a description that begins "You can" and states a skill (a fact about an engine is a claim, so it is not written there), and these edges:

- **`requires`** names the KCs to hold first: ours, or kernelspace's as `ks:t5.kv-capacity`. A prerequisite advises and never locks. The graph over `requires` is a DAG. A `ks:` id must be in `kc/kernelspace.json`, which is read at the commit that `vendor/kernelspace/VENDOR.md` pins. To re-pin, run `bun scripts/kc/kernelspace.ts print > content/kc/kernelspace.json` after vendoring, and `bun scripts/kc/kernelspace.ts check` to compare the file with a checkout of kernelspace (it reads that checkout with `git show` and writes nothing there).
- **`confusable`** names the KCs that get mixed up with this one, which Today interleaves with it. The set is symmetric and has at most three entries [estimated; kernelspace's cap]. Say in a comment what the mix-up is.
- **`threshold: true`** marks a KC that at least four others lean on, directly or through a chain [estimated]. The gate fails on a flag that fewer lean on and warns on a KC that qualifies and is not flagged.

**A KC needs something that can earn it.** A KC is earned by a weight-1.0 event (ASSESSMENT §3.3), and a practice level writes at most practice credit, so `verify:kc` wants a graded reference behind every KC: an item family (the `Gen` of ARCHITECTURE §8.2, read from `packages/play/items/`), a game with a graded level (the `kcs` of its registry entry), or a lab check. Until one exists, the KC carries `planned: W1-T14`, which names the task that will add it and must be a task of `docs/TRACKER.md`. The gate warns once a graded reference has landed and the line is still there. `bun scripts/verify-kc.ts --final` is the wave-exit check: it fails on every `planned` that remains (W1-T38 runs it). An item, a game or a lab check that names no KC, or a KC that the graph lacks, is an error too. Lab checks are not read yet: the task that builds the forge host and the labs adds their source to `scripts/verify-kc.ts`.
