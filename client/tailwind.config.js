/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./index.tsx",
    "./src/**/*.{js,jsx,ts,tsx}",
    "!./src/test/**",
    "!./src/README.md"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
