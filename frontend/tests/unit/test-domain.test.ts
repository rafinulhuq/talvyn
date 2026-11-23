import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MIX, mixFrom, sortQuestions, tidyStep } from "../../src/lib/domain/test";

describe("mixFrom", () => {
  it("uses the analysis' mix when it adds up to 100", () => {
    assert.deepEqual(mixFrom({ easy_percent: 20, medium_percent: 60, hard_percent: 20 }), { easy_percent: 20, medium_percent: 60, hard_percent: 20 });
  });
  it("falls back when missing, partial or not summing to 100", () => {
    assert.deepEqual(mixFrom(null), DEFAULT_MIX);
    assert.deepEqual(mixFrom({ easy_percent: 20 }), DEFAULT_MIX);
    assert.deepEqual(mixFrom({ easy_percent: 50, medium_percent: 50, hard_percent: 50 }), DEFAULT_MIX);
    assert.deepEqual(mixFrom({ easy_percent: "30", medium_percent: 50, hard_percent: 20 }), DEFAULT_MIX);
  });
});

describe("sortQuestions", () => {
  it("orders multiple choice, then written, then code; by order_index within a type", () => {
    const qs = [
      { id: "c", question_type: "CODE" as const, order_index: 0 },
      { id: "w", question_type: "OPEN_ENDED" as const, order_index: 0 },
      { id: "m2", question_type: "MCQ" as const, order_index: 2 },
      { id: "m1", question_type: "MCQ" as const, order_index: 1 },
    ];
    assert.deepEqual(sortQuestions(qs).map((q) => q.id), ["m1", "m2", "w", "c"]);
  });
});

describe("tidyStep", () => {
  it("drops trailing ellipses and periods the backend appends", () => {
    assert.equal(tidyStep("Generating Technical Screening Test…"), "Generating Technical Screening Test");
    assert.equal(tidyStep("Saving tests..."), "Saving tests");
    assert.equal(tidyStep("Done"), "Done");
  });
});

import { skillScores } from "../../src/lib/domain/evaluation";

describe("skillScores", () => {
  it("keeps numeric 0–100 entries, clamps and sorts best first (ties keep their order)", () => {
    assert.deepEqual(skillScores({ Laravel: 66.7, PHP: 100, Odd: "x", Over: 140 }), [
      { skill: "PHP", score: 100 },
      { skill: "Over", score: 100 },
      { skill: "Laravel", score: 66.7 },
    ]);
  });
});
