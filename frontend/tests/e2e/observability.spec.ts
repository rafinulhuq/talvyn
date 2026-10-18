import { expect, test } from "@playwright/test";

test.describe("observability", () => {
  test("web vitals endpoint accepts valid metrics and rejects invalid payloads", async ({ request }) => {
    const valid = await request.post("/api/observability/web-vitals", {
      data: {
        id: "metric-1",
        name: "LCP",
        rating: "good",
        value: 1234,
        delta: 1234,
        startTime: 10,
        navigationType: "navigate",
        entryCount: 1,
      },
    });

    expect(valid.status()).toBe(204);

    const invalid = await request.post("/api/observability/web-vitals", {
      data: { name: "NOPE", value: "not-a-number" },
    });

    expect(invalid.status()).toBe(400);
  });
});
