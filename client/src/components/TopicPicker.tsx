import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Topic } from "../types";

interface TopicPickerProps {
  track: string;
  selectedTopicId: string | null;
  onSelect: (topic: Topic) => void;
  labelledBy?: string;
}

export function TopicPicker({ track, selectedTopicId, onSelect, labelledBy }: TopicPickerProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [customName, setCustomName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!track) return;
    setLoading(true);
    api
      .get<{ topics: Topic[] }>(`/topics?track=${encodeURIComponent(track)}`)
      .then((res) => setTopics(res.topics))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, [track]);

  async function handleAddCustom(e: FormEvent) {
    e.preventDefault();
    if (!customName.trim() || !track) return;
    setAdding(true);
    setError(null);
    try {
      const res = await api.post<{ topic: Topic }>("/topics", { name: customName.trim(), track });
      setTopics((prev) => {
        const exists = prev.some((t) => t.id === res.topic.id);
        return exists ? prev : [...prev, res.topic];
      });
      onSelect(res.topic);
      setCustomName("");
    } catch {
      setError("Couldn't add that topic. Try again.");
    } finally {
      setAdding(false);
    }
  }

  if (!track) return <p className="helper-text">Pick a track first.</p>;

  return (
    <div>
      {loading ? (
        <p className="helper-text" role="status">
          Loading topics…
        </p>
      ) : topics.length > 0 ? (
        <div className="topic-grid" role="group" aria-labelledby={labelledBy}>
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className={`topic-card ${selectedTopicId === topic.id ? "active" : ""}`}
              aria-pressed={selectedTopicId === topic.id}
              onClick={() => onSelect(topic)}
            >
              {topic.name}
              {topic.isCustom && <span className="badge" style={{ marginLeft: 6 }}>Custom</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="helper-text">No preset topics for this track yet — type your own below.</p>
      )}

      <form onSubmit={handleAddCustom} style={{ display: "flex", gap: 8, marginTop: 14 }} data-tour="custom-topic">
        <label htmlFor="custom-topic" className="visually-hidden">
          Custom topic
        </label>
        <input
          id="custom-topic"
          className="input"
          placeholder="Or type your own topic…"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
        />
        <button className="btn btn-secondary" type="submit" disabled={adding || !customName.trim()}>
          Add
        </button>
      </form>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
