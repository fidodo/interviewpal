---
name: interviewpal-playbook
description: Playbook for the InterviewPal project (a mock-interview practice app — pick a topic, answer AI-generated questions, get AI feedback and a session summary). Covers two things, each in its own reference file — a deploy-readiness runbook for shipping this specific app to Vercel with a serverless backend and open public sign-in (tracks exactly which items are done vs still outstanding, and updates as work continues — don't assume it's all pending), and the AI interview-prompt design patterns this codebase uses (provider-agnostic AI layer, history-aware prompts, structured JSON output validated with zod, per-question-type grading rubrics, additive feedback enrichment). Use this skill whenever working in the InterviewPal repo and the task touches: preparing for, continuing, or executing a deploy, checking what deploy-prep work remains, migrating the database, adding or swapping an AI provider, writing or debugging a question/grading/summary prompt, adding a new question type, or hitting a confusing Prisma enum error. Check the deploy runbook specifically before telling the user the app is ready to ship, or before picking up where a prior session left off.
---

# InterviewPal playbook

Two independent references — read whichever one the task actually touches, not both by default.

## references/deploy-runbook.md

A checklist of what has to happen before InterviewPal can safely go live on Vercel with open (no-allowlist) public sign-in, with each item marked done or outstanding as of the date at the top of that file. Read this file first whenever resuming deploy work or checking readiness — its status markers tell you exactly where things stand, but **verify against the actual repo state rather than trusting the markers blindly**, since they're updated by whoever did the work and could lag behind further changes. Each item explains *why* it matters, not just what to do, so judge order and necessity rather than following it as a rigid script. Two items (production env wiring, pushing to a git remote) need user input to finish — don't attempt them solo.

## references/ai-prompt-patterns.md

The design pattern behind this app's AI layer: how the provider abstraction works, why prompts are built the way they are, how structured output is kept honest, and a few gotchas that cost real debugging time (a Groq/xAI naming mixup, Prisma enum handling, a model's bias toward "safe" classification defaults). Read this before adding a new AI provider, touching `server/src/ai/prompts.ts`, or doing anything with question types or feedback shape — it'll save you from re-deriving decisions that were already made deliberately.
