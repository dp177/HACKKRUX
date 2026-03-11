/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        primaryfont: ['var(--font-primary)', 'sans-serif']
      },
      colors: {
        accent: {
          50: '#f4fbf8',
          100: '#e7f6ee',
          200: '#cbead9',
          300: '#a3d9bf',
          400: '#74c49f',
          500: '#3f9f76',
          600: '#2f7d5b',
          700: '#266348',
          800: '#234f3b',
          900: '#1f4232'
        }
      },
      boxShadow: {
        soft: '0 10px 40px rgba(31, 66, 50, 0.08)'
      }
    }
  },
  plugins: []
};
