/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#212121",
          raised: "#2f2f2f",
          sidebar: "#171717",
          overlay: "#2a2a2a",
        },
        border: {
          DEFAULT: "#3f3f3f",
          subtle: "#2a2a2a",
        },
        text: {
          primary: "#ececec",
          secondary: "#9ca3af",
          muted: "#6b7280",
        },
        accent: {
          DEFAULT: "#c9a84c",
          hover: "#d4b86a",
          dim: "rgba(201,168,76,0.15)",
        },
        error: {
          bg: "rgba(127,29,29,0.3)",
          border: "rgba(185,28,28,0.4)",
          text: "#fca5a5",
        },
        success: {
          dot: "#10b981",
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-in": "slideIn 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
