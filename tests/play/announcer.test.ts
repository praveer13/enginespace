/*
 * W0-T14 acceptance check 4: ten messages within 100 ms produce one announcement (fake timers).
 *
 * The announcer (ARCHITECTURE §6.9) holds messages for a short window and speaks them as one, and during auto-play speaks at most
 * once a second. Bun's fake timers drive the page's real setTimeout and Date.now, which is the path the game takes.
 */
import { afterEach, describe, expect, jest, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ANNOUNCE_MAX_CHARS, ANNOUNCE_WINDOW_MS, AUTOPLAY_GAP_MS, createAnnouncer } from '@/games/kit/announcer'
import { LiveRegion } from '@/games/kit/LiveRegion'

afterEach(() => {
  jest.useRealTimers()
})

function announcer(options?: Parameters<typeof createAnnouncer>[1]) {
  jest.useFakeTimers()
  const spoken: string[] = []
  return { spoken, announcer: createAnnouncer((text) => spoken.push(text), options) }
}

describe('ten messages within 100 ms produce one announcement', () => {
  test('the window is 100 ms and the gap during auto-play is one second', () => {
    expect(ANNOUNCE_WINDOW_MS).toBe(100)
    expect(AUTOPLAY_GAP_MS).toBe(1000)
  })

  test('ten distinct messages, nine milliseconds apart, are spoken once, in order, when the window ends', () => {
    const { spoken, announcer: voice } = announcer()
    for (let i = 0; i < 10; i++) {
      voice.say(`Message ${i}.`)
      jest.advanceTimersByTime(9)
    }
    expect(spoken).toEqual([])
    jest.advanceTimersByTime(10)
    expect(spoken).toEqual(['Message 0. Message 1. Message 2. Message 3. Message 4. Message 5. Message 6. Message 7. Message 8. Message 9.'])
    jest.advanceTimersByTime(10_000)
    expect(spoken).toHaveLength(1)
  })

  test('ten messages in the same instant are one announcement too', () => {
    const { spoken, announcer: voice } = announcer()
    for (let i = 0; i < 10; i++) voice.say(`Line ${i}`)
    expect(spoken).toEqual([])
    jest.advanceTimersByTime(99)
    expect(spoken).toEqual([])
    jest.advanceTimersByTime(1)
    expect(spoken).toHaveLength(1)
  })

  test('ten of the same message are said once', () => {
    const { spoken, announcer: voice } = announcer()
    for (let i = 0; i < 10; i++) voice.say('Slot 2 is empty.')
    jest.advanceTimersByTime(100)
    expect(spoken).toEqual(['Slot 2 is empty.'])
  })

  test('the window opens with the first message and does not slide with the rest', () => {
    const { spoken, announcer: voice } = announcer()
    voice.say('first')
    jest.advanceTimersByTime(60)
    voice.say('second')
    jest.advanceTimersByTime(40)
    expect(spoken).toEqual(['first second'])
    voice.say('third')
    jest.advanceTimersByTime(99)
    expect(spoken).toEqual(['first second'])
    jest.advanceTimersByTime(1)
    expect(spoken).toEqual(['first second', 'third'])
  })

  test('messages that come a window apart are separate announcements', () => {
    const { spoken, announcer: voice } = announcer()
    voice.say('one')
    jest.advanceTimersByTime(150)
    voice.say('two')
    jest.advanceTimersByTime(150)
    expect(spoken).toEqual(['one', 'two'])
  })

  test('an empty message says nothing, and a message with spaces around it is trimmed', () => {
    const { spoken, announcer: voice } = announcer()
    voice.say('')
    voice.say('   ')
    jest.advanceTimersByTime(500)
    expect(spoken).toEqual([])
    voice.say('  Step 3.  ')
    jest.advanceTimersByTime(100)
    expect(spoken).toEqual(['Step 3.'])
  })
})

