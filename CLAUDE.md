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
- `npm run prisma:studio` — open Prisma Studio

Client (`client/`):
- `npm run dev` — Vite dev server (proxies `/api` to `http://localhost:4000`, see `vite.config.ts`)
- `npm run build` — `tsc -b && vite build`
- `npm run preview` — preview the production build

There are no lint or test scripts in either package.

## Architecture

### AI provider abstraction
`server/src/ai/provider.interface.ts` defines `AIProvider` with three methods: `generateQuestion`, `gradeAnswer`, `generateSummary`. `server/src/ai/provider.factory.ts` picks an implementation at startup based on `AI_PROVIDER` env var: `"gemini"` → `gemini.provider.ts` (`@google/genai`), `"grok"` → `grok.provider.ts` (xAI, via the `openai` SDK pointed at `https://api.x.ai/v1` — this is xAI's Grok model, unrelated to Groq the company), `"groq"` → `groq.provider.ts` (Groq, via the `openai` SDK pointed at `https://api.groq.com/openai/v1`). All three share the same prompt builders in `server/src/ai/prompts.ts` and validate the model's JSON response against zod schemas in `server/src/ai/schemas.ts`. To add another provider, implement `AIProvider` and add a case in the factory — nothing else needs to change.

Currently active: Groq (`openai/gpt-oss-120b`), set via `AI_PROVIDER` in `server/.env`. Gemini is also configured but was hitting transient 503 "high demand" errors on `gemini-3.8-flash` at the time of setup — worth retrying if switching back.

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
- **AI tutor:** called "Pal". It generates each challenge, reviews attempts (an exact `expectedOutput` match overrides the model's verdict) and answers hint questions.
- **Progress:** passing `challengesToPass` challenges levels the learner up, and the parent can also set the level. These writes are conditional `updateMany`s.
- **Python runner:** Python runs in the browser via Pyodide, loaded from the jsdelivr CDN in a module Web Worker (`client/src/kids/runner`).
  - `prelude.ts` installs a recording `turtle` module (keep its API in sync with `RUNTIME` in `kids.prompts.ts`) and disables `input()`.
  - A 5-second timeout kills and restarts the worker.
  - Blockly, CodeMirror and the runner are each separate lazy chunks.
- **Kid mode:** a `localStorage` lock (`kids-lock:<userId>`). While it's set, interview pages and the Grown-ups area redirect to the learner's pages. Leaving kid mode needs the parent PIN. A forgotten PIN is reset with the account password or a fresh Google sign-in, never just by logging in again.

### Reviews
Two project skills: `interviewpal-code-review` (built-in `/code-review` plus a project-specific checklist) and `interviewpal-ui-review` (axe-core WCAG 2.2 AA audit across pages, light/dark, 360/1280px, with a bundled `scripts/audit.mjs`). Run them after non-trivial changes.

### Topics
Seeded as non-custom (`isCustom: false`) per track in `prisma/seed.ts` (Frontend, Backend, Full-stack, AI Engineering — see `PRESET_TRACKS` in both `client/src/types/index.ts` and `server/src/types.ts`, kept in sync manually, not shared). `POST /topics` upserts a user-defined topic with `isCustom: true` on the same `(name, track)` unique constraint.
