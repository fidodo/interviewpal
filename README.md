# InterviewPal

A mock technical-interview practice app. Pick a track, a topic, and a difficulty; answer AI-generated questions out loud or in code; get graded instantly with a score breakdown; review your progress session by session, grouped by day.

**Live:** [https://client-beige-mu-26.vercel.app](https://client-beige-mu-26.vercel.app)

## Features

- **AI-generated questions**, adapted to the topic, difficulty, and how the candidate is doing so far in the session
- **Two answer modes**: speak your answer (Web Speech API transcription) for conceptual questions, or type code for implementation questions — the AI decides which fits each question
- **Instant feedback**: an overall score plus a correctness / clarity / depth breakdown, with specific strengths, weaknesses, and suggestions
- **Filler-word detection** on spoken answers (um, uh, like, you know, …) — computed locally, no AI call needed
- **Session history grouped by day**, with the dashboard surfacing only the most recent day's sessions
- **Google sign-in** or email/password auth
- **Pluggable AI provider**: Gemini, Groq, or xAI's Grok — swap via one environment variable

## Tech stack

| | |
|---|---|
| Client | React, Vite, TypeScript, React Router |
| Server | Express, TypeScript, Prisma |
| Database | PostgreSQL (Neon) |
| AI | Google Gemini / Groq / xAI Grok (pluggable) |
| Auth | JWT in an httpOnly cookie; Google OAuth via Google Identity Services |
| Hosting | Vercel (two separate projects — see [Deployment](#deployment)) |

## Project structure

```
interviewpal/
├── client/                  React + Vite frontend
│   └── src/
│       ├── pages/           Login, Dashboard, Interview session, History, Summary
│       ├── components/      MicButton, CodeAnswerBox, FeedbackCard, HistoryList, …
│       ├── hooks/            Auth context, speech recognition
│       └── api/              Thin fetch wrapper
└── server/                  Express + Prisma API
    ├── prisma/               Schema + migrations (PostgreSQL)
    └── src/
        ├── ai/                Provider-agnostic AI layer (interface, prompts, schemas, 3 providers)
        ├── controllers/       Request handlers
        ├── services/          Business logic (sessions, auth, summaries, filler-word analysis)
        ├── routes/            Express routers
        └── middleware/        Auth, rate limiting, error handling
```

`client/` and `server/` are independent packages with no shared workspace tooling — run commands from inside each directory.

## Getting started

### Prerequisites

- Node.js 18+
- A PostgreSQL database (e.g. a free [Neon](https://neon.tech) project — use the **pooled** connection string)
- A Google OAuth Client ID ([Google Cloud Console](https://console.cloud.google.com/apis/credentials)) if you want Google sign-in
- An API key for at least one AI provider: [Gemini](https://aistudio.google.com/apikey), [Groq](https://console.groq.com/keys), or [xAI](https://console.x.ai)

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment variables

Copy the example files and fill them in:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

See [Environment variables](#environment-variables) below for what each one does.

### 3. Set up the database

```bash
cd server
npm run prisma:migrate   # creates tables from schema.prisma
npm run prisma:seed      # seeds starter topics + the accounts from SEED_USER_* in .env
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
| `JWT_SECRET` | Signs the session cookie — any long random string |
| `GOOGLE_CLIENT_ID` | OAuth Client ID, for verifying Google sign-in tokens server-side |
| `SEED_USER_1_EMAIL` / `SEED_USER_1_PASSWORD` | Account created by `prisma:seed` (and `SEED_USER_2_*` for a second one) |
| `AI_PROVIDER` | `"gemini"`, `"groq"`, or `"grok"` (xAI) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Used when `AI_PROVIDER=gemini` |
| `GROQ_API_KEY` / `GROQ_MODEL` | Used when `AI_PROVIDER=groq` |
| `XAI_API_KEY` / `XAI_MODEL` | Used when `AI_PROVIDER=grok` |
| `PORT` | Local dev port (default 4000) |
| `CLIENT_URL` | Allowed CORS origin — the frontend's URL |

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
| `npm run prisma:seed` | Seed starter topics and accounts |
| `npm run prisma:studio` | Open Prisma Studio (DB browser) |

**`client/`**

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |

## Architecture notes

- **AI provider abstraction** (`server/src/ai/`): a single `AIProvider` interface (`generateQuestion`, `gradeAnswer`, `generateSummary`) with one implementation per provider. Every prompt asks for a specific JSON shape and the response is validated with zod before it touches the database.
- **History-aware prompts**: each session's prior questions, answers, and scores are fed back into every subsequent prompt, so questions adapt in difficulty and avoid repeats.
- **Question types**: the AI itself decides whether a question is best answered verbally or by writing code, and the grading rubric adjusts accordingly.

## Deployment

Deployed on Vercel as **two separate projects** — one rooted at `client/`, one at `server/` — rather than one combined project. A couple of things that setup needed to account for:

- Since the two live on different `*.vercel.app` domains (different "sites" for cookie purposes), `client/vercel.json` proxies `/api/*` requests to the server's deployment at Vercel's edge, so the browser only ever talks to one origin and the session cookie works normally.
- `client/vercel.json` also needs an `index.html` fallback rewrite for client-side routing — without it, direct navigation to any route other than `/` 404s.
- Each Vercel project's **Root Directory** setting must point at its subfolder (`client` or `server`) for Git-triggered deploys to find the right `package.json`.

More detail on deploy history and architecture decisions lives in `.claude/skills/interviewpal-playbook/` for anyone continuing this project with Claude Code.
