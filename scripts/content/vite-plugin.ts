/*
 * The content compiler as a Vite plugin (ARCHITECTURE §4.1): `npm run dev` and `npm run build` compile `content/` with the same
 * module that `bun scripts/content/build.ts` runs in CI.
 *
 *   - At the start of a build or of the dev server it compiles, and writes `src/content/generated/` and `public/`. In a build, any
 *     error stops the build with the files and the lines. In the dev server the errors are logged and the server goes on, so a
 *     lesson can be mended while it runs.
 *   - The dev server compiles as soon as its config is resolved, which is before Vite starts its file watcher, so the watcher's
 *     first walk of the project finds every file the compile wrote. A folder written while that walk runs can be missed for good:
 *     the walk lists a folder before it watches it, and a folder made in between is never watched, nor the files in it.
 *   - Then it waits until Vite's watcher watches every file of `content/` and every file the compile wrote, compiles again, and
 *     logs "watching content/". The second compile takes in a save that landed before the watcher reached the file, which the
 *     watcher can take for the file's first state, and then does not report. It asks only for files a watcher can list (a regular
 *     file, once a link is followed). If it is still waiting after WATCH_WAIT_MS, as when a file is under Vite's
 *     `server.watch.ignored`, it compiles, warns with the first file it waited for, acts on changes, and stops polling. A server
 *     that closes during the wait ends it, with nothing compiled or logged. Neither Vite's "Local:" banner nor the watcher's own
 *     `ready` event means that the walk has reached these files, and often it has not (docs/TRACKER.md, W0-T08's follow-up).
 *   - From then on a change in `content/` recompiles after a short pause that gathers an editor's several writes, and the files it
 *     writes under `src/content/generated/` reach the browser through Vite's own watcher, so an edit to a lesson reloads it. A
 *     change that comes while the plugin waits for the watcher is left to the compile that ends the wait, so that nothing is
 *     written into a file that Vite does not watch yet.
 *   - A compile error shows in Vite's overlay on the line it names, and the old output stays until the file is mended. Once it is,
 *     the page reloads: through Vite's watcher when the mend rewrote a module the page has loaded, since a reload sent before Vite
 *     has seen the new file would load the old module from Vite's cache; and from the plugin otherwise, as when the mend compiles
 *     to the very bytes of the last good build.
 *
 * It does nothing in a project that has no `content/course.yaml`, such as the fixture that tests/build.test.ts builds, nor under
 * `vite preview`.
 */
import type { Dirent } from 'node:fs'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Logger, Plugin, ViteDevServer } from 'vite'
import { compileContent, writeOutputs } from './build.ts'
import type { Reader } from './build.ts'
import { isRegularFile } from './files.ts'
import { formatDiagnostic } from './parse.ts'
import type { Diagnostic } from './parse.ts'

/** How long the dev server waits after a change in `content/`, so that one save is one compile [estimated]. */
export const DEBOUNCE_MS = 40

/** How often the dev server looks whether Vite's watcher has reached every file yet, until it has [estimated]. */
export const WATCH_POLL_MS = 25

/**
 * The longest the dev server waits for Vite's watcher to list every file, before it goes on without that cover [estimated]. Cover
 * came about 0.3 s after the server listened on one core and 0.83 s on two, on the real site [measured 2026-11-16, 0413aed]. The
 * bound is ten times the larger, so that a slow machine does not bring back the race that the wait closes, and a false warning
 * costs a line. It is the product's fallback, so that a file the watcher never lists (an ignored path) leaves the plugin as it
 * was before the wait, and not silent; it is not a test's timeout.
 */
export const WATCH_WAIT_MS = 10_000

/** The line the dev server logs once Vite's watcher has reached every file of `content/` and every file of the output. */
export const WATCHING = 'watching content/'

export interface Compiled {
  errors: Diagnostic[]
  warnings: Diagnostic[]
  /** Every file the compile has an output for, relative to the root. */
  outputs: string[]
  /** The files it wrote or removed, relative to the root: none when an error stopped it, or when every output was already right. */
  written: string[]
}

/** Compiles the project under `root` and writes its outputs unless an error stopped it. */
export function compileAndWrite(root: string, read?: Reader): Compiled {
  const result = compileContent({ root, read })
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const warnings = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
  const outputs = result.outputs.map((output) => output.path)
  if (errors.length > 0) return { errors, warnings, outputs, written: [] }
  const { written, removed } = writeOutputs(root, result.outputs)
  return { errors, warnings, outputs, written: [...written, ...removed] }
}

/**
 * Every file under `dir` that a watcher can list: a regular file once a symbolic link is followed. A dangling link (Emacs writes
 * `.#name.md` beside a file it edits), a link to a folder, a socket and a pipe are left out, since chokidar never lists them.
 */
export function filesUnder(dir: string, list: (dir: string) => Dirent[] = (folder) => readdirSync(folder, { withFileTypes: true })): string[] {
  let entries: Dirent[]
  try {
    entries = list(dir)
  } catch {
    // A folder that is gone (removed between the listing of its parent and now), or one that cannot be read: nothing to list.
    return []
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(full, list)
    return isRegularFile(full) ? [full] : []
  })
}

const summary = (errors: Diagnostic[]) => `the content has ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}:\n${errors.map(formatDiagnostic).join('\n')}`
const said = (compiled: Compiled) => [...compiled.errors, ...compiled.warnings].map(formatDiagnostic).join('\n')

