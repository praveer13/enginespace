import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Beyond the base rules, this file holds three mechanical fences (W0-T03). The editor sees them here, and the gates in
// scripts/ check the same things from the source, which also catches what a rule on specifier strings cannot.
//
//   1. dangerouslySetInnerHTML is banned everywhere (ARCHITECTURE §12, D-016).
//   2. packages/sim and packages/play must be deterministic (§5.1, D-017). The bans are verify:determinism's list. Inline
//      `eslint-disable` comments have no effect in those two packages, so a ban cannot be waved through.
//   3. The import fences of §2.3, and the three fence: only src/scene and each game's Scene3D.tsx may import three or
//      @react-three/fiber. verify:boundaries resolves relative imports and walks the static path from src/main.tsx to three.
//
// tests/lint/eslint-rules.test.ts exercises each ban and each fence, so a rule dropped from this file fails a test.

// 1. dangerouslySetInnerHTML.
const INNER_HTML = 'dangerouslySetInnerHTML is banned: content is a token tree that React renders (ARCHITECTURE §12, D-016).'
const NO_INNER_HTML = [
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: INNER_HTML },
  { selector: "Property[key.name='dangerouslySetInnerHTML']", message: INNER_HTML },
  { selector: "Property[key.value='dangerouslySetInnerHTML']", message: INNER_HTML },
  { selector: "MemberExpression[property.name='dangerouslySetInnerHTML']", message: INNER_HTML },
  { selector: "MemberExpression[property.value='dangerouslySetInnerHTML']", message: INNER_HTML },
]

// 2. The determinism bans (ARCHITECTURE §5.1). scripts/verify-determinism.ts holds the same list, and adds the alias checks
// that only an AST walk can make.
// ECMA-262's note on the Math object's functions lists the ones it does not precisely specify (each engine uses its own maths
// library), and Math.random is unseeded: the same 23, in the note's order, as BANNED_MATH in scripts/verify-determinism.ts.
const MATH_BANNED = [
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atanh',
  'atan2',
  'cbrt',
  'cos',
  'cosh',
  'exp',
  'expm1',
  'hypot',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'random',
  'sin',
  'sinh',
  'tan',
  'tanh',
]
const mathMessage = (name) =>
  name === 'random'
    ? 'Math.random is unseeded: draw from the seeded rng (D-017, ARCHITECTURE §5.1).'
    : `Math.${name} can round differently between engines: use +, -, *, / and max, or a generated integer table (D-017, ARCHITECTURE §5.1).`
const CLOCK = 'reads the clock: time is integer µs and arrives as a parameter (D-017, ARCHITECTURE §5.1).'
const BANNED_GLOBALS = [
  ['Date', `Date ${CLOCK}`],
  ['performance', `performance ${CLOCK}`],
  ['crypto', 'crypto is entropy: draw from the seeded rng (D-017, ARCHITECTURE §5.1).'],
  ['window', 'Pure code has no DOM (D-017, ARCHITECTURE §5.1).'],
  ['document', 'Pure code has no DOM (D-017, ARCHITECTURE §5.1).'],
  ['globalThis', 'globalThis reaches every banned global: name what you need (D-017, ARCHITECTURE §5.1).'],
]
const POW = '`**` is Math.pow in disguise: multiply, or use a generated integer table (D-017, ARCHITECTURE §5.1).'
const SORT = 'Array.prototype.sort without a comparator orders by UTF-16 string: pass a comparator (ARCHITECTURE §5.1).'
const MATH_COMPUTED = 'Computed access on Math can reach a banned member: name the member (ARCHITECTURE §5.1).'
const DETERMINISM_SYNTAX = [
  { selector: "BinaryExpression[operator='**']", message: POW },
  { selector: "AssignmentExpression[operator='**=']", message: POW },
  { selector: "CallExpression[callee.computed=false][callee.property.name='sort'][arguments.length=0]", message: SORT },
  { selector: "CallExpression[callee.computed=true][callee.property.value='sort'][arguments.length=0]", message: SORT },
  { selector: "MemberExpression[object.name='Math'][computed=true]:not([property.type='Literal'])", message: MATH_COMPUTED },
]

