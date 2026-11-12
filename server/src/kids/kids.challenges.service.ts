import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { challengePrompt, helpPrompt, reviewPrompt, ChildContext, LevelContext, PastChallenge } from "./kids.prompts";
import { GeneratedChallenge, generatedChallengeSchema, helpReplySchema, reviewResultSchema } from "./kids.schemas";
import { checkChallenge, solutionBudget, wordBudget } from "./challengeBudget";
import { MESSAGE_ORDER, loadEnrollment, toChildContext, toLevelContext } from "./kids.service";
import { ChallengeKind, ChallengeStatus, HelpRole, LevelEditor } from "./types";

// Pal's challenges: writing one (sized and checked), opening it, checking an attempt, and Ask Pal.

// Ignore trailing spaces and blank lines at the end, which kids (and print()) add without meaning to.
function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

const CHALLENGE_ATTEMPTS = 3;

// Asks Pal for a challenge and checks it in code (challengeBudget.ts): a short goal, and a hidden plan that fits the
// level's size and blocks. A rejected challenge is retried with the reasons, up to CHALLENGE_ATTEMPTS. If none
// passes, the one with the fewest problems is used, as long as its goal is short enough to read; otherwise it fails
// and the child sees "Pal couldn't make a challenge. Try again."
export async function generateChallenge(params: { child: ChildContext; level: LevelContext; passedAtLevel: number; history: PastChallenge[] }) {
  const budget = { statements: solutionBudget(params.level, params.child.age), words: wordBudget(params.child.age) };
  let best: { challenge: GeneratedChallenge; problems: string[] } | null = null;
  let rejected: string[] | undefined;
  for (let attempt = 1; attempt <= CHALLENGE_ATTEMPTS; attempt++) {
    const challenge = await generateValidated(challengePrompt({ ...params, budget, rejected }), generatedChallengeSchema);
    const problems = checkChallenge(challenge, params.level, params.child.age);
    if (problems.length === 0) return { challenge, attempts: attempt, problems };
    if (!best || problems.length < best.problems.length) best = { challenge, problems };
    rejected = problems;
  }
  const readable = best && best.challenge.instructions.split(/\s+/).filter(Boolean).length <= budget.words;
  console.warn(`Kids challenge kept problems after ${CHALLENGE_ATTEMPTS} attempts (level ${params.level.order}): ${best?.problems.join("; ")}${readable ? "" : " (too long to use)"}`);
  if (!best || !readable) throw new Error("No usable kids challenge");
  return { challenge: best.challenge, attempts: CHALLENGE_ATTEMPTS, problems: best.problems };
}

