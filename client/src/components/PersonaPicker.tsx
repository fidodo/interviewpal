import { Persona, PERSONA_LABELS } from "../types";

const PERSONAS = Object.keys(PERSONA_LABELS) as Persona[];

const DESCRIPTIONS: Record<Persona, string> = {
  NEUTRAL: "A fair, standard interviewer.",
  FRIENDLY_STARTUP: "Warm and practical: shipping, ownership, ambiguity.",
  BIG_TECH_STRICT: "High bar: scale, trade-offs, edge cases. Graded harder.",
};

// Interviewer style for a session (see server/src/ai/personas.ts).
export function PersonaPicker({ value, onChange, idPrefix }: { value: Persona; onChange: (p: Persona) => void; idPrefix: string }) {
  const labelId = `${idPrefix}-persona-label`;
  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        Interviewer
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId} aria-describedby={`${idPrefix}-persona-desc`}>
        {PERSONAS.map((p) => (
          <button key={p} type="button" className={`segmented-option ${value === p ? "active" : ""}`} aria-pressed={value === p} onClick={() => onChange(p)}>
            {PERSONA_LABELS[p]}
          </button>
        ))}
      </div>
      <p id={`${idPrefix}-persona-desc`} className="helper-text persona-desc">
        {DESCRIPTIONS[value]}
      </p>
    </div>
  );
}
