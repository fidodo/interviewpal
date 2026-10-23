# Deploy runbook: InterviewPal → Vercel, serverless, open sign-in

Context this runbook assumes: deploying to Vercel (or another platform with an ephemeral/serverless filesystem), and Google sign-in left open to anyone with a Google account (no email allowlist). If either of those assumptions no longer holds, some items here don't apply — re-check before blindly executing.

Work through these roughly in order; 1 and 2 are the two that actually block a working deploy, 3–5 are what stand between "deployed" and "safe to leave running unattended," 6–8 are deploy-mechanics that'll otherwise surface as confusing failures at the worst time.

## 1. Migrate the database off SQLite

**Why:** `server/prisma/schema.prisma` currently uses `provider = "sqlite"` with a file-based `DATABASE_URL`. Vercel functions (and most serverless platforms) don't persist the filesystem between invocations — every write would vanish. This isn't optional once the host is serverless.

**How:**
- Pick a Postgres host. Neon is the natural choice on Vercel — it's their native "Storage" integration, free tier, provisioned in ~2 clicks from the Vercel dashboard (user action, not something Claude can do from the CLI).
- Change `datasource db { provider = "postgresql" ... }` in `schema.prisma`.
- The existing `server/prisma/migrations/` folder has SQLite-dialect SQL — it won't apply to Postgres. Since there's no real production data yet, the simplest path is deleting that folder and running `prisma migrate dev` fresh against the Postgres `DATABASE_URL` to generate a clean initial migration.
- **Use the pooled connection string**, not the direct one. Serverless functions open many short-lived concurrent connections; Postgres has a hard connection limit, and Neon's pooler (PgBouncer) is what makes that survivable. Grabbing the wrong connection string here is the single most common Prisma-on-serverless failure mode.

## 2. Wrap the Express server for Vercel

**Why:** `server/src/index.ts` calls `app.listen(...)` — a long-running process. Vercel runs serverless functions, not long-running servers. This does **not** require rewriting routes/controllers/services — only an entry-point shim.

**How:** Add `server/api/index.ts` that imports and exports the existing `app` from `server/src/app.ts`, and a `vercel.json` that routes all requests to that function. This is the standard, well-trodden pattern for deploying an existing Express app to Vercel — don't restructure routes into individual serverless functions, that's unnecessary extra work here.

## 3. Rate-limit auth and AI endpoints

**Why:** There is no signup gate — `loginWithGoogle` (`server/src/services/auth.service.ts`) upserts a `User` for *any* verified Google email. Combined with open access, every AI call (question generation, grading, summary) is a real API cost with zero gatekeeping. This is the one item on this list with actual unbounded financial exposure if skipped.

**How:** Add `express-rate-limit` (or equivalent) on:
- `POST /auth/login`, `POST /auth/google` — brute-force / account-enumeration protection
- `POST /sessions/:id/questions`, `POST /questions/:id/answer` — the two AI-cost endpoints

## 4. Stop leaking internal errors to clients

**Why:** `server/src/middleware/errorHandler.ts` currently does `res.status(500).json({ error: err.message })` for *any* unhandled error — in production this can expose Prisma error internals, stack-trace-adjacent detail, etc. to whoever triggered it.

**How:** Branch on `env.isProd` (already defined in `server/src/config/env.ts`): log the real error server-side always, but only include `err.message` in the response when not in production.

## 5. Add a health check route

**Why:** Most deploy platforms (Vercel included, if using more than the bare minimum config) expect something to poll for readiness.

**How:** `GET /api/health` returning `200` with a trivial body. Add it in `server/src/routes/index.ts` alongside the other routers — doesn't need auth.

## 6. Production env wiring

**Why:** `CLIENT_URL` (used for the CORS allow-origin in `server/src/app.ts`) and Google Cloud's "Authorized JavaScript origins" for the OAuth Client ID both currently point at `localhost`. We already hit this exact class of bug once this session (Google rejected sign-in with "origin not allowed" until the origin was added in Cloud Console) — expect the same failure mode again for the production domain if this is forgotten.

**How:** Once the production frontend domain is known: set `CLIENT_URL` in the server's production env vars to that domain, and add that same domain to the OAuth Client ID's Authorized JavaScript origins in Google Cloud Console. Do this deliberately before first deploy, not reactively after the first failed sign-in.

## 7. Generate the Prisma client at build time

**Why:** Locally, `prisma migrate dev` auto-runs `prisma generate`. In a deploy pipeline there's typically no interactive migrate step — just `npm install` and a build — so the generated client needs to come from somewhere else, or the server will crash on an un-generated `@prisma/client`.

**How:** Add `"postinstall": "prisma generate"` to `server/package.json`'s scripts if it isn't already effectively covered by the deploy platform's build command.

## 8. Get the repo into git

**Why:** As of this session, the repo has no commits and no remote. A git-based Vercel deploy needs a GitHub repo to connect to.

**How:** Initial commit, create a GitHub repo, push. Straightforward, but easy to forget it's still outstanding when everything else is ready.
