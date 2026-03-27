import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      backgroundImage: {
        "grid-ops": "linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.04) 1px, transparent 1px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "status-pulse": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(34,197,94,0.7)" },
          "50%": { opacity: "0.8", boxShadow: "0 0 0 5px rgba(34,197,94,0)" },
        },
        "live-glow": {
          "0%, 100%": { boxShadow: "0 0 6px rgba(34,197,94,1), 0 0 14px rgba(34,197,94,0.5)" },
          "50%": { boxShadow: "0 0 3px rgba(34,197,94,0.5)" },
        },
        "crit-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.6), 0 0 6px rgba(239,68,68,0.4)" },
          "50%": { boxShadow: "0 0 0 6px rgba(239,68,68,0), 0 0 12px rgba(239,68,68,0.8)" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scanline": {
          "0%": { top: "-4px" },
          "100%": { top: "100%" },
        },
        "radar-sweep": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "status-pulse": "status-pulse 2s ease-in-out infinite",
        "live-glow": "live-glow 1.8s ease-in-out infinite",
        "crit-pulse": "crit-pulse 1.6s ease-in-out infinite",
        "slide-in-left": "slide-in-left 0.25s ease-out forwards",
        "scanline": "scanline 5s linear infinite",
        "radar-sweep": "radar-sweep 8s linear infinite",
        "fade-in": "fade-in 0.4s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
