/*
 * W2-T07, rule 6 of ARCHITECTURE §8.5: pins. The engine must be the one `course.lock.json` pins, by its name, its version and its commit; the
 * libraries are the grader's own comparison with its environment's lock; a grader that says the run is off the pins is believed against the
 * receipt, because it is an admission; and a lab that runs an engine must name it.
 *
 * An off-pin run is shown and labelled, and earns no credit unless the lab declares the version compatible. The site does not take `onPin` as given.
 */
import { describe, expect, test } from 'bun:test'
import type { Receipt } from '@es/schema/receipt'
import { checkPins, ENGINELESS_LABS } from '@es/verify'
import type { Compatible, EnginePin } from '@es/verify'
import { RECEIPT_LABS } from '@/receipts/labs'
import { sampleBundle, VLLM_PIN } from './support'

const sample = sampleBundle().receipt
const VLLM_COMMIT = '4ba787ec9959e566d3b587a796dff07673324da5'
const NANO: EnginePin = { name: 'nano-vllm', commit: 'bb823b3e06983d71485a8e1f23715ebd87d98ef8' }
const SGLANG: EnginePin = { name: 'sglang', version: '0.5.23', commit: '297e54fd105e974cdf401e5b4d20253a22c16f90' }
const TABLE = [VLLM_PIN, SGLANG, NANO]

/** The sample receipt after `change`. */
function edited(change: (receipt: Receipt) => void): Receipt {
  const receipt = structuredClone(sample)
  change(receipt)
  return receipt
}

describe('an engine on the pin', () => {
  test('passes: the name, the version and the commit are the lock\'s, and the libraries are the grader\'s word', () => {
    const found = checkPins(sample, TABLE)
    expect(found).toMatchObject({ rule: 6, id: 'pins', status: 'pass', problems: [] })
    expect(found.summary).toBe("vllm 0.33.0 is the pin. The 4 listed libraries are the grader's own comparison with its environment's lock.")
  })

  test('passes with a local version label: 0.33.0+cu130 is release 0.33.0', () => {
    const receipt = edited((r) => {
      if (r.environment.engine !== undefined) r.environment.engine.version = '0.33.0+cu130'
    })
    expect(checkPins(receipt, TABLE).status).toBe('pass')
  })

  test('passes without a commit when the version is pinned: the receipt need not name what the version already says', () => {
    const receipt = edited((r) => {
      if (r.environment.engine !== undefined) delete r.environment.engine.commit
    })
    expect(checkPins(receipt, TABLE).status).toBe('pass')
  })

  test('passes for an engine the course pins by commit alone, nano-vllm, when the commit is the pin\'s', () => {
    const receipt = edited((r) => {
      r.lab = 'tr1.fork'
      r.stage = 'tr1.fork.s2'
      if (r.environment.engine !== undefined) r.environment.engine = { name: 'nano-vllm', version: '0.2.0', commit: NANO.commit }
    })
    expect(checkPins(receipt, TABLE).status).toBe('pass')
  })
})

describe('an engine off the pin', () => {
  test('fails when its version is not the pinned release, and says what the course pins', () => {
    const receipt = edited((r) => {
      if (r.environment.engine !== undefined) r.environment.engine.version = '0.32.0'
    })
    const found = checkPins(receipt, TABLE)
    expect(found.status).toBe('fail')
    expect(found.summary).toBe("The run is off the course's pins.")
    expect(found.problems).toEqual(['vllm 0.32.0 is off the pin: the course pins vllm 0.33.0.'])
  })

  test('fails when its version is the pinned release and its commit is not: a patched build', () => {
    const receipt = edited((r) => {
      if (r.environment.engine !== undefined) r.environment.engine.commit = 'f'.repeat(40)
    })
    const found = checkPins(receipt, TABLE)
    expect(found.status).toBe('fail')
    expect(found.problems).toEqual([`vllm 0.33.0 is at commit ffffffffffff, and the course pins vllm at commit ${VLLM_COMMIT.slice(0, 12)}.`])
  })

  test('fails when the engine is not one the course pins, and lists the ones it does', () => {
    const receipt = edited((r) => {
      if (r.environment.engine !== undefined) r.environment.engine = { name: 'tgi', version: '3.0.0' }
    })
    const found = checkPins(receipt, TABLE)
    expect(found.status).toBe('fail')
    expect(found.problems).toEqual(['The engine "tgi" is not one the course pins (it pins vllm, sglang, nano-vllm).'])
  })

  test('fails for an engine pinned by commit alone when the receipt names no commit', () => {
    const receipt = edited((r) => {
      if (r.environment.engine !== undefined) r.environment.engine = { name: 'nano-vllm', version: '0.2.0' }
    })
    expect(checkPins(receipt, TABLE).problems).toEqual(['The course pins nano-vllm by commit bb823b3e0698, and the receipt names no commit.'])
  })

  test('fails when the table has no engines at all, which is a site that pins none', () => {
    expect(checkPins(sample, []).problems).toEqual(['The engine "vllm" is not one the course pins.'])
  })
})

