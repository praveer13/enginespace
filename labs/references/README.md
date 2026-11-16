# The references manifest

`manifest.json` is the list of the large files that the local grader downloads, and the pin for each of them: a model's weights, a slice of a dataset, a prompt set, and the references that the owner makes (the TR0 argmax bank, the teacher-forcing continuations, the owner's traces). `enginespace fetch <lab>` downloads the files that list a lab into the learner's cache, and keeps a file only when its bytes hash to the SHA-256 written here (ARCHITECTURE §9.7, D-026). A receipt records the same name, kind, revision, hash and size for each file the run used, so a run on another model, dataset or prompt set shows.

The files themselves are in GitHub Release assets, on Hugging Face at a pinned revision, or on the site, and never in git. The manifest is `enginespace/references@1`: the zod schema in `packages/schema/references.ts` is its one definition, `schemas/references.schema.json` is the export that the grader validates with, and `tests/fixtures/references/cases.json` holds the good and bad manifests that the TypeScript and the Python suites both have to judge alike.

The manifest has no entry yet. A lab's files join it with the lab: TR0's model with its lab (W2-T16), the argmax bank with W2-T17, and the owner's traces with W2-T21.

## An entry

| Field | Holds |
|---|---|
| `name` | what a receipt calls the input; shown to the learner; one line, at most 128 characters [estimated]; unique in the manifest |
| `kind` | `model`, `dataset`, `prompts` or `reference`, as a receipt's `inputs` list them |
| `labs` | the labs that use the file, such as `tr0.forward`: `enginespace fetch tr0.forward` downloads every entry that lists it |
| `path` | where the file goes in the cache: letters, digits, dots, hyphens and underscores, parts joined by `/`, no `..`, no leading `/`, no part that starts or ends with a dot, unique when case is ignored, and never a folder that another path is inside |
| `url` | where it comes from: `https`, with a lower-case host and no user name, password or fragment. The schema also takes `http` to `127.0.0.1`, `localhost` or `[::1]`, which the grader's tests use, and no committed entry does |
| `sha256`, `bytes` | the SHA-256 of the file's bytes, as 64 lower-case hex digits, and its size in bytes |
| `licence` | the licence the file's content is under, as its source states it |
| `date` | the day the hash and the licence were checked against the source, `YYYY-MM-DD` |
| `revision` | optional: the pinned revision, a Hugging Face commit or a release tag |
| `notes` | optional: where the hash came from, and anything a learner should know |

## Adding a file

1. Publish the file at a URL that will not change its bytes: a release asset, or a Hugging Face file at a commit and not at `main`.
2. Take its size and hash from the bytes that you downloaded from that URL, or from the source's own listing of them, and say which in `notes`: `sha256sum <file>` and `wc -c < <file>`.
3. Write the entry with today's date, and the licence as the source states it. A fact you cannot source is not written.
4. Check it: `bun test tests/schema/references.test.ts` and `uv run --project labs/grader python -m unittest labs.grader.tests.test_fetch` from the root of the repository. The grader checks the whole manifest again before it downloads anything.

A file that was published again with other bytes is a new entry or a new revision, never a hash edited to fit: `enginespace fetch` deletes what does not match, and a receipt names the hash that it used.
