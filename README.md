# InterviewPal

Practice for technical interviews, out loud. Answer AI-generated questions by voice or in code and get marked straight away. You can also work towards a target role with full mock interviews, practise debugging and system design, rehearse your stories, and build a RAG bot of your own. There's a separate coding area for children, too.

**Live:** [https://client-beige-mu-26.vercel.app](https://client-beige-mu-26.vercel.app)

## What's in it

| Area | What you do |
|---|---|
| **Interview practice** | Pick a track, topic and level, then answer AI-written questions by voice (Web Speech API) or in code. Each answer gets a score with a correctness / clarity / depth breakdown. Questions adapt to how you're doing. You can ask for a **follow-up** on an answer, or **retake** a weak answer up to 3 times. Code answers run their tests in your browser. |
| **Target roles and mock interviews** | Name the job you want; the AI builds its skill list and your answers keep each skill's rating up to date. "Practise my weakest skill", weekly goals, and a full **mock interview** (behavioural, role-specific and closing rounds) that ends in a hire / lean hire / no hire report. |
| **Learn and Terms** | Short AI-written courses with quizzes and spaced review, and interview terminology decks that move from recognising a term to using it in an answer. |
| **Debug practice** | Fix real-looking broken code in your stack (JavaScript, TypeScript and Python run their tests in the browser). Hints only for bugs still in your code; "show me the answer" with a diff of what changed. |
| **System design** | Draw an architecture on a canvas, add notes, and get marked against what a strong answer covers. |
| **Speak** | Tell a story or explain a topic out loud, then retell it. Marked on structure, clarity, specifics, presence and delivery against a published scoring guide. Includes speaking frameworks (STAR, PREP, answer first…), **1-minute drills**, **voice analysis** from your recording (pauses, pitch range, trailing off; measured in your browser, the audio is never uploaded), **conversations** where the AI plays the other person, and a **story bank** for your best stories. |
| **RAG Lab** | Build a retrieval-augmented chatbot in Python or TypeScript; it runs in your browser and the server grades it level by level. |
| **Kids** | A coding course for children (12 levels: Blockly blocks, then real Python), with an AI helper, "Pal", that writes short challenges, checks work and gives hints. Grown-ups manage learners, levels and a kid-mode PIN. |
| **Daily habit** | A "Today" plan, streaks, badges, personal bests, a progress page with weekly charts, and an optional daily reminder email. |

Sign in with Google or email and password.

## Tech stack

| | |
|---|---|
| Client | React, Vite, TypeScript, React Router; CodeMirror, Blockly, Pyodide (Python in a Web Worker) |
| Server | Express, TypeScript, Prisma, zod |
| Database | PostgreSQL (Neon) |
| AI | Groq, Gemini, Mistral or xAI Grok behind one interface, with an optional fallback chain |
| Auth | JWT in an httpOnly cookie (revocable); Google Identity Services; email verification and password reset through Resend |
| Hosting | Vercel (two projects; see [Deployment](#deployment)) |

## Project structure

```
interviewpal/
├── client/                 React + Vite front end
│   └── src/
│       ├── pages/          Dashboard, interview, history, roles, learn, account…
│       ├── story/          Speak: stories, drills, conversations, scoring guide, story bank
│       ├── debug/          Debug practice pages
│       ├── design/         System design canvas
│       ├── code/           Code editor and in-browser test runners
│       ├── raglab/         RAG Lab pages and the bot runtime (workers)
│       ├── kids/           Kids section (own layout, Blockly, Python runner, grown-ups area)
│       ├── today/          Today card, rewards, reminders
│       ├── progress/       Progress page and charts
│       ├── audio/          Recordings (kept in the browser) and voice analysis
│       ├── components/     Shared UI (layout, mic, onboarding tour…)
│       ├── hooks/          Auth, speech recognition, recorder
│       └── api/            Thin fetch wrapper per area
└── server/                 Express + Prisma API
    ├── prisma/             Schema, migrations, seed, kids curriculum, Terms starter decks
    ├── scripts/            Measurement scripts (not deployed): compare-models.ts, kids-challenges.ts
    └── src/
        ├── ai/             AIProvider interface, prompts, schemas, providers, fallback chain
        ├── controllers/, services/, routes/   Interviews, sessions, auth, summaries
        ├── roles/          Target roles, skills, mock interviews
        ├── learn/, terms/  Courses and terminology
        ├── debug/, design/ Debug and system design practice
        ├── story/          Speak and the story bank
        ├── raglab/         RAG Lab levels, corpus and grader
        ├── kids/           Kids section (children, PIN, challenges)
        ├── today/, progress/  Daily plan, streaks, badges, progress
        ├── middleware/     Auth, rate limits (stored in Postgres), errors
        └── utils/          Shared helpers
```

`client/` and `server/` are independent packages with no shared workspace tooling, so run commands from inside each directory.

## Getting started

### Prerequisites

- Node.js 18+
- A PostgreSQL database (for example a free [Neon](https://neon.tech) project; use the **pooled** connection string)
- An API key for at least one AI provider: [Groq](https://console.groq.com/keys), [Gemini](https://aistudio.google.com/apikey), [Mistral](https://console.mistral.ai) or [xAI](https://console.x.ai)
- Optional:
  - a Google OAuth Client ID ([Google Cloud Console](https://console.cloud.google.com/apis/credentials)) for Google sign-in;
  - a [Resend](https://resend.com) key for email.

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

See [Environment variables](#environment-variables) for what each one does.

### 3. Set up the database

```bash
cd server
npm run prisma:migrate        # creates the tables
npm run prisma:seed           # starter topics, the kids course, and the accounts from SEED_USER_* in .env
npm run prisma:seed-terms     # the Terms starter decks (safe to re-run)
```

### 4. Run it

```bash
# terminal 1
cd server && npm run dev   # http://localhost:4000

# terminal 2
cd client && npm run dev   # http://localhost:5173, proxies /api to the server
```

## Environment variables

**`server/.env`**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (pooled, if using Neon or similar) |
| `JWT_SECRET` | Signs the session cookie; any long random string. Also signs reminder unsubscribe links |
| `GOOGLE_CLIENT_ID` | OAuth Client ID, for verifying Google sign-in server-side |
| `SEED_USER_1_EMAIL` / `SEED_USER_1_PASSWORD` | Account created by `prisma:seed` (and `SEED_USER_2_*` for a second). Seed user 1 is an admin, so it's exempt from AI limits |
| `AI_PROVIDER` | A single provider: `groq`, `gemini`, `mistral` or `grok` (xAI) |
| `AI_PROVIDERS` | Optional fallback order, e.g. `groq,gemini,mistral`: a call moves on only when a provider is rate limited or down |
| `GROQ_API_KEY` / `GROQ_MODEL` | Groq (recommended primary: `openai/gpt-oss-120b`) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Gemini (also used for RAG Lab embeddings) |
| `MISTRAL_API_KEY` / `MISTRAL_MODEL` | Mistral (a slow but reliable last fallback) |
| `XAI_API_KEY` / `XAI_MODEL` | xAI Grok |
| `RAG_LAB_PROVIDER` / `RAG_LAB_MODEL` | The model RAG Lab bots call, separate from the interview model (`groq` by default) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional email: verification, password reset and the daily reminder |
| `CRON_SECRET` | Authorises the daily cron call (reminders and clean-up of old practice stories) |
| `PORT` | Local dev port (default 4000) |
| `CLIENT_URL` | Allowed CORS origin: the front end's URL |
| `NODE_ENV` | `production` in production |

**`client/.env`**

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Same OAuth Client ID as the server, used to render the Google sign-in button |

## Available scripts

**`server/`**

| Script | Does |
|---|---|
| `npm run dev` | Run with hot reload (`tsx watch`) |
| `npm run build` / `npm start` | Compile and run the production build |
| `npm run prisma:migrate` | Apply Prisma migrations |
| `npm run prisma:seed` | Seed starter topics, the kids course and accounts |
| `npm run prisma:seed-terms` | Load the Terms starter decks |
| `npm run prisma:studio` | Open Prisma Studio (a database browser) |

**`client/`**

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |

There are no lint or test scripts.

## Architecture notes

- **One AI interface.** Every feature calls `AIProvider` (`server/src/ai/`), never a provider SDK directly. Every prompt asks for a JSON shape, and the reply is validated with zod (with one retry) before it touches the database.
- **Checked in code, not left to the model.** Wherever a model could get arithmetic or limits wrong, the server works it out and gives the model facts. Examples:
  - Speak's delivery length and filler rate;
  - debug hints (is the bug still in the code?);
  - the kids challenge size budget;
  - RAG Lab's retrieval scores.
- **Graded once.** Every AI-graded submission first claims its record with a conditional write, so a double click is graded once, and a claim stuck for a few minutes can be retaken. Progress and level-ups are conditional updates too.
- **Code runs in the browser.** Tests for coding answers, debug exercises, the kids' Python and RAG Lab bots all run in Web Workers (JavaScript, or Python via Pyodide), never on the server.
- **Limits.** AI routes need a verified email (once email is set up) and share a daily allowance. Rate-limit counters are stored in Postgres, because serverless instances don't share memory.
- **Privacy.** Recordings stay in the browser (IndexedDB, 30 days); only numbers from them are sent. Children have no accounts, only a nickname and age under a parent's account.

## Deployment

Deployed on Vercel as **two projects**, one rooted at `client/` and one at `server/`.

- **Proxying.** The two live on different `*.vercel.app` domains, so `client/vercel.json` proxies `/api/*` to the server. The browser only ever talks to one origin, and the session cookie works normally.
- **Client-side routes.** `client/vercel.json` sends every route that isn't an `/api/` or `/assets/` path to `index.html`. Missing `/assets/` files get a real 404, so after a deploy an open tab reloads once into the new version instead of going blank.
- **Security headers.** The client's Content-Security-Policy lives in `client/vercel.json`, with separate rules for the code-running workers.
- **Cron.** A Vercel Cron job (`server/vercel.json`) sends the daily reminder emails and clears out old practice stories.

More detail on deploy history and architecture decisions lives in `CLAUDE.md` and `.claude/skills/interviewpal-playbook/`, for anyone continuing this project with Claude Code.
