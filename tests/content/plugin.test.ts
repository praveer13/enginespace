/*
 * W0-T08's acceptance check 5 and the plugin behind it (ARCHITECTURE §4.1): `npm run dev` compiles `content/` and recompiles when
 * a lesson changes, `npm run build` compiles it first and stops on an error, and neither does anything in a project without
 * content.
 *
 * Three layers. The hooks run against a fake Vite, so each case of the dev server is exact and quick. Then a real `vite build`
 * and a real dev server run in Node on a copy of the sample content, in a project of their own: the server serves the compiled
 * lesson, and sends a reload when the lesson file changes, an error with the line when it breaks, and a reload when it is mended.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { contentPlugin, DEBOUNCE_MS } from '../../scripts/content/vite-plugin.ts'
import { LESSON, lineOf, project, readSample, repo, swap } from './support.ts'
import type { Edit } from './support.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The hooks, against a fake Vite                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

type Hook = (...args: unknown[]) => unknown

function fakeVite(root: string, command: 'build' | 'serve') {
  const logs = { warn: [] as string[], error: [] as string[] }
  const logger = { warn: (message: string) => logs.warn.push(message), error: (message: string) => logs.error.push(message), info: () => {} }
  const plugin = contentPlugin()
  ;(plugin.configResolved as Hook)({ root, command, logger })

  // Rollup's `this`: warn collects, error throws.
  const warnings: string[] = []
  const context = {
    warn: (message: string) => warnings.push(message),
    error: (message: string): never => {
      throw new Error(message)
    },
  }
  const buildStart = () => (plugin.buildStart as Hook).call(context, {})

  // A dev server: a watcher that the test fires, and a socket that collects what is sent.
  const handlers: Record<string, ((file: string) => void)[]> = {}
  const watched: string[] = []
  const sent: { type: string; [key: string]: unknown }[] = []
  const watcher = {
    add: (dir: string) => watched.push(dir),
    on(event: string, handler: (file: string) => void) {
      ;(handlers[event] ??= []).push(handler)
      return watcher
    },
  }
  const server = { watcher, ws: { send: (message: (typeof sent)[number]) => sent.push(message) }, config: { logger } }
  const serve = () => (plugin.configureServer as Hook)(server)
  const fire = (event: 'add' | 'change' | 'unlink', file: string) => handlers[event]?.forEach((handler) => handler(file))

  return { plugin, logs, warnings, buildStart, serve, fire, watched, sent }
}

const settle = () => Bun.sleep(DEBOUNCE_MS * 5)

describe('the plugin in a project with no content', () => {
  test('does nothing: it writes no file and watches nothing', async () => {
    const root = project({ 'content/course.yaml': null })
    const vite = fakeVite(root, 'serve')
    vite.buildStart()
    vite.serve()
    vite.fire('change', path.join(root, LESSON))
    await settle()
    expect(vite.watched).toEqual([])
    expect(vite.sent).toEqual([])
    expect(existsSync(path.join(root, 'src'))).toBe(false)
    expect(existsSync(path.join(root, 'public/llms.txt'))).toBe(false)
  })
})

describe('the plugin in a build', () => {
  test('writes the outputs at the start, and passes a warning on', () => {
    const root = project({ [LESSON]: swap('minutes: 45', 'minutes: 90') })
    const vite = fakeVite(root, 'build')
    vite.buildStart()
    expect(existsSync(path.join(root, 'src/content/generated/index.json'))).toBe(true)
    expect(existsSync(path.join(root, 'public/md/tr2/l0-sample.md'))).toBe(true)
    expect(vite.warnings).toEqual([expect.stringContaining(`${LESSON}:${lineOf(readSample(LESSON), 'minutes: 45')}: warning minutes-drift`)])
  })

  test('stops on an error, with every error and its file and line, and writes nothing', () => {
    const edit = swap('mode: practice', 'mode: practice\nspeed: 3')
    const root = project({ [LESSON]: edit })
    const vite = fakeVite(root, 'build')
    expect(() => vite.buildStart()).toThrow(`the content has 1 error:\n${LESSON}:${lineOf(edit(readSample(LESSON)), 'speed: 3')}: error unknown-key:`)
    expect(existsSync(path.join(root, 'src'))).toBe(false)
  })
})

describe('the plugin in the dev server', () => {
  async function started(edits: Record<string, Edit> = {}) {
    const root = project(edits)
    const vite = fakeVite(root, 'serve')
    vite.buildStart()
    vite.serve()
    return { root, vite, lesson: path.join(root, LESSON), generated: path.join(root, 'src/content/generated/lessons/tr2.l0-sample.json') }
  }
  const title = (file: string) => (JSON.parse(readFileSync(file, 'utf8')) as { title: string }).title

  test('compiles at the start, watches content/, and logs an error instead of stopping', async () => {
    const { root, vite } = await started()
    expect(vite.watched).toEqual([path.join(root, 'content') + path.sep])
    expect(existsSync(path.join(root, 'public/claims.json'))).toBe(true)

    const broken = fakeVite(project({ [LESSON]: swap('mode: practice', 'mode: practice\nspeed: 3') }), 'serve')
    expect(() => broken.buildStart()).not.toThrow()
    expect(broken.logs.error[0]).toContain('the content has 1 error')
  })

  test('recompiles when a lesson changes, and writes what changed', async () => {
    const { vite, lesson, generated } = await started()
    expect(title(generated)).toBe('A sample lesson that uses every block')
    writeFileSync(lesson, readFileSync(lesson, 'utf8').replace('title: A sample lesson that uses every block', 'title: An edited title'))
    vite.fire('change', lesson)
    await settle()
    expect(title(generated)).toBe('An edited title')
    expect(vite.sent).toEqual([])
  })

  test('waits out an editor\'s several writes and compiles once', async () => {
    const { vite, lesson } = await started({ [LESSON]: swap('minutes: 45', 'minutes: 90') })
    const before = vite.logs.warn.length
    for (let i = 0; i < 6; i += 1) {
      vite.fire('change', lesson)
      await Bun.sleep(DEBOUNCE_MS / 4)
    }
    await settle()
    // Each compile warns about the minutes once.
    expect(vite.logs.warn.length - before).toBe(1)
  })

  test('hears of a lesson that is added or removed', async () => {
    const { root, vite, lesson } = await started()
    const added = path.join(root, 'content/modules/tr2/lessons/l1-second.md')
    writeFileSync(added, readFileSync(lesson, 'utf8').replace('id: tr2.l0', 'id: tr2.l1').replace(/id: tr2\.l0\.p1/, 'id: tr2.l1.p1'))
    vite.fire('add', added)
    await settle()
    expect(existsSync(path.join(root, 'src/content/generated/lessons/tr2.l1-second.json'))).toBe(true)
    rmSync(added)
    vite.fire('unlink', added)
    await settle()
    expect(existsSync(path.join(root, 'src/content/generated/lessons/tr2.l1-second.json'))).toBe(false)
  })

  test('ignores a change outside content/', async () => {
    const { vite, root } = await started()
    const before = readFileSync(path.join(root, 'src/content/generated/index.json'), 'utf8')
    writeFileSync(path.join(root, 'content/course.yaml'), readFileSync(path.join(root, 'content/course.yaml'), 'utf8').replace('title: The step loop', 'title: The loop'))
    vite.fire('change', path.join(root, 'package.json'))
    vite.fire('change', path.join(root, 'src/content/generated/index.json'))
    await settle()
    expect(readFileSync(path.join(root, 'src/content/generated/index.json'), 'utf8')).toBe(before)
  })

  test('shows an error with its file and line, keeps the last good output, and reloads once it is mended', async () => {
    const { root, vite, lesson, generated } = await started()
    const original = readFileSync(lesson, 'utf8')
    const good = readFileSync(generated, 'utf8')

    const broken = original.replace('mode: practice', 'mode: practice\nspeed: 3')
    writeFileSync(lesson, broken)
    vite.fire('change', lesson)
    await settle()
    expect(vite.sent).toHaveLength(1)
    const [error] = vite.sent as { type: string; err: { message: string; id: string; plugin: string; loc: { file: string; line: number; column: number } } }[]
    expect(error.type).toBe('error')
    expect(error.err.plugin).toBe('enginespace:content')
    expect(error.err.id).toBe(lesson)
    expect(error.err.loc).toEqual({ file: lesson, line: lineOf(broken, 'speed: 3'), column: 0 })
    expect(error.err.message).toContain(`${LESSON}:${lineOf(broken, 'speed: 3')}: error unknown-key:`)
    expect(vite.logs.error.at(-1)).toContain('unknown key "speed"')
    expect(readFileSync(generated, 'utf8')).toBe(good)

    // A second save with the error still there shows it again, and reloads nothing.
    vite.fire('change', lesson)
    await settle()
    expect(vite.sent.map((message) => message.type)).toEqual(['error', 'error'])

    // Mended, the output is the very bytes of the last good build, which moves no file, so the plugin asks for the reload.
    writeFileSync(lesson, original)
    vite.fire('change', lesson)
    await settle()
    expect(vite.sent.map((message) => message.type)).toEqual(['error', 'error', 'full-reload'])
    expect(vite.sent[2]).toMatchObject({ path: '*' })
    expect(readFileSync(generated, 'utf8')).toBe(good)

    // And a later good save does not reload by itself: Vite's own watcher does that when a file changes.
    vite.fire('change', lesson)
    await settle()
    expect(vite.sent).toHaveLength(3)
    expect(existsSync(path.join(root, 'src'))).toBe(true)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* A real Vite, in Node                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

const vite = path.join(repo, 'node_modules/vite/bin/vite.js')

/** The sample content in a project with an entry page and a config of its own, which loads the plugin from this repo. */
function app(edits: Record<string, Edit> = {}): string {
  const root = project(edits)
  mkdirSync(path.join(root, 'src'), { recursive: true })
  writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><body><div id="out"></div><script type="module" src="/src/main.ts"></script></body></html>\n')
  writeFileSync(
    path.join(root, 'src/main.ts'),
    "import lesson from './content/generated/lessons/tr2.l0-sample.json'\ndocument.getElementById('out')!.textContent = lesson.title\n",
  )
  // A plain object, so the config imports nothing that has to resolve from a temporary folder.
  writeFileSync(
    path.join(root, 'vite.config.ts'),
    `import { contentPlugin } from ${JSON.stringify(path.join(repo, 'scripts/content/vite-plugin.ts'))}\nexport default { plugins: [contentPlugin()], logLevel: 'info' }\n`,
  )
  return root
}

