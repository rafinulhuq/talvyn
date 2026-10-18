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
      // ─── Brand colors — Teal + Coral system ──────────────────
      // Second reskin pass (see "Talvyn Color Directions", 2026-08-16) —
      // the first attempt (Cobalt + Leaf, modeled directly on a competitor's
      // extracted palette) read as generic/wrong once live. This is a
      // deliberately distinct direction, chosen from 3 mocked-up options
      // against the real dense admin layout, not another blind guess:
      // `brand` (teal) carries almost the entire interface — sidebar,
      // active/selected states, links, icons, badges. `accent` (coral) is
      // new and reserved *only* for primary-action buttons, so it stays
      // energetic instead of being diluted across every colored element.
      // `success` is a teal-leaning green (not a generic Tailwind green) so
      // it reads as part of the same family rather than a bolted-on hue.
      colors: {
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        accent: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        ink: {
          950: "#09090b",
          900: "#121215",
          800: "#18181b",
          700: "#27272a",
          600: "#3f3f46",
          500: "#71717a",
          400: "#a1a1aa",
        },
        mist: {
          DEFAULT: "#f8fafc",
          deep: "#f1f5f9",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f8fafc",
          subtle: "#f1f5f9",
          border: "#e2e8f0",
        },
        success: {
          light: "#ecfdf5",
          DEFAULT: "#10b981",
          dark: "#059669",
        },
        warning: {
          light: "#fffbeb",
          DEFAULT: "#f59e0b",
          dark: "#b45309",
        },
        danger: {
          light: "#fef2f2",
          DEFAULT: "#ef4444",
          dark: "#b91c1c",
        },
        info: {
          light: "#f0f9ff",
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
        "focus-ring": "0 0 0 3px rgb(99 102 241 / 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
