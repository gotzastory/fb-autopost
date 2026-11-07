// Selected photos/videos live in IndexedDB so the engine can read the exact files by id.
// The database and store names are shared with src/engine/media.js.
const DB_NAME = 'FBMultiGroupPosterMediaV11';
const STORE = 'media';
const IDS_KEY = 'fb_composer_media_ids';

const isMedia = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/');

export interface MediaSelection {
  files: File[];
  trimmed: boolean;
  message: string;
}

/** Facebook's posting limits: up to 5 photos, or 1 video plus up to 3 photos. */
export function limitMedia(input: File[]): MediaSelection {
  const valid = input.filter(isMedia);
  if (!valid.some((f) => f.type.startsWith('video/'))) {
    const trimmed = valid.length > 5;
    return {
      files: valid.slice(0, 5),
      trimmed,
      message: trimmed ? 'Maximum 5 photos per post. Only the first 5 photos will be kept.' : '',
    };
  }
  let videos = 0;
  let photos = 0;
  const files = valid.filter((f) => (f.type.startsWith('video/') ? videos++ < 1 : photos++ < 3));
  const kept = files.filter((f) => f.type.startsWith('image/')).length;
  const trimmed = files.length !== valid.length;
  return {
    files,
    trimmed,
    message: trimmed
      ? `Mixed media limit: 1 video + up to 3 photos. Kept 1 video and ${kept} photo${kept === 1 ? '' : 's'}.`
      : '',
  };
}

/** Adds files to a selection, skipping any already in it. */
export function mergeFiles(existing: File[], incoming: File[]): File[] {
  const key = (f: File) => [f.name.toLowerCase(), f.type, f.size, f.lastModified].join('|');
  const seen = new Set(existing.map(key));
  return [...existing, ...incoming.filter((f) => !seen.has(key(f)) && seen.add(key(f)))];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onerror = () => reject(req.error ?? new Error('Media storage unavailable'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
  });
}

function commit(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Media storage transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Media storage transaction aborted'));
  });
}

/** Replaces the stored selection with `files` and returns the new ids. */
export async function saveMedia(files: File[], previousIds: string[]): Promise<string[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    previousIds.forEach((id) => store.delete(id));
    const ids = files.map((file) => {
      const id = crypto.randomUUID();
      store.put({
        id,
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        lastModified: file.lastModified,
        data: file,
        blob: file,
        timestamp: Date.now(),
        storageVersion: 2,
      });
      return id;
    });
    await commit(tx);
    await chrome.storage.local.set({ [IDS_KEY]: ids });
    return ids;
  } finally {
    db.close();
  }
}

export async function clearMedia(ids: string[]): Promise<void> {
  await chrome.storage.local.remove(IDS_KEY);
  if (ids.length) await saveMedia([], ids);
  await chrome.storage.local.remove(IDS_KEY);
}

/** Restores the selection left over from the previous dashboard session. */
export async function restoreMedia(): Promise<{ files: File[]; ids: string[] }> {
  const stored = await chrome.storage.local.get(IDS_KEY);
  const wanted = stored[IDS_KEY];
  if (!Array.isArray(wanted) || !wanted.length) return { files: [], ids: [] };
  const db = await openDb();
  try {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const records = await Promise.all(
      (wanted as string[]).map(
        (id) =>
          new Promise<{ id: string; data?: Blob; filename?: string; mimeType?: string; lastModified?: number } | null>(
            (resolve, reject) => {
              const q = store.get(id);
              q.onsuccess = () => resolve(q.result ?? null);
              q.onerror = () => reject(q.error ?? new Error('Media lookup failed'));
            },
          ),
      ),
    );
    const found = records.filter((r) => r?.data instanceof Blob);
    return {
      ids: found.map((r) => r!.id),
      files: found.map(
        (r) =>
          new File([r!.data!], r!.filename || 'upload', {
            type: r!.mimeType || r!.data!.type || 'application/octet-stream',
            lastModified: r!.lastModified || Date.now(),
          }),
      ),
    };
  } finally {
    db.close();
  }
}
