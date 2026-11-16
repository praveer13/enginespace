import { needsWords, type Step } from '@/progress/next'
import { MAP } from './copy'

/** Where the learner left off, in a sentence, with where the way on goes: minutes and what the lesson needs when it starts a lesson. */
export function sentenceOf(step: Step, last: string | null): string {
  const where = step.minutes === undefined ? '' : ` (${step.minutes} min${step.needs.length === 0 ? '' : `, ${needsWords(step.needs)}`})`
  const next = `${MAP.way.next} ${step.reason}${where}.`
  if (last !== null) return `${last} ${next}`
  return step.word === 'Start' ? `${MAP.way.fresh} ${next}` : next
}
