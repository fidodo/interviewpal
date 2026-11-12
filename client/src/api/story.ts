import { api } from "./client";
import { DrillInfo, DrillKind, Framework, Story, StoryKind, StorySummary, Turn, VoiceStats } from "../story/types";

export const storyApi = {
  list: () => api.get<{ stories: StorySummary[]; frameworks: Framework[]; drills: DrillInfo[]; maxTakes: number }>("/story"),
  // A 1-minute drill: the prompt comes from a fixed list, so no AI call.
  createDrill: (kind: DrillKind) => api.post<{ story: { id: string } }>("/story/drill", { kind }),
  create: (body: { kind: StoryKind; topic: string | null; audience: string | null; targetSeconds: number }) => api.post<{ story: { id: string } }>("/story", body),
  get: (id: string) => api.get<{ story: Story }>(`/story/${id}`),
  // durationSec is the time actually recorded; null for a typed take.
  // voice: pauses, pitch range and trail-off measured in this browser from the recording (never the audio itself).
  // A conversation sends its turns instead of a transcript.
  submitTake: (id: string, transcript: string | null, durationSec: number | null, voice: VoiceStats | null = null, turns: Turn[] | null = null) =>
    api.post<{ story: Story }>(`/story/${id}/takes`, { ...(turns ? { turns } : { transcript }), durationSec, voice }),
  // The other person's next line in a conversation (AI). turnsLeft: how many more times you can answer.
  reply: (id: string, turns: Turn[]) => api.post<{ reply: string; turnsLeft: number }>(`/story/${id}/reply`, { turns }),
  // Starts (or returns) the next round of a story whose takes are all used. No AI call.
  again: (id: string) => api.post<{ story: { id: string } }>(`/story/${id}/again`),
  remove: (id: string) => api.del<{ ok: true }>(`/story/${id}`),
};
