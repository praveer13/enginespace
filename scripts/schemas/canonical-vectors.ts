/*
 * schemas/vectors/canonical.json (ARCHITECTURE §9.8): canonical JSON, as vectors. A receipt's hash, an artifact's hash and a trace's hash
 * are all the SHA-256 of a canonical text, so the grader has to write the very bytes that the browser does.
 *
 * Each vector gives its input as the text of a JSON document, and not as the document, so that each language reads the numbers and the
 * strings with its own parser, as it reads a receipt: `-0`, `1.0`, `1e3`, a lone surrogate written as an escape and a number past 2^53
 * all arrive as the text says. The expected output is the canonical text and the SHA-256 of its UTF-8 bytes, or an error. An error is any
 * refusal, from the parser or from the canonical form: the two languages refuse some texts at different steps (Python's parser takes NaN
 * and Infinity, which JavaScript's does not) and agree that the document has no canonical form.
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from '../../packages/sim/core/json.ts'
import type { Vector, VectorFile } from './format.ts'
import { doubleBits } from './rng-vectors.ts'

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/** One case: a JSON text, and a note on what it checks. Whether it has a canonical form is found by running it. */
type Case = readonly [id: string, input: string, note?: string]

const SCALARS: Case[] = [
  ['null', 'null'],
  ['true', 'true'],
  ['false', 'false'],
  ['empty-string', '""'],
  ['plain-string', '"abc"'],
  ['zero', '0'],
  ['minus-zero', '-0', 'JavaScript reads -0 as negative zero and Python reads the integer 0; the canonical text of both is 0'],
  ['minus-zero-float', '-0.0', 'negative zero as a float; its canonical text is 0'],
  ['zero-float', '0.0', 'a whole number written as a fraction is written as an integer'],
  ['one', '1'],
  ['minus-one', '-1'],
]

const CONTAINERS: Case[] = [
  ['empty-array', '[]'],
  ['empty-object', '{}'],
  ['nested-empty-array', '[[]]'],
  ['nested-empty-object', '{"a":{}}'],
  ['every-kind', '[null,true,false,0,"",[],{}]'],
  ['whitespace-is-dropped', '{ "b" : [ 1 , 2 ] ,\n\t"a" : null }', 'spaces, tabs and line breaks between tokens are not kept'],
  ['array-order-is-kept', '[3,1,2]', 'only the keys of an object are sorted'],
]

const INTEGERS: Case[] = [
  ['int-123456789', '123456789'],
  ['int-4294967295', '4294967295'],
  ['int-4294967296', '4294967296'],
  ['int-largest-safe', '9007199254740991', '2^53 - 1 is the largest integer that is written'],
  ['int-smallest-safe', '-9007199254740991'],
  ['exponent-whole', '1e3', 'a number with an exponent that is a whole number is written as an integer'],
  ['exponent-whole-upper', '1E3'],
  ['fraction-whole', '1.0', 'a whole number written as a fraction is written as an integer'],
  ['fraction-whole-10', '10.0'],
  ['fraction-trailing-zero', '1.50', 'trailing zeros are dropped'],
  ['exponent-fraction', '2.5e1', 'written as 25'],
  ['negative-exponent-whole', '100e-2', 'written as 1'],
  ['shifted-point', '0.1e1', 'written as 1'],
  ['int-9e15', '9000000000000000'],
  ['int-4.5e15-fraction-form', '4.5e15', 'written as 4500000000000000'],
  ['int-beyond-2^53', '9007199254740992', 'an integer of 2^53 or more has no canonical form (ARCHITECTURE section 5.1: every value stays below 2^53)'],
  ['int-minus-2^53', '-9007199254740992'],
  ['int-2^53-plus-1', '9007199254740993', 'JavaScript rounds this to 2^53 and Python keeps it exact; both refuse it'],
  ['int-2^54', '18014398509481984'],
  ['int-1e16', '1e16', 'a whole number beyond 2^53 written with an exponent'],
  ['int-1e20-digits', '100000000000000000000'],
  ['int-1e21', '1e21'],
  ['int-1e300', '1e300'],
  ['int-30-digits', '123456789012345678901234567890'],
  ['overflow-to-infinity', '1e400', 'JavaScript reads this as Infinity and Python as inf; neither has a JSON form'],
  ['overflow-negative', '-1e400'],
  ['largest-double', '1.7976931348623157e308', 'a whole number beyond 2^53, though it is written with a fraction'],
]

