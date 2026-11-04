import typography from '@tailwindcss/typography'
import type { Config } from 'tailwindcss'

// No colours, fonts or visual style here. W0-T05 maps the theme onto the design system's token variables (D-047).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [typography],
} satisfies Config
