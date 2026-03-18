/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "base-100":          "rgb(var(--base-100) / <alpha-value>)",
        "base-200":          "rgb(var(--base-200) / <alpha-value>)",
        "base-300":          "rgb(var(--base-300) / <alpha-value>)",
        "base-content":      "rgb(var(--base-content) / <alpha-value>)",
        "primary":           "rgb(var(--primary) / <alpha-value>)",
        "primary-content":   "rgb(var(--primary-content) / <alpha-value>)",
        "secondary":         "rgb(var(--secondary) / <alpha-value>)",
        "secondary-content": "rgb(var(--secondary-content) / <alpha-value>)",
        "accent":            "rgb(var(--accent) / <alpha-value>)",
        "accent-content":    "rgb(var(--accent-content) / <alpha-value>)",
        "success":           "rgb(var(--success) / <alpha-value>)",
        "error":             "rgb(var(--error) / <alpha-value>)",
        "warning":           "rgb(var(--warning) / <alpha-value>)",
        "info":              "rgb(var(--info) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
