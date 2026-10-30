import { createHash } from "crypto";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { retryOnRateLimit } from "./retry";

// Embeddings come from Gemini whatever AI_PROVIDER is (Groq has no embeddings API). Without a Gemini key they're
// unavailable and callers get `null` from `embeddingsEnabled`.
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
const BATCH = 100;

export type EmbedKind = "document" | "query";
const TASK_TYPE: Record<EmbedKind, string> = { document: "RETRIEVAL_DOCUMENT", query: "RETRIEVAL_QUERY" };

export const embeddingsEnabled = () => Boolean(env.gemini.apiKey);

let client: GoogleGenAI | null = null;

const hashOf = (kind: EmbedKind, text: string) => createHash("sha256").update(`${EMBEDDING_MODEL}|${EMBEDDING_DIMENSIONS}|${kind}|${text}`).digest("hex");
const toBytes = (v: number[]) => Buffer.from(new Float32Array(v).buffer);
const fromBytes = (b: Uint8Array) => Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4));

// Truncated Gemini embeddings aren't unit length; normalising makes dot product equal cosine similarity.
function normalise(v: number[]) {
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

// Embeds texts, using the cache first. `beforeMiss(count)` runs before any texts are sent to the model (e.g. to
// charge a budget) and can throw to stop. Returns vectors in input order plus how many came from the cache.
export async function embedTexts(texts: string[], kind: EmbedKind, beforeMiss?: (count: number) => Promise<void>) {
  const hashes = texts.map((t) => hashOf(kind, t));
  const cached = await prisma.embeddingCache.findMany({ where: { hash: { in: [...new Set(hashes)] } } });
  const found = new Map(cached.map((c) => [c.hash, fromBytes(c.vector)]));
  const cachedCount = hashes.filter((h) => found.has(h)).length;
  const missing = [...new Set(hashes.filter((h) => !found.has(h)))];

  if (missing.length) {
    await beforeMiss?.(missing.length);
    client ??= new GoogleGenAI({ apiKey: env.gemini.apiKey });
    const textByHash = new Map(hashes.map((h, i) => [h, texts[i]]));
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const res = await retryOnRateLimit(() =>
        client!.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: batch.map((h) => textByHash.get(h)!),
          config: { taskType: TASK_TYPE[kind], outputDimensionality: EMBEDDING_DIMENSIONS },
        })
      );
      const vectors = (res.embeddings ?? []).map((e) => normalise(e.values ?? []));
      if (vectors.length !== batch.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) throw new Error("Unexpected embedding response");
      batch.forEach((h, j) => found.set(h, vectors[j]));
      await prisma.embeddingCache.createMany({ data: batch.map((h, j) => ({ hash: h, vector: toBytes(vectors[j]) })), skipDuplicates: true });
    }
  }
  return { vectors: hashes.map((h) => found.get(h)!), cached: cachedCount };
}
