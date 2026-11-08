/**
 * Claims (ARCHITECTURE §4.4, D-012): the dated, sourced facts that content cites as `{{claim:id}}`.
 *
 * A claim file, `content/claims/<area>.yaml`, is a list of claims. This checks the shape of one claim and the ids within one
 * file. Across files it cannot check that a derived claim's inputs exist or that a `pin` names a lock key: `verify:claims` sees
 * every file and the lockfile at once.
 *
 * Dates are `YYYY-MM-DD` strings. The compiler loads YAML with js-yaml's `CORE_SCHEMA`, which leaves a bare date as a string;
 * the default schema would hand over a `Date` and this would reject it (common.ts).
 *
 * A§4.4 lists `source` among the fields without a question mark. Here it may be left out in two cases, because a source would
 * be invented otherwise: a derived claim, whose number comes from `derived.inputs` and whose provenance is those claims, and a
 * synthetic claim, whose number comes from the course's own seeded world and says nothing about a real engine. Every other
 * claim names the page it was read from, the words it was read in, and the day it was read.
 */
import { z } from './zod'
import { httpsUrl, isoDate, nonBlank, uniqueList } from './common'
import { claimIdSchema, lockKeySchema } from './refs'

/** How a claim's number is known (A§0, A§4.4). The prose gate checks these tags too. */
export const CLAIM_TAGS = ['measured', 'derived', 'estimated', 'unverified'] as const

export const claimSourceSchema = z.strictObject({
  url: httpsUrl,
  title: nonBlank,
  /** The source's own words, so a reader can find the line again. */
  quote: nonBlank,
  /** The day the page was read. */
  accessed: isoDate,
})

/** A derived claim's recipe, which CI recomputes from the inputs. */
export const claimDerivationSchema = z.strictObject({
  formula: nonBlank,
  inputs: uniqueList(claimIdSchema).min(1),
})

export const claimSchema = z
  .strictObject({
    id: claimIdSchema,
    value: z.union([z.number(), nonBlank]),
    unit: nonBlank.optional(),
    /** The fact in a sentence, which the claim chip and the claims page show. */
    text: nonBlank,
    tag: z.enum(CLAIM_TAGS),
    source: claimSourceSchema.optional(),
    /** The day someone last checked the value against the source. */
    verifiedAt: isoDate,
    /** Days after `verifiedAt` that the claim counts as fresh. Past it the page says "stale since"; nothing fails (A§4.4). */
    ttlDays: z.int().positive(),
    /** The `course.lock.json` key this fact belongs to, such as `vllm`. A moved pin raises change cards for its claims. */
    pin: lockKeySchema.optional(),
    derived: claimDerivationSchema.optional(),
    /** Set on a number from the course's synthetic world, which the site labels as synthetic (A§4.4). */
    synthetic: z.boolean().optional(),
  })
  .superRefine((claim, ctx) => {
    const derived = claim.tag === 'derived'
    if (derived && claim.derived === undefined) {
      ctx.addIssue({ code: 'custom', message: 'a derived claim carries derived: {formula, inputs}', path: ['derived'] })
    }
    if (!derived && claim.derived !== undefined) {
      ctx.addIssue({ code: 'custom', message: `only a derived claim carries derived, and this one is ${claim.tag}`, path: ['derived'] })
    }
    if (claim.derived?.inputs.includes(claim.id)) {
      ctx.addIssue({ code: 'custom', message: 'a claim cannot be derived from itself', path: ['derived', 'inputs'] })
    }
    if (claim.source === undefined && !derived && claim.synthetic !== true) {
      ctx.addIssue({ code: 'custom', message: `a ${claim.tag} claim needs the source it was read from`, path: ['source'] })
    }
  })

export const claimsFileSchema = z.array(claimSchema).superRefine((claims, ctx) => {
  const seen = new Set<string>()
  claims.forEach((claim, index) => {
    if (seen.has(claim.id)) ctx.addIssue({ code: 'custom', message: `claim "${claim.id}" is defined twice`, path: [index, 'id'] })
    seen.add(claim.id)
  })
})

export type ClaimTag = (typeof CLAIM_TAGS)[number]
export type ClaimSource = z.infer<typeof claimSourceSchema>
export type Claim = z.infer<typeof claimSchema>
export type ClaimsFile = z.infer<typeof claimsFileSchema>
