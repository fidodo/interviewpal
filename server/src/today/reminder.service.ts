import crypto from "crypto";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { sendEmail } from "../services/email.service";
import { getToday } from "./today.service";
import { dayNumber, isoDay } from "./streak";

// One run handles at most this many people (well within a function's time limit); the rest wait for tomorrow.
const BATCH = 200;
const PARALLEL = 5;

// Unsubscribe links carry a signature instead of a stored token: it never expires, and it only ever turns
// reminders off.
const signature = (userId: string) => crypto.createHmac("sha256", env.jwtSecret).update(`unsubscribe:${userId}`).digest("base64url");

export function unsubscribeQuery(userId: string) {
  return `u=${encodeURIComponent(userId)}&t=${signature(userId)}`;
}

export async function unsubscribe(userId: string, token: string) {
  const expected = Buffer.from(signature(userId));
  const given = Buffer.from(token);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  await prisma.user.updateMany({ where: { id: userId }, data: { dailyReminder: false } });
  return true;
}

async function sendReminder(user: { id: string; email: string }) {
  const today = await getToday(user.id);
  const { current, atRisk } = today.streak;
  const open = today.items.filter((i) => !i.done);
  const link = (path: string) => `${env.clientUrl}${path.startsWith("#") ? `/${path}` : path}`;
  const minutes = open.reduce((n, i) => n + i.minutes, 0);
  const lines = [
    current > 0 ? `You're on a ${current}-day streak.` : "A few minutes today is all it takes to start a streak.",
    atRisk ? "You missed yesterday, but practise today and a freeze day keeps your streak going." : "",
    "",
    open.length ? `Today's plan (about ${minutes} minutes):` : "Pick anything to practise today:",
    ...open.map((i) => `- ${i.title}: ${i.detail}\n  ${link(i.link)}`),
    "",
    `Open InterviewPal: ${env.clientUrl}/`,
    "",
    "You're getting this because you turned on daily reminders. One email a day at most, and only on days you haven't practised.",
    `Turn them off: ${env.clientUrl}/unsubscribe?${unsubscribeQuery(user.id)}`,
  ].filter((l, i, all) => l !== "" || all[i - 1] !== "");
  const subject = current > 0 ? `Keep your ${current}-day streak going` : "Your few minutes of interview practice";
  const oneClick = `${env.clientUrl}/api/reminders/unsubscribe?${unsubscribeQuery(user.id)}`;
  return sendEmail(user.email, subject, lines.join("\n"), { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
}

// The daily cron job: emails people who opted in, have a verified address and haven't practised today. Each
// person is claimed (reminderSentOn = today) before sending, so a repeated or overlapping run never emails twice.
export async function sendDailyReminders() {
  const today = new Date(`${isoDay(dayNumber(new Date()))}T00:00:00Z`);
  const due = { dailyReminder: true, emailVerified: true, OR: [{ reminderSentOn: null }, { reminderSentOn: { lt: today } }] };
  const users = await prisma.user.findMany({
    where: { ...due, practiceDays: { none: { day: today } } },
    select: { id: true, email: true },
    take: BATCH,
  });
  let sent = 0;
  for (let i = 0; i < users.length; i += PARALLEL) {
    await Promise.all(
      users.slice(i, i + PARALLEL).map(async (u) => {
        const claimed = await prisma.user.updateMany({ where: { id: u.id, ...due }, data: { reminderSentOn: today } });
        if (claimed.count !== 1) return;
        try {
          if (await sendReminder(u)) sent++;
        } catch (err) {
          console.error("Couldn't send a reminder:", err);
        }
      })
    );
  }
  return { candidates: users.length, sent };
}
