/*
 * Loaded once for each `bun test` process (bunfig.toml, `[test] preload`). tempDir (tests/content/support.ts) records each scratch
 * project here, and the afterAll below removes them when the run ends. The hook has to be here: an afterAll in support.ts was run only
 * for the first file that imported the module, so the folders of every other file were left in the temporary folder [measured
 * 2026-11-19: 34 folders left by shard 1 of 4]. A hook registered by the preload runs once, after every file of the process, and a
 * process 'exit' listener does not run under `bun test` at all.
 */
import { afterAll } from 'bun:test'
import { rmSync } from 'node:fs'

/** The scratch projects of this process: tempDir adds to it, and the hook below removes each. */
export const tempDirs = new Set<string>()

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})
