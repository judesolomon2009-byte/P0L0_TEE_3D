const DB_NAME = 'halvora-polo-studio';
const DB_VERSION = 1;
const STORE_NAME = 'models';
const CURRENT_KEY = 'active-polo-glb';
const WORDMARK_KEY = 'halvora-wordmark';
const BRAND_COLOURS_KEY = 'halvora-brand-colours';
const RECENT_COLOURS_KEY = 'halvora-recent-colours';

export interface StoredModelRecord {
  id: string;
  buffer: ArrayBuffer;
  fileName: string;
  sourceUrl?: string;
  savedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function saveModelToIndexedDB(
  buffer: ArrayBuffer,
  fileName: string,
  sourceUrl?: string
): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredModelRecord = {
        id: CURRENT_KEY,
        buffer,
        fileName,
        sourceUrl,
        savedAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write error'));
    });
    db.close();
  } catch (err) {
    console.warn('[Storage] Unable to cache model in IndexedDB:', err);
  }
}

export async function loadModelFromIndexedDB(): Promise<StoredModelRecord | null> {
  try {
    const db = await openDB();
    const record = await new Promise<StoredModelRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CURRENT_KEY);
      req.onsuccess = () => resolve((req.result as StoredModelRecord | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read error'));
    });
    db.close();
    return record;
  } catch (err) {
    console.warn('[Storage] Unable to read model from IndexedDB:', err);
    return null;
  }
}

export async function clearStoredModel(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(CURRENT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete error'));
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
}

export function loadWordmark(): string {
  try {
    return localStorage.getItem(WORDMARK_KEY) || 'HALVORA';
  } catch {
    return 'HALVORA';
  }
}

export function saveWordmark(text: string): void {
  try {
    localStorage.setItem(WORDMARK_KEY, text);
  } catch {
    // Ignore storage quota errors
  }
}

export function loadBrandColours(): string[] {
  try {
    const raw = localStorage.getItem(BRAND_COLOURS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function saveBrandColours(colours: string[]): void {
  try {
    localStorage.setItem(BRAND_COLOURS_KEY, JSON.stringify(colours.slice(0, 12)));
  } catch {
    // Ignore storage errors
  }
}

export function loadRecentColours(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COLOURS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function saveRecentColours(colours: string[]): void {
  try {
    localStorage.setItem(RECENT_COLOURS_KEY, JSON.stringify(colours.slice(0, 12)));
  } catch {
    // Ignore storage errors
  }
}
