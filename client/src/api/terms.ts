import { api } from "./client";
import { Difficulty } from "../types";
import { MyTerm, StarterDeck, TermAnswer, TermCardData, TermResult, TermReveal, TermsSummary } from "../terms/types";

const review = (termId: string) => `/terms/review/${encodeURIComponent(termId)}`;

export const termsApi = {
  summary: () => api.get<{ summary: TermsSummary }>("/terms/summary"),
  list: () => api.get<{ terms: MyTerm[]; summary: TermsSummary }>("/terms"),
  decks: () => api.get<{ decks: StarterDeck[] }>("/terms/decks"),
  addDeck: (deck: string) => api.post<{ added: number }>(`/terms/decks/${encodeURIComponent(deck)}/add`),
  generate: (topic: string, level: Difficulty | null) => api.post<{ added: number; skipped: number; deck: string }>("/terms/generate", { topic, level }),
  add: (term: string, context: string | null) => api.post<{ term: { id: string; term: string } }>("/terms", { term, context }),
  remove: (id: string) => api.del<{ ok: true }>(`/terms/${encodeURIComponent(id)}`),
  next: (ahead: boolean) => api.get<{ card: TermCardData | null; summary: TermsSummary }>(`/terms/review${ahead ? "?ahead=1" : ""}`),
  recognise: (termId: string, chosen: string) => api.post<TermAnswer>(`${review(termId)}/recognise`, { chosen }),
  reveal: (termId: string) => api.get<{ reveal: TermReveal }>(`${review(termId)}/reveal`),
  rateRecall: (termId: string, result: TermResult) => api.post<TermAnswer>(`${review(termId)}/recall`, { result }),
  markRecall: (termId: string, answer: string) => api.post<TermAnswer>(`${review(termId)}/recall/mark`, { answer }),
  use: (termId: string, transcript: string) => api.post<TermAnswer>(`${review(termId)}/use`, { transcript }),
};
