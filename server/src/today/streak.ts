// Streak maths on UTC day numbers (days since 1970-01-01). Pure, so it's easy to test.

export const DAY_MS = 86_400_000;
export const WEEKLY_GOAL = 5;

export const dayNumber = (d: Date) => Math.floor(d.getTime() / DAY_MS);
export const dayDate = (n: number) => new Date(n * DAY_MS);
export const isoDay = (n: number) => dayDate(n).toISOString().slice(0, 10);
// Weeks start on Monday (UTC), like weekly goals and the progress page. 1970-01-01 was a Thursday.
export const weekStart = (n: number) => n - ((n + 3) % 7);

export interface StreakStats {
  current: number;
  best: number;
  practisedToday: boolean;
  // Yesterday was missed but this week's freeze is still free: practising today keeps the streak.
  atRisk: boolean;
  // A freeze day already covered a missed day this week.
  freezeUsedThisWeek: boolean;
  // Days practised this week (Monday to today), towards WEEKLY_GOAL.
  weekDays: number;
}

// A streak counts days in a row with any practice. One missed day a week is forgiven (a "freeze day") as long
// as the days either side were practised, so one bad day doesn't wipe out weeks of work. Today never breaks
// a streak: it isn't over yet.
export function streakStats(days: Iterable<number>, today: number): StreakStats {
  const set = new Set(days);
  const weekDays = [...set].filter((d) => d >= weekStart(today) && d <= today).length;
  if (set.size === 0) return { current: 0, best: 0, practisedToday: false, atRisk: false, freezeUsedThisWeek: false, weekDays };

  let run = 0;
  let best = 0;
  let frozenWeeks = new Set<number>();
  let atRisk = false;
  for (let d = Math.min(...set); d <= today; d++) {
    if (set.has(d)) {
      run++;
      best = Math.max(best, run);
      continue;
    }
    if (d === today) continue;
    const week = weekStart(d);
    if (run > 0 && !frozenWeeks.has(week)) {
      if (set.has(d + 1)) {
        frozenWeeks.add(week);
        continue;
      }
      if (d + 1 === today) {
        atRisk = true;
        continue;
      }
    }
    run = 0;
    frozenWeeks = new Set();
  }
  return {
    current: run,
    best,
    practisedToday: set.has(today),
    atRisk,
    freezeUsedThisWeek: frozenWeeks.has(weekStart(today)),
    weekDays,
  };
}
