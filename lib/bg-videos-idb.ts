/** IndexedDB storage for user-uploaded background videos. */
const DB_NAME = "openvid-bg-videos";
const DB_VERSION = 1;
const STORE = "videos";

export interface BgVideoEntry {
    id: string;
    blob: Blob;
    name: string;
    type: string;
    duration: number;
    uploadedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: "id" });
            }
        };
    });

    return dbPromise;
}

export async function bgVideosGetAll(): Promise<BgVideoEntry[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        request.onsuccess = () => resolve(
            (request.result ?? []).sort((a, b) => b.uploadedAt - a.uploadedAt)
        );
        request.onerror = () => reject(request.error);
    });
}

export async function bgVideosSave(entry: BgVideoEntry): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function bgVideosDelete(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
