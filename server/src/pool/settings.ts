import { prisma } from "../db/prisma";

// App-wide switches stored in the database (AppSetting), so the admin can flip them without a redeploy.
// "pool.serve": serve questions from the shared pool. Off unless the admin turns it on; off means today's AI path.
export const SERVE_POOL = "pool.serve";

// Read on every question request, so cached briefly per instance; a change shows within this time.
const CACHE_MS = 15_000;
const cache = new Map<string, { value: string | null; at: number }>();

export async function getSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const row = await prisma.appSetting.findUnique({ where: { key } });
  cache.set(key, { value: row?.value ?? null, at: Date.now() });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  cache.set(key, { value, at: Date.now() });
}

// Never throws: if the setting can't be read (database hiccup), the pool is treated as off, which is today's behaviour.
export async function poolServing(): Promise<boolean> {
  try {
    return (await getSetting(SERVE_POOL)) === "on";
  } catch (err) {
    console.error("Couldn't read the pool switch, serving without the pool:", err);
    return false;
  }
}
