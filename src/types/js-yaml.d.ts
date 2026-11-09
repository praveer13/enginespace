/*
 * The one part of js-yaml 4.1.1 that the content compiler uses (ARCHITECTURE §4.1, §14). js-yaml ships no types and
 * @types/js-yaml is not on the dependency list, so this declares `load` and what it takes and throws.
 *
 * The compiler loads every YAML file with `schema: CORE_SCHEMA`. The default schema turns a bare 2026-11-03 into a Date,
 * and the date fields of packages/schema want a string (common.ts).
 */
declare module 'js-yaml' {
  /** A YAML schema. The compiler passes `CORE_SCHEMA` and never builds one. */
  export class Schema {
    private constructor()
  }

  /** YAML 1.2's core schema: null, booleans, integers, floats and strings, and no timestamps. */
  export const CORE_SCHEMA: Schema

  /** Where a parse stopped: both numbers count from 0. */
  export interface Mark {
    line: number
    column: number
    position: number
  }

  export class YAMLException extends Error {
    /** The error without the position and the snippet that `message` adds. */
    reason: string
    mark: Mark | undefined
  }

  export interface LoadOptions {
    schema?: Schema
  }

  /** Parses one YAML document. It throws a YAMLException on a syntax error, and on a repeated mapping key. */
  export function load(input: string, options?: LoadOptions): unknown
}
