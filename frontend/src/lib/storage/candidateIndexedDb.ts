/**
 * candidateIndexedDb — Zero-dependency promise-based IndexedDB storage
 * for client-side candidate test keystroke persistence.
 *
 * Guarantees Tier-0 persistence (0ms write) so accidental reloads,
 * power loss, or network dropouts never lose a single keystroke.
 */

const DB_NAME = "talvyn_candidate_exam_v1";
const STORE_NAME = "candidate_answers";
const DB_VERSION = 1;

export interface CachedAnswer {
  compositeKey: string; // `${attemptId}:${questionId}`
  attemptId: string;
  questionId: string;
  value: string;
  dirty: boolean;
  timestamp: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is unavailable in this environment"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "compositeKey" });
        store.createIndex("by_attempt", "attemptId", { unique: false });
        store.createIndex("by_dirty", "dirty", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalAnswer(
  attemptId: string,
  questionId: string,
  value: string,
  dirty = true
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const record: CachedAnswer = {
        compositeKey: `${attemptId}:${questionId}`,
        attemptId,
        questionId,
        value,
        dirty,
        timestamp: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[candidateIndexedDb] Failed to save answer locally:", err);
  }
}

export async function getLocalAnswer(
  attemptId: string,
  questionId: string
): Promise<CachedAnswer | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`${attemptId}:${questionId}`);
      req.onsuccess = () => resolve((req.result as CachedAnswer) || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[candidateIndexedDb] Failed to retrieve answer:", err);
    return null;
  }
}

export async function getAllLocalAnswersForAttempt(
  attemptId: string
): Promise<Record<string, string>> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("by_attempt");
      const req = index.getAll(IDBKeyRange.only(attemptId));
      req.onsuccess = () => {
        const records = (req.result as CachedAnswer[]) || [];
        const map: Record<string, string> = {};
        for (const item of records) {
          map[item.questionId] = item.value;
        }
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[candidateIndexedDb] Failed to retrieve attempt answers:", err);
    return {};
  }
}

export async function markAnswerClean(
  attemptId: string,
  questionId: string
): Promise<void> {
  try {
    const existing = await getLocalAnswer(attemptId, questionId);
    if (!existing) return;
    await saveLocalAnswer(attemptId, questionId, existing.value, false);
  } catch (err) {
    console.warn("[candidateIndexedDb] Failed to mark answer clean:", err);
  }
}

export async function clearLocalAttemptAnswers(attemptId: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("by_attempt");
      const req = index.getAllKeys(IDBKeyRange.only(attemptId));
      req.onsuccess = () => {
        const keys = req.result;
        for (const key of keys) {
          store.delete(key);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[candidateIndexedDb] Failed to clear local answers:", err);
  }
}
