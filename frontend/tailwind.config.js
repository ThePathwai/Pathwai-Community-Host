/** @type {import('tailwindcss').Config} */
// Colours are CSS variables (rgb triplets) so each community's brand can re-skin the whole member experience.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        accent: "var(--accent)",
        onaccent: "var(--on-accent)",
        ink: v("--c-ink"),
        paper: v("--c-bg"),
        surface: v("--c-surface"),
        line: v("--c-line"),
        muted: v("--c-muted"),
      },
      fontFamily: { sans: ["var(--font-sans)"], display: ["var(--font-heading, var(--font-sans))"] },
      borderRadius: { xl2: "var(--r-card)" },
      boxShadow: { card: "0 8px 30px -8px rgba(0,0,0,.35)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
