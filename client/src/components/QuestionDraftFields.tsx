import { PresetTopic, QuestionDraft } from "../api/pool";
import { Difficulty, LEVEL_LABELS } from "../types";

const LEVELS: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];

// The fields of a reported interview question: the question, its preset track and topic, the level and the company.
// Used by "Submit a question you were asked" and by the admin when approving one with corrections.
export function QuestionDraftFields({
  idPrefix,
  draft,
  topics,
  disabled,
  onChange,
}: {
  idPrefix: string;
  draft: QuestionDraft;
  topics: PresetTopic[];
  disabled?: boolean;
  onChange: (next: QuestionDraft) => void;
}) {
  const tracks = [...new Set(topics.map((t) => t.track))];
  const trackTopics = topics.filter((t) => t.track === draft.track);
  const set = (patch: Partial<QuestionDraft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-text`}>The question</label>
        <textarea
          id={`${idPrefix}-text`}
          className="input"
          rows={4}
          minLength={10}
          maxLength={1000}
          required
          disabled={disabled}
          value={draft.text}
          onChange={(e) => set({ text: e.target.value })}
        />
      </div>
      <div className="question-draft-row">
        <div className="field">
          <label htmlFor={`${idPrefix}-track`}>Track</label>
          <select
            id={`${idPrefix}-track`}
            className="input"
            disabled={disabled}
            value={draft.track}
            onChange={(e) => {
              const track = e.target.value;
              set({ track, topic: topics.find((t) => t.track === track)?.name ?? "" });
            }}
          >
            {tracks.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-topic`}>Topic</label>
          <select id={`${idPrefix}-topic`} className="input" disabled={disabled} value={draft.topic} onChange={(e) => set({ topic: e.target.value })}>
            {trackTopics.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-level`}>Level</label>
          <select id={`${idPrefix}-level`} className="input" disabled={disabled} value={draft.level} onChange={(e) => set({ level: e.target.value as Difficulty })}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-company`}>Company (optional)</label>
        <input
          id={`${idPrefix}-company`}
          className="input"
          maxLength={80}
          disabled={disabled}
          aria-describedby={`${idPrefix}-company-help`}
          value={draft.company}
          onChange={(e) => set({ company: e.target.value })}
        />
        <p id={`${idPrefix}-company-help`} className="helper-text">
          Shown with the question if it's approved, as "Reported at …". Your name is never shown.
        </p>
      </div>
    </>
  );
}
