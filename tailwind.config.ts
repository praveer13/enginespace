import typography from '@tailwindcss/typography'
import type { Config } from 'tailwindcss'
import { tailwindTheme } from './src/design/tokens.ts'

// The theme is the design system's token roles (src/design/tokens.ts, D-047): every key resolves to a `--es-*` variable,
// never to a literal colour, face or size.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: tailwindTheme(),
  },
  plugins: [typography],
} satisfies Config
