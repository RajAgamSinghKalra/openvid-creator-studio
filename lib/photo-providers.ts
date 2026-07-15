import { isLocalOnlyBrowser } from "@/lib/local-mode";
import { WALLPAPER_CATEGORIES } from "@/lib/wallpaper.catalog";

export interface UnifiedPhoto {
    id: string;
    urls: {
        regular: string;
        small: string;
    };
    alt: string;
    photographer: string;
    color: string;
    width: number;
    height: number;
}

const LOCAL_PHOTOS: Array<UnifiedPhoto & { category: string }> = WALLPAPER_CATEGORIES.flatMap((category) =>
    category.items.map((item) => ({
        id: `local-${item.filename}`,
        urls: { regular: item.fullUrl, small: item.previewUrl },
        alt: `${category.label} ${item.filename}`,
        photographer: "Local OpenVid library",
        color: "#18181b",
        width: 1920,
        height: 1080,
        category: category.id,
    }))
);

function localPhotos(query = "", page = 1, perPage = 30): UnifiedPhoto[] {
    const normalized = query.trim().toLowerCase();
    const aliases: Record<string, string[]> = {
        desktop: ["desktop", "nature", "landscape", "city", "wallpaper"],
        gradient: ["gradient", "blur", "neon", "aurora", "color"],
        pattern: ["pattern", "abstract", "texture", "geometric"],
        minimal: ["minimal", "dark", "clean", "simple"],
    };

    let matches = LOCAL_PHOTOS;
    if (normalized) {
        const requestedCategories = Object.entries(aliases)
            .filter(([, words]) => words.some((word) => normalized.includes(word)))
            .map(([category]) => category);
        const filtered = LOCAL_PHOTOS.filter((photo) =>
            requestedCategories.includes(photo.category) || photo.alt.toLowerCase().includes(normalized)
        );
        if (filtered.length > 0) matches = filtered;
    }

    const start = Math.max(0, page - 1) * perPage;
    return matches.slice(start, start + perPage);
}

async function callApi(params: URLSearchParams): Promise<UnifiedPhoto[]> {
    try {
        const res = await fetch(`/api/photos?${params.toString()}`);
        if (!res.ok) return [];
        const data = (await res.json()) as { photos?: UnifiedPhoto[] };
        return data.photos ?? [];
    } catch {
        return [];
    }
}

export async function fetchPhotos(
    query: string,
    page = 1,
    perPage = 20
): Promise<UnifiedPhoto[]> {
    if (isLocalOnlyBrowser()) return localPhotos(query, page, perPage);
    const params = new URLSearchParams({
        mode: "search",
        q: query,
        page: String(page),
        perPage: String(perPage),
    });
    return callApi(params);
}

export async function fetchDiscoveryPhotos(): Promise<UnifiedPhoto[]> {
    if (isLocalOnlyBrowser()) return localPhotos("", 1, 30);
    const params = new URLSearchParams({ mode: "discovery" });
    return callApi(params);
}

const searchCache = new Map<string, { photos: UnifiedPhoto[]; timestamp: number }>();
const SEARCH_TTL = 10 * 60 * 1000;

export async function fetchPhotosWithCache(
    query: string,
    page = 1,
    perPage = 20
): Promise<UnifiedPhoto[]> {
    const cacheKey = `${query}::${page}::${perPage}`;
    const cached = searchCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < SEARCH_TTL) {
        return cached.photos;
    }

    const photos = await fetchPhotos(query, page, perPage);
    searchCache.set(cacheKey, { photos, timestamp: Date.now() });

    return photos;
}