const FLOATS: Case[] = [
  ['float-half', '0.5'],
  ['float-minus-half', '-0.5'],
  ['float-0.1', '0.1'],
  ['float-0.2', '0.2'],
  ['float-0.1+0.2', '0.30000000000000004', '17 digits: the shortest text that reads back as 0.1 + 0.2'],
  ['float-0.8-minus-1ulp', '0.7999999999999999'],
  ['float-1.5', '1.5'],
  ['float-3.14159', '3.14159'],
  ['float-pi', '3.141592653589793'],
  ['float-e', '2.718281828459045'],
  ['float-sqrt2', '1.4142135623730951'],
  ['float-one-third', '0.3333333333333333'],
  ['float-two-thirds', '0.6666666666666666'],
  ['float-123456789.123', '123456789.123'],
  ['float-15-digit-integer-part', '123456789012345.67'],
  ['float-largest-with-a-fraction', '4503599627370495.5', 'below 2^52 every double has a fraction part to the half; this is the largest that has one'],
  ['float-1+ulp', '1.0000000000000002'],
  ['float-1-ulp', '0.9999999999999999'],
  ['float-0.00032', '0.00032', 'a check\'s value in a receipt'],
  ['float-minus-1.5', '-1.5'],
  ['float-100.25', '100.25'],
  ['float-1e15-whole', '1e15', 'written as 1000000000000000'],
]

const SMALL: Case[] = [
  ['small-1e-6', '1e-6', 'the smallest power of ten that is written without an exponent: 0.000001'],
  ['small-0.000001', '0.000001'],
  ['small-1e-7', '1e-7', 'one place smaller and JavaScript writes an exponent: 1e-7. Python\'s repr writes 1e-07 and writes 1e-05 for 0.00001, so a port needs its own formatter'],
  ['small-0.0000001', '0.0000001', 'written as 1e-7'],
  ['small-1.5e-7', '1.5e-7'],
  ['small-minus-1e-7', '-1e-7'],
  ['small-0.00001234', '0.00001234', 'written without an exponent: 0.00001234'],
  ['small-0.0001', '0.0001'],
  ['small-0.00001', '0.00001', 'written as 0.00001, where Python\'s repr writes 1e-05'],
  ['small-1.234e-10', '1.234e-10'],
  ['small-2.5e-8', '2.5e-8'],
  ['small-1e-323', '1e-323', 'a subnormal number'],
  ['small-5e-324', '5e-324', 'the smallest positive double'],
  ['small-4.9e-324', '4.9e-324', 'this text reads as the same double as 5e-324 and is written as 5e-324'],
  ['small-smallest-normal', '2.2250738585072014e-308'],
  ['small-minus-5e-324', '-5e-324'],
]

