export interface CustomFontRecord {
    id: string;
    family: string;
    fileName: string;
    mimeType: string;
    blob: Blob;
    uploadedAt: number;
}

const DB_NAME = "openvid-custom-fonts";
const DB_VERSION = 1;
const STORE_NAME = "fonts";
const MAX_FONT_SIZE = 20 * 1024 * 1024;
const FONT_EXTENSIONS = ["ttf", "otf", "woff", "woff2"];
const registeredFaces = new Map<string, FontFace>();
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
                store.createIndex("uploadedAt", "uploadedAt");
                store.createIndex("family", "family", { unique: true });
            }
        };
    });
    return dbPromise;
}

function getExtension(fileName: string): string {
    return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function baseFamilyName(fileName: string): string {
    return fileName
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Custom font";
}

async function registerFont(record: CustomFontRecord): Promise<void> {
    if (typeof document === "undefined" || registeredFaces.has(record.id)) return;
    const buffer = await record.blob.arrayBuffer();
    const face = new FontFace(record.family, buffer);
    await face.load();
    document.fonts.add(face);
    registeredFaces.set(record.id, face);
}

export async function getCustomFonts(): Promise<CustomFontRecord[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).index("uploadedAt").openCursor(null, "prev");
        const fonts: CustomFontRecord[] = [];
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return resolve(fonts);
            fonts.push(cursor.value as CustomFontRecord);
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

export async function loadAndRegisterCustomFonts(): Promise<CustomFontRecord[]> {
    if (typeof indexedDB === "undefined") return [];
    const fonts = await getCustomFonts();
    await Promise.allSettled(fonts.map(registerFont));
    return fonts;
}

export async function importCustomFont(file: File): Promise<CustomFontRecord> {
    const extension = getExtension(file.name);
    if (!FONT_EXTENSIONS.includes(extension)) throw new Error("Use a TTF, OTF, WOFF, or WOFF2 font file.");
    if (file.size <= 0 || file.size > MAX_FONT_SIZE) throw new Error("Font files must be smaller than 20 MB.");

    const existing = await getCustomFonts();
    const baseName = baseFamilyName(file.name);
    let family = baseName;
    let suffix = 2;
    while (existing.some(font => font.family.toLowerCase() === family.toLowerCase())) {
        family = `${baseName} ${suffix++}`;
    }

    const record: CustomFontRecord = {
        id: `font-${crypto.randomUUID()}`,
        family,
        fileName: file.name,
        mimeType: file.type || `font/${extension}`,
        blob: file.slice(0, file.size, file.type || `font/${extension}`),
        uploadedAt: Date.now(),
    };
    await registerFont(record);

    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).add(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    return record;
}
