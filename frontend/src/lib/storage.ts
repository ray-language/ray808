/**
 * Where the machine keeps its state and the user's samples: the raylang backend's
 * files when running inside the app (so they survive a webview reset and can be
 * backed up), browser storage (localStorage + IndexedDB) otherwise.
 */
import type { VoiceId } from '../machine/instruments';
import { mergeState, type MachineState } from '../machine/pattern';
import { call, fromBase64, hasBridge, toBase64 } from './bridge';

const LS_KEY = 'ray808/state';
const DB_NAME = 'ray808';
const DB_STORE = 'user-samples';

/* ---------- state ---------- */

export async function loadState(): Promise<MachineState> {
  if (hasBridge()) {
    const r = await call('state.load');
    if (r.ok && r.state) return mergeState(r.state);
    // No saved state in the backend (first launch, or it could not write): fall back
    // to what the webview itself kept.
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return mergeState(raw ? JSON.parse(raw) : null);
  } catch {
    return mergeState(null);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Debounced autosave (250 ms after the last change). */
export function saveState(state: MachineState): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const local = () => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      } catch {
        /* quota exceeded: ignore */
      }
    };
    if (!hasBridge()) return local();
    void call('state.save', { state }).then((r) => {
      if (!r.ok) local(); // the backend could not write: keep the work in the webview
    });
  }, 250);
}

export async function clearState(): Promise<void> {
  clearTimeout(saveTimer);
  if (hasBridge()) await call('state.clear');
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------- user samples ---------- */

export interface StoredSample {
  name: string;
  data: ArrayBuffer;
}

let idb: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (idb) return resolve(idb);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => {
      idb = req.result;
      resolve(idb);
    };
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const req = fn(tx.objectStore(DB_STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveUserSample(voiceId: VoiceId, name: string, data: ArrayBuffer): Promise<void> {
  if (hasBridge()) {
    const r = await call('sample.put', { voice: voiceId, name, data: await toBase64(data) });
    if (!r.ok) throw new Error(r.error ?? 'sample.put failed');
    return;
  }
  await withStore('readwrite', (s) => s.put({ name, data }, voiceId));
}

export async function deleteUserSample(voiceId: VoiceId): Promise<void> {
  if (hasBridge()) {
    await call('sample.delete', { voice: voiceId });
    return;
  }
  await withStore('readwrite', (s) => s.delete(voiceId));
}

export async function loadUserSamples(): Promise<Map<VoiceId, StoredSample>> {
  const out = new Map<VoiceId, StoredSample>();
  if (hasBridge()) {
    const list = await call('sample.list');
    const items = Array.isArray(list.samples) ? (list.samples as { voice: VoiceId; name: string }[]) : [];
    for (const item of items) {
      const r = await call('sample.get', { voice: item.voice });
      if (r.ok && typeof r.data === 'string') {
        out.set(item.voice, { name: String(r.name ?? item.name), data: fromBase64(r.data) });
      }
    }
    return out;
  }
  try {
    const keys = await withStore('readonly', (s) => s.getAllKeys());
    for (const key of keys) {
      const value = await withStore<StoredSample>('readonly', (s) => s.get(key));
      if (value) out.set(key as VoiceId, value);
    }
  } catch {
    /* no IndexedDB (private mode): no user samples */
  }
  return out;
}
