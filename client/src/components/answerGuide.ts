import { RubricGuide } from "../types";

// The interview-answer rubric, for places that show it before any answer exists (the "How you're graded" guide and
// the landing demo). Keep in step with ANSWER_GUIDE in server/src/ai/answer.rubric.ts; marked answers carry the
// server's copy as `guide`.
export const ANSWER_GUIDE: RubricGuide = {
  parts: [
    {
      key: "correctness",
      label: "Correctness",
      max: 5,
      bands: [
        "0: wrong, or doesn't answer the question.",
        "1-2: partly right, with a significant error or a big gap.",
        "3-4: right on the main point, with a small error or something missing.",
        "5: accurate and complete for the level. A coding answer whose tests ran needs every test passing.",
      ],
    },
    {
      key: "depth",
      label: "Depth",
      max: 3,
      bands: [
        "0: only a definition or a restated question.",
        "1: explains how or why it works.",
        "2: adds a trade-off, an edge case or a real example.",
        "3: trade-offs and edge cases with an example, or when you'd choose otherwise.",
      ],
    },
    {
      key: "clarity",
      label: "Clarity",
      max: 2,
      bands: ["0: hard to follow.", "1: understandable, but rambles or jumps around.", "2: answer first, then a clear order; easy to follow aloud."],
    },
  ],
  notes: ["The score is the three parts added up, never below 1. The level you picked sets how much is expected."],
};
