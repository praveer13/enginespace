/*
 * W1-T04: what the item block reads from a learner and shows of a seed (src/items/answer.ts).
 */
import { describe, expect, test } from 'bun:test'
import { freshEntropy, parseNumber, parseSeedLabel, seedLabel } from '@/items/answer'

describe('parseNumber', () => {
  test.each([
    ['380', 380],
    ['  380  ', 380],
    ['1,200', 1200],
    ['1 200', 1200],
    ['1_200', 1200],
    ['1 200', 1200],
    ['0.5', 0.5],
    ['.5', 0.5],
    ['12.', 12],
    ['-3', -3],
    ['−3', -3],
    ['+4', 4],
    ['380 µs', 380],
    ['380µs', 380],
    ['380 us', 380],
    ['380 US', 380],
    ['1,200.5 µs', 1200.5],
    ['380 380', 380380],
    ['1,234,567', 1234567],
  ])('reads %p as %p', (typed, number) => {
    expect(parseNumber(typed, 'µs')).toBe(number)
  })

  test.each([[''], ['   '], ['abc'], ['12 ms'], ['1.2.3'], ['1e3'], ['two'], ['12 34'], ['1,20'], ['1,2000'], ['1,,200'], ['--3'], ['3-'], ['0x10'], ['NaN'], ['Infinity'], ['µs']])('reads %p as no number', (typed) => {
    expect(parseNumber(typed, 'µs')).toBeNull()
  })

  test('takes a non-breaking space as a thousands separator, as a browser pastes one', () => {
    expect(parseNumber('1\u00a0200', 'µs')).toBe(1200)
  })

  test('takes a unit only if it is the slip\'s own', () => {
    expect(parseNumber('380 µs')).toBeNull()
    expect(parseNumber('380 ms', 'ms')).toBe(380)
    expect(parseNumber('380 µs', 'ms')).toBeNull()
  })
})

describe('a seed on a ticket', () => {
  test('is eight capital hex digits, and reads back', () => {
    expect(seedLabel(0)).toBe('00000000')
    expect(seedLabel(0xffffffff)).toBe('FFFFFFFF')
    expect(seedLabel(0x9e3779b9)).toBe('9E3779B9')
    for (const seed of [0, 1, 4096, 0xdeadbeef]) expect(parseSeedLabel(seedLabel(seed))).toBe(seed)
    for (const bad of ['', 'abc', '9e3779b9', '9E3779B', '9E3779B9A', 'G0000000']) expect(parseSeedLabel(bad)).toBeNull()
  })
})

describe('freshEntropy', () => {
  test('is one uint32 for each item, and another draw each time', () => {
    const one = freshEntropy(3)
    expect(one).toHaveLength(3)
    for (const value of one) expect(Number.isInteger(value) && value >= 0 && value <= 0xffffffff).toBe(true)
    expect(freshEntropy(3)).not.toEqual(one)
    expect(new Set([...freshEntropy(50)]).size).toBeGreaterThan(45)
  })
})
