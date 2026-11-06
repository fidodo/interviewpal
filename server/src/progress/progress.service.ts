import { prisma } from "../db/prisma";
import { currentWeekStart } from "../roles/roles.service";
import { parseJsonObject } from "../utils/json";

export const PROGRESS_WEEKS = 12;
const WEEK_MS = 7 * 86_400_000;

interface FillerLike {
  count?: number;
  wordCount?: number;
}

interface TakeStats {
  wordCount: number;
  wpm: number | null;
  fillers?: { count: number };
  hedges?: { count: number };
}

interface Bucket {
  interviewScores: number[];
  speakScores: number[];
  fillerWords: number;
  fillerTotal: number;
  wpms: number[];
  hedgeWords: number;
  hedgeTotal: number;
  retakeGains: number[];
}

const empty = (): Bucket => ({ interviewScores: [], speakScores: [], fillerWords: 0, fillerTotal: 0, wpms: [], hedgeWords: 0, hedgeTotal: 0, retakeGains: [] });
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (list: number[]) => (list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null);

// Weekly trends for the progress page, worked out in code from what's already stored (no AI). Weeks start on
// Monday (UTC), like weekly goals; the last bucket is this week.
export async function progress(userId: string) {
  const firstWeek = new Date(currentWeekStart().getTime() - (PROGRESS_WEEKS - 1) * WEEK_MS);
  const [answers, retakes, takes] = await Promise.all([
    prisma.answer.findMany({
      where: { submittedAt: { gte: firstWeek }, question: { session: { userId } } },
      select: { submittedAt: true, fillerStats: true, feedback: { select: { score: true } } },
    }),
    prisma.answerRetake.findMany({
      where: { createdAt: { gte: firstWeek }, answer: { question: { session: { userId } } } },
      select: { createdAt: true, score: true, fillerStats: true, number: true, answer: { select: { feedback: { select: { score: true } }, retakes: { select: { number: true, score: true } } } } },
    }),
    prisma.storyTake.findMany({ where: { createdAt: { gte: firstWeek }, story: { userId } }, select: { createdAt: true, score: true, stats: true } }),
  ]);

  const buckets = Array.from({ length: PROGRESS_WEEKS }, empty);
  const bucketOf = (d: Date) => buckets[Math.min(PROGRESS_WEEKS - 1, Math.floor((d.getTime() - firstWeek.getTime()) / WEEK_MS))];
  const addFillers = (b: Bucket, stats: FillerLike | null) => {
    if (stats?.wordCount) {
      b.fillerWords += stats.wordCount;
      b.fillerTotal += stats.count ?? 0;
    }
  };

  for (const a of answers) {
    const b = bucketOf(a.submittedAt);
    if (a.feedback) b.interviewScores.push(a.feedback.score);
    addFillers(b, parseJsonObject<FillerLike>(a.fillerStats));
  }
  for (const r of retakes) {
    const b = bucketOf(r.createdAt);
    b.interviewScores.push(r.score);
    addFillers(b, parseJsonObject<FillerLike>(r.fillerStats));
    // Improvement on the attempt before this one.
    const before = r.number === 1 ? r.answer.feedback?.score : r.answer.retakes.find((x) => x.number === r.number - 1)?.score;
    if (before != null) b.retakeGains.push(r.score - before);
  }
  for (const t of takes) {
    const b = bucketOf(t.createdAt);
    b.speakScores.push(t.score);
    const stats = parseJsonObject<TakeStats>(t.stats);
    if (!stats) continue;
    addFillers(b, { wordCount: stats.wordCount, count: stats.fillers?.count ?? 0 });
    if (stats.wpm) b.wpms.push(stats.wpm);
    if (stats.wordCount) {
      b.hedgeWords += stats.wordCount;
      b.hedgeTotal += stats.hedges?.count ?? 0;
    }
  }

  const weeks = buckets.map((b, i) => ({
    start: new Date(firstWeek.getTime() + i * WEEK_MS).toISOString().slice(0, 10),
    interviewScore: avg(b.interviewScores),
    interviewCount: b.interviewScores.length,
    speakScore: avg(b.speakScores),
    speakCount: b.speakScores.length,
    // Per 100 words, so long and short answers compare fairly.
    fillersPer100: b.fillerWords ? round1((b.fillerTotal / b.fillerWords) * 100) : null,
    wpm: b.wpms.length ? Math.round(b.wpms.reduce((x, y) => x + y, 0) / b.wpms.length) : null,
    hedgesPer100: b.hedgeWords ? round1((b.hedgeTotal / b.hedgeWords) * 100) : null,
  }));

  const gains = buckets.flatMap((b) => b.retakeGains);
  return {
    weeks,
    totals: {
      answers: answers.length,
      retakes: retakes.length,
      takes: takes.length,
      averageRetakeGain: avg(gains),
    },
  };
}
