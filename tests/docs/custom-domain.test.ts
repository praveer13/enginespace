/*
 * D-058's documents: the owner's answer to O-1 (the custom domain) is written down once, and every document agrees with it.
 *
 *   1. docs/DECISIONS.md has the record, with GitHub's page for the CNAME file cited and dated, indexes it, and no longer lists O-1
 *      as open; D-015 says that the main origin is decided and a second origin would need a name of its own.
 *   2. The documents and comments that said the deployed base is /enginespace/, or that the domain is undecided, name the origin.
 *
 * tests/pages/custom-domain.test.ts holds the code and the build to the same domain.
 */
import { describe, expect, test } from 'bun:test'
import { between, read, trackerTasks } from '../ci/support'

const DOMAIN = 'enginespace.naigap.com'
const ORIGIN = `https://${DOMAIN}`
const GITHUB_PAGE = 'https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site'

const decisions = read('docs/DECISIONS.md')
const record = between(decisions, '### D-058 · ', '\n---\n')

describe('D-058 in docs/DECISIONS.md', () => {
  test('is the owner\'s decision of 2026-11-08, and says the origin, the CNAME file and the base', () => {
    expect(record).toContain('- **Status:** owner-decided 2026-11-08.')
    expect(record).toContain(`\`${ORIGIN}\``)
    for (const needle of ['`public/CNAME`', `\`${DOMAIN}\``, 'default base `/`', '`VITE_BASE`', '`PAGES_ENABLED`']) expect(record).toContain(needle)
  })

  test("cites GitHub's page for a CNAME file that an Actions deploy ignores, and the date it was read (or tags the statement)", () => {
    expect(record).toContain(GITHUB_PAGE)
    expect(record).toContain('any existing CNAME file is ignored and is not required')
    expect(record).toMatch(/\[measured 2026-11-08\]/)
  })

  test('is in the index, as owner-decided', () => {
    expect(decisions).toMatch(/^\| D-058 \| [^\n]*\| owner-decided 2026-11-08 \|$/m)
  })

  test('answers O-1: its row has left the table of open questions, and the answer is written under the table', () => {
    const open = between(decisions, '## Open owner questions', '**Answered.**')
    expect(open).not.toMatch(/^\| O-1 \|/m)
    expect(open).toMatch(/^\| O-2 \|/m)
    expect(decisions).toMatch(/\*\*Answered\.\*\* O-1, the custom domain, was answered by the owner on 2026-11-08[^\n]*\(D-058\)/)
  })

  test('leaves D-015 saying that the main origin is decided and a second origin would need a name of its own', () => {
    const d015 = between(decisions, '### D-015 · ', '### D-016 · ')
    expect(d015).not.toContain('still undecided')
    expect(d015).toContain(`The main origin is decided (\`${ORIGIN}\`, D-058), and a second origin would need a name of its own.`)
  })
})

describe('the documents and comments that named the base or the domain', () => {
  /** What they said before D-058: that the deployed base is /enginespace/, or that the domain is still to choose. */
  const stale = [/until a custom domain/i, /domain is (?:still )?undecided/i, /still undecided \(O-1\)/, /serves the site (?:at|under) `?\/enginespace\//]
  const files = ['README.md', 'PRODUCT.md', 'docs/ARCHITECTURE.md', 'docs/PLAN.md', 'docs/DECISIONS.md', 'docs/TRACKER.md', '.github/workflows/deploy.yml', 'vite.config.ts', 'src/main.tsx', 'src/content/load.ts']

  test('say none of it any more', () => {
    const found = files.flatMap((file) => stale.filter((pattern) => pattern.test(read(file))).map((pattern) => `${file}: ${pattern}`))
    expect(found).toEqual([])
  })

  test('name the origin, or the domain: the deploy, the README, PRODUCT.md, ARCHITECTURE §3.2 and the comments of vite.config.ts, src/main.tsx and src/content/load.ts', () => {
    for (const file of ['.github/workflows/deploy.yml', 'README.md', 'PRODUCT.md', 'docs/ARCHITECTURE.md', 'docs/PLAN.md', 'vite.config.ts', 'src/main.tsx', 'src/content/load.ts']) {
      expect([file, read(file).includes(DOMAIN)]).toEqual([file, true])
    }
    const staticHosting = between(read('docs/ARCHITECTURE.md'), '### 3.2 Static hosting', '### 3.3 ')
    expect(staticHosting).toContain(`root of \`${ORIGIN}\``)
    expect(staticHosting).toContain('`VITE_BASE`')
  })

  test("PRODUCT.md no longer lists the domain as undecided, and W3-T16 asks for the domain of D-058 and not for O-1", () => {
    expect(between(read('PRODUCT.md'), '- **Undecided:**', '## Brand Commitments')).not.toContain('domain')
    const launch = trackerTasks().get('W3-T16') ?? ''
    expect(launch).toContain(`\`${DOMAIN}\``)
    expect(launch).not.toContain('(O-1)')
  })
})
