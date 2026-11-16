/*
 * One question that the content compiler and the dev server's plugin both ask of a directory entry: is it a file that can be read?
 */
import { statSync } from 'node:fs'

/**
 * Whether `file` is a regular file once a symbolic link is followed. A dangling link (Emacs writes `.#name.md` beside a file it
 * edits), a link to a folder, a socket, a pipe and a file that has just vanished are not, and none of them throws: one stat that
 * reports a missing entry as `undefined`, so that no editor's temporary file can come between a check and a use.
 */
export function isRegularFile(file: string): boolean {
  try {
    return statSync(file, { throwIfNoEntry: false })?.isFile() === true
  } catch {
    // ELOOP, EACCES and the like: an entry that cannot be read is not listed.
    return false
  }
}
