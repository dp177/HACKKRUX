/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
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
        soft: '0 10px 40px rgba(31, 66, 50, 0.08)',
        'glow-accent': '0 0 40px rgba(63, 159, 118, 0.25)',
        'glow-blue': '0 0 40px rgba(59, 130, 246, 0.2)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'spin-slow': 'spin 20s linear infinite',
        'ping-slow': 'ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
    }
  },
  plugins: []
};