describe('during auto-play at most one announcement leaves per second', () => {
  test('a second burst waits until a second after the first announcement', () => {
    const { spoken, announcer: voice } = announcer()
    voice.setAutoplay(true)
    voice.say('step 1')
    jest.advanceTimersByTime(100)
    expect(spoken).toEqual(['step 1'])
    voice.say('step 2')
    jest.advanceTimersByTime(500)
    voice.say('step 3')
    jest.advanceTimersByTime(499)
    expect(spoken).toEqual(['step 1'])
    jest.advanceTimersByTime(1)
    expect(spoken).toEqual(['step 1', 'step 2 step 3'])
  })

  test('over ten seconds of steady messages, no more than ten are spoken', () => {
    const { spoken, announcer: voice } = announcer()
    voice.setAutoplay(true)
    for (let ms = 0; ms < 10_000; ms += 50) {
      voice.say(`tick ${ms}`)
      jest.advanceTimersByTime(50)
    }
    jest.advanceTimersByTime(1_100)
    expect(spoken.length).toBeLessThanOrEqual(11)
    expect(spoken.length).toBeGreaterThan(5)
  })

  test('with auto-play off, the wait is only the window', () => {
    const { spoken, announcer: voice } = announcer()
    voice.setAutoplay(true)
    voice.say('a')
    jest.advanceTimersByTime(100)
    voice.setAutoplay(false)
    voice.say('b')
    jest.advanceTimersByTime(100)
    expect(spoken).toEqual(['a', 'b'])
  })
})

describe('flush, cancel and the length of a line', () => {
  test('flush speaks what is queued now, once, and leaves nothing for the timer', () => {
    const { spoken, announcer: voice } = announcer()
    voice.say('now')
    voice.flush()
    expect(spoken).toEqual(['now'])
    jest.advanceTimersByTime(1_000)
    expect(spoken).toEqual(['now'])
    voice.flush()
    expect(spoken).toEqual(['now'])
  })

  test('cancel forgets what is queued, and the announcer works again afterwards', () => {
    const { spoken, announcer: voice } = announcer()
    voice.say('lost')
    voice.cancel()
    jest.advanceTimersByTime(1_000)
    expect(spoken).toEqual([])
    voice.say('kept')
    jest.advanceTimersByTime(100)
    expect(spoken).toEqual(['kept'])
  })

  test('a coalesced line longer than the limit keeps its latest messages', () => {
    const { spoken, announcer: voice } = announcer({ maxChars: 30 })
    for (const word of ['alpha alpha.', 'bravo bravo.', 'charlie charlie.', 'delta delta.']) voice.say(word)
    jest.advanceTimersByTime(100)
    expect(spoken).toEqual(['charlie charlie. delta delta.'])
    expect(ANNOUNCE_MAX_CHARS).toBe(400)
  })

  test('one message longer than the limit is still spoken whole', () => {
    const { spoken, announcer: voice } = announcer({ maxChars: 10 })
    voice.say('a long single sentence')
    jest.advanceTimersByTime(100)
    expect(spoken).toEqual(['a long single sentence'])
  })

  test('the timers can be injected', () => {
    const queue: { run: () => void; ms: number }[] = []
    const spoken: string[] = []
    let now = 0
    const voice = createAnnouncer((text) => spoken.push(text), {
      timers: { now: () => now, setTimer: (run, ms) => queue.push({ run, ms }), clearTimer: () => undefined },
    })
    voice.say('hello')
    expect(queue.map((timer) => timer.ms)).toEqual([100])
    now = 100
    queue[0].run()
    expect(spoken).toEqual(['hello'])
  })
})

describe('the live region', () => {
  const html = (props: Parameters<typeof LiveRegion>[0]) => renderToStaticMarkup(createElement(LiveRegion, props))

  test('is a polite, atomic region plus a status region, both present and visually hidden from the first render', () => {
    const markup = html({ announcement: null })
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('aria-atomic="true"')
    expect(markup).toContain('role="status"')
    expect(markup.match(/class="sr-only"/g)).toHaveLength(2)
    expect(markup).not.toMatch(/<span>/)
  })

  test('carries the turn\'s line in the polite region and the outcome in the status region', () => {
    const markup = html({ announcement: { id: 4, text: 'Slot 2 is empty.' }, outcome: 'The run is over. The debrief is ready.' })
    expect(markup).toMatch(/aria-live="polite"[^>]*><span>Slot 2 is empty\.<\/span>/)
    expect(markup).toMatch(/role="status"[^>]*>The run is over\. The debrief is ready\.<\/div>/)
  })
})
