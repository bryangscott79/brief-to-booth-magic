import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
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
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        zone: {
          hero: "hsl(329 86% 70%)",
          storytelling: "hsl(220 100% 72%)",
          lounge: "hsl(197 83% 76%)",
          reception: "hsl(272 91% 74%)",
          service: "hsl(258 95% 77%)",
        },
        canopy: {
          sky: "#8FD3F4",
          blue: "#6FA8FF",
          violet: "#A78BFA",
          purple: "#C084FC",
          pink: "#F472B6",
          navy: "#0B1B2B",
          charcoal: "#1F2937",
        },
        /* ── Flow C ink + ground scale ─────────────────────────────── */
        navy: "#0B1B2B",
        charcoal: "#1F2937",
        slate: {
          DEFAULT: "#64748B",
          faint: "#94A3B8",
          // Tailwind slate scale preserved (extend replaces the key wholesale)
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
          950: "#020617",
        },
        cloud: {
          DEFAULT: "#F6F8FA",
          line: "#E2E8F0",
        },
        /* ── Flow C brand gradient stops (accents only) ────────────── */
        "grad-a": "#8FD3F4",
        "grad-b": "#6FA8FF",
        "grad-c": "#A78BFA",
        "grad-d": "#C084FC",
        "grad-e": "#F472B6",
        /* ── Flow C semantic grammar ───────────────────────────────── */
        blocking: "#D2322A",
        "red-soft": "#FBEAE9",
        warn: "#B25E09",
        "amber-soft": "#FBF1E3",
        "amber-on-ink": "#F5B266",
        pass: "#0C7C3F",
        "green-soft": "#E8F4ED",
        "green-on-ink": "#34D399",
        "pink-deep": "#DB2777",
        "pink-soft": "#FDF2F8",
        "violet-soft": "#F3EFFE",
        link: "#4F6BE8",
        surface: {
          elevated: "hsl(var(--surface-elevated))",
          sunken: "hsl(var(--surface-sunken))",
        },
        status: {
          pending: "hsl(var(--muted))",
          generating: "hsl(38 92% 50%)",
          complete: "hsl(150 70% 45%)",
          error: "hsl(var(--destructive))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        /* Flow C radii scale */
        tag: "4px",
        btn: "6px",
        square: "8px",
        media: "14px",
        sheet: "20px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Helvetica Neue", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      boxShadow: {
        "glow-sm": "0 0 20px rgba(167, 139, 250, 0.2)",
        "glow-md": "0 0 40px rgba(167, 139, 250, 0.3)",
        "glow-lg": "0 8px 60px rgba(244, 114, 182, 0.35)",
        "glow-sky": "0 0 32px rgba(111, 168, 255, 0.35)",
        "glow-violet": "0 0 32px rgba(167, 139, 250, 0.45)",
        "glow-pink": "0 0 32px rgba(244, 114, 182, 0.45)",
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
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease forwards",
        "slide-up": "slide-up 0.5s ease forwards",
        shimmer: "shimmer 2s linear infinite",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        shimmer: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.1), transparent)",
        /* Brand gradient — accents/marks/meters only, never under white text */
        "gradient-canopy": "var(--gradient-canopy)",
        /* Action gradient — white-text safe; the ONE generative CTA per screen */
        "gradient-action": "var(--gradient-action)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
