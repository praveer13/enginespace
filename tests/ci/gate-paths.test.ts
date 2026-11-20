/*
 * W2b-T03: scripts/gate/paths.ts refuses a leaked path. The paths are built from pieces, so that this file holds none of them: the gate
 * reads its own branch's added lines.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { diffLeaks, leaks, login, textLeaks } from '../../scripts/gate/paths'

const home = ['', 'home', 'someone', 'work', 'a.ts'].join('/')
const mac = ['', 'Users', 'someone', 'work'].join('/')
const scratch = ['', 'tmp', 'claude-1000', 'x'].join('/')
const added = (file: string, ...lines: string[]) => ['diff --git a/' + file + ' b/' + file, '--- a/' + file, '+++ b/' + file, `@@ -1,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`), ''].join('\n')

describe('what a line leaks', () => {
  test('a Linux home, a macOS home, a build agent scratch directory', () => {
    expect(leaks(`see ${home}`, undefined)).toEqual(['a Linux home directory'])
    expect(leaks(`see ${mac}`, undefined)).toEqual(['a macOS home directory'])
    expect(leaks(`see ${scratch}`, undefined)).toEqual(['a build agent scratch directory'])
  })

  test('a repository-relative path and prose are clean', () => {
    expect(leaks('scripts/gate/paths.ts and docs/guide/page.md and the front page', undefined)).toEqual([])
  })

  test('the login name is read at run time, whole-word and in any case', () => {
    const name = 'zelda'
    expect(leaks('written by Zelda today', name)).toEqual(['the login name'])
    expect(leaks('zeldas and azelda', name)).toEqual([])
    expect(login({ USER: 'zelda' })).toBe('zelda')
    expect(login({ LOGNAME: 'zelda' })).toBe('zelda')
    expect(login({ USER: 'root' })).toBeUndefined()
    expect(login({ USER: 'ab' })).toBeUndefined()
  })
})

describe('a diff and a text', () => {
  test('only added lines are read, and the finding names the file and the line', () => {
    const diff = added('docs/a.md', 'clean', `a path ${home}`)
    expect(diffLeaks(diff, undefined)).toEqual([{ where: 'docs/a.md', line: 2, what: 'a Linux home directory' }])
    const removed = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1,1 +1,0 @@', `-${home}`, ''].join('\n')
    expect(diffLeaks(removed, undefined)).toEqual([])
  })

  test('the pull request text is read line by line', () => {
    expect(textLeaks(`title\n\nbody ${scratch}\nok`, undefined)).toEqual([{ where: 'text', line: 3, what: 'a build agent scratch directory' }])
  })
})

describe('the command', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'es-paths-'))
  const git = (...args: string[]) => {
    const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
    if (run.status !== 0) throw new Error(run.stderr)
  }
  const script = path.resolve(import.meta.dirname, '../../scripts/gate/paths.ts')

  test('exits 1 on a home path in a commit or in the text, and does not print the path', () => {
    git('init', '-q', '-b', 'base')
    writeFileSync(path.join(dir, 'a.md'), 'clean\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'base')
    git('checkout', '-q', '-b', 'head')
    mkdirSync(path.join(dir, 'docs'))
    writeFileSync(path.join(dir, 'docs/a.md'), `see ${home}\n`)
    git('add', '-A')
    git('commit', '-q', '-m', 'head')
    const run = spawnSync('bun', [script, '--repo', dir, '--base', 'base', '--head', 'head'], { encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stdout).toContain('docs/a.md:1 holds a Linux home directory')
    expect(run.stdout).not.toContain('someone')

    const clean = spawnSync('bun', [script, '--repo', dir, '--base', 'base', '--head', 'base'], { encoding: 'utf8' })
    expect(clean.status).toBe(0)

    const text = path.join(dir, 'pr.txt')
    writeFileSync(text, `Fixes things\n${scratch}\n`)
    const pr = spawnSync('bun', [script, '--repo', dir, '--text', text], { encoding: 'utf8' })
    expect(pr.status).toBe(1)
    expect(pr.stdout).toContain('text:2 holds a build agent scratch directory')
    rmSync(dir, { recursive: true, force: true })
  })
})
