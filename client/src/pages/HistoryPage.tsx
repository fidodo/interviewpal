import { useEffect, useState } from "react";
import { api } from "../api/client";
import { SessionListItem } from "../types";
import { HistoryList } from "../components/HistoryList";

export function HistoryPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ sessions: SessionListItem[] }>("/sessions")
      .then((res) => setSessions(res.sessions))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1 className="page-title">History</h1>
      <p className="page-subtitle">Every mock interview you've run, most recent first.</p>
      <div className="card">
        {loading ? <p className="helper-text">Loading…</p> : <HistoryList sessions={sessions} />}
      </div>
    </div>
  );
}
