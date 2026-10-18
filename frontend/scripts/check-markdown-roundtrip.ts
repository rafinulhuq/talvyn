/**
 * Verifies the blog editor's markdown round-trip: markdown loaded into the
 * TipTap editor and serialized back must preserve document structure, so
 * opening an existing post in the rich editor can't corrupt it.
 *
 * Run: npx tsx scripts/check-markdown-roundtrip.ts
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  DOMParser: dom.window.DOMParser,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  Node: dom.window.Node,
  Text: dom.window.Text,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Range: dom.window.Range,
  CustomEvent: dom.window.CustomEvent,
  InputEvent: dom.window.InputEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
// ProseMirror probes selection APIs jsdom doesn't fully implement.
dom.window.document.getSelection = () =>
  ({
    rangeCount: 0,
    addRange: () => undefined,
    removeAllRanges: () => undefined,
    getRangeAt: () => null,
  }) as unknown as Selection;

async function main() {
  const [{ Editor }, { default: StarterKit }, { default: TiptapImage }, { Markdown }] =
    await Promise.all([
      import("@tiptap/core"),
      import("@tiptap/starter-kit"),
      import("@tiptap/extension-image"),
      import("tiptap-markdown"),
    ]);

  const samples: Array<{ name: string; input: string; expected?: string }> = [
    {
      name: "headings and paragraphs",
      input: "# Title\n\nSome **bold** and *italic* and `code`.\n\n## Section\n\nMore text.",
    },
    {
      name: "lists",
      input: "- one\n- two\n- three\n\n1. first\n2. second",
    },
    {
      name: "blockquote and divider",
      input: "> A wise quote.\n\n---\n\nAfter the divider.",
    },
    {
      name: "links and images",
      input:
        "Read [the docs](https://example.com/docs).\n\n![Alt text](/api/cms/media/abc-123)",
    },
    {
      name: "code fence",
      input: "```\nconst x = 1;\nconsole.log(x);\n```",
    },
    {
      name: "real post shape",
      input:
        "## AI Makes Hiring Faster\n\nAI can help companies reduce repetitive work.\n\n- AI helps with screening\n- Recruiters review the results\n\n> Use AI as an assistant, not the final authority.",
    },
  ];

  let failures = 0;
  for (const sample of samples) {
    const editor = new Editor({
      element: dom.window.document.createElement("div"),
      extensions: [StarterKit, TiptapImage, Markdown.configure({ html: false })],
      content: sample.input,
    });
    const storage = (editor.storage as unknown as { markdown: { getMarkdown: () => string } })
      .markdown;
    const once = storage.getMarkdown();

    // Round-trip a second time: serialize(parse(x)) must be a fixed point.
    editor.commands.setContent(once, { emitUpdate: false });
    const twice = storage.getMarkdown();
    editor.destroy();

    if (once !== twice) {
      failures += 1;
      console.error(`✗ ${sample.name}: serialization is not stable`);
      console.error(`  pass 1: ${JSON.stringify(once)}`);
      console.error(`  pass 2: ${JSON.stringify(twice)}`);
      continue;
    }

    // Structural preservation: key tokens must survive the first pass.
    const mustSurvive = ["**bold**", "https://example.com/docs", "/api/cms/media/abc-123", "```"]
      .filter((token) => sample.input.includes(token));
    const lost = mustSurvive.filter((token) => !once.includes(token));
    if (lost.length > 0) {
      failures += 1;
      console.error(`✗ ${sample.name}: lost tokens ${JSON.stringify(lost)}`);
      console.error(`  output: ${JSON.stringify(once)}`);
      continue;
    }

    console.log(`✓ ${sample.name}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} round-trip check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll markdown round-trip checks passed.");
}

void main();
