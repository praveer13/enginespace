/*
 * A lab's bestiary (ASSESSMENT §4.5, A§8.3): the wrong modules that every host run must fail, and the file that says how. It sits in the
 * lab's crate, `bestiary/bestiary.json`, beside the sources of the members, because it describes them:
 *
 *   id        the member's name, and the name of its fixture (tests/fixtures/forge/<lab>/<id>.wasm)
 *   feature   the cargo feature that builds it
 *   mistake   one sentence, what is wrong with it
 *   fails     the checks that must catch it, each with the status it must end in: `fail`, `trap` or `timeout`
 *   passes    the checks it must pass, so that a mistake is caught by the check that is named for it and by no accident
 *   only      the checks to run (default: all). A member that never returns costs a time limit for every check that reaches its loop
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const status = z.enum(['fail', 'trap', 'timeout'])
const id = z.string().regex(/^[a-z][a-z0-9-]*$/)
// A check's id may hold underscores, as kernelspace's do (`fork_shares`, `adapter_unified_paging`) and as the stages of `hybrid-kv` do.
const checkId = z.string().regex(/^[a-z][a-z0-9_-]*$/)

const memberSchema = z.strictObject({
  id,
  feature: z.string().regex(/^bestiary-[a-z0-9-]+$/),
  mistake: z.string().min(1),
  fails: z.record(checkId, status).refine((fails) => Object.keys(fails).length > 0, 'a bestiary member must fail at least one named check'),
  passes: z.array(checkId),
  only: z.array(checkId).optional(),
})

const bestiarySchema = z.strictObject({ lab: id, members: z.array(memberSchema).min(1) })

export type Member = z.infer<typeof memberSchema>
export type Bestiary = z.infer<typeof bestiarySchema>

/** The bestiary of the crate in `crateDir`. It throws, with the file named, when the file is missing or malformed. */
export function readBestiary(crateDir: string): Bestiary {
  const file = path.join(crateDir, 'bestiary', 'bestiary.json')
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`${path.relative(process.cwd(), file)} is missing: a forge lab ships a bestiary`)
  }
  const parsed = bestiarySchema.safeParse(JSON.parse(text))
  if (!parsed.success) throw new Error(`${path.relative(process.cwd(), file)}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  return parsed.data
}
