import typography from '@tailwindcss/typography'
import type { Config } from 'tailwindcss'
import { tailwindTheme } from './src/design/tokens.ts'

// The theme is the design system's token roles (src/design/tokens.ts, D-047): every key resolves to a `--es-*` variable,
// never to a literal colour, face or size.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Tailwind makes a class of every word it finds in the sources. "prose" is a block type of the content (D-016), so it is
  // written all over src/content, and the typography plugin would answer with its `.prose`: Tailwind's own greys, in the
  // first-paint CSS. The design system styles reading text itself (`.es-prose`, and the tickets), so `prose` is never a class.
  blocklist: ['prose'],
  theme: {
    extend: tailwindTheme(),
  },
  plugins: [typography],
} satisfies Config
