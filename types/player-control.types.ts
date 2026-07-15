import type { AspectRatio } from "./editor.types";
import type { ImageMaskConfig } from "./photo.types";

export type PreviewQuality = "auto" | "full" | "half" | "quarter";
export type ProxyStatus = "idle" | "generating" | "ready" | "error";

export interface PlayerControlsProps {
    isPlaying: boolean;
    currentTime: number;
    videoDuration: number;
    aspectRatio: AspectRatio;
    isFullscreen: boolean;
    zoomLevel: number;
    customAspectRatio?: { width: number; height: number } | null;
    onTogglePlayPause: () => void;
    onSkipBackward: () => void;
    onSkipForward: () => void;
    onToggleFullscreen: () => void;
    onAspectRatioChange: (ratio: AspectRatio) => void;
    onCustomAspectRatioChange?: (dimensions: { width: number; height: number }) => void;
    onOpenCropper: () => void;
    onZoomChange: (zoom: number) => void;
    videoMaskConfig: ImageMaskConfig;
    onVideoMaskConfigChange: (config: ImageMaskConfig) => void;
    videoPreviewImageUrl?: string | null;
    onSplitClip?: () => void;
    canSplitClip?: boolean;
    previewQuality: PreviewQuality;
    onPreviewQualityChange: (quality: PreviewQuality) => void;
    isPreviewCaching?: boolean;
    previewCacheProgress?: number;
    proxyStatus?: ProxyStatus;
    proxyProgress?: number;
    proxyCount?: number;
    canCreateProxies?: boolean;
    onCreateProxies?: () => void;
    onRemoveProxies?: () => void;
    onCancelProxyCreation?: () => void;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 10;
export const ZOOM_STEP = 1;
