---
name: interviewpal-ui-review
description: UI/UX and accessibility (WCAG 2.2 AA) review for the InterviewPal client — runs an automated axe-core audit on every route in light/dark at phone and desktop widths, takes screenshots, and checks design-token use, focus, landmarks, live regions, touch targets, and reduced motion. Use whenever the user asks for a UI review, UX review, design review, accessibility/a11y/WCAG check, contrast check, "does this look good", or after any change to client/src/styles.css, a page, or a component — even if they only mention one page.
---

# InterviewPal UI review

## 1. Run the automated audit

Start both dev servers if they aren't running: `npm run dev` in `server/` and `client/`. Note the Vite port, because it may not be 5173 if older processes hold the port. On Windows, stale `tsx watch` processes can hold port 4000. That's fine as long as `GET /api/health` answers.

Use `scripts/audit.mjs` (bundled with this skill). Copy it into a scratch directory, then run:

```
npm i playwright@1.48.2 @axe-core/playwright@4.10.1
BASE=http://localhost:<vite-port> OUT=./shots node audit.mjs
```

Notes on what the script does:
- It uses the system Chrome (`channel: "chrome"`), so no browser download is needed.
- It registers a throwaway `a11y-audit-*@example.com` account, creates one finished session and one in-progress session, and runs axe (WCAG 2.0/2.1/2.2 A+AA tags) on these pages: login, dashboard, history, summary, session with the guide dialog open, and session.
- Each page is audited in light and dark mode at 360px and 1280px, and screenshotted.
- It prints the violations and writes `shots/results.json`.

**Mind the rate limits:** the server's `authLimiter` allows 10 register/login calls per 15 minutes per IP, and `aiLimiter` allows 30 AI calls per hour. Each audit run registers one account and makes about 3 AI calls. Don't loop the audit. If you need extra browser checks, log in once, save `storageState`, and reuse it. Otherwise you'll lock yourself out for 15 minutes.

**Testing speech features:** headless Chrome has no usable microphone. Stub **both** `window.SpeechRecognition` and `window.webkitSpeechRecognition` via `addInitScript`; the hook checks the unprefixed one first. Have the stub fire scripted `onresult`/`onend` events. To exercise the mobile code path, set an Android `userAgent` on the context.

**Clean up afterwards:** delete the test account. `User → InterviewSession` is RESTRICT, so delete sessions first. Run this from `server/` with `npx tsx <file>.ts`, then delete the file. Wrap the calls in `main()`, because the server is CJS and tsx rejects top-level `await`.

```ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const where = { email: { startsWith: "a11y-audit-" } };
  await prisma.interviewSession.deleteMany({ where: { user: where } });
  await prisma.user.deleteMany({ where });
}
main().finally(() => prisma.$disconnect());
```

## 2. Look at the screenshots

Read the PNGs. Automated tools catch about 30–40% of real issues, so look for:
- **Hierarchy:** one clear primary action per screen, a readable heading scale, consistent spacing.
- **Phone width (360px):** no horizontal scroll, nothing clipped, wrapped buttons still read well, and the bottom sheet scrolls.
- **Dark mode:** no hard-coded light colors leaking through, and text on primary stays readable.
- The background stays near-white (`--bg: #ffffff`). The user explicitly disliked a tinted grey-blue background.

## 3. Manual checklist (the parts axe can't judge)

- **Tokens:** components use CSS variables from `:root` in `client/src/styles.css`. The only raw hex allowed is the fixed score-badge shades (white text needs ≥ 4.5:1 in both themes). Grep for `#` in `client/src/**/*.tsx`.
- **Keyboard:**
  - Tab through each page. The skip link appears first and the focus ring (`:focus-visible`) is always visible.
  - The guide `<dialog>` traps focus, Esc closes it, and focus returns to the trigger.
- **Names and state:**
  - Icon-only buttons have an `aria-label`.
  - Toggle buttons use `aria-pressed`.
  - Spinner-only buttons include visually-hidden text.
  - Score badges read "Score N out of 10".
- **Announcements:**
  - Errors use `role="alert"`.
  - Mic, countdown, and mic-test status use `aria-live="polite"`.
  - Loading text uses `role="status"`.
- **Targets:** interactive elements are ≥ 44px tall on touch, and ≥ 24px at minimum (WCAG 2.5.8).
- **Motion:** every animation sits inside `@media (prefers-reduced-motion: no-preference)`. Emulate `reducedMotion: "reduce"` in Playwright to confirm nothing moves.
- **Forms:** every input has a real `<label>` (it may be `.visually-hidden`). Placeholders are never the only label.

## Output

1. A findings table, ordered most severe first:

   | Severity | Page / component | WCAG criterion or UX principle | Issue | Fix |

2. The axe violation count before and after.
3. Two or three screenshots worth showing the user.

If asked to fix: apply the fixes, re-run the audit until there are 0 violations, then re-check the screenshots.
