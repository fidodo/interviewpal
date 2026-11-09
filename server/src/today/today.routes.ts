import crypto from "crypto";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth.middleware";
import { emailLinkLimiter, todayLimiter } from "../middleware/rateLimit";
import { emailEnabled, env } from "../config/env";
import { prisma } from "../db/prisma";
import { getToday, setReminder } from "./today.service";
import { sendDailyReminders, unsubscribe } from "./reminder.service";
import { cleanupStories } from "../story/story.service";

// /today: the daily plan, streak, weekly goal and badges. No AI.
export const todayRouter = Router();
todayRouter.use(requireAuth);
todayRouter.use(todayLimiter);

todayRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await getToday(req.userId!));
  })
);

todayRouter.get(
  "/reminder",
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { dailyReminder: true, emailVerified: true } });
    res.json({ available: emailEnabled, enabled: !!user?.dailyReminder, verified: !!user?.emailVerified });
  })
);

todayRouter.put(
  "/reminder",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Say whether reminders should be on or off" });
      return;
    }
    if (parsed.data.enabled) {
      const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { emailVerified: true } });
      if (!emailEnabled) {
        res.status(409).json({ error: "Email isn't set up on this server, so reminders can't be sent." });
        return;
      }
      if (!user?.emailVerified) {
        res.status(409).json({ error: "Confirm your email address first, then turn on reminders." });
        return;
      }
    }
    await setReminder(req.userId!, parsed.data.enabled);
    res.json({ enabled: parsed.data.enabled });
  })
);

// /reminders/unsubscribe: the link in every reminder email (the /unsubscribe page posts here; mail apps use it for
// one-click unsubscribe). No login needed: the signature proves which account it's for.
export const remindersRouter = Router();
remindersRouter.post(
  "/unsubscribe",
  emailLinkLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z.object({ u: z.string().min(1).max(64), t: z.string().min(1).max(128) }).safeParse({ ...req.query, ...(req.body ?? {}) });
    if (!parsed.success || !(await unsubscribe(parsed.data.u, parsed.data.t))) {
      res.status(400).json({ error: "This unsubscribe link isn't valid. Turn reminders off from your account page instead." });
      return;
    }
    res.json({ unsubscribed: true });
  })
);

// /cron/*: called by Vercel Cron (GET, with "Authorization: Bearer <CRON_SECRET>"). Refused when no secret is set.
export const cronRouter = Router();
function cronAuthorised(req: Request) {
  if (!env.cronSecret) return false;
  const expected = Buffer.from(`Bearer ${env.cronSecret}`);
  const given = Buffer.from(req.get("authorization") ?? "");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
const dailyReminder = asyncHandler(async (req: Request, res: Response) => {
  if (!cronAuthorised(req)) {
    res.status(401).json({ error: "Unauthorised" });
    return;
  }
  const reminders = await sendDailyReminders();
  // The daily housekeeping rides on the same cron (Hobby allows few cron jobs). A failure here never hides the
  // reminder result.
  let stories: unknown;
  try {
    stories = await cleanupStories();
    console.log("Story clean-up:", JSON.stringify(stories));
  } catch (err) {
    console.error("Story clean-up failed:", err);
    stories = { error: true };
  }
  res.json({ ...reminders, stories });
});
cronRouter.get("/daily-reminder", dailyReminder);
cronRouter.post("/daily-reminder", dailyReminder);