describe('a lab that declares a version compatible', () => {
  test('is not off the pin for that version of that engine, and the note says so', () => {
    const receipt = edited((r) => {
      if (r.environment.engine !== undefined) {
        r.environment.engine.version = '0.31.0'
        r.environment.engine.commit = '1'.repeat(40)
      }
    })
    expect(checkPins(receipt, TABLE).status).toBe('fail')
    const found = checkPins(receipt, TABLE, { compatible: { 'tr3.profile': { vllm: ['0.31.0'] } } })
    expect(found.status).toBe('pass')
    expect(found.summary).toContain('vllm 0.31.0 is not the pinned 0.33.0, and tr3.profile declares it compatible.')
  })

  test('is only for the lab, the engine and the version it names', () => {
    const receipt = edited((r) => {
      if (r.environment.engine !== undefined) r.environment.engine.version = '0.31.0'
    })
    const others: Compatible[] = [{ 'tr8.replay': { vllm: ['0.31.0'] } }, { 'tr3.profile': { sglang: ['0.31.0'] } }, { 'tr3.profile': { vllm: ['0.30.0'] } }]
    for (const compatible of others) {
      expect(checkPins(receipt, TABLE, { compatible }).status).toBe('fail')
    }
  })
})

describe('the grader\'s own admission', () => {
  test('that the run is off the pins fails the rule, whatever the engine says: the site does not take onPin as given, and does not take it away either', () => {
    const receipt = edited((r) => {
      r.pins.onPin = false
      r.pins.offPin = ['flashinfer-python', 'xgrammar']
    })
    const found = checkPins(receipt, TABLE)
    expect(found.status).toBe('fail')
    expect(found.problems[0]).toMatch(/^The grader reports the run off the pins: flashinfer-python, xgrammar\./)
  })

  test('is not needed to fail a receipt that says it is on the pins and is not: the engine decides', () => {
    const receipt = edited((r) => {
      r.pins.onPin = true
      r.pins.offPin = []
      if (r.environment.engine !== undefined) r.environment.engine.version = '0.20.0'
    })
    expect(checkPins(receipt, TABLE).status).toBe('fail')
  })
})

describe('a lab that runs an engine must name it', () => {
  test('a receipt of an engine lab with no engine fails: leaving the field out is not a way round the rule', () => {
    const receipt = edited((r) => {
      delete r.environment.engine
    })
    const found = checkPins(receipt, TABLE)
    expect(found.status).toBe('fail')
    expect(found.problems).toEqual(['tr3.profile runs an engine, and the receipt names none, so its pin cannot be checked.'])
  })

  test('a receipt of TR0 on the laptop\'s CPU has none and passes, and says the lab runs no engine', () => {
    const receipt = edited((r) => {
      r.lab = 'tr0.forward'
      r.stage = 'tr0.forward.s2'
      delete r.environment.engine
      delete r.environment.engineConfig
    })
    const found = checkPins(receipt, TABLE)
    expect(found.status).toBe('pass')
    expect(found.summary).toContain('The lab runs no engine.')
  })

  test('the labs without an engine are the labs of the laptop lane, and no other', () => {
    expect([...ENGINELESS_LABS]).toEqual(RECEIPT_LABS.filter((lab) => lab.lane === 'L').map((lab) => lab.id))
  })
})
