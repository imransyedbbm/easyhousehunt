/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand orange, deepened so white text on it meets WCAG AA contrast (4.6:1; the stock #f97316 is only 2.8:1).
        orange: { 500: "#cf460b", 600: "#b33c09" },
      },
    },
  },
  plugins: [],
};