const STRINGS: Case[] = [
  ['str-quote', '"\\""', 'a quote is escaped'],
  ['str-backslash', '"\\\\"', 'a backslash is escaped'],
  ['str-solidus', '"a/b"', 'a solidus is not escaped'],
  ['str-escaped-solidus', '"a\\/b"', 'an escaped solidus in the input is written as a solidus'],
  ['str-short-escapes', '"\\b\\f\\n\\r\\t"', 'backspace, form feed, line feed, carriage return and tab use their short escapes'],
  ['str-nul', '"\\u0000"', 'every other control character is \\u00xx'],
  ['str-low-controls', '"\\u0001\\u001f"', 'with lower-case hex digits'],
  ['str-upper-hex-escape', '"\\u001F\\u00E9"', 'the digits of an escape in the input may be upper case, and the output does not depend on it'],
  ['str-vertical-tab', '"\\u000b\\u000c"', 'vertical tab has no short escape; form feed has'],
  ['str-delete', '"\\u007f"', 'DEL is not a control character here: it is written as it is, one byte'],
  ['str-c1-control', '"\\u0080\\u009f"', 'U+0080 is written as it is, two bytes'],
  ['str-line-separators', '"\\u2028\\u2029"', 'U+2028 and U+2029 are written as they are'],
  ['str-e-acute', '"\\u00e9"', 'written as the character, two bytes in UTF-8'],
  ['str-e-acute-raw', '"é"', 'the same character written raw in the input'],
  ['str-e-then-accent', '"e\\u0301"', 'the same letter in decomposed form: a different text, and a different hash. Text is not normalised'],
  ['str-cjk', '"\\u65e5\\u672c\\u8a9e"', 'three bytes a character in UTF-8'],
  ['str-emoji-escaped', '"\\ud83d\\ude00"', 'a surrogate pair is one character, written as 4 bytes of UTF-8'],
  ['str-emoji-raw', '"\u{1F600}"', 'the same character written raw in the input'],
  ['str-bom', '"\\ufeff"', 'a byte order mark inside a string is a character like another'],
  ['str-replacement', '"\\ufffd"'],
  ['str-zero-width-space', '"\\u200b"'],
  ['str-bidi-override', '"\\u202e"', 'U+202E is written as it is'],
  ['str-mixed', '"A\\u00e9\\u65e5\\ud83d\\ude00z\\n"'],
  ['str-lone-high', '"\\ud800"', 'a lone surrogate has no UTF-8 form, so the text has no canonical form'],
  ['str-lone-low', '"\\udc00"'],
  ['str-high-then-letter', '"\\ud83da"', 'a high surrogate followed by a letter'],
  ['str-reversed-pair', '"\\ude00\\ud83d"', 'a pair in the wrong order is two lone surrogates'],
  ['str-lone-high-last', '"abc\\ud83d"'],
]

const KEYS: Case[] = [
  ['keys-sorted', '{"b":1,"a":2}'],
  ['keys-numeric-strings', '{"10":1,"9":2,"1":3}', 'keys are strings, so "1" < "10" < "9"'],
  ['keys-case', '{"B":1,"a":2,"A":3}', 'upper case sorts before lower case'],
  ['keys-empty-first', '{"a":1,"":2}'],
  ['keys-prefix-first', '{"ab":1,"a":2}'],
  ['keys-e-acute-after-z', '{"\\u00e9":1,"z":2}', 'by UTF-16 code unit, U+00E9 is after z'],
  ['keys-decomposed-before-composed', '{"\\u00e9":1,"e\\u0301":2}', '"e" followed by a combining accent sorts by its first unit, e, which is before U+00E9'],
  [
    'keys-utf16-order-not-code-point-order',
    '{"\\ud83d\\ude00":1,"\\uff5e":2,"\\ue000":3}',
    'sorted by UTF-16 code unit the emoji (D83D DE00) comes before U+E000 and U+FF5E; sorted by code point it would come last. Python\'s sorted() on str is the second, so a port sorts by the UTF-16 code units of the key',
  ],
  ['keys-astral-before-bmp-top', '{"\\ud800\\udc00":1,"\\uffff":2}', 'U+10000 is D800 DC00 in UTF-16, which sorts before U+FFFF'],
  ['keys-duplicate', '{"a":1,"a":2}', 'a repeated key keeps its last value, in both parsers'],
  ['keys-nested', '{"z":{"b":1,"a":2},"y":[{"d":1,"c":2}]}', 'every object is sorted, at every depth, and arrays keep their order'],
  ['keys-with-escapes', '{"a\\"b":1,"a\\\\b":2,"a\\nb":3}', 'keys are escaped as strings are'],
  ['keys-lone-surrogate', '{"\\ud800":1}', 'a key has to have a UTF-8 form too'],
  ['keys-proto', '{"__proto__":1,"constructor":2,"a":3}', 'a key called __proto__ or constructor is a key like another'],
  ['keys-nul', '{"\\u0000":1,"a":2}', 'a key may hold any character, NUL included, which sorts first'],
]

