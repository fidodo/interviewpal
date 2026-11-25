// "Improve and resubmit" for Debug and System design. A marked exercise keeps its answer (the reference fix, the
// model design) hidden until the learner asks for it, and until then can be improved and marked again. Everything is
// kept in the exercise's `feedback` JSON, next to the mark itself:
//   attempt      which marked attempt this is (1 for the first)
//   history      the earlier attempts' scores, oldest first
//   answerShown  true once the answer has been opened, which ends resubmitting
// Results marked before this have no `attempt`: their answer was always shown, so they read as answerShown.

// The first attempt plus 3 resubmits.
export const MAX_ATTEMPTS = 4;

export interface AttemptInfo {
  attempt: number;
  history: { attempt: number; score: number }[];
  answerShown: boolean;
}

export function attemptInfo(feedback: unknown): AttemptInfo | null {
  if (!feedback || typeof feedback !== "object") return null;
  const f = feedback as { attempt?: unknown; history?: unknown; answerShown?: unknown };
  if (typeof f.attempt !== "number" || !Number.isInteger(f.attempt) || f.attempt < 1) return null;
  const history = Array.isArray(f.history)
    ? f.history.filter(
        (h): h is { attempt: number; score: number } => !!h && typeof h === "object" && typeof h.attempt === "number" && typeof h.score === "number"
      )
    : [];
  return { attempt: f.attempt, history, answerShown: f.answerShown === true };
}

// Whether the answer can be seen: always for results from before attempts were tracked.
export function answerVisible(info: AttemptInfo | null) {
  return !info || info.answerShown;
}

// Resubmits left after this marked attempt (0 once the answer has been shown).
export function attemptsLeft(info: AttemptInfo | null) {
  return info && !info.answerShown ? Math.max(0, MAX_ATTEMPTS - info.attempt) : 0;
}

// The attempt fields for a new mark, following the previous one (if this exercise was marked before).
export function nextAttempt(previous: AttemptInfo | null, previousScore: number | null) {
  if (!previous) return { attempt: 1, history: [], answerShown: false };
  return {
    attempt: previous.attempt + 1,
    history: [...previous.history, { attempt: previous.attempt, score: previousScore ?? 0 }],
    answerShown: false,
  };
}

// For the marking prompt: what the last attempt scored and was told to do, so the feedback can say what improved.
export function previousForPrompt(previousScore: number | null, steps: unknown) {
  const list = Array.isArray(steps)
    ? steps.map((s) => (s && typeof s === "object" && typeof (s as { step?: unknown }).step === "string" ? (s as { step: string }).step : null)).filter((s): s is string => !!s)
    : [];
  return { score: previousScore ?? 0, steps: list.slice(0, 3) };
}

export function previousAttemptLines(previous: { score: number; steps: string[] } | undefined) {
  if (!previous) return [];
  return [
    `This is a resubmission. Their last attempt scored ${previous.score}/10${previous.steps.length ? ` and was told:\n${previous.steps.map((s) => `- ${s}`).join("\n")}` : "."}`,
    `Mark this attempt on its own merits with the same rubric, and say in "feedback" what improved since last time and what still holds it back.`,
  ];
}
