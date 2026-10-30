import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5175";
const OUT = process.env.OUT ?? "./shots";
const EMAIL = process.env.EMAIL ?? `a11y-audit-${Date.now()}@example.com`;
const PASSWORD = "a11y-audit-pass-123";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const results = [];

async function audit(page, name) {
  await page.waitForTimeout(1200); // let reveal animations finish
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  results.push({ name, violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) })) });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

// One account + one session with a graded answer, reused across all variants.
const setupCtx = await browser.newContext();
const api = setupCtx.request;
let res = await api.post(`${BASE}/api/auth/register`, { data: { email: EMAIL, password: PASSWORD } });
if (!res.ok()) throw new Error(`register failed ${res.status()} ${await res.text()}`);
const topics = await (await api.get(`${BASE}/api/topics?track=Frontend`)).json();
const topicId = topics.topics[0].id;
const s1 = (await (await api.post(`${BASE}/api/sessions`, { data: { topicId, track: "Frontend", difficulty: "JUNIOR" } })).json()).session.id;
const q1 = (await (await api.post(`${BASE}/api/sessions/${s1}/questions`)).json()).question;
await api.post(`${BASE}/api/questions/${q1.id}/answer`, { data: { transcript: "def solve(): return 42  # It uses a simple approach and handles edge cases." } });
await api.post(`${BASE}/api/sessions/${s1}/end`);
const s2 = (await (await api.post(`${BASE}/api/sessions`, { data: { topicId, track: "Frontend", difficulty: "JUNIOR" } })).json()).session.id;
await api.post(`${BASE}/api/sessions/${s2}/questions`);
// Kids section: one learner and one AI-generated challenge (uses the kids AI limiter, not the interview one).
const childId = (await (await api.post(`${BASE}/api/kids/children`, { data: { displayName: "Audit", age: 11, avatar: "owl" } })).json()).child.id;
const kidChallenge = (await (await api.post(`${BASE}/api/kids/children/${childId}/courses/coding-python/challenges`, { data: {} })).json()).challenge.id;
// System design: one AI-written question to audit the canvas page.
const designId = (await (await api.post(`${BASE}/api/design`, { data: { level: "JUNIOR" } })).json()).challenge.id;
const storage = await setupCtx.storageState();

for (const scheme of ["light", "dark"]) {
  for (const width of [360, 1280]) {
    const tag = `${scheme}-${width}`;
    const anon = await browser.newContext({ colorScheme: scheme, viewport: { width, height: 900 } });
    const p0 = await anon.newPage();
    await p0.goto(`${BASE}/login`);
    await audit(p0, `login-${tag}`);
    await anon.close();

    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height: 900 }, storageState: storage });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await audit(page, `dashboard-${tag}`);
    await page.goto(`${BASE}/history`);
    await audit(page, `history-${tag}`);
    await page.goto(`${BASE}/sessions/${s1}/summary`);
    await audit(page, `summary-${tag}`);
    await page.goto(`${BASE}/sessions/${s2}`);
    await page.waitForSelector("dialog[open]");
    await audit(page, `session-guide-${tag}`);
    await page.keyboard.press("Escape");
    await audit(page, `session-${tag}`);
    await page.goto(`${BASE}/design`);
    await audit(page, `design-${tag}`);
    await page.goto(`${BASE}/design/${designId}`);
    await page.waitForSelector(".dg-svg");
    await audit(page, `design-canvas-${tag}`);
    await page.goto(`${BASE}/kids/parent`);
    await page.waitForSelector("h1");
    await audit(page, `kids-parent-${tag}`);
    await page.goto(`${BASE}/kids/learn/${childId}`);
    await page.waitForSelector(".course-card");
    await audit(page, `kids-courses-${tag}`);
    await page.goto(`${BASE}/kids/learn/${childId}/coding-python`);
    await page.waitForSelector(".level-node");
    await audit(page, `kids-levels-${tag}`);
    await page.goto(`${BASE}/kids/challenge/${kidChallenge}`);
    await page.waitForSelector(".blocklySvg");
    await audit(page, `kids-challenge-${tag}`);
    await ctx.close();
  }
}

await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ email: EMAIL, results }, null, 2));
const total = results.reduce((n, r) => n + r.violations.length, 0);
console.log(`account: ${EMAIL}`);
for (const r of results) {
  if (r.violations.length) console.log(`\n${r.name}:`, JSON.stringify(r.violations, null, 1));
}
console.log(`\nTOTAL violations: ${total}`);
