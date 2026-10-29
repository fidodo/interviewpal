// Interviewer styles a session can use. They change the tone and follow-up style of questions and how strictly
// answers are graded, not what is being tested.
export const PERSONAS = {
  NEUTRAL: {
    label: "Balanced",
    question: "",
    grading: "",
  },
  FRIENDLY_STARTUP: {
    label: "Friendly startup",
    question:
      "Interview style: a friendly startup founder or lead. Conversational and warm, practical scenarios about shipping, ownership and wearing many hats. Follow-ups ask how they'd handle ambiguity or move fast.",
    grading: "Interviewer style: friendly startup. Reward practicality, ownership and bias to action; be encouraging in tone, but still honest about gaps.",
  },
  BIG_TECH_STRICT: {
    label: "Big Tech, strict",
    question:
      "Interview style: a strict big-tech interviewer with a high bar. Precise, probing questions about scale, trade-offs, edge cases and complexity. Follow-ups dig into anything hand-wavy.",
    grading:
      "Interviewer style: strict big-tech bar. Grade harshly: vague answers, missing edge cases, unstated trade-offs or unclear structure lose points. Only clearly excellent answers score 8+.",
  },
} as const;

export type Persona = keyof typeof PERSONAS;
export const PERSONA_KEYS = Object.keys(PERSONAS) as [Persona, ...Persona[]];

export function personaOf(value: string | null | undefined): Persona {
  return value && value in PERSONAS ? (value as Persona) : "NEUTRAL";
}
