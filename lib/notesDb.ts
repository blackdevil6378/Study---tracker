/**
 * IndexedDB storage for Study Tracker subject notes (PDFs, HTML files, rich text).
 * Handles large binary blobs without hitting the browser's 5MB localStorage quota.
 */

const DB_NAME = "StudyTrackerNotesDB";
const DB_VERSION = 1;
const STORE_NAME = "files";

interface StoredFileRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  name?: string;
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a File or Blob associated with a note ID
 */
export async function saveNoteFile(
  id: string,
  file: Blob | File,
  mimeType?: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const record: StoredFileRecord = {
      id,
      blob: file,
      mimeType: mimeType || file.type || "application/octet-stream",
      name: file instanceof File ? file.name : undefined,
      updatedAt: Date.now(),
    };

    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save raw HTML text directly as an HTML Blob
 */
export async function saveNoteHtmlText(
  id: string,
  htmlContent: string
): Promise<void> {
  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
  return saveNoteFile(id, blob, "text/html");
}

/**
 * Retrieve the Blob record for a note ID
 */
export async function getNoteFile(
  id: string
): Promise<{ blob: Blob; mimeType: string; name?: string } | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result as StoredFileRecord | undefined;
        if (!result || !result.blob) {
          resolve(null);
        } else {
          resolve({
            blob: result.blob,
            mimeType: result.mimeType || result.blob.type,
            name: result.name,
          });
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to get note file from IndexedDB:", err);
    return null;
  }
}

/**
 * Retrieve HTML or text content as string
 */
export async function getNoteHtmlText(id: string): Promise<string | null> {
  const fileData = await getNoteFile(id);
  if (!fileData) return null;
  try {
    return await fileData.blob.text();
  } catch (err) {
    console.error("Failed to read text from note blob:", err);
    return null;
  }
}

/**
 * Delete a note file from IndexedDB
 */
export async function deleteNoteFile(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to delete note file from IndexedDB:", err);
  }
}

/**
 * Clear all note files from IndexedDB
 */
export async function clearAllNoteFiles(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to clear note files:", err);
  }
}
