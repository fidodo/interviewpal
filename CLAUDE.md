# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

InterviewPal: a mock technical-interview practice app. A user picks a topic/track/difficulty, answers AI-generated questions by voice (browser Web Speech API), gets AI feedback per answer, and an AI-written summary at the end of the session. Past sessions are viewable in history.

This is two independent packages — `client/` (Vite + React) and `server/` (Express) — with no root `package.json` or workspace tooling tying them together. Run commands from inside each directory.

## Current state — live in production

Both `client/` and `server/` have dependencies installed, `.env` files populated for local dev, and the database migrated and seeded. The app runs locally with `npm run dev` in each directory (see Commands below). Commits on `main`, pushed to `https://github.com/fidodo/interviewpal.git` (`origin`).

**Deployed and verified working:**
- Client: `https://client-beige-mu-26.vercel.app` (Vercel project `fidodos-projects/client`)
- Server: `https://server-opal-kappa-39.vercel.app` (Vercel project `fidodos-projects/server`) — not normally hit directly; the client proxies `/api/*` to it (see the playbook skill for why)

**For deploy history/architecture notes (the cross-origin cookie fix, the SPA-routing bug that was caught and fixed, Vercel CLI permission quirks), read the `interviewpal-playbook` skill** (`.claude/skills/interviewpal-playbook/references/deploy-runbook.md`) — don't trust this paragraph blindly by the time you read it, verify against actual repo/deployment state.

Known quirk on Windows: `tsx watch` spawns a detached child process that killing the npm/shell wrapper does **not** reliably terminate — repeated restarts leave zombie `node.exe` processes bound to the old port, silently serving stale code/env to new requests. If behavior doesn't match the current source/`.env` after a restart, check for and kill stray `node` processes first (`Get-Process node | Stop-Process -Force` in PowerShell) before debugging further.

`.env` changes and `schema.prisma`/Prisma-client changes are **not** picked up by `tsx watch` — always fully restart the server process after editing `.env` or running a migration. On Windows, a migration can fail with an `EPERM` on the Prisma query-engine DLL if a server process is still holding it open — kill node processes first.

## Commands

Server (`server/`):
- `npm run dev` — run with `tsx watch` (hot reload)
- `npm run build` / `npm start` — compile with `tsc` then run compiled output
- `npm run prisma:migrate` — apply Prisma migrations (Postgres, via `DATABASE_URL` in `.env` — a pooled Neon connection string)
- `npm run prisma:seed` — seed starter topics and the two users defined by `SEED_USER_1_EMAIL`/`SEED_USER_1_PASSWORD` and `SEED_USER_2_EMAIL`/`SEED_USER_2_PASSWORD` in `.env`
- `npm run prisma:seed-terms` — load just the Terms starter decks (`prisma/terms/`); safe to re-run, terms are upserted by `presetKey`
- `npm run prisma:studio` — open Prisma Studio

Client (`client/`):
- `npm run dev` — Vite dev server (proxies `/api` to `http://localhost:4000`, see `vite.config.ts`)
- `npm run build` — `tsc -b && vite build`
- `npm run preview` — preview the production build

There are no lint or test scripts in either package.

## Architecture

### AI provider abstraction
`server/src/ai/provider.interface.ts` defines `AIProvider` with three methods: `generateQuestion`, `gradeAnswer`, `generateSummary`. `server/src/ai/provider.factory.ts` picks an implementation at startup based on `AI_PROVIDER` env var: `"gemini"` → `gemini.provider.ts` (`@google/genai`), `"grok"` → `grok.provider.ts` (xAI, via the `openai` SDK pointed at `https://api.x.ai/v1` — this is xAI's Grok model, unrelated to Groq the company), `"groq"` → `groq.provider.ts` (Groq, via the `openai` SDK pointed at `https://api.groq.com/openai/v1`). All three share the same prompt builders in `server/src/ai/prompts.ts` and validate the model's JSON response against zod schemas in `server/src/ai/schemas.ts`. To add another provider, implement `AIProvider` and add a case in the factory — nothing else needs to change.

A fourth provider, `"mistral"` → `mistral.provider.ts` (Mistral's OpenAI-compatible API; it rejects `max_completion_tokens`, so it doesn't use the shared `openaiChat`), was added on 2026-11-09.

**Fallback chain.** `AI_PROVIDERS="groq,gemini,mistral"` makes the factory build a `FallbackProvider` (`fallback.provider.ts`) from the providers in that list that have a key. Each call moves to the next provider only when the current one can't answer at all: 401/403/408/429/5xx, timeouts or network errors (`canFailOver`). Bad output (zod failure, malformed JSON, Groq's `json_validate_failed`) is thrown straight out, so `retryOnInvalid` retries on the same provider. Providers before the last one in the chain get SDK `maxRetries: 0`, so a rate limit fails over instead of waiting. With `AI_PROVIDERS` unset, the single `AI_PROVIDER` works as before.

