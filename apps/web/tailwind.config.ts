import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        shea: {
          50:  '#fdf7ee',
          100: '#f9ecd3',
          500: '#c89a4b',
          700: '#8a6128',
          900: '#4a321b',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
