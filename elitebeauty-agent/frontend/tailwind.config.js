/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        rose: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
          950: '#4c0519',
        },
        eb: {
          bg:     '#07070a',
          950:    '#0d0a14',
          900:    '#110d19',
          800:    '#161120',
          700:    '#1e172e',
          600:    '#261d3c',
          border: '#221932',
          text:   '#f0ebff',
          muted:  '#9b8cb4',
          dim:    '#665880',
          gold:   '#d4a853',
          'gold-light': '#f0cc7a',
        },
      },
      fontFamily: {
        display: ['"Orbitron"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-rose':   '0 0 30px rgba(225, 29, 72, 0.35)',
        'glow-purple': '0 0 30px rgba(147, 51, 234, 0.3)',
        'glow-gold':   '0 0 30px rgba(212, 168, 83, 0.25)',
        'card':        '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
    },
  },
  plugins: [],
};
