// Fixture for tests/lint/pure.test.ts. tsconfig.json beside it extends the repo's tsconfig.pure.json and compiles only this
// file. Pure code has lib ES2022 and no ambient types, so each global below is a type error.
export const title = (): string => document.title
export const width = (): number => window.innerWidth
export const now = (): number => performance.now()
export const entropy = (): number => crypto.getRandomValues(new Uint32Array(1))[0]
export const later = (): void => {
  setTimeout(() => undefined, 0)
}
