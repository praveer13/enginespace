/*
 * The forge labs that have a host (src/forge/labs.ts): the ids that /labs/:lab hands to the forge view, and nothing else. It is a list
 * of its own so that the lab page can ask "is this one of ours?" without loading the oracles. tests/forge/labs.test.ts holds the two
 * together, and a lab that W1-T22 and its successors add goes into both.
 */
export const FORGE_LAB_IDS: readonly string[] = ['toy']

export const isForgeLab = (id: string | undefined): id is string => id !== undefined && FORGE_LAB_IDS.includes(id)
