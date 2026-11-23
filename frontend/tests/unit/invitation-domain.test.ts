import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCandidateCsv } from "../../src/lib/domain/invitation";

describe("parseCandidateCsv", () => {
  it("reads a header in any column order, lower-cases emails and drops duplicates", () => {
    const { rows, duplicates } = parseCandidateCsv("Name,Email\nAda Lovelace,ADA@example.com\nAda again,ada@example.com\n");
    assert.equal(duplicates, 1);
    assert.deepEqual(rows, [{ line: 2, email: "ada@example.com", name: "Ada Lovelace", error: undefined }]);
  });
  it("treats a headerless file as email then name, and handles semicolons and quotes", () => {
    const { rows } = parseCandidateCsv('grace@example.com;"Hopper; Grace"\nlinus@example.com');
    assert.deepEqual(rows.map((r) => [r.email, r.name]), [["grace@example.com", "Hopper; Grace"], ["linus@example.com", ""]]);
  });
  it("flags invalid rows with their line number and strips a BOM", () => {
    const { rows } = parseCandidateCsv("﻿email\nnot-an-email\n\n,\n");
    assert.equal(rows[0]?.line, 2);
    assert.equal(rows[0]?.error, "Not a valid email address");
    assert.equal(rows[1]?.error, "No email address");
  });
});
