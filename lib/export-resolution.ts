import { QUALITY_SETTINGS } from "@/lib/constants";
import { ASPECT_RATIO_DIMENSIONS, type AspectRatio } from "@/types/editor.types";
import type { ExportQuality } from "@/types/video.types";

export interface Dimensions {
    width: number;
    height: number;
}

export interface ExportResolutionOptions {
    aspectRatio?: AspectRatio;
    customDimensions?: Dimensions | null;
    sourceDimensions?: Dimensions | null;
    fallbackDimensions?: Dimensions | null;
}

const MAX_EXPORT_EDGE = 8192;

function isValidDimensions(dimensions?: Dimensions | null): dimensions is Dimensions {
    return !!dimensions
        && Number.isFinite(dimensions.width)
        && Number.isFinite(dimensions.height)
        && dimensions.width > 0
        && dimensions.height > 0;
}

function roundToEven(value: number): number {
    return Math.max(2, Math.round(value / 2) * 2);
}

export function getCompositionDimensions({
    aspectRatio = "auto",
    customDimensions,
    sourceDimensions,
    fallbackDimensions,
}: ExportResolutionOptions): Dimensions {
    if (aspectRatio === "custom" && isValidDimensions(customDimensions)) {
        return customDimensions;
    }

    const standardDimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio];
    if (standardDimensions) return standardDimensions;

    if (aspectRatio === "auto" && isValidDimensions(sourceDimensions)) {
        return sourceDimensions;
    }

    if (isValidDimensions(fallbackDimensions)) return fallbackDimensions;

    return ASPECT_RATIO_DIMENSIONS["16:9"]!;
}

/**
 * Resolution presets describe the short edge (2160 for 4K, 1080 for Full HD,
 * and so on). The composition ratio then determines the long edge. This keeps
 * portrait exports at 1080x1920 rather than shrinking them into 608x1080.
 */
export function resolveExportResolution(
    quality: ExportQuality,
    options: ExportResolutionOptions = {},
): Dimensions {
    const qualitySettings = QUALITY_SETTINGS[quality];
    if (!qualitySettings) throw new Error(`Unknown export quality: ${quality}`);

    const composition = getCompositionDimensions(options);
    const ratio = composition.width / composition.height;
    const shortEdge = Math.min(qualitySettings.width, qualitySettings.height);

    let width = ratio >= 1 ? shortEdge * ratio : shortEdge;
    let height = ratio >= 1 ? shortEdge : shortEdge / ratio;

    const longestEdge = Math.max(width, height);
    if (longestEdge > MAX_EXPORT_EDGE) {
        const scale = MAX_EXPORT_EDGE / longestEdge;
        width *= scale;
        height *= scale;
    }

    return {
        width: roundToEven(width),
        height: roundToEven(height),
    };
}

export function formatExportResolution(dimensions: Dimensions): string {
    return `${dimensions.width} × ${dimensions.height}`;
}
