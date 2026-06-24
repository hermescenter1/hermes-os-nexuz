import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:        "var(--bg)",
        surface:   "var(--surface)",
        surface2:  "var(--surface-2)",
        surface3:  "var(--surface-3)",
        line:      "var(--line)",
        line2:     "var(--line-2)",
        ink:       "var(--ink)",
        muted:     "var(--muted)",
        faint:     "var(--faint)",
        signal:    "var(--signal)",
        signalDim: "var(--signal-dim)",
        ice:       "var(--ice)",
        iceDim:    "var(--ice-dim)",
        steel:     "var(--steel)",
        steelDim:  "var(--steel-dim)",
        warn:       "var(--warn)",
        danger:     "var(--danger)",
        hermesGold: "var(--hermes-gold)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body:    ["var(--font-body)",    "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)",    "monospace"],
      },
      fontSize: {
        "5xl-hero": ["var(--text-5xl)", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "26": "6.5rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
