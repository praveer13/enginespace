/** A counted word in its number: one pan, two pans. The kitchen counts the way a listener expects, and a count of one is not plural. */
export const pansWord = (n: number): string => (n === 1 ? 'pan' : 'pans')

export const stepsWord = (n: number): string => (n === 1 ? 'step' : 'steps')
