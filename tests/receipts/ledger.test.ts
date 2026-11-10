/*
 * W2-T06: the page writes its challenges to the ledger the way the app writes anything (ARCHITECTURE §7.4, §8.4), checked against the real
 * evidence engine on the memory store, with a fixed clock: `writeChallenge` issues a token and appends the event, the event is in the store
 * and in the snapshot the page reads, a receipt event for its token makes it used, 14 days [estimated] make it expired, and an export
 * carries the challenge to another device with its state. The same engine runs on IndexedDB in e2e/ledger-conformance.spec.ts, and the
 * page on it in e2e/receipts.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { parseExport } from '@es/ledger'
import { checkChallenge } from '@es/schema/challenge'
import { clockNow, heldChallenges, writeChallenge } from '@/receipts/challenge'
import { FakeBus, openTab, SharedDb } from '../evidence/support'
import { entropyOf, sha256 } from './support'

const DAY = 86_400_000

describe('issuing a challenge through the engine', () => {
  test('writes one challenge event to the store, as the page does, and the snapshot shows it open', async () => {
    const db = new SharedDb()
    const { engine, clock } = await openTab(db, null)
    const outcome = await writeChallenge('tr8.replay.s2', engine, clock, entropyOf(1))
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.durable).toBe(true)
    expect(outcome.event.kind).toBe('challenge')
    expect(outcome.event.ref).toBe('challenge:tr8.replay.s2')
    expect(checkChallenge(outcome.event.data.token).ok).toBe(true)

    const stored = (await db.data.readAll()).events
    expect(stored.map((event) => event.id)).toEqual([outcome.event.id])
    expect(engine.getSnapshot().events).toEqual(stored)
    const held = heldChallenges(engine.getSnapshot().events, Date.parse(clock.nowIso()))
    expect(held.map((entry) => [entry.stage, entry.state])).toEqual([['tr8.replay.s2', 'open']])
  })

  test('stamps the event with the clock, the zone and the day, and the token carries the learner\'s day', async () => {
    const db = new SharedDb()
    const { engine, clock } = await openTab(db, null)
    clock.set('2026-11-09T23:30:00.000Z')
    const outcome = await writeChallenge('tr3.profile.s2', engine, { nowIso: clock.nowIso, tzOffsetMinutes: () => 120 }, entropyOf(2))
    // The engine stamps with its own clock, which is in the zone 0: the event's day is the UTC day. The token's day is the issuing clock's.
    if (!outcome.ok) throw new Error(outcome.detail)
    expect(outcome.event.at).toBe('2026-11-09T23:30:00.000Z')
    expect(outcome.event.day).toBe('2026-11-09')
    expect(outcome.event.data.issuedOn).toBe('20261110')
  })

  test('keeps every challenge, each its own event, and issues no token twice', async () => {
    const db = new SharedDb()
    const { engine, clock } = await openTab(db, null)
    const tokens = new Set<string>()
    for (let seed = 1; seed <= 20; seed += 1) {
      const outcome = await writeChallenge('tr8.replay.s2', engine, clock, entropyOf(seed))
      if (!outcome.ok) throw new Error(outcome.detail)
      tokens.add(outcome.event.data.token)
    }
    expect(tokens.size).toBe(20)
    expect((await db.data.readAll()).events).toHaveLength(20)
  })

  test('says why when the ledger will not take it: a read-only ledger answers in words, and nothing is written', async () => {
    const db = new SharedDb({ meta: { deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 9 } })
    const { engine, clock } = await openTab(db, null)
    expect(engine.getSnapshot().readOnly).toBe(true)
    const outcome = await writeChallenge('tr8.replay.s2', engine, clock, entropyOf(1))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.detail.length).toBeGreaterThan(20)
    expect((await db.data.readAll()).events).toEqual([])
  })

  test('says so when the engine is closed', async () => {
    const { engine, clock } = await openTab(new SharedDb(), null)
    engine.close()
    const outcome = await writeChallenge('tr8.replay.s2', engine, clock, entropyOf(1))
    expect(outcome).toEqual({ ok: false, detail: 'The evidence ledger is closed.' })
  })

  test('refuses a stage that is not one before anything is written', async () => {
    const db = new SharedDb()
    const { engine, clock } = await openTab(db, null)
    await expect(writeChallenge('not-a-stage', engine, clock, entropyOf(1))).rejects.toThrow(RangeError)
    expect((await db.data.readAll()).events).toEqual([])
  })
})

describe('a challenge, in the ledger, over time', () => {
  test('is used once a receipt event carries its token, and expired when 14 days pass without one', async () => {
    const db = new SharedDb()
    const { engine, clock } = await openTab(db, null)
    const spent = await writeChallenge('tr8.replay.s2', engine, clock, entropyOf(1))
    const idle = await writeChallenge('tr3.profile.s2', engine, clock, entropyOf(2))
    if (!spent.ok || !idle.ok) throw new Error('could not issue')
    clock.advance(DAY)
    const hash = sha256('the receipt')
    await engine.append({
      kind: 'receipt',
      ref: 'receipt:tr8.replay.s2',
      score: 1,
      ok: true,
      provenance: 'gpu-verified',
      data: { receiptSha256: hash, challenge: spent.event.data.token, checks: [{ id: 'agreement', verdict: 'attested' }], graderVersion: '0.1.0', environment: 'one GPU' },
    })
    const states = (nowMs: number) => Object.fromEntries(heldChallenges(engine.getSnapshot().events, nowMs).map((entry) => [entry.stage, entry.state]))
    const issuedAt = Date.parse('2026-11-04T09:00:00.000Z')
    expect(states(issuedAt + 2 * DAY)).toEqual({ 'tr8.replay.s2': 'used', 'tr3.profile.s2': 'open' })
    expect(states(issuedAt + 14 * DAY - 1)).toEqual({ 'tr8.replay.s2': 'used', 'tr3.profile.s2': 'open' })
    expect(states(issuedAt + 14 * DAY)).toEqual({ 'tr8.replay.s2': 'used', 'tr3.profile.s2': 'expired' })
    const held = heldChallenges(engine.getSnapshot().events, issuedAt + 2 * DAY)
    expect(held.find((entry) => entry.token === spent.event.data.token)?.usedBy).toBe(hash)
    expect(held.find((entry) => entry.token === idle.event.data.token)?.usedBy).toBeUndefined()
  })

  test('travels in an export with the events that make it open, used or expired, and is the same on the device that imports it', async () => {
    const bus = new FakeBus()
    const a = await openTab(new SharedDb(), bus)
    const spent = await writeChallenge('tr8.replay.s2', a.engine, a.clock, entropyOf(1))
    if (!spent.ok) throw new Error(spent.detail)
    await a.engine.append({
      kind: 'receipt',
      ref: 'receipt:tr8.replay.s2',
      score: 1,
      ok: true,
      provenance: 'gpu-verified',
      data: { receiptSha256: sha256('r'), challenge: spent.event.data.token, checks: [{ id: 'agreement', verdict: 'pass' }], graderVersion: '0.1.0', environment: 'one GPU' },
    })
    await writeChallenge('tr3.profile.s2', a.engine, a.clock, entropyOf(2))
    const exported = await a.engine.exportLedger()
    if (!exported.ok) throw new Error(exported.detail)

    const b = await openTab(new SharedDb(), null)
    expect((await b.engine.importLedger(exported.text, 'merge')).ok).toBe(true)
    const now = Date.parse('2026-11-05T09:00:00.000Z')
    const there = heldChallenges(a.engine.getSnapshot().events, now).map((entry) => [entry.token, entry.state])
    const here = heldChallenges(b.engine.getSnapshot().events, now).map((entry) => [entry.token, entry.state])
    expect(here).toEqual(there)
    expect(here.map((row) => row[1]).sort()).toEqual(['open', 'used'])
    expect(parseExport(exported.text).ok).toBe(true)
  })
})

describe('the clock', () => {
  test('is the real one, and is read where the page counts the states', () => {
    const before = Date.now()
    const read = clockNow()
    expect(read).toBeGreaterThanOrEqual(before)
    expect(read).toBeLessThanOrEqual(Date.now())
  })
})
