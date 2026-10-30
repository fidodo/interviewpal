import rateLimit, { ipKeyGenerator, Options, Store, IncrementResponse } from "express-rate-limit";
import { Request } from "express";
import { prisma } from "../db/prisma";
import { AuthedRequest } from "./auth.middleware";

// Counters live in Postgres (the RateLimit table) because serverless instances don't share memory and lose it on
// every cold start, which made in-memory limits close to useless in production.
class PrismaStore implements Store {
  localKeys = false;
  prefix: string;
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private key(key: string) {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    // One atomic statement: start a new window if the old one expired, otherwise count this hit.
    const rows = await prisma.$queryRaw<{ hits: number; resetAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "hits", "resetAt") VALUES (${this.key(key)}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."hits" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
      RETURNING "hits", "resetAt"`;
    // Occasionally clear out windows that ended a while ago so the table doesn't grow forever.
    if (Math.random() < 0.01) {
      prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }).catch(() => {});
    }
    return { totalHits: Number(rows[0].hits), resetTime: rows[0].resetAt };
  }

  async decrement(key: string) {
    await prisma.rateLimit.updateMany({ where: { key: this.key(key), hits: { gt: 0 } }, data: { hits: { decrement: 1 } } });
  }

  async resetKey(key: string) {
    await prisma.rateLimit.deleteMany({ where: { key: this.key(key) } });
  }
}

const byUserOrIp = (req: Request) => (req as AuthedRequest).userId ?? ipKeyGenerator(req.ip ?? "unknown");
const isAdmin = (req: Request) => !!(req as AuthedRequest).isAdmin;

function limiter(prefix: string, windowMs: number, limit: number, error: string, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PrismaStore(prefix),
    message: { error },
    ...extra,
  });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Per IP (the app trusts Vercel's proxy headers in production, see app.ts).
export const authLimiter = limiter("auth", 15 * 60 * 1000, 10, "Too many attempts. Try again in a few minutes.");

// Short-term burst limit on interview AI calls...
export const aiLimiter = limiter("ai", HOUR, 30, "You're moving through questions faster than we can keep up with. Try again shortly.", {
  keyGenerator: byUserOrIp,
  skip: isAdmin,
});

// ...and the daily allowance, since every AI call costs money: 50 calls, where a question plus its graded answer is
// two, so roughly 25 questions a day. Admin accounts are exempt.
export const aiDailyLimiter = limiter("ai-day", DAY, 50, "You've used today's AI allowance. Come back tomorrow for more practice!", {
  keyGenerator: byUserOrIp,
  skip: isAdmin,
});

// Slows down guessing the 4-digit kids PIN without sharing the login limiter's per-IP budget.
export const pinLimiter = limiter("pin", 15 * 60 * 1000, 10, "Too many PIN tries. Wait 15 minutes and try again.", { keyGenerator: byUserOrIp });

// Separate budget for the kids section so a busy learner can't use up the parent's interview quota (or vice versa).
export const kidsAiLimiter = limiter("kids-ai", HOUR, 60, "Pal needs a little rest! Take a break and try again in a while.", {
  keyGenerator: byUserOrIp,
  skip: isAdmin,
});

export const kidsDailyLimiter = limiter("kids-day", DAY, 60, "Pal has helped a lot today! Come back tomorrow for more challenges.", {
  keyGenerator: byUserOrIp,
  skip: isAdmin,
});

// Requests that verify a link token or start a password reset, keyed by IP.
export const emailLinkLimiter = limiter("email", HOUR, 10, "Too many requests. Try again in an hour.");

// Confirming a sensitive account action (delete account) with a password, per user so other people on the
// same network can't use it up.
export const accountLimiter = limiter("account", 15 * 60 * 1000, 5, "Too many tries. Wait 15 minutes and try again.", { keyGenerator: byUserOrIp });

// Finishing an interview (summary or mock report): generous, separate from the daily allowance.
export const endLimiter = limiter("end", HOUR, 20, "You've finished a lot of interviews this hour. Try again shortly.", {
  keyGenerator: byUserOrIp,
  skip: isAdmin,
});

// A weighted daily budget on the same table, for costs that aren't one-per-request (e.g. how many texts were
// embedded). Spends `amount` and returns false, without spending, when that would go over `limit`.
export async function spendBudget(prefix: string, key: string, amount: number, limit: number, windowMs = DAY): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const rows = await prisma.$queryRaw<{ hits: number }[]>`
    INSERT INTO "RateLimit" ("key", "hits", "resetAt") VALUES (${`${prefix}:${key}`}, ${amount}, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN ${amount} ELSE "RateLimit"."hits" + ${amount} END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    RETURNING "hits"`;
  if (Number(rows[0].hits) <= limit) return true;
  await prisma.rateLimit.updateMany({ where: { key: `${prefix}:${key}` }, data: { hits: { decrement: amount } } });
  return false;
}

// Gives back budget spent on work that then failed (e.g. a model call that errored).
export async function refundBudget(prefix: string, key: string, amount: number) {
  await prisma.rateLimit.updateMany({ where: { key: `${prefix}:${key}`, hits: { gte: amount } }, data: { hits: { decrement: amount } } });
}

// RAG Lab toolkit calls (server/src/raglab): a burst limit, with daily budgets charged in the toolkit itself.
export const ragSdkLimiter = limiter("rag-sdk", 60_000, 120, "Your bot is calling the toolkit very fast. Wait a minute and run it again.", {
  keyGenerator: byUserOrIp,
  skip: isAdmin,
});

// Starting and grading RAG Lab runs: each run stores a code snapshot, and grading calls the AI judge.
export const ragRunLimiter = limiter("rag-run", HOUR, 60, "You've started a lot of runs this hour. Take a breather and try again shortly.", {
  keyGenerator: byUserOrIp,
  skip: isAdmin,
});

export const ragGradeDailyLimiter = limiter("rag-grade-day", DAY, 80, "You've graded today's 80 RAG Lab runs. Asking your bot single questions still works; grading resumes tomorrow.", {
  keyGenerator: byUserOrIp,
  skip: isAdmin,
});