const SHAPES: Case[] = [
  ['numbers-in-an-array', '[1,2.5,-3,0.001,1e-7,100,1e2,1.0e0]'],
  ['check-like-object', '{"id":"tr0.logits","kind":"correctness","pass":true,"value":0.00032,"bound":0.001,"n":128,"detail":"max abs diff 3.2e-4"}', 'the shape of a check in a receipt'],
  ['trace-like-object', '{"schema":"enginespace/trace@1","meta":{"source":"synthetic","synthetic":true},"strings":["step","kernel"],"tracks":[{"id":0,"kind":"gpu-stream","name":1}],"spans":{"track":[0,0],"startNs":[0,1500],"durNs":[1000,250],"name":[1,1],"cat":[1,1],"corr":[-1,-1]},"flows":[],"marks":[{"tNs":0,"name":0}]}', 'the shape of a trace'],
  ['null-and-false-are-values', '{"a":null,"b":false,"c":0,"d":""}', 'nothing is dropped for being empty'],
]

const REFUSED_TEXTS: Case[] = [
  ['text-trailing-comma-object', '{"a":1,}', 'not JSON'],
  ['text-trailing-comma-array', '[1,]'],
  ['text-unclosed-array', '[1,2'],
  ['text-single-quotes', '\'a\''],
  ['text-unquoted-key', '{a:1}'],
  ['text-leading-zero', '01'],
  ['text-leading-point', '.5'],
  ['text-trailing-point', '5.'],
  ['text-plus-sign', '+1'],
  ['text-hex', '0x10'],
  ['text-underscore', '1_000'],
  ['text-nan', 'NaN', 'Python\'s parser takes this and JavaScript\'s does not; neither can write it'],
  ['text-infinity', 'Infinity'],
  ['text-minus-infinity', '-Infinity'],
  ['text-nan-inside', '[NaN]'],
  ['text-undefined', 'undefined'],
  ['text-empty', ''],
  ['text-blank', '   '],
  ['text-two-documents', '{"a":1}{"b":2}'],
  ['text-bad-escape', '"\\x41"'],
  ['text-short-unicode-escape', '"\\u12"'],
  ['text-raw-tab-in-string', '"a\tb"', 'a control character has to be escaped inside a string'],
  ['text-raw-newline-in-string', '"a\nb"'],
]

function many(): Case[] {
  const integers = Array.from({ length: 200 }, (_, i) => i)
  const keys = Array.from({ length: 60 }, (_, i) => `k${String(59 - i).padStart(2, '0')}`)
  const deepArrays = `${'['.repeat(40)}${']'.repeat(40)}`
  const deepObjects = `${'{"a":'.repeat(40)}null${'}'.repeat(40)}`
  return [
    ['many-integers', JSON.stringify(integers), 'a long array'],
    ['many-keys', `{${keys.map((key, i) => `"${key}":${i}`).join(',')}}`, 'sixty keys written in reverse order'],
    ['deep-arrays', deepArrays, 'forty levels'],
    ['deep-objects', deepObjects, 'forty levels'],
  ]
}

/** Whether a text is a bare JSON number, which gets its double's bits. */
const BARE_NUMBER = /^-?[0-9][0-9.eE+-]*$/

/**
 * The ids of the cases that have no canonical form. A case that the code refuses without being listed here, or one listed here that the
 * code takes, is a mistake in the case and not a finding, so the builder stops on it.
 */
const REFUSED_ID = /^(?:int-(?:beyond|minus-2\^53|2\^53|2\^54|1e16|1e20|1e21|1e300|30-digits)|overflow-|largest-double|str-lone-|str-high-then|str-reversed|keys-lone|text-)/

