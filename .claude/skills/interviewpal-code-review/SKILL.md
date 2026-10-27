---
name: interviewpal-code-review
description: Code review for the InterviewPal repo — runs the built-in /code-review on the current diff, then checks InterviewPal-specific risks (cookie auth on new routes, zod bounds, AI rate limits, provider abstraction, JSON-string columns, Prisma RESTRICT deletes, Web Speech API races, client/server type drift, secrets in commits). Use whenever the user asks to review, check, audit, or sanity-check code changes in InterviewPal, before committing or deploying a non-trivial change, or after finishing a feature in this repo — even if they just say "review this" or "is this safe to ship".
---

# InterviewPal code review

Two passes: the generic correctness review, then the project-specific checklist below, which catches things a generic reviewer won't know matter here.

## Pass 1: generic review

Invoke the built-in `code-review` skill on the current diff (or the target the user named). Keep its findings.

## Pass 2: InterviewPal checklist

Only report items that the diff actually touches. For each, read the changed code, not just the diff hunk.

**Server**
- **Auth:** every new route under `server/src/routes/` that reads or writes user data goes through `requireAuth`. Every service query is scoped by `userId`, so one user can never read another user's session by guessing an id.
- **Input bounds:** every request body is parsed with a zod schema that has `.max()` on strings and arrays. The answer cap is 20,000 chars (`submitAnswerSchema`). Unbounded input becomes unbounded AI cost.
- **Rate limits:** any new route that calls the AI provider is behind `aiLimiter`, and new auth routes are behind `authLimiter`.
- **Kids section (`server/src/kids`):**
  - Every child, enrollment, challenge or message lookup is scoped through `parentId === req.userId`, either via `findChild` or the `enrollment: { child: { parentId } }` relation filter. Anything else returns 404.
  - Kids AI routes use `kidsAiLimiter`, and PIN routes use `pinLimiter`.
  - Every kids prompt starts with `safetyPreamble`.
  - Progress writes (`submitAttempt`) stay conditional `updateMany`s, so a double submit can't double-count a pass.
  - Resetting a PIN must require proof that the person owns the account (password or Google credential). "Recently logged in" is not proof, because a child can log in using the browser's autofill.
- **Provider abstraction:** AI calls go through the `AIProvider` interface (`server/src/ai/provider.interface.ts`), never a direct SDK import in a service. Model output is validated with the zod schemas in `server/src/ai/schemas.ts`.
- **JSON-string columns:** `strengths`/`weaknesses`/`suggestions`/`improvements` are JSON strings in the DB. Writes must `JSON.stringify`. Reads must go through `serializeFeedback`/`serializeSummary`, never be returned raw.
- **Deletes:** `User → InterviewSession` is RESTRICT. Deleting a user requires deleting their sessions first.
- **Errors:** nothing returns `err.message` to the client in production (`errorHandler.ts` branches on `env.isProd`).

**Client**
- **Web Speech API races:** any code that stops or replaces a `SpeechRecognition` instance must detach `onresult`/`onerror`/`onend` first, because browsers fire trailing events after `.stop()`. Mobile Chrome returns cumulative results; transcript building must rebuild from `event.results`, not append (see `useSpeechRecognition.ts`).
- **Media streams:** every `getUserMedia` stream and `AudioContext` gets released (tracks stopped, context closed) on success, failure, and unmount.
- **Timers:** every `setTimeout`/`requestAnimationFrame` gets cleared on unmount.
- **Requests:** the `api` wrapper (`client/src/api/client.ts`) is used for every request (it sends `credentials: "include"`). No raw `fetch` to `/api`.

**Cross-cutting**
- `PRESET_TRACKS` and shared types in `client/src/types/index.ts` and `server/src/types.ts` are kept in sync by hand. If one changes, check the other.
- No `.env`, `.vercel/`, credentials, or test-account scratch scripts are staged (`git diff --cached --name-only`).
- If the change needs a server deploy, remember that server git auto-deploy has been unreliable. See `interviewpal-playbook` → deploy runbook.

## Output

Write one table, ordered most severe first:

| Severity | File:line | Issue | Concrete failure scenario | Fix |

Severity is one of: blocker, should-fix, nit. Then add a one-line verdict: ship / ship after fixes / don't ship. If the user asked for fixes, apply the blockers and should-fixes, then re-run `npm run build` in `client/` and `npx tsc --noEmit` in `server/`.
