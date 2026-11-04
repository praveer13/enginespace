// Fixture: a second clock.
export const elapsed = (since: number): number => performance.now() - since
