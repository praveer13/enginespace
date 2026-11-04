/*
 * The content compiler as a Vite plugin (ARCHITECTURE §4.1): `npm run dev` and `npm run build` compile `content/` with the same
 * module that `bun scripts/content/build.ts` runs in CI.
 *
 *   - At the start of a build or of the dev server it compiles, and writes `src/content/generated/` and `public/`. In a build, any
 *     error stops the build with the files and the lines. In the dev server the errors are logged and the server goes on, so a
 *     lesson can be mended while it runs.
 *   - In the dev server it watches `content/`. A change recompiles after a short pause that gathers an editor's several writes,
 *     and the files it writes under `src/content/generated/` reach the browser through Vite's own watcher, so an edit to a lesson
 *     reloads it. A compile error shows in Vite's overlay on the line it names, and the old output stays until the file is mended.
 *
 * It does nothing in a project that has no `content/course.yaml`, such as the fixture that tests/build.test.ts builds.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Logger, Plugin } from 'vite'
import { compileContent, writeOutputs } from './build.ts'
import { formatDiagnostic } from './parse.ts'
import type { Diagnostic } from './parse.ts'

/** How long the dev server waits after a change in `content/`, so that one save is one compile [estimated]. */
export const DEBOUNCE_MS = 40

interface Compiled {
  errors: Diagnostic[]
  warnings: Diagnostic[]
}

/** Compiles the project under `root` and writes its outputs unless an error stopped it. */
export function compileAndWrite(root: string): Compiled {
  const result = compileContent({ root })
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const warnings = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
  if (errors.length === 0) writeOutputs(root, result.outputs)
  return { errors, warnings }
}

export function contentPlugin(): Plugin {
  let root = ''
  let active = false
  let building = false
  let logger: Logger

  return {
    name: 'enginespace:content',

    configResolved(config) {
      root = config.root
      active = existsSync(path.join(root, 'content/course.yaml'))
      building = config.command === 'build'
      logger = config.logger
    },

    buildStart() {
      if (!active) return
      const { errors, warnings } = compileAndWrite(root)
      for (const warning of warnings) this.warn(formatDiagnostic(warning))
      if (errors.length === 0) return
      const message = `the content has ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}:\n${errors.map(formatDiagnostic).join('\n')}`
      if (building) this.error(message)
      else logger.error(message, { timestamp: true })
    },

    configureServer(server) {
      if (!active) return
      const content = path.join(root, 'content') + path.sep
      server.watcher.add(content)

      let timer: ReturnType<typeof setTimeout> | undefined
      let failing = false
      const recompile = () => {
        const { errors, warnings } = compileAndWrite(root)
        for (const warning of warnings) logger.warn(formatDiagnostic(warning), { timestamp: true })
        if (errors.length > 0) {
          failing = true
          logger.error(errors.map(formatDiagnostic).join('\n'), { timestamp: true })
          const first = errors[0]
          server.ws.send({
            type: 'error',
            err: { message: errors.map(formatDiagnostic).join('\n'), stack: '', plugin: 'enginespace:content', id: path.join(root, first.file), loc: { file: path.join(root, first.file), line: first.line, column: 0 } },
          })
        } else if (failing) {
          // The mended content may compile to the very bytes of the last good build, which moves no file and so reloads nothing.
          failing = false
          server.ws.send({ type: 'full-reload', path: '*' })
        }
      }
      const changed = (file: string) => {
        if (!path.resolve(file).startsWith(content)) return
        clearTimeout(timer)
        timer = setTimeout(recompile, DEBOUNCE_MS)
      }
      server.watcher.on('add', changed).on('change', changed).on('unlink', changed)
    },
  }
}
