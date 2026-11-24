/**
 * `tr3.provider-preflight`: whether a rented GPU host can take the lab's captures (TR3; KC `tr3.provider-preflight`). Two checks of the
 * host decide it, and each rests on a claim of content/claims/tr3.yaml, which tests/play/items-tr3-provider-preflight.test.ts reads again:
 *
 *   the driver   vLLM built for CUDA 13 needs an R580 or newer driver (`vllm.install.cuda13-driver`). The Docker image's compatibility
 *                mode also accepts R535 and R570 (`vllm.install.compat-drivers`), but only on select professional and datacenter GPUs
 *                (`vllm.install.compat-gpus`), so a GeForce card on one of those two needs R580 or newer too. Levels 0 and 1 draw no
 *                R535 or R570, so only the plain rule is in play there.
 *   the paranoid level   Nsight Systems' guide asks for a `perf_event_paranoid` of 2 or lower, read on the host
 *                (`nsys.paranoid-level`, `nsys.paranoid-host-container`). Level 2 is the guide's own figure, and at level 2 the guide says
 *                the CPU samples have gaps (`nsys.paranoid-2-gaps`), which the reveal says.
 *
 * What is not here: the check that the host's GPU is the one it was rented as. No source of it has been read (the claims file lists it as
 * not read), so no key rests on it, and the GPU's name matters only to the compatibility mode.
 *
 *   can-run       one host: do both checks pass? Each of the four outcomes (both pass, the driver fails, the paranoid level fails, both fail) is
 *                 the key one seed in four.
 *   fails-first   one host, with the order of the lab's checks given (driver, then paranoid level): which message does the preflight give
 *                 first, and what does the capture lose?
 *   hosts-ok      a provider's list of eight to twelve hosts: how many pass both checks? Each count from none to all is the key about as often.
 *
 * Every host is the course's own, and the figures are [synthetic]: the driver branches and the paranoid values are drawn, and no provider's
 * host is described.
 */
