import { ComponentType, lazy } from "react";

// After a deploy, a tab opened earlier still asks for the old version's code files, which no longer exist, so the
// import fails and the page would go blank. On that failure we reload once, which fetches the new version. The
// timestamp stops a reload loop: if the code still won't load right after a reload, the error goes to the
// PageErrorBoundary, which offers a Reload button instead of a blank page.
const RELOAD_KEY = "chunk-reload-at";
const LOOP_GUARD_MS = 10_000;

export function isChunkLoadError(err: unknown) {
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unable to preload CSS|MIME type/i.test(message);
}

// Reloads the page to pick up a new version, unless we just did. Returns false if it didn't reload.
export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < LOOP_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // No sessionStorage: reloading without a guard could loop, so don't.
    return false;
  }
  window.location.reload();
  return true;
}

// React.lazy, plus the reload-once recovery above.
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err) => {
      // While the page reloads, stay suspended (the loading state shows) rather than flashing an error.
      if (isChunkLoadError(err) && reloadForNewVersion()) return new Promise<{ default: T }>(() => {});
      throw err;
    })
  );
}
