import { GAMES } from '@es/play'

/*
 * Level titles from the game registry. A lesson page loads this after its first paint (useLevelNames, levelNames.ts): the registry's code is
 * not part of the lesson's route.
 */

/** A level's title for the learner: "Full attention and a sliding window". */
export function levelTitle(game: string, level: string): string | undefined {
  return GAMES.get(game)?.levels.find((entry) => entry.id === level)?.title
}
