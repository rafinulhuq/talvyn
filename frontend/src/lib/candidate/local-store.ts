/**
 * IndexedDB copy of every answer, written on each change, so a reload, crash
 * or dropped connection loses nothing. Records stay "dirty" until the server
 * confirms them; on resume, dirty records win over the server copy.
 * Database and store names are unchanged from the previous frontend, so
 * answers typed before the deploy are still found.
 */
const DB_NAME = "talvyn_candidate_exam_v1";
const STORE = "candidate_answers";

type Row = { compositeKey: string; attemptId: string; questionId: string; value: string; dirty: boolean; timestamp: number };

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: "compositeKey" });
        s.createIndex("by_attempt", "attemptId", { unique: false });
        s.createIndex("by_dirty", "dirty", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// Every function swallows errors: local storage is a safety net, never a reason to fail.
export async function putAnswer(attemptId: string, questionId: string, value: string, dirty = true) {
  const row: Row = { compositeKey: `${attemptId}:${questionId}`, attemptId, questionId, value, dirty, timestamp: Date.now() };
  await run("readwrite", (s) => s.put(row)).catch(() => undefined);
}

/** Marks a record clean only if it still holds the value the server confirmed. */
export async function markClean(attemptId: string, questionId: string, savedValue: string) {
  try {
    const row = await run<Row | undefined>("readonly", (s) => s.get(`${attemptId}:${questionId}`));
    if (row && row.value === savedValue && row.dirty) await putAnswer(attemptId, questionId, savedValue, false);
  } catch {
    /* ignore */
  }
}

export async function dirtyAnswers(attemptId: string): Promise<Record<string, string>> {
  try {
    const rows = await run<Row[]>("readonly", (s) => s.index("by_attempt").getAll(IDBKeyRange.only(attemptId)));
    return Object.fromEntries(rows.filter((r) => r.dirty).map((r) => [r.questionId, r.value]));
  } catch {
    return {};
  }
}

export async function clearAttempt(attemptId: string) {
  try {
    const keys = await run<IDBValidKey[]>("readonly", (s) => s.index("by_attempt").getAllKeys(IDBKeyRange.only(attemptId)));
    await Promise.all(keys.map((k) => run("readwrite", (s) => s.delete(k))));
  } catch {
    /* ignore */
  }
}