**Model choice (2026-11-09).** `server/scripts/compare-models.ts` (run with `npx tsx`, not deployed, writes nothing to the database) runs the real prompt builders against candidate models and prints the schema pass rate, speed and whether grading ranks a strong, a weak and an off-topic answer correctly.
- **Groq `openai/gpt-oss-120b`:** 8/8, about 1 second a call, ranked correctly. It's the primary model, and it's the best model Groq offers.
- **Groq `qwen/qwen3.8-27b`:** unusable on the free plan (1,000 output tokens a minute).
- **Gemma 4 on the Gemini API:** slow (about 22 seconds a call), often returns 503, and sometimes returns broken JSON. Not used.
- **Gemini `gemini-3.5-flash-lite`:** fast, with occasional 503s. Use it as the fallback after Groq, set with `GEMINI_MODEL`. `gemini-3.8-flash` allows only about 20 free calls a day.
- **Mistral `mistral-large-4`:** 8/8, ranked correctly, and writes runnable `codeSpec`s. But it always reasons first, so a call takes about 20 seconds (`reasoning_effort: "low"` barely helps, and `"none"` is refused). It's the last, slow-but-reliable fallback.
  - **Free mode is per model:** Large 4 gets 50 requests and 20,000 tokens a minute; Ministral/Codestral get 2 requests a minute; Small, Medium and Magistral get 0 (an immediate 429). Read the `x-ratelimit-*` headers to check.
  - **Response format:** reasoning replies come back as content chunks (`thinking` + `text`), which `textOf` in `mistral.provider.ts` unwraps.
  - **Recommended production order:** `AI_PROVIDERS="groq,gemini,mistral"`.

Prompts are history-aware: `session.service.ts`'s `loadPriorQA` reassembles the full prior Q&A (+ per-answer score) for a session and passes it into every prompt, capped at the last 20 exchanges (`MAX_PRIOR_QA` in `prompts.ts`). This is how question generation adapts to the candidate's running performance and avoids repeating questions.

### Data/request flow for a session
`InterviewSession` → many `Question` (each has a `type`: `VERBAL` or `CODING`, chosen by the AI per-question) → one `Answer` each → one `Feedback` each; plus one `SessionSummary` per session (see `server/prisma/schema.prisma`). The flow, driven from `InterviewSessionPage.tsx`:
1. `POST /sessions` creates a session for a topic/track/difficulty.
2. `POST /sessions/:id/questions` asks the AI provider for the next question (using prior Q&A) and stores it.
3. `POST /questions/:id/answer` stores the transcript (plus filler-word stats for `VERBAL` answers, computed locally — see `transcriptAnalysis.ts`), then immediately grades it via the AI provider (overall `score` + a `correctness`/`clarity`/`depth` breakdown) and stores the `Feedback`.
4. Repeat 2–3.
5. `POST /sessions/:id/end` marks the session `COMPLETED` and generates a `SessionSummary` from the full history (or a placeholder "no questions answered" summary if none were answered).

