/**
 * zod for browser code. `jitless` stops zod's `new Function` probe, which the
 * CSP (no 'unsafe-eval') reports as a violation on every form page even
 * though zod catches it. Interpreted validation is fast enough for forms.
 * Server code can keep importing "zod" directly (no CSP there).
 */
import { z } from "zod";

z.config({ jitless: true });

export { z };
