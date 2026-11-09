// Fixture stand-in for kernelspace's rng.ts, one of the two vendored files that packages/sim may import.
export const splitmix32 = (seed: number): number => seed
