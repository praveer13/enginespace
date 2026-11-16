/**
 * `enginespace/receipt@1` (ARCHITECTURE §9.6, D-026, D-027): what the local grader writes after a lab's stage, and what the site checks
 * when the learner drops it on /receipts. ASSESSMENT §5.4 says what each field is for in grading, and §5.9 which checks each stage requires.
 *
 * This is the one source (D-030). scripts/export-schemas.ts writes it to schemas/receipt.schema.json, which the grader validates against,
 * and verify:schema fails when the two drift. Every object is strict: a key that this file does not name is refused, and that is also how
 * §9.5's "never collected" holds at the door, since a receipt with a hostname, a user name or a serial number in it has a key that no field
 * here allows. The one place that takes any key is `ext`, which verification ignores, and the `claimed` summary of a performance run, which
 * verification recomputes and never trusts (§8.5 rule 8).
 *
 * The verdict is not in the receipt. It is computed at read time, from the receipt and the raw artifacts, and the receipt never stores it
 * (§8.5 rule 10).
 *
 * JSON Schema cannot say a few things, so the site checks them and the grader's own check has to as well:
 *   - `lab` is the stage's lab, and the challenge's token names this stage;
 *   - the ids of the artifacts differ, and so do the names of the inputs, the ids of the checks and the names of the libraries;
 *   - `pins.onPin` is true exactly when `pins.offPin` is empty;
 *   - a number that a check reports is finite, and an integer among them is below 2^53, since a larger one has no canonical JSON (A§9.8).
 *
 * The bounds on how many entries a list holds are design parameters [estimated] that keep a hostile file's report small: the caps of §8.5
 * rule 1 already bound its size, and these bound what the report page draws from it.
 */
import { z } from './zod'
import { challengeSchema, parseChallenge } from './challenge'
import { gitSha, nameToken, plainText, sha256Hex, utcInstant, versionText } from './common'
import { labOfStage, receiptLabIdSchema, stageIdSchema } from './refs'

/** The `schema` of every receipt. */
export const RECEIPT_SCHEMA_TAG = 'enginespace/receipt@1'

/** The only grader there is: the package whose build `grader.sourceSha256` identifies. */
export const GRADER_NAME = 'enginespace-grader'

/** What a learner declares about where the run happened (A§9.5). It is self-reported and earns nothing. */
export const HOST_KINDS = ['local', 'runpod', 'modal', 'lambda', 'other'] as const

/** What an input is (A§9.6). */
export const INPUT_KINDS = ['model', 'dataset', 'prompts', 'reference'] as const

/** What an artifact holds (A§9.6). */
export const ARTIFACT_KINDS = ['outputs', 'trace', 'bench-log', 'sweep', 'events', 'counts', 'report', 'patch', 'log'] as const

/** What a check is (A§9.6). */
export const CHECK_KINDS = ['correctness', 'property', 'environment'] as const

/** What a run's performance evidence is (A§9.6). */
export const PERFORMANCE_KINDS = ['bench', 'trace', 'sweep', 'pair'] as const

/** How much help the learner says they had (ASSESSMENT §3.2). `explain` and `code` select the `assisted` provenance. */
export const ASSISTED_LEVELS = ['none', 'explain', 'code'] as const

/** Whether the learner's guard hook was on (ASSESSMENT §3.2). */
export const GUARD_STATES = ['on', 'off'] as const

/** How a GPU reports a mode that is on, off, or not there to ask about: ECC on a card that has none, MIG on a card that cannot. */
export const MODE_STATES = ['enabled', 'disabled', 'unsupported'] as const

/** What NVML reports for virtualization, folded into four (A§9.5): a host of vGPUs is `vgpu` like a guest. */
export const VIRTUALIZATION_MODES = ['none', 'passthrough', 'vgpu', 'unknown'] as const