describe('a real vite build', () => {
  test('compiles the content first, so the build carries the export, the claims and the index', () => {
    const root = app()
    const run = spawnSync('node', [vite, 'build', '--config', 'vite.config.ts', '--outDir', 'dist', '--emptyOutDir'], { cwd: root, encoding: 'utf8' })
    expect(run.status, run.stdout + run.stderr).toBe(0)
    for (const file of ['dist/llms.txt', 'dist/claims.json', 'dist/md/tr2/l0-sample.md', 'dist/figures/tr2/l0-sample.svg']) {
      expect(existsSync(path.join(root, file)), file).toBe(true)
    }
    // The lesson's JSON is in the bundle that imports it.
    const scripts = readdirSync(path.join(root, 'dist/assets')).filter((name) => name.endsWith('.js'))
    expect(scripts).toHaveLength(1)
    expect(readFileSync(path.join(root, 'dist/assets', scripts[0]), 'utf8')).toContain('A sample lesson that uses every block')
  }, 60_000)

  test('fails on a content error, with the file and the line, before it builds anything', () => {
    const edit = swap('mode: practice', 'mode: practice\nspeed: 3')
    const root = app({ [LESSON]: edit })
    const run = spawnSync('node', [vite, 'build', '--config', 'vite.config.ts', '--outDir', 'dist', '--emptyOutDir'], { cwd: root, encoding: 'utf8' })
    expect(run.status).not.toBe(0)
    expect(run.stdout + run.stderr).toContain(`${LESSON}:${lineOf(edit(readSample(LESSON)), 'speed: 3')}: error unknown-key`)
    expect(existsSync(path.join(root, 'dist'))).toBe(false)
  }, 60_000)
})

