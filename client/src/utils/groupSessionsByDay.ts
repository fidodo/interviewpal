import { SessionListItem } from "../types";

export interface SessionDayGroup {
  dayKey: string;
  label: string;
  sessions: SessionListItem[];
}

function dayKeyOf(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function labelFor(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (dayKeyOf(dateStr) === dayKeyOf(today.toISOString())) return "Today";
  if (dayKeyOf(dateStr) === dayKeyOf(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Groups by local calendar day of `startedAt`, preserving the API's existing
// most-recent-first order within and across groups.
export function groupSessionsByDay(sessions: SessionListItem[]): SessionDayGroup[] {
  const groups: SessionDayGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const session of sessions) {
    const key = dayKeyOf(session.startedAt);
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      groups[existingIndex].sessions.push(session);
    } else {
      indexByKey.set(key, groups.length);
      groups.push({ dayKey: key, label: labelFor(session.startedAt), sessions: [session] });
    }
  }

  return groups;
}
