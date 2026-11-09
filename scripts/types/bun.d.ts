/*
 * The parts of Bun that scripts/ and tests/ call, declared here so that tsc can check them (tsconfig.tools.json, W1b-T14).
 *
 * Bun ships its types as `@types/bun`, and that package is not on ARCHITECTURE §14's list: a dependency needs a DECISIONS record and an
 * exact pin first, and W0 left both folders unchecked for that reason. This file is the other way, the one that src/types/js-yaml.d.ts
 * takes for js-yaml: a declaration of what the repository uses and nothing more. A call to anything else is an error that names it, and
 * the fix is a declaration here, beside the call that needed it. The suite runs on Bun 1.3.14 (the pin, ARCHITECTURE §10.3), and each
 * declaration is what a call of the repository needs of it, as that Bun answers it. D-061 records why this and not the package.
 *
 * It is looser than `@types/bun` in one place on purpose. A matcher takes `unknown` where Bun's own take the type of the value under
 * test, so a test that already passes at run time cannot fail to compile for how it spells its expectation. What the compiler checks
 * in a test is the code around the assertion: the arguments it passes to the code under test and the shape of what comes back.
 */

declare module 'bun:test' {
  /** A test, a hook or a suite body. Bun awaits a promise that it returns. */
  type Body = () => void | Promise<unknown>

  /** A row of `each`'s table without the `readonly` of an `as const` table, which a callback's parameters cannot take. */
  type Row<T> = { -readonly [K in keyof T]: T[K] }

  /** `each`'s table: a row that is a tuple spreads into the body's arguments, any other row is its one argument. */
  interface Each<R> {
    <T extends readonly [unknown, ...unknown[]]>(table: readonly T[]): (label: string, body: (...args: Row<T>) => R, timeout?: number) => void
    <T extends readonly unknown[]>(table: readonly T[]): (label: string, body: (...args: Row<T>) => R, timeout?: number) => void
    <T>(table: readonly T[]): (label: string, body: (row: T) => R, timeout?: number) => void
  }

  /** `test(label, body, timeout)`. The time limit is in milliseconds, and the default is `setDefaultTimeout`'s. */
  export const test: {
    (label: string, body: Body, timeout?: number): void
    each: Each<void | Promise<unknown>>
    /** `test.skipIf(condition)(label, body)` registers the test as skipped when the condition holds. */
    skipIf(condition: unknown): (label: string, body: Body, timeout?: number) => void
  }

  export const describe: {
    (label: string, body: () => void | Promise<void>): void
    each: Each<void>
    /** `describe.skipIf(condition)(label, body)` skips every test of the suite when the condition holds. */
    skipIf(condition: unknown): (label: string, body: () => void | Promise<void>) => void
  }

  export function beforeAll(body: Body, timeout?: number): void
  export function afterAll(body: Body, timeout?: number): void
  export function beforeEach(body: Body, timeout?: number): void
  export function afterEach(body: Body, timeout?: number): void

  /** The time limit of a test that sets none, in milliseconds. */
  export function setDefaultTimeout(milliseconds: number): void

  /** What `expect.any`, `expect.stringContaining` and the rest return: a value that stands for a family of values inside an expectation. */
  export interface AsymmetricMatcher {
    asymmetricMatch(other: unknown): boolean
  }

  type Constructor = abstract new (...args: never[]) => unknown

  /** The assertions on one value. `R` is what each returns: nothing, or a promise for the assertion on a promise. */
  interface Assertions<T, R> {
    toBe(expected: unknown): R
    toEqual(expected: unknown): R
    toStrictEqual(expected: unknown): R
    toMatchObject(expected: object): R
    toContain(expected: unknown): R
    toContainEqual(expected: unknown): R
    toHaveLength(expected: number): R
    toHaveProperty(keyPath: string | readonly (string | number)[], value?: unknown): R
    toMatch(expected: string | RegExp): R
    toStartWith(expected: string): R
    toBeCloseTo(expected: number, numDigits?: number): R
    toBeGreaterThan(expected: number | bigint): R
    toBeGreaterThanOrEqual(expected: number | bigint): R
    toBeLessThan(expected: number | bigint): R
    toBeLessThanOrEqual(expected: number | bigint): R
    toBeInstanceOf(expected: Constructor): R
    /** `expected` is a string or a pattern that the error's message contains or matches, or the error (class) that is thrown. */
    toThrow(expected?: string | RegExp | Error | Constructor): R
    toSatisfy(predicate: (value: T) => boolean): R
    toBeNull(): R
    toBeUndefined(): R
    toBeDefined(): R
    toBeTruthy(): R
    toBeFalsy(): R
    toBeFunction(): R
    /** The value is a spy (`spyOn`) that has been called. */
    toHaveBeenCalled(): R
    toHaveBeenCalledTimes(expected: number): R
  }