`strengths`/`weaknesses`/`suggestions`/`improvements` are stored as JSON-stringified arrays in plain `String` columns (not Postgres's native array/JSON types) and parsed back out in `sessions.controller.ts`'s `serializeFeedback`/`serializeSummary` — this predates the Postgres migration (was a SQLite limitation) and was deliberately left as-is rather than reworked, since it works fine either way and touching it wasn't worth the risk this close to deploy.

### Auth
Cookie-based JWT, not bearer tokens, for both login paths. `auth.service.ts`'s shared `issueToken` signs a JWT with `JWT_SECRET`; both controllers set it as an `httpOnly` cookie the same way. `auth.middleware.requireAuth` reads `req.cookies.token`. The client's `api` wrapper (`client/src/api/client.ts`) always sends `credentials: "include"` so the cookie round-trips through the Vite proxy.

Two login paths:
- **Email/password**: `POST /auth/register` (email + password, 8+ chars) creates a new account — hashes the password with bcrypt, 409s if the email's taken. `POST /auth/login` authenticates existing ones, including the two seeded by `prisma/seed.ts` from `SEED_USER_*` env vars. `LoginPage.tsx` toggles the same form between "Log in" and "Sign up" (`mode` state) rather than using separate pages.
- **Google** (`POST /auth/google`): client renders the official GSI button (`LoginPage.tsx`, script loaded in `index.html`) using `VITE_GOOGLE_CLIENT_ID` (`client/.env`); on success it POSTs the ID token as `credential`, and `auth.service.loginWithGoogle` verifies it server-side via `google-auth-library` against `GOOGLE_CLIENT_ID` (`server/.env` — same value, different env var name) and upserts a `User` by email. `User.passwordHash` is nullable for this reason — Google-only accounts have none.

Both `GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (client) must be set to the same OAuth Client ID from Google Cloud Console for Google sign-in to work; without it, the button area on the login page just shows a hint instead of rendering.

Security rules (Phase 1 of `docs/roadmap.md`):
- **Token revocation.** JWTs carry `tv`, which must equal `User.tokenVersion`. `requireAuth` checks it on every request, which costs one database read. "Log out" clears this browser only; `POST /auth/logout-all` and a password reset bump the version, which signs out every device.
- **Email verification and password reset** go through Resend (`services/email.service.ts`). They are optional: with no `RESEND_API_KEY`, accounts stay unverified, `requireVerified` is a no-op, forgot-password returns 503, and in development the links are printed to the server console. Link tokens are single-use and stored as SHA-256 hashes in `AuthToken`.
- **Google takeover guard.** If Google signs in to an unverified account that has a password, `loginWithGoogle` removes the password and bumps the token version, because someone else may have registered that email first.
- **Topics.** Custom topics belong to their creator. `visibleTopics` (`services/topic.service.ts`) is presets plus the user's own topics. Use it for listing topics and for starting a session.
- **Rate limits** are stored in the `RateLimit` table (`PrismaStore` in `middleware/rateLimit.ts`), because serverless instances don't share memory. AI routes use `requireVerified`, the hourly limit and the daily allowance: 50 a day for interviews and 60 for kids. `User.isAdmin` is exempt and is set by the seed for seed user 1. `/sessions/:id/end` is deliberately left unguarded. In production, `trust proxy` is set to 1.
- **Delete account** (`DELETE /auth/account`) requires the password, or a fresh Google credential for Google-only accounts.
- **Client CSP** lives in `client/vercel.json`. It allows Google sign-in (GSI), Google Fonts and the Pyodide CDN. Blockly's icons are self-hosted in `client/public/blockly-media/`. If you add a third-party script, font or endpoint, add it to the CSP too.

### Voice input
`client/src/hooks/useSpeechRecognition.ts` wraps the browser Web Speech API. Things that look odd but are deliberate:
- **Mobile mode.** On mobile (UA sniff), recognition runs with `continuous = false` and is restarted from `onend`. Mobile Chrome in continuous mode returns cumulative results ("I think", "I think the", …), which used to duplicate words.
- **Transcript rebuilding.** The transcript is rebuilt from the full `event.results` list on every event, never appended. On mobile, a result that extends the previous one on a word boundary replaces it.
- **Stopping.** Handlers are detached before `.stop()`, because browsers fire trailing events that would leak into the next question.
- **Auto-stop.** Recognition stops itself after any non-`no-speech` error and after 3 silent restarts in a row, so it never loops.

`MicButton` adds a 5-second countdown before recording. `AnswerGuideModal` (a native `<dialog>`) explains grading and STAR. It opens once per session, tracked in `sessionStorage`.

### Dashboard onboarding tour
`OnboardingTour.tsx` is a step-by-step spotlight tour with no library behind it. Each step targets a `data-tour="…"` attribute; a step whose target isn't on the page is skipped.
- **Steps:** defined as `TOUR_STEPS` in `DashboardPage.tsx`. If you rename or move a dashboard control, keep its `data-tour` attribute.
- **When it opens:** automatically only for users with zero sessions who haven't finished it. Completion is tracked in `localStorage` under `onboarding-done:<userId>`. "Show me around" replays it.
- **While open:** `.app-shell` is made `inert` so keyboard and screen-reader focus stays in the tour.

### Target roles (`server/src/roles`, Phase 2 of `docs/roadmap.md`)
A `TargetRole` is the job a user is working towards. It can be any job, and each user has exactly one active role.
- **Creating a role:** the AI builds the skill list as `RoleSkill`s, each with an importance from 1 to 3. If a CV was pasted, it also suggests a `selfRating`. Pasting a job description or CV is optional.
- **Ratings:**
  - The `rating` (1–5) starts at the self-rating.
  - Once interview evidence exists, the rating follows it: each graded answer moves it toward `score / 2`, with weight 0.3 (`applyEvidence`).
  - Every change is logged in `SkillRatingEvent`, which feeds the sparklines and the week-ago value.
- **Readiness** is the importance-weighted average of rated skills. Its weekly change compares the same skills then and now.
- **Practice:**
  - **Starting:** "Practise my weakest skill" (`startPractice`) creates a normal `InterviewSession` with `roleId` and `focusSkill`. The skill becomes a private custom topic.
  - **Question generation:** `roleContextForSession` adds role instructions to `questionPrompt`. The model tags each question with the skills it tests (`Question.skillTags`), and non-technical roles always get `VERBAL` questions.
  - **Grading:** grading a tagged answer updates those skills.
- **Weekly goals:** `WeeklyGoal` rows are grouped by Monday (UTC) and generated for the 3 weakest skills.
- **Home page:** the dashboard shows `RoleHub` above the existing picker, which is now labelled "Quick practice".

Full mock interview (`server/src/roles/mock.ts`, Phase 3): a session with `mode: "MOCK"`, started by `POST /roles/:id/mock`.
- **Rounds:** it runs the fixed rounds in `MOCK_ROUNDS` (2 behavioural, 2 role-specific, 1 closing "your questions for us"). Each `Question.round` adds round-specific instructions to the question and grading prompts.
- **Feedback held back:** answers are graded and update skills as usual, except the closing round, which grades the candidate's own questions. But the API hides feedback until the session is `COMPLETED`.
- **One question at a time:** asking for a question while one is open returns the open one.
- **Report:** `buildMockReport` writes a `HIRE`/`LEAN_HIRE`/`NO_HIRE` verdict and per-round averages into `SessionSummary.verdict`/`roundScores`.
- **Sessions in general:**
  - **Ending:** `endSession` builds the summary before marking the session completed, and a race between two end requests resolves to the first summary.
  - **Finished sessions are frozen:** they reject new questions and answers.
  - **Duplicate questions:** if two requests create the same question number, the later one is deleted.
- **Rounds with follow-ups:** a mock asks `MOCK_PLAN` (7 questions): each ROLE question is followed by one follow-up on the answer.

Retakes and follow-ups (practice loop, Phase A of the 2026-11-06 plan):
- **Follow-ups** (`POST /questions/:id/follow-up`): one per answered question in a practice session, never on a follow-up. It becomes the next question with `Question.followUpOf` set, tests the parent's skill tags and is always `VERBAL`. `questionPrompt` with `followUp` drops the type/code-spec guidance and asks the model to press on something the candidate said. Asking twice returns the same follow-up.
- **Retakes** (`POST /questions/:id/retake`, `RetakePage` at `/sessions/:id/questions/:questionId/retake`): answer again, up to `MAX_RETAKES` (3). They're stored in `AnswerRetake`; the original `Answer`/`Feedback`, the summary and skill ratings never change. Grading gets `previousAttempt` (the last attempt's score and weaknesses) so feedback says what improved. A retake claims the answer (`retakeGradingAt`, retaken after 2 minutes), so a double submit is graded once. Running mocks refuse retakes until the report.

"Learn this" courses (`server/src/learn`, Phase 4): an adult course engine, separate from the kids tables, which belong to child profiles.
- **Course:** a `LearnCourse` covers one role skill (`@@unique([userId, skillId])`, opened through the free `GET /learn/courses/for-skill/:id`) or any topic.
- **Lessons:** the AI outlines the lessons when the course is created. Each lesson is written on first open by `generateLesson`; a race is safe, because a conditional write claims it.
- **Questions:** each lesson has 3 multiple-choice questions plus 1 short written answer.
  - **Multiple choice:** options are shuffled when stored and marked on the server without the AI, so these answers aren't rate limited.
  - **Written answers:** the AI marks them against a model answer.
  - **Answers stay on the server:** a question's answer is only sent after the learner has answered it.
- **Spaced repetition** (`ReviewItem`, `schedule()`): a wrong answer puts the question in box 1, due tomorrow. A correct review answer moves it to box 2–4 (due in 3, 7 or 14 days), and passing box 4 retires it. Only items that are due can move; answering early changes nothing.
- **Lesson text format** (`LessonContent.tsx`): `## ` headings, `- ` bullets and fenced code, rendered as React text and never as HTML.

Phase 5: runnable code, personas and debug practice.
- **Runnable coding answers:** CODING questions can come with a `codeSpec` (function name, params, JSON test cases).
  - **Where tests run:** in the browser, never on the server. `client/src/code/runTests.ts` runs JavaScript (and TypeScript, types stripped) in `js-runner.worker.ts` and Python through a harness on the kids Pyodide worker. This is the one place interview code uses `client/src/kids/runner`; the harness catches errors itself, so the kids error hints never show.
  - **On submit:** the answer is re-run, and `{ language, passed, total }` goes to grading.
  - **Gemini:** its schema omits `code`, so Gemini questions aren't runnable.
- **JavaScript worker CSP:** `js-runner.worker` is the only script allowed `'unsafe-eval'`. It has its own `vercel.json` header rule, `default-src 'none'`, so it has no network access; the main rule excludes its path, because two matching CSPs would both apply.
- **Personas:** `server/src/ai/personas.ts` (`NEUTRAL`, `FRIENDLY_STARTUP`, `BIG_TECH_STRICT`) set `InterviewSession.persona`, which adjusts the question tone and the grading strictness.
- **Debug practice** (`server/src/debug`, `/debug`): the AI writes broken code with 1–3 planted bugs in a chosen stack.
  - **Running vs reading:** Python, JavaScript and TypeScript are runnable against `spec` tests; the other stacks are read by the AI. TypeScript is stripped to JavaScript in `js-runner.worker` with a lazily loaded sucrase, never type-checked, so its prompt asks for bugs that change runtime behaviour. An exercise is only `runnable` if it also has a `spec`, so TypeScript exercises written before this stay AI-reviewed.
  - **Kept hidden until submit:** the bugs, hints and reference fix.
  - **Readable code:** `challengeSchema` rejects code under 8 lines or with lines over 160 characters (unescaping double-escaped `\n` first). JavaScript, TypeScript and React are run through Prettier on the server (`debug/format.ts`), which keeps the planted bugs. Old one-line JS exercises are formatted on first open with a conditional write. The editor highlights every debug stack, and has a lazy-loaded "Format code" button (`client/src/code/formatCode.ts`) for the JS family.
  - **Hints for bugs still in the code:** each bug stores a `buggySnippet` and `fixedSnippet`, validated in code at creation (`checkSnippets`, compared with `normaliseCode`, which ignores layout). `POST /:id/hint` takes the learner's current `code`; `bugStatus` marks each bug present, fixed or unclear. Unclear ones are settled by one AI call (`settleWithAi`), and only then does the controller apply the AI limits. The hint goes to the first present bug not yet hinted (`hintedBugs`). "Every bug looks fixed" and "every remaining bug already has a hint" use nothing up.
  - **"Show me the answer"** (`POST /:id/reveal` with the current `code`): the same bug check (AI only for unclear bugs) records which bugs were fixed, then a conditional write moves the exercise `OPEN` → `REVEALED`, unscored, so it can't race a submit. The result shows each bug as fixed or not, a "What changed" diff (`code/CodeDiff.tsx` on `code/diff.ts`: a dependency-free line LCS that ignores whitespace layout, then a token LCS inside edited lines so the exact changed words are highlighted) with two views, buggy code → fix and your code → fix, an "only changed lines" fold, and copy buttons (`CopyButton`). Scored results show the same diff. "Try a similar one" (`POST /debug` with `similarTo`) writes a new exercise in the same stack and level with the same kinds of bugs.
  - **"Your challenges" list:** `GET /debug?status=all|open|done&before=<id>` returns 10 at a time, newest first, plus `hasMore` and per-filter `counts`. The `before` id is looked up within the user's own challenges (another user's id gives an empty page), and the page continues after it by `createdAt` then `id`. The page shows "Show more" and moves focus to the first new row.
  - **Grading:** submitting claims the challenge (status `GRADING`, stamped in `submittedAt`) so it's graded once. A claim stuck for more than 2 minutes can be retaken, and only the request holding the claim writes the result.

