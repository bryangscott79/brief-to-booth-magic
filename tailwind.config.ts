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
          hero: "hsl(var(--canopy-magenta))",
          storytelling: "hsl(var(--canopy-blue))",
          lounge: "hsl(var(--canopy-sky))",
          reception: "hsl(var(--canopy-violet))",
          service: "hsl(220 15% 50%)",
        },
        canopy: {
          sky: "hsl(var(--canopy-sky))",
          blue: "hsl(var(--canopy-blue))",
          violet: "hsl(var(--canopy-violet))",
          purple: "hsl(var(--canopy-purple))",
          magenta: "hsl(var(--canopy-magenta))",
          navy: "hsl(var(--canopy-navy))",
          charcoal: "hsl(var(--canopy-charcoal))",
        },
        surface: {
          elevated: "hsl(var(--surface-elevated))",
          sunken: "hsl(var(--surface-sunken))",
        },
        status: {
          pending: "hsl(var(--muted))",
          generating: "hsl(var(--canopy-violet))",
          complete: "hsl(150 70% 45%)",
          error: "hsl(var(--destructive))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      boxShadow: {
        "glow-sm": "0 0 20px hsl(255 92% 76% / 0.2)",
        "glow-md": "0 0 40px hsl(255 92% 76% / 0.25)",
        "glow-lg": "0 8px 60px hsl(255 92% 76% / 0.35)",
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
        "gradient-canopy": "linear-gradient(135deg, hsl(var(--canopy-sky)) 0%, hsl(var(--canopy-blue)) 25%, hsl(var(--canopy-violet)) 50%, hsl(var(--canopy-purple)) 75%, hsl(var(--canopy-magenta)) 100%)",
        shimmer: "linear-gradient(90deg, transparent, hsl(var(--canopy-violet) / 0.15), transparent)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