  /** The assertions on one value, and what `not`, `resolves` and `rejects` turn them into. */
  export interface Matchers<T> extends Assertions<T, void> {
    not: Assertions<T, void>
    /** The assertions on what a promise settles to. Each returns a promise, so a test awaits it. */
    resolves: Assertions<Awaited<T>, Promise<void>> & { not: Assertions<Awaited<T>, Promise<void>> }
    /** The assertions on what a promise rejects with. Each returns a promise, so a test awaits it. */
    rejects: Assertions<unknown, Promise<void>> & { not: Assertions<unknown, Promise<void>> }
  }

  export const expect: {
    /** `message` is printed when the assertion fails. */
    <T>(actual: T, message?: string): Matchers<T>
    anything(): AsymmetricMatcher
    any(constructor: Constructor): AsymmetricMatcher
    stringContaining(text: string): AsymmetricMatcher
    stringMatching(pattern: string | RegExp): AsymmetricMatcher
    arrayContaining(items: readonly unknown[]): AsymmetricMatcher
    objectContaining(properties: object): AsymmetricMatcher
    /** Reads `value` again and again until the assertion holds or the time is up. Each assertion returns a promise. */
    poll<T>(value: () => T | Promise<T>, options?: { interval?: number; timeout?: number }): Matchers<T>['resolves']
  }

  /** A function that `spyOn` replaced, with what was asked of it. */
  export interface Mock<F extends (...args: never[]) => unknown> {
    (...args: Parameters<F>): ReturnType<F>
    mock: { calls: Parameters<F>[] }
    mockImplementation(implementation: F): this
    /** Puts the original back. */
    mockRestore(): void
  }

  export function spyOn<T extends object, K extends keyof T>(target: T, method: K): Mock<T[K] extends (...args: never[]) => unknown ? T[K] : never>

  /** The fake clock of Jest's API, which Bun implements. */
  export const jest: {
    useFakeTimers(): void
    useRealTimers(): void
    advanceTimersByTime(milliseconds: number): void
  }
}

/** `import.meta.dir`, Bun's name for the folder of the module (Node's is `import.meta.dirname`). */
interface ImportMeta {
  readonly dir: string
}

/** The address a `Bun.serve` server listens on, and how to end it. */
interface BunServer {
  /** The port, which is the one that the OS chose when `serve` was asked for port 0. */
  readonly port: number | undefined
  stop(closeActiveConnections?: boolean): Promise<void>
}

/** A file on disk as a `Blob`, so a `Response` can stream it. */
interface BunFile extends Blob {
  exists(): Promise<boolean>
}

/** A process that `Bun.spawn` started. Its output is piped, which is the only mode the suite asks for. */
interface BunSubprocess {
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  /** Settles with the exit code. */
  readonly exited: Promise<number>
  kill(signal?: number | NodeJS.Signals): void
}

/** The hasher of `Bun.CryptoHasher`: `update` takes data and `digest` reads the hash. */
interface BunCryptoHasher {
  update(data: string | ArrayBufferView | ArrayBuffer): this
  digest(encoding: 'hex'): string
}

declare const Bun: {
  /** Settles after `milliseconds`. */
  sleep(milliseconds: number): Promise<void>
  file(path: string): BunFile
  serve(options: { port: number; hostname?: string; fetch(request: Request): Response | Promise<Response> }): BunServer
  spawn(command: string[], options?: { stdout?: 'pipe'; stderr?: 'pipe'; cwd?: string; env?: Record<string, string | undefined> }): BunSubprocess
  CryptoHasher: new (algorithm: 'sha256') => BunCryptoHasher
}

/** An element, as `HTMLRewriter` hands it to a handler. The DOM's `Element` is another type: this one is Bun's. */
interface RewriterElement {
  readonly tagName: string
  readonly attributes: IterableIterator<[string, string]>
  getAttribute(name: string): string | null
  /** Replaces what is inside the element. With `html: true` the content is markup, otherwise it is escaped as text. */
  setInnerContent(content: string, options?: { html?: boolean }): RewriterElement
  /** Replaces the element and what is inside it. */
  replace(content: string, options?: { html?: boolean }): RewriterElement
  remove(): RewriterElement
  /** Calls `handler` when the element's end tag is reached. */
  onEndTag(handler: (end: RewriterEndTag) => unknown): void
}

interface RewriterEndTag {
  before(content: string, options?: { html?: boolean }): RewriterEndTag
}

/** A run of text inside an element. A long text arrives in several chunks. */
interface RewriterText {
  readonly text: string
}

/**
 * Bun's streaming HTML rewriter, which reads a document as an HTML5 parser does and calls a handler for each element that matches. A
 * handler's return value is ignored, except that a promise is awaited.
 */
declare class HTMLRewriter {
  on(selector: string, handlers: { element?(element: RewriterElement): unknown; text?(chunk: RewriterText): unknown }): HTMLRewriter
  transform(response: Response): Response
}
