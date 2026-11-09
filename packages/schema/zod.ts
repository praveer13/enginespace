/*
 * zod, as every schema of the site is built with it: without the parser that zod compiles at run time (`jitless`).
 *
 * zod 4 asks once whether `new Function('')` works, when it builds the first object schema, to choose between a parser it compiles and
 * one it walks. The policy of ARCHITECTURE §12 has no 'unsafe-eval', so in the browser the question is itself refused, and the browser
 * reports one violation on every page that loads a schema (the W0 exit review's §7.1, e2e/support/site.ts). Told to walk from the start,
 * zod never asks, and parses the same inputs to the same results. Every schema module of packages/schema and packages/ledger imports zod
 * from here, so the switch is set before the first schema is built (D-059).
 */
import { z } from 'zod'

z.config({ jitless: true })

export { z }
