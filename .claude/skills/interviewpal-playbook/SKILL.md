---
name: interviewpal-playbook
description: Playbook for the InterviewPal project (a mock-interview practice app — pick a topic, answer AI-generated questions, get AI feedback and a session summary). Covers two things, each in its own reference file — a deploy-readiness runbook for shipping this specific app to Vercel with a serverless backend and open public sign-in, and the AI interview-prompt design patterns this codebase uses (provider-agnostic AI layer, history-aware prompts, structured JSON output validated with zod, per-question-type grading rubrics). Use this skill whenever working in the InterviewPal repo and the task touches: preparing for or executing a deploy, migrating the database off SQLite, adding or swapping an AI provider, writing or debugging a question/grading/summary prompt, adding a new question type, or hitting a confusing Prisma+SQLite error about enums. Check the deploy runbook specifically before telling the user the app is ready to ship.
---

# InterviewPal playbook

Two independent references — read whichever one the task actually touches, not both by default.

## references/deploy-runbook.md

A checklist of what still has to happen before InterviewPal can safely go live on Vercel with open (no-allowlist) public sign-in. **As of the most recent session, none of these are done yet** — they were planned but not executed before work got redirected to a feature request. Read this file, check the repo's actual current state against each item (don't trust this note's "not done" claim blindly — things may have moved since), and work through whatever's still outstanding. Each item explains *why* it matters, not just what to do, so judge order and necessity rather than following it as a rigid script.

## references/ai-prompt-patterns.md

The design pattern behind this app's AI layer: how the provider abstraction works, why prompts are built the way they are, how structured output is kept honest, and a couple of gotchas that cost real debugging time this session (a Groq/xAI naming mixup, and Prisma+SQLite's lack of enum support). Read this before adding a new AI provider, touching `server/src/ai/prompts.ts`, or doing anything with question types — it'll save you from re-deriving decisions that were already made deliberately.
