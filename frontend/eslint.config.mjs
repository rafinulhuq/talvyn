import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "next-env.d.ts",
      "out/**",
      "build/**",
      "wasm-parser/**",
      // wasm-bindgen generated glue code (committed so contributors don't
      // need the Rust toolchain — see build:wasm) — not hand-authored,
      // regenerated wholesale by `npm run build:wasm`, not worth linting.
      "src/lib/wasm/talvyn_parser.js",
      "src/lib/wasm/talvyn_parser.d.ts",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
];

export default eslintConfig;