import { between, shuffle } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { Gen, Given, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { drawOutcomeOf, EXACT, oneOf, placeEntries, workedPart } from './kit'
import type { Entry } from './kit'

const FAMILY = 'tr3.provider-preflight'
const VERSION = 1
const KC = 'tr3.provider-preflight'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'can-run', title: 'Whether a host passes both checks', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'fails-first', title: 'Which check fails first, and what the capture loses', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'hosts-ok', title: 'How many hosts pass both checks', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'can-run' | 'fails-first' | 'hosts-ok'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The rule, and the claims it rests on                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The oldest driver branch vLLM's CUDA 13 build accepts: `vllm.install.cuda13-driver`, "R580". */
export const DRIVER_MIN = 580
/** The two older branches of the compatibility mode: `vllm.install.compat-drivers`, "R535 and R570". */
export const COMPAT_DRIVERS: readonly number[] = [535, 570]
/** The highest `perf_event_paranoid` at which Nsight Systems' guide samples the CPU: `nsys.paranoid-level`, "2 or lower". */
export const PARANOID_MAX = 2

export interface Card {
  /** The product name, as the hardware atlas writes it (`hw.<gpu>.product-name`). */
  readonly name: string
  /** A professional or datacenter card, the kind that the compatibility mode runs on (`vllm.install.compat-gpus`). */
  readonly datacenter: boolean
}

export const CARDS: readonly Card[] = [
  { name: 'NVIDIA GeForce RTX 4090', datacenter: false },
  { name: 'NVIDIA GeForce RTX 5090', datacenter: false },
  { name: 'NVIDIA L4', datacenter: true },
  { name: 'NVIDIA L40S', datacenter: true },
  { name: 'NVIDIA A100-SXM4-80GB', datacenter: true },
  { name: 'NVIDIA H100 80GB HBM3', datacenter: true },
]

export interface Host {
  readonly driver: number
  readonly paranoid: number
  readonly card: Card
}

/** The driver check, with or without the compatibility mode. */
export const driverOk = (host: Host, compat: boolean): boolean => host.driver >= DRIVER_MIN || (compat && COMPAT_DRIVERS.includes(host.driver) && host.card.datacenter)

export const paranoidOk = (host: Host): boolean => host.paranoid <= PARANOID_MAX

const NEW_DRIVERS: readonly number[] = [580, 585, 590]
const OLD_DRIVERS: readonly number[] = [525, 545, 550, 560, 565, 575]
const PARANOID_OK: readonly number[] = [-1, 0, 1, 2]
const PARANOID_BAD: readonly number[] = [3, 4]

/** Whether the compatibility mode is part of the question: from level 2. */
const usesCompat = (level: Level): boolean => level >= 2

/** A host whose two checks come out as asked. */
function drawHost(rng: Rng, level: Level, driver: boolean, paranoid: boolean): Host {
  const card = oneOf(rng, CARDS)
  const compat = usesCompat(level)
  const pool = driver
    ? [...NEW_DRIVERS, ...(compat && card.datacenter ? COMPAT_DRIVERS : [])]
    : [...OLD_DRIVERS, ...(compat && !card.datacenter ? COMPAT_DRIVERS : [])]
  return { driver: oneOf(rng, pool), paranoid: oneOf(rng, paranoid ? PARANOID_OK : PARANOID_BAD), card }
}

/** What the lab's preflight says of a host: the first check that fails, in the order driver then paranoid level, or none. */
export type First = 'none' | 'driver' | 'paranoid'
export function firstFailure(host: Host, compat: boolean): First {
  return !driverOk(host, compat) ? 'driver' : !paranoidOk(host) ? 'paranoid' : 'none'
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Scenes                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Scene {
  readonly hosts: readonly Host[]
}

export function drawScene(variant: VariantId, level: Level, seed: number, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  if (variant === 'can-run') {
    // Answer first: both pass, the driver fails, the paranoid level fails, both fail.
    const outcome = drawOutcomeOf(FAMILY, variant, level, seed, purpose, 4)
    return { hosts: [drawHost(rng, level, outcome === 0 || outcome === 2, outcome === 0 || outcome === 1)] }
  }
  if (variant === 'fails-first') {
    // Answer first: neither fails, the driver fails (the paranoid level may too), only the paranoid level fails.
    // The paranoid message is the longest option, so it is the key a little less often than one seed in three (29 in 100): a learner who
    // always takes the longest option then passes less than the bound, and none of the three is far from a third.
    const draw = drawOutcomeOf(FAMILY, variant, level, seed, purpose, 100)
    const outcome = draw < 33 ? 0 : draw < 71 ? 1 : 2
    const both = between(rng, 0, 1) === 0
    return { hosts: [drawHost(rng, level, outcome !== 1, outcome === 0 || (outcome === 1 && !both))] }
  }
  // hosts-ok: how many of n pass is drawn first, uniformly from none to all, then which hosts they are.
  const n = between(rng, 8, 12)
  const ok = drawOutcomeOf(FAMILY, variant, level, seed, purpose, n + 1)
  const order = shuffle(rng, [...Array(n).keys()])
  const passes = new Set(order.slice(0, ok))
  const hosts = [...Array(n).keys()].map((at) => {
    if (passes.has(at)) return drawHost(rng, level, true, true)
    // A host that fails fails one check or both, the kind of failure drawn on its own.
    const kind = between(rng, 0, 2)
    return drawHost(rng, level, kind === 1, kind === 0)
  })
  return { hosts }
}

/** How many of the hosts pass both checks. */
export const passing = (scene: Scene, level: Level): number => scene.hosts.filter((host) => driverOk(host, usesCompat(level)) && paranoidOk(host)).length

/** Which outcome a single host has: 0 passes, 1 the driver fails, 2 the paranoid level fails, 3 both fail. */
export function outcomeOf(host: Host, level: Level): 0 | 1 | 2 | 3 {
  const d = driverOk(host, usesCompat(level))
  const p = paranoidOk(host)
  return d && p ? 0 : !d && p ? 1 : d ? 2 : 3
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const hostLine = (host: Host): string => `driver R${host.driver}, perf_event_paranoid ${host.paranoid}, ${host.card.name}`

function givensOf(scene: Scene, level: Level): Given[] {
  const rules: Given[] =
    level <= 1
      ? [
          { label: 'driver the build needs', value: code(`R${DRIVER_MIN} or newer`) },
          { label: 'highest perf_event_paranoid for CPU sampling', value: code(String(PARANOID_MAX)) },
        ]
      : []
  const hosts = scene.hosts.map((host, at): Given => ({ label: scene.hosts.length === 1 ? 'host' : `host ${at + 1}`, value: code(hostLine(host)) }))
  return [...rules, ...hosts]
}

const cuda13 = (): Rich => rich(code('CUDA 13'))
const CHECKS: Rich = [
  ...rich('Suppose the lab runs vLLM built for '),
  ...cuda13(),
  ...rich(' under Nsight Systems. Its preflight makes two checks of a rented host: the driver, which must be new enough for that build, and perf_event_paranoid, read on the host, which must be low enough for Nsight Systems to sample the CPU. '),
]
const CARD_NOTE = 'A GeForce card is a gaming card; the other cards here are professional or datacenter cards. '

const stemOf = (variant: VariantId, level: Level): Item['stem'] => {
  const lead: Rich = usesCompat(level) ? [...CHECKS, ...rich(CARD_NOTE)] : CHECKS
  if (variant === 'can-run') return [...lead, ...rich('Does this host pass both checks?')]
  if (variant === 'fails-first') {
    return [...lead, ...rich('The preflight runs the driver check first and the paranoid check second. Which message does it give first, and what does the capture lose?')]
  }
  return [...lead, ...rich('A provider lists these hosts. How many of them pass both checks?')]
}

/*
 * The first step of each solution is the rule alone: no figure of the scene and no threshold. At level 1 it is the step a learner is
 * shown before answering, and the questions of a lesson's Test are asked at level 1, so it must not say which check fails.
 */
const RULE = rich(
  "Compare the host's driver with the oldest driver that the build accepts, and its perf_event_paranoid with the highest value at which Nsight Systems samples the CPU. A host passes only when both checks pass. The older drivers of the compatibility mode count only on a professional or datacenter card.",
)
const RULE_LEVEL_0_1 = rich(
  "Compare the host's driver with the oldest driver that the build accepts, and its perf_event_paranoid with the highest value at which Nsight Systems samples the CPU. A host passes only when both checks pass.",
)

function hostSteps(host: Host, level: Level): Step[] {
  const compat = usesCompat(level)
  const d = driverOk(host, compat)
  const p = paranoidOk(host)
  const rule: Step = { text: compat ? RULE : RULE_LEVEL_0_1 }
  const viaCompat = compat && host.driver < DRIVER_MIN && COMPAT_DRIVERS.includes(host.driver)
  const driverStep: Step = {
    text: viaCompat
      ? host.card.datacenter
        ? rich('The driver is ', code(`R${host.driver}`), ', older than ', code(`R${DRIVER_MIN}`), ', but it is one of the two the compatibility mode accepts, and the card is a datacenter card: the driver check passes.')
        : rich('The driver is ', code(`R${host.driver}`), ', older than ', code(`R${DRIVER_MIN}`), '. It is one of the two the compatibility mode accepts, but only on a professional or datacenter card, and a GeForce card is not one: the driver check fails.')
      : d
        ? rich('The driver is ', code(`R${host.driver}`), ', which is ', code(`R${DRIVER_MIN}`), ' or newer: the driver check passes.')
        : rich('The driver is ', code(`R${host.driver}`), ', older than ', code(`R${DRIVER_MIN}`), ': the driver check fails.'),
  }
  const paranoidStep: Step = {
    text: p
      ? host.paranoid === PARANOID_MAX
        ? rich('The paranoid level is ', code(String(host.paranoid)), ', at the highest value the guide allows: the check passes, though the guide says the CPU samples have gaps at that value.')
        : rich('The paranoid level is ', code(String(host.paranoid)), ', at most ', code(String(PARANOID_MAX)), ': the check passes.')
      : rich('The paranoid level is ', code(String(host.paranoid)), ', above ', code(String(PARANOID_MAX)), ': the check fails.'),
  }
  return [rule, driverStep, paranoidStep]
}

function canRunSteps(scene: Scene, level: Level): Step[] {
  const host = scene.hosts[0]
  const outcome = outcomeOf(host, level)
  const verdict = ['Both checks pass, so the host can take the captures.', 'Only the driver check fails, so the host cannot take the captures.', 'Only the paranoid check fails, so the host cannot take the CPU samples the captures need.', 'Both checks fail.'][outcome]
  return [...hostSteps(host, level), { text: rich(verdict) }]
}

function firstSteps(scene: Scene, level: Level): Step[] {
  const host = scene.hosts[0]
  const first = firstFailure(host, usesCompat(level))
  const verdict =
    first === 'none'
      ? 'Neither check fails, so the preflight gives no message and the capture loses nothing.'
      : first === 'driver'
        ? "The driver check runs first and fails, so that is the message. vLLM's build does not run on this host, so there is nothing to capture."
        : 'The driver check passes and the paranoid check fails. Nsight Systems asks for a value of two or lower to sample the CPU, so the capture may lose its CPU samples.'
  return [...hostSteps(host, level), { text: rich(verdict) }]
}

function countSteps(scene: Scene, level: Level): Step[] {
  const compat = usesCompat(level)
  const rule: Step = { text: compat ? RULE : RULE_LEVEL_0_1 }
  const ok = scene.hosts.flatMap((host, at) => (driverOk(host, compat) && paranoidOk(host) ? [at + 1] : []))
  return [
    rule,
    { text: rich('Hosts that pass both checks: ', code(ok.length === 0 ? 'none' : ok.map((at) => `host ${at}`).join(', ')), '.') },
    { text: rich('Each of those is one host, so they come to this many.'), result: num(ok.length, { tag: 'derived', unit: ok.length === 1 ? 'host' : 'hosts' }) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Diagnoses                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function sceneOfItem(item: Pick<Item, 'variant' | 'level' | 'seed'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  return drawScene(item.variant, item.level, item.seed, 'scene')
}

const DIAGNOSES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOfItem(item)
    const key = passing(scene, item.level)
    const compat = usesCompat(item.level)
    const driverOnly = scene.hosts.filter((host) => driverOk(host, compat)).length
    const paranoidOnly = scene.hosts.filter(paranoidOk).length
    if (value !== key && value === driverOnly) return { id: `${FAMILY}.driver-only`, message: rich('That counts the hosts that pass the driver check only. A host must pass the paranoid check too.') }
    if (value !== key && value === paranoidOnly) return { id: `${FAMILY}.paranoid-only`, message: rich('That counts the hosts that pass the paranoid check only. A host must pass the driver check too.') }
    return null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    const key = passing(scene, item.level)
    return value !== key && value === scene.hosts.length - key ? { id: `${FAMILY}.counted-failures`, message: rich('That is the number of hosts that fail. The question asks for the ones that pass.') } : null
  },
  (item, value) => {
    if (!usesCompat(item.level)) return null
    const scene = sceneOfItem(item)
    const key = passing(scene, item.level)
    const plain = scene.hosts.filter((host) => driverOk(host, false) && paranoidOk(host)).length
    const loose = scene.hosts.filter((host) => (host.driver >= DRIVER_MIN || COMPAT_DRIVERS.includes(host.driver)) && paranoidOk(host)).length
    if (value !== key && value === plain) return { id: `${FAMILY}.ignored-compat`, message: rich('That leaves out the hosts whose older driver the compatibility mode accepts on a datacenter card.') }
    if (value !== key && value === loose) return { id: `${FAMILY}.compat-on-any-card`, message: rich('That lets the compatibility mode work on any card. It runs only on professional and datacenter cards, so a GeForce card on an older driver fails.') }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function canRunEntries(scene: Scene, level: Level): Entry[] {
  const host = scene.hosts[0]
  const right = outcomeOf(host, level)
  const compat = usesCompat(level)
  const viaCompat = compat && COMPAT_DRIVERS.includes(host.driver)
  const driverWhy = driverOk(host, compat)
    ? rich('The driver ', code(`R${host.driver}`), viaCompat ? ' is one of the two the compatibility mode accepts, on a datacenter card, so it passes the driver check.' : ' passes the driver check.')
    : rich('The driver ', code(`R${host.driver}`), viaCompat ? ' is one of the two the compatibility mode accepts, but only on a datacenter card, so it fails the driver check.' : ' is older than the build accepts, so it fails the driver check.')
  const paranoidWhy = paranoidOk(host) ? rich('The paranoid level ', code(String(host.paranoid)), ' passes the paranoid check.') : rich('The paranoid level ', code(String(host.paranoid)), ' is above ', code(String(PARANOID_MAX)), ', so it fails the paranoid check.')
  const texts = ['Yes: both checks pass', 'No: the driver check fails', 'No: the paranoid check fails', 'No: both checks fail']
  const slugs = ['both-pass', 'driver-only', 'paranoid-only', 'both-fail']
  return texts.map((text, at): Entry => {
    const why = rich(...driverWhy, ' ', ...paranoidWhy)
    return at === right ? { text: rich(text), right: true, why } : { text: rich(text), miss: `${FAMILY}.${slugs[at]}`, why: rich('That is not what the two checks give: ', ...why) }
  })
}

function firstEntries(scene: Scene, level: Level): Entry[] {
  const host = scene.hosts[0]
  const first = firstFailure(host, usesCompat(level))
  const note = (of: First): Rich => (of === first ? rich('This is the first check of the host that fails, in the order the preflight runs them.') : rich('The checks of this host give a different first message.'))
  return [
    { text: rich('Neither: both checks pass, and the capture loses nothing'), ...(first === 'none' ? { right: true as const } : { miss: `${FAMILY}.passes` }), why: rich(...note('none'), first === 'none' ? ' Both checks pass.' : ' At least one check fails.') },
    { text: rich("The driver check: vLLM's ", code('CUDA 13'), ' build does not run, so there is nothing to capture'), ...(first === 'driver' ? { right: true as const } : { miss: `${FAMILY}.driver-first` }), why: rich(...note('driver')) },
    { text: rich('The paranoid check: Nsight Systems may not sample the CPU, so the capture loses its CPU samples'), ...(first === 'paranoid' ? { right: true as const } : { miss: `${FAMILY}.paranoid-first` }), why: first === 'driver' ? rich(...note('paranoid'), ' The driver check comes first, and it fails.') : rich(...note('paranoid')) },
  ]
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const scene = drawScene(variant, level, seed, 'scene')
  const gen = { id: FAMILY, version: VERSION }
  const base = {
    variant,
    level,
    seed,
    kcs: spec.kcs,
    params: { hosts: scene.hosts.map((host) => `${host.driver}:${host.paranoid}:${host.card.name}`).join('|') },
    givens: givensOf(scene, level),
    stem: stemOf(variant, level),
  }
  const other = (attempt: number): Scene => drawScene(variant, level, seed, `example-${attempt}`)
  if (variant === 'hosts-ok') {
    const key = passing(scene, level)
    return finishItem(gen, {
      ...base,
      worked: workedPart(level, countSteps(scene, level), (attempt) => {
        const s = other(attempt)
        return passing(s, level) === key ? null : countSteps(s, level)
      }),
      answer: { kind: 'numeric', label: 'the hosts that pass both checks', unit: 'hosts', truth: key, tolerance: EXACT },
    })
  }
  const steps = variant === 'can-run' ? canRunSteps : firstSteps
  const key = variant === 'can-run' ? outcomeOf(scene.hosts[0], level) : firstFailure(scene.hosts[0], usesCompat(level))
  const keyOfScene = (s: Scene): unknown => (variant === 'can-run' ? outcomeOf(s.hosts[0], level) : firstFailure(s.hosts[0], usesCompat(level)))
  const { options, correct } = placeEntries(FAMILY, variant, level, seed, variant === 'can-run' ? canRunEntries(scene, level) : firstEntries(scene, level))
  return finishItem(gen, {
    ...base,
    worked: workedPart(level, steps(scene, level), (attempt) => {
      const s = other(attempt)
      return keyOfScene(s) === key ? null : steps(s, level)
    }),
    answer: { kind: 'choice', label: variant === 'can-run' ? 'what the two checks give' : 'the first message and what the capture loses', options, correct },
  })
}

export const providerPreflight: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Whether a rented GPU host can take the captures',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the outcome, or how many hosts pass, is drawn first.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, DIAGNOSES)),
  solution(item) {
    const scene = sceneOfItem(item)
    if (item.variant === 'can-run') return canRunSteps(scene, item.level)
    if (item.variant === 'fails-first') return firstSteps(scene, item.level)
    return countSteps(scene, item.level)
  },
}
