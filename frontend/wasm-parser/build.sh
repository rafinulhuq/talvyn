#!/usr/bin/env bash
# Builds the Rust PDF/DOCX parser to WebAssembly and places the output
# where Next.js serves it from (public/wasm/) and where the loader
# imports its types from (src/lib/wasm/).
#
# Requires: rustc + cargo with the wasm32-unknown-unknown target, and
# wasm-bindgen-cli matching the `wasm-bindgen` crate version in Cargo.toml.
#   cargo install wasm-bindgen-cli --version <version from Cargo.toml>
#
# Run after changing src/lib.rs. Output is committed to git — most
# contributors never need the Rust toolchain to build/run the app.
set -euo pipefail
cd "$(dirname "$0")"

OUT_NAME="talvyn_parser"
PUBLIC_DIR="../public/wasm"
TYPES_DIR="../src/lib/wasm"

echo "[wasm-parser] Building release binary for wasm32-unknown-unknown..."
RUSTFLAGS='--cfg getrandom_backend="wasm_js"' cargo build --target wasm32-unknown-unknown --release

echo "[wasm-parser] Running wasm-bindgen..."
rm -rf pkg
wasm-bindgen "target/wasm32-unknown-unknown/release/${OUT_NAME}.wasm" \
  --out-dir pkg --out-name "${OUT_NAME}" --target web

mkdir -p "$PUBLIC_DIR" "$TYPES_DIR"
cp "pkg/${OUT_NAME}_bg.wasm" "$PUBLIC_DIR/${OUT_NAME}_bg.wasm"
cp "pkg/${OUT_NAME}.js" "$TYPES_DIR/${OUT_NAME}.js"
cp "pkg/${OUT_NAME}.d.ts" "$TYPES_DIR/${OUT_NAME}.d.ts"

# Next/Turbopack statically resolves wasm-bindgen's default
# `new URL(..., import.meta.url)` fallback even though jdParser passes an
# explicit public URL. Keep the generated glue aligned with public/wasm.
perl -0pi -e "s|new URL\\('${OUT_NAME}_bg\\.wasm', import\\.meta\\.url\\)|'/wasm/${OUT_NAME}_bg.wasm'|g" "$TYPES_DIR/${OUT_NAME}.js"

echo "[wasm-parser] Done. Wrote:"
echo "  $PUBLIC_DIR/${OUT_NAME}_bg.wasm"
echo "  $TYPES_DIR/${OUT_NAME}.js"
echo "  $TYPES_DIR/${OUT_NAME}.d.ts"
