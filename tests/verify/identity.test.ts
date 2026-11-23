/*
 * W2-T07, rule 5 of ARCHITECTURE §8.5: grader identity. `grader.version` must be one this site build published, and `grader.sourceSha256` must
 * equal that version's published source hash. If not, the receipt is `gpu-unverified`, with the reason shown (the task's fourth check).
 *
 *   - A build the site published, with the hash it published, passes.
 *   - A build it did not publish, a version it published with another hash, and a site that has published nothing each fail, and each says which.
 *   - The verdict of a receipt whose grader is unknown is `gpu-unverified`, with the reason in its reasons (tests/verify/pipeline.test.ts holds the
 *     whole receipt; this file holds the rule).
 */
import { describe, expect, test } from 'bun:test'
import { checkGrader } from '@es/verify'
import { sampleBundle, sha256 } from './support'

const { receipt } = sampleBundle()
const published = { version: receipt.grader.version, sourceSha256: receipt.grader.sourceSha256 }

describe('a grader build the site published', () => {
  test('passes: the version and the source hash are the published ones', () => {
    const found = checkGrader(receipt, [published])
    expect(found).toMatchObject({ rule: 5, id: 'grader', status: 'pass', problems: [] })
    expect(found.summary).toBe(`enginespace-grader 0.1.0 is a build this site published, with the source hash it published (${published.sourceSha256.slice(0, 12)}...).`)
  })

  test('passes among others', () => {
    const others = [{ version: '0.0.9', sourceSha256: sha256('old') }, published, { version: '0.2.0', sourceSha256: sha256('new') }]
    expect(checkGrader(receipt, others).status).toBe('pass')
  })
})

describe('an unknown grader build', () => {
  test('is one whose version the site did not publish: it fails, and lists what the site published', () => {
    const found = checkGrader(receipt, [{ version: '0.2.0', sourceSha256: sha256('new') }, { version: '0.3.0', sourceSha256: sha256('newer') }])
    expect(found.status).toBe('fail')
    expect(found.summary).toBe('enginespace-grader 0.1.0 is not a build this site published.')
    expect(found.problems).toEqual(["This site published 0.2.0, 0.3.0. A receipt from a build it did not publish earns no credit; run the stage again with the grader from this site's kit."])
  })

  test('is one whose version the site published with another hash: the package that made the receipt is not the one that was published', () => {
    const found = checkGrader(receipt, [{ version: '0.1.0', sourceSha256: sha256('what was published') }])
    expect(found.status).toBe('fail')
    expect(found.summary).toBe('enginespace-grader 0.1.0 is not the build this site published under that version.')
    expect(found.problems[0]).toContain(`with source hash ${sha256('what was published').slice(0, 12)}...`)
    expect(found.problems[0]).toContain(`the receipt says ${published.sourceSha256.slice(0, 12)}...`)
  })

  test('is any build at all when the site has published none, and the problem says so and which task publishes the first', () => {
    const found = checkGrader(receipt, [])
    expect(found.status).toBe('fail')
    expect(found.summary).toBe('enginespace-grader 0.1.0 is not a build this site knows.')
    expect(found.problems[0]).toContain('has published no grader yet')
    expect(found.problems[0]).not.toMatch(/W\d+-T\d+/)
  })

  test('says why a receipt that calls itself synthetic cannot pass here: no site publishes the build that makes one', () => {
    const made = structuredClone(receipt)
    made.grader.version = '0.0.0'
    made.ext = { synthetic: true }
    const found = checkGrader(made, [published])
    expect(found.status).toBe('fail')
    expect(found.problems[0]).toContain('says it is synthetic')
    expect(found.problems[0]).toContain('no site publishes such a build')
  })

  test('cuts a version string from the file before it quotes it', () => {
    const forged = structuredClone(receipt)
    forged.grader.version = `9${'9'.repeat(63)}`
    const found = checkGrader(forged, [published])
    expect(found.summary.length).toBeLessThan(120)
  })
})
