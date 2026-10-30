import { api } from "./client";
import { Story, StoryKind, StorySummary } from "../story/types";

export const storyApi = {
  list: () => api.get<{ stories: StorySummary[] }>("/story"),
  create: (body: { kind: StoryKind; topic: string | null; audience: string | null; targetSeconds: number }) => api.post<{ story: { id: string } }>("/story", body),
  get: (id: string) => api.get<{ story: Story }>(`/story/${id}`),
  // durationSec is the time actually recorded; null for a typed take.
  submitTake: (id: string, transcript: string, durationSec: number | null) => api.post<{ story: Story }>(`/story/${id}/takes`, { transcript, durationSec }),
  remove: (id: string) => api.del<{ ok: true }>(`/story/${id}`),
};