function vectorOf([id, input, note]: Case): Vector {
  let canonical: string | null = null
  let parsed: unknown
  let parseable = true
  try {
    parsed = JSON.parse(input)
  } catch {
    parseable = false
  }
  if (parseable) {
    try {
      canonical = canonicalJson(parsed)
    } catch (error) {
      if (!(error instanceof RangeError || error instanceof TypeError)) throw error
    }
  }
  if (REFUSED_ID.test(id) !== (canonical === null)) {
    throw new Error(`canonical vector ${id}: ${canonical === null ? 'the code refuses it' : `the code writes ${canonical}`}, and the case says otherwise`)
  }
  const base = { id, ...(note === undefined ? {} : { note }), fn: 'canonical', input }
  if (canonical === null) return { ...base, error: true }
  // A bare number gets the bits of the double it reads as. "-0" is left out: JavaScript reads it as negative zero and Python as the integer 0.
  const bits = BARE_NUMBER.test(input) && typeof parsed === 'number' && !Object.is(parsed, -0) ? { bits: doubleBits(parsed) } : {}
  return { ...base, ...bits, canonical, utf8Bytes: Buffer.byteLength(canonical, 'utf8'), sha256: sha256(canonical) }
}

export function canonicalFile(): VectorFile {
  const cases = [...SCALARS, ...CONTAINERS, ...INTEGERS, ...FLOATS, ...SMALL, ...STRINGS, ...KEYS, ...SHAPES, ...many(), ...REFUSED_TEXTS]
  return {
    spec: 'enginespace/vectors-canonical@1',
    description:
      'Canonical JSON (ARCHITECTURE section 9.8, packages/sim/core/json.ts): the one text for one value, whose SHA-256 is the hash of a receipt, an artifact or a trace, with the texts that have none.',
    reading: [
      'Each vector has an "input", which is the text of a JSON document and is parsed by the reader\'s own JSON parser, and either an "error" of true or the expected "canonical" text, its "utf8Bytes" count and its "sha256", which is the SHA-256 of the canonical text\'s UTF-8 bytes as 64 lower-case hex digits.',
      'The canonical text is RFC 8785 for the values this project writes: no whitespace; the members of an object sorted by the UTF-16 code units of the key (not by code point, and not in the order written); arrays in order; a string with `"` and `\\` escaped, \\b \\f \\n \\r \\t for those five control characters, \\u00xx with lower-case hex digits for every other character below U+0020, and every other character, DEL and the line separators included, as itself in UTF-8; true, false and null as they are.',
      'A number is written as ECMAScript\'s Number.prototype.toString writes it: a whole number as an integer with no fraction or exponent, and -0 as 0; any other number as the shortest digits that read back as the same double; written without an exponent from 0.000001 up to the largest fraction, and as `1e-7`, `1.5e-7` and `5e-324` below that (an exponent is written with its sign and no leading zero: e-7, never e-07). A port cannot use Python\'s repr or json.dumps for this, which write 1e-05 and 1e-07 and 1.0.',
      'A document has no canonical form, and the port must refuse it, when it holds a whole number of 2^53 or more in size (a Python int, or a float with no fraction), a number that is not finite, or a string or key with a lone surrogate. An "error": true vector is any of these, or a text that is not JSON.',
      'Where "bits" is present the input is a bare number, and the reader compares the IEEE-754 double that its parser makes of it, as 16 hex digits, so that the number is known to be read alike before it is written. "-0" has no "bits": JavaScript reads it as negative zero and Python as the integer 0, and both write 0.',
    ],
    source: 'scripts/schemas/canonical-vectors.ts; bun scripts/export-schemas.ts writes it',
    oracle: 'canonicalJson of packages/sim/core/json.ts over JSON.parse of the input, hashed with node:crypto; the builder checks that every error vector is refused',
    vectors: cases.map(vectorOf),
  }
}
