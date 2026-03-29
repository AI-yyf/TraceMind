/** @type {import('tailwindcss').Config} */
export default {
  content: {
    relative: true,
    files: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
  },
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'paper': {
          'black': '#000000',
          'white': '#FFFFFF',
          'dark': '#0A0A0A',
          'gray': '#666666',
          'light': '#A3A3A3',
          'border': '#E5E5E5',
          'hover': '#F5F5F5',
        },
        'surface': {
          '0': '#FFFFFF',
          '50': '#FAFAFA',
          '100': '#F5F5F5',
          '200': '#E5E5E5',
          '300': '#D4D4D4',
          '700': '#404040',
          '800': '#1A1A1A',
          '850': '#141414',
          '900': '#0A0A0A',
          '950': '#050505',
        },
      },
      fontFamily: {
        'sans': ['Inter', 'Noto Sans SC', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Source Code Pro', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      keyframes: {
        'fade-in': {
          'from': { opacity: '0', transform: 'translateY(16px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          'from': { opacity: '0', transform: 'translateX(20px)' },
          'to': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-down': {
          'from': { opacity: '0', transform: 'translateY(-8px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
