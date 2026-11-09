// Fixture: entropy outside the seeded rng.
export const seed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]
