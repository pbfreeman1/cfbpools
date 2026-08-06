import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Placeholder brand palette — swap for your SEC Survivor / CFBPools colors
        brand: {
          50: "#f2f7fb",
          100: "#e0edf7",
          500: "#1e5f9c",
          600: "#164a7c",
          700: "#0f3760",
        },
      },
    },
  },
  plugins: [],
};

export default config;
