import { PresetDeck } from "./types";
import { frontend } from "./frontend";
import { backend } from "./backend";
import { fullstack } from "./fullstack";
import { aiEngineering } from "./ai-engineering";

// Starter decks for Terms (server/src/terms). To add or reword terms, edit these files and run `npm run prisma:seed`:
// terms are upserted by presetKey ("<slug>:<term>"), so wording changes update in place and learners keep progress.
export const TERM_DECKS: PresetDeck[] = [frontend, backend, fullstack, aiEngineering];

export const presetKey = (deck: PresetDeck, term: string) =>
  `${deck.slug}:${term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