/** How many entries a list holds at most [estimated]. */
export const RECEIPT_LIMITS = { gpus: 16, libs: 32, offPin: 32, envVars: 64, inputs: 64, artifacts: 64, checks: 256 } as const

/** The longest `notes` may be, in characters (A§9.6). */
export const NOTES_MAX_CHARS = 2000

/* ------------------------------------------------------------------------------------------------------------------ */
/* The environment (A§9.5)                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A GPU as NVML or `nvidia-smi` reports it. Its name and memory are always there, and the rest is left out where the tool that
 * collected it could not read it. Never the UUID, the serial number or the bus address (A§9.5).
 */
export const gpuSchema = z.strictObject({
  /** What NVML reports, which is the truth: a rented "H100" may be an H200 (ASSESSMENT §5.6). Floors and tolerances follow it. */
  name: plainText(128),
  memoryBytes: z.int().positive(),
  /** `major.minor`, such as `8.9`. */
  computeCapability: z.string().regex(/^[0-9]{1,2}\.[0-9]{1,2}$/, 'must be major.minor such as 8.9').optional(),
  smCount: z.int().positive().optional(),
  maxSmClockMhz: z.int().positive().optional(),
  maxMemClockMhz: z.int().positive().optional(),
  /** In milliwatts, as NVML reports it, so that no fraction of a watt is written as a float. */
  powerLimitMw: z.int().positive().optional(),
  pcieGen: z.int().min(1).max(9).optional(),
  pcieWidth: z.int().min(1).max(32).optional(),
  mig: z.enum(MODE_STATES).optional(),
  ecc: z.enum(MODE_STATES).optional(),
  virtualization: z.enum(VIRTUALIZATION_MODES).optional(),
})

/** The driver and the CUDA version it supports, such as `580.82.07` and `13.0`. The R580 gate of D-035 reads the first. */
export const driverSchema = z.strictObject({ version: versionText, cudaVersion: versionText.optional() })

export const torchSchema = z.strictObject({
  version: versionText,
  /** `torch.version.cuda`, left out for a CPU build. */
  cuda: versionText.optional(),
  cudnn: versionText.optional(),
})

/** The installed engine (A§9.5, ASSESSMENT §5.5): its distribution, its commit, and the SHA-256 of the distribution's `RECORD`. */
export const engineSchema = z.strictObject({
  name: nameToken,
  version: versionText,
  commit: gitSha.optional(),
  recordSha256: sha256Hex.optional(),
})

/**
 * What the engine actually ran with, read from its own log and configuration dump (ASSESSMENT §5.6): the runner after any fallback, the
 * CUDA-graph mode after any downgrade, whether scheduling was async, the attention backend selected, and the two limits that differ by GPU.
 */
export const engineConfigSchema = z.strictObject({
  runner: plainText(64),
  graphMode: plainText(64),
  asyncScheduling: z.boolean(),
  attentionBackend: plainText(64),
  maxNumBatchedTokens: z.int().positive(),
  maxNumSeqs: z.int().positive(),
})

/** One of the key libraries (flashinfer, xgrammar, triton, transformers), by its distribution's name. */
export const libSchema = z.strictObject({ name: nameToken, version: versionText })

/** The machine. Never the hostname, a user name, an address or an absolute path (A§9.5): no field here could hold one. */
export const hostSchema = z.strictObject({
  kind: z.enum(HOST_KINDS),
  os: plainText(128).optional(),
  kernel: plainText(128).optional(),
  arch: plainText(32).optional(),
  cpu: plainText(128).optional(),
  cores: z.int().positive().optional(),
  ramBytes: z.int().positive().optional(),
  container: z.boolean().optional(),
})

