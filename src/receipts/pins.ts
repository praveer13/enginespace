/*
 * The engines the course pins, as rule 6 of ARCHITECTURE §8.5 compares a receipt's engine with them: the entries of `course.lock.json` that name an
 * engine a lab can run, by the lock's key, and by what the lock pins each one by (a release, a commit, or both; nano-vllm has no releases).
 *
 * The lock is the one file the site build and the grader kit share (A§4.4, D-035), and `verify:pins` holds it to its schema, so this file reads
 * it as it is and does not check it again. Only what the rule needs is kept: the notes in the lock are for people and stay out of the worker's way.
 */
import type { LockFile } from '@es/schema/lock'
import type { PinTable } from '@es/verify'
import lock from '../../course.lock.json'

/** The lock's kinds that name something a lab installs and runs: a package on PyPI, or a repository pinned by commit. A profiler or a reading target is neither. */
const ENGINE_KINDS: ReadonlySet<string> = new Set(['pypi', 'git'])

/** The keys of the entries that are engines. A reading target is pinned by commit too (mini-sglang), and no lab runs it. */
const ENGINES: ReadonlySet<string> = new Set(['vllm', 'sglang', 'nano-vllm'])

export const ENGINE_PINS: PinTable = (lock as LockFile).entries
  .filter((entry) => ENGINE_KINDS.has(entry.kind) && ENGINES.has(entry.key))
  .map((entry) => ({
    name: entry.key,
    ...(entry.version === undefined ? {} : { version: entry.version }),
    ...(entry.commit === undefined ? {} : { commit: entry.commit }),
  }))
