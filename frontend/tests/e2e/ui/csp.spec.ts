import { expect, test, type Page } from "@playwright/test";
import { cleanup } from "../api/helpers";
import { signInAs, unlockHighgarden } from "./session";

/** Records every CSP violation the browser reports on this page. */
async function watchViolations(page: Page) {
  const seen: string[] = [];
  await page.exposeFunction("__cspViolation", (v: string) => seen.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __cspViolation: (v: string) => void }).__cspViolation(`${e.violatedDirective} blocked ${e.blockedURI || "inline"} (${e.sourceFile ?? ""}:${e.lineNumber})`);
    });
  });
  return seen;
}

const PUBLIC = ["/", "/blog", "/login", "/signup", "/forgot-password", "/definitely-not-a-page", "/tests/session", "/exam/session", "/apply/e2e-unknown-link", "/test/complete", "/test/expired"];
const APP = ["/dashboard", "/dashboard/jds", "/dashboard/jds/upload", "/dashboard/candidates", "/dashboard/results", "/dashboard/users", "/dashboard/settings", "/dashboard/cmp", "/dashboard/cmp/blog", "/dashboard/highgarden"];

test("pages send a nonce-based CSP, and Next's scripts carry the nonce", async ({ request }) => {
  for (const path of ["/", "/signup", "/definitely-not-a-page"]) {
    const res = await request.get(path);
    const csp = res.headers()["content-security-policy"];
    expect(csp, path).toBeTruthy();
    const nonce = /'nonce-([^']+)'/.exec(csp!)?.[1];
    expect(nonce, path).toBeTruthy();
    const html = await res.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/type="application\/(ld\+)?json"/.test(t));
    expect(scripts.length, path).toBeGreaterThan(0);
    expect(scripts.filter((t) => !t.includes(`nonce="${nonce}"`)), `${path}: scripts without the nonce`).toEqual([]);
  }
  // A fresh nonce per request.
  const a = (await request.get("/")).headers()["content-security-policy"];
  const b = (await request.get("/")).headers()["content-security-policy"];
  expect(a).not.toEqual(b);
  // JSON routes don't need one.
  expect((await request.get("/api/auth/csrf")).headers()["content-security-policy"]).toBeUndefined();
});

test.describe("no violations", () => {
  test.use({ colorScheme: "dark" });

  test("public pages, and the theme script still runs", async ({ page }) => {
    const seen = await watchViolations(page);
    for (const path of PUBLIC) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(seen).toEqual([]);
  });

  test("app pages, the blog editor, and WebAssembly (the JD parser) are allowed", async ({ page, context, baseURL }) => {
    test.setTimeout(90_000);
    const seen = await watchViolations(page);
    const u = await signInAs(page, "SUPER_ADMIN");
    await unlockHighgarden(context, baseURL!);
    for (const path of APP) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    // The smallest valid module: magic + version. Compiling it is what the PDF/DOCX parser needs.
    await page.goto("/dashboard/jds/upload");
    const compiled = await page.evaluate(async () => {
      await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      return true;
    });
    expect(compiled).toBe(true);
    // What an XSS payload looks like: markup with an inline handler. It must NOT run.
    // (page.evaluate itself runs through DevTools and bypasses CSP, so the payload
    // has to be markup the page parses, not code we execute.)
    await page.evaluate(() => {
      document.body.insertAdjacentHTML("beforeend", '<img src="/does-not-exist.png" onerror="window.__pwned = true">');
    });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned === true)).toBe(false);
    await cleanup(u.id);
    // The blocked handler above is the only violation we expect.
    expect(seen.filter((v) => !/^script-src(-attr)? blocked inline/.test(v))).toEqual([]);
    expect(seen.length).toBe(1);
  });
});
