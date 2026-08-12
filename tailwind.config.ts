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
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        data: ["var(--font-data)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
