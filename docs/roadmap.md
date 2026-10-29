# InterviewPal roadmap

Agreed on 2026-10-29. Each phase ships on its own, after a code review and a UI/accessibility review (`interviewpal-code-review` and `interviewpal-ui-review`), before the next phase starts.

## Direction

InterviewPal becomes a tool for getting a specific job. It is built around a **target role**, which can be any job, with tech roles as polished presets. One target role drives three things:

- **Interview mastery:** practice questions and full mock interviews for that role.
- **Learning:** short courses for the skills the role needs.
- **Gap planning:** which skills you lack, how far off you are, and what to do this week.

**Audience:** the owner plus a small invited group. Sign-up stays open, with email verification and a daily AI allowance per account.

## Phase 1: security fixes (done 2026-10-29)

Two changes from the plan below came out of the code review:
- Plain "Log out" signs out only this browser, so a parent logging out doesn't kick a child's tablet out of kid mode. "Log out on all devices" revokes every session.
- The 4 custom topics no session had used were kept and given to the admin account, not deleted.

**Accounts and login**

- **Close the Google takeover hole.** Today, an attacker can register a victim's email with a password before the victim signs up; the victim's later Google sign-in then joins the attacker's account. Fix: when Google signs in to an *unverified* account that has a password, wipe the password and mark the account verified. Google sign-ins always count as verified.
- **Email verification and password reset through Resend.** It must keep working without `RESEND_API_KEY`:
  - accounts are created as unverified
  - in local dev, links are logged to the server console
  - "forgot password" explains that email isn't set up yet
  - adding the key turns emails on with no code change
- **Logout invalidates the token** (a token version on the user), plus "log out everywhere".
- **Delete my account** removes everything, including sessions, kids data, roles and pasted CV/job description text.

**Abuse and cost**

- **Custom topics are private to their owner.** Today they're global and visible to every user.
- **Rate limits are stored in the database** instead of each Vercel instance's memory, and `trust proxy` is set so IP limits use the real client IP.
- **Daily AI allowance:** 50 calls a day per account for interviews and learning, 60 a day for kids. Accounts with the admin flag (the owner) are exempt. A friendly "come back tomorrow" message at the limit.

**Hardening**

- **Security headers on the client** in `client/vercel.json`: CSP, frame-ancestors and referrer policy. The CSP must allow Google sign-in and the Pyodide CDN.
- **Upgrade vulnerable packages:** `zod` on the server (high severity) and `react-router` on the client (moderate).

## Phase 2: target roles and skills (done 2026-10-29)

How it differs from the plan below:
- "Quick practice" stays a free choice of track and topic. It doesn't default to the active role; "Practise my weakest skill" on the home hub covers that.
- "Full mock interview" appears on the hub as coming soon (Phase 3).

- **Target role profiles.** Each has a title (free text, any job), a level (junior, mid or senior), an optional target date, an optional pasted **job description** and an optional pasted **CV or experience summary**.
  - The job description and CV are **optional**: everything works without them, just less precisely.
  - A note beside the paste boxes says the text is stored in the database and sent to the AI provider. It can be edited or deleted at any time.
- **Several roles** per user, with one active at a time.
- **Skills list:** the AI generates it from the role, level, job description and CV. The user self-rates each skill 1–5.
- **Interview evidence updates ratings.** Each question is tagged with the skills it tests, and its score adjusts those skill ratings.
- **Gap plan:** the weakest skills, each with a short weekly goal you can tick off.
- **New home page for the active role:**
  - a readiness score (skill ratings weighted toward the job)
  - skill ratings over time
  - this week's goals
  - one-click "Practice weakest skill" and "Full mock interview"
- **The current Track/Topic picker becomes "Quick practice."** It defaults to the active role and its weakest skill, and can still pick any topic. Existing sessions and history are kept.
- The coding answer box only appears for technical roles.

## Phase 3: full mock interview (done 2026-10-29)

How it differs from the plan below: the closing "what would you ask us?" round is graded, but it doesn't change skill ratings, because it measures interview etiquette rather than a job skill.

- About **5 questions**: 2 behavioural, 2 role-specific or technical, and 1 closing "what would you ask us?".
- Voice or typing for each answer.
- **No feedback until the end**, like a real interview.
- **Final report:** a verdict (hire, lean hire or no hire), scores per round, and the skills updated.
- Single-question practice mode stays as it is, with instant feedback.

## Phase 4: "Learn this" courses (done 2026-10-29)

How it differs from the plan below:
- The adult courses follow the kids engine's structure (course, lessons, questions) in their own tables, because the kids tables belong to child profiles.
- Instead of hints, every answer gets an explanation, and written answers get AI feedback.

- Each skill in the gap plan gets a **"Learn this"** course: short lessons plus practice questions. It's built on the kids course engine (levels, challenges, hints) with an adult tone.
- **Spaced repetition:** questions you got wrong come back after a few days.
- You can also start a course on any topic outside the plan.

## Phase 5: extras (1 and 2 done 2026-10-29, plus debug practice)

What was built:
- **Runnable coding answers:** Python and JavaScript, run in the browser against AI-written test cases. The score feeds into grading.
- **Personas:** Balanced, Friendly startup, and Big Tech (strict).
- **Debug practice (added by request):**
  - The AI writes realistic broken code in a chosen stack; you fix it, explain the root cause and get graded. Hints cost about a point each.
  - Python and JavaScript fixes run against tests. Other stacks (TypeScript, React, Java, C#, Go, SQL, PHP, Ruby, Kotlin, C++) are graded by the AI reading the fix.
- **Not yet built:** system design (item 3).
- **Possible later work:**
  - Server-side execution for the reviewed-only stacks (needs a sandbox service).
  - Checking AI-written debug tests against the reference fix before showing them.

1. **Runnable coding answers.** Reuse the kids section's in-browser Pyodide runner, with test cases.
2. **Interviewer personas.** For example "Big Tech, strict" or "Startup, friendly".
3. **System design** with a diagram canvas (later, since it's a big build).

## Version 2 (not scheduled)

- **Monetisation.** A section on the home (login) page explaining what InterviewPal does, how it helps, and pricing tiers. Likely paired with a higher AI allowance for paid plans.

## Unchanged

- The kids section (`/kids`) stays as built. It has its own AI budget and is unaffected by the target-role work.