System design practice (`server/src/design`, `/design`): the AI writes an interview question (level and an optional "what to design" topic); the learner draws an architecture on a canvas and writes notes, and the AI marks both.
- **Canvas** (`client/src/design/DesignCanvas.tsx`): plain SVG, no library. Components are dragged with a pointer or moved with arrow keys; connections are made by picking a component and its target, on the canvas or from the panel under it (the keyboard and screen-reader route). Component kinds live in `COMPONENT_KINDS`, mirrored in `client/src/design/kinds.ts` and `server/src/design/design.prompts.ts`.
- **What the model sees:** the diagram is sent as JSON `{ nodes, edges }` (zod-checked: at most 40 components, 80 connections, 40-character names) and turned into a text list by `describeDiagram`; positions aren't marked.
- **Hidden until submit:** `keyPoints` (what a strong answer covers) and the model answer. Hints, grading claims and stale-claim retakes work exactly like debug practice.
- **Drafts** are kept in `localStorage` (`design-draft:<id>`), written 400 ms after the last change, and cleaned on load because they may be stale.

AI output validation: every AI call goes through `retryOnInvalid` or `generateValidated` (`server/src/ai/retry.ts`), which retries once on malformed JSON or a schema failure. Answers are graded *before* being saved, then the answer and its feedback are written together, so a failed grading never leaves a half-saved answer.

