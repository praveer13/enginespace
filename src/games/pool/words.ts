/** A counted word in its number: one page, two pages. A count of one is not plural. */
export const pagesWord = (n: number): string => (n === 1 ? 'page' : 'pages')

export const stepsWord = (n: number): string => (n === 1 ? 'step' : 'steps')

export const tokensWord = (n: number): string => (n === 1 ? 'token' : 'tokens')

/** A request's short name on the diagram and in the lists: request 0 is R1. */
export const reqName = (id: number): string => `R${id + 1}`

/** A request's name in a sentence: request 0 is "request 1". */
export const reqWords = (id: number): string => `request ${id + 1}`
