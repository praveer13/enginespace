// Fixture: a Math function that ECMA-262 does not precisely specify, and that kernelspace's lint bans too (ARCHITECTURE §5.1).
export const bitsFor = (count: number): number => Math.ceil(Math.log2(count))
