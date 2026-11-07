// Facebook automation engine: media. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.

export const POST_MEDIA_DB = 'FBMultiGroupPosterMediaV11';

export const POST_MEDIA_STORE = 'media';

export const postingMediaCache = new Map();

export const postMediaDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(POST_MEDIA_DB, 2);
    req.onerror = () => reject(req.error || new Error('Media DB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(POST_MEDIA_STORE))
        db.createObjectStore(POST_MEDIA_STORE, {
          keyPath: 'id',
        });
    };
  });

export async function blobToBase64(blob) {
  const ab = await blob.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let out = '';
  const STEP = 24576;
  for (let i = 0; i < bytes.length; i += STEP) {
    let bin = '';
    const end = Math.min(bytes.length, i + STEP);
    for (let j = i; j < end; j++) bin += String.fromCharCode(bytes[j]);
    out += btoa(bin);
  }
  return out;
}

export async function savePostingMedia(files) {
  const db = await postMediaDB();
  try {
    const ids = [];
    const tx = db.transaction(POST_MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(POST_MEDIA_STORE);
    for (const f of Array.isArray(files) ? files : []) {
      const id = crypto.randomUUID();
      const dataUrl = String(f?.dataUrl || '');
      let blob = null;
      if (dataUrl) {
        const comma = dataUrl.indexOf(',');
        if (comma < 0) throw new Error(`Invalid media data for ${f?.name || 'file'}`);
        const mime = String(f?.type || dataUrl.slice(5, comma).split(';')[0] || 'application/octet-stream');
        const b64 = dataUrl.slice(comma + 1);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], {
          type: mime,
        });
        const record = {
          id: id,
          filename: String(f?.name || 'upload'),
          mimeType: mime,
          fileSize: bytes.byteLength,
          data: blob,
          dataUrl: '',
          timestamp: Date.now(),
          storageVersion: 2,
        };
        store.put(record);
        postingMediaCache.set(id, {
          filename: record.filename,
          mimeType: record.mimeType,
          dataUrl: '',
          blob: blob,
        });
      } else if (f?.blob instanceof Blob) {
        const mime = String(f?.type || f.blob.type || 'application/octet-stream');
        blob = f.blob;
        const record = {
          id: id,
          filename: String(f?.name || 'upload'),
          mimeType: mime,
          fileSize: blob.size,
          data: blob,
          dataUrl: '',
          timestamp: Date.now(),
          storageVersion: 2,
        };
        store.put(record);
        postingMediaCache.set(id, {
          filename: record.filename,
          mimeType: record.mimeType,
          dataUrl: '',
          blob: blob,
        });
      } else {
        throw new Error(`Invalid media data for ${f?.name || 'file'}`);
      }
      ids.push(id);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Media DB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('Media DB transaction aborted'));
    });
    return ids;
  } finally {
    db.close();
  }
}

export async function getPostingMedia(ids) {
  const db = await postMediaDB();
  try {
    const files = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      const cached = postingMediaCache.get(id);
      if (cached?.data) {
        files.push(cached);
        continue;
      }
      const rec = await new Promise((resolve, reject) => {
        const tx = db.transaction(POST_MEDIA_STORE, 'readonly');
        const q = tx.objectStore(POST_MEDIA_STORE).get(id);
        q.onsuccess = () => resolve(q.result || null);
        q.onerror = () => reject(q.error);
      });
      if (rec) {
        let dataUrl = String(rec.dataUrl || '');
        if (!dataUrl)
          dataUrl = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ''));
            fr.onerror = reject;
            fr.readAsDataURL(rec.data);
          });
        const item = {
          filename: rec.filename,
          mimeType: rec.mimeType,
          data: dataUrl,
        };
        postingMediaCache.set(id, item);
        files.push(item);
      }
    }
    return files;
  } finally {
    db.close();
  }
}

