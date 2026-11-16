# Receipt fixtures

The owner's real receipts, from the GPU smoke runs of W2-T12 (`enginespace selftest --gpu`, and one lab for each environment, on a 4090 and an H100). This folder is empty until
then. Until then the receipt fixtures are the synthetic ones that `tests/verify/synthetic.ts` makes from the simulator, and each of them says so.

## What a fixture is

A bundle, `<stage>-<gpu>.es.json.gz`, as `enginespace grade` wrote it, and an entry for it in `manifest.json`:

```json
{
  "schema": "enginespace/receipt-fixtures@1",
  "fixtures": [
    { "file": "tr8-replay-s2-rtx4090.es.json.gz", "sha256": "<64 hex digits: the SHA-256 of the file's bytes>", "dated": "YYYY-MM-DD", "stage": "tr8.replay.s2", "gpu": "<the name NVML reported>" }
  ]
}
```

The file is pinned by its SHA-256 and dated, and a fixture is never edited: a bundle that changed is another fixture. The bundle holds no host name, user name, address, path, UUID
or serial number: the grader never collects them (A§9.5), and `tests/docs/publication.test.ts` sweeps this folder as it does the rest of the tree.

## What the tests do with them

`tests/verify/fixtures.test.ts` reads the manifest, checks each file against its hash, and runs the browser's rules on it in the context a learner's browser would have: the grader
build of the receipt published, its challenge in the ledger, the pins of `course.lock.json`, the real hardware atlas and the stage's declared workload. Then:

1. Each fixture passes browser verification: every rule, and the verdict of its stage (W2-T12, acceptance 1).
2. The forgeries of `tests/verify/bestiary.ts` are made from it, and each fails the check it is named for with the bound printed (W2-T12, acceptance 2).

A fixture whose stage the site has no declaration for fails the first of these, with the reason: the lab of that stage declares its workload in `src/receipts/declared.ts` when it lands.
