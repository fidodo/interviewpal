import { prisma } from "../db/prisma";
import { progress } from "../progress/progress.service";
import { BadgeKey, STREAK_MILESTONES, badge } from "./badges";
import { dayNumber, isoDay, streakStats, WEEKLY_GOAL } from "./streak";

export type PracticeKind = "ANSWER" | "RETAKE" | "SPEAK" | "DRILL" | "TERMS" | "LEARN" | "DEBUG" | "DESIGN";
type BestKind = "ANSWER" | "SPEAK" | "DEBUG" | "DESIGN";

const BEST_LABEL: Record<BestKind, string> = {
  ANSWER: "interview answer",
  SPEAK: "Speak take",
  DEBUG: "debug fix",
  DESIGN: "system design",
};

// Shown to the learner as a small celebration (the client's RewardToaster). Added to the graded action's response.
export interface Reward {
  type: "streak" | "badge" | "best";
  title: string;
  message: string;
}

export async function practiceDays(userId: string) {
  const rows = await prisma.practiceDay.findMany({ where: { userId }, select: { day: true, kinds: true } });
  return rows.map((r) => ({ day: dayNumber(r.day), kinds: r.kinds ?? [] }));
}

// Earns a badge once. True only for the request that earned it.
async function award(userId: string, key: BadgeKey) {
  const { count } = await prisma.achievement.createMany({ data: [{ userId, key }], skipDuplicates: true });
  return count === 1;
}

// A conditional write, so two scores landing at once can't both claim the same record.
async function personalBest(userId: string, kind: BestKind, score: number): Promise<Reward | null> {
  const current = await prisma.personalBest.findUnique({ where: { userId_kind: { userId, kind } } });
  if (!current) {
    // The first score of this kind sets the bar; there's nothing to beat yet.
    await prisma.personalBest.createMany({ data: [{ userId, kind, score }], skipDuplicates: true });
    return null;
  }
  if (score <= current.score) return null;
  const { count } = await prisma.personalBest.updateMany({ where: { userId, kind, score: { lt: score } }, data: { score, achievedAt: new Date() } });
  if (count !== 1) return null;
  return { type: "best", title: "New personal best!", message: `${score}/10 is your best ${BEST_LABEL[kind]} yet (your previous best was ${current.score}).` };
}

// Filler words per 100 words in the latest week with data, against the first week in the last 12 that had any.
async function fillersHalved(userId: string) {
  const { weeks } = await progress(userId);
  const values = weeks.map((w) => w.fillersPer100).filter((v): v is number => v != null);
  return values.length >= 2 && values[0] >= 2 && values[values.length - 1] <= values[0] / 2;
}

// Records that the user practised today, and works out anything worth celebrating. Called after a graded action
// has been saved; it never throws, because a reward must never fail the action itself. `score` (1-10) is passed
// only where the learner already sees it (not during a running mock interview).
export async function recordPractice(userId: string, kind: PracticeKind, score?: number | null): Promise<Reward[]> {
  try {
    const today = isoDay(dayNumber(new Date()));
    const rows = await prisma.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO "PracticeDay" ("userId", "day", "kinds") VALUES (${userId}, ${today}::date, ARRAY[${kind}]::text[])
      ON CONFLICT ("userId", "day") DO UPDATE SET "kinds" =
        CASE WHEN ${kind} = ANY("PracticeDay"."kinds") THEN "PracticeDay"."kinds" ELSE array_append("PracticeDay"."kinds", ${kind}) END
      RETURNING (xmax = 0) AS "inserted"`;
    const firstToday = rows[0]?.inserted === true;
    const rewards: Reward[] = [];
    const earn = async (key: BadgeKey) => {
      if (await award(userId, key)) rewards.push({ type: "badge", title: `Badge earned: ${badge(key).title}`, message: badge(key).description });
    };

    if (score != null) {
      const best = await personalBest(userId, kind === "RETAKE" ? "ANSWER" : (kind as BestKind), score);
      if (best) rewards.push(best);
      if (score >= 9) await earn("first-nine");
    }

    // Streak rewards are worked out once a day, on the first practice.
    if (firstToday) {
      const stats = streakStats((await practiceDays(userId)).map((d) => d.day), dayNumber(new Date()));
      rewards.unshift({
        type: "streak",
        title: stats.current > 1 ? `${stats.current} days in a row` : "Practice logged for today",
        message:
          stats.current > 1
            ? `Your streak is ${stats.current} days${stats.current >= stats.best ? ", your longest yet" : ""}. Come back tomorrow to keep it going.`
            : "Come back tomorrow to start a streak.",
      });
      for (const n of STREAK_MILESTONES) if (stats.current >= n) await earn(`streak-${n}`);
      if (stats.weekDays >= WEEKLY_GOAL) await earn("week-goal");
      if ((kind === "ANSWER" || kind === "RETAKE" || kind === "SPEAK") && (await fillersHalved(userId))) await earn("fillers-halved");
    }
    return rewards;
  } catch (err) {
    console.error("Couldn't record practice:", err);
    return [];
  }
}
