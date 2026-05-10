import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Lifted from pure black so the page reads as "premium dark"
        // (Linear/Vercel territory) instead of "terminal vacío". Slight
        // cool tint pairs with the blob's cyan/blue idle palette.
        bg: "#0F1116",
        background: "#0F1116",
        surface: "#161A22",
        border: "#252A35",
        muted: "#8A94A6",
        text: "#E5E7EB",
        allow: "#00FF88",
        deny: "#FF3B30",
        stepup: "#3B82F6",
        // Single accent for the marketing surface (landing). Pulled from
        // the bubble's idle colorA so chrome and product feel like the
        // same family without colliding with the kernel state palette.
        accent: "#67B7D8",
        // Amber for "pending evaluation" — kernel has the request but
        // hasn't decided yet. Distinct from stepup blue so the user
        // reads the lifecycle as yellow → blue → green/red.
        warn: "#F5C242",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "glow-allow": "0 0 16px rgba(0, 255, 136, 0.45)",
        "glow-deny": "0 0 16px rgba(255, 59, 48, 0.45)",
        "glow-stepup": "0 0 16px rgba(59, 130, 246, 0.45)",
        "glow-accent": "0 0 24px rgba(103, 183, 216, 0.35)",
        "glow-warn": "0 0 16px rgba(245, 194, 66, 0.45)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