// 3. The fences (ARCHITECTURE §2.3). A pattern sees only the import's specifier, so these catch the aliases (`@es/play`, `@/…`),
// the packages and the common relative paths. verify:boundaries resolves every specifier to the file it names.
const aliasesOf = (...names) => names.flatMap((name) => [`@es/${name}`, `@es/${name}/*`])
const THREE = {
  group: ['three', 'three/*', '@react-three/*'],
  message:
    "Only src/scene and each game's Scene3D.tsx may import three or @react-three/fiber, and only behind a React.lazy boundary (ARCHITECTURE §2.3, D-023).",
}
// The vendor folder has a src/ of its own, which NOT_VENDOR judges, so it is excluded here to report each import once.
const NOT_SRC = { group: ['@/*', '**/src/**', '!**/vendor/**'], message: 'No package imports src/** (ARCHITECTURE §2.3).' }
const NOT_VENDOR = {
  group: ['**/vendor/**'],
  message: "Only packages/sim imports vendored files, and only kernelspace's rng and S5 card (ARCHITECTURE §2.3).",
}
const NO_UI_LIBRARY = {
  group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-router', 'react-router/*', 'zustand', 'zustand/*', '@radix-ui/*'],
  message: 'Pure packages import no UI library (ARCHITECTURE §2.3).',
}
/** The fence of one package: `no-restricted-imports` over its folder. */
const fence = (name, ...patterns) => ({
  files: [`packages/${name}/**/*.{js,mjs,ts,tsx}`],
  rules: { 'no-restricted-imports': ['error', { patterns }] },
})

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results', 'src/content/generated', '.claude', '.worktrees', 'vendor']),
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
    },
    rules: {
      'no-restricted-syntax': ['error', ...NO_INNER_HTML],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // The bad files of tests/lint break the rules below on purpose. The tests lint them as if they lived under packages/ and src/.
  globalIgnores(['tests/fixtures/lint/**']),

  // 2. packages/sim and packages/play: the determinism bans.
  {
    files: ['packages/sim/**/*.{js,mjs,ts,tsx}', 'packages/play/**/*.{js,mjs,ts,tsx}'],
    linterOptions: { noInlineConfig: true },
    rules: {
      'no-restricted-properties': ['error', ...MATH_BANNED.map((property) => ({ object: 'Math', property, message: mathMessage(property) }))],
      'no-restricted-globals': ['error', ...BANNED_GLOBALS.map(([name, message]) => ({ name, message }))],
      // A later config object replaces a rule's options and never merges them, so the global ban is repeated here.
      'no-restricted-syntax': ['error', ...NO_INNER_HTML, ...DETERMINISM_SYNTAX],
    },
  },

  // 3. The import fences, package by package. A package imports what ARCHITECTURE §2.3 lists, and nothing else.
  fence(
    'sim',
    {
      group: aliasesOf('play', 'ledger', 'schema', 'verify'),
      message: "packages/sim imports nothing outside itself except kernelspace's vendored rng and S5 card (ARCHITECTURE §2.3).",
    },
    // A relative path reaches the vendored files. verify:boundaries checks that it names only the rng and the S5 card.
    NOT_SRC,
    NO_UI_LIBRARY,
    THREE,
  ),
  fence(
    'play',
    { group: aliasesOf('ledger', 'verify'), message: 'packages/play imports packages/sim and the types in packages/schema (ARCHITECTURE §2.3).' },
    {
      group: aliasesOf('schema'),
      allowTypeImports: true,
      message: 'packages/play imports only the types in packages/schema: use `import type` (ARCHITECTURE §2.3).',
    },
    NOT_VENDOR,
    NOT_SRC,
    NO_UI_LIBRARY,
    THREE,
  ),
  fence(
    'verify',
    { group: aliasesOf('play', 'ledger'), message: 'packages/verify imports packages/sim and packages/schema (ARCHITECTURE §2.3).' },
    NOT_VENDOR,
    NOT_SRC,
    THREE,
  ),
  fence(
    'ledger',
    { group: aliasesOf('sim', 'play', 'verify'), message: 'packages/ledger imports packages/schema only (ARCHITECTURE §2.3).' },
    NOT_VENDOR,
    NOT_SRC,
    THREE,
  ),
  fence(
    'schema',
    { group: aliasesOf('sim', 'play', 'ledger', 'verify'), message: 'packages/schema is a leaf: ARCHITECTURE §2.3 lists no imports for it.' },
    NOT_VENDOR,
    NOT_SRC,
    THREE,
  ),
  // The app imports three only from the scene kit and from each game's lazily loaded 3D scene.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/scene/**', 'src/games/*/Scene3D.tsx'],
    rules: { 'no-restricted-imports': ['error', { patterns: [THREE] }] },
  },
])
