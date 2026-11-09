// Fixture for tests/lint/determinism.test.ts: an unseeded draw. verify:determinism must fail on this file.
export const roll = (sides: number): number => Math.floor(Math.random() * sides) + 1
