"use client";

import { useRef, useEffect, useImperativeHandle, useMemo, useState, useCallback, memo } from "react";
import dynamic from "next/dynamic";
import type { VideoCanvasHandle, VideoCanvasProps, VideoThumbnail } from "@/types";
import type { ImageElement, SvgElement } from "@/types/canvas-elements.types";
import { getCameraLayout } from "@/types/camera.types";
import { DEFAULT_BACKGROUND_VIDEO_TRANSFORM } from "@/types/background.types";
import { ASPECT_RATIO_DIMENSIONS } from "@/types";
import { getWallpaperUrl } from "@/lib/wallpaper.utils";
import { drawRoundedRect, drawRoundedRectBottomOnly, calculateScaledPadding, applyCanvasBackground, getAspectRatioStyle, getAspectRatioNumber, Corner, getCornerStyle, getNearestCorner, snapRotation } from "@/lib/canvas.utils";
import { drawMockupToCanvas } from "@/lib/mockup-canvas.utils";
import { speedToTransitionMs, ZOOM_EASING, calculateZoomPhaseState, zoomLevelToFactor } from "@/types/zoom.types";
import type { ZoomFragment } from "@/types/zoom.types";
import PlaceholderEditor from "../PlaceholderEditor";
import { MockupWrapper } from "./mockups/MockupWrapper";
import { DEFAULT_MOCKUP_CONFIG } from "@/types/mockup.types";
import { calculateSmoothZoom } from "@/lib/canvas.utils";
import { getSvgDataUrl } from "@/components/canvas-svg";
import { VIDEO_Z_INDEX, BOTTOM_ONLY_RADIUS_MOCKUPS, SELF_SHADOWING_MOCKUPS } from "@/lib/constants";
import { applyPerspective3D, disposePerspective3D } from "@/lib/perspective3d";
import { RotationHandleIcon } from "@/components/ui/RotationHandleIcon";
import { CanvasElementsLayer } from "./CanvasElementsLayer";
import { EditorHoverTooltip } from "./EditorHoverTooltip";
import DropImage from "@/components/ui/DropImage";
import { LayersPanel } from "./LayersPanel";
import { useMockup3dContext } from "@/app/contexts/Mockup3dContext";
import { PHONE_H, PHONE_W, DEVICE_3D_DIMENSIONS, DEVICE_VIEWER_DEFAULTS, PHONE_DEVICE_URLS } from "@/lib/phone3d.utils";
import { Viewer3DControls } from "@/lib/viewer-controls3d";
import { ControlsPopup } from "@/components/ui/ControlsPopup";
import { CanvasContextMenu } from "@/components/ui/CanvasContextMenu";
import { Viewer3DControlsBridge } from "@/components/ui/Viewer3DControlsBridge";
import { applyGradientMaskToRegion, GetMediaMaskStyles } from "@/lib/media-mask.utils";
import { MediaContent } from "@/components/ui/MediaContent";
import { RotationGuideLine } from "@/components/ui/RotationGuideLine";
import { drawTextElement } from "@/lib/text-rendering";
import { getMockupAnimationState, getMockupTransformState, type MockupTransformKeyframe } from "@/types/mockup-animation.types";
import { seekVideoToTime } from "@/lib/video.utils";
import { getBoundedZoomTransform } from "@/lib/zoom-transform";

export type { VideoCanvasHandle, VideoCanvasProps };

const Phone3DViewer = dynamic(
    () => import("./mockups-3d/Phone3DViewer").then((m) => ({ default: m.Phone3DViewer })),
    { ssr: false }
);

const Laptop3DViewer = dynamic(
    () => import("./mockups-3d/Laptop3DViewer").then((m) => ({ default: m.Laptop3DViewer })),
    { ssr: false }
);

const IPhone13ProMax3DViewer = dynamic(
    () => import("./mockups-3d/IPhone13ProMax3DViewer").then((m) => ({ default: m.IPhone13ProMax3DViewer })),
    { ssr: false }
);

const DoubleIPhone3DViewer = dynamic(
    () => import("./mockups-3d/DoubleIPhone3DViewer").then((m) => ({ default: m.DoubleIPhone3DViewer })),
    { ssr: false }
);

const IPhone17ProMax3DViewer = dynamic(
    () => import("./mockups-3d/IPhone17ProMax3DViewer").then((m) => ({ default: m.IPhone17ProMax3DViewer })),
    { ssr: false }
);

const IPadMini63DViewer = dynamic(
    () => import("./mockups-3d/IPadMini63DViewer").then((m) => ({ default: m.IPadMini63DViewer })),
    { ssr: false }
);

type BackgroundResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const BACKGROUND_RESIZE_HANDLES: Array<{
    id: BackgroundResizeHandle;
    className: string;
    cursor: string;
}> = [
    { id: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
    { id: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "ns-resize" },
    { id: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
    { id: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
    { id: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
    { id: "s", className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "ns-resize" },
    { id: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
    { id: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

function drawCover(
    context: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    destinationWidth: number,
    destinationHeight: number,
    destinationX = 0,
    destinationY = 0,
    overflow = 0,
) {
    if (sourceWidth <= 0 || sourceHeight <= 0) return;

    const destinationAspect = destinationWidth / destinationHeight;
    const sourceAspect = sourceWidth / sourceHeight;
    let sourceX = 0;
    let sourceY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (sourceAspect > destinationAspect) {
        cropWidth = sourceHeight * destinationAspect;
        sourceX = (sourceWidth - cropWidth) / 2;
    } else {
        cropHeight = sourceWidth / destinationAspect;
        sourceY = (sourceHeight - cropHeight) / 2;
    }

    context.drawImage(
        source,
        sourceX,
        sourceY,
        cropWidth,
        cropHeight,
        destinationX - overflow,
        destinationY - overflow,
        destinationWidth + overflow * 2,
        destinationHeight + overflow * 2,
    );
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata") {
    return new Promise<void>((resolve) => {
        const finish = () => {
            video.removeEventListener(eventName, finish);
            video.removeEventListener("error", finish);
            clearTimeout(timeoutId);
            resolve();
        };

        video.addEventListener(eventName, finish, { once: true });
        video.addEventListener("error", finish, { once: true });
        const timeoutId = setTimeout(finish, 1000);
    });
}

async function seekVideoFrame(video: HTMLVideoElement, timelineTime: number): Promise<void> {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await waitForVideoEvent(video, "loadedmetadata");
    }

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const target = Math.min(Math.max(timelineTime % duration, 0), Math.max(duration - 0.001, 0));
    await seekVideoToTime(video, target);
}

function VideoCanvasInner({
    activeTool,
    mediaType = "video",
    imageUrl = null,
    imageRef,
    imageTransform,
    apply3DToBackground = false,
    imageMaskConfig,
    videoRef,
    videoUrl,
    padding,
    roundedCorners,
    shadows,
    aspectRatio = "auto",
    customAspectRatio,
    cropArea,
    backgroundTab = "wallpaper",
    selectedWallpaper = -1,
    backgroundBlur = 0,
    selectedImageUrl = "",
    selectedBackgroundVideoUrl = "",
    backgroundVideoTransform = DEFAULT_BACKGROUND_VIDEO_TRANSFORM,
    onBackgroundVideoTransformChange,
    unsplashOverrideUrl = "",
    backgroundColorCss,
    onTimeUpdate,
    onLoadedMetadata,
    onEnded,
    isScrubbing = false,
    scrubTime = 0,
    getThumbnailForTime,
    zoomFragments = [],
    currentTime = 0,
    isPlaying = false,
    previewQuality = "auto",
    mockupId = "none",
    mockupConfig,
    onVideoUpload,
    onImageUpload,
    onImageDrop,
    isUploading = false,
    videoTransform = { rotation: 0, translateX: 0, translateY: 0, scale: 1 },
    onVideoTransformChange,
    canvasElements = [],
    selectedElementId = null,
    onElementUpdate,
    onElementSelect,
    onElementDelete,
    cameraUrl = null,
    cameraConfig = null,
    onCameraConfigChange,
    onCameraClick,
    videoMaskConfig,
    layersPanelToolbar,
    textToolActive = false,
    onTextToolDeactivate,
    onAddElement,
    onMockupClick,
    ref,
}: VideoCanvasProps & { ref?: React.Ref<VideoCanvasHandle> }) {
    const wallpaperUrl = getWallpaperUrl(selectedWallpaper);

    const hasMedia = mediaType === "video" ? !!videoUrl : !!imageUrl;

    // Motion 3D phone overlay state (reads from shared MotionContext)
    const {
        imagePhoneActive, imagePhoneX, imagePhoneY,
        imagePhoneScale, setImagePhoneScale,
        setImagePhoneX, setImagePhoneY,
        imagePhoneRotX, setImagePhoneRotX, imagePhoneRotY, setImagePhoneRotY,
        imagePhoneRotZ,
        imagePhoneDevice,
        imagePhoneOpening,
        imagePhoneShadow, imagePhoneShadowColor,
        imagePhoneAnimation, setImagePhoneAnimation,
    } = useMockup3dContext();

    // 3D phone overlay is active in both video and image mode
    const handlePhoneMount = useCallback((canvas: HTMLCanvasElement) => {
        imagePhoneCanvasRef.current = canvas;
    }, []);

    const handlePhoneApi = useCallback((api: typeof imagePhoneApiRef.current) => {
        imagePhoneApiRef.current = api;
    }, []);

    // Ctrl+scroll zoom badge state for image phone overlay
    const [imagePhoneZoomVisible, setImagePhoneZoomVisible] = useState(false);
    const imagePhoneZoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Ref for the non-passive Ctrl+scroll wheel handler (React's onWheel is always passive).
    // Updated each render so the closure always has the latest state values.
    const ctrlScrollWheelRef = useRef<((e: WheelEvent) => void) | null>(null);
    // WebGL canvas from image phone Phone3DViewer, captured via onMount prop for export
    const imagePhoneCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const imagePhoneApiRef = useRef<{
        renderAt: (w: number, h: number) => void;
        restorePreview: () => void;
        setRotation?: (rx: number, ry: number, rz: number) => void;
        hasBuiltInShadow?: boolean;
        getVisualSize?: () => { width: number; height: number } | null;
    } | null>(null);
    const [activePhoneDevice, setActivePhoneDevice] = useState<string | null>(null);
    const [phoneTransitioning, setPhoneTransitioning] = useState(false);
    const rafDragRef = useRef<number | null>(null);
    const pendingUpdateRef = useRef<{ id: string; x: number; y: number } | null>(null);
    const pendingMultiUpdatesRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    const imagePhoneModelUrl = PHONE_DEVICE_URLS[imagePhoneDevice];

    // Get current thumbnail for scrubbing preview
    const currentThumbnail = useMemo<VideoThumbnail | null>(() => {
        if (!isScrubbing || !getThumbnailForTime) return null;
        return getThumbnailForTime(scrubTime);
    }, [isScrubbing, scrubTime, getThumbnailForTime]);

    // Auto mirrors an NLE proxy workflow: full fidelity while paused, half
    // resolution during playback, and quarter resolution while actively
    // scrubbing. The 2D composition surface and WebGL renderer both follow the
    // selected quality; drawFrame() remains on the independent export canvas.
    const previewScale = useMemo(() => {
        if (previewQuality === "full") return 1;
        if (previewQuality === "half") return 0.5;
        if (previewQuality === "quarter") return 0.25;
        if (isScrubbing) return 0.25;
        if (isPlaying) return 0.5;
        return 1;
    }, [previewQuality, isScrubbing, isPlaying]);

    const previewDpr = useMemo(() => {
        if (previewQuality === "full") return 3;
        if (previewQuality === "half") return 1.5;
        if (previewQuality === "quarter") return 1;
        if (isScrubbing) return 1;
        if (isPlaying) return 1.5;
        return 3;
    }, [previewQuality, isScrubbing, isPlaying]);

    // Find active zoom fragment based on current time
    const activeZoomFragment = useMemo<ZoomFragment | null>(() => {
        if (!zoomFragments.length) return null;
        return zoomFragments.find(f => currentTime >= f.startTime && currentTime <= f.endTime) || null;
    }, [zoomFragments, currentTime]);

    // Calculate zoom transform for visual preview using 3-phase system
    const zoomTransform = useMemo(() => {
        // No active fragment - smooth exit to base scale
        if (!activeZoomFragment) {
            const lastFragment = zoomFragments
                .filter(f => f.endTime < currentTime)
                .sort((a, b) => b.endTime - a.endTime)[0];
            const exitMs = lastFragment ? speedToTransitionMs(lastFragment.speed) : speedToTransitionMs(3);
            return {
                scale: 1,
                translateX: 0,
                translateY: 0,
                transitionMs: exitMs,
                rotateX: 0,
                rotateY: 0,
                perspective: lastFragment?.enable3D ? 600 : 0,
                isMoving: false,
            };
        }

        // Calculate 3-phase state
        const phaseState = calculateZoomPhaseState(activeZoomFragment, currentTime);
        const targetScale = zoomLevelToFactor(activeZoomFragment.zoomLevel);
        const boundedTransform = getBoundedZoomTransform(
            phaseState.scale,
            phaseState.focusX,
            phaseState.focusY,
            targetScale,
        );

        // During hold phase with movement, reduce transition to avoid jarring
        const isMoving = activeZoomFragment.movementEnabled && phaseState.phase === 'hold';
        const transitionMs = isMoving ? 50 : speedToTransitionMs(activeZoomFragment.speed);

        return {
            scale: phaseState.scale,
            translateX: boundedTransform.translateXPercent,
            translateY: boundedTransform.translateYPercent,
            transitionMs,
            rotateX: phaseState.rotateX,
            rotateY: phaseState.rotateY,
            perspective: phaseState.perspective,
            isMoving,
        };
    }, [activeZoomFragment, zoomFragments, currentTime]);

    const shouldShowUnsplashOverride = backgroundTab === "wallpaper" && unsplashOverrideUrl !== "";
    const shouldShowWallpaper = backgroundTab === "wallpaper" && selectedWallpaper >= 0 && !shouldShowUnsplashOverride;
    const shouldShowCustomImage = backgroundTab === "image" && selectedImageUrl !== "";
    const shouldShowBackgroundVideo = backgroundTab === "video" && selectedBackgroundVideoUrl !== "";
    const shouldShowCustomColor = backgroundTab === "color" && !!backgroundColorCss;

    const exportCanvasRef = useRef<HTMLCanvasElement>(null);
    // Foreground canvas — used to render the mockup in isolation so that the
    // WebGL 3D perspective is applied only to the mockup, not to the background.
    const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const wallpaperImageRef = useRef<HTMLImageElement | null>(null);
    const customImageRef = useRef<HTMLImageElement | null>(null);
    const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);

    const exportDimensions = useMemo(() => {
        if ((aspectRatio === "auto" || aspectRatio === "custom") && customAspectRatio) {
            return { width: customAspectRatio.width, height: customAspectRatio.height };
        }
        // Otherwise use standard dimensions
        const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio];
        return dims || { width: 1920, height: 1080 };
    }, [aspectRatio, customAspectRatio]);

    // On-canvas controls state
    const [isVideoHovered, setIsVideoHovered] = useState(false);
    const [isVideoSelected, setIsVideoSelected] = useState(false);
    const phoneAnimationEnd = imagePhoneAnimation.startTime + imagePhoneAnimation.delay + imagePhoneAnimation.duration;
    const phonePreviewTime = mediaType === "image"
        ? phoneAnimationEnd
        : currentTime;
    const phonePreviewAnimation = useMemo(
        () => getMockupAnimationState(imagePhoneAnimation, phonePreviewTime),
        [imagePhoneAnimation, phonePreviewTime]
    );
    const phonePreviewTransform = useMemo(() => getMockupTransformState(imagePhoneAnimation, phonePreviewTime, {
        x: imagePhoneX,
        y: imagePhoneY,
        scale: imagePhoneScale,
        rotationX: imagePhoneRotX,
        rotationY: imagePhoneRotY,
        rotationZ: imagePhoneRotZ,
    }), [imagePhoneAnimation, phonePreviewTime, imagePhoneX, imagePhoneY, imagePhoneScale, imagePhoneRotX, imagePhoneRotY, imagePhoneRotZ]);
    const hasTransformKeyframes = (imagePhoneAnimation.keyframes ?? []).length > 0;
    const hasKeyframeAtPreviewTime = (imagePhoneAnimation.keyframes ?? []).some(keyframe => Math.abs(keyframe.time - phonePreviewTime) < 0.08);
    const updatePhoneKeyframeAtPreviewTime = useCallback((updates: Partial<MockupTransformKeyframe>) => {
        setImagePhoneAnimation(previous => {
            const keyframes = previous.keyframes ?? [];
            const existing = keyframes.find(keyframe => Math.abs(keyframe.time - phonePreviewTime) < 0.08);
            if (existing) return { ...previous, keyframes: keyframes.map(keyframe => keyframe.id === existing.id ? { ...keyframe, ...updates } : keyframe) };
            const transform = getMockupTransformState(previous, phonePreviewTime, {
                x: imagePhoneX, y: imagePhoneY, scale: imagePhoneScale,
                rotationX: imagePhoneRotX, rotationY: imagePhoneRotY, rotationZ: imagePhoneRotZ,
            });
            const created: MockupTransformKeyframe = {
                id: `mockup-keyframe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                time: phonePreviewTime,
                easing: "ease-in-out",
                ...transform,
                ...updates,
            };
            return { ...previous, keyframes: [...keyframes, created].sort((a, b) => a.time - b.time) };
        });
    }, [phonePreviewTime, setImagePhoneAnimation, imagePhoneX, imagePhoneY, imagePhoneScale, imagePhoneRotX, imagePhoneRotY, imagePhoneRotZ]);
    const handlePhoneRotationChange = useCallback((rx: number, ry: number) => {
        if (hasKeyframeAtPreviewTime) {
            updatePhoneKeyframeAtPreviewTime({ rotationX: rx, rotationY: ry });
        } else {
            setImagePhoneRotX(rx);
            setImagePhoneRotY(ry);
        }
    }, [hasKeyframeAtPreviewTime, setImagePhoneRotX, setImagePhoneRotY, updatePhoneKeyframeAtPreviewTime]);
    const phoneControlDimensions = DEVICE_3D_DIMENSIONS[imagePhoneDevice] ?? { width: PHONE_W, height: PHONE_H };
    const phoneTransformDragRef = useRef<{
        pointerId: number;
        mode: "move" | "resize";
        handle?: Corner;
        startX: number;
        startY: number;
        initialX: number;
        initialY: number;
        initialScale: number;
    } | null>(null);
    const [isTransformingPhone, setIsTransformingPhone] = useState(false);

    const beginPhoneTransform = useCallback((event: React.PointerEvent, mode: "move" | "resize", handle?: Corner) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        phoneTransformDragRef.current = {
            pointerId: event.pointerId,
            mode,
            handle,
            startX: event.clientX,
            startY: event.clientY,
            initialX: phonePreviewTransform.x,
            initialY: phonePreviewTransform.y,
            initialScale: phonePreviewTransform.scale,
        };
        setIsVideoSelected(true);
        setIsTransformingPhone(true);
    }, [phonePreviewTransform]);

    const movePhoneTransform = useCallback((event: React.PointerEvent) => {
        const drag = phoneTransformDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (drag.mode === "move") {
            const x = drag.initialX + dx;
            const y = drag.initialY + dy;
            if (hasTransformKeyframes) updatePhoneKeyframeAtPreviewTime({ x, y });
            else { setImagePhoneX(x); setImagePhoneY(y); }
        } else {
            const horizontalDirection = drag.handle?.endsWith("left") ? -1 : 1;
            const verticalDirection = drag.handle?.startsWith("top") ? -1 : 1;
            const delta = (dx * horizontalDirection + dy * verticalDirection) / 450;
            const scale = Math.max(0.2, Math.min(4, drag.initialScale + delta));
            if (hasTransformKeyframes) updatePhoneKeyframeAtPreviewTime({ scale });
            else setImagePhoneScale(scale);
        }
    }, [hasTransformKeyframes, setImagePhoneScale, setImagePhoneX, setImagePhoneY, updatePhoneKeyframeAtPreviewTime]);

    const endPhoneTransform = useCallback((event: React.PointerEvent) => {
        if (phoneTransformDragRef.current?.pointerId !== event.pointerId) return;
        phoneTransformDragRef.current = null;
        setIsTransformingPhone(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
    }, []);

    // Intrinsic aspect ratio of the actual media (video/image), used to size
    // the "none" mockup container to the real letterboxed contain-box instead
    // of the full available area.
    const [mediaAspect, setMediaAspect] = useState<number | null>(null);

    // Image zoom state (for photo mode)
    const [imageZoomScale, setImageZoomScale] = useState(1);

    const lastSetVideoUrlRef = useRef<string | null>(null);
    const preservedVideoStateRef = useRef<{ time: number; playing: boolean } | null>(null);

    // Reset lastSetVideoUrlRef when mockupId changes to force src re-assignment on remount
    useEffect(() => {
        lastSetVideoUrlRef.current = null;
    }, [mockupId]);

    useEffect(() => {
        if (videoRef.current && videoUrl) {
            // Always set src if video element has no src, src is empty, or we just changed mockup
            const videoSrc = videoRef.current.src;
            const needsSrc = !videoSrc || videoSrc === '' || videoSrc === window.location.href;
            const isNewUrl = videoUrl !== lastSetVideoUrlRef.current;

            if (needsSrc || isNewUrl) {
                videoRef.current.src = videoUrl;
                lastSetVideoUrlRef.current = videoUrl;

                if (preservedVideoStateRef.current) {
                    const { time, playing } = preservedVideoStateRef.current;
                    videoRef.current.currentTime = time;
                    if (playing) {
                        videoRef.current.play().catch(() => {
                            // Ignore play errors (may happen if video not ready)
                        });
                    }
                    preservedVideoStateRef.current = null;
                }
            }
        }
        if (!videoUrl) {
            lastSetVideoUrlRef.current = null;
        }
    }, [videoUrl, videoRef, mockupId]);

    // Preserve video state when mockup changes (detect unmount via cleanup)
    // Preserve video state when mockup changes (detect unmount via cleanup)
    useEffect(() => {
        return () => {
            if (videoRef.current && videoUrl) {
                preservedVideoStateRef.current = {
                    time: videoRef.current.currentTime,
                    playing: !videoRef.current.paused,
                };
            }
        };
    }, [mockupId, videoUrl, videoRef]);

    // Track the real intrinsic aspect ratio of the video so the "none"
    // mockup container can match the actual letterboxed contain-box.
    useEffect(() => {
        if (mediaType !== "video") return;
        const video = videoRef.current;
        if (!video) return;
        const updateAspect = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
                setMediaAspect(video.videoWidth / video.videoHeight);
            }
        };
        updateAspect();
        video.addEventListener("loadedmetadata", updateAspect);
        return () => video.removeEventListener("loadedmetadata", updateAspect);
    }, [mediaType, videoRef, videoUrl]);

    // Same, for image mode.
    useEffect(() => {
        if (mediaType !== "image") return;
        const img = imageRef?.current;
        if (!img) return;
        const updateAspect = () => {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setMediaAspect(img.naturalWidth / img.naturalHeight);
            }
        };
        updateAspect();
        img.addEventListener("load", updateAspect);
        return () => img.removeEventListener("load", updateAspect);
    }, [mediaType, imageRef, imageUrl]);

    // Dispose Three.js WebGL resources when component unmounts

    // Dispose Three.js WebGL resources when component unmounts
    useEffect(() => {
        return () => {
            disposePerspective3D();
        };
    }, []);
    const [isDraggingVideo, setIsDraggingVideo] = useState(false);
    const [isDraggingRotation, setIsDraggingRotation] = useState(false);
    const [isResizingVideo, setIsResizingVideo] = useState(false);
    const [videoHoverCorner, setVideoHoverCorner] = useState<Corner | null>("top-right");
    const dragStartPos = useRef({ x: 0, y: 0, initialRotation: 0, initialTranslateX: 0, initialTranslateY: 0 });
    const videoResizeDragRef = useRef<{ centerX: number; centerY: number; startDistance: number; initialScale: number } | null>(null);
    const rotationCenterRef = useRef<{ x: number; y: number } | null>(null);
    const rotationStartAngleRef = useRef<number>(0);
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const clickStartPosRef = useRef<{ x: number; y: number } | null>(null);
    const [backgroundVideoInteraction, setBackgroundVideoInteraction] = useState<
        { mode: "move" } | { mode: "resize"; handle: BackgroundResizeHandle } | null
    >(null);
    const backgroundVideoDragStartRef = useRef({
        clientX: 0,
        clientY: 0,
        transform: DEFAULT_BACKGROUND_VIDEO_TRANSFORM,
    });
    const CLICK_THRESHOLD = 5; // px
    const [elementCorners, setElementCorners] = useState<Record<string, Corner | null>>({});

    const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const canvasWrapperRef = useRef<HTMLDivElement>(null);

    const mockupBoxRef = useRef<HTMLDivElement>(null);
    const mockupContentRef = useRef<HTMLDivElement>(null);
    const [contentInsets, setContentInsets] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

    ctrlScrollWheelRef.current = (e: WheelEvent) => {
        if (!e.ctrlKey || !imagePhoneActive) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const next = Math.max(0.3, Math.min(3, imagePhoneScale * (e.deltaY < 0 ? 1.05 : 0.95)));
        setImagePhoneScale(next);
        setImagePhoneZoomVisible(true);
        if (imagePhoneZoomTimerRef.current) clearTimeout(imagePhoneZoomTimerRef.current);
        imagePhoneZoomTimerRef.current = setTimeout(() => setImagePhoneZoomVisible(false), 1200);
    };
    
    useEffect(() => {
        const el = previewContainerRef.current;
        if (!el) return;
        // Stable wrapper delegates to the always-fresh ref
        const handler = (e: WheelEvent) => ctrlScrollWheelRef.current?.(e);
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // attach once — ctrlScrollWheelRef.current updated each render

    const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
        const wrapper = canvasWrapperRef.current;
        if (!wrapper) return;

        const arNumber = getAspectRatioNumber(aspectRatio, customAspectRatio ?? undefined);

        const computeDims = (containerWidth: number, containerHeight: number) => {
            if (containerWidth <= 0 || containerHeight <= 0) return null;
            const byHeight = { width: containerHeight * arNumber, height: containerHeight };
            if (byHeight.width <= containerWidth) return byHeight;
            return { width: containerWidth, height: containerWidth / arNumber };
        };

        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            const dims = computeDims(width, height);
            if (dims) setCanvasDimensions(dims);
        });
        observer.observe(wrapper);

        const rect = wrapper.getBoundingClientRect();
        const initialDims = computeDims(rect.width, rect.height);
        if (initialDims) setCanvasDimensions(initialDims);

        return () => observer.disconnect();
    }, [aspectRatio, customAspectRatio]);

    const deviceDefaults = DEVICE_VIEWER_DEFAULTS[imagePhoneDevice] ?? { environment: "studio", glow: 1.0 };

    const [viewer3D, setViewer3D] = useState<Viewer3DControls>({
        autoRotate: false,
        rotationSpeed: 3.5,
        glow: deviceDefaults.glow,
        environment: deviceDefaults.environment,
    });

    const cameraDragRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        initialX: number;
        initialY: number;
        rect: DOMRect;
    } | null>(null);
    const [isDraggingCamera, setIsDraggingCamera] = useState(false);

    // Canvas elements controls state
    const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const [isDraggingElementRotation, setIsDraggingElementRotation] = useState(false);
    const elementDragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0, initialRotation: 0 });
    // Positions of ALL selected elements captured once at drag-start (stable ref, never updated during drag)
    const multiDragStartRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    // When clicking a multi-selected element, track potential collapse to single (cleared on actual drag)
    const pendingCollapseRef = useRef<string | null>(null);
    const wasDragRef = useRef(false);
    const pendingVideoCollapseRef = useRef(false);
    const pendingElementsCollapseRef = useRef(false);

    // Drag & drop state for images (photo mode only)
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const canvasContainerRef = useRef<HTMLDivElement>(null);

    // Inline text editing (Figma-style)
    const [editingTextId, setEditingTextId] = useState<string | null>(null);

    // Multi-select and canvas right-click context menu
    const [canvasSelectedIds, setCanvasSelectedIds] = useState<string[]>([]);
    const [canvasCtxMenu, setCanvasCtxMenu] = useState<{ x: number; y: number; isVideo?: boolean } | null>(null);
    const [videoContainerSize, setVideoContainerSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const container = videoContainerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(([entry]) => {
            setVideoContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);
    // Smart guides state for element alignment
    const [alignmentGuides, setAlignmentGuides] = useState<{
        vertical: number[];
        horizontal: number[];
    }>({ vertical: [], horizontal: [] });

    // Smart guides state for mockup/video alignment
    const [mockupAlignmentGuides, setMockupAlignmentGuides] = useState<{
        vertical: number[];
        horizontal: number[];
    }>({ vertical: [], horizontal: [] });

    const [rotationGuide, setRotationGuide] = useState<{
        centerX: number;
        centerY: number;
        angle: number;
        snapped: boolean;
    } | null>(null);

    // Wrapper for onElementSelect that also deselects the mockup/video
    const handleElementSelect = useCallback((id: string | null, preserveVideoSelection: boolean = false) => {
        if (id !== null && !preserveVideoSelection) {
            setIsVideoSelected(false);
        }
        if (onElementSelect) onElementSelect(id);
    }, [onElementSelect]);

    const handleLayersSelect = useCallback((id: string | null) => {
        handleElementSelect(id);
    }, [handleElementSelect]);

    const handleLayersMultiSelect = useCallback((ids: string[]) => {
        setCanvasSelectedIds(ids);
        if (ids.length === 1) handleElementSelect(ids[0]);
        else if (ids.length === 0) handleElementSelect(null);
    }, [handleElementSelect]);

    const handleLayersDelete = useCallback((idOrIds: string | string[]) => {
        if (onElementDelete) onElementDelete(idOrIds);
    }, [onElementDelete]);

    const handleLayersReorder = useCallback((frontIds: string[], backIds: string[]) => {
        frontIds.forEach((id, pos) => {
            if (onElementUpdate) onElementUpdate(id, { zIndex: VIDEO_Z_INDEX + frontIds.length - pos });
        });
        backIds.forEach((id, pos) => {
            if (onElementUpdate) onElementUpdate(id, { zIndex: Math.max(1, VIDEO_Z_INDEX - 1 - pos) });
        });
    }, [onElementUpdate]);

    const handleLayersSetGroupId = useCallback((id: string, groupId: string | undefined) => {
        if (onElementUpdate) onElementUpdate(id, { groupId });
    }, [onElementUpdate]);

    const handleLayersToggleVisible = useCallback((id: string, visible: boolean) => {
        if (onElementUpdate) onElementUpdate(id, { visible });
    }, [onElementUpdate]);

    const handleLayersToggleLock = useCallback((id: string, locked: boolean) => {
        if (onElementUpdate) onElementUpdate(id, { locked });
    }, [onElementUpdate]);

    const handleLayersBringToFront = useCallback((id: string) => {
        const maxZ = Math.max(...canvasElements.map(e => e.zIndex), VIDEO_Z_INDEX);
        if (onElementUpdate) onElementUpdate(id, { zIndex: maxZ + 1 });
    }, [canvasElements, onElementUpdate]);

    const handleLayersSendToBack = useCallback((id: string) => {
        const el = canvasElements.find(e => e.id === id);
        if (!el || !onElementUpdate) return;
        if (el.zIndex >= VIDEO_Z_INDEX) {
            onElementUpdate(id, { zIndex: VIDEO_Z_INDEX - 1 });
        } else {
            const minZ = Math.min(...canvasElements.map(e => e.zIndex));
            onElementUpdate(id, { zIndex: Math.max(1, minZ - 1) });
        }
    }, [canvasElements, onElementUpdate]);

    const handleLayersGroup = useCallback((ids: string[]) => {
        const newGroupId = crypto.randomUUID();
        ids.forEach(id => { if (onElementUpdate) onElementUpdate(id, { groupId: newGroupId }); });
    }, [onElementUpdate]);

    const handleLayersUngroup = useCallback((ids: string[]) => {
        const groupIds = new Set(
            ids.map(id => canvasElements.find(e => e.id === id)?.groupId).filter(Boolean)
        );
        canvasElements
            .filter(e => e.groupId && groupIds.has(e.groupId))
            .forEach(e => { if (onElementUpdate) onElementUpdate(e.id, { groupId: undefined }); });
    }, [canvasElements, onElementUpdate]);

    const handleVideoLayerSelect = useCallback(() => {
        handleElementSelect(null);
        setCanvasSelectedIds([]);
        setIsVideoSelected(true);
    }, [handleElementSelect]);

    useEffect(() => {
        if (!canvasCtxMenu) return;
        const close = (e: PointerEvent) => {
            if ((e.target as HTMLElement).closest("[data-canvas-ctx-menu]")) return;
            setCanvasCtxMenu(null);
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [!!canvasCtxMenu]); // eslint-disable-line react-hooks/exhaustive-deps

    const maskStyles = useMemo(() => {
        const config = mediaType === "video" ? videoMaskConfig : imageMaskConfig;
        return GetMediaMaskStyles(config);
    }, [mediaType, videoMaskConfig, imageMaskConfig]);

    const hasMask = Object.keys(maskStyles).length > 0;
    const hasMockup = mockupId && mockupId !== "none";

    // Effective aspect ratio for the "none" mockup contain-box, adjusted for
    // any active crop — mirrors the same math used in drawFrame's computeContainer.
    const mediaContainAspect = useMemo(() => {
        if (!mediaAspect) return null;
        if (cropArea && (cropArea.width < 100 || cropArea.height < 100)) {
            return mediaAspect * (cropArea.width / cropArea.height);
        }
        return mediaAspect;
    }, [mediaAspect, cropArea]);
    const effectivePhoneMaskConfig = useMemo(() => {
        return mediaType === "video" ? videoMaskConfig : imageMaskConfig;
    }, [mediaType, videoMaskConfig, imageMaskConfig]);

    const elementImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const svgImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

    useEffect(() => {
        const canvas = exportCanvasRef.current;
        if (canvas) {
            canvas.width = exportDimensions.width;
            canvas.height = exportDimensions.height;
        }
    }, [exportDimensions]);

    useEffect(() => {
        if (shouldShowWallpaper && wallpaperUrl) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = wallpaperUrl;
            img.onload = () => {
                wallpaperImageRef.current = img;
            };
        } else {
            wallpaperImageRef.current = null;
        }
    }, [shouldShowWallpaper, wallpaperUrl]);

    const imageUrlToLoad = shouldShowCustomImage ? selectedImageUrl : shouldShowUnsplashOverride ? unsplashOverrideUrl : null;
    useEffect(() => {
        if (imageUrlToLoad) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = imageUrlToLoad;
            img.onload = () => {
                customImageRef.current = img;
            };
        } else {
            customImageRef.current = null;
        }
    }, [imageUrlToLoad]);

    useEffect(() => {
        const backgroundVideo = backgroundVideoRef.current;
        if (!backgroundVideo || !shouldShowBackgroundVideo) return;

        const syncPlayback = () => {
            if (!Number.isFinite(backgroundVideo.duration) || backgroundVideo.duration <= 0) return;
            const target = currentTime % backgroundVideo.duration;
            if (Math.abs(backgroundVideo.currentTime - target) > 0.2) {
                backgroundVideo.currentTime = target;
            }

            if (mediaType === "image" || isPlaying) {
                backgroundVideo.play().catch(() => {});
            } else {
                backgroundVideo.pause();
            }
        };

        if (backgroundVideo.readyState >= HTMLMediaElement.HAVE_METADATA) {
            syncPlayback();
        } else {
            backgroundVideo.addEventListener("loadedmetadata", syncPlayback, { once: true });
        }

        return () => backgroundVideo.removeEventListener("loadedmetadata", syncPlayback);
    }, [shouldShowBackgroundVideo, selectedBackgroundVideoUrl, currentTime, isPlaying, mediaType, apply3DToBackground]);

    useEffect(() => {
        if (!imagePhoneActive) {
            setActivePhoneDevice(null);
            return;
        }
        if (imagePhoneDevice === activePhoneDevice) return;

        setPhoneTransitioning(true);
        setActivePhoneDevice(null);

        const id = setTimeout(() => {
            setActivePhoneDevice(imagePhoneDevice);
            setPhoneTransitioning(false);
        }, 50);

        return () => clearTimeout(id);
    }, [imagePhoneDevice, imagePhoneActive]);

    useEffect(() => {
        const cache = elementImagesRef.current;
        const loadedPaths = new Set(cache.keys());
        const currentPaths = new Set(
            canvasElements
                .filter((el): el is ImageElement => el.type === "image")
                .map(el => el.imagePath)
        );

        for (const path of loadedPaths) {
            if (!currentPaths.has(path)) {
                cache.delete(path);
            }
        }

        for (const element of canvasElements) {
            if (element.type === "image") {
                const imageElement = element as ImageElement;
                if (!cache.has(imageElement.imagePath)) {
                    const img = new Image();
                    img.crossOrigin = "anonymous";

                    img.onload = () => {
                        cache.set(imageElement.imagePath, img);
                    };

                    img.onerror = () => {
                        console.error(`Failed to load canvas element image: ${imageElement.imagePath}`);
                    };

                    img.src = imageElement.imagePath;
                }
            }
        }
    }, [canvasElements]);

    useEffect(() => {
        if (!isDraggingVideo && !isDraggingRotation && !isResizingVideo) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!onVideoTransformChange) return;

            if (isResizingVideo) {
                const resize = videoResizeDragRef.current;
                if (!resize) return;
                const distance = Math.hypot(e.clientX - resize.centerX, e.clientY - resize.centerY);
                const scale = Math.max(0.2, Math.min(4, resize.initialScale * distance / Math.max(1, resize.startDistance)));
                onVideoTransformChange({ ...videoTransform, scale });
            } else if (isDraggingRotation) {
                const center = rotationCenterRef.current;
                if (!center) return;

                const currentAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x) * (180 / Math.PI);
                let deltaAngle = currentAngle - rotationStartAngleRef.current;
                if (deltaAngle > 180) deltaAngle -= 360;
                if (deltaAngle < -180) deltaAngle += 360;

                const rawRotation = dragStartPos.current.initialRotation + deltaAngle;
                const { angle: finalRotation, snapped } = snapRotation(rawRotation);

                onVideoTransformChange({ ...videoTransform, rotation: finalRotation });
                setRotationGuide({ centerX: center.x, centerY: center.y, angle: finalRotation, snapped });
            } else if (isDraggingVideo) {
                const deltaX = e.clientX - dragStartPos.current.x;
                const deltaY = e.clientY - dragStartPos.current.y;
                const container = videoContainerRef.current;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const percentX = (deltaX / rect.width) * 100;
                const percentY = (deltaY / rect.height) * 100;

                let newTranslateX = dragStartPos.current.initialTranslateX + percentX;
                let newTranslateY = dragStartPos.current.initialTranslateY + percentY;

                const SNAP_THRESHOLD = 2;
                const centerX = 0;
                const centerY = 0;
                const guides: { vertical: number[]; horizontal: number[] } = { vertical: [], horizontal: [] };

                if (Math.abs(newTranslateX - centerX) < SNAP_THRESHOLD) {
                    newTranslateX = centerX;
                    guides.vertical.push(50);
                }

                if (Math.abs(newTranslateY - centerY) < SNAP_THRESHOLD) {
                    newTranslateY = centerY;
                    guides.horizontal.push(50);
                }

                if (
                    guides.vertical.length !== alignmentGuides.vertical.length ||
                    guides.horizontal.length !== alignmentGuides.horizontal.length
                ) {
                    setMockupAlignmentGuides(guides);

                }

                onVideoTransformChange({
                    ...videoTransform,
                    translateX: newTranslateX,
                    translateY: newTranslateY,
                });
            }
        };

        const handleMouseUp = () => {
            setIsDraggingVideo(false);
            setIsDraggingRotation(false);
            setIsResizingVideo(false);
            videoResizeDragRef.current = null;
            setMockupAlignmentGuides({ vertical: [], horizontal: [] });
            setRotationGuide(null);
            rotationCenterRef.current = null;
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDraggingVideo, isDraggingRotation, isResizingVideo, videoTransform, onVideoTransformChange]);

    useEffect(() => {
        if (!backgroundVideoInteraction || !onBackgroundVideoTransformChange) return;

        const handleMouseMove = (event: MouseEvent) => {
            const canvas = previewContainerRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const start = backgroundVideoDragStartRef.current;
            const deltaX = ((event.clientX - start.clientX) / rect.width) * 100;
            const deltaY = ((event.clientY - start.clientY) / rect.height) * 100;

            if (backgroundVideoInteraction.mode === "move") {
                onBackgroundVideoTransformChange({
                    ...start.transform,
                    x: Math.max(-200, Math.min(300, start.transform.x + deltaX)),
                    y: Math.max(-200, Math.min(300, start.transform.y + deltaY)),
                });
                return;
            }

            const handle = backgroundVideoInteraction.handle;
            let left = start.transform.x - start.transform.width / 2;
            let right = start.transform.x + start.transform.width / 2;
            let top = start.transform.y - start.transform.height / 2;
            let bottom = start.transform.y + start.transform.height / 2;

            if (handle.includes("w")) left = Math.min(left + deltaX, right - 8);
            if (handle.includes("e")) right = Math.max(right + deltaX, left + 8);
            if (handle.includes("n")) top = Math.min(top + deltaY, bottom - 8);
            if (handle.includes("s")) bottom = Math.max(bottom + deltaY, top + 8);

            onBackgroundVideoTransformChange({
                x: (left + right) / 2,
                y: (top + bottom) / 2,
                width: right - left,
                height: bottom - top,
            });
        };

        const handleMouseUp = () => setBackgroundVideoInteraction(null);
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [backgroundVideoInteraction, onBackgroundVideoTransformChange]);

    // Camera overlay: load src when cameraUrl changes
    useEffect(() => {
        const el = cameraVideoRef.current;
        if (!el) return;
        if (!cameraUrl) {
            if (el.src) {
                el.pause();
                el.removeAttribute("src");
                el.load();
            }
            return;
        }
        if (el.src !== cameraUrl) {
            el.src = cameraUrl;
            el.load();
        }
    }, [cameraUrl]);

    // Camera overlay: sync playback with main video (time, play/pause, seek)
    useEffect(() => {
        const mainVideo = videoRef.current;
        const camVideo = cameraVideoRef.current;
        if (!mainVideo || !camVideo || !cameraUrl) return;

        const syncTime = () => {
            if (!camVideo.seeking && Math.abs(camVideo.currentTime - mainVideo.currentTime) > 0.15) {
                try {
                    camVideo.currentTime = mainVideo.currentTime;
                } catch {
                    // ignore seek errors on not-yet-ready video
                }
            }
        };
        const syncPlay = () => {
            camVideo.play().catch(() => undefined);
        };
        const syncPause = () => {
            if (!camVideo.paused) camVideo.pause();
        };

        mainVideo.addEventListener("play", syncPlay);
        mainVideo.addEventListener("pause", syncPause);
        mainVideo.addEventListener("seeked", syncTime);
        mainVideo.addEventListener("timeupdate", syncTime);

        return () => {
            mainVideo.removeEventListener("play", syncPlay);
            mainVideo.removeEventListener("pause", syncPause);
            mainVideo.removeEventListener("seeked", syncTime);
            mainVideo.removeEventListener("timeupdate", syncTime);
        };
    }, [videoRef, cameraUrl]);

    // Capture start positions of all selected elements ONCE when drag begins
    useEffect(() => {
        if (!isDraggingElement) return;
        const snapshot = new Map<string, { x: number; y: number }>();
        canvasSelectedIds.forEach((id) => {
            const el = canvasElements.find((e) => e.id === id);
            if (el) snapshot.set(id, { x: el.x, y: el.y });
        });
        multiDragStartRef.current = snapshot;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDraggingElement]); // intentionally only fires when drag state changes

    // Canvas elements drag & drop handlers
    useEffect(() => {
        if (!isDraggingElement && !isDraggingElementRotation) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!onElementUpdate) return;

            if (isDraggingElementRotation) {
                if (!selectedElementId) return;
                const selectedElement = canvasElements.find(el => el.id === selectedElementId);
                if (!selectedElement) return;
                const container = canvasContainerRef.current;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const centerX = rect.left + rect.width * (selectedElement.x / 100);
                const centerY = rect.top + rect.height * (selectedElement.y / 100);
                const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
                const startAngle = Math.atan2(
                    elementDragStart.current.y - centerY,
                    elementDragStart.current.x - centerX
                ) * (180 / Math.PI);
                let deltaAngle = currentAngle - startAngle;
                if (deltaAngle > 180) deltaAngle -= 360;
                if (deltaAngle < -180) deltaAngle += 360;

                const rawRotation = elementDragStart.current.initialRotation + deltaAngle;
                const { angle: finalRotation, snapped } = snapRotation(rawRotation);

                onElementUpdate(selectedElementId, { rotation: finalRotation });
                setRotationGuide({ centerX, centerY, angle: finalRotation, snapped });
            } else if (isDraggingElement) {
                const container = canvasContainerRef.current;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const deltaX = e.clientX - elementDragStart.current.x;
                const deltaY = e.clientY - elementDragStart.current.y;

                if (!wasDragRef.current && Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) return;
                wasDragRef.current = true;
                pendingCollapseRef.current = null;
                pendingVideoCollapseRef.current = false;

                const percentX = (deltaX / rect.width) * 100;
                const percentY = (deltaY / rect.height) * 100;

                const combinedWithVideo = isVideoSelected && canvasSelectedIds.length >= 1;

                if (canvasSelectedIds.length > 1 || combinedWithVideo) {
                    multiDragStartRef.current.forEach((startPos, id) => {
                        const el = canvasElements.find(e => e.id === id);
                        if (!el || el.locked) return;
                        const newX = Math.max(0, Math.min(100, startPos.x + percentX));
                        const newY = Math.max(0, Math.min(100, startPos.y + percentY));
                        pendingMultiUpdatesRef.current.set(id, { x: newX, y: newY });
                    });
                    if (!rafDragRef.current) {
                        rafDragRef.current = requestAnimationFrame(() => {
                            if (onElementUpdate) {
                                pendingMultiUpdatesRef.current.forEach((pos, elId) => onElementUpdate(elId, pos));
                            }
                            pendingMultiUpdatesRef.current.clear();
                            rafDragRef.current = null;
                        });
                    }
                } else if (selectedElementId) {
                    let newX = Math.max(0, Math.min(100, elementDragStart.current.initialX + percentX));
                    let newY = Math.max(0, Math.min(100, elementDragStart.current.initialY + percentY));

                    const SNAP_THRESHOLD = 2;
                    const centerX = 50;
                    const centerY = 50;
                    const guides: { vertical: number[]; horizontal: number[] } = { vertical: [], horizontal: [] };

                    if (Math.abs(newX - centerX) < SNAP_THRESHOLD) {
                        newX = centerX;
                        guides.vertical.push(centerX);
                    }

                    if (Math.abs(newY - centerY) < SNAP_THRESHOLD) {
                        newY = centerY;
                        guides.horizontal.push(centerY);
                    }

                    if (
                        guides.vertical.length !== alignmentGuides.vertical.length ||
                        guides.horizontal.length !== alignmentGuides.horizontal.length
                    ) {
                        setAlignmentGuides(guides);
                    }

                    pendingUpdateRef.current = { id: selectedElementId, x: newX, y: newY };
                    if (!rafDragRef.current) {
                        rafDragRef.current = requestAnimationFrame(() => {
                            const pending = pendingUpdateRef.current;
                            if (pending && onElementUpdate) {
                                onElementUpdate(pending.id, { x: pending.x, y: pending.y });
                            }
                            rafDragRef.current = null;
                        });
                    }
                }
            }
        };

        const handleMouseUp = () => {
            if (pendingCollapseRef.current && !wasDragRef.current) {
                const id = pendingCollapseRef.current;
                setCanvasSelectedIds([id]);
                if (pendingVideoCollapseRef.current) setIsVideoSelected(false);
            }
            if (pendingElementsCollapseRef.current && !wasDragRef.current) {
                setCanvasSelectedIds([]);
                if (onElementSelect) onElementSelect(null);
            }
            pendingCollapseRef.current = null;
            pendingVideoCollapseRef.current = false;
            pendingElementsCollapseRef.current = false;
            wasDragRef.current = false;

            if (rafDragRef.current) {
                cancelAnimationFrame(rafDragRef.current);
                rafDragRef.current = null;
                if (pendingUpdateRef.current && onElementUpdate) {
                    const { id, x, y } = pendingUpdateRef.current;
                    onElementUpdate(id, { x, y });
                }
                pendingUpdateRef.current = null;
                if (onElementUpdate) {
                    pendingMultiUpdatesRef.current.forEach((pos, elId) => onElementUpdate(elId, pos));
                }
                pendingMultiUpdatesRef.current.clear();
            }

            setIsDraggingElement(false);
            setIsDraggingElementRotation(false);
            setAlignmentGuides({ vertical: [], horizontal: [] });
            setRotationGuide(null);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDraggingElement, isDraggingElementRotation, selectedElementId, canvasElements, canvasSelectedIds, isVideoSelected, onElementUpdate,]);

    // Image zoom with mouse wheel (photo mode only)
    useEffect(() => {
        if (mediaType !== "image" || !imageUrl || imagePhoneActive) return;

        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;

            e.preventDefault();

            const delta = -e.deltaY;
            const zoomFactor = delta > 0 ? 1.1 : 0.9;

            setImageZoomScale(prev => {
                const newScale = Math.max(0.5, Math.min(3, prev * zoomFactor));
                return newScale;
            });
        };

        const container = previewContainerRef.current;
        if (!container) return;

        container.addEventListener("wheel", handleWheel, { passive: false });
        return () => {
            container.removeEventListener("wheel", handleWheel);
        };
    }, [mediaType, imageUrl, imagePhoneActive]);

    // Drag & drop handlers for images
    const handleDragOver = (e: React.DragEvent) => {
        if (mediaType !== "image" || !onImageDrop) return;
        if (!e.dataTransfer.types.includes("Files")) return;

        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        if (mediaType !== "image") return;

        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        if (mediaType !== "image" || !onImageDrop) return;
        if (!e.dataTransfer.types.includes("Files")) return;

        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            onImageDrop(files);
        }
    };

    // Helper function to render canvas elements (SVG, images, text)
    const renderCanvasElements = async (
        ctx: CanvasRenderingContext2D,
        elements: typeof canvasElements,
        canvasWidth: number,
        canvasHeight: number,
        behindVideo: boolean,
        timelineTime: number,
    ) => {
        const filteredElements = elements.filter(el =>
            behindVideo ? el.zIndex < VIDEO_Z_INDEX : el.zIndex >= VIDEO_Z_INDEX
        );
        const sortedElements = [...filteredElements].sort((a, b) => a.zIndex - b.zIndex);

        // Use smaller dimension as reference for consistent scaling across different aspect ratios
        const referenceSize = Math.min(canvasWidth, canvasHeight);

        for (const element of sortedElements) {
            if (element.type === "svg") {
                const svgElement = element as SvgElement;
                const svgDataUrl = getSvgDataUrl(svgElement.svgId, svgElement.color || "#FFFFFF");
                if (!svgDataUrl) continue;

                const cacheKey = `${svgElement.svgId}-${svgElement.color || "#FFFFFF"}`;
                let svgImage = svgImageCacheRef.current.get(cacheKey);
                if (!svgImage || svgImage.src !== svgDataUrl) {
                    svgImage = new Image();
                    svgImageCacheRef.current.set(cacheKey, svgImage);
                    svgImage.src = svgDataUrl;
                    await new Promise<void>((resolve) => {
                        if (svgImage!.complete) resolve();
                        else { svgImage!.onload = () => resolve(); svgImage!.onerror = () => resolve(); }
                    });
                } else if (!svgImage.complete) {
                    await new Promise<void>((resolve) => {
                        svgImage!.onload = () => resolve();
                        svgImage!.onerror = () => resolve();
                        setTimeout(resolve, 500);
                    });
                }

                ctx.save();

                const elemX = (svgElement.x / 100) * canvasWidth;
                const elemY = (svgElement.y / 100) * canvasHeight;
                const elemWidth = (svgElement.width / 100) * referenceSize;
                const elemHeight = (svgElement.height / 100) * referenceSize;

                // Translate to element position, rotate, then draw centered
                ctx.translate(elemX, elemY);
                ctx.rotate((svgElement.rotation * Math.PI) / 180);
                ctx.globalAlpha = svgElement.opacity;

                ctx.drawImage(
                    svgImage,
                    -elemWidth / 2,
                    -elemHeight / 2,
                    elemWidth,
                    elemHeight
                );

                ctx.restore();
            } else if (element.type === "image") {
                const img = elementImagesRef.current.get(element.imagePath);
                if (!img) continue;

                ctx.save();

                const elemX = (element.x / 100) * canvasWidth;
                const elemY = (element.y / 100) * canvasHeight;

                // Calculate element dimensions using reference size to maintain consistent scaling
                const elemWidth = (element.width / 100) * referenceSize;
                const elemHeight = (element.height / 100) * referenceSize;

                // For images, maintain the original aspect ratio
                const imgAspectRatio = img.naturalWidth / img.naturalHeight;
                let finalWidth = elemWidth;
                let finalHeight = elemHeight;

                const elementAspectRatio = elemWidth / elemHeight;
                if (imgAspectRatio > elementAspectRatio) {
                    finalHeight = elemWidth / imgAspectRatio;
                } else {
                    finalWidth = elemHeight * imgAspectRatio;
                }

                ctx.translate(elemX, elemY);
                ctx.rotate((element.rotation * Math.PI) / 180);
                ctx.globalAlpha = element.opacity;

                ctx.drawImage(
                    img,
                    -finalWidth / 2,
                    -finalHeight / 2,
                    finalWidth,
                    finalHeight
                );

                ctx.restore();
            } else if (element.type === "text") {
                const textTime = mediaType === "image"
                    ? (element.startTime ?? 0) + (element.animation?.delay ?? 0) + (element.animation?.duration ?? 0)
                    : timelineTime;
                drawTextElement(ctx, element, canvasWidth, canvasHeight, textTime);
            }
        }
    };

    // Function to draw a frame on the export canvas
    const drawFrame = async (highQuality: boolean = true, explicitTimelineTime?: number) => {
        const canvas = exportCanvasRef.current;
        const canvasCtxOptions: CanvasRenderingContext2DSettings = { alpha: true, colorSpace: 'srgb', desynchronized: false, willReadFrequently: false };
        const ctx = canvas?.getContext('2d', canvasCtxOptions);
        const video = videoRef.current;
        const image = imageRef?.current;
        const mediaSource = mediaType === "image" ? image : video;

        if (!canvas || !ctx || !mediaSource) return;

        const sourceWidth = mediaType === "image" ? (image?.naturalWidth ?? 0) : (video?.videoWidth ?? 0);
        const sourceHeight = mediaType === "image" ? (image?.naturalHeight ?? 0) : (video?.videoHeight ?? 0);
        if (sourceWidth === 0 || sourceHeight === 0) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const paddingPercent = padding * 0.5 / 100;

        const scaledPaddingX = calculateScaledPadding(canvasWidth, paddingPercent);
        const scaledPaddingY = calculateScaledPadding(canvasHeight, paddingPercent);
        const scaledRadius = roundedCorners * (canvasWidth / 896);
        const scaledShadowBlur = shadows * (canvasWidth / 896) * 0.8;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        const frameTime = mediaType === "video"
            ? (explicitTimelineTime ?? (video ? video.currentTime : 0))
            : 0;
        const phoneFrameAnimation = getMockupAnimationState(
            imagePhoneAnimation,
            mediaType === "image" ? phoneAnimationEnd : frameTime,
        );
        const phoneFrameTransform = getMockupTransformState(imagePhoneAnimation, mediaType === "image" ? phoneAnimationEnd : frameTime, {
            x: imagePhoneX, y: imagePhoneY, scale: imagePhoneScale,
            rotationX: imagePhoneRotX, rotationY: imagePhoneRotY, rotationZ: imagePhoneRotZ,
        });
        const phoneVisible = imagePhoneActive && phoneFrameAnimation.visible;
        const zoomState = calculateSmoothZoom(frameTime, zoomFragments);
        const zoomCenterX = canvasWidth / 2;
        const zoomCenterY = canvasHeight / 2;
        const backgroundImage = (shouldShowCustomImage || shouldShowUnsplashOverride) ? customImageRef.current : (shouldShowWallpaper ? wallpaperImageRef.current : null);
        const backgroundVideo = shouldShowBackgroundVideo ? backgroundVideoRef.current : null;

        if (backgroundVideo) {
            await seekVideoFrame(backgroundVideo, frameTime);
        }

        // Shared helper: draw background into any 2D context
        const drawBg = (c: CanvasRenderingContext2D) => {
            if (shouldShowCustomColor && backgroundColorCss) {
                applyCanvasBackground(c, backgroundColorCss, canvasWidth, canvasHeight);
            } else if (backgroundVideo && backgroundVideo.videoWidth > 0 && backgroundVideo.videoHeight > 0) {
                c.save();
                const overflow = backgroundBlur > 0 ? backgroundBlur * 2 : 0;
                if (backgroundBlur > 0) c.filter = `blur(${backgroundBlur * 0.8}px)`;
                const boxWidth = canvasWidth * backgroundVideoTransform.width / 100;
                const boxHeight = canvasHeight * backgroundVideoTransform.height / 100;
                const boxX = canvasWidth * backgroundVideoTransform.x / 100 - boxWidth / 2;
                const boxY = canvasHeight * backgroundVideoTransform.y / 100 - boxHeight / 2;
                drawCover(c, backgroundVideo, backgroundVideo.videoWidth, backgroundVideo.videoHeight, boxWidth, boxHeight, boxX, boxY, overflow);
                c.restore();
            } else if (backgroundImage) {
                c.save();
                const overflow = backgroundBlur > 0 ? backgroundBlur * 2 : 0;
                if (backgroundBlur > 0) c.filter = `blur(${backgroundBlur * 0.8}px)`;
                drawCover(c, backgroundImage, backgroundImage.naturalWidth, backgroundImage.naturalHeight, canvasWidth, canvasHeight, 0, 0, overflow);
                c.restore();
            }
        };

        // Shared helper: compute container dimensions
        const computeContainer = () => {
            const availableWidth = canvasWidth - scaledPaddingX * 2;
            const availableHeight = canvasHeight - scaledPaddingY * 2;
            let mSrcW = sourceWidth;
            let mSrcH = sourceHeight;

            if (cropArea && (cropArea.width < 100 || cropArea.height < 100)) {
                mSrcW = (cropArea.width / 100) * sourceWidth;
                mSrcH = (cropArea.height / 100) * sourceHeight;
            }
            const mAR = mSrcW / mSrcH;
            const aAR = availableWidth / availableHeight;
            let cW: number, cH: number;
            if (mAR > aAR) {
                cW = availableWidth;
                cH = availableWidth / mAR;
            } else {
                cH = availableHeight;
                cW = availableHeight * mAR;
            }
            const cX = scaledPaddingX + (availableWidth - cW) / 2;
            const cY = scaledPaddingY + (availableHeight - cH) / 2;
            return { containerX: cX, containerY: cY, containerWidth: cW, containerHeight: cH };
        };

        // Shared helper: draw shadow + mockup + video into a 2D context
        const DEG_TO_RAD = Math.PI / 180;
        const drawMockupAndMedia = (
            c: CanvasRenderingContext2D,
            containerX: number, containerY: number, containerWidth: number, containerHeight: number,
            source: HTMLVideoElement | HTMLImageElement, applyImageXform: boolean
        ) => {
            const vCX = containerX + containerWidth / 2;
            const vCY = containerY + containerHeight / 2;
            const txPx = (videoTransform.translateX / 100) * containerWidth;
            const tyPx = (videoTransform.translateY / 100) * containerHeight;

            c.save();
            c.translate(vCX + txPx, vCY + tyPx);
            c.rotate(videoTransform.rotation * DEG_TO_RAD);
            const independentScale = videoTransform.scale ?? 1;
            c.scale(independentScale, independentScale);

            if (applyImageXform && imageTransform && !apply3DToBackground) {
                if (imageTransform.perspective && imageTransform.perspective > 0 && (imageTransform.rotateX !== 0 || imageTransform.rotateY !== 0)) {
                    const rotXR = imageTransform.rotateX * DEG_TO_RAD;
                    const rotYR = imageTransform.rotateY * DEG_TO_RAD;
                    const tanY2 = Math.tan(rotYR);
                    const tanX2 = Math.tan(rotXR);
                    const sX2 = 1 / Math.sqrt(1 + tanY2 * tanY2);
                    const sY2 = 1 / Math.sqrt(1 + tanX2 * tanX2);
                    c.transform(sX2, tanX2 * sY2, tanY2 * sX2, sY2, 0, 0);
                }
                c.rotate(imageTransform.rotateZ * DEG_TO_RAD);
                c.scale(imageTransform.scale * imageZoomScale, imageTransform.scale * imageZoomScale);
                const iTY = (imageTransform.translateY / 100) * containerHeight;
                c.translate(0, iTY / (imageTransform.scale * imageZoomScale));
            }
            c.translate(-vCX, -vCY);

            // Shadow
            if (shadows > 0 && !SELF_SHADOWING_MOCKUPS.includes(mockupId)) {
                c.save();
                c.shadowColor = 'rgba(0, 0, 0, 1)';
                c.shadowBlur = scaledShadowBlur;
                c.shadowOffsetY = scaledShadowBlur * 0.3;
                c.fillStyle = 'black';
                drawRoundedRect(c, containerX, containerY, containerWidth, containerHeight, scaledRadius);
                c.fill();
                c.restore();
            }

            // Mockup frame
            const hasMockupLocal = mockupId && mockupId !== "none";
            const mockupCfg = mockupConfig || DEFAULT_MOCKUP_CONFIG;
            let vX = containerX, vY = containerY, vW = containerWidth, vH = containerHeight, vR = scaledRadius;

            if (hasMockupLocal) {
                const mBlur = SELF_SHADOWING_MOCKUPS.includes(mockupId) ? scaledShadowBlur : 0;
                const mr = drawMockupToCanvas(c, mockupId, mockupCfg, containerX, containerY, containerWidth, containerHeight, scaledRadius, mBlur, canvasWidth);
                vX = mr.contentX;
                vY = mr.contentY;
                vW = mr.contentWidth;
                vH = mr.contentHeight;
                vR = mockupId === "outline"
                    ? scaledRadius * 1.6
                    : (mockupId === "iphone-slim" || mockupId === "glass-curve" || mockupId === "glass-full")
                        ? scaledRadius * 6
                        : scaledRadius;
            }

            c.save();
            const bottomOnly = hasMockupLocal && BOTTOM_ONLY_RADIUS_MOCKUPS.includes(mockupId);
            if (vR > 0) {
                if (bottomOnly) {
                    drawRoundedRectBottomOnly(c, vX, vY, vW, vH, vR);
                } else {
                    drawRoundedRect(c, vX, vY, vW, vH, vR);
                }
                c.clip();
            } else {
                c.beginPath();
                c.rect(vX, vY, vW, vH);
                c.clip();
            }

            if (mediaType === "video") {
                c.filter = 'saturate(130%) contrast(104%) brightness(103%)';
            }

            if (cropArea && (cropArea.width < 100 || cropArea.height < 100 || cropArea.x > 0 || cropArea.y > 0)) {
                const sX = (cropArea.x / 100) * sourceWidth;
                const sY = (cropArea.y / 100) * sourceHeight;
                const cW2 = (cropArea.width / 100) * sourceWidth;
                const cH2 = (cropArea.height / 100) * sourceHeight;
                c.drawImage(source, sX, sY, cW2, cH2, vX, vY, vW, vH);
            } else {
                c.drawImage(source, vX, vY, vW, vH);
            }
            c.restore();
            c.restore();
        };

        if (mediaType === "image") {
            ctx.save();
            if (imageTransform && apply3DToBackground) {
                ctx.translate(zoomCenterX, zoomCenterY);
                if (imageTransform.perspective && imageTransform.perspective > 0 &&
                    (imageTransform.rotateX !== 0 || imageTransform.rotateY !== 0)) {
                    const rXR = (imageTransform.rotateX * Math.PI) / 180;
                    const rYR = (imageTransform.rotateY * Math.PI) / 180;
                    const tY2 = Math.tan(rYR);
                    const tX2 = Math.tan(rXR);
                    const sX2 = 1 / Math.sqrt(1 + tY2 * tY2);
                    const sY2 = 1 / Math.sqrt(1 + tX2 * tX2);
                    ctx.transform(sX2, tX2 * sY2, tY2 * sX2, sY2, 0, 0);
                }
                ctx.rotate((imageTransform.rotateZ * Math.PI) / 180);
                ctx.scale(imageTransform.scale * imageZoomScale, imageTransform.scale * imageZoomScale);
                const iTY = (imageTransform.translateY / 100) * canvasHeight;
                ctx.translate(-zoomCenterX, -zoomCenterY + iTY);
            }
            drawBg(ctx);
            await renderCanvasElements(ctx, canvasElements, canvasWidth, canvasHeight, true, frameTime);
            const { containerX: cX, containerY: cY, containerWidth: cW, containerHeight: cH } = computeContainer();
            // Only draw the 2D mockup + media when the 3D phone overlay is NOT active.
            // In the preview, CSS opacity:0 hides the video layer; here we skip drawing it.
            if (!phoneVisible) {
                drawMockupAndMedia(ctx, cX, cY, cW, cH, image!, true);
            }
            await renderCanvasElements(ctx, canvasElements, canvasWidth, canvasHeight, false, frameTime);
            // ── Composite image phone mockup (WebGL snapshot) onto export canvas ──
            if (phoneVisible && imagePhoneCanvasRef.current) {
                const phoneGL = imagePhoneCanvasRef.current;
                const domW = canvasDimensions?.width ?? canvasWidth;
                const pxScale = canvasWidth / domW;
                const phoneCx = canvasWidth / 2 + phoneFrameTransform.x * pxScale;
                const phoneCy = canvasHeight / 2 + phoneFrameTransform.y * pxScale;
                // Use device-specific dimensions instead of generic PHONE_W/H
                const measuredDims = imagePhoneApiRef.current?.getVisualSize?.();
                const deviceDims = measuredDims ?? DEVICE_3D_DIMENSIONS[imagePhoneDevice] ?? { width: PHONE_W, height: PHONE_H };
                const drawW = deviceDims.width * phoneFrameTransform.scale * pxScale;
                const drawH = deviceDims.height * phoneFrameTransform.scale * pxScale;
                // Paint CSS-shadow replica as a 2D radial gradient underneath the model,
                // but only for devices whose 3D viewer doesn't already render ContactShadows.
                const hasBuiltInShadow = imagePhoneApiRef.current?.hasBuiltInShadow ?? false;
                if (imagePhoneShadow > 0.01 && !hasBuiltInShadow) {
                    const sT = imagePhoneShadow * imagePhoneShadow;
                    const sBlur = sT * 60;
                    const sOpacity = sT * 0.7;
                    const shadowEllipseW = drawW * (0.6 - sT * 0.1);
                    const shadowEllipseH = Math.max(4, sBlur * 0.55) * pxScale;
                    const shadowCenterY = phoneCy + drawH / 2 + sBlur * 0.2 * pxScale;
                    ctx.save();
                    ctx.globalAlpha = sOpacity;
                    ctx.filter = `blur(${Math.max(2, sBlur * 0.6) * pxScale}px)`;
                    ctx.beginPath();
                    ctx.ellipse(phoneCx, shadowCenterY, shadowEllipseW / 2, shadowEllipseH / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = imagePhoneShadowColor;
                    ctx.fill();
                    ctx.restore();
                }
                if (highQuality) {
                    imagePhoneApiRef.current?.setRotation?.(phoneFrameTransform.rotationX, phoneFrameTransform.rotationY, phoneFrameTransform.rotationZ);
                    imagePhoneApiRef.current?.renderAt(drawW, drawH);
                    ctx.drawImage(phoneGL, phoneCx - drawW / 2, phoneCy - drawH / 2, drawW, drawH);
                    imagePhoneApiRef.current?.restorePreview();
                } else {
                    ctx.drawImage(phoneGL, phoneCx - drawW / 2, phoneCy - drawH / 2, drawW, drawH);
                }
                if (effectivePhoneMaskConfig?.enabled) {
                    applyGradientMaskToRegion(ctx, phoneCx - drawW / 2, phoneCy - drawH / 2, drawW, drawH, effectivePhoneMaskConfig);
                }
            }
            ctx.restore();
            return;
        }

        const has3DEffect = zoomState.perspective > 0 && (zoomState.rotateX !== 0 || zoomState.rotateY !== 0);
        const hasZoom = zoomState.scale !== 1;

        // Find target scale from the active/previous zoom fragment.
        // We need S_target to compute the pivot point that gives identity at S=1
        // and pins the focus to the canvas center at S=S_target.
        const activeFragment = zoomFragments.find(
            f => frameTime >= f.startTime && frameTime <= f.endTime
        ) ?? zoomFragments
            .filter(f => f.endTime < frameTime)
            .sort((a, b) => b.endTime - a.endTime)[0];
        const targetScale = activeFragment ? zoomLevelToFactor(activeFragment.zoomLevel) : zoomState.scale;

        const boundedZoom = getBoundedZoomTransform(
            zoomState.scale,
            zoomState.focusX,
            zoomState.focusY,
            targetScale,
        );
        const zoomTranslateX = boundedZoom.translateXPercent / 100 * canvasWidth;
        const zoomTranslateY = boundedZoom.translateYPercent / 100 * canvasHeight;
        const pivotX = boundedZoom.pivotXPercent / 100 * canvasWidth;
        const pivotY = boundedZoom.pivotYPercent / 100 * canvasHeight;

        const applyVideoZoom = (c: CanvasRenderingContext2D) => {
            if (hasZoom) {
                c.translate(zoomTranslateX, zoomTranslateY);
                c.scale(zoomState.scale, zoomState.scale);
            }
        };

        let fgCanvas: HTMLCanvasElement | null = null;
        let fgCtx: CanvasRenderingContext2D | null = null;

        const BLEED_FACTOR = 1.5;
        const fgWidth = canvasWidth * BLEED_FACTOR;
        const fgHeight = canvasHeight * BLEED_FACTOR;
        const fgOffsetX = (fgWidth - canvasWidth) / 2;
        const fgOffsetY = (fgHeight - canvasHeight) / 2;

        if (has3DEffect) {
            if (!foregroundCanvasRef.current) {
                foregroundCanvasRef.current = document.createElement('canvas');
            }
            fgCanvas = foregroundCanvasRef.current;

            if (fgCanvas.width !== fgWidth || fgCanvas.height !== fgHeight) {
                fgCanvas.width = fgWidth;
                fgCanvas.height = fgHeight;
            }

            fgCtx = fgCanvas.getContext('2d', canvasCtxOptions);
            if (fgCtx) {
                fgCtx.setTransform(1, 0, 0, 1, 0, 0);
                fgCtx.clearRect(0, 0, fgWidth, fgHeight);
                fgCtx.imageSmoothingEnabled = true;
                fgCtx.imageSmoothingQuality = 'high';
            }
        }

        ctx.save();
        drawBg(ctx);
        ctx.restore();

        ctx.save();
        applyVideoZoom(ctx);
        await renderCanvasElements(ctx, canvasElements, canvasWidth, canvasHeight, true, frameTime);
        ctx.restore();

        await drawCameraOverlay(ctx, canvasWidth, canvasHeight);

        const { containerX, containerY, containerWidth, containerHeight } = computeContainer();

        if (has3DEffect && fgCanvas && fgCtx) {
            fgCtx.save();
            fgCtx.translate(fgOffsetX, fgOffsetY);
            if (!phoneVisible) {
                drawMockupAndMedia(fgCtx, containerX, containerY, containerWidth, containerHeight, video!, false);
            }
            if (phoneVisible && imagePhoneCanvasRef.current) {
                drawPhone3DCompositeWithZoom(ctx, canvasWidth, canvasHeight, frameTime, zoomState, highQuality, pivotX, pivotY);

            }
            fgCtx.restore();
            applyPerspective3D(fgCanvas, zoomState.rotateX, zoomState.rotateY, zoomState.perspective * BLEED_FACTOR);
            ctx.save();
            applyVideoZoom(ctx);
            ctx.drawImage(fgCanvas, -fgOffsetX, -fgOffsetY, fgWidth, fgHeight);
            ctx.restore();
        } else {
            const hasVideoMask = !!(videoMaskConfig?.enabled && (
                videoMaskConfig.top || videoMaskConfig.bottom ||
                videoMaskConfig.left || videoMaskConfig.right ||
                videoMaskConfig.angle !== undefined
            ));

            if (hasVideoMask) {
                const videoLayer = document.createElement('canvas');
                videoLayer.width = canvasWidth;
                videoLayer.height = canvasHeight;
                const vlCtx = videoLayer.getContext('2d', canvasCtxOptions);
                if (vlCtx) {
                    vlCtx.imageSmoothingEnabled = true;
                    vlCtx.imageSmoothingQuality = 'high';
                    if (!phoneVisible) {
                        drawMockupAndMedia(vlCtx, containerX, containerY, containerWidth, containerHeight, video!, false);
                    }

                    vlCtx.globalCompositeOperation = 'destination-in';
                    const vm = videoMaskConfig!;
                    const [cX, cY, cW, cH] = [containerX, containerY, containerWidth, containerHeight];

                    if (vm.top) {
                        const g = vlCtx.createLinearGradient(cX, cY, cX, cY + cH);
                        g.addColorStop(0, 'transparent');
                        g.addColorStop(vm.top.from / 100, 'transparent');
                        g.addColorStop((vm.top.to ?? 100) / 100, 'black');
                        vlCtx.fillStyle = g;
                        vlCtx.fillRect(0, 0, canvasWidth, canvasHeight);
                    }
                    if (vm.bottom) {
                        const g = vlCtx.createLinearGradient(cX, cY + cH, cX, cY);
                        g.addColorStop(0, 'transparent');
                        g.addColorStop(vm.bottom.from / 100, 'transparent');
                        g.addColorStop((vm.bottom.to ?? 100) / 100, 'black');
                        vlCtx.fillStyle = g;
                        vlCtx.fillRect(0, 0, canvasWidth, canvasHeight);
                    }
                    if (vm.left) {
                        const g = vlCtx.createLinearGradient(cX, cY, cX + cW, cY);
                        g.addColorStop(0, 'transparent');
                        g.addColorStop(vm.left.from / 100, 'transparent');
                        g.addColorStop((vm.left.to ?? 100) / 100, 'black');
                        vlCtx.fillStyle = g;
                        vlCtx.fillRect(0, 0, canvasWidth, canvasHeight);
                    }
                    if (vm.right) {
                        const g = vlCtx.createLinearGradient(cX + cW, cY, cX, cY);
                        g.addColorStop(0, 'transparent');
                        g.addColorStop(vm.right.from / 100, 'transparent');
                        g.addColorStop((vm.right.to ?? 100) / 100, 'black');
                        vlCtx.fillStyle = g;
                        vlCtx.fillRect(0, 0, canvasWidth, canvasHeight);
                    }
                    if (vm.angle !== undefined) {
                        const angleRad = (vm.angle * Math.PI) / 180;
                        const cx2 = cX + cW / 2;
                        const cy2 = cY + cH / 2;
                        const diag = Math.sqrt(cW * cW + cH * cH) / 2;
                        const g = vlCtx.createLinearGradient(
                            cx2 - Math.cos(angleRad) * diag, cy2 - Math.sin(angleRad) * diag,
                            cx2 + Math.cos(angleRad) * diag, cy2 + Math.sin(angleRad) * diag
                        );
                        g.addColorStop(0, 'transparent');
                        g.addColorStop((vm.angleFrom ?? 0) / 100, 'transparent');
                        g.addColorStop((vm.angleTo ?? 100) / 100, 'black');
                        vlCtx.fillStyle = g;
                        vlCtx.fillRect(0, 0, canvasWidth, canvasHeight);
                    }

                    // Composite masked layer to main canvas with zoom applied
                    ctx.save();
                    applyVideoZoom(ctx);
                    ctx.drawImage(videoLayer, 0, 0);
                    ctx.restore();
                }
                if (phoneVisible && imagePhoneCanvasRef.current) {
                    drawPhone3DCompositeWithZoom(ctx, canvasWidth, canvasHeight, frameTime, zoomState, highQuality, pivotX, pivotY);

                }

            } else {
                ctx.save();
                applyVideoZoom(ctx);
                if (!phoneVisible) {
                    drawMockupAndMedia(ctx, containerX, containerY, containerWidth, containerHeight, video!, false);
                }
                ctx.restore();

                if (phoneVisible && imagePhoneCanvasRef.current) {
                    drawPhone3DCompositeWithZoom(ctx, canvasWidth, canvasHeight, frameTime, zoomState, highQuality, pivotX, pivotY);

                }
            }
        }

        ctx.save();
        applyVideoZoom(ctx);
        await renderCanvasElements(ctx, canvasElements, canvasWidth, canvasHeight, false, frameTime);
        ctx.restore();

        await drawCameraOverlay(ctx, canvasWidth, canvasHeight);
    };

    const drawPhone3DCompositeWithZoom = (
        c: CanvasRenderingContext2D,
        canvasWidth: number,
        canvasHeight: number,
        _frameTime: number,
        zs: { scale: number; focusX: number; focusY: number },
        highQuality: boolean,
        pivotX: number,
        pivotY: number,
    ) => {
        const phoneAnimation = getMockupAnimationState(imagePhoneAnimation, _frameTime);
        if (!phoneAnimation.visible) return;
        const phoneTransform = getMockupTransformState(imagePhoneAnimation, _frameTime, {
            x: imagePhoneX, y: imagePhoneY, scale: imagePhoneScale,
            rotationX: imagePhoneRotX, rotationY: imagePhoneRotY, rotationZ: imagePhoneRotZ,
        });
        const phoneGL = imagePhoneCanvasRef.current!;
        const domW = canvasDimensions?.width ?? canvasWidth;
        const pxScale = canvasWidth / domW;
        const zScale = zs.scale;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const baseCx = centerX + (phoneTransform.x + phoneAnimation.translateX) * pxScale;
        const baseCy = centerY + (phoneTransform.y + phoneAnimation.translateY) * pxScale;

        const phoneCx = pivotX + zScale * (baseCx - pivotX);
        const phoneCy = pivotY + zScale * (baseCy - pivotY);

        const measuredDims = imagePhoneApiRef.current?.getVisualSize?.();
        const deviceDims = measuredDims ?? DEVICE_3D_DIMENSIONS[imagePhoneDevice] ?? { width: PHONE_W, height: PHONE_H };

        const drawW = deviceDims.width * phoneTransform.scale * phoneAnimation.scale * pxScale * zScale;
        const drawH = deviceDims.height * phoneTransform.scale * phoneAnimation.scale * pxScale * zScale;

        c.save();
        c.globalAlpha *= phoneAnimation.opacity;

        const hasBuiltInShadow = imagePhoneApiRef.current?.hasBuiltInShadow ?? false;
        if (imagePhoneShadow > 0.01 && !hasBuiltInShadow) {
            const sT = imagePhoneShadow * imagePhoneShadow;
            const sBlur = sT * 60;
            const sOpacity = sT * 0.7;
            c.save();
            c.globalAlpha = sOpacity;
            c.filter = `blur(${Math.max(2, sBlur * 0.6) * pxScale}px)`;
            c.beginPath();
            c.ellipse(
                phoneCx,
                phoneCy + drawH / 2 + sBlur * 0.2 * pxScale,
                drawW * (0.6 - sT * 0.1) / 2,
                Math.max(4, sBlur * 0.55) * pxScale / 2,
                0, 0, Math.PI * 2
            );
            c.fillStyle = imagePhoneShadowColor;
            c.fill();
            c.restore();
        }

        if (highQuality) {
            imagePhoneApiRef.current?.setRotation?.(phoneTransform.rotationX, phoneTransform.rotationY, phoneTransform.rotationZ);
            imagePhoneApiRef.current?.renderAt(drawW, drawH);
            c.drawImage(phoneGL, phoneCx - drawW / 2, phoneCy - drawH / 2, drawW, drawH);
            imagePhoneApiRef.current?.restorePreview();
        } else {
            c.drawImage(phoneGL, phoneCx - drawW / 2, phoneCy - drawH / 2, drawW, drawH);
        }

        if (effectivePhoneMaskConfig?.enabled) {
            applyGradientMaskToRegion(c, phoneCx - drawW / 2, phoneCy - drawH / 2, drawW, drawH, effectivePhoneMaskConfig);
        }
        c.restore();
    };

    const drawCameraOverlay = async (
        ctx: CanvasRenderingContext2D,
        canvasWidth: number,
        canvasHeight: number
    ) => {
        const camVideo = cameraVideoRef.current;
        const mainVideo = videoRef.current;

        if (!camVideo || !cameraConfig || !cameraConfig.enabled) return;
        if (!camVideo.videoWidth || !camVideo.videoHeight) return;

        if (mainVideo && camVideo.paused) {
            const targetTime = Math.min(mainVideo.currentTime, Math.max(0, camVideo.duration - 0.1));

            if (Math.abs(camVideo.currentTime - targetTime) > 0.05) {
                try {
                    camVideo.currentTime = targetTime;

                    await new Promise<void>((resolve) => {

                        const timeoutId = setTimeout(() => {
                            camVideo.removeEventListener("seeked", onSeeked);
                            resolve();
                        }, 2000);

                        const onSeeked = () => {
                            camVideo.removeEventListener("seeked", onSeeked);

                            const checkReady = setInterval(() => {
                                if (camVideo.readyState >= 2) {
                                    clearInterval(checkReady);
                                    clearTimeout(timeoutId);
                                    resolve();
                                }
                            }, 10);
                        };

                        camVideo.addEventListener("seeked", onSeeked);
                    });
                } catch (e) {
                    console.warn("Error en seek de la cámara:", e);
                }
            }
        }

        // ... From here, the rest of the code continues as-is:
        const { size, left: drawX, top: drawY } = getCameraLayout(
            cameraConfig,
            canvasWidth,
            canvasHeight
        );
        if (size <= 0) return;

        const shortSide = Math.min(canvasWidth, canvasHeight);

        const sizePercent = cameraConfig.size * 100;
        const sizeMultiplier = 0.5 + (sizePercent - 20) / 40;

        const srcShort = Math.min(camVideo.videoWidth, camVideo.videoHeight);
        const sx = (camVideo.videoWidth - srcShort) / 2;
        const sy = (camVideo.videoHeight - srcShort) / 2;

        ctx.save();

        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowBlur = shortSide * 0.02;
        ctx.shadowOffsetY = shortSide * 0.008;

        if (cameraConfig.shape === "circle") {
            const centerX = drawX + size / 2;
            const centerY = drawY + size / 2;
            const radius = size / 2;

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.clip();
        } else {
            const radius =
                cameraConfig.shape === "squircle"
                    ? Math.round(85 * sizeMultiplier)
                    : Math.round(6 * sizeMultiplier);

            drawRoundedRect(ctx, drawX, drawY, size, size, radius);
            ctx.fill();

            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            drawRoundedRect(ctx, drawX, drawY, size, size, radius);
            ctx.clip();
        }

        if (camVideo && camVideo.readyState >= 2) {
            if (cameraConfig.mirror) {
                ctx.translate(drawX + size, drawY);
                ctx.scale(-1, 1);
                ctx.drawImage(camVideo, sx, sy, srcShort, srcShort, 0, 0, size, size);
            } else {
                ctx.drawImage(camVideo, sx, sy, srcShort, srcShort, drawX, drawY, size, size);
            }
        }
        ctx.restore();
    };

    useImperativeHandle(ref, () => ({
        getExportCanvas: () => exportCanvasRef.current,
        drawFrame,
        getPreviewContainer: () => previewContainerRef.current,
        clearAllSelection: () => {
            const prev = { multiIds: [...canvasSelectedIds], videoSelected: isVideoSelected };
            setCanvasSelectedIds([]);
            setIsVideoSelected(false);
            return prev;
        },
        restoreSelectionState: (state: { multiIds: string[]; videoSelected: boolean }) => {
            setCanvasSelectedIds(state.multiIds);
            setIsVideoSelected(state.videoSelected);
        },
    }));

    const handleTextEditEnd = useCallback((id: string, content: string) => {
        if (!content.trim()) {
            if (onElementDelete) onElementDelete(id);
        } else {
            if (onElementUpdate) onElementUpdate(id, { content });
        }
        setEditingTextId(null);
    }, [onElementDelete, onElementUpdate]);

    useEffect(() => {
        const box = mockupBoxRef.current;
        const content = mockupContentRef.current;
        if (!box || !content) return;

        const measure = () => {
            const boxRect = box.getBoundingClientRect();
            const contentRect = content.getBoundingClientRect();
            setContentInsets({
                top: contentRect.top - boxRect.top,
                bottom: boxRect.bottom - contentRect.bottom,
                left: contentRect.left - boxRect.left,
                right: boxRect.right - contentRect.right,
            });
        };

        const observer = new ResizeObserver(measure);
        observer.observe(box);
        observer.observe(content);
        measure();

        return () => observer.disconnect();
    }, [hasMockup, mockupId, mockupConfig]);

    const mockupBoxSize = useMemo(() => {
        if (!mediaContainAspect) return null;
        const { width: Wp, height: Hp } = videoContainerSize;
        if (Wp <= 0 || Hp <= 0) return null;

        const hI = contentInsets.left + contentInsets.right;
        const vI = contentInsets.top + contentInsets.bottom;

        if (hI <= 0 && vI <= 0) {
            if (Wp / Hp > mediaContainAspect) {
                const H = Hp;
                return { width: H * mediaContainAspect, height: H };
            }
            return { width: Wp, height: Wp / mediaContainAspect };
        }

        const widthBoundHeight = vI + (Wp - hI) / mediaContainAspect;
        if (widthBoundHeight <= Hp) {
            return { width: Wp, height: widthBoundHeight };
        }
        const heightBoundWidth = hI + mediaContainAspect * (Hp - vI);
        return { width: heightBoundWidth, height: Hp };
    }, [mediaContainAspect, videoContainerSize, contentInsets]);

    const mockupChildren = useMemo(() => (
        hasMedia ? (
            <div ref={mockupContentRef} className="relative flex items-center justify-center overflow-hidden w-full h-full rounded-[inherit]">
                <MediaContent
                    mediaType={mediaType}
                    videoUrl={videoUrl}
                    videoRef={videoRef}
                    imageUrl={imageUrl}
                    imageRef={imageRef}
                    cropArea={cropArea}
                    hasMask={hasMask}
                    hasMockup={!!hasMockup}
                    maskStyles={maskStyles}
                    currentThumbnail={currentThumbnail}
                    isVideoHovered={isVideoHovered}
                    onTimeUpdate={onTimeUpdate}
                    onLoadedMetadata={onLoadedMetadata}
                    onEnded={onEnded}
                    previewScale={previewScale}
                    isPlaying={isPlaying}
                />
            </div>
        ) : (
            <div ref={mockupContentRef} className="w-full h-full aspect-video min-w-75 bg-[#1E1E1E] border border-white/10 flex flex-col overflow-hidden">
                <PlaceholderEditor
                    onVideoUpload={mediaType === "video"
                        ? onVideoUpload
                        : (files) => {
                            const file = files[0];
                            if (file) onImageUpload?.(file);
                        }}
                    isUploading={isUploading}
                    mediaType={mediaType}
                />
            </div>
        )
    ), [
        hasMedia, mediaType, videoUrl, videoRef, imageUrl, imageRef,
        cropArea, hasMask, hasMockup, maskStyles, currentThumbnail, isVideoHovered,
        onTimeUpdate, onLoadedMetadata, onEnded, onVideoUpload, onImageUpload, isUploading,
        previewScale, isPlaying,
    ]);

    const handleHitTestElementSelect = useCallback((id: string | null) => {
        wasDragRef.current = false;
        if (id) {
            const isGroupMember = canvasSelectedIds.includes(id) && (canvasSelectedIds.length > 1 || isVideoSelected);
            handleElementSelect(id, isGroupMember);
            if (!canvasSelectedIds.includes(id)) {
                setCanvasSelectedIds([id]);
                pendingCollapseRef.current = null;
                pendingVideoCollapseRef.current = false;
            } else if (isGroupMember) {
                pendingCollapseRef.current = id;
            }
        } else {
            handleElementSelect(null);
            setCanvasSelectedIds([]);
            pendingCollapseRef.current = null;
            pendingVideoCollapseRef.current = false;
        }
    }, [canvasSelectedIds, isVideoSelected, handleElementSelect]);

    const handleGroupDragStart = useCallback((e: React.MouseEvent) => {
        wasDragRef.current = false;
        setIsDraggingVideo(true);
        dragStartPos.current = {
            x: e.clientX, y: e.clientY,
            initialRotation: videoTransform.rotation,
            initialTranslateX: videoTransform.translateX,
            initialTranslateY: videoTransform.translateY,
        };
        pendingVideoCollapseRef.current = true;
    }, [videoTransform]);

    const handleDoubleClickText = useCallback((id: string) => {
        setEditingTextId(id);
    }, []);

    return (
        <div
            className="flex-1 flex items-center justify-center min-h-0 min-w-0 overflow-hidden bg-[#09090B] p-2 sm:p-4 lg:p-1 relative"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onContextMenu={(e) => {
                const target = e.target as HTMLElement;
                const isElementTarget = !!target.closest('[data-canvas-element]');
                const isVideoTarget = !isElementTarget && (
                    !!target.closest('[data-video-container]') || !!target.closest('[data-image-phone-overlay]')
                );
                if (isElementTarget && canvasElements.length === 0) return;
                if (!isElementTarget && !isVideoTarget) return;

                e.preventDefault();
                if (isVideoTarget) {
                    setIsVideoSelected(true);
                    if (onElementSelect) onElementSelect(null);
                    setCanvasSelectedIds([]);
                }
                setCanvasCtxMenu({ x: e.clientX, y: e.clientY, isVideo: isVideoTarget });
            }}
        >
            {mediaType === "image" && isDraggingOver && (
                <DropImage />
            )}

            {canvasCtxMenu && (
                <CanvasContextMenu
                    canvasCtxMenu={canvasCtxMenu}
                    canvasSelectedIds={canvasSelectedIds}
                    selectedElementId={selectedElementId}
                    canvasElements={canvasElements}
                    VIDEO_Z_INDEX={VIDEO_Z_INDEX}
                    onElementUpdate={onElementUpdate}
                    onElementDelete={onElementDelete}
                    setCanvasCtxMenu={setCanvasCtxMenu}
                    setCanvasSelectedIds={setCanvasSelectedIds}
                    isVideoTarget={canvasCtxMenu?.isVideo}
                    onVideoBringToFront={() => {
                        canvasElements.forEach((el, i) => {
                            if (onElementUpdate) onElementUpdate(el.id, { zIndex: Math.max(1, VIDEO_Z_INDEX - 1 - i) });
                        });
                    }}
                    onVideoSendToBack={() => {
                        canvasElements.forEach((el, i) => {
                            if (onElementUpdate) onElementUpdate(el.id, { zIndex: VIDEO_Z_INDEX + canvasElements.length - i });
                        });
                    }}
                />
            )}

            <RotationGuideLine rotationGuide={rotationGuide} />

            <div className="absolute inset-0 pointer-events-none z-0"
                style={{ backgroundImage: 'radial-gradient(rgb(39, 39, 42) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
            </div>
            <canvas
                ref={exportCanvasRef}
                className="hidden"
            />

            {/* ── Canvas + Layers panel side-by-side ── */}
            <div className="flex items-stretch min-h-0 min-w-0 w-full h-full justify-center gap-0">

                <div ref={canvasWrapperRef} className="flex-1 flex items-center justify-center min-h-0 min-w-0 mr-1">
                    <div className="relative shrink-0 rounded-xl border border-white/20 overflow-hidden">
                        <div
                            ref={previewContainerRef}
                            className="relative shrink-0 transition-all duration-300 overflow-hidden"
                            style={{
                                aspectRatio: getAspectRatioStyle(aspectRatio, customAspectRatio ?? undefined),
                                ...(canvasDimensions
                                    ? { width: `${canvasDimensions.width}px`, height: `${canvasDimensions.height}px` }
                                    : { width: '100%', height: 'auto', maxHeight: '100%' }
                                ),
                                containerType: 'size',

                            }}
                            onClick={(e) => {
                                if (
                                    !(e.target as HTMLElement).closest('[data-canvas-element]') &&
                                    !(e.target as HTMLElement).closest('[data-camera-overlay]') &&
                                    !(e.target as HTMLElement).closest('[data-video-container]') &&
                                    !(e.target as HTMLElement).closest('[data-phone-overlay]') &&
                                    !(e.target as HTMLElement).closest('[data-image-phone-overlay]')
                                ) {
                                    if (onElementSelect) onElementSelect(null);
                                    setIsVideoSelected(false);
                                    setCanvasSelectedIds([]);
                                }
                            }}
                        >
                            {/* Zoom container - applies zoom to entire composition (background + video) */}
                            <div className="absolute inset-0"
                                style={{
                                    perspective: mediaType === "image" && imageTransform && apply3DToBackground ? `${imageTransform.perspective || 600}px` : 'none',
                                    perspectiveOrigin: 'center center',
                                    // Propagate overflow:visible so the 3D phone overlay in image mode
                                    // is never clipped when the user rotates or drags it outside bounds.
                                    overflow: 'hidden',
                                }}
                            >
                                {!(mediaType === "image" && apply3DToBackground) && (
                                    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                                        {shouldShowBackgroundVideo ? (
                                            <div
                                                className="absolute transition-all duration-200"
                                                style={{
                                                    left: `${backgroundVideoTransform.x}%`,
                                                    top: `${backgroundVideoTransform.y}%`,
                                                    width: `${backgroundVideoTransform.width}%`,
                                                    height: `${backgroundVideoTransform.height}%`,
                                                    transform: "translate(-50%, -50%)",
                                                }}
                                            >
                                                <video
                                                    ref={backgroundVideoRef}
                                                    src={selectedBackgroundVideoUrl}
                                                    className="absolute inset-0 h-full w-full object-cover"
                                                    style={{
                                                        filter: backgroundBlur > 0 ? `blur(${backgroundBlur * 0.4}px)` : "none",
                                                        transform: backgroundBlur > 0 ? `scale(${1 + backgroundBlur / 150})` : "none",
                                                    }}
                                                    muted
                                                    loop
                                                    playsInline
                                                    preload="auto"
                                                />
                                            </div>
                                        ) : (
                                            <div className="absolute transition-all duration-200" style={{ inset: backgroundBlur > 0 ? `-${backgroundBlur}px` : '0', ...(shouldShowCustomColor && backgroundColorCss ? backgroundColorCss.startsWith('#') || backgroundColorCss.startsWith('rgb') ? { backgroundColor: backgroundColorCss } : { backgroundImage: backgroundColorCss } : (shouldShowCustomImage || shouldShowUnsplashOverride) ? { backgroundImage: `url('${shouldShowCustomImage ? selectedImageUrl : unsplashOverrideUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center', } : shouldShowWallpaper ? { backgroundImage: `url('${wallpaperUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center', } : { backgroundColor: 'transparent' }), filter: backgroundBlur > 0 ? `blur(${backgroundBlur * 0.4}px)` : 'none', }} />
                                        )}
                                    </div>
                                )}

                                {/* Zoom + translate layer (+ 3D transform for image mode when apply3DToBackground is true) */}
                                <div className="absolute inset-0 origin-center"
                                    style={{
                                        transform: mediaType === "image" && imageTransform && apply3DToBackground
                                            ? `rotateX(${imageTransform.rotateX}deg) rotateY(${imageTransform.rotateY}deg) rotateZ(${imageTransform.rotateZ}deg) scale(${imageTransform.scale * imageZoomScale}) translateY(${imageTransform.translateY}%)`
                                            : `translate(${zoomTransform.translateX}%, ${zoomTransform.translateY}%) scale(${zoomTransform.scale})`,
                                        transformOrigin: mediaType === "image" && apply3DToBackground ? "center center" : "top left",
                                        perspective: !(mediaType === "image" && apply3DToBackground) && zoomTransform.perspective > 0
                                            ? `${(zoomTransform.perspective / 10.8).toFixed(1)}cqh` : 'none',
                                        transformStyle: mediaType === "image" && apply3DToBackground ? 'preserve-3d' : undefined,
                                        transition: mediaType === "image" && apply3DToBackground
                                            ? 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                                            : zoomTransform.isMoving ? `transform ${zoomTransform.transitionMs}ms linear` : `transform ${zoomTransform.transitionMs}ms ${ZOOM_EASING}`,
                                        // Allow the 3D phone to overflow this layer when in image-phone mode
                                        overflow: 'hidden',
                                    }}
                                >
                                    {/* FONDO 3D: Solo se renderiza aquí adentro cuando el modo imagen 3D está activo */}
                                    {(mediaType === "image" && apply3DToBackground) && (
                                        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0, transform: 'translateZ(-1px)' }}>
                                            {shouldShowBackgroundVideo ? (
                                                <div
                                                    className="absolute transition-all duration-200"
                                                    style={{
                                                        left: `${backgroundVideoTransform.x}%`,
                                                        top: `${backgroundVideoTransform.y}%`,
                                                        width: `${backgroundVideoTransform.width}%`,
                                                        height: `${backgroundVideoTransform.height}%`,
                                                        transform: "translate(-50%, -50%) translateZ(-1px)",
                                                    }}
                                                >
                                                    <video
                                                        ref={backgroundVideoRef}
                                                        src={selectedBackgroundVideoUrl}
                                                        className="absolute inset-0 h-full w-full object-cover"
                                                        style={{
                                                            filter: backgroundBlur > 0 ? `blur(${backgroundBlur * 0.4}px)` : "none",
                                                            transform: backgroundBlur > 0 ? `scale(${1 + backgroundBlur / 150})` : "none",
                                                        }}
                                                        muted
                                                        loop
                                                        playsInline
                                                        preload="auto"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="absolute transition-all duration-200" style={{ inset: '-50%', ...(shouldShowCustomColor && backgroundColorCss ? backgroundColorCss.startsWith('#') || backgroundColorCss.startsWith('rgb') ? { backgroundColor: backgroundColorCss } : { backgroundImage: backgroundColorCss } : (shouldShowCustomImage || shouldShowUnsplashOverride) ? { backgroundImage: `url('${shouldShowCustomImage ? selectedImageUrl : unsplashOverrideUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center', } : shouldShowWallpaper ? { backgroundImage: `url('${wallpaperUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center', } : { backgroundColor: 'transparent' }), filter: backgroundBlur > 0 ? `blur(${backgroundBlur * 0.4}px)` : 'none', }} />
                                            )}
                                        </div>
                                    )}
                                    {/* Capa 2A: Canvas elements BEHIND video — sin rotación 3D */}
                                    <CanvasElementsLayer
                                        canvasContainerRef={canvasContainerRef}
                                        canvasElements={canvasElements}
                                        selectedElementId={selectedElementId}
                                        selectedElementIds={canvasSelectedIds}
                                        hoveredElementId={hoveredElementId}
                                        isDraggingElement={isDraggingElement}
                                        behindVideo={true}
                                        onElementSelect={handleElementSelect}
                                        onElementUpdate={onElementUpdate}
                                        setHoveredElementId={setHoveredElementId}
                                        setIsDraggingElement={setIsDraggingElement}
                                        setIsDraggingElementRotation={setIsDraggingElementRotation}
                                        elementDragStart={elementDragStart}
                                        layerZIndex={1}
                                        elementCorners={elementCorners}
                                        setElementCorners={setElementCorners}
                                        editingTextId={editingTextId}
                                        onTextEditEnd={handleTextEditEnd}
                                        currentTime={mediaType === "image" ? -1 : currentTime}
                                    />

                                    {/* 3D rotation layer — solo envuelve el mockup, el fondo queda plano */}
                                    <div
                                        className="absolute inset-0 origin-center"
                                        style={{
                                            transform: zoomTransform.perspective > 0 ? `rotateX(${zoomTransform.rotateX}deg) rotateY(${zoomTransform.rotateY}deg)` : 'none',
                                            transition: `transform ${zoomTransform.transitionMs}ms ${ZOOM_EASING}`,
                                            willChange: zoomTransform.perspective > 0 ? 'transform' : 'auto',
                                            transformStyle: 'preserve-3d',
                                            zIndex: 2,
                                            pointerEvents: 'none',
                                            // Allow the 3D phone overlay to overflow when in image-phone mode
                                            overflow: 'hidden',

                                        }}
                                    >
                                        {/* Capa 2B: Video con padding, esquinas redondeadas y sombras */}
                                        <div
                                            className="absolute inset-0 flex items-center justify-center transition-all duration-200"
                                            style={{
                                                padding: `${padding * 0.5}%`,
                                                zIndex: 2,
                                                pointerEvents: 'none',
                                                // Hide the video layer while a motion template is active;
                                                // the video element stays in the DOM so playback/timing continues.
                                                // In image mode, also hide when the phone overlay is active.
                                                opacity: imagePhoneActive && phonePreviewAnimation.visible ? 0 : 1,
                                                transition: 'opacity 0.25s ease, padding 0.2s',
                                                ...(mediaType === "image" && imageTransform && !apply3DToBackground ? {
                                                    perspective: `${imageTransform.perspective || 600}px`,
                                                    perspectiveOrigin: 'center center',
                                                } : {}),
                                                // Allow the 3D phone overlay to overflow this padding layer
                                                overflow: imagePhoneActive ? 'visible' : 'hidden',
                                            }}
                                        >
                                            <div
                                                ref={videoContainerRef}
                                                data-video-container
                                                className="relative flex w-full h-full items-center justify-center max-w-full max-h-full"
                                                style={{
                                                    transform: mediaType === "image" && imageTransform && !apply3DToBackground
                                                        ? `
                                                        translate(${videoTransform.translateX}%, ${videoTransform.translateY}%) 
                                                        rotate(${videoTransform.rotation}deg)
                                                        scale(${videoTransform.scale ?? 1})
                                                        rotateX(${imageTransform.rotateX}deg)
                                                        rotateY(${imageTransform.rotateY}deg)
                                                        rotateZ(${imageTransform.rotateZ}deg)
                                                        scale(${imageTransform.scale * imageZoomScale})
                                                        translateY(${imageTransform.translateY}%)
                                                      `
                                                        : `translate(${videoTransform.translateX}%, ${videoTransform.translateY}%) rotate(${videoTransform.rotation}deg) scale(${videoTransform.scale ?? 1})`,
                                                    cursor: isDraggingVideo ? 'move' : (isVideoHovered && hasMedia ? 'move' : 'default'),
                                                    transition: (isDraggingVideo || isDraggingRotation)
                                                        ? 'none' : (mediaType === "image" && imageTransform && !apply3DToBackground)
                                                            ? 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                                                            : 'transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                                    pointerEvents: 'none',
                                                    transformStyle: mediaType === "image" && !apply3DToBackground ? 'preserve-3d' : undefined,
                                                }}
                                                onMouseEnter={() => hasMedia && setIsVideoHovered(true)}
                                                onMouseLeave={() => {
                                                    setIsVideoHovered(false);
                                                    setVideoHoverCorner(null);
                                                }}
                                                onMouseDown={(e) => {
                                                    if (!hasMedia || !onVideoTransformChange) return;
                                                    if ((e.target as HTMLElement).closest('[data-rotation-handle], [data-resize-handle]')) return;
                                                    e.preventDefault();
                                                    wasDragRef.current = false;

                                                    const isGroupMember = isVideoSelected && canvasSelectedIds.length > 0;

                                                    if (e.shiftKey) {
                                                        setIsVideoSelected((prev) => !prev);
                                                    } else if (isGroupMember) {
                                                        pendingElementsCollapseRef.current = true;
                                                    } else {
                                                        setIsVideoSelected(true);
                                                        if (onElementSelect) onElementSelect(null);
                                                        setCanvasSelectedIds([]);
                                                    }

                                                    setVideoHoverCorner(getNearestCorner(e, videoTransform.rotation));
                                                    setIsDraggingVideo(true);
                                                    dragStartPos.current = {
                                                        x: e.clientX, y: e.clientY,
                                                        initialRotation: videoTransform.rotation,
                                                        initialTranslateX: videoTransform.translateX,
                                                        initialTranslateY: videoTransform.translateY,
                                                    };
                                                    clickStartPosRef.current = { x: e.clientX, y: e.clientY };

                                                    if (canvasSelectedIds.length > 0) {
                                                        setIsDraggingElement(true);
                                                        elementDragStart.current = { x: e.clientX, y: e.clientY, initialX: 0, initialY: 0, initialRotation: 0 };
                                                    }
                                                }}
                                                onMouseMove={(e) => { if (hasMedia) setVideoHoverCorner(getNearestCorner(e, videoTransform.rotation)); }}
                                                onClick={(e) => {
                                                    if ((e.target as HTMLElement).closest('[data-rotation-handle], [data-resize-handle]')) return;
                                                    if (!onMockupClick) return;
                                                    if (mockupId === "none" || mockupId === undefined) return;
                                                    // Only fire if pointer stayed within CLICK_THRESHOLD (i.e. a click, not a drag)
                                                    const start = clickStartPosRef.current;
                                                    clickStartPosRef.current = null;
                                                    if (!start) return;
                                                    const dx = e.clientX - start.x;
                                                    const dy = e.clientY - start.y;
                                                    if (dx * dx + dy * dy > CLICK_THRESHOLD * CLICK_THRESHOLD) return;
                                                    onMockupClick("2d");
                                                }}
                                            >
                                                <div
                                                    ref={mockupBoxRef}
                                                    className="relative"
                                                    style={{
                                                        pointerEvents: imagePhoneActive ? 'none' : 'auto',
                                                        ...(mockupBoxSize
                                                            ? { width: `${mockupBoxSize.width}px`, height: `${mockupBoxSize.height}px` }
                                                            : { width: '100%', height: '100%' }),
                                                    }}
                                                >
                                                    {isVideoSelected && videoHoverCorner && hasMedia && onVideoTransformChange && !isDraggingVideo && !isDraggingRotation && (
                                                        <div
                                                            data-rotation-handle
                                                            style={getCornerStyle(videoHoverCorner, -14)}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                const container = videoContainerRef.current;
                                                                if (!container) return;
                                                                const rect = container.getBoundingClientRect();
                                                                const centerX = rect.left + rect.width / 2;
                                                                const centerY = rect.top + rect.height / 2;
                                                                rotationCenterRef.current = { x: centerX, y: centerY };
                                                                rotationStartAngleRef.current = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
                                                                setIsDraggingRotation(true);
                                                                dragStartPos.current = {
                                                                    x: e.clientX,
                                                                    y: e.clientY,
                                                                    initialRotation: videoTransform.rotation,
                                                                    initialTranslateX: videoTransform.translateX,
                                                                    initialTranslateY: videoTransform.translateY,
                                                                };
                                                            }}
                                                        >
                                                            <div style={{
                                                                transform: `scale(${mediaType === "image" && imageTransform && !apply3DToBackground
                                                                    ? 1 / (imageTransform.scale * imageZoomScale)
                                                                    : 1
                                                                    })`,
                                                                transformOrigin: "center center"
                                                            }}>
                                                                <RotationHandleIcon corner={videoHoverCorner} color="#e5e7eb" />
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(isVideoSelected || isVideoHovered) && hasMedia && !isDraggingRotation && !imagePhoneActive && (
                                                        <div
                                                            className={`absolute -inset-px border pointer-events-none z-10 opacity-80 ${isVideoSelected ? 'border-blue-500' : 'border-white'}`}
                                                            style={{ borderRadius: `${roundedCorners + 1}px` }}
                                                        />
                                                    )}

                                                    {isVideoSelected && hasMedia && hasMockup && onVideoTransformChange && !isDraggingRotation && (
                                                        <>
                                                            {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((corner) => (
                                                                <button
                                                                    key={corner}
                                                                    type="button"
                                                                    data-resize-handle
                                                                    aria-label={`Resize 2D mockup from ${corner}`}
                                                                    onMouseDown={(event) => {
                                                                        if (event.button !== 0) return;
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        const rect = videoContainerRef.current?.getBoundingClientRect();
                                                                        if (!rect) return;
                                                                        const centerX = rect.left + rect.width / 2;
                                                                        const centerY = rect.top + rect.height / 2;
                                                                        videoResizeDragRef.current = {
                                                                            centerX,
                                                                            centerY,
                                                                            startDistance: Math.hypot(event.clientX - centerX, event.clientY - centerY),
                                                                            initialScale: videoTransform.scale ?? 1,
                                                                        };
                                                                        setIsResizingVideo(true);
                                                                    }}
                                                                    className="absolute z-30 size-3 rounded-[2px] border-2 border-white bg-blue-600 shadow-sm"
                                                                    style={{
                                                                        left: corner.endsWith("left") ? -6 : undefined,
                                                                        right: corner.endsWith("right") ? -6 : undefined,
                                                                        top: corner.startsWith("top") ? -6 : undefined,
                                                                        bottom: corner.startsWith("bottom") ? -6 : undefined,
                                                                        cursor: corner === "top-left" || corner === "bottom-right" ? "nwse-resize" : "nesw-resize",
                                                                        transform: `scale(${1 / Math.max(0.2, videoTransform.scale ?? 1)})`,
                                                                    }}
                                                                />
                                                            ))}
                                                        </>
                                                    )}

                                                    <div
                                                        className="w-full h-full"
                                                        style={hasMask && hasMockup ? maskStyles : {}}
                                                    >
                                                        <MockupWrapper
                                                            mockupId={mockupId}
                                                            config={mockupConfig ?? DEFAULT_MOCKUP_CONFIG}
                                                            roundedCorners={roundedCorners}
                                                            shadows={shadows}
                                                        >
                                                            {mockupChildren}
                                                        </MockupWrapper>
                                                    </div>
                                                </div>
                                            </div>
                                            <div
                                                className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 transition-transform"
                                                style={{
                                                    transform: mediaType === "image" && imageTransform && !apply3DToBackground
                                                        ? `translate(${videoTransform.translateX}%, ${videoTransform.translateY}%) rotate(${videoTransform.rotation}deg) scale(${videoTransform.scale ?? 1}) rotateX(${imageTransform.rotateX}deg) rotateY(${imageTransform.rotateY}deg) rotateZ(${imageTransform.rotateZ}deg) translateY(${imageTransform.translateY}%)`
                                                        : `translate(${videoTransform.translateX}%, ${videoTransform.translateY}%) rotate(${videoTransform.rotation}deg) scale(${videoTransform.scale ?? 1})`,
                                                    transformStyle: mediaType === "image" && !apply3DToBackground ? 'preserve-3d' : undefined,
                                                }}
                                            >
                                                <EditorHoverTooltip show={isVideoHovered && !imagePhoneActive && mediaType === "image"} />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Capa 3: Canvas elements ABOVE video (zIndex >= VIDEO_Z_INDEX) */}
                                    <CanvasElementsLayer
                                        canvasContainerRef={undefined}
                                        canvasElements={canvasElements}
                                        selectedElementId={selectedElementId}
                                        selectedElementIds={canvasSelectedIds}
                                        hoveredElementId={hoveredElementId}
                                        isDraggingElement={isDraggingElement}
                                        behindVideo={false}
                                        onElementSelect={handleElementSelect}
                                        onElementUpdate={onElementUpdate}
                                        setHoveredElementId={setHoveredElementId}
                                        setIsDraggingElement={setIsDraggingElement}
                                        setIsDraggingElementRotation={setIsDraggingElementRotation}
                                        elementDragStart={elementDragStart}
                                        layerZIndex={200}
                                        elementCorners={elementCorners}
                                        setElementCorners={setElementCorners}
                                        editingTextId={editingTextId}
                                        onTextEditEnd={handleTextEditEnd}
                                        currentTime={mediaType === "image" ? -1 : currentTime}
                                    />

                                    {/* Capa HIT: invisible, todos los elementos, para recibir eventos */}
                                    <CanvasElementsLayer
                                        canvasContainerRef={undefined}
                                        canvasElements={canvasElements}
                                        selectedElementId={selectedElementId}
                                        selectedElementIds={canvasSelectedIds}
                                        hoveredElementId={hoveredElementId}
                                        isDraggingElement={isDraggingElement}
                                        behindVideo={true}
                                        onElementSelect={handleHitTestElementSelect}
                                        onMultiSelect={setCanvasSelectedIds}
                                        videoIncludedInSelection={isVideoSelected}
                                        onGroupDragStart={handleGroupDragStart}
                                        onElementUpdate={onElementUpdate}
                                        setHoveredElementId={setHoveredElementId}
                                        setIsDraggingElement={setIsDraggingElement}
                                        setIsDraggingElementRotation={setIsDraggingElementRotation}
                                        elementDragStart={elementDragStart}
                                        layerZIndex={200}
                                        hitTestOnly={true}
                                        elementCorners={elementCorners}
                                        setElementCorners={setElementCorners}
                                        editingTextId={editingTextId}
                                        onDoubleClickText={handleDoubleClickText}
                                        onTextEditEnd={handleTextEditEnd}
                                        currentTime={mediaType === "image" ? -1 : currentTime}
                                    />

                                    {/* ── 3D phone overlay (video & image mode) ── */}
                                    {imagePhoneActive && (
                                        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 155, overflow: "visible" }}>
                                            <Viewer3DControlsBridge
                                                environment={deviceDefaults.environment}
                                                glow={deviceDefaults.glow}
                                                onChange={setViewer3D}
                                            />
                                            <ControlsPopup />
                                            <div
                                                className="absolute"
                                                style={{
                                                    left: "50%",
                                                    top: "50%",
                                                    transform: `translate(calc(-50% + ${phonePreviewTransform.x + phonePreviewAnimation.translateX}px), calc(-50% + ${phonePreviewTransform.y + phonePreviewAnimation.translateY}px))`,
                                                    opacity: phonePreviewAnimation.opacity,
                                                    transformOrigin: "center center",
                                                    pointerEvents: "none",
                                                    userSelect: "none",
                                                    zIndex: 9999,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        position: "absolute",
                                                        left: "50%",
                                                        transform: "translateX(-50%)",
                                                        pointerEvents: "none",
                                                    }}
                                                >
                                                    <EditorHoverTooltip show={isVideoHovered && mediaType === "image"} />
                                                </div>
                                            </div>

                                            <div
                                                className="absolute"
                                                data-image-phone-overlay
                                                onMouseEnter={() => setIsVideoHovered(true)}
                                                onMouseLeave={() => setIsVideoHovered(false)}
                                                onPointerDown={(e) => {
                                                    if (!imagePhoneActive) return;
                                                    setIsVideoSelected(true);
                                                    if (onElementSelect) onElementSelect(null);
                                                    setCanvasSelectedIds([]);
                                                    if (!onMockupClick) return;
                                                    clickStartPosRef.current = { x: e.clientX, y: e.clientY };
                                                }}
                                                onClick={(e) => {
                                                    if (!onMockupClick) return;
                                                    if (!imagePhoneActive) return;
                                                    const start = clickStartPosRef.current;
                                                    clickStartPosRef.current = null;
                                                    if (!start) return;
                                                    const dx = e.clientX - start.x;
                                                    const dy = e.clientY - start.y;
                                                    if (dx * dx + dy * dy > CLICK_THRESHOLD * CLICK_THRESHOLD) return;
                                                    e.stopPropagation();
                                                    onMockupClick("3d");
                                                }}
                                                style={{
                                                    left: "50%",
                                                    top: "50%",
                                                    transform: `translate(calc(-50% + ${phonePreviewTransform.x + phonePreviewAnimation.translateX}px), calc(-50% + ${phonePreviewTransform.y + phonePreviewAnimation.translateY}px)) scale(${phonePreviewTransform.scale * phonePreviewAnimation.scale})`,
                                                    transformOrigin: "center center",
                                                    opacity: phonePreviewAnimation.opacity,
                                                    visibility: phonePreviewAnimation.visible ? "visible" : "hidden",
                                                    pointerEvents: phonePreviewAnimation.visible ? "auto" : "none",
                                                    userSelect: "none",
                                                    filter:
                                                        imagePhoneShadow > 0 && imagePhoneDevice !== "laptop"
                                                            ? `drop-shadow(0px ${18 * imagePhoneShadow}px ${28 * imagePhoneShadow}px ${imagePhoneShadowColor})`
                                                            : "none",
                                                }}
                                            >
                                                {phoneTransitioning || !activePhoneDevice ? (
                                                    <div
                                                        style={{ width: PHONE_W, height: PHONE_H }}
                                                        className="flex items-center justify-center"
                                                    >
                                                        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                                    </div>
                                                ) : activePhoneDevice === "laptop" ? (
                                                    <Laptop3DViewer
                                                        key="laptop"
                                                        imageUrl={imageUrl}
                                                        videoElement={mediaType === "video" ? videoRef.current : undefined}
                                                        openingProgress={imagePhoneOpening}
                                                        imageMaskConfig={effectivePhoneMaskConfig}
                                                        cropArea={cropArea}
                                                        initialRotationX={phonePreviewTransform.rotationX}
                                                        initialRotationY={phonePreviewTransform.rotationY}
                                                        initialRotationZ={phonePreviewTransform.rotationZ}
                                                        onRotationChange={handlePhoneRotationChange}
                                                        onMount={handlePhoneMount}
                                                        onApi={handlePhoneApi}
                                                        scale={1}
                                                        zoom={1}
                                                        shadowIntensity={imagePhoneShadow}
                                                        shadowColor={imagePhoneShadowColor}
                                                        autoRotate={viewer3D.autoRotate}
                                                        rotationSpeed={viewer3D.rotationSpeed}
                                                        glow={viewer3D.glow}
                                                        environment={viewer3D.environment}
                                                        isSelected={isVideoSelected}
                                                        isHovered={isVideoHovered}
                                                        isPlaying={isPlaying}
                                                        previewDpr={previewDpr}
                                                    />
                                                ) : activePhoneDevice === "iphone-13-pro-max" ? (
                                                    <IPhone13ProMax3DViewer
                                                        key="iphone-13-pro-max"
                                                        imageUrl={imageUrl}
                                                        videoElement={mediaType === "video" ? videoRef.current : undefined}
                                                        imageMaskConfig={effectivePhoneMaskConfig}
                                                        cropArea={cropArea}
                                                        initialRotationX={phonePreviewTransform.rotationX}
                                                        initialRotationY={phonePreviewTransform.rotationY}
                                                        initialRotationZ={phonePreviewTransform.rotationZ}
                                                        onRotationChange={handlePhoneRotationChange}
                                                        onMount={handlePhoneMount}
                                                        onApi={handlePhoneApi}
                                                        scale={1}
                                                        zoom={1}
                                                        shadowIntensity={imagePhoneShadow}
                                                        shadowColor={imagePhoneShadowColor}
                                                        autoRotate={viewer3D.autoRotate}
                                                        rotationSpeed={viewer3D.rotationSpeed}
                                                        glow={viewer3D.glow}
                                                        environment={viewer3D.environment}
                                                        isSelected={isVideoSelected}
                                                        isHovered={isVideoHovered}
                                                        isPlaying={isPlaying}
                                                        previewDpr={previewDpr}
                                                    />
                                                ) : activePhoneDevice === "iphone-17-pro-max" ? (
                                                    <IPhone17ProMax3DViewer
                                                        key="iphone-17-pro-max"
                                                        imageUrl={imageUrl}
                                                        videoElement={mediaType === "video" ? videoRef.current : undefined}
                                                        imageMaskConfig={effectivePhoneMaskConfig}
                                                        cropArea={cropArea}
                                                        initialRotationX={phonePreviewTransform.rotationX}
                                                        initialRotationY={phonePreviewTransform.rotationY}
                                                        initialRotationZ={phonePreviewTransform.rotationZ}
                                                        onRotationChange={handlePhoneRotationChange}
                                                        onMount={handlePhoneMount}
                                                        onApi={handlePhoneApi}
                                                        scale={1}
                                                        zoom={1}
                                                        shadowIntensity={imagePhoneShadow}
                                                        shadowColor={imagePhoneShadowColor}
                                                        autoRotate={viewer3D.autoRotate}
                                                        rotationSpeed={viewer3D.rotationSpeed}
                                                        glow={viewer3D.glow}
                                                        environment={viewer3D.environment}
                                                        isSelected={isVideoSelected}
                                                        isHovered={isVideoHovered}
                                                        isPlaying={isPlaying}
                                                        previewDpr={previewDpr}
                                                    />
                                                ) : activePhoneDevice === "double_iphone_13_pro" ? (
                                                    <DoubleIPhone3DViewer
                                                        key="double_iphone_13_pro"
                                                        imageUrl={imageUrl}
                                                        videoElement={mediaType === "video" ? videoRef.current : undefined}
                                                        imageMaskConfig={effectivePhoneMaskConfig}
                                                        cropArea={cropArea}
                                                        initialRotationX={phonePreviewTransform.rotationX}
                                                        initialRotationY={phonePreviewTransform.rotationY}
                                                        initialRotationZ={phonePreviewTransform.rotationZ}
                                                        onRotationChange={handlePhoneRotationChange}
                                                        onMount={handlePhoneMount}
                                                        onApi={handlePhoneApi}
                                                        zoom={1}
                                                        shadowIntensity={imagePhoneShadow}
                                                        shadowColor={imagePhoneShadowColor}
                                                        autoRotate={viewer3D.autoRotate}
                                                        rotationSpeed={viewer3D.rotationSpeed}
                                                        glow={viewer3D.glow}
                                                        environment={viewer3D.environment}
                                                        isSelected={isVideoSelected}
                                                        isHovered={isVideoHovered}
                                                        isPlaying={isPlaying}
                                                        previewDpr={previewDpr}
                                                    />
                                                ) : activePhoneDevice === "ipad_mini_6_2021" ? (
                                                    <IPadMini63DViewer
                                                        key="ipad_mini_6_2021"
                                                        imageUrl={imageUrl}
                                                        videoElement={mediaType === "video" ? videoRef.current : undefined}
                                                        imageMaskConfig={effectivePhoneMaskConfig}
                                                        cropArea={cropArea}
                                                        initialRotationX={phonePreviewTransform.rotationX}
                                                        initialRotationY={phonePreviewTransform.rotationY}
                                                        initialRotationZ={phonePreviewTransform.rotationZ}
                                                        onRotationChange={handlePhoneRotationChange}
                                                        onMount={handlePhoneMount}
                                                        onApi={handlePhoneApi}
                                                        zoom={1}
                                                        shadowIntensity={imagePhoneShadow}
                                                        shadowColor={imagePhoneShadowColor}
                                                        autoRotate={viewer3D.autoRotate}
                                                        rotationSpeed={viewer3D.rotationSpeed}
                                                        glow={viewer3D.glow}
                                                        environment={viewer3D.environment}
                                                        isSelected={isVideoSelected}
                                                        isHovered={isVideoHovered}
                                                        isPlaying={isPlaying}
                                                        previewDpr={previewDpr}
                                                    />

                                                ) : (
                                                    <Phone3DViewer
                                                        key={imagePhoneDevice}
                                                        imageUrl={imageUrl}
                                                        videoElement={mediaType === "video" ? videoRef.current : undefined}
                                                        imageMaskConfig={effectivePhoneMaskConfig}
                                                        cropArea={cropArea}
                                                        initialRotationX={phonePreviewTransform.rotationX}
                                                        initialRotationY={phonePreviewTransform.rotationY}
                                                        initialRotationZ={phonePreviewTransform.rotationZ}
                                                        modelUrl={imagePhoneModelUrl}
                                                        scale={1}
                                                        zoom={1}
                                                        shadowIntensity={imagePhoneShadow}
                                                        shadowColor={imagePhoneShadowColor}
                                                        onRotationChange={handlePhoneRotationChange}
                                                        onMount={handlePhoneMount}
                                                        onApi={handlePhoneApi}
                                                        autoRotate={viewer3D.autoRotate}
                                                        rotationSpeed={viewer3D.rotationSpeed}
                                                        glow={viewer3D.glow}
                                                        environment={viewer3D.environment}
                                                        isSelected={isVideoSelected}
                                                        isHovered={isVideoHovered}
                                                        isPlaying={isPlaying}
                                                        previewDpr={previewDpr}
                                                    />
                                                )}
                                            </div>

                                            {isVideoSelected && phonePreviewAnimation.visible && (
                                                <div
                                                    aria-label="Mobile mockup transform controls"
                                                    style={{
                                                        position: "absolute",
                                                        left: "50%",
                                                        top: "50%",
                                                        width: phoneControlDimensions.width,
                                                        height: phoneControlDimensions.height,
                                                        transform: `translate(calc(-50% + ${phonePreviewTransform.x + phonePreviewAnimation.translateX}px), calc(-50% + ${phonePreviewTransform.y + phonePreviewAnimation.translateY}px)) scale(${phonePreviewTransform.scale * phonePreviewAnimation.scale})`,
                                                        transformOrigin: "center center",
                                                        border: "2px solid rgb(59 130 246)",
                                                        borderRadius: 10,
                                                        boxShadow: "0 0 0 1px rgba(255,255,255,.7)",
                                                        pointerEvents: "none",
                                                        zIndex: 10000,
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        aria-label="Drag mobile mockup"
                                                        onPointerDown={(event) => beginPhoneTransform(event, "move")}
                                                        onPointerMove={movePhoneTransform}
                                                        onPointerUp={endPhoneTransform}
                                                        onPointerCancel={endPhoneTransform}
                                                        style={{
                                                            position: "absolute",
                                                            left: "50%",
                                                            top: -34,
                                                            transform: `translateX(-50%) scale(${1 / Math.max(0.2, phonePreviewTransform.scale * phonePreviewAnimation.scale)})`,
                                                            transformOrigin: "bottom center",
                                                            pointerEvents: "auto",
                                                            cursor: isTransformingPhone ? "grabbing" : "grab",
                                                            borderRadius: 999,
                                                            border: "1px solid rgba(255,255,255,.55)",
                                                            background: "rgb(37 99 235)",
                                                            color: "white",
                                                            padding: "4px 10px",
                                                            fontSize: 11,
                                                            fontWeight: 600,
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        Drag mockup
                                                    </button>
                                                    {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((corner) => (
                                                        <button
                                                            key={corner}
                                                            type="button"
                                                            aria-label={`Resize mobile mockup from ${corner}`}
                                                            onPointerDown={(event) => beginPhoneTransform(event, "resize", corner)}
                                                            onPointerMove={movePhoneTransform}
                                                            onPointerUp={endPhoneTransform}
                                                            onPointerCancel={endPhoneTransform}
                                                            style={{
                                                                position: "absolute",
                                                                width: 14,
                                                                height: 14,
                                                                padding: 0,
                                                                border: "2px solid white",
                                                                borderRadius: 3,
                                                                background: "rgb(37 99 235)",
                                                                pointerEvents: "auto",
                                                                cursor: corner === "top-left" || corner === "bottom-right" ? "nwse-resize" : "nesw-resize",
                                                                left: corner.endsWith("left") ? -8 : undefined,
                                                                right: corner.endsWith("right") ? -8 : undefined,
                                                                top: corner.startsWith("top") ? -8 : undefined,
                                                                bottom: corner.startsWith("bottom") ? -8 : undefined,
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {/* End perspective wrapper div */}
                                {(isDraggingElement && (alignmentGuides.vertical.length > 0 || alignmentGuides.horizontal.length > 0)) && (
                                    <>
                                        {alignmentGuides.vertical.map((x, index) => (
                                            <div
                                                key={`v-${index}`}
                                                className="absolute top-0 bottom-0 w-0.5 bg-white/30 pointer-events-none"
                                                style={{ left: `${x}%`, zIndex: VIDEO_Z_INDEX + 100 }}
                                            />
                                        ))}
                                        {alignmentGuides.horizontal.map((y, index) => (
                                            <div
                                                key={`h-${index}`}
                                                className="absolute left-0 right-0 h-0.5 bg-white/30 pointer-events-none"
                                                style={{ top: `${y}%`, zIndex: VIDEO_Z_INDEX + 100 }}
                                            />
                                        ))}
                                    </>
                                )}

                                {(isDraggingVideo && (mockupAlignmentGuides.vertical.length > 0 || mockupAlignmentGuides.horizontal.length > 0)) && (
                                    <>
                                        {mockupAlignmentGuides.vertical.map((x, index) => (
                                            <div
                                                key={`mockup-v-${index}`}
                                                className="absolute top-0 bottom-0 w-0.5 bg-white/30 pointer-events-none"
                                                style={{ left: `${x}%`, zIndex: VIDEO_Z_INDEX + 100 }}
                                            />
                                        ))}
                                        {mockupAlignmentGuides.horizontal.map((y, index) => (
                                            <div
                                                key={`mockup-h-${index}`}
                                                className="absolute left-0 right-0 h-0.5 bg-white/30 pointer-events-none"
                                                style={{ top: `${y}%`, zIndex: VIDEO_Z_INDEX + 100 }}
                                            />
                                        ))}
                                    </>
                                )}

                                {/* Capa 4: Camera overlay for preview — only in video mode */}
                                {mediaType !== "image" && cameraUrl && cameraConfig?.enabled && (
                                    <div data-camera-overlay className="absolute inset-0 pointer-events-none" style={{ zIndex: 4 }}>
                                        <div
                                            tabIndex={0}
                                            onClick={() => { if (onCameraClick) onCameraClick(); }}
                                            onPointerDown={(e) => {
                                                if (!onCameraConfigChange || !cameraConfig) return;
                                                if (e.button !== 0) return;
                                                const container = previewContainerRef.current;
                                                if (!container) return;
                                                const rect = container.getBoundingClientRect();
                                                e.currentTarget.setPointerCapture(e.pointerId);
                                                cameraDragRef.current = {
                                                    pointerId: e.pointerId,
                                                    startX: e.clientX,
                                                    startY: e.clientY,
                                                    initialX: cameraConfig.position.x,
                                                    initialY: cameraConfig.position.y,
                                                    rect,
                                                };
                                                setIsDraggingCamera(true);
                                            }}
                                            onPointerMove={(e) => {
                                                const drag = cameraDragRef.current;
                                                if (!drag || drag.pointerId !== e.pointerId || !onCameraConfigChange) return;
                                                const dx = (e.clientX - drag.startX) / drag.rect.width;
                                                const dy = (e.clientY - drag.startY) / drag.rect.height;
                                                const nextX = Math.min(1, Math.max(0, drag.initialX + dx));
                                                const nextY = Math.min(1, Math.max(0, drag.initialY + dy));
                                                onCameraConfigChange({ position: { x: nextX, y: nextY }, corner: "custom" });
                                            }}
                                            onPointerUp={(e) => {
                                                const drag = cameraDragRef.current;
                                                if (!drag || drag.pointerId !== e.pointerId) return;
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                                cameraDragRef.current = null;
                                                setIsDraggingCamera(false);
                                            }}
                                            onPointerCancel={(e) => {
                                                const drag = cameraDragRef.current;
                                                if (!drag || drag.pointerId !== e.pointerId) return;
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                                cameraDragRef.current = null;
                                                setIsDraggingCamera(false);
                                            }}
                                            className={`absolute pointer-events-auto select-none outline-none group ${onCameraConfigChange ? (isDraggingCamera ? "cursor-grabbing" : "cursor-grab") : ""}`}
                                            style={{
                                                width: `${cameraConfig.size * 100}cqmin`,
                                                aspectRatio: "1 / 1",
                                                left: `clamp(0px, calc(${cameraConfig.position.x * 100}% - ${cameraConfig.size * 50}cqmin), calc(100% - ${cameraConfig.size * 100}cqmin))`,
                                                top: `clamp(0px, calc(${cameraConfig.position.y * 100}% - ${cameraConfig.size * 50}cqmin), calc(100% - ${cameraConfig.size * 100}cqmin))`,
                                                transition: isDraggingCamera ? "none" : "left 120ms ease, top 120ms ease",
                                                touchAction: "none",
                                            }}
                                        >
                                            <video
                                                ref={cameraVideoRef}
                                                muted
                                                playsInline
                                                preload="auto"
                                                className={`size-full object-cover shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-shadow duration-200 ring-1 ring-white/15 group-hover:ring-1 group-hover:ring-white group-focus:ring-1 group-focus:ring-white ${cameraConfig.shape === "squircle" ? "squircle-element-camera" : ""}`}
                                                style={{
                                                    borderRadius:
                                                        cameraConfig.shape === "circle"
                                                            ? "50%"
                                                            : cameraConfig.shape === "squircle"
                                                                ? `${Math.round(20 * (0.5 + (cameraConfig.size * 100 - 20) / 40))}px`
                                                                : `${Math.round(6 * (0.5 + (cameraConfig.size * 100 - 20) / 40))}px`,
                                                    transform: cameraConfig.mirror ? "scaleX(-1)" : undefined,
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Text tool crosshair overlay — captures clicks to place text */}
                                {shouldShowBackgroundVideo && activeTool === "screenshot" && !(mediaType === "image" && apply3DToBackground) && onBackgroundVideoTransformChange && (
                                    <div
                                        data-background-video-transform
                                        className="absolute select-none border-2 border-cyan-400/90 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                                        style={{
                                            left: `${backgroundVideoTransform.x}%`,
                                            top: `${backgroundVideoTransform.y}%`,
                                            width: `${backgroundVideoTransform.width}%`,
                                            height: `${backgroundVideoTransform.height}%`,
                                            transform: "translate(-50%, -50%)",
                                            zIndex: 99990,
                                            cursor: backgroundVideoInteraction?.mode === "move" ? "grabbing" : "grab",
                                        }}
                                        onMouseDown={(event) => {
                                            if (event.button !== 0 || (event.target as HTMLElement).closest("[data-background-resize-handle]")) return;
                                            event.preventDefault();
                                            event.stopPropagation();
                                            backgroundVideoDragStartRef.current = {
                                                clientX: event.clientX,
                                                clientY: event.clientY,
                                                transform: { ...backgroundVideoTransform },
                                            };
                                            setBackgroundVideoInteraction({ mode: "move" });
                                        }}
                                        onDoubleClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            onBackgroundVideoTransformChange({ ...DEFAULT_BACKGROUND_VIDEO_TRANSFORM });
                                        }}
                                    >
                                        <div className="pointer-events-none absolute left-2 top-2 rounded bg-cyan-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-black shadow">
                                            Background video
                                        </div>
                                        {BACKGROUND_RESIZE_HANDLES.map((handle) => (
                                            <button
                                                key={handle.id}
                                                type="button"
                                                data-background-resize-handle={handle.id}
                                                aria-label={`Resize background video ${handle.id}`}
                                                className={`absolute size-3 rounded-sm border border-cyan-700 bg-white shadow ${handle.className}`}
                                                style={{ cursor: handle.cursor }}
                                                onMouseDown={(event) => {
                                                    if (event.button !== 0) return;
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    backgroundVideoDragStartRef.current = {
                                                        clientX: event.clientX,
                                                        clientY: event.clientY,
                                                        transform: { ...backgroundVideoTransform },
                                                    };
                                                    setBackgroundVideoInteraction({ mode: "resize", handle: handle.id });
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {textToolActive && (
                                    <div
                                        className="absolute inset-0 cursor-crosshair"
                                        style={{ zIndex: 99999 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!onAddElement) return;
                                            const rect = (e.currentTarget.parentElement as HTMLDivElement).getBoundingClientRect();
                                            const x = ((e.clientX - rect.left) / rect.width) * 100;
                                            const y = ((e.clientY - rect.top) / rect.height) * 100;
                                            const maxZ = canvasElements.length > 0
                                                ? Math.max(...canvasElements.map(el => el.zIndex))
                                                : 1000;
                                            const newId = `text-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                                            const newEl = {
                                                id: newId,
                                                type: "text" as const,
                                                x, y,
                                                width: 30,
                                                height: 5,
                                                rotation: 0,
                                                opacity: 1,
                                                zIndex: maxZ + 1,
                                                content: "",
                                                fontSize: 48,
                                                fontFamily: "Inter, sans-serif",
                                                fontWeight: "bold" as const,
                                                color: "#ffffff",
                                            };
                                            onAddElement(newEl);
                                            setEditingTextId(newId);
                                            if (onTextToolDeactivate) onTextToolDeactivate();
                                        }}
                                    />
                                )}

                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex-shrink-0 self-stretch flex items-stretch z-10">
                    <LayersPanel
                        elements={canvasElements}
                        selectedId={selectedElementId}
                        selectedMultiIds={canvasSelectedIds}
                        onSelect={handleLayersSelect}
                        onMultiSelect={handleLayersMultiSelect}
                        onDelete={handleLayersDelete}
                        onReorder={handleLayersReorder}
                        onSetGroupId={handleLayersSetGroupId}
                        onToggleVisible={handleLayersToggleVisible}
                        onToggleLock={handleLayersToggleLock}
                        onBringToFront={handleLayersBringToFront}
                        onSendToBack={handleLayersSendToBack}
                        onGroup={handleLayersGroup}
                        onUngroup={handleLayersUngroup}
                        toolbar={layersPanelToolbar}
                        videoLayerVisible={!!(videoUrl || imageUrl)}
                        isVideoLayerSelected={isVideoSelected}
                        onVideoLayerSelect={handleVideoLayerSelect}
                        mediaType={mediaType}
                        hoveredElementId={hoveredElementId}
                        onHoverElement={setHoveredElementId}
                    />
                </div>

            </div>
        </div>
    );
}
export const VideoCanvas = memo(VideoCanvasInner);
