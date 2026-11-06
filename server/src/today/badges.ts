// Every badge there is. Each is earned once (Achievement rows keyed by `key`).
export const BADGES = [
  { key: "streak-3", title: "3 days in a row", description: "Practised 3 days in a row. A habit is forming." },
  { key: "streak-7", title: "One-week streak", description: "Practised 7 days in a row." },
  { key: "streak-14", title: "Two-week streak", description: "Practised 14 days in a row." },
  { key: "streak-30", title: "30-day streak", description: "Practised 30 days in a row." },
  { key: "streak-60", title: "60-day streak", description: "Practised 60 days in a row." },
  { key: "streak-100", title: "100-day streak", description: "Practised 100 days in a row." },
  { key: "week-goal", title: "Weekly goal met", description: "Practised on 5 days in one week." },
  { key: "first-nine", title: "First 9/10", description: "Scored 9 or more out of 10 on an answer, a story, a debug fix or a design." },
  { key: "fillers-halved", title: "Filler words halved", description: "Used half as many filler words a week as when you started." },
] as const;

export type BadgeKey = (typeof BADGES)[number]["key"];

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;

export const badge = (key: BadgeKey) => BADGES.find((b) => b.key === key)!;