/** Whether the page has loaded the module of `file` (Vite keys its modules by the file's path with forward slashes), so that Vite's watcher reloads or updates the page when the file changes. */
function loaded(server: ViteDevServer, file: string): boolean {
  return (server.environments.client.moduleGraph.getModulesByFile(file.split(path.sep).join('/'))?.size ?? 0) > 0
}

/**
 * The options of `contentPlugin`. The plugin object that it returns keeps the state of one server (its timers, its watcher wait,
 * its first compile) in a closure: it is not to be shared between servers. Make one plugin for each `createServer`.
 */
export interface ContentPluginOptions {
  /** How a source file is read; tests inject one that removes a file between the compiler's walk and its read. Defaults to the file system. */
  read?: Reader
  /** How long to wait for Vite's watcher to list every file; tests inject a short one. Defaults to WATCH_WAIT_MS. */
  watchWaitMs?: number
}

export function contentPlugin(options: ContentPluginOptions = {}): Plugin {
  const watchWaitMs = options.watchWaitMs ?? WATCH_WAIT_MS
  const compile = () => compileAndWrite(root, options.read)
  let root = ''
  let active = false
  let building = false
  let previewing = false
  /** Set when Vite closes the dev server: its plugin container calls `buildEnd` and then `closeBundle` on every plugin (vite 7.3.0). */
  let closed = false
  let stop = () => {}
  let logger: Logger
  /** The dev server's first compile, made before Vite's watcher starts. */
  let first: Compiled | undefined

  return {
    name: 'enginespace:content',

    config(_config, env) {
      previewing = env.isPreview === true
    },

    configResolved(config) {
      root = config.root
      active = existsSync(path.join(root, 'content/course.yaml'))
      building = config.command === 'build'
      logger = config.logger
      if (!active || building || previewing) return
      // The dev server, whose watcher Vite creates once this hook returns.
      first = compile()
      for (const warning of first.warnings) logger.warn(formatDiagnostic(warning), { timestamp: true })
      if (first.errors.length > 0) logger.error(summary(first.errors), { timestamp: true })
    },

    buildStart() {
      if (!active || !building) return
      const { errors, warnings } = compile()
      for (const warning of warnings) this.warn(formatDiagnostic(warning))
      if (errors.length > 0) this.error(summary(errors))
    },

    buildEnd() {
      if (!building) stop()
    },

    closeBundle() {
      if (!building) stop()
    },

    configureServer(server) {
      // A dev server with `server.watch: null` has no watcher, so nothing here would ever hear of a change.
      if (!active || server.config.server.watch === null) return
      closed = false
      const content = path.join(root, 'content') + path.sep
      server.watcher.add(content)

      let failing = (first?.errors.length ?? 0) > 0
      const report = (compiled: Compiled) => {
        for (const warning of compiled.warnings) logger.warn(formatDiagnostic(warning), { timestamp: true })
        if (compiled.errors.length > 0) {
          failing = true
          logger.error(compiled.errors.map(formatDiagnostic).join('\n'), { timestamp: true })
          const head = compiled.errors[0]
          server.ws.send({
            type: 'error',
            err: { message: compiled.errors.map(formatDiagnostic).join('\n'), stack: '', plugin: 'enginespace:content', id: path.join(root, head.file), loc: { file: path.join(root, head.file), line: head.line, column: 0 } },
          })
        } else if (failing) {
          failing = false
          if (!compiled.written.some((file) => loaded(server, path.join(root, file)))) server.ws.send({ type: 'full-reload', path: '*' })
        }
      }

      // The first file of content/ or of the first compile's output that Vite's watcher does not list yet, if any.
      const missing = (): string | undefined => {
        const watched = server.watcher.getWatched()
        const has = (file: string) => watched[path.dirname(file)]?.includes(path.basename(file)) === true
        const outputs = (first?.outputs ?? []).map((file) => path.join(root, file)).filter((file) => existsSync(file))
        return [...filesUnder(content), ...outputs].find((file) => !has(file))
      }
      let watching = false
      const started = Date.now()
      const catchUp = () => {
        watching = true
        const compiled = compile()
        // Quiet when nothing has changed since the first compile, which has said all there was to say.
        if (compiled.written.length > 0 || !first || said(compiled) !== said(first)) report(compiled)
      }
      const wait = () => {
        if (closed) return
        const file = missing()
        if (file === undefined) {
          catchUp()
          logger.info(WATCHING, { timestamp: true })
          return
        }
        if (Date.now() - started >= watchWaitMs) {
          // Never silence: act on change events as the plugin did before it waited, and say what may go wrong.
          catchUp()
          logger.warn(`Vite's watcher has not listed ${path.relative(root, file).split(path.sep).join('/')} after ${watchWaitMs} ms, so a save to a file it has not listed may not reload`, { timestamp: true })
          return
        }
        poll = setTimeout(wait, WATCH_POLL_MS)
        poll.unref?.()
      }

      let timer: ReturnType<typeof setTimeout> | undefined
      let poll: ReturnType<typeof setTimeout> | undefined
      const changed = (file: string) => {
        if (closed || !watching || !path.resolve(file).startsWith(content)) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          if (!closed) report(compile())
        }, DEBOUNCE_MS)
      }
      stop = () => {
        closed = true
        clearTimeout(timer)
        clearTimeout(poll)
      }
      server.watcher.on('add', changed).on('change', changed).on('unlink', changed)
      wait()
    },
  }
}
