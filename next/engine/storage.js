/**
 * Device storage for verified timetable snapshots.
 * IndexedDB is the primary store; a memory map keeps tests and private-mode
 * browsers working without throwing.
 */

const DB_NAME = "gndec-compass-next";
const DB_VERSION = 1;
const STORE = "snapshots";
const memory = new Map();

let dbPromise = null;

function hasIndexedDb() {
  return typeof indexedDB !== "undefined" && indexedDB && typeof indexedDB.open === "function";
}

export function openDatabase() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.schedule) || !snapshot.schedule.length) return false;
  const record = {
    id: String(snapshot.id || `snap-${Date.now()}`),
    createdAt: snapshot.createdAt || new Date().toISOString(),
    version: String(snapshot.version || "unknown"),
    releaseKey: String(snapshot.releaseKey || snapshot.id || ""),
    checkedAt: String(snapshot.checkedAt || ""),
    groups: Number(snapshot.groups) || 0,
    entries: snapshot.schedule.length,
    roomEntries: Array.isArray(snapshot.roomSchedule) ? snapshot.roomSchedule.length : 0,
    schedule: snapshot.schedule,
    roomSchedule: Array.isArray(snapshot.roomSchedule) ? snapshot.roomSchedule : [],
    subgroupSchedule: Array.isArray(snapshot.subgroupSchedule) ? snapshot.subgroupSchedule : []
  };
  const db = await openDatabase();
  if (!db) {
    memory.set(record.id, record);
    return true;
  }
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    return true;
  } catch {
    memory.set(record.id, record);
    return true;
  }
}

export async function listSnapshots() {
  const db = await openDatabase();
  let records = [];
  if (!db) {
    records = [...memory.values()];
  } else {
    try {
      const tx = db.transaction(STORE, "readonly");
      records = await requestToPromise(tx.objectStore(STORE).getAll()) || [];
    } catch {
      records = [];
    }
  }
  return records
    .map(({ schedule, roomSchedule, ...meta }) => ({
      ...meta,
      scheduleCount: Array.isArray(schedule) ? schedule.length : 0,
      roomCount: Array.isArray(roomSchedule) ? roomSchedule.length : 0
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getSnapshot(id) {
  const db = await openDatabase();
  if (!db) return memory.get(String(id)) || null;
  try {
    const tx = db.transaction(STORE, "readonly");
    return (await requestToPromise(tx.objectStore(STORE).get(String(id)))) || null;
  } catch {
    return memory.get(String(id)) || null;
  }
}

export async function deleteSnapshot(id) {
  const db = await openDatabase();
  memory.delete(String(id));
  if (!db) return true;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(String(id));
    return true;
  } catch {
    return false;
  }
}

export async function pruneSnapshots(limit = 3) {
  const keep = Math.max(1, Math.min(5, Number(limit) || 3));
  const snapshots = await listSnapshots();
  const extra = snapshots.slice(keep);
  for (const snapshot of extra) await deleteSnapshot(snapshot.id);
  return { kept: snapshots.slice(0, keep), removed: extra.length };
}

export async function clearSnapshots() {
  memory.clear();
  const db = await openDatabase();
  if (!db) return true;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    return true;
  } catch {
    return false;
  }
}

export async function storageEstimate() {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, supported: false };
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, supported: true };
  } catch {
    return { usage: 0, quota: 0, supported: false };
  }
}

export async function requestPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Remove our service-worker caches without touching the legacy origin. */
export async function clearAppCaches() {
  if (typeof caches === "undefined") return 0;
  try {
    const keys = await caches.keys();
    const ours = keys.filter((key) => key.startsWith("compass-next-"));
    await Promise.all(ours.map((key) => caches.delete(key)));
    return ours.length;
  } catch {
    return 0;
  }
}
