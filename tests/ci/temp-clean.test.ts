/*
 * W2b-T21: a unit run leaves no temporary project behind. tempDir (tests/content/support.ts) makes an `enginespace-<label>-` folder in
 * the temporary folder for each scratch project, and the folders are removed when the run ends (tests/ci/temp-preload.ts, which
 * bunfig.toml loads once for each run). Removing them in an afterAll left every file's folders behind but the first importer's, since
 * Bun runs a file's afterAll only for the file that imports the module [measured 2026-11-19: 34 folders left by shard 1 of 4].
 *
 * This test holds that to a run of three files that each make scratch projects, in a child process with TMPDIR set to a folder of its
 * own: the four unit files that call tempDir took 97 s, which would have moved a shard's time, so the files here are made for the test.
 */
import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { root } from './support'

const FILES = 3

test('a run of several files that make scratch projects leaves no enginespace-* folder in the temporary folder', () => {
  const outer = mkdtempSync(path.join(tmpdir(), 'enginespace-clean-'))
  const tmp = path.join(outer, 'tmp')
  mkdirSync(tmp)
  try {
    const support = path.join(root, 'tests/content/support.ts')
    const files: string[] = []
    for (let i = 1; i <= FILES; i++) {
      const file = path.join(outer, `project-${i}.test.ts`)
      writeFileSync(
        file,
        `import { test } from 'bun:test'\nimport { tempDir } from ${JSON.stringify(support)}\n` +
          `test('makes a scratch project ${i}', () => { tempDir('project') })\n`,
      )
      files.push(file)
    }
    const run = spawnSync(process.execPath, ['test', ...files], {
      cwd: root,
      env: { ...process.env, TMPDIR: tmp },
      encoding: 'utf8',
    })
    expect(run.status).toBe(0)
    expect(readdirSync(tmp).filter((name) => name.startsWith('enginespace-'))).toEqual([])
  } finally {
    rmSync(outer, { recursive: true, force: true })
  }
}, 120_000)