### RAG Lab (`/rag-lab`, `server/src/raglab`, `client/src/raglab`)
A levelled playground where the user builds one RAG bot, in Python or TypeScript/JavaScript, and the app grades it. **The learner writes the bot; don't write their bot's code unless they ask.** Levels 1–3 are playable; 4–10 are stubs in `levels.ts` (see `docs/roadmap.md`).
- **Contract:** the learner's `RagBot` class has `index(docs)`, `search(question, k)` → `[{chunkId, docId, text, score}]` and `ask(question, history)` → `{answer, citations}`.
- **The bot runs in the browser** (`client/src/raglab/runtime/`):
  - **Python:** a Pyodide worker with numpy (`raglab-py.worker.ts`, sharing `PYODIDE_URL` in `client/src/code/pyodide.ts` with the kids runner). The `ip` module is Python source bridged to JS with `registerJsModule("_ip_bridge")`; values cross as JSON strings.
  - **TypeScript/JavaScript:** `raglab-js.worker.ts` strips types with sucrase and runs the code with `new Function`. Like `js-runner.worker`, it has its own `vercel.json` CSP rule (`'unsafe-eval'`, `connect-src 'self'`) and is excluded from the main rule.
  - A run is capped at 10 minutes (free-tier models answer only a few questions a minute) and has a Stop button.
- **The `ip` toolkit** (`corpus`, `embed`, `llm`, `tokens`, `log`) calls `/api/rag-lab/sdk/*` from the worker.
  - **Embeddings:** `server/src/ai/embeddings.ts` (`gemini-embedding-001`, 768 dimensions, unit length), cached in `EmbeddingCache` by a hash of the text; cache hits are free.
  - **Model calls:** `ip.llm` goes to `labProvider` (`labModel.ts`), a model separate from the interview one so a test run can't use up the interview allowance. `RAG_LAB_PROVIDER` picks it: `groq` (default, free) uses `openai/gpt-oss-20b`, whose own allowance is 1,000 calls a day and 8,000 tokens a minute for the whole app, and the OpenAI SDK waits out its 429s (6 retries). `gemini` uses Flash-Lite, which is fast but allows only 20 free calls a day, so it needs billing. `RAG_LAB_MODEL` overrides the model. `AIProvider.chat` is the general chat call this needed.
  - **Budgets:** weighted daily budgets on the `RateLimit` table (`spendBudget`/`refundBudget`): 150 model calls and 5,000 newly embedded texts. Failed calls are refunded. Admin is exempt.
- **Grading happens on the server** (`grader.ts`). The browser gets only case ids, questions and history; `corpus.ts` and `cases.ts` keep the expected documents and reference answers.
  - hit@k and citation precision are computed in code. An LLM judge (the main provider) marks correctness, refusals and injection in sequential batches; items it skips are re-marked one at a time. The poisoned `community-wiki-tips` doc carries the canary "pineapple protocol".
  - Checks are cumulative (`checksUpTo`). PRACTICE runs return per-case results; HELDOUT runs return totals only, and passing one moves the project up a level with a conditional `updateMany`.
  - Grading claims the attempt (RUNNING → GRADING, retaken after 3 minutes), like debug practice.
- **Rate limits:** `ragRunLimiter` on starting runs, `aiLimiter` + `ragGradeDailyLimiter` on grading, `ragSdkLimiter` on toolkit calls.

