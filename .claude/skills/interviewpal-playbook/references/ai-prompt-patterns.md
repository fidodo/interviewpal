# AI interview-prompt design patterns

How InterviewPal's AI layer is built, and why — useful both as a map of this codebase and as a pattern worth reusing in a similarly-shaped app (anything that generates questions/content, grades a response, and summarizes a session across multiple LLM providers).

## Provider-agnostic AI layer

`server/src/ai/provider.interface.ts` defines a small `AIProvider` interface: `generateQuestion`, `gradeAnswer`, `generateSummary`. Each concrete provider (`gemini.provider.ts`, `grok.provider.ts`, `groq.provider.ts`) implements it, and `provider.factory.ts` picks one at startup based on an env var.

Why bother with the abstraction instead of calling one SDK directly: this session actually needed to switch providers twice in quick succession (Gemini's model got deprecated mid-session, then hit a transient overload; swapped to Groq) — having the interface meant that was a new ~40-line file plus one `case` in the factory, not a rewrite of prompts, controllers, or the grading logic. **If adding a fourth provider, follow this exact shape — implement the interface, add one factory case, change nothing else.**

Two of the three current providers (xAI's Grok and Groq the company) both speak the OpenAI-compatible chat-completions API, just at different `baseURL`s with different model names — they're literally different companies despite the name similarity, worth double-checking which one a user actually means before wiring in a key.

## History-aware prompts

`session.service.ts`'s `loadPriorQA` reassembles the session's prior Q&A (plus each answer's score) from the database and passes it into every prompt, capped at the most recent 20 exchanges (`MAX_PRIOR_QA` in `prompts.ts`). This is what lets question generation avoid repeating itself and adapt follow-up depth to how the candidate is actually doing, and what lets the end-of-session summary speak to the whole arc rather than just the last answer. If extending this pattern elsewhere: the cap matters — uncapped history will eventually blow context and/or cost on a long session.

## Structured JSON output, validated

Every prompt (`prompts.ts`) ends with an explicit instruction for the exact JSON shape expected back, and every response is parsed through a zod schema (`schemas.ts`) before it's trusted or written to the database. This isn't decorative — it's the only thing standing between a slightly-malformed or hallucinated-shape model response and a corrupted row. Gemini additionally gets a structured `responseSchema` passed to the API itself (`gemini.provider.ts`) since `@google/genai` supports constrained JSON generation natively; the OpenAI-compatible providers (Grok, Groq) rely on `response_format: { type: "json_object" }` plus the prompt's own shape instruction, since that's what their APIs support.

## Per-question-type grading

Questions carry a `type: "VERBAL" | "CODING"`, chosen by the model itself per-question in `questionPrompt` based on what actually tests the topic best — not assigned by the app. The client renders a mic+transcript UI for `VERBAL` and a plain code textarea for `CODING` (`InterviewSessionPage.tsx`), and `gradingPrompt` branches its rubric: lenient on phrasing for `VERBAL` (it's a speech-to-text transcript, expect minor mis-transcriptions), strict on logic/edge-cases/complexity for `CODING` (it's typed code with no IDE, but syntax slips are forgivable — getting the algorithm right isn't).

**Lesson learned, worth remembering for any similar "let the model classify/branch" prompt:** the first version of this instruction ("most questions should be VERBAL... occasionally CODING when suited") caused the model to pick `VERBAL` essentially every time, even for a topic literally named "Data structures and algorithms (write code)". Models default to the safer/more common category unless explicitly told not to. The fix was adding a direct line: *"Don't default to VERBAL just because it's safer — pick whichever type actually tests the candidate better for this specific question."* If a future classification-style prompt shows the same lopsided bias, that's the first thing to check.

## Gotcha: Prisma + SQLite has no enum support

Any field that looks like a natural `enum` in `schema.prisma` (we hit this three times: `Difficulty`, `SessionStatus`, `QuestionType`) **cannot** use Prisma's `enum` keyword on SQLite — `prisma migrate dev` fails outright with "the current connector does not support enums." The fix used throughout this codebase: make the column a plain `String`, and hand-roll a const-object + derived type in `server/src/types.ts` for application-level type safety and zod validation, e.g.:

```ts
export const QuestionType = { VERBAL: "VERBAL", CODING: "CODING" } as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];
```

This also means any Prisma query result typed field (e.g. `question.type`) comes back as plain `string`, not the narrowed union — expect to need an `as QuestionType`-style assertion at the point where a raw Prisma field crosses into code that expects the narrowed type (see `session.service.ts` for examples).

**Update:** the app has since migrated to Postgres (see the deploy runbook), where real Prisma enums are available. The hand-rolled `String` + const-object pattern was deliberately **not** reverted back to native enums after the migration — it works fine either way, and touching every file that imports `Difficulty`/`SessionStatus`/`QuestionType` for a purely cosmetic improvement wasn't worth the risk this close to deploy. Fine to revisit post-launch if it bothers whoever's maintaining this, but it's not a problem that needs solving.

## Additive feedback enrichment: breakdown scores and filler-word stats

Two small enhancements layered onto the existing grading flow, both designed to be purely additive so nothing already depending on `Feedback.score` or the answer shape could break:

- **Score breakdown.** `gradingPrompt` now also asks for `correctness`/`clarity`/`depth` (1–10 each) alongside the existing overall `score`. Stored as three new nullable `Int` columns on `Feedback` (`correctnessScore`, `clarityScore`, `depthScore`), serialized into a `breakdown` object only when all three are present (`sessions.controller.ts`'s `serializeFeedback`) — so any old feedback row without them (there shouldn't be any, but defensively) just renders without a breakdown section instead of crashing. The overall `score` field and everything that reads only it (badges, history list, session summary) is completely untouched.
- **Filler-word detection.** `server/src/services/transcriptAnalysis.ts`'s `analyzeFillers` is pure string analysis (regex word-boundary matching against a fixed filler-phrase list) run locally in `session.service.submitAnswer` — no AI call, free, instant. Only runs for `VERBAL` answers (typed `CODING` answers get `fillerStats: null` — filler words don't apply to code). Stored as a JSON-stringified string on `Answer.fillerStats`, same serialize-on-read pattern as everything else in this codebase.

Both shipped together as a response to "what would make this app genuinely better, not just working" — worth remembering that kind of question is worth asking of any practice/coaching-style app: the cheapest, highest-signal additions are often pure-local analysis on data you're already capturing (the transcript was already there; filler-word counting just reads it differently), not new AI calls.
