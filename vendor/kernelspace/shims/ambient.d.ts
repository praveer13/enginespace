/*
 * Ambient shim for src/lib/rng.ts, whose `freshSeed()` calls `crypto.getRandomValues`.
 *
 * A program compiled with `lib: ["ES2022"]` and `types: []` (tsconfig.pure.json, which covers packages/sim) has no
 * `crypto`, so rng.ts does not type-check there without this declaration. Include it in that program and nowhere else:
 * a program with the DOM lib or Node's types already declares `crypto`, and a second declaration would clash.
 * `freshSeed()` itself is for the main thread at grade time (ARCHITECTURE I3), and packages/sim never calls it.
 */
declare const crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T }
