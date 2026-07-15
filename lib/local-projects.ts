import type { LocalVideoProject, LocalVideoProjectPreview } from "@/types/local-project.types";

const DB_NAME = "openvid-local-projects";
const DB_VERSION = 1;
const STORE_NAME = "video-projects";
const CURRENT_PROJECT_KEY = "openvid-current-video-project";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                store.createIndex("updatedAt", "updatedAt");
            }
        };
    });
    return dbPromise;
}

export async function putLocalVideoProject(project: LocalVideoProject): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(project);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getLocalVideoProject(id: string): Promise<LocalVideoProject | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
    });
}

export async function listLocalVideoProjects(): Promise<LocalVideoProjectPreview[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const projects: LocalVideoProjectPreview[] = [];
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).index("updatedAt").openCursor(null, "prev");
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return resolve(projects);
            const project = cursor.value as LocalVideoProject;
            projects.push({
                id: project.id,
                name: project.name,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
                thumbnailDataUrl: project.thumbnailDataUrl,
            });
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

export async function deleteLocalVideoProject(id: string): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    if (getCurrentLocalVideoProjectId() === id) setCurrentLocalVideoProjectId(null);
}

export function setCurrentLocalVideoProjectId(id: string | null): void {
    if (typeof window === "undefined") return;
    if (id) localStorage.setItem(CURRENT_PROJECT_KEY, id);
    else localStorage.removeItem(CURRENT_PROJECT_KEY);
}

export function getCurrentLocalVideoProjectId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(CURRENT_PROJECT_KEY);
}