### Speak (`/speak`, `server/src/story`, `client/src/story`)
Storytelling practice: the user tells a story or explains a topic out loud, gets marked, then retells the same story.
- **A story** (`StoryPractice`) has a kind (`EXPERIENCE`, `EXPLAIN`, `PITCH`, `OWN` or `CONVERSATION`, or a drill kind), a target length (60, 120 or 180 seconds), an AI-written prompt and audience, and hidden `coachingNotes`. The notes are shown only after the first take, so the user tells it their own way first. `kind` is a plain string, so new kinds need no migration.
- **Frameworks** (`story/story.frameworks.ts`): cheat sheets (STAR, PREP, answer first, present-past-future, answer-add-ask…), each with steps, a fill-in template, an example and the usual mistake. `KIND_FRAMEWORKS` maps each kind to one; its steps are the "Suggested shape" the marker scores structure against (`shapeFor`). The story page shows it as "How to shape it"; `/speak/frameworks` lists them all (sent with `GET /story`).
- **1-minute drills** (`story/story.drills.ts`): kinds `ANSWER_FIRST`, `INTRO`, `IMPROMPTU`, `NO_FILLER` and `PAUSE`, each training one dimension (`focus`, shown first in the result). `POST /story/drill` picks a prompt from a fixed list, so no AI call (`drillLimiter`); marking uses the shared allowance. Drills have no rounds and can't be banked, and are listed apart from stories ("Recent drills"). The Today card's Speak item suggests the drill for the weakest dimension over the last 2 takes in 30 days (`weakDrill`, `DRILL_FOR`), linking to `/speak?drill=…`.
- **Voice analysis** (`client/src/audio/analyzeVoice.ts`): while the mic is on, Speak always records (the "keep a recording" setting only decides whether the audio is saved). On submit the browser decodes it and measures pauses (≥0.4 s), pitch range in semitones and phrase trail-off; only these numbers are sent (`voice`, zod-bounded `voiceSchema`, stored in the take's `stats`; dropped for typed takes). `analyzeSamples` is pure, so it can be tested on generated audio. `voiceIssues` turns the figures into findings the marker must mention; they don't change the delivery rule, except that a `PAUSE` drill with fewer than 2 pauses caps delivery at 5.
- **Conversations** (`CONVERSATION`): the AI plays the other person (`audience`) in a scenario (`topic`); the setup call writes their opening line as the prompt. Each turn calls `POST /story/:id/reply` with the turns so far (kept in the browser; at most 6 of yours, alternating, 1,500 characters each) and `aiProvider.chat` answers in character (`conversationMessages`, `cleanReply`), behind `conversationLimiter` (80 a day) rather than the interview allowance. Submitting sends the turns; the server stores "Them:/You:" lines and counts fillers, hedges and pace on your lines only. Replies can be read aloud with the browser's speech synthesis. Conversations can't be banked.
- **Takes** (`StoryTake`, up to `MAX_TAKES` = 5) store the transcript, the delivery `stats`, five 1–10 scores (`structure`, `clarity`, `specifics`, `presence`, `delivery`), an overall score and the feedback.
  - **Delivery stats are computed in code** (`analyzeFillers` and `analyzeHedges` in `services/transcriptAnalysis.ts`) and given to the grader as facts.
  - **Typed takes:** the client sends `durationSec` only for a recorded take of at least 5 seconds. A typed take gets an estimated length and `wpm: null`, so it never reports a fake pace.
  - **The stronger version** uses only facts from the transcript. Missing details become bracketed questions, so the AI never invents the user's experiences.
  - **Retells** pass the previous take's scores and improvements to the grader.
- **Scoring guide** (`story/story.rubric.ts`): one source for what each 1-3/4-6/7-8/9-10 band means per dimension. The marker gets it in `storyGradePrompt`, and the story response sends it as `guide` for the "What a good score looks like" card. `deliveryCheck` works out length (aim 80-110% of target) and fillers plus hedges per 100 words (under 3) in code, for both the prompt and each take's `delivery`; a timed take that meets both gets delivery 7 or more, and typed takes are capped at 6. The marker also returns `reasons` (one sentence per dimension, stored in `feedback`; null on older takes).
- **One grading at a time:** a take claims the story (`gradingAt`, retaken after 2 minutes) before the AI call, so a double submit is refused before a second call. `@@unique([storyId, number])` backs this up.
- **Rounds:** after all 5 takes, "Practise this story again" (`POST /story/:id/again`, `practiseAgain`, no AI call) starts round N+1.
  - It copies the prompt, audience, length and coaching notes, with `round` and `continuesFromId` set.
  - `continuesFromId` is unique, so a double click returns the existing round.
  - Round 2+ shows the coaching notes from the start, and its first take is graded against the previous round's last take (`fromPreviousRound` in the prompt, so it's never called "take 5").
  - The Speak list shows only the latest round of each story; a round links back to the one before.
  - One bank entry per story across all its rounds: `bankEntryForRounds` walks the chain, so saving another round returns 409.
  - After a round's last take, "What to work on next" (`client/src/story/nextFocus.ts`, computed in code) names the lowest dimension over the last 2 takes, with a fixed tip, and flags fillers or hedges above 3 per 100 words.
- **Clean-up:** practice stories are temporary, and the story bank is what's kept. `cleanupStories` runs inside the daily cron handler, after the reminders. It deletes stories with no takes after 7 days, and stories whose last take is more than 90 days old, but never a story in the bank (`bankEntry: null`) or one whose take is being marked (`gradingAt: null`). It runs even if the reminders fail. The progress page only charts 84 days, and streaks, badges and personal bests live in their own tables.
- **Limits:** the AI routes use `requireVerified`, `aiLimiter` and `aiDailyLimiter`, so Speak shares the 50-a-day interview allowance.