/** The variables of the lab's allowlist, and only `VLLM_*` and `SGLANG_*` ones (A§9.5). A token or a key is never among them. */
const envVarsSchema = z
  .record(z.string().regex(/^(?:VLLM|SGLANG)_[A-Z0-9_]{1,64}$/, 'must be a VLLM_* or SGLANG_* variable'), plainText(256, 'line', false))
  .refine((vars) => Object.keys(vars).length <= RECEIPT_LIMITS.envVars, `must hold at most ${RECEIPT_LIMITS.envVars} variables`)
  .meta({ maxProperties: RECEIPT_LIMITS.envVars })

export const environmentSchema = z.strictObject({
  host: hostSchema,
  /** Empty on the CPU. */
  gpus: z.array(gpuSchema).max(RECEIPT_LIMITS.gpus),
  /** Left out where there is no GPU. */
  driver: driverSchema.optional(),
  python: versionText,
  torch: torchSchema,
  /** Left out for a lab that runs no engine. */
  engine: engineSchema.optional(),
  /** Present on an engine lab. */
  engineConfig: engineConfigSchema.optional(),
  libs: z.array(libSchema).max(RECEIPT_LIMITS.libs),
  envVars: envVarsSchema,
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Pins, inputs, artifacts, checks (A§9.6)                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Whether the run's engine and libraries are the ones `course.lock.json` pins (A§8.5 rule 6). The hashes are of the two lock files; the
 * site compares what the environment reports with its own copy of the lock and does not take `onPin` as given.
 */
export const pinsSchema = z.strictObject({
  lockSha256: sha256Hex,
  envLockSha256: sha256Hex,
  onPin: z.boolean(),
  offPin: z.array(nameToken).max(RECEIPT_LIMITS.offPin),
})

export const inputSchema = z.strictObject({
  name: plainText(128),
  kind: z.enum(INPUT_KINDS),
  revision: plainText(64).optional(),
  sha256: sha256Hex,
  bytes: z.int().min(0),
})

/** What a format is called: `json`, `jsonl`, `text/plain`, `enginespace/trace@1`. */
const formatToken = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:[./@+_-][a-z0-9]+)*$/, 'must be lower-case words joined by dots, slashes, hyphens, underscores, @ or +')

/**
 * One artifact the run made, by the hash of its canonical bytes (A§8.5 rule 3, A§9.8). `inBundle` says whether its data travels in the
 * bundle: a capture too large for the caps is listed by its hash and size and kept by the learner.
 */
export const artifactEntrySchema = z.strictObject({
  id: nameToken,
  kind: z.enum(ARTIFACT_KINDS),
  format: formatToken,
  sha256: sha256Hex,
  bytes: z.int().min(0),
  inBundle: z.boolean(),
})

/** A number that a check reports: finite, and an integer only below 2^53, since a larger one has no canonical JSON form (A§9.8). */
const reported = z.number().refine((value) => !Number.isInteger(value) || Number.isSafeInteger(value), 'an integer must be below 2^53')

/** One result of the grader's. The site re-checks every one it can (A§8.5 rule 7), and the rest it shows as attested by this grader. */
export const checkSchema = z.strictObject({
  id: nameToken,
  kind: z.enum(CHECK_KINDS),
  pass: z.boolean(),
  value: reported.optional(),
  bound: reported.optional(),
  tolerance: reported.optional(),
  /** How many samples the check rests on. */
  n: z.int().min(0).optional(),
  detail: plainText(1000, 'text', false),
  /** The hash of the reference the check compared with. */
  refSha256: sha256Hex.optional(),
})

/** What the run says it measured. The site recomputes every summary from the raw artifacts and never trusts this (A§8.5 rule 8, D-028). */
export const performanceSchema = z.strictObject({
  kind: z.enum(PERFORMANCE_KINDS),
  claimed: z.record(z.string(), z.unknown()),
})

/** What the learner says about how they worked. It is self-reported: `assisted: code` or `agent: true` makes the verdict `assisted` and not `gpu-verified` (A§8.5 rule 10). */
export const provenanceSchema = z.strictObject({
  assisted: z.enum(ASSISTED_LEVELS),
  agent: z.boolean(),
  guard: z.enum(GUARD_STATES),
})

