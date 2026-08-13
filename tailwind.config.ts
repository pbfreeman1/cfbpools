import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Broadcast-desk dark theme. `app` = page background, `surface` =
        // cards/panels, `edge` = borders. `gold` is the single accent color
        // (CTAs, headlines, live indicators) — team-specific colors are
        // applied separately, inline, from real data (master_teams.primary_color).
        app: "#0B1220",
        surface: "#141B2E",
        "surface-hover": "#1B2440",
        edge: "#232B45",
        ink: "#E7EAF0",
        muted: "#8B93A7",
        gold: {
          300: "#F9D48A",
          400: "#F7C665",
          500: "#F5B942",
          600: "#D99A26",
        },
        alive: "#22C55E",
        dead: "#EF4444",
        // Second pool identity accent (Pick'em) — sits alongside `gold`
        // (Survivor's identity color) so the two pool cards read as
        // distinct broadcast "bugs" rather than identical grey panels.
        pickem: {
          300: "#A9C4FF",
          400: "#7DA6FF",
          500: "#4C7EFF",
          600: "#3860D9",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        data: ["var(--font-data)", "monospace"],
      },
      keyframes: {
        drift: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-4%)" },
        },
        "drift-reverse": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(3%)" },
        },
      },
      animation: {
        // Ambient background drift, not a ticker — long duration, gentle ease.
        drift: "drift 70s ease-in-out infinite alternate",
        "drift-reverse": "drift-reverse 90s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};

export default config;