### Story bank (`/speak/bank`, `server/src/story/bank.*`, `client/src/story/BankPages.tsx`)
A user's best personal stories (`StoryBankEntry`, at most 30), each tagged with 1-3 of the 10 `COMPETENCIES` in `bank.prompts.ts`. The client gets the competency list from `GET /story-bank`, so it isn't duplicated.
- **Adding:** "Save to my story bank" on a Speak story (one entry per story, `storyId` unique, set to null if the story is deleted; `bestScore` copied from its best take) or typed in on the bank page. `POST /story-bank/suggest` (AI) fills in a title, a STAR summary using only facts given, and tags; nothing is saved until the user saves the form. Over-long suggestions are trimmed at a sentence, not rejected.
- **Coverage:** competencies with no story link to Speak with `?kind=EXPERIENCE&topic=…` prefilled.
- **"Which story fits?" drill** (`/speak/bank/drill`): the question comes free from `BEHAVIOURAL_QUESTIONS`; `POST /story-bank/drill/judge` (AI) rates the pick against the whole bank and may point to a better story or a story worth adding. Only ids from the user's own bank are passed back.
- **Mock reports:** after the report, a separate AI call (`storyNotesFor` in `roles/mock.ts`; inside the report prompt models skipped it) matches each behavioural answer to a bank story, stored as `SessionSummary.storyNotes` with titles, and bumps `timesUsed` for stories told. A failure there never blocks the report.
- **Limits:** the two AI routes use the shared allowance; the rest is behind `bankLimiter`.

### Recordings and progress (Phase C of the practice loop)
- **Recordings** (`hooks/useRecorder.ts`, `audio/recordings.ts`, `components/Recording.tsx`): while speech recognition is listening, a `MediaRecorder` records the mic too. It starts on the first listen, pauses and resumes as the mic toggles (one answer, one recording), and `finish()` hands back the audio and releases the mic; `reset()` discards it. The audio is saved **only in the browser** (IndexedDB `interviewpal-audio`, keyed `take:<id>`, `answer:<id>`, `retake:<questionId>:<n>`), never uploaded, and pruned after 30 days. A finished recording is kept across a failed submit so a retry still saves it. "Keep a recording on this device" (`localStorage` `keep-recordings`, on by default) turns it off. Playing `blob:` audio needs `media-src 'self' blob:` in the client CSP.
- **Progress** (`/progress`, `server/src/progress`): `GET /progress` buckets the last 12 weeks (Monday UTC) in code, without AI: average answer score (retakes included), Speak score, fillers per 100 words (answers, retakes and takes), pace (timed takes only) and hedges per 100 words, plus totals and the average gain per retake. `ProgressPage` draws one plain-SVG line chart per metric (`progress/LineChart.tsx`: gaps for empty weeks, crosshair on hover, arrow keys read each week into a live region, a text summary as the alternative) and a table of every number. The line colour `--chart-line` was checked with the dataviz skill's validator: `#2443c4` on light, `#6f8cf5` on dark (the "Studio ink" palette: cobalt `--primary` on a mist `--bg` in light, deep navy in dark; status colours stay separate). The logo is `components/BrandMark.tsx` (a speech bubble with voice bars; keep the `index.html` favicon in step), and the landing page's hero is `pages/landing/AnswerDemo.tsx`, a once-per-load demo of an answer being recorded and marked (finished state under reduced motion).

### Daily habit: Today card, streak, rewards, reminder (`server/src/today`, `client/src/today`, Phase D)
- **Practice days:** `recordPractice(userId, kind, score?)` (`practice.service.ts`) is called by every graded action's controller (answers, retakes, Speak takes, the story-fit drill, Terms and Learn answers, debug and design submits). It upserts one `PracticeDay` row per UTC day (`kinds` lists what was done) and never throws. The migration backfilled past days and best scores.
- **Streaks** (`streak.ts`, pure): days in a row with any practice. One missed day a week (Monday UTC) is forgiven as a freeze day if the days either side were practised; today never breaks a streak, and a missed yesterday is `atRisk` until today is practised.
- **Rewards** come back as `rewards: Reward[]` in the action's response. The client's `api` wrapper fires a window event and `RewardToaster` (in `Layout`) shows them, so pages don't handle them. A streak reward only on the day's first practice; badges (`badges.ts`, `Achievement`, each earned once): streak milestones, weekly goal (5 days), first 9/10, filler words halved; personal bests per kind (`PersonalBest`, conditional `updateMany`). Running mocks pass no score, so they never reveal one.
- **Today card** (`GET /today`, no AI): due Terms, due Learn reviews, the lowest unretaken answer under 6 in 30 days (or a quick-practice question), and a Speak item (the 1-minute drill for the weakest dimension once there are 2 recent takes; otherwise a story-bank gap, else the story-fit drill). Items tick off from today's `kinds`. The progress page shows streak tiles and the badge shelf (`#badges`).
- **Reminder email:** `User.dailyReminder` (account page toggle, hidden without Resend, needs a verified email). Vercel Cron (`server/vercel.json`, 17:00 UTC) calls `GET /api/cron/daily-reminder` with `Authorization: Bearer $CRON_SECRET`; without the secret it's refused. It emails opted-in, verified users with no practice today, claiming each with `reminderSentOn` so nobody gets two. Unsubscribe links are HMAC-signed with `JWT_SECRET` (`/unsubscribe` page and one-click `POST /api/reminders/unsubscribe`).

