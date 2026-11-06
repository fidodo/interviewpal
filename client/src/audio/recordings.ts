// Recordings of your own answers, kept only in this browser (IndexedDB). They're never uploaded, so they cost
// nothing to store and nothing private leaves the device. Old ones are pruned after RETENTION_DAYS.

const DB_NAME = "interviewpal-audio";
const STORE = "recordings";
export const RETENTION_DAYS = 30;
const PREF_KEY = "keep-recordings";

interface StoredRecording {
  key: string;
  blob: Blob;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB isn't available"));
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "key" });
      store.createIndex("createdAt", "createdAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// Every helper fails quietly: a recording is a nice-to-have, never a reason for a page to break.
export async function saveRecording(key: string, blob: Blob) {
  try {
    await run("readwrite", (s) => s.put({ key, blob, createdAt: Date.now() } satisfies StoredRecording));
    void pruneRecordings();
  } catch {
    // Storage full, private mode or blocked: the recording just isn't kept.
  }
}

export async function getRecording(key: string): Promise<Blob | null> {
  try {
    const found = await run<StoredRecording | undefined>("readonly", (s) => s.get(key));
    return found && Date.now() - found.createdAt < RETENTION_DAYS * 86_400_000 ? found.blob : null;
  } catch {
    return null;
  }
}

export async function deleteRecording(key: string) {
  try {
    await run("readwrite", (s) => s.delete(key));
  } catch {
    // Nothing to do.
  }
}

export async function pruneRecordings() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).index("createdAt").openCursor(IDBKeyRange.upperBound(cutoff));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Nothing to do.
  }
}

// Whether to keep recordings at all (on by default; the checkbox next to the mic changes it).
export function keepRecordings(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "0";
  } catch {
    return false;
  }
}

export function setKeepRecordings(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch {
    // Not remembered.
  }
}

export function canRecord(): boolean {
  return typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia && "indexedDB" in window;
}
