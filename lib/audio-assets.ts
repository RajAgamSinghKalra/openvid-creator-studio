import type { UploadedAudio } from "@/types/audio.types";

interface StoredAudioAsset {
    id: string;
    name: string;
    duration: number;
    fileSize: number;
    mimeType: string;
    blob: Blob;
}

const DB_NAME = "openvid-audio-assets";
const DB_VERSION = 1;
const STORE_NAME = "audio";
const sessionAssets = new Map<string, StoredAudioAsset>();
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
    });
    return dbPromise;
}

export function stageAudioAsset(file: File, audio: Omit<UploadedAudio, "url">): void {
    sessionAssets.set(audio.id, { ...audio, blob: file });
}

export async function persistAudioAssets(ids: string[]): Promise<void> {
    const assets = ids.map(id => sessionAssets.get(id)).filter((asset): asset is StoredAudioAsset => !!asset);
    if (assets.length === 0) return;
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        for (const asset of assets) store.put(asset);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

export async function getAudioAsset(id: string): Promise<StoredAudioAsset | null> {
    const session = sessionAssets.get(id);
    if (session) return session;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
    });
}

export async function hydrateUploadedAudios(ids: string[]): Promise<UploadedAudio[]> {
    const assets = await Promise.all(ids.map(getAudioAsset));
    return assets.filter((asset): asset is StoredAudioAsset => !!asset).map(asset => ({
        id: asset.id,
        name: asset.name,
        duration: asset.duration,
        fileSize: asset.fileSize,
        mimeType: asset.mimeType,
        url: URL.createObjectURL(asset.blob),
    }));
}
