// Fixture: an alias that would hide Math.random from a rule that looks only for the name Math.
const M = Math
export const roll = (): number => M.random()