/** Who graded: the package, its version, and the hash over its files, which the site compares with its published list (A§8.5 rule 5). */
export const graderSchema = z.strictObject({
  name: z.literal(GRADER_NAME),
  version: versionText,
  sourceSha256: sha256Hex,
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The receipt                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The names in a list that repeat, each once, with the place of its second copy. */
function repeats<T>(list: readonly T[], key: (entry: T) => string): { name: string; at: number }[] {
  const seen = new Set<string>()
  const out: { name: string; at: number }[] = []
  list.forEach((entry, at) => {
    const name = key(entry)
    if (seen.has(name)) out.push({ name, at })
    seen.add(name)
  })
  return out
}

export const receiptSchema = z
  .strictObject({
    schema: z.literal(RECEIPT_SCHEMA_TAG),
    lab: receiptLabIdSchema,
    stage: stageIdSchema,
    challenge: challengeSchema,
    createdAt: utcInstant,
    grader: graderSchema,
    environment: environmentSchema,
    pins: pinsSchema,
    inputs: z.array(inputSchema).max(RECEIPT_LIMITS.inputs),
    artifacts: z.array(artifactEntrySchema).max(RECEIPT_LIMITS.artifacts),
    checks: z.array(checkSchema).max(RECEIPT_LIMITS.checks),
    performance: performanceSchema.optional(),
    provenance: provenanceSchema,
    notes: plainText(NOTES_MAX_CHARS, 'text', false).optional(),
    /** Anything else. Verification ignores it, and it is part of the receipt's hash like the rest. */
    ext: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((receipt, ctx) => {
    const add = (message: string, path: (string | number)[]): void => ctx.addIssue({ code: 'custom', message, path })
    if (labOfStage(receipt.stage) !== receipt.lab) add(`must be the lab of the stage, ${labOfStage(receipt.stage)}`, ['lab'])
    const token = parseChallenge(receipt.challenge.token)
    if (token !== null && token.stage !== receipt.stage) add(`names stage ${token.stage}, and the receipt is of ${receipt.stage}`, ['challenge', 'token'])
    for (const { name, at } of repeats(receipt.artifacts, (artifact) => artifact.id)) add(`artifact "${name}" is listed twice`, ['artifacts', at, 'id'])
    for (const { name, at } of repeats(receipt.inputs, (input) => input.name)) add(`input "${name}" is listed twice`, ['inputs', at, 'name'])
    for (const { name, at } of repeats(receipt.checks, (check) => check.id)) add(`check "${name}" is listed twice`, ['checks', at, 'id'])
    for (const { name, at } of repeats(receipt.environment.libs, (lib) => lib.name)) add(`library "${name}" is listed twice`, ['environment', 'libs', at, 'name'])
    for (const { name, at } of repeats(receipt.pins.offPin, (pin) => pin)) add(`"${name}" is listed twice`, ['pins', 'offPin', at])
    if (receipt.pins.onPin !== (receipt.pins.offPin.length === 0)) add('must be true exactly when offPin is empty', ['pins', 'onPin'])
  })
  .meta({
    title: RECEIPT_SCHEMA_TAG,
    description:
      'What the local grader writes after a lab stage (ARCHITECTURE §9.6). Checked by the site and not expressible in JSON Schema: lab is the stage\'s lab, and challenge.token names this stage; artifact ids, input names, check ids, library names and offPin entries each differ; pins.onPin is true exactly when pins.offPin is empty; a number that a check reports is below 2^53 when it is an integer. The challenge is checked as challenge.schema.json says.',
  })

export type Receipt = z.infer<typeof receiptSchema>
export type GraderCheck = z.infer<typeof checkSchema>
export type ReceiptArtifact = z.infer<typeof artifactEntrySchema>
export type ReceiptEnvironment = z.infer<typeof environmentSchema>