export async function nextChallenge(parentId: string, childId: string, slug: string, fresh: boolean) {
  const loaded = await loadEnrollment(parentId, childId, slug);
  if (!loaded) return null;
  const { child, course, enrollment } = loaded;
  const level = course.levels.find((l) => l.order === enrollment.currentLevel);
  if (!level) return null;

  if (!fresh) {
    const open = await prisma.challenge.findFirst({
      where: { enrollmentId: enrollment.id, levelOrder: level.order, status: ChallengeStatus.OPEN },
      orderBy: { createdAt: "desc" },
    });
    if (open) return open;
  }

  const history = await prisma.challenge.findMany({
    where: { enrollmentId: enrollment.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { title: true, status: true },
  });

  const levelContext = toLevelContext(level);
  const { challenge: generated } = await generateChallenge({
    child: toChildContext(child),
    level: levelContext,
    passedAtLevel: enrollment.passedAtLevel,
    history: history.reverse().map((c) => ({ title: c.title, passed: c.status === ChallengeStatus.PASSED })),
  });

  return prisma.challenge.create({
    data: {
      enrollmentId: enrollment.id,
      levelOrder: level.order,
      title: generated.title,
      story: generated.story,
      instructions: generated.instructions,
      kind: generated.kind,
      starterCode: levelContext.editor === LevelEditor.BLOCKS ? "" : generated.starterCode,
      expectedOutput: generated.kind === ChallengeKind.TEXT ? (generated.expectedOutput ?? null) : null,
      sampleInput: levelContext.editor === LevelEditor.PYTHON ? generated.sampleInput?.trim() || null : null,
    },
  });
}

async function loadChallenge(parentId: string, challengeId: string) {
  const challenge = await prisma.challenge.findFirst({
    where: { id: challengeId, enrollment: { child: { parentId } } },
    include: { enrollment: { include: { child: true, course: { include: { levels: { orderBy: { order: "asc" } } } } } } },
  });
  if (!challenge) return null;
  const level = challenge.enrollment.course.levels.find((l) => l.order === challenge.levelOrder);
  if (!level) return null;
  return { challenge, level, child: challenge.enrollment.child, course: challenge.enrollment.course, enrollment: challenge.enrollment };
}

export async function getChallenge(parentId: string, challengeId: string) {
  const loaded = await loadChallenge(parentId, challengeId);
  if (!loaded) return null;
  const [attempts, messages] = await Promise.all([
    prisma.attempt.findMany({ where: { challengeId }, orderBy: { createdAt: "asc" } }),
    prisma.helpMessage.findMany({ where: { challengeId }, orderBy: MESSAGE_ORDER }),
  ]);
  return { ...loaded, attempts, messages };
}

export async function submitAttempt(
  parentId: string,
  challengeId: string,
  submission: { code: string; input: string; output: string; error: string | null; turtle: string }
) {
  const loaded = await loadChallenge(parentId, challengeId);
  if (!loaded) return null;
  const { challenge, level, child, course, enrollment } = loaded;

  // The expected output only applies when the learner used the same input() answers it was worked out with.
  const sameAnswers = normalizeOutput(submission.input) === normalizeOutput(challenge.sampleInput ?? "");
  const outputMatches =
    submission.error == null && challenge.expectedOutput != null && sameAnswers
      ? normalizeOutput(submission.output) === normalizeOutput(challenge.expectedOutput)
      : null;

  const review = await generateValidated(
    reviewPrompt({
      child: toChildContext(child),
      level: toLevelContext(level),
      challenge: {
        title: challenge.title,
        instructions: challenge.instructions,
        kind: challenge.kind as ChallengeKind,
        expectedOutput: challenge.expectedOutput,
        sampleInput: challenge.sampleInput,
      },
      code: submission.code,
      input: submission.input,
      output: submission.output,
      error: submission.error,
      turtle: submission.turtle,
      outputMatches,
    }),
    reviewResultSchema
  );
  // The deterministic checks win over the model's opinion.
  const passed = submission.error != null ? false : outputMatches === true ? true : review.passed;
  const stars = passed ? Math.max(review.stars, 2) : 1;

  const attempt = await prisma.attempt.create({
    data: {
      challengeId,
      code: submission.code,
      output: submission.output,
      passed,
      stars,
      praise: review.praise,
      nextStep: review.nextStep,
    },
  });

  // Progress updates are conditional writes, so two overlapping checks of the same challenge (two tabs, a retry)
  // can only count it once and can only level up once.
  let leveledUp = false;
  let courseComplete = false;
  if (passed) {
    const claimed = await prisma.challenge.updateMany({
      where: { id: challengeId, status: ChallengeStatus.OPEN },
      data: { status: ChallengeStatus.PASSED },
    });
    const counted =
      claimed.count === 1 &&
      (
        await prisma.enrollment.updateMany({
          where: { id: enrollment.id, currentLevel: level.order, passedAtLevel: { lt: level.challengesToPass } },
          data: { passedAtLevel: { increment: 1 } },
        })
      ).count === 1;
    if (counted) {
      const updated = await prisma.enrollment.findUnique({ where: { id: enrollment.id } });
      if (updated && updated.passedAtLevel >= level.challengesToPass) {
        if (level.order >= course.levels.length) {
          courseComplete = true;
        } else {
          const moved = await prisma.enrollment.updateMany({
            where: { id: enrollment.id, currentLevel: level.order },
            data: { currentLevel: level.order + 1, passedAtLevel: 0 },
          });
          leveledUp = moved.count === 1;
        }
      }
    }
  }

  return { attempt, leveledUp, courseComplete };
}

export async function askHelp(parentId: string, challengeId: string, message: string, code: string) {
  const loaded = await loadChallenge(parentId, challengeId);
  if (!loaded) return null;
  const { challenge, level, child } = loaded;

  const chat = await prisma.helpMessage.findMany({ where: { challengeId }, orderBy: MESSAGE_ORDER });
  const { reply } = await generateValidated(
    helpPrompt({
      child: toChildContext(child),
      level: toLevelContext(level),
      challenge: { title: challenge.title, instructions: challenge.instructions },
      code,
      chat: chat.map((m) => ({ role: m.role as "CHILD" | "PAL", text: m.text })),
      message,
    }),
    helpReplySchema
  );

  const [childMessage, palMessage] = await prisma.$transaction([
    prisma.helpMessage.create({ data: { challengeId, role: HelpRole.CHILD, text: message } }),
    prisma.helpMessage.create({ data: { challengeId, role: HelpRole.PAL, text: reply } }),
  ]);
  return [childMessage, palMessage];
}