### Terms (`/terms`, `server/src/terms`, `client/src/terms`)
Interview terminology with spaced review. It's reached from the Learn page and a dashboard card (`TermsCallout`), not the nav.
- **Where terms live:** a `Term` is either a shared starter-deck term (`userId` null, `source: PRESET`, written by hand in `server/prisma/terms/` and upserted by `presetKey`) or the user's own (`AI` deck or `MANUAL`). A term is on someone's list when they have a `TermProgress` row; removing a starter term deletes only that row.
- **Boxes decide the exercise** (`modeForBox`):
  - box 1: Recognise (pick the definition, marked in code)
  - boxes 2–3: Recall (explain it, rated by the learner after `GET /review/:id/reveal`, or AI-marked on request; box 3 asks for an example)
  - box 4: Use it (answer the term's interview question; AI-marked, and passing requires `usedCorrectly`)
- **Moving between boxes** (`nextBox`): right moves up, and passing box 4 masters the term. Partly stays, and wrong moves down one; both come back tomorrow. Intervals come from `utils/spacedRepetition.ts`, shared with Learn.
- **Only due or new terms move.** Practising ahead (`?ahead=1`) never changes the schedule. Answers are conditional `updateMany`s, so a double submit moves a term once.
- **New terms:** at most `NEW_PER_DAY` (5) are introduced per UTC day.
- **Recognise options** are the term's one-liner plus other one-liners from the same deck (stored `distractors` fill any gap). They're shuffled on the server, and the answer only comes back after answering.
- **Limits:** AI routes (generating a deck, adding a term, AI-marked Recall, Use it) use the shared 50-a-day allowance; everything else is behind `termsLimiter` only.

### Kids section (`/kids`)
A learning area for a parent's children, kept separate from the interview app.
- **Where the code lives:** `server/src/kids/` and `client/src/kids/`. It touches the interview code in only a few places:
  - `apiRouter.use("/kids", …)`
  - `AIProvider.generateJson` (a raw JSON call; the kids prompts and zod schemas live in `kids.prompts.ts` and `kids.schemas.ts`)
  - the lazy `/kids/*` route in `App.tsx`
  - the "Kids" nav link
  - the `User.children` and `User.kidsPinHash` columns
- **Accounts:** children are `ChildProfile` rows owned by the parent `User`, with no login. Every kids query is scoped by `parentId`.
- **Courses:** stored as data. Each `CourseDefinition` lives in `server/prisma/curriculum/`, is listed in `curriculum/index.ts`, and is loaded by `npm run prisma:seed`.
  - **Adding a course** (maths, video…) needs a new curriculum file and no code changes.
  - **First course:** `coding-python`, 12 levels. Levels 1–4 are Blockly blocks, with a `toolbox` that limits which block categories are available. Levels 5–12 are typed Python in CodeMirror.
- **Challenge size** (`kids/challengeBudget.ts`): Pal writes the *goal* (at most 3 lines; 30/45/60 words by age), never the steps, plus a hidden `plan` (its own solution as Python, never stored or shown). `checkChallenge` rejects long or numbered-step instructions, a plan over `solutionBudget` (blocks or lines by level, about a quarter less under age 9) and constructs the level's toolbox lacks; `generateChallenge` retries up to 3 times with the reasons, then uses the closest attempt if its goal is short enough. `normalisePlan` handles double-escaped `\n`. `server/scripts/kids-challenges.ts` measures it (`baseline` for the old prompt; on 2026-11-10: 29/36 old challenges listed the solution as numbered steps, 0/36 new).
- **AI tutor:** called "Pal". It generates each challenge, reviews attempts (an exact `expectedOutput` match overrides the model's verdict) and answers hint questions.
- **Progress:** passing `challengesToPass` challenges levels the learner up, and the parent can also set the level. These writes are conditional `updateMany`s.
- **Python runner:** Python runs in the browser via Pyodide, loaded from the jsdelivr CDN in a module Web Worker (`client/src/kids/runner`).
  - `prelude.ts` installs a recording `turtle` module (keep its API in sync with `RUNTIME` in `kids.prompts.ts`).
  - `input()` reads from the "Answers" box on Python levels, one line per call, and echoes the question and answer like a terminal. A worker can't pause for live typing without cross-origin isolation, which would break Google sign-in pop-ups.
  - Pal stores `Challenge.sampleInput` alongside `expectedOutput`. The exact-output check only applies when the learner's answers match those samples; otherwise Pal judges the logic.
  - A 5-second timeout kills and restarts the worker.
  - Blockly, CodeMirror and the runner are each separate lazy chunks.
- **Guides:** the Grown-ups page opens with a "Getting started" checklist (learner added, PIN set, kid mode started: `kids-started:<userId>`), an unconfirmed-email warning and "How it works". The level map and challenge page run a "How to play" tour for children (`kids/kidTours.ts` on `OnboardingTour`, `data-tour="kids-*"` targets), once per child (`kids-tour:<childId>:map|challenge`) and again from "How to play". `confirmNoPin` (kidMode.ts) warns before kid mode starts without a PIN, from both the picker and "Start learning".
- **Kid mode:** a `localStorage` lock (`kids-lock:<userId>`). While it's set, interview pages and the Grown-ups area redirect to the learner's pages. Leaving kid mode needs the parent PIN. A forgotten PIN is reset with the account password or a fresh Google sign-in, never just by logging in again.

### Reviews
Two project skills: `interviewpal-code-review` (built-in `/code-review` plus a project-specific checklist) and `interviewpal-ui-review` (axe-core WCAG 2.2 AA audit across pages, light/dark, 360/1280px, with a bundled `scripts/audit.mjs`). Run them after non-trivial changes.

### Topics
Seeded as non-custom (`isCustom: false`) per track in `prisma/seed.ts` (Frontend, Backend, Full-stack, AI Engineering — see `PRESET_TRACKS` in both `client/src/types/index.ts` and `server/src/types.ts`, kept in sync manually, not shared). `POST /topics` upserts a user-defined topic with `isCustom: true` on the same `(name, track)` unique constraint.
