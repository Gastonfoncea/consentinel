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
        bg: "#0A0A0A",
        surface: "#111111",
        border: "#1F1F1F",
        muted: "#6B7280",
        text: "#E5E7EB",
        allow: "#00FF88",
        deny: "#FF3B30",
        stepup: "#3B82F6",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "glow-allow": "0 0 16px rgba(0, 255, 136, 0.45)",
        "glow-deny": "0 0 16px rgba(255, 59, 48, 0.45)",
        "glow-stepup": "0 0 16px rgba(59, 130, 246, 0.45)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
