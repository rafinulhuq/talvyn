import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatClock, isAnswered, mergeResume, toPayload, urgencyFor } from "../../src/lib/candidate/answers";
import type { CandidateQuestion } from "../../src/types/attempt";

const q = (over: Partial<CandidateQuestion>): CandidateQuestion => ({
  id: "q1",
  question_type: "OPEN_ENDED",
  question_text: "Explain",
  skill_tested: null,
  difficulty: "EASY",
  marks: 1,
  order_index: 0,
  options: null,
  code_language: null,
  code_starter: null,
  ...over,
});

describe("toPayload", () => {
  it("sends A–D as a choice and anything else as text", () => {
    assert.deepEqual(toPayload("q", "B"), { question_id: "q", selected_option: "B", answer_text: null });
    assert.deepEqual(toPayload("q", "Because B"), { question_id: "q", selected_option: null, answer_text: "Because B" });
    assert.deepEqual(toPayload("q", ""), { question_id: "q", selected_option: null, answer_text: null });
  });
});

describe("isAnswered", () => {
  it("ignores blank text and untouched starter code", () => {
    assert.equal(isAnswered(q({}), "   "), false);
    assert.equal(isAnswered(q({ question_type: "CODE", code_starter: "def f():\n  pass" }), "def f():\n  pass\n"), false);
    assert.equal(isAnswered(q({ question_type: "CODE", code_starter: "def f():" }), "def f():\n  return 1"), true);
  });
});

describe("mergeResume", () => {
  it("prefers unsaved local answers, only for this attempt's questions", () => {
    const r = mergeResume({ a: "A", b: "old" }, { b: "new", c: "C", x: "stale" }, new Set(["a", "b", "c"]));
    assert.deepEqual(r.answers, { a: "A", b: "new", c: "C" });
    assert.deepEqual(r.pending.sort(), ["b", "c"]);
  });
  it("does nothing when local matches the server", () => {
    assert.deepEqual(mergeResume({ a: "A" }, { a: "A" }, new Set(["a"])).pending, []);
  });
});

describe("timer formatting", () => {
  it("formats and grades urgency", () => {
    assert.equal(formatClock(3725), "1:02:05");
    assert.equal(formatClock(59), "00:59");
    assert.equal(formatClock(-3), "00:00");
    assert.equal(urgencyFor(301), "normal");
    assert.equal(urgencyFor(300), "warning");
    assert.equal(urgencyFor(60), "critical");
  });
});

import { DEFAULT_CANDIDATE_COPY, fill, mergeCopy } from "../../src/lib/cms/candidate-copy";

describe("candidate copy", () => {
  it("applies overrides per key and ignores wrong types", () => {
    const merged = mergeCopy(DEFAULT_CANDIDATE_COPY, {
      completion: { heading: "Thanks!", nextItems: ["One"] },
      expiredPage: { heading: 42 },
      invalidInvitation: { custom: { heading: "H", body: "B" } },
    });
    assert.equal(merged.completion.heading, "Thanks!");
    assert.deepEqual(merged.completion.nextItems, ["One"]);
    assert.equal(merged.completion.body, DEFAULT_CANDIDATE_COPY.completion.body);
    assert.equal(merged.expiredPage.heading, DEFAULT_CANDIDATE_COPY.expiredPage.heading);
    assert.deepEqual(merged.invalidInvitation.custom, { heading: "H", body: "B" });
  });
  it("fills placeholders", () => {
    assert.equal(fill("Test {current} of {total}", { current: 2, total: 3 }), "Test 2 of 3");
  });
});

describe("mergeCopy arrays", () => {
  it("accepts object lists for object defaults and empty defaults, rejects mismatched items", () => {
    assert.deepEqual(mergeCopy({ steps: [] as { t: string }[] }, { steps: [{ t: "a" }] }).steps, [{ t: "a" }]);
    assert.deepEqual(mergeCopy({ steps: [{ t: "x" }] }, { steps: ["nope"] }).steps, [{ t: "x" }]);
    assert.deepEqual(mergeCopy({ tags: ["a"] }, { tags: ["b", 3] }).tags, ["a"]);
  });
});
