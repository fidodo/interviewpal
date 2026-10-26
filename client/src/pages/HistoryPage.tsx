import { useEffect, useState } from "react";
import { api } from "../api/client";
import { SessionListItem } from "../types";
import { HistoryList } from "../components/HistoryList";
import { groupSessionsByDay } from "../utils/groupSessionsByDay";

export function HistoryPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ sessions: SessionListItem[] }>("/sessions")
      .then((res) => setSessions(res.sessions))
      .finally(() => setLoading(false));
  }, []);

  const dayGroups = groupSessionsByDay(sessions);

  function handleDelete(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="page">
      <h1 className="page-title">History</h1>
      <p className="page-subtitle">Every mock interview you've run, grouped by day, most recent first.</p>
      {loading ? (
        <div className="card">
          <p className="helper-text">Loading…</p>
        </div>
      ) : dayGroups.length === 0 ? (
        <div className="card">
          <HistoryList sessions={[]} />
        </div>
      ) : (
        dayGroups.map((group) => (
          <div className="card" key={group.dayKey}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{group.label}</h2>
            <HistoryList sessions={group.sessions} onDelete={handleDelete} />
          </div>
        ))
      )}
    </div>
  );
}
