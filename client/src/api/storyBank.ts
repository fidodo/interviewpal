import { api } from "./client";
import { BankEntry, BankSuggestion, Competency, CoverageItem, Fit } from "../story/types";

type EntryInput = { title: string; summary: string; tags: string[] };

export const storyBankApi = {
  list: () => api.get<{ entries: BankEntry[]; coverage: CoverageItem[]; max: number }>("/story-bank"),
  // AI: a title, summary and tags from a Speak story or typed text. Nothing is saved.
  suggest: (body: { storyId: string } | { text: string }) => api.post<{ suggestion: BankSuggestion }>("/story-bank/suggest", body),
  create: (body: EntryInput & { storyId?: string }) => api.post<{ entry: BankEntry }>("/story-bank", body),
  update: (id: string, body: EntryInput) => api.put<{ entry: BankEntry }>(`/story-bank/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`/story-bank/${id}`),
  drill: (competency?: string) =>
    api.get<{ competency: string; question: string; competencies: Competency[] }>(`/story-bank/drill${competency ? `?competency=${encodeURIComponent(competency)}` : ""}`),
  judge: (question: string, entryId: string | null) => api.post<{ fit: Fit }>("/story-bank/drill/judge", { question, entryId }),
};
