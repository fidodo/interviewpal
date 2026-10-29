const MAX_PASTED_CHARS = 5000;

export function levelLabel(level: string) {
  return level === "INTERMEDIATE" ? "mid-level" : level.toLowerCase();
}

function pasted(label: string, text: string | null | undefined) {
  return text?.trim() ? [`${label}:`, text.trim().slice(0, MAX_PASTED_CHARS), ``] : [];
}

export function skillsPrompt(params: {
  title: string;
  level: string;
  jobDescription?: string | null;
  cvSummary?: string | null;
  existingSkills?: string[];
}): string {
  const { title, level, jobDescription, cvSummary, existingSkills } = params;
  return [
    `You are a hiring manager and career coach. Someone is preparing to get hired as a ${levelLabel(level)} "${title}".`,
    `List the 8-12 skills that interviews for this role actually test and that the job needs: a mix of technical or hard skills, domain knowledge, and behavioural skills (communication, ownership, stakeholder management, etc.). Any job is possible, not only software roles.`,
    ``,
    ...pasted("The job description they're targeting (weight skills it emphasises more heavily)", jobDescription),
    ...pasted("Their CV or experience summary", cvSummary),
    existingSkills?.length ? `They already track these skills; keep the same names for any that still apply: ${existingSkills.join("; ")}.\n` : ``,
    `For each skill give:`,
    `- "name": 1-4 words, specific (e.g. "RAG pipelines", "SQL query tuning", "Patient triage", "Stakeholder updates"), not vague ("Technical skills").`,
    `- "category": "TECHNICAL" (hard or tool skills), "DOMAIN" (knowledge of the field) or "BEHAVIOURAL".`,
    `- "importance": 3 = core to the role, 2 = important, 1 = nice to have.`,
    `- "description": one sentence on what being good at it looks like for this role.`,
    `- "suggestedRating": ${cvSummary?.trim() ? `your 1-5 estimate of their current level from the CV (1 = no evidence, 5 = expert), or null if the CV says nothing about it.` : `null (no CV was given).`}`,
    `Also set "isTechnical": true if interviews for this role normally include writing code, otherwise false.`,
    ``,
    `Respond ONLY with JSON of the shape: { "isTechnical": boolean, "skills": [{ "name": string, "category": "TECHNICAL" | "DOMAIN" | "BEHAVIOURAL", "importance": 1 | 2 | 3, "description": string, "suggestedRating": number | null }] }`,
  ].join("\n");
}

export function goalsPrompt(params: {
  title: string;
  level: string;
  targetDate: Date | null;
  skills: { name: string; description: string; rating: number | null }[];
}): string {
  const { title, level, targetDate, skills } = params;
  const deadline = targetDate ? `They want to be ready by ${targetDate.toISOString().slice(0, 10)}.` : ``;
  return [
    `You are a career coach. Someone is preparing to get hired as a ${levelLabel(level)} "${title}". ${deadline}`,
    `These are their weakest skills right now (rating out of 5, or unrated):`,
    ...skills.map((s) => `- ${s.name} (${s.rating == null ? "unrated" : s.rating.toFixed(1)}): ${s.description}`),
    ``,
    `Write exactly one goal per skill for THIS week, each under 40 words. Each goal must be concrete, doable in 2-4 hours, and end in something they can show or check off (e.g. "Build a small RAG demo over 10 PDFs and write down 3 failure cases", "Write 3 STAR stories about handling conflict and practise one aloud"). No vague goals like "learn more about X".`,
    ``,
    `Respond ONLY with JSON of the shape: { "goals": [{ "skill": string (exactly one of the skill names above), "text": string }] }`,
  ].join("\n");
}
