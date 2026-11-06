// Mirrors server/src/today (kept in sync by hand).

export interface Reward {
  type: "streak" | "badge" | "best";
  title: string;
  message: string;
}

export interface TodayItem {
  key: "terms" | "learn" | "retake" | "interview" | "speak";
  title: string;
  detail: string;
  // An app path, or "#quick-practice" for the form on the dashboard itself.
  link: string;
  minutes: number;
  done: boolean;
}

export interface Badge {
  key: string;
  title: string;
  description: string;
  earnedAt: string | null;
}

export interface Today {
  date: string;
  items: TodayItem[];
  streak: { current: number; best: number; practisedToday: boolean; atRisk: boolean; freezeUsedThisWeek: boolean };
  week: { goal: number; practised: number; days: (boolean | null)[] };
  badges: Badge[];
  reminder: { available: boolean; enabled: boolean; verified: boolean };
}

// The api wrapper fires this when a response carries rewards; RewardToaster shows them.
export const REWARDS_EVENT = "interviewpal:rewards";
