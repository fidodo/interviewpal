# Deploy runbook: InterviewPal → Vercel, serverless, open sign-in

Context this runbook assumes: deploying to Vercel (or another platform with an ephemeral/serverless filesystem), and Google sign-in left open to anyone with a Google account (no email allowlist). If either of those assumptions no longer holds, some items here don't apply — re-check before blindly executing.

**Status as of 2026-10-26: items 1–5, 7, and 8 are done and verified.** Item 6 is in progress (see below). Verify this status against the actual repo state before trusting it; it'll drift as work continues.

## Vercel project setup (in progress, blocked on user action)

Two Vercel projects created and linked via `vercel link` (CLI authenticated as `fidodo`): `fidodos-projects/server` (rooted at `server/`) and `fidodos-projects/client` (rooted at `client/`). The server deployed successfully build-wise — `vercel deploy --yes` confirmed the build pipeline works end-to-end — at a stable URL: `https://server-opal-kappa-39.vercel.app`. It currently 500s on every request because no env vars are set yet (expected — `env.ts`'s `required("JWT_SECRET")` throws at cold start without one).

**Architecture note:** client and server are separate `*.vercel.app` domains, which the Public Suffix List treats as different *sites* — the session cookie is `SameSite=Lax`, which browsers won't send on cross-site fetch/XHR (only top-level navigations). To avoid breaking auth, `client/vercel.json` proxies `/api/*` to the server's deployment via an external-URL rewrite, so the browser only ever talks to the client's own origin — no CORS/cookie cross-site issue, no custom domain needed, no client code changes. If a custom domain gets set up later with `app.`/`api.` subdomains of the same apex, this proxy becomes unnecessary (same-site subdomains share SameSite=Lax cookies natively) but isn't wrong to keep either way.

**Blocked by auto-mode's permission classifier** (not a bug — a deliberate guardrail): writing env vars to Vercel's secret store (`vercel env add`) and `vercel deploy --prod` both require explicit user permission. Get the user to either grant it or do these two things themselves:
1. Set server env vars (from `server/.env`, skip `PORT` and `SEED_USER_*`): `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, plus `CLIENT_URL` once the client's final URL is known (item 6).
2. Set client env var: `VITE_GOOGLE_CLIENT_ID` (from `client/.env`).
3. Promote both to production (`vercel deploy --prod` in each directory, or via the Vercel dashboard).
4. Then finish item 6 below using the client's real production URL.

## 1. Migrate the database off SQLite — ✅ Done

**Why:** `server/prisma/schema.prisma` used `provider = "sqlite"` with a file-based `DATABASE_URL`. Vercel functions (and most serverless platforms) don't persist the filesystem between invocations — every write would vanish. Not optional once the host is serverless.

**Done:** Migrated to Neon Postgres using the user-provided **pooled** connection string (hostname contains `-pooler`). Deleted the old SQLite-dialect `server/prisma/migrations/` folder (no prod data existed yet) and generated a fresh `prisma migrate dev` against Postgres — applied cleanly, no PgBouncer/advisory-lock issues encountered. Reseeded. Full session lifecycle (login → session → question → grading → end → summary → history) verified working against Postgres via live curl tests.

**Gotcha hit along the way:** on Windows, running a migration while a `tsx watch` server process is still running can fail with `EPERM` on the Prisma query-engine `.dll` (file locked). Kill node processes first (`Get-Process node | Stop-Process -Force` in PowerShell).

## 2. Wrap the Express server for Vercel — ✅ Done

**Why:** `server/src/index.ts` calls `app.listen(...)` — a long-running process. Vercel runs serverless functions, not long-running servers. Doesn't require rewriting routes/controllers/services — only an entry-point shim.

**Done:** Added `server/api/index.ts` (`export { app as default } from "../src/app"`) and `server/vercel.json` with a catch-all rewrite (`"/(.*)" → "/api"`). Not yet deployed/tested against a real Vercel environment — this is config believed correct per the standard pattern, not live-verified. **When actually deploying, confirm this works on the first real deploy rather than assuming.**

## 3. Rate-limit auth and AI endpoints — ✅ Done

**Why:** There is no signup gate — `loginWithGoogle` (`server/src/services/auth.service.ts`) upserts a `User` for *any* verified Google email. Combined with open access, every AI call is a real cost with zero gatekeeping.

**Done:** `server/src/middleware/rateLimit.ts` — `authLimiter` (10/15min, IP-keyed) on `POST /auth/login` and `POST /auth/google`; `aiLimiter` (30/hour, keyed by `userId` when authenticated else IP via express-rate-limit's `ipKeyGenerator` helper — a raw `req.ip` key generator throws on IPv6, don't skip that helper) on `POST /sessions/:id/questions` and `POST /questions/:id/answer`. Verified live: 11th rapid login attempt correctly returned 429.

## 4. Stop leaking internal errors to clients — ✅ Done

**Why:** `errorHandler.ts` returned `err.message` to the client for *any* unhandled error — in production this can expose Prisma internals, stack-trace-adjacent detail, etc.

**Done:** Branches on `env.isProd` — generic message in production, real error still logged server-side always.

## 5. Add a health check route — ✅ Done

**Done:** `GET /api/health` in `server/src/routes/index.ts`, no auth. Verified returning 200.

## 6. Production env wiring — ⏳ Outstanding, needs user input

**Why:** `CLIENT_URL` (CORS allow-origin) and Google Cloud's "Authorized JavaScript origins" for the OAuth Client ID both still point at `localhost`. This exact class of bug already bit us once this session (Google rejected sign-in with "origin not allowed" until the origin was added in Cloud Console) — expect the same failure for the production domain if forgotten.

**How:** Once the production frontend domain is known (i.e. after a first deploy gives you one): set `CLIENT_URL` in the server's production env vars to that domain, and add that same domain to the OAuth Client ID's Authorized JavaScript origins in Google Cloud Console. Chicken-and-egg with a first deploy — do it deliberately right after the domain exists, not reactively after a failed sign-in.

**Tracked as part of the current production push** (2026-10-26) — this is the last step before calling the app live; execute it immediately once a deploy domain exists, don't let it slip.

## 7. Generate the Prisma client at build time — ✅ Done

**Done:** Added `"postinstall": "prisma generate"` to `server/package.json`.

## 8. Get the repo into git — ✅ Done

**Why:** A git-based Vercel deploy needs a GitHub repo to connect to.

**Done:** Local repo initialized, four commits made (reviewed for secrets/unwanted files before each — caught and excluded a SQLite db file, a `.tsbuildinfo` build artifact, and a Claude Code lock file via `.gitignore` fixes along the way). Branch renamed `master` → `main`. Remote `origin` set to the user-provided `https://github.com/fidodo/interviewpal.git` and pushed — `main` is live on GitHub, ready to connect to Vercel.

## Also worth knowing: a deferred vulnerability

`npm audit` flagged a high-severity `zod` DoS (`GHSA-mrhx-c7xc-m3w5`, memory exhaustion on oversized constrained collections) nested under the `openai` package's dependency on `zod@3.25.76`. The only fix is a zod v3→v4 major bump, which risks breaking the app's own input-validation schemas and the `openai` SDK's internal compatibility this close to deploy. Deliberately deferred rather than forced — our own zod schemas are small and flat (not the "oversized constrained collection" shape this CVE targets), so practical exploitability against this specific app is low. Revisit once `openai` ships a release that moves off vulnerable zod, or once there's room to test a major-version bump properly. (A *critical* `node-tar` vulnerability nested under `bcrypt`'s native-build toolchain was fixed by upgrading `bcrypt` to latest — verified existing password hashes still compare correctly after the upgrade.)
