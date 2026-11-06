import { prisma } from "../db/prisma";
import { emailEnabled } from "../config/env";
import { summary as termsSummary } from "../terms/terms.service";
import { coverage, listEntries } from "../story/bank.service";
import { BADGES } from "./badges";
import { practiceDays } from "./practice.service";
import { dayNumber, isoDay, streakStats, weekStart, WEEKLY_GOAL } from "./streak";

const RETAKE_BELOW = 6;
const RETAKE_WINDOW_DAYS = 30;

export interface TodayItem {
  key: "terms" | "learn" | "retake" | "interview" | "speak";
  title: string;
  detail: string;
  // An app path; "#quick-practice" means the quick-practice form on the dashboard itself.
  link: string;
  minutes: number;
  done: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const speakLink = (topic: string) => `/speak?kind=EXPERIENCE&topic=${encodeURIComponent(topic)}`;

// About 10 minutes of practice for today, built from what's due and what's weakest. No AI. An item ticks off when
// it's done today; items with nothing to do and nothing done are left out.
async function plan(userId: string, doneToday: Set<string>): Promise<TodayItem[]> {
  const now = new Date();
  const [terms, learnDue, weak, entries] = await Promise.all([
    termsSummary(userId),
    prisma.reviewItem.count({ where: { userId, dueAt: { lte: now } } }),
    prisma.answer.findFirst({
      where: {
        submittedAt: { gte: new Date(now.getTime() - RETAKE_WINDOW_DAYS * 86_400_000) },
        feedback: { score: { lt: RETAKE_BELOW } },
        retakes: { none: {} },
        // A running mock interview holds its feedback, so its answers can't be retaken yet.
        question: { session: { userId, OR: [{ mode: { not: "MOCK" } }, { status: "COMPLETED" }] } },
      },
      orderBy: [{ feedback: { score: "asc" } }, { submittedAt: "desc" }],
      select: { questionId: true, feedback: { select: { score: true } }, question: { select: { text: true, sessionId: true } } },
    }),
    listEntries(userId),
  ]);
  const items: TodayItem[] = [];

  const waiting = terms.due + terms.newToday;
  if (terms.total > 0 && (waiting > 0 || terms.reviewedToday > 0)) {
    items.push({
      key: "terms",
      title: waiting > 0 ? "Review your interview terms" : "Interview terms reviewed",
      detail: waiting > 0 ? [terms.due && `${terms.due} due`, terms.newToday && `${terms.newToday} new`].filter(Boolean).join(", ") : "Nothing else due today.",
      link: "/terms/review",
      minutes: Math.max(1, Math.round(Math.min(waiting, 10) * 0.4)),
      done: waiting === 0,
    });
  }

  if (learnDue > 0 || doneToday.has("LEARN")) {
    items.push({
      key: "learn",
      title: learnDue > 0 ? "Review lesson questions" : "Lesson reviews done",
      detail: learnDue > 0 ? `${plural(learnDue, "question")} due from your courses` : "Nothing else due today.",
      link: "/learn/review",
      minutes: Math.max(1, Math.round(Math.min(learnDue, 10) * 0.5)),
      done: learnDue === 0,
    });
  }

  if (doneToday.has("RETAKE")) {
    items.push({ key: "retake", title: "Retake a weak answer", detail: "Done: you retook an answer today.", link: "/history", minutes: 3, done: true });
  } else if (weak) {
    const text = weak.question.text.length > 90 ? `${weak.question.text.slice(0, 87).trimEnd()}…` : weak.question.text;
    items.push({
      key: "retake",
      title: "Retake a weak answer",
      detail: `"${text}" scored ${weak.feedback?.score}/10.`,
      link: `/sessions/${weak.question.sessionId}/questions/${weak.questionId}/retake`,
      minutes: 3,
      done: false,
    });
  } else {
    items.push({
      key: "interview",
      title: "Answer an interview question",
      detail: doneToday.has("ANSWER") ? "Done: you answered a question today." : "One quick-practice question, out loud.",
      link: "#quick-practice",
      minutes: 3,
      done: doneToday.has("ANSWER"),
    });
  }

  const gap = coverage(entries).find((c) => c.count === 0);
  const speakDone = doneToday.has("SPEAK") || doneToday.has("DRILL");
  if (entries.length === 0) {
    items.push({
      key: "speak",
      title: "Tell a story out loud",
      detail: speakDone ? "Done: you practised in Speak today." : "Start your story bank with a time you were proud of your work.",
      link: speakLink("a time you were proud of your work"),
      minutes: 3,
      done: speakDone,
    });
  } else if (gap && !speakDone) {
    items.push({
      key: "speak",
      title: `Tell a ${gap.label.toLowerCase()} story`,
      detail: `Your story bank has nothing for ${gap.label.toLowerCase()} yet.`,
      link: speakLink(`A time you showed ${gap.label.toLowerCase()}: ${gap.description.toLowerCase()}`),
      minutes: 3,
      done: false,
    });
  } else {
    items.push({
      key: "speak",
      title: "Which story fits?",
      detail: speakDone ? "Done: you practised your stories today." : "Match a behavioural question to a story from your bank.",
      link: "/speak/bank/drill",
      minutes: 2,
      done: speakDone,
    });
  }
  return items;
}

export async function getToday(userId: string) {
  const todayNo = dayNumber(new Date());
  const [days, achievements, user] = await Promise.all([
    practiceDays(userId),
    prisma.achievement.findMany({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { dailyReminder: true, emailVerified: true } }),
  ]);
  const doneToday = new Set(days.find((d) => d.day === todayNo)?.kinds ?? []);
  const stats = streakStats(
    days.map((d) => d.day),
    todayNo
  );
  const practised = new Set(days.map((d) => d.day));
  const monday = weekStart(todayNo);
  const earned = new Map(achievements.map((a) => [a.key, a.earnedAt]));

  return {
    date: isoDay(todayNo),
    items: await plan(userId, doneToday),
    streak: { current: stats.current, best: stats.best, practisedToday: stats.practisedToday, atRisk: stats.atRisk, freezeUsedThisWeek: stats.freezeUsedThisWeek },
    // Monday to Sunday; null for days still to come.
    week: {
      goal: WEEKLY_GOAL,
      practised: stats.weekDays,
      days: Array.from({ length: 7 }, (_, i) => (monday + i > todayNo ? null : practised.has(monday + i))),
    },
    badges: BADGES.map((b) => ({ ...b, earnedAt: earned.get(b.key) ?? null })),
    reminder: { available: emailEnabled, enabled: !!user?.dailyReminder, verified: !!user?.emailVerified },
  };
}

export type Today = Awaited<ReturnType<typeof getToday>>;

export async function setReminder(userId: string, enabled: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { dailyReminder: enabled } });
}
