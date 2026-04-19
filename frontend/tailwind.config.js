/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#141414",   // main canvas — near-black, premium
          raised:  "#1c1c1c",   // cards, input, bubbles
          sidebar: "#0c0c0c",   // sidebar panel
          overlay: "#181818",   // subtle assistant bubble
        },
        border: {
          DEFAULT: "#252525",   // barely visible
          subtle:  "#1c1c1c",
        },
        text: {
          primary:   "#e2e2e2",
          secondary: "#717171",  // neutral gray (not blue-gray)
          muted:     "#424242",
        },
        accent: {
          DEFAULT: "#c9a84c",
          hover:   "#d6b96a",
          dim:     "rgba(201,168,76,0.10)",
        },
        error: {
          bg:     "rgba(120,24,24,0.25)",
          border: "rgba(180,28,28,0.35)",
          text:   "#f87171",
        },
        success: {
          dot: "#22c55e",
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', "Georgia", "serif"],
        sans:  ['"Inter"', "system-ui", "sans-serif"],
        mono:  ['"JetBrains Mono"', "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", "14px"],
      },
      animation: {
        "fade-in":  "fadeIn 0.15s ease-out",
        "slide-up": "slideUp 0.18s ease-out",
        "slide-in": "slideIn 0.25s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