export async function getPostingMediaChunk(id, start = 0, end = 0) {
  const key = String(id || '');
  if (!key) throw new Error('Missing media id');
  let item = postingMediaCache.get(key);
  if (!item) {
    const db = await postMediaDB();
    try {
      const rec = await new Promise((resolve, reject) => {
        const tx = db.transaction(POST_MEDIA_STORE, 'readonly');
        const q = tx.objectStore(POST_MEDIA_STORE).get(key);
        q.onsuccess = () => resolve(q.result || null);
        q.onerror = () => reject(q.error || new Error('Media lookup failed'));
      });
      if (!rec) throw new Error('Media record not found');
      item = {
        filename: String(rec.filename || 'upload'),
        mimeType: String(rec.mimeType || rec.data?.type || 'application/octet-stream'),
        blob: rec.data instanceof Blob ? rec.data : null,
        dataUrl: String(rec.dataUrl || ''),
      };
      if (!item.blob && item.dataUrl) {
        const comma = item.dataUrl.indexOf(',');
        if (comma < 0) throw new Error('Stored media is not a valid data URL');
        const b64 = item.dataUrl.slice(comma + 1);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        item.blob = new Blob([bytes], {
          type: item.mimeType,
        });
      }
      postingMediaCache.set(key, item);
    } finally {
      db.close();
    }
  }
  if (item.blob instanceof Blob) {
    const bodyLength = Math.ceil(item.blob.size / 3) * 4;
    const safeStart = Math.max(0, Math.min(Number(start) || 0, bodyLength));
    const safeEnd = Math.max(
      safeStart,
      Math.min(Number(end) || Math.min(bodyLength, safeStart + 512 * 1024), bodyLength),
    );
    if (safeEnd === safeStart)
      return {
        success: true,
        mediaId: key,
        filename: item.filename,
        mimeType: item.mimeType,
        prefix: `data:${item.mimeType};base64,`,
        totalLength: bodyLength,
        start: safeStart,
        end: safeEnd,
        chunk: '',
      };
    const rawStart = Math.floor(safeStart / 4) * 3;
    const rawEnd = Math.min(item.blob.size, Math.ceil(safeEnd / 4) * 3);
    const encoded = await blobToBase64(item.blob.slice(rawStart, rawEnd));
    const encodedOffset = (rawStart / 3) * 4;
    return {
      success: true,
      mediaId: key,
      filename: item.filename,
      mimeType: item.mimeType,
      prefix: `data:${item.mimeType};base64,`,
      totalLength: bodyLength,
      start: safeStart,
      end: safeEnd,
      chunk: encoded.slice(safeStart - encodedOffset, safeEnd - encodedOffset),
    };
  }
  const data = String(item.dataUrl || '');
  const comma = data.indexOf(',');
  if (comma < 0) throw new Error('Stored media is not a valid data URL');
  const body = data.slice(comma + 1);
  const safeStart = Math.max(0, Math.min(Number(start) || 0, body.length));
  const safeEnd = Math.max(
    safeStart,
    Math.min(Number(end) || Math.min(body.length, safeStart + 512 * 1024), body.length),
  );
  return {
    success: true,
    mediaId: key,
    filename: item.filename,
    mimeType: item.mimeType,
    prefix: data.slice(0, comma + 1),
    totalLength: body.length,
    start: safeStart,
    end: safeEnd,
    chunk: body.slice(safeStart, safeEnd),
  };
}

export async function deletePostingMedia(ids) {
  const db = await postMediaDB();
  try {
    const tx = db.transaction(POST_MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(POST_MEDIA_STORE);
    for (const id of Array.isArray(ids) ? ids : []) {
      store.delete(id);
      postingMediaCache.delete(id);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function streamMediaInfo(id) {
  const key = String(id || '');
  if (!key) throw new Error('Missing media id');
  const db = await postMediaDB();
  try {
    const rec = await new Promise((resolve, reject) => {
      const tx = db.transaction(POST_MEDIA_STORE, 'readonly');
      const q = tx.objectStore(POST_MEDIA_STORE).get(key);
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => reject(q.error || new Error('Media lookup failed'));
    });
    if (!rec) throw new Error(`Media record not found: ${key.slice(0, 8)}`);
    const blob = rec.data instanceof Blob ? rec.data : null;
    if (!blob) throw new Error('Stored media is not a Blob');
    return {
      mediaId: key,
      filename: String(rec.filename || 'upload'),
      mimeType: String(rec.mimeType || blob.type || 'application/octet-stream'),
      size: blob.size,
      lastModified: Number(rec.lastModified) || Date.now(),
    };
  } finally {
    db.close();
  }
}

export async function streamMediaBytes(id, start, end) {
  const key = String(id || '');
  const db = await postMediaDB();
  try {
    const rec = await new Promise((resolve, reject) => {
      const tx = db.transaction(POST_MEDIA_STORE, 'readonly');
      const q = tx.objectStore(POST_MEDIA_STORE).get(key);
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => reject(q.error || new Error('Media lookup failed'));
    });
    if (!rec || !(rec.data instanceof Blob)) throw new Error(`Media record not found: ${key.slice(0, 8)}`);
    const blob = rec.data;
    const a = Math.max(0, Math.min(Number(start) || 0, blob.size));
    const b = Math.max(a, Math.min(Number(end) || blob.size, blob.size));
    return await blob.slice(a, b).arrayBuffer();
  } finally {
    db.close();
  }
}
