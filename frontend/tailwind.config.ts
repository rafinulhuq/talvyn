import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ─── Precision Developer Instrument Tokens ──────────────
      colors: {
        brand: {
          50:  "#FEFDF5",
          100: "#FDFBE8",
          200: "#FAF5C5",
          300: "#F7EE9E",
          400: "#F5E573",
          500: "#F2D74E", // Signal Yellow Accent
          600: "#E5C83B",
          700: "#C9AE28",
          800: "#A38B1C",
          900: "#7A6715",
          950: "#1A1600", // Accent Ink
        },
        accent: {
          DEFAULT: "#F2D74E",
          hover: "#F7E27A",
          ink: "#1A1600",
          50:  "#FEFDF5",
          100: "#FDFBE8",
          200: "#FAF5C5",
          300: "#F7EE9E",
          400: "#F5E573",
          500: "#F2D74E",
          600: "#E5C83B",
          700: "#C9AE28",
          800: "#A38B1C",
          900: "#7A6715",
        },
        ink: {
          950: "#0B0C0E", // Page graphite
          900: "#121317", // Surface graphite
          800: "#181A1F", // Raised graphite
          700: "#22242B", // Overlay graphite
          600: "#5A5F68", // Faint
          500: "#8A8F98", // Muted
          400: "#EDEEF0", // Text
        },
        mist: {
          DEFAULT: "#121317",
          deep: "#0B0C0E",
        },
        indigo: {
          50:  "#FEFDF5",
          100: "#FDFBE8",
          200: "#FAF5C5",
          300: "#F7EE9E",
          400: "#F5E573",
          500: "#F2D74E",
          600: "#F2D74E",
          700: "#E5C83B",
          800: "#C9AE28",
          900: "#7A6715",
          950: "#1A1600",
        },
        surface: {
          canvas: "#0B0C0E",
          DEFAULT: "#121317",
          raised: "#181A1F",
          muted: "#181A1F",
          subtle: "#22242B",
          border: "rgba(255, 255, 255, 0.08)",
        },
        success: {
          light: "rgba(74, 222, 128, 0.12)",
          DEFAULT: "#4ADE80",
          dark: "#22C55E",
        },
        warning: {
          light: "rgba(250, 204, 21, 0.12)",
          DEFAULT: "#FACC15",
          dark: "#EAB308",
        },
        danger: {
          light: "rgba(248, 113, 113, 0.12)",
          DEFAULT: "#F87171",
          dark: "#EF4444",
        },
        info: {
          light: "rgba(56, 189, 248, 0.12)",
          DEFAULT: "#38bdf8",
          dark: "#0369a1",
        },
      },

      // ─── Typography ────────────────────────────────────────
      // Plus Jakarta Sans (display) + Inter (body/UI) replace Geist Sans as
      // the closest free pairing to the reference site's EuclidSquare/Inter
      // (EuclidSquare itself is a commercial Swiss Typefaces license, not
      // redistributable) — `font-display` is opt-in via className for
      // headings, `sans` (the default) covers body/UI text. Geist Mono is
      // left as the `mono` face unchanged — it backs the candidate exam's
      // code-question editor, a separate concern from this reskin.
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Menlo", "monospace"],
      },

      // ─── Spacing ───────────────────────────────────────────
      // Extends with 8px grid values
      spacing: {
        "4.5": "1.125rem",
        "13": "3.25rem",
        "15": "3.75rem",
        "18": "4.5rem",
      },

      // ─── Animations ────────────────────────────────────────
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-right": {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        // Reveals a block of unknown height. Interpolating `grid-template-rows`
        // between 0fr and 1fr is the only way to animate to `auto` height —
        // max-height guesses either clip tall content or add dead time.
        "expand-down": {
          "0%":   { gridTemplateRows: "0fr", opacity: "0" },
          "100%": { gridTemplateRows: "1fr", opacity: "1" },
        },
        // Score bars. These already carried `transition-all`, but the width is
        // set on first paint so there was never a previous value to
        // transition from — nothing ever animated. scaleX from a left origin
        // grows the fill without touching layout.
        "bar-fill": {
          "0%":   { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "page-enter": {
          "0%":   { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-left": {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-100%)" },
        },
        "fade-backdrop": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-backdrop-out": {
          "0%":   { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-10px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.55" },
          "50%":      { opacity: "0.9" },
        },

        // ─── Admin motion system (2026-09) ───────────────────
        // `rise-in` is the workhorse entrance: a shorter, softer
        // `page-enter` meant to be *staggered* across siblings (see the
        // `.stagger` utility in globals.css), so a list reads as one wave
        // rather than a hard cut. The 8px offset is deliberately small —
        // large offsets stack badly once eight rows animate at once.
        "rise-in": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Popovers/menus/toasts: grow from 96% so they read as emerging
        // from their trigger rather than sliding in from nowhere.
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        // Sweeping highlight for skeletons. `animate-pulse` dims the whole
        // block in place, which reads as "broken/disabled"; a travelling
        // band reads as "loading".
        "shimmer": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-out-right": "slide-out-right 0.26s cubic-bezier(0.4, 0, 1, 1) both",
        "expand-down":     "expand-down 0.26s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "bar-fill":        "bar-fill 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "pulse-dot": "pulse-dot 1.5s ease-in-out infinite",
        // `backwards`, not `both` — see the note on rise-in below. `both`
        // left `transform: translateY(0)` applied at animation priority for
        // the life of the page, and an element with a transform is a
        // containing block for `position: fixed` descendants. Every modal
        // overlay rendered inside PageTransition therefore resolved
        // `fixed inset-0` against the *content area* rather than the
        // viewport: the dossier drawer's backdrop stopped below the header
        // and inside <main>'s padding, leaving undimmed white gutters.
        "page-enter": "page-enter 0.38s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "slide-in-left":    "slide-in-left 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-out-left":   "slide-out-left 0.24s cubic-bezier(0.4, 0, 1, 1) both",
        "fade-backdrop":    "fade-backdrop 0.2s ease-out both",
        "fade-backdrop-out":"fade-backdrop-out 0.22s ease-in both",
        "float":      "float 6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 4s ease-in-out infinite",
        // `backwards`, NOT `both`. Backwards holds the first keyframe during
        // the stagger delay (so a waiting row is invisible rather than
        // flashing at full opacity), but releases the element once the
        // animation ends. `forwards`/`both` would pin `transform:
        // translateY(0)` at animation priority forever, which outranks every
        // normal declaration — silently killing the hover-lift on any card
        // inside a `.stagger`, and leaving a transform that makes each row a
        // containing block for `position: fixed` descendants.
        "rise-in":    "rise-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "scale-in":   "scale-in 0.16s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "shimmer":    "shimmer 1.6s linear infinite",
      },

      // ─── Easing ────────────────────────────────────────────
      // One named curve for interactive state changes, so hover/press/
      // open transitions across the admin UI all decelerate identically
      // instead of each surface picking its own default `ease`.
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
        "smooth-in": "cubic-bezier(0.4, 0, 0.2, 1)",
      },

      // ─── Border radius ─────────────────────────────────────
      borderRadius: {
        "4xl": "2rem",
      },

      // ─── Box shadows ───────────────────────────────────────
      // Retinted to Teal, and strengthened slightly (0.08 → 0.10 base
      // opacity) — part of the "cards look flat/dated" fix: the previous
      // shadow value was so faint it barely read against white, which is
      // as much a component problem as a color one.
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)",
        "card-hover":
          "0 10px 18px -4px rgb(0 0 0 / 0.08), 0 4px 6px -2px rgb(0 0 0 / 0.05)",
        "focus-ring": "0 0 0 2px #F2D74E",
      },
    },
  },
  plugins: [],
};

export default config;
