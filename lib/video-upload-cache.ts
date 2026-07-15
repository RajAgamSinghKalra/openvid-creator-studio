const DB_NAME = "openvid-uploaded-videos";
const DB_VERSION = 1;
const STORE_NAME = "videos";
const SINGLE_VIDEO_KEY = "current-uploaded-video";

export interface CachedUploadedVideo {
    key: string;
    blob: Blob;
    fileName: string;
    fileSize: number;
    duration: number;
    width: number;
    height: number;
    aspectRatio: string;
    uploadedAt: number;
}

let dbInstance: IDBDatabase | null = null;
let stagedUploadedVideo: CachedUploadedVideo | null = null;

async function cleanupOldUploadCache(db: IDBDatabase): Promise<void> {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const getReq = store.get(SINGLE_VIDEO_KEY);
            getReq.onsuccess = () => {
                const record = getReq.result as CachedUploadedVideo | undefined;
                if (record && record.uploadedAt < cutoff) {
                    store.delete(SINGLE_VIDEO_KEY);
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
        } catch { resolve(); }
    });
}

async function openDB(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            dbInstance = request.result;
            cleanupOldUploadCache(dbInstance).catch(() => {});
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
                store.createIndex("uploadedAt", "uploadedAt", { unique: false });
            }
        };
    });
}

function calculateAspectRatio(width: number, height: number): string {
    if (!width || !height) return "auto";
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    return `${width / divisor}/${height / divisor}`;
}

export interface VideoFileMetadata {
    duration: number;
    width: number;
    height: number;
    aspectRatio: string;
}

export async function getVideoMetadata(file: File): Promise<VideoFileMetadata> {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        
        video.onloadedmetadata = () => {
            const metadata = {
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
                aspectRatio: calculateAspectRatio(video.videoWidth, video.videoHeight),
            };
            
            URL.revokeObjectURL(video.src);
            resolve(metadata);
        };
        
        video.onerror = () => {
            URL.revokeObjectURL(video.src);
            reject(new Error("Failed to load video metadata"));
        };
        
        video.src = URL.createObjectURL(file);
    });
}

/**
 * Passes a locally selected file between client routes without copying it into
 * IndexedDB. The File remains read-only and valid for the current tab session.
 */
export async function stageUploadedVideo(file: File): Promise<CachedUploadedVideo> {
    const metadata = await getVideoMetadata(file);
    stagedUploadedVideo = {
        key: SINGLE_VIDEO_KEY,
        blob: file,
        fileName: file.name,
        fileSize: file.size,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        aspectRatio: metadata.aspectRatio,
        uploadedAt: Date.now(),
    };
    return stagedUploadedVideo;
}

export async function saveUploadedVideo(file: File, knownMetadata?: VideoFileMetadata): Promise<CachedUploadedVideo> {
    try {
        const db = await openDB();
        
        const metadata = knownMetadata ?? await getVideoMetadata(file);
        
        const data: CachedUploadedVideo = {
            key: SINGLE_VIDEO_KEY,
            blob: file,
            fileName: file.name,
            fileSize: file.size,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            aspectRatio: metadata.aspectRatio,
            uploadedAt: Date.now(),
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            
            const request = store.put(data);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(data);
        });
    } catch (error) {
        console.error("Failed to save uploaded video:", error);
        throw error;
    }
}

export async function getUploadedVideo(): Promise<CachedUploadedVideo | null> {
    if (stagedUploadedVideo) return stagedUploadedVideo;

    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(SINGLE_VIDEO_KEY);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const result = request.result;
                resolve(result || null);
            };
        });
    } catch (error) {
        console.warn("Failed to get uploaded video:", error);
        return null;
    }
}

export async function deleteUploadedVideo(): Promise<void> {
    stagedUploadedVideo = null;
    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(SINGLE_VIDEO_KEY);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        console.warn("Failed to delete uploaded video:", error);
    }
}

export async function hasUploadedVideo(): Promise<boolean> {
    const video = await getUploadedVideo();
    return video !== null;
}

export async function getUploadedVideoInfo(): Promise<{
    fileName: string;
    fileSize: number;
    duration: number;
    aspectRatio: string;
    uploadedAt: number;
} | null> {
    const video = await getUploadedVideo();
    if (!video) return null;
    
    return {
        fileName: video.fileName,
        fileSize: video.fileSize,
        duration: video.duration,
        aspectRatio: video.aspectRatio,
        uploadedAt: video.uploadedAt,
    };
}
