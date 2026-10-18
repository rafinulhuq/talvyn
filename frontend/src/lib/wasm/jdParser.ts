/**
 * Client-side PDF/DOCX text extraction via WebAssembly (see frontend/wasm-parser).
 *
 * Used as a fast-path on JD upload: extracting in the browser lets the admin
 * see "no extractable text" errors instantly instead of waiting for an
 * upload + server parse round trip, and skips the server-side parse job
 * entirely when it succeeds. If the WASM module fails to load or the file
 * can't be parsed, callers fall back to the existing server-side parser.
 */

type ParserModule = typeof import("./talvyn_parser");

let modulePromise: Promise<ParserModule> | null = null;

async function loadParser(): Promise<ParserModule> {
  if (!modulePromise) {
    modulePromise = import("./talvyn_parser").then(async (mod) => {
      await mod.default("/wasm/talvyn_parser_bg.wasm");
      return mod;
    });
  }
  return modulePromise;
}

/**
 * Returns extracted text, or null if the file type isn't supported by the
 * WASM parser or extraction failed for any reason (corrupt file, scanned
 * PDF with no text layer, WASM load failure, etc). Callers should treat
 * null as "fall back to server-side parsing", not as an error.
 */
export async function extractTextClientSide(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "pdf" && ext !== "docx") return null;

  try {
    const mod = await loadParser();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = ext === "pdf" ? mod.extract_pdf_text(bytes) : mod.extract_docx_text(bytes);
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}