const children: ChildProcess[] = []
afterAll(() => {
  for (const child of children) child.kill()
})

async function freePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response('') })
  const port = server.port as number
  await server.stop(true)
  return port
}

/** `what` may be a function, so that the message says what was true when the wait gave up, not when it began. */
async function until(done: () => boolean, what: string | (() => string), ms = 10_000): Promise<void> {
  const start = Date.now()
  while (!done()) {
    if (Date.now() - start > ms) throw new Error(`gave up waiting for ${typeof what === 'function' ? what() : what}`)
    await Bun.sleep(25)
  }
}

describe('a real dev server: check 5, editing a lesson hot-reloads it', () => {
  test('serves the compiled lesson, reloads on an edit, shows an error with its line, and reloads when it is mended', async () => {
    const root = app()
    const port = await freePort()
    const server = spawn('node', [vite, '--config', 'vite.config.ts', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
      cwd: root,
      env: { ...process.env, NO_COLOR: '1' },
    })
    children.push(server)
    let log = ''
    let exited: number | null | undefined
    server.stdout.on('data', (chunk) => (log += chunk))
    server.stderr.on('data', (chunk) => (log += chunk))
    server.on('exit', (code) => (exited = code))
    // The banner is read without colour codes: picocolors colours output whenever CI is set, which splits "Local" from its colon.
    // A cold start on a pull request's two-core runner is far slower than on a laptop.
    await until(() => stripVTControlCharacters(log).includes('Local:') || exited !== undefined, () => `the server to start (log: ${log})`, 45_000)
    expect(exited, `the dev server exited before it was ready:\n${log}`).toBeUndefined()

    const base = `http://127.0.0.1:${port}`
    // ?import is how the page asks for a JSON module, and what puts it in the module graph, so that a change to it is a reload.
    const moduleText = async () => (await fetch(`${base}/src/content/generated/lessons/tr2.l0-sample.json?import`)).text()
    expect(await moduleText()).toContain('A sample lesson that uses every block')

    const messages: { type: string; err?: { message: string; loc?: { line: number } } }[] = []
    const socket = new WebSocket(`ws://127.0.0.1:${port}/`, 'vite-hmr')
    socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)))
    await until(() => messages.some((message) => message.type === 'connected'), 'the socket to connect')

    const lesson = path.join(root, LESSON)
    const original = readFileSync(lesson, 'utf8')

    // An edit: the page is told to reload, and the module it loads has the new words.
    writeFileSync(lesson, original.replace('title: A sample lesson that uses every block', 'title: An edited title, live'))
    await until(() => messages.some((message) => message.type === 'full-reload'), 'a reload after the edit')
    expect(await moduleText()).toContain('An edited title, live')

    // An error: the overlay gets the line.
    const broken = original.replace('mode: practice', 'mode: practice\nspeed: 3')
    messages.length = 0
    writeFileSync(lesson, broken)
    await until(() => messages.some((message) => message.type === 'error'), 'the error')
    const error = messages.find((message) => message.type === 'error')
    expect(error?.err?.message).toContain(`${LESSON}:${lineOf(broken, 'speed: 3')}: error unknown-key`)
    expect(error?.err?.loc?.line).toBe(lineOf(broken, 'speed: 3'))
    expect(await moduleText()).toContain('An edited title, live')

    // Mended: the old title is back, and the page reloads.
    messages.length = 0
    writeFileSync(lesson, original)
    await until(() => messages.some((message) => message.type === 'full-reload'), 'a reload after the mend')
    expect(await moduleText()).toContain('A sample lesson that uses every block')

    socket.close()
    server.kill()
  }, 120_000)
})
