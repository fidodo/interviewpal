import { createHash } from "node:crypto";

// Where the question pool's update imports real interview questions from. Only sources whose licence is on
// ALLOWED_LICENCES are read; the licence is re-checked at every new commit, and a source that changes to anything
// else is refused (items already taken stay, under the licence they were taken under). Only question text is
// taken, never answers. Credits are shown with each question and listed in THIRD_PARTY_NOTICES.md.
export const ALLOWED_LICENCES = ["MIT", "Apache-2.0", "CC0-1.0", "CC-BY-4.0"] as const;

export interface PoolSourceDef {
  id: string;
  repo: string;
  label: string;
  licence: string;
  // Files to read: every Markdown file under this folder.
  folder: string;
  // Headings whose bullet points are questions to import (other sections, e.g. coding tasks, are skipped).
  sections: RegExp;
  // Turns a file name into who reported the question, for the credit line ("Google").
  reportedBy?: (path: string) => string | null;
}

export const POOL_SOURCES: PoolSourceDef[] = [
  {
    id: "feih-companies",
    repo: "yangshun/front-end-interview-handbook",
    label: "Front End Interview Handbook",
    licence: "MIT",
    folder: "website/contents/companies/",
    // Spoken quiz questions only: the coding and UI tasks need a runnable spec, which the AI-written items carry.
    sections: /quiz/i,
    reportedBy: (path) => {
      const name = path.split("/").pop()?.replace(/-front-end-interview-questions\.mdx?$/, "") ?? "";
      if (!name) return null;
      return name
        .split("-")
        .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
        .join(" ");
    },
  },
];

export function isAllowedLicence(spdx: string | null | undefined): boolean {
  return !!spdx && (ALLOWED_LICENCES as readonly string[]).includes(spdx);
}

// The bullet points under matching headings, cleaned up: links reduced to their text, code marks dropped, and
// anything too short or long to be a question skipped.
export function sectionBullets(markdown: string, sections: RegExp): string[] {
  const out: string[] = [];
  let inSection = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      inSection = sections.test(heading[1]);
      continue;
    }
    if (!inSection) continue;
    const bullet = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (!bullet) continue;
    const text = bullet[1]
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\*\*|__/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= 12 && text.length <= 400) out.push(text);
  }
  return out;
}

// Same question, however it's punctuated or capitalised: lowercase words only.
export function normaliseQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function questionChecksum(kind: string, text: string): string {
  return createHash("sha256").update(`${kind}:${normaliseQuestion(text)}`).digest("hex");
}
