/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FAF8F5',
        terracotta: { DEFAULT: '#D4654A', light: '#F0C4B8', dark: '#B5503A' },
        sage: { DEFAULT: '#6B9E85', light: '#C5DDD2', dark: '#4F7D65' },
        lavender: { DEFAULT: '#8B7EC8', light: '#D0C9E8', dark: '#6E60AB' },
        warm: { 50: '#FAF8F5', 100: '#F2EDE8', 200: '#E8E4DF', 300: '#D5CFC8', 400: '#B0B5BA', 500: '#7A8085', 600: '#5A5F64', 700: '#3D4348', 800: '#2C3338', 900: '#1A1F23' },
      },
      fontFamily: {
        sans: ['DM Sans', 'Noto Sans TC', 'sans-serif'],
        display: ['Fraunces', 'Noto Sans TC', 'serif'],
      },
    },
  },
  plugins: [],
}
