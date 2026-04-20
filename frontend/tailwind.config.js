/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#141414",   // main canvas — near-black, premium
          raised:  "#1e1e1e",   // cards, input, bubbles — slightly brighter for more z-depth
          sidebar: "#0c0c0c",   // sidebar panel
          overlay: "#181818",   // subtle assistant bubble
        },
        border: {
          DEFAULT: "#2a2a2a",   // slightly more visible for depth
          subtle:  "#1c1c1c",
        },
        text: {
          primary:   "#e2e2e2",
          secondary: "#717171",
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
        "fade-in":    "fadeIn 0.15s ease-out",
        "slide-up":   "slideUp 0.18s ease-out",
        "slide-right":"slideRight 0.18s ease-out",
        "slide-in":   "slideIn 0.25s ease-out",
        "shimmer":    "shimmer 1.6s ease-in-out infinite",
        "badge-pulse":"badgePulse 0.7s ease-out forwards",
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
        slideRight: {
          "0%":   { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideIn: {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        shimmer: {
          "0%":   { opacity: "0.35" },
          "50%":  { opacity: "0.65" },
          "100%": { opacity: "0.35" },
        },
        badgePulse: {
          "0%":   { background: "rgba(201,168,76,0.30)", boxShadow: "0 0 0 0 rgba(201,168,76,0.35)" },
          "60%":  { background: "rgba(201,168,76,0.08)", boxShadow: "0 0 0 5px rgba(201,168,76,0)" },
          "100%": { background: "rgba(201,168,76,0.08)", boxShadow: "0 0 0 0 rgba(201,168,76,0)" },
        },
      },
    },
  },
  plugins: [],
};
